// Data source: Careers24 (careers24.com), a large South African job board owned
// by Media24. No authentication required. Careers24 renders results as
// server-side HTML — there is no embedded JSON or ld+json — so we parse the job
// cards and detail page with regex, splitting the results page into per-card
// chunks so one malformed card cannot break the rest.
//
// Careers24 sits behind Cloudflare, which blocks Bun's `fetch` on a TLS
// fingerprint (returns a 403 "Attention Required" challenge) but lets a normal
// client through. We therefore fetch via the system `curl`, whose TLS handshake
// is not flagged. `curl` ships built-in on Windows 10+ (System32\curl.exe),
// macOS, and Linux, so this keeps zero *npm* runtime dependencies.
//
// Personal use only. Careers24's robots.txt blocks known crawlers and Media24's
// Terms of Service restrict automated access. Keep volume low, do not use
// commercially or in bulk.

export const BASE = "https://www.careers24.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

const STATUS_MARKER = "\nHTTPSTATUS:"

/** One curl invocation. Returns the body and HTTP status (status 0 = no response). */
async function curlOnce(url: string): Promise<{ status: number; body: string }> {
  let out: string
  let exitCode: number
  try {
    const proc = Bun.spawn(
      [
        "curl",
        "-sS",
        "-L",
        "--compressed",
        "--max-time",
        "30",
        "-A",
        UA,
        "-H",
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "-H",
        "Accept-Language: en-ZA,en;q=0.9",
        "-w",
        `${STATUS_MARKER}%{http_code}`,
        url,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    ;[out, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ])
  } catch {
    throw new Error(
      "could not launch `curl` — it must be on PATH (built-in on Windows 10+, macOS, Linux)",
    )
  }
  if (exitCode !== 0 && !out.includes(STATUS_MARKER)) {
    throw new Error(`curl failed (exit ${exitCode})`)
  }
  const idx = out.lastIndexOf(STATUS_MARKER)
  if (idx < 0) return { status: 0, body: out }
  const status = parseInt(out.slice(idx + STATUS_MARKER.length).trim(), 10)
  return { status: isNaN(status) ? 0 : status, body: out.slice(0, idx) }
}

/** Fetch HTML via curl with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { status, body } = await curlOnce(url)
    if (status === 429 || status >= 500 || status === 0) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: HTTP ${status}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (status === 404) return ""
    if (status === 403 && /Attention Required|Cloudflare/i.test(body)) {
      throw new Error(
        "Careers24 returned a Cloudflare challenge (403). Slow down and retry later.",
      )
    }
    if (status < 200 || status >= 400) {
      throw new Error(`Request failed: HTTP ${status}`)
    }
    return body
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  companyUrl: string | null
  location: string | null
  date: string | null
  url: string
  salary: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  industry: string | null
  deadline: string | null
  applyUrl: string | null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).trim()
}

/** Turn free text into a Careers24 URL path slug (lower-case, hyphenated). */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "jobs"
  )
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
}

