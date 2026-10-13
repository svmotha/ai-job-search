---
name: careers24-search
version: 1.0.0
description: >
  Search live job listings on Careers24 (careers24.com), a large South African
  job board, for roles anywhere in South Africa (Cape Town, Johannesburg,
  Pretoria, Durban, Gauteng, Western Cape, KwaZulu-Natal, etc.). Use whenever the
  user wants to find South African jobs, vacancies, or open positions on
  Careers24, or to look up a specific Careers24 posting. Covers all sectors
  (product, software, data, finance, marketing, sales, operations, admin).
  Trigger phrases: Careers24, careers24.com, South African jobs, jobs in South
  Africa, jobs in Cape Town/Johannesburg/Pretoria/Durban, SA vacancies, find a
  job in South Africa, look up this Careers24 job.
context: fork
allowed-tools: Bash(bun run skills/careers24-search/cli/src/cli.ts *)
---

# Careers24 Search Skill

Search live job listings from **Careers24** (`careers24.com`), a large South African
job board (owned by Media24), for any role and any South African location. No
authentication and **zero npm dependencies**.

> **Requires `curl` on PATH.** Careers24 is behind Cloudflare, which blocks Bun's
> built-in `fetch` on a TLS fingerprint. The CLI fetches through the system `curl`
> instead (built-in on Windows 10+, macOS, and Linux), so there is still nothing to
> `npm install`.

## ⚠️ Personal use only

Careers24's `robots.txt` blocks known crawlers and Media24's Terms of Service
restrict automated access. **Keep volume low, don't use it commercially or for bulk
data collection, and run it on your own responsibility.** A handful of requests, not
a crawl.

## When to use this skill

- Search South African job openings by keyword, optionally narrowed to a province/city
- Filter to recent postings (client-side, by posting date)
- Get the full description of a specific Careers24 posting

## Commands

### Search job listings

```bash
bun run skills/careers24-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (job title, skill, or role).
- `--location <text>` / `-l <text>` — province or city, e.g. `"Western Cape"`, `"Gauteng"`, `"Cape Town"`, `"KwaZulu-Natal"`. Folded into Careers24's URL path as `lc-<location>`.
- `--jobage <days>` — keep postings from the last N days. **Client-side filter** (Careers24 has no server-side recency parameter) on each card's posting date; cards with no parseable date are kept. Omit for all postings.
- `--page <n>` — page number (1-indexed, **10 results per page**).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/careers24-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `2374763`). You may also pass a
full Careers24 advert URL. Returns the full description, company, location, posting
date, and apply link.

## Usage examples

```bash
# Product Manager roles anywhere in South Africa
bun run skills/careers24-search/cli/src/cli.ts search -q "Product Manager" --format table

# Senior Product Manager in the Western Cape, last 14 days
bun run skills/careers24-search/cli/src/cli.ts search -q "Senior Product Manager" -l "Western Cape" --jobage 14 --format table

# Head of Product in Gauteng
bun run skills/careers24-search/cli/src/cli.ts search -q "Head of Product" -l "Gauteng" --format table

# Product Lead roles, second page
bun run skills/careers24-search/cli/src/cli.ts search -q "Product Lead" --page 2 --format table

# Full details for a specific job
bun run skills/careers24-search/cli/src/cli.ts detail 2374763 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { "count", "page", "total", "totalPages" }, "results": [...] }`,
where each result has `id`, `title`, `company`, `location`, `date`, `url` (missing
values are `null`; `total` is `null` because Careers24 does not expose an exact match
count, but `totalPages` is available). All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Data source:** Careers24 renders results as server-side HTML (no embedded JSON or
  ld+json). Cards carry `data-id`/`data-title`/`data-url`/`data-location`; the company
  is the card's logo `alt` text and the date is the "Posted: DD Mon YYYY" line. Detail
  pages expose the description in `<div class="v-descrip">`. See `url-reference.md`.
- **Location** is expressed in the URL path as `lc-<location>` **before** `kw-<keyword>`.
- **Posting age** is filtered **client-side** — Careers24 offers no recency URL
  parameter — so `--jobage` only prunes the current page's results.
- **Page size is 10.** `meta.totalPages` reports how many pages the query spans.
- **Cloudflare / curl:** if `curl` is missing or Cloudflare challenges the client, the
  CLI exits with a clear error. Back off and retry later (see the personal-use note).
- Job IDs are numeric (e.g. `2374763`) — pass them as-is to `detail`.
