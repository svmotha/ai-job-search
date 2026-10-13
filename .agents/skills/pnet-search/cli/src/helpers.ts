// Data source: PNet (pnet.co.za) — South Africa's largest job board, a StepStone
// property. No authentication required. The public search results page embeds the
// full result list as JSON in `window.__PRELOADED_STATE__["app-unifiedResultlist"]`,
// and each detail page carries a schema.org JobPosting `application/ld+json` block.
// We parse those JSON payloads directly (far more robust than scraping the rendered
// HTML cards, whose class names are hashed/emotion-generated and change often).
//
// Personal use only. PNet is bot-protected (Akamai) and StepStone's Terms of Service
// restrict automated access. Keep volume low, do not use commercially or in bulk.

export const BASE = "https://www.pnet.co.za"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404.
 * Throws BOT_CHALLENGE if PNet serves the Akamai `bm-verify` interstitial
 * (a tiny meta-refresh stub) instead of a real page.
 */
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
    const body = await response.text()
    if (body.length < 5000 && body.includes("bm-verify")) {
      throw new Error(
        "PNet returned a bot-verification challenge (Akamai bm-verify). " +
          "Slow down and retry later, or reduce request volume.",
      )
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

/** Turn a free-text keyword/location into a PNet URL path slug. */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "jobs"
  )
}

/**
 * Extract the first JSON object literal that follows `marker` in `html`,
 * by brace-matching while respecting string/escape context. Returns null
 * if the marker or a balanced object is not found.
 */
function extractJsonObjectAfter(html: string, marker: RegExp): unknown | null {
  const m = html.match(marker)
  if (!m || m.index === undefined) return null
  let i = html.indexOf("{", m.index + m[0].length - 1)
  if (i < 0) return null
  const start = i
  let depth = 0
  let inStr = false
  let esc = false
  for (; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === '"') inStr = false
    } else {
      if (c === '"') inStr = true
      else if (c === "{") depth++
      else if (c === "}") {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1))
          } catch {
            return null
          }
        }
      }
    }
  }
  return null
}

interface RawItem {
  id?: number | string
  title?: string
  url?: string
  companyName?: string
  companyUrl?: string
  location?: string
  datePosted?: string
  salary?: string
}

export interface SearchResult {
  cards: JobCard[]
  total: number | null
  page: number | null
}

/**
 * Parse the search-results page. The payload lives in
 * `window.__PRELOADED_STATE__["app-unifiedResultlist"]` as a JSON object with a
 * `searchResults.items` array. We parse it directly; the visible HTML cards use
 * hashed class names and are not a stable parse target.
 */
export function parseSearchResults(html: string): SearchResult {
  const state = extractJsonObjectAfter(
    html,
    /window\.__PRELOADED_STATE__\["app-unified[^"]*"\]\s*=\s*/,
  ) as Record<string, any> | null

  const sr = state?.searchResults
  const items: RawItem[] = Array.isArray(sr?.items) ? sr.items : []
  const cards: JobCard[] = []

  for (const it of items) {
    const id = it.id != null ? String(it.id) : null
    if (!id || !it.title) continue
    cards.push({
      id,
      title: decodeHtmlEntities(String(it.title)).trim(),
      company: it.companyName ? decodeHtmlEntities(it.companyName).trim() : null,
      companyUrl: it.companyUrl ? it.companyUrl.split("?")[0] : null,
      location: it.location ? decodeHtmlEntities(it.location).trim() : null,
      date: it.datePosted || null,
      url: `${BASE}/job/${id}`,
      salary: it.salary ? decodeHtmlEntities(it.salary).trim() : null,
    })
  }

  const total =
    typeof sr?.meta?.total === "number"
      ? sr.meta.total
      : typeof sr?.pagination?.totalCount === "number"
        ? sr.pagination.totalCount
        : null
  const page =
    typeof sr?.pagination?.page === "number" ? sr.pagination.page : null

  return { cards, total, page }
}

/** Extract every application/ld+json block as parsed JSON (best-effort). */
function extractLdJson(html: string): any[] {
  const out: any[] = []
  const re =
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()))
    } catch {
      /* skip malformed block */
    }
  }
  return out
}

/** Find the JobPosting node among ld+json blocks (handles @graph wrappers). */
function findJobPosting(blocks: any[]): any | null {
  for (const b of blocks) {
    if (!b) continue
    if (b["@type"] === "JobPosting") return b
    const graph = Array.isArray(b["@graph"]) ? b["@graph"] : null
    if (graph) {
      const jp = graph.find((n: any) => n && n["@type"] === "JobPosting")
      if (jp) return jp
    }
  }
  return null
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

function placeToString(loc: any): string | null {
  const locs = Array.isArray(loc) ? loc : loc ? [loc] : []
  const parts: string[] = []
  for (const l of locs) {
    const a = l?.address
    const bit = [a?.addressLocality, a?.addressRegion, a?.addressCountry]
      .filter(Boolean)
      .join(", ")
    if (bit) parts.push(bit)
  }
  return parts.length ? parts.join(" | ") : null
}

/** Parse a single job's detail page from its JobPosting ld+json. */
export function parseJobDetail(html: string, id: string): JobDetail | null {
  const jp = findJobPosting(extractLdJson(html))
  if (!jp) return null

  const org = jp.hiringOrganization
  const employmentType = Array.isArray(jp.employmentType)
    ? jp.employmentType.join(", ")
    : jp.employmentType || null

  return {
    id,
    title: jp.title ? decodeHtmlEntities(String(jp.title)).trim() : "(untitled)",
    company: org?.name ? decodeHtmlEntities(org.name).trim() : null,
    companyUrl: org?.url ? String(org.url).split("?")[0] : null,
    location: placeToString(jp.jobLocation),
    date: jp.datePosted || null,
    url: `${BASE}/job/${id}`,
    salary: null,
    description: jp.description ? htmlToText(String(jp.description)) : null,
    employmentType,
    industry: jp.industry ? decodeHtmlEntities(String(jp.industry)).trim() : null,
    deadline: jp.validThrough || null,
    applyUrl: jp.url ? String(jp.url).split("?")[0] : `${BASE}/job/${id}`,
  }
}

/**
 * Map a requested posting age (days) to PNet's `ag=age_N` bucket.
 * PNet buckets posting age to 1 / 3 / 7 / 14 / 30 days; we round up to the
 * smallest bucket that covers the request. Returns null for "all postings".
 */
export function ageBucket(days: number): string | null {
  if (!days || days <= 0 || days >= 9999) return null
  const buckets = [1, 3, 7, 14, 30]
  const pick = buckets.find((b) => days <= b) ?? 30
  return `age_${pick}`
}
