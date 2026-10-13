// Data source: CareerJunction (careerjunction.co.za), an established South
// African job board. No authentication required. The search results page is
// server-rendered HTML (job cards); each detail page carries a schema.org
// JobPosting `application/ld+json` block. We parse the cards with chunked regex
// and the detail from the ld+json (with a small HTML fallback).
//
// robots.txt is permissive (`User-agent: * / Allow: /`, only a couple of
// profile paths disallowed), and Bun's fetch is not blocked, so this uses plain
// `fetch` with zero runtime dependencies. Still: keep volume low and use it for
// personal job-hunting, not bulk collection.

export const BASE = "https://www.careerjunction.co.za"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-ZA,en;q=0.9",
      },
      redirect: "follow",
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(
          `Request failed: ${response.status} ${response.statusText}`,
        )
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText}`,
      )
    }
    return response.text()
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

/** Turn free text into a CareerJunction location URL slug. */
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

/** Parse "Posted 23 Jul 2026" (search cards) into ISO "2026-07-23". */
export function parseCardDate(raw: string | null): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/)
  if (!m) return null
  const mm = MONTHS[m[2].slice(0, 3).toLowerCase()]
  if (!mm) return null
  return `${m[3]}-${mm}-${m[1].padStart(2, "0")}`
}

/** Parse "2026/07/23 7:00:25 AM" (ld+json) into ISO date "2026-07-23". */
function parseSlashDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
}

export interface SearchResult {
  cards: JobCard[]
  total: number | null
}

/**
 * Parse the search-results page. Each posting is a `<div class="module
 * job-result">`; the title/id/url live in the `job-result-title` block and the
 * location/date/salary in the `job-overview` list.
 */
export function parseJobCards(html: string): SearchResult {
  const cards: JobCard[] = []
  const chunks = html.split(/class="module job-result/).slice(1)

  for (const chunk of chunks) {
    // Title anchor inside job-result-title (NOT the "Show More" link).
    const titleBlock = chunk.match(
      /class="job-result-title"[\s\S]*?<h2>([\s\S]*?)<\/h2>([\s\S]*?)(?:<\/div>)/i,
    )
    const h2 = titleBlock ? titleBlock[1] : chunk
    const anchor = h2.match(
      /<a\s+jobId="(\d+)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (!anchor) continue
    const id = anchor[1]
    const url = BASE + decodeHtmlEntities(anchor[2]).split("?")[0]
    const title = clean(anchor[3])
    if (!title) continue

    // Company: the <h3> anchor in the title block.
    let company: string | null = null
    let companyUrl: string | null = null
    const h3 = (titleBlock ? titleBlock[2] : chunk).match(
      /<h3>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i,
    )
    if (h3) {
      companyUrl = h3[1] ? BASE + decodeHtmlEntities(h3[1]) : null
      company = clean(h3[2]) || null
    }

    const loc = chunk.match(/<li class="location">([\s\S]*?)<\/li>/i)
    const location = loc ? clean(loc[1]) || null : null

    const posted = chunk.match(/<li class="updated-time">([\s\S]*?)<\/li>/i)
    const date = parseCardDate(posted ? clean(posted[1]) : null)

    const sal = chunk.match(/<li class="salary">([\s\S]*?)<\/li>/i)
    const salary = sal ? clean(sal[1]) || null : null

    cards.push({ id, title, company, companyUrl, location, date, url, salary })
  }

  const tc =
    html.match(/name="TotalCount"[^>]*value="(\d+)"/) ||
    html.match(/value="(\d+)"[^>]*name="TotalCount"/)
  return { cards, total: tc ? parseInt(tc[1], 10) : null }
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

/** Parse a single job's detail page from its JobPosting ld+json. */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const block = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
  )
  if (!block) return null

  let jp: any
  try {
    // The description string contains raw control characters (illegal in JSON);
    // collapse them before parsing. Structure uses no significant newlines.
    jp = JSON.parse(block[1].replace(/[\x00-\x1f]+/g, " "))
  } catch {
    return null
  }
  if (Array.isArray(jp)) jp = jp.find((n) => n && n["@type"] === "JobPosting")
  if (!jp || jp["@type"] !== "JobPosting") return null

  const org = jp.hiringOrganization
  const addr = jp.jobLocation?.address
  const location = addr
    ? [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .filter(Boolean)
        .join(", ") || null
    : null

  // description is entity-encoded HTML inside the JSON string.
  const description = jp.description
    ? htmlToText(decodeHtmlEntities(String(jp.description))) || null
    : null

  const empRaw =
    typeof jp.employmentType === "string" ? jp.employmentType : null
  const employmentType =
    empRaw && empRaw.toLowerCase() !== "default" ? empRaw : null

  const salary = jp.baseSalary?.value?.minValue
    ? String(jp.baseSalary.value.minValue).trim() || null
    : null

  return {
    id,
    title: jp.title ? decodeHtmlEntities(String(jp.title)).trim() : "(untitled)",
    company: org?.name ? decodeHtmlEntities(org.name).trim() : null,
    companyUrl: org?.url ? String(org.url).replace(/([^:])\/\//g, "$1/") : null,
    location,
    date: parseSlashDate(jp.datePosted),
    url: `${BASE}/x-job-${id}.aspx`,
    salary,
    description,
    employmentType,
    industry: jp.industry ? decodeHtmlEntities(String(jp.industry)).trim() : null,
    deadline: parseSlashDate(jp.validThrough),
    applyUrl: `${BASE}/x-job-${id}.aspx`,
  }
}

/**
 * Filter cards to those posted within `days` of now. CareerJunction has no
 * reliable server-side recency parameter, so `--jobage` is applied client-side
 * on the parsed posting date. Cards with an unparseable date are kept.
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
