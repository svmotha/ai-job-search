# careers24-cli

CLI for searching jobs on **Careers24** (`careers24.com`), a South African job board,
across any sector and any SA location.

**Data source**: Careers24's server-side HTML (job cards + advert pages; no JSON/ld+json).
**Authentication**: None required.
**Dependencies**: Zero npm packages. **Requires `curl` on PATH** (built-in on Windows 10+,
macOS, Linux) — Careers24 is behind Cloudflare, which blocks Bun's `fetch` on a TLS
fingerprint, so the CLI fetches through `curl`.

> **Personal use only.** Careers24's robots.txt blocks crawlers and Media24's Terms of
> Service restrict automated access. Keep volume low, don't use it commercially or for
> bulk data collection, and run it on your own responsibility.

## Installation

```bash
cd .agents/skills/careers24-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any npm install because it has zero runtime dependencies (it does
require the system `curl`).

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

# Senior Product Manager in the Western Cape, last 14 days
bun run src/cli.ts search -q "Senior Product Manager" -l "Western Cape" --jobage 14 --format table

# Head of Product in Gauteng
bun run src/cli.ts search -q "Head of Product" -l "Gauteng" --format table

# Full detail for one job
bun run src/cli.ts detail 2374763 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for the
endpoint/parsing documentation, the Cloudflare/curl note, and the Terms-of-Service note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Keywords (title / skill / role). |
| `--location` | `-l` | Province or city, e.g. `"Western Cape"`, `"Gauteng"`, `"Cape Town"`. |
| `--jobage` | | Keep postings from the last N days (client-side date filter). |
| `--page` | | 1-indexed page (10 results/page). |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
