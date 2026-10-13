---
name: careerjunction-search
version: 1.0.0
description: >
  Search live job listings on CareerJunction (careerjunction.co.za), an
  established South African job board, for roles anywhere in South Africa (Cape
  Town, Johannesburg, Pretoria, Durban, Gauteng, Western Cape, KwaZulu-Natal,
  etc.). Use whenever the user wants to find South African jobs, vacancies, or
  open positions on CareerJunction, or to look up a specific CareerJunction
  posting. Covers all sectors (product, software, data, finance, marketing,
  sales, operations, admin). Trigger phrases: CareerJunction, careerjunction.co.za,
  South African jobs, jobs in South Africa, jobs in Cape Town/Johannesburg/
  Pretoria/Durban, SA vacancies, find a job in South Africa, look up this
  CareerJunction job.
context: fork
allowed-tools: Bash(bun run skills/careerjunction-search/cli/src/cli.ts *)
---

# CareerJunction Search Skill

Search live job listings from **CareerJunction** (`careerjunction.co.za`), an
established South African job board, for any role and any South African location.
No authentication, no API key, and **zero runtime dependencies** — it runs with
just `bun`.

The skill parses CareerJunction's server-rendered result cards for `search`, and the
schema.org `JobPosting` data embedded in each detail page for `detail`.

## Access & fair use

CareerJunction's `robots.txt` is permissive (`User-agent: * / Allow: /`, disallowing
only a couple of logged-in profile paths), so this is the least-restricted of the SA
portal skills. Even so, **use it for personal job-hunting and keep volume low** — a
handful of requests, not a crawl.

## When to use this skill

- Search South African job openings by keyword, optionally narrowed to a city/province
- Filter to recent postings (client-side, by posting date)
- Get the full description of a specific CareerJunction posting

## Commands

### Search job listings

```bash
bun run skills/careerjunction-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (job title, skill, or role).
- `--location <text>` / `-l <text>` — city or province, e.g. `"Cape Town"`, `"Gauteng"`, `"Western Cape"`, `"Durban"`. Uses CareerJunction's location landing page to filter.
- `--jobage <days>` — keep postings from the last N days. **Client-side filter** on each card's posting date (CareerJunction has no reliable server-side recency parameter); cards with no parseable date are kept. Omit for all postings.
- `--page <n>` — page number (1-indexed, **25 results per page**).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/careerjunction-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `2642319`). You may also pass a
full CareerJunction `.aspx` advert URL. Returns the full description, company, location,
salary, industry, posting date, and expiry date.

## Usage examples

```bash
# Product Manager roles anywhere in South Africa
bun run skills/careerjunction-search/cli/src/cli.ts search -q "Product Manager" --format table

# Senior Product Manager in Cape Town, last 14 days
bun run skills/careerjunction-search/cli/src/cli.ts search -q "Senior Product Manager" -l "Cape Town" --jobage 14 --format table

# Head of Product in Gauteng
bun run skills/careerjunction-search/cli/src/cli.ts search -q "Head of Product" -l "Gauteng" --format table

# Product Lead roles, second page
bun run skills/careerjunction-search/cli/src/cli.ts search -q "Product Lead" --page 2 --format table

# Full details for a specific job
bun run skills/careerjunction-search/cli/src/cli.ts detail 2642319 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { "count", "page", "total" }, "results": [...] }`,
where each result has `id`, `title`, `company`, `companyUrl`, `location`, `date`, `url`,
`salary` (missing values are `null`; `total` is CareerJunction's exact match count).
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the
process exits with code `1`.

## Notes

- **Data source:** search results are server-side HTML cards (`data-* jobId`, title
  anchor, `job-overview` list); detail pages carry a schema.org `JobPosting`
  `application/ld+json` block. See `url-reference.md` for the exact anchors.
- **Location** uses CareerJunction's SEO location landing page (`/jobs/<location>?keywords=...`).
  The `LocationName`/`location` query parameters on the generic results endpoint are
  ignored by the site.
- **Posting age** is filtered **client-side** — CareerJunction offers no simple recency
  URL parameter — so `--jobage` only prunes the current page's results.
- **Page size is 25.** `meta.total` reports the full match count across all pages.
- Job IDs are numeric (e.g. `2642319`) — pass them as-is to `detail`.
