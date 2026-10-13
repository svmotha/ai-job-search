# pnet-cli

CLI for searching jobs on **PNet** (`pnet.co.za`), South Africa's largest job board,
across any sector and any SA location.

**Data source**: PNet's public results page (`window.__PRELOADED_STATE__` JSON) and
per-job schema.org `JobPosting` ld+json.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

> **Personal use only.** PNet is bot-protected and StepStone's Terms of Service
> restrict automated access. Keep volume low, don't use it commercially or for bulk
> data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/pnet-search/cli
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

# Senior Product Manager in Cape Town, last 7 days
bun run src/cli.ts search -q "Senior Product Manager" -l "Cape Town" --jobage 7 --format table

# Head of Product in Johannesburg
bun run src/cli.ts search -q "Head of Product" -l "Johannesburg" --format table

# Full detail for one job
bun run src/cli.ts detail 4089046 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
endpoint/parsing documentation and the Terms-of-Service note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / role). |
| `--location` | `-l` | City / region, e.g. `"Cape Town"`, `"Johannesburg"`, `"Gauteng"`. |
| `--jobage` | | Posted within N days (PNet buckets to 1/3/7/14/30). |
| `--page` | | 1-indexed page (25 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
