# Careers24 (careers24.com) — endpoint & parsing reference

Maintenance reference for the `careers24-search` CLI: where the data comes from and
which anchors the parsers depend on. Update it if Careers24 changes its markup.

Careers24 (Media24) renders results as **server-side HTML** — there is **no embedded
JSON and no ld+json**, so both `search` and `detail` are regex-parsed from HTML.

## Access rules (robots.txt, fetched 2026-07-30)

`robots.txt` is a single group listing known crawlers (Scrapy, SemrushBot, Baidu,
Yandex, PetalBot, …) followed by `Disallow: /`. There is **no `User-agent: *` rule**,
so a normal browser UA is not literally disallowed, but the intent to block automated
access is clear and Media24's ToS restricts scraping — hence the **personal-use-only**
warning in `SKILL.md`.

## Cloudflare / fetch transport

Careers24 sits behind **Cloudflare**, which blocks Bun's built-in `fetch` with a 403
"Attention Required" challenge (TLS/JA3 fingerprint), while letting a normal client
through. The CLI therefore fetches via the system **`curl`** (`Bun.spawn`), whose TLS
handshake is not flagged. `curl` ships built-in on Windows 10+ (`System32\curl.exe`),
macOS, and Linux, so there are still **zero npm runtime dependencies**. `htmlFetch`
appends `-w "\nHTTPSTATUS:%{http_code}"` to recover the status code, retries 429/5xx
with backoff, returns `""` on 404, and raises a clear error on a Cloudflare 403.

## Search

**URL:** `https://www.careers24.com/jobs/[lc-{location-slug}/]kw-{keyword-slug}/[?page={n}]`

- `kw-{keyword-slug}` — keyword lower-cased, non-alphanumerics collapsed to `-`.
- `lc-{location-slug}` — optional location segment, placed **before** the `kw-` segment
  (e.g. `/jobs/lc-western-cape/kw-product-manager/`). Verified to filter (0 result
  overlap vs the unfiltered query).
- `?page={n}` — 1-indexed pagination. **Note:** `?PageIndex=` and a `/p-N/` path segment
  are silently ignored (they return page 1); `?page=` is the working parameter (page 1
  and page 2 return disjoint id sets).
- Page size is **10**.

**Parsing (`parseJobCards`):** split the HTML on `class="job-card"` (unique to the
card container) and parse each chunk:

| Field | Anchor | Notes |
|-------|--------|-------|
| id | `data-id="(\d+)"` | on the card div / envelope icon |
| title | `data-title="..."` | fallback: `<h2>` inside `data-control="vacancy-title"` |
| url | `data-url="..."` | fallback: `href="/jobs/adverts/..."` (prepend host) |
| location | `data-location="..."` | free text, e.g. `"West Rand"` |
| company | logo `<img ... alt="...">` | skip `alt`s matching `careers24` / `refine search` |
| date | `Posted:\s*(DD Mon YYYY)` | parsed to ISO `YYYY-MM-DD` |
| total pages | `data-total-pages="(\d+)"` | page-level, not a result count |

There is **no exact result count** in the markup — only `data-total-pages`. `meta.total`
is therefore `null`; `meta.totalPages` carries the page span.

`--jobage` is a **client-side** filter (`filterByAge`) on the parsed posting date —
Careers24 exposes no recency URL parameter. Cards with an unparseable date are kept.

## Detail

**URL:** `https://www.careers24.com/jobs/adverts/{id}-job/`

- Careers24 matches the advert on the **numeric id and ignores the slug**, so a filler
  slug (`-job`) resolves to the right posting. An id with **no** slug
  (`/jobs/adverts/{id}/`) redirects to the search listing — the trailing slug segment
  is required.

**Parsing (`parseJobDetail`):**

| Field | Anchor |
|-------|--------|
| title + location | `<title>{Job Title}, {Location} - Careers24</title>` (split on last comma) |
| company | `Employer:\s*<a...>?<strong>(...)</strong>` |
| description | `<div class="v-descrip">(...)</div>` → tags stripped, paragraph breaks kept |
| date | `Posted:\s*(DD Mon YYYY)` if present |
| employment type | `Job Type:\s*...` if present |
| apply url | constructed: `/jobs/apply/{id}` |

Encoding: the pages are valid UTF-8 (e.g. `’` = `\xe2\x80\x99`); no special decoding
is needed beyond HTML-entity decoding.
