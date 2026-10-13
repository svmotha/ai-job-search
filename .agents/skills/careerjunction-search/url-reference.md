# CareerJunction (careerjunction.co.za) — endpoint & parsing reference

Maintenance reference for the `careerjunction-search` CLI: where the data comes from
and which anchors the parsers depend on. Update it if CareerJunction changes its markup.

Search results are **server-rendered HTML** (Vue for interactivity, but the cards are
in the initial HTML). Detail pages additionally carry a schema.org `JobPosting`
`application/ld+json` block, which is the primary detail parse target.

## Access rules (robots.txt, fetched 2026-07-30)

```
User-agent: *
Allow: /
Disallow: /myprofile/applied-jobs
Disallow: /myprofile/EditProfile

User-agent: MJ12bot
Disallow: /
```

Permissive: only two logged-in profile paths are disallowed for general agents. The
job search and detail paths are allowed. Bun's `fetch` is **not** blocked (no
Cloudflare challenge), so the CLI uses plain `fetch`. Keep volume low regardless.

## Search

**URL:**
- Without location: `https://www.careerjunction.co.za/jobs/results?keywords={kw}[&page={n}]`
- With location: `https://www.careerjunction.co.za/jobs/{location-slug}?keywords={kw}[&page={n}]`

- The `location`/`LocationName` **query** parameters on `/jobs/results` are **ignored**.
  Location filtering only works via the SEO landing path `/jobs/{location-slug}` (e.g.
  `/jobs/cape-town`, `/jobs/western-cape`, `/jobs/gauteng`), which still accepts the
  `keywords` query. Verified: `/jobs/cape-town?keywords=product+manager` → 19 results,
  all Cape Town; `/jobs/western-cape?...` → 29.
- Pagination is `?page={n}` (1-indexed). Verified page 1 and page 2 return disjoint id
  sets. (A `/p-N/` path segment and `?PageIndex=` are **not** used here.)
- Page size is **25**. `PerPage=50`/`PerPage=100` are also offered by the site.

**Parsing (`parseJobCards`):** split the HTML on `class="module job-result` and parse
each chunk:

| Field | Anchor | Notes |
|-------|--------|-------|
| title/id/url | `class="job-result-title"` → `<h2><a jobId="(\d+)" href="/...-job-{id}.aspx">Title</a>` | use this anchor, NOT the "Show More" link (which also carries `jobId`) |
| company | the `<h3><a href="/companies/...">Name</a>` in the title block | |
| location | `<li class="location">...</li>` | e.g. `"Johannesburg North (Johannesburg North)"` |
| date | `<li class="updated-time">Posted DD Mon YYYY</li>` | parsed to ISO `YYYY-MM-DD` |
| salary | `<li class="salary">...</li>` | often `"R Undisclosed"` |
| total matches | hidden `<input name="TotalCount" value="(\d+)">` | exact result count |

`--jobage` is a **client-side** filter (`filterByAge`) on the parsed posting date.
Cards with an unparseable date are kept.

## Detail

**URL:** `https://www.careerjunction.co.za/x-job-{id}.aspx`

- The advert is matched on the **numeric id and ignores the slug**, so the filler slug
  `x` resolves to the right posting (`/{slug}-job-{id}.aspx` also works). A URL with
  **no** slug segment (`/job-{id}.aspx`) 404s — a leading slug segment is required.

**Parsing (`parseJobDetail`):** one `<script type="application/ld+json">` block is a
schema.org `JobPosting`. Quirks:

- The JSON contains **raw control characters** inside the `description` string (illegal
  in strict JSON). `htmlFetch` output is sanitized with `.replace(/[\x00-\x1f]+/g, " ")`
  before `JSON.parse`.
- `description` is **entity-encoded HTML** inside the JSON string (`&lt;p&gt;…`), so it
  is entity-decoded first, then tag-stripped with paragraph breaks preserved.
- `datePosted` / `validThrough` are `YYYY/MM/DD h:mm:ss AM` — normalized to ISO date.

| Field | Path |
|-------|------|
| title | `title` |
| description | `description` (decode entities → strip tags) |
| company | `hiringOrganization.name` |
| company url | `hiringOrganization.url` (double `//` collapsed) |
| location | `jobLocation.address.{addressLocality,addressRegion,addressCountry}` |
| salary | `baseSalary.value.minValue` (e.g. `"R Undisclosed"`) |
| industry | `industry` |
| employment type | `employmentType` (the literal `"Default"` is treated as none) |
| posted / expires | `datePosted` / `validThrough` |
