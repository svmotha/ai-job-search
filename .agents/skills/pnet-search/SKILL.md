---
name: pnet-search
version: 1.0.0
description: >
  Search live job listings on PNet (pnet.co.za), South Africa's largest job
  board, for roles anywhere in South Africa (Cape Town, Johannesburg, Pretoria,
  Durban, Gauteng, Western Cape, remote, etc.). Use whenever the user wants to
  find South African jobs, vacancies, or open positions, or to look up a specific
  PNet posting. Covers all sectors (product, software, data, finance, marketing,
  operations, engineering, admin). Trigger phrases: PNet, pnet.co.za, South
  African jobs, jobs in South Africa, jobs in Cape Town/Johannesburg/Pretoria/
  Durban, SA vacancies, find a job in South Africa, look up this PNet job.
context: fork
allowed-tools: Bash(bun run skills/pnet-search/cli/src/cli.ts *)
---

# PNet Search Skill

Search live job listings from **PNet** (`pnet.co.za`), South Africa's largest job
board (a StepStone property), for any role and any South African location. No
authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`.

The skill reads the JSON that PNet embeds in its own public results page
(`window.__PRELOADED_STATE__`) and the schema.org `JobPosting` data on each detail
page, so results are structured and stable rather than scraped from styling.

## ⚠️ Personal use only

PNet is bot-protected (Akamai) and StepStone's Terms of Service restrict automated
access. Its `robots.txt` allows a single-keyword search (`/jobs/*?q=*`) but
disallows multi-parameter search URLs — this skill adds pagination and posting-age
filters that go beyond that. **Keep volume low, don't use it commercially or for
bulk data collection, and run it on your own responsibility.** A handful of
requests, not a crawl.

## When to use this skill

- Search South African job openings by keyword, optionally narrowed to a city/region
- Filter by recency (posted within N days)
- Get the full description of a specific PNet posting

## Commands

### Search job listings

```bash
bun run skills/pnet-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Keywords (job title, skill, or role).
- `--location <text>` / `-l <text>` — city or region, e.g. `"Cape Town"`, `"Johannesburg"`, `"Gauteng"`, `"Western Cape"`. Folded into PNet's URL path.
- `--jobage <days>` — posted within N days. PNet buckets posting age to `1`, `3`, `7`, `14`, or `30` days (the request rounds up to the nearest bucket). Omit for all postings.
- `--page <n>` — page number (1-indexed, **25 results per page**).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run skills/pnet-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job ID from `search` results (e.g. `4089046`). You may also pass
a full PNet job URL. Returns the full description, employment type, industry, posting
date, application deadline (`validThrough`), and apply link.

## Usage examples

```bash
# Product Manager roles anywhere in South Africa
bun run skills/pnet-search/cli/src/cli.ts search -q "Product Manager" --format table

# Senior Product Manager in Cape Town, posted in the last week
bun run skills/pnet-search/cli/src/cli.ts search -q "Senior Product Manager" -l "Cape Town" --jobage 7 --format table

# Head of Product in Johannesburg
bun run skills/pnet-search/cli/src/cli.ts search -q "Head of Product" -l "Johannesburg" --format table

# Product Lead roles in Gauteng, second page
bun run skills/pnet-search/cli/src/cli.ts search -q "Product Lead" -l "Gauteng" --page 2 --format table

# Full details for a specific job
bun run skills/pnet-search/cli/src/cli.ts detail 4089046 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

JSON search output is `{ "meta": { "count", "page", "total" }, "results": [...] }`,
where each result has `id`, `title`, `company`, `location`, `date`, `url`, `salary`
(missing values are `null`). All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- **Data source:** PNet's public results page embeds the result list as JSON in
  `window.__PRELOADED_STATE__["app-unifiedResultlist"]` → `searchResults.items`; detail
  pages carry a schema.org `JobPosting` `application/ld+json` block. See
  `url-reference.md` for the exact endpoints and parsing anchors.
- **Location** is expressed in PNet's URL *path* (`/jobs/<keyword>/in-<city>?q=...`),
  not a query parameter, matching PNet's own URL form.
- **Posting age** is coarse — PNet only exposes 1/3/7/14/30-day buckets, so
  `--jobage 2` behaves like `--jobage 3`.
- **Page size is 25.** `meta.total` reports the full match count across all pages.
- PNet may rate-limit or serve an Akamai `bm-verify` challenge if volume is high;
  the CLI detects the challenge and exits with a clear error. Back off and retry
  later (see the personal-use note above).
- Job IDs are numeric (e.g. `4089046`) — pass them as-is to `detail`.
