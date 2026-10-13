# PNet (pnet.co.za) — endpoint & parsing reference

This is the maintenance reference for the `pnet-search` CLI: where the data comes
from and which anchors the parsers depend on. Update it if PNet changes its markup.

PNet is a **StepStone** property. It renders search results server-side and also
embeds the full result set as JSON in the page. We parse the JSON, not the visible
HTML cards (whose class names are emotion-hashed, e.g. `res-c0zne4`, and unstable).

## Access rules (robots.txt, fetched 2026-07-30)

```
User-agent: *
Disallow: /jobs/full-time/*
Disallow: /jobs/part-time/*
Disallow: /jobs/work-from-home/*
Disallow: /jobs/*?*
Allow:    /jobs/*?q=*          # single-keyword search IS allowed
Disallow: /jobs/*?q*&*         # a q param followed by any &param is disallowed
Disallow: /5/index.cfm?*event=
Allow:    /5/index.cfm?event=offerView.dsp*
```

- A single-keyword search `/jobs/<slug>?q=<kw>` is **allowed**.
- Adding a second query param (`&page`, `&ag`, `&where`) matches the more-specific
  `Disallow: /jobs/*?q*&*`. This skill's `--page`/`--jobage` flags therefore go
  beyond robots — hence the **personal-use-only** warning in `SKILL.md`.
- `/job/<id>` (singular, no query) is not disallowed and is used for detail.
- The slug-less form `/jobs?q=...` triggers an Akamai `bm-verify` interstitial —
  **the path slug is mandatory.**

## Search

**URL:** `https://www.pnet.co.za/jobs/{keyword-slug}[/in-{location-slug}]?q={keywords}[&page={n}][&ag=age_{bucket}]`

- `{keyword-slug}` = the keyword lower-cased, non-alphanumerics collapsed to `-`
  (`"Senior Product Manager"` → `senior-product-manager`). The slug is required for
  SEO routing; the actual query is driven by the `q` param.
- `q` must be the **first** query parameter (robots `Allow: /jobs/*?q=*`).
- Location goes in the **path** as `/in-{location-slug}` (PNet's own URL form);
  `?where={loc}` also works but the path form is cleaner.
- `page` — 1-indexed. Page size is **25**.
- `ag=age_{N}` — posting-age bucket, `N` ∈ {1, 3, 7, 14, 30}.

**Parsing:** the results page contains
`window.__PRELOADED_STATE__["app-unifiedResultlist"] = { ... }`. Brace-match that
object and read:

| Field | Path | Notes |
|-------|------|-------|
| results | `searchResults.items[]` | array, 25 per page |
| id | `items[].id` | numeric |
| title | `items[].title` | |
| listing url | `items[].url` | SEO path; we expose `/job/{id}` instead |
| company | `items[].companyName` | |
| company url | `items[].companyUrl` | |
| location | `items[].location` | free text, e.g. `"Centurion"` |
| date posted | `items[].datePosted` | ISO 8601 |
| salary | `items[].salary` | often `""` |
| total matches | `searchResults.meta.total` | full count across pages |
| current page | `searchResults.pagination.page` | |
| page count | `searchResults.pagination.pageCount` | |

Note: there are several `window.__PRELOADED_STATE__.<key> = {...}` assignments on
the page (header, modal, searchBar, footer…). The result list is the one keyed
`["app-unifiedResultlist"]` (match `app-unified*` and require `= {`).

## Detail

**URL:** `https://www.pnet.co.za/job/{id}` (HTTP 200, clean id-based route).

The SEO inline URL (`/jobs--Title-City-Company--{id}-inline.html`) also exists but
is longer and less reliable to reconstruct from an id, so we use `/job/{id}`.

**Parsing:** one `<script type="application/ld+json">` block on the page is a
schema.org `JobPosting`. Fields used:

| Field | Path |
|-------|------|
| title | `title` |
| description (HTML) | `description` |
| employment type | `employmentType` (e.g. `FULL_TIME`) |
| industry | `industry` |
| date posted | `datePosted` |
| deadline | `validThrough` |
| company | `hiringOrganization.name` |
| company url | `hiringOrganization.url` |
| location | `jobLocation.address.{addressLocality,addressRegion,addressCountry}` |
| apply / canonical url | `url` |

`findJobPosting()` also handles a `@graph`-wrapped node in case PNet nests the
JobPosting alongside a BreadcrumbList.

## Fetching quirks

- Browser `User-Agent` required; requests without it are more likely to be challenged.
- Akamai serves a ~2.7 KB `bm-verify` meta-refresh stub instead of the page when it
  flags the client. `htmlFetch` detects `bm-verify` in a tiny body and throws.
- Exponential backoff with jitter on 429/5xx; `""` returned on 404.
