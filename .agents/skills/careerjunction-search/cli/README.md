# careerjunction-cli

CLI for searching jobs on **CareerJunction** (`careerjunction.co.za`), an established
South African job board, across any sector and any SA location.

**Data source**: CareerJunction's server-side HTML result cards + per-job schema.org
`JobPosting` ld+json on detail pages.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> CareerJunction's robots.txt is permissive, but please keep volume low and use this
> for personal job-hunting rather than bulk data collection.

## Installation

```bash
cd .agents/skills/careerjunction-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings (`--query` required) |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Product roles anywhere in South Africa
bun run src/cli.ts search -q "Product Manager" --format table

# Senior Product Manager in Cape Town, last 14 days
bun run src/cli.ts search -q "Senior Product Manager" -l "Cape Town" --jobage 14 --format table

# Head of Product in Gauteng
bun run src/cli.ts search -q "Head of Product" -l "Gauteng" --format table

# Full detail for one job
bun run src/cli.ts detail 2642319 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
endpoint/parsing documentation.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / role). |
| `--location` | `-l` | City or province, e.g. `"Cape Town"`, `"Gauteng"`, `"Western Cape"`. |
| `--jobage` | | Keep postings from the last N days (client-side date filter). |
| `--page` | | 1-indexed page (25 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