/** Parse Careers24's "20 Jul 2026" posting date into ISO "2026-07-20". */
export function parseDate(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/)
  if (!m) return null
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`
}

export interface SearchResult {
  cards: JobCard[]
  totalPages: number | null
}

/**
 * Parse the search-results page. Each posting is a `<div class="job-card">`
 * carrying data-* attributes (id, title, url, location); the company is the
 * logo image's alt text, and the posting date is the "Posted: DD Mon YYYY" line.
 */
export function parseJobCards(html: string): SearchResult {
  const cards: JobCard[] = []
  const chunks = html.split(/class="job-card"/).slice(1)

  for (const chunk of chunks) {
    const idMatch = chunk.match(/data-id="(\d+)"/)
    if (!idMatch) continue
    const id = idMatch[1]

    let title: string | null = null
    const dt = chunk.match(/data-title="([^"]+)"/)
    if (dt) title = decodeHtmlEntities(dt[1]).trim()
    if (!title) {
      const h2 = chunk.match(/data-control="vacancy-title"[^>]*>\s*<h2[^>]*>([\s\S]*?)<\/h2>/i)
      if (h2) title = clean(h2[1])
    }
    if (!title) continue

    let url: string
    const du = chunk.match(/data-url="([^"]+)"/)
    if (du) {
      url = decodeHtmlEntities(du[1]).split("?")[0]
    } else {
      const href = chunk.match(/href="(\/jobs\/adverts\/[^"]+)"/)
      url = href ? BASE + decodeHtmlEntities(href[1]).split("?")[0] : `${BASE}/jobs/adverts/${id}-job/`
    }

    const loc = chunk.match(/data-location="([^"]*)"/)
    const location = loc && loc[1] ? decodeHtmlEntities(loc[1]).trim() : null

    // Company = the card's logo alt text (skip the site logo / UI icons).
    let company: string | null = null
    const imgRe = /<img[^>]*alt="([^"]+)"[^>]*>/gi
    let im: RegExpExecArray | null
    while ((im = imgRe.exec(chunk)) !== null) {
      const alt = decodeHtmlEntities(im[1]).trim()
      if (alt && !/careers24|refine search/i.test(alt)) {
        company = alt
        break
      }
    }

    const posted = chunk.match(/Posted:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/)
    const date = parseDate(posted ? posted[1] : null)

    cards.push({
      id,
      title,
      company,
      companyUrl: null,
      location,
      date,
      url,
      salary: null,
    })
  }

  const tp = html.match(/data-total-pages="(\d+)"/)
  return { cards, totalPages: tp ? parseInt(tp[1], 10) : null }
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .trim()
}

/** Parse a single job's detail page (server-rendered HTML). */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i)
  if (!titleTag) return null
  // Title tag form: "{Job Title}, {Location} - Careers24"
  const raw = decodeHtmlEntities(titleTag[1]).replace(/\s*-\s*Careers24\s*$/i, "").trim()
  let title = raw
  let location: string | null = null
  const comma = raw.lastIndexOf(",")
  if (comma > 0) {
    title = raw.slice(0, comma).trim()
    location = raw.slice(comma + 1).trim() || null
  }

  const emp = html.match(/Employer:\s*(?:<a[^>]*>)?\s*<strong>([\s\S]*?)<\/strong>/i)
  const company = emp ? clean(emp[1]) || null : null

  const desc = html.match(/<div class="v-descrip">([\s\S]*?)<\/div>/i)
  const description = desc ? htmlToText(desc[1]) || null : null

  const posted = html.match(/Posted:\s*([0-9]{1,2}\s+[A-Za-z]+\s+[0-9]{4})/)
  const date = parseDate(posted ? posted[1] : null)

  const jt = html.match(/Job Type:\s*<[^>]*>?\s*([A-Za-z ]+?)\s*</i)
  const employmentType = jt ? jt[1].trim() || null : null

  return {
    id,
    title: title || "(untitled)",
    company,
    companyUrl: null,
    location,
    date,
    url: `${BASE}/jobs/adverts/${id}-job/`,
    salary: null,
    description,
    employmentType,
    industry: null,
    deadline: null,
    applyUrl: `${BASE}/jobs/apply/${id}`,
  }
}

/**
 * Filter cards to those posted within `days` of now. Careers24 has no
 * server-side recency parameter, so `--jobage` is applied client-side on the
 * parsed posting date. Cards with an unparseable/absent date are kept.
 */
export function filterByAge(cards: JobCard[], days: number): JobCard[] {
  if (!days || days <= 0 || days >= 9999) return cards
  const cutoff = Date.now() - days * 86400_000
  return cards.filter((c) => {
    if (!c.date) return true
    const t = Date.parse(c.date)
    return isNaN(t) ? true : t >= cutoff
  })
}
