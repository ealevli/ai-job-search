# kariyer.net — endpoint reference

Investigated live on 2026-10-18 against the honest User-Agent
`Mozilla/5.0 (compatible; kariyer-net-search-cli/1.0)`. No documented JSON API: both
search and detail are server-rendered HTML with no embedded JSON state
(`__NEXT_DATA__`, `__NUXT__`, `__INITIAL_STATE__` all absent). Parsed with regex on
the stable `data-test="..."` attributes the markup carries.

## robots.txt

`https://www.kariyer.net/robots.txt` does **not** disallow `/is-ilanlari/` (search) or
`/is-ilani/` (detail). Disallowed paths are account/profile pages, uploads, and a few
admin-ish routes — none relevant to this CLI.

## Search

**Pattern:** `GET https://www.kariyer.net/is-ilanlari/<slug>` (page 1) or
`GET https://www.kariyer.net/is-ilanlari/<slug>-<page>` (page N > 1).

kariyer.net's own search is **slug-based, not query-string based**, for free text.
The site's own search bar builds a URL like `/is-ilanlari/diyetisyen-istanbul` by
transliterating the query and location into one hyphenated slug (ç→c, ğ→g, ı/İ→i,
ö→o, ş→s, ü→u, everything else collapsed to `-`). The CLI's `slugify()` reproduces
this. Pagination mirrors the page links actually rendered in the results page
(`<a href="/is-ilanlari/<slug>-2">`), confirmed by reading the pagination markup —
not guessed.

**A `?kw=<text>&cp=<page>` query-string variant also exists** (found via the site's
"recherche" box) and does return results, but its relevance ranking is much looser
— `kw=diyetisyen istanbul` mixed in results from Ankara, Antalya, Elazığ etc.,
treating "istanbul" as a loose keyword rather than a location filter. The slug form
is what the site's own UI uses for a location-scoped search and is what this CLI
uses.

**A numeric city-id parameter exists too** (`?ct=<cityId>&pst=<positionId>`,
discovered via a redirect from a slug page — e.g. `ct=34,82` for İstanbul,
`pst=539` for the "Diyetisyen" position taxonomy entry) but only works combined
with a matching slug, and resolving arbitrary query text to the right position-id
would need a lookup table with no documented source. Not used; the slug form alone
already location-filters correctly (verified: `/is-ilanlari/diyetisyen-istanbul`
returns only İstanbul-area results).

**Per-card fields** (inside each `data-test="ad-card"` element — the "benzer
ilanlar" carousel uses a different marker, `data-test="slick-list-item"`, and is
excluded):

| Field | Anchor |
|---|---|
| id | trailing digits in the `/is-ilani/<slug>-<id>` href |
| title | `data-test="ad-card-title"` |
| company | `data-test="subtitle"` |
| location | `data-test="location"` |
| date (posting age, as text) | `data-test="ad-date-item-date-other"` or `-last`, text after stripping the leading `<i>` icon |

**Posting age / `--jobage`:** no URL parameter controls this reliably (the `ct`/`pst`
pair above doesn't cover it either). The CLI filters client-side on the parsed
`date` text instead (`parseAgeDays()` in `helpers.ts`): `"N gün"` → N days, `"N
saat"`/`"N dakika"` → same-day. Ambiguous badge text (`"Son gün"`, `"güncel"`) is
left unparsed (`null`) and the card is **kept**, not dropped — an unreadable age is
not evidence the posting is outside the window.

## Detail

**Pattern:** `GET https://www.kariyer.net/is-ilani/<any-slug>-<id>`.

kariyer.net resolves a posting by its **trailing numeric id alone** — a wrong slug
prefix still 301-redirects to the canonical URL (verified: `/is-ilani/x-2341255` →
301 → the real slug). The CLI always requests `/is-ilani/x-<id>` and lets the
redirect resolve it, so `detail` never needs the real slug.

**Not-found behavior:** there is no distinct 404 or "closed posting" page. An id
that doesn't resolve to a real posting 302-redirects to the generic
`/is-ilanlari` listing page (200 OK) instead. The CLI distinguishes this by
checking the final response URL's path after following redirects
(`response.url`): a path under `/is-ilani/` is a real posting, anything else
(`/is-ilanlari`) is `NOT_FOUND`.

**Fields:**

| Field | Anchor |
|---|---|
| title | `data-test="job-title"` |
| company | `data-test="company-name"` (an `<a>`) |
| location | `data-test="company-location"` |
| sector | `data-test="company-sector"` |
| posted-date text | `data-test="updated-date"` |
| description | `extractDivContent(html, "job-detail-qualifications")` — the div also carries `data-test="qualifications-and-job-description"`; contains `<p>` paragraphs, converted to newline-separated plain text |
| experience / education level | `data-test="alignment-list-title"` / `data-test="alignment-list-value"` pairs under "Aday Kriterleri" (candidate criteria) — currently reads the "Tecrübe" (experience) and "Eğitim Seviyesi" (education level) rows; other criteria the site may show are ignored |

No employment-type field is extracted on the detail page: the only `data-test="text"`
badge anchor found during investigation turned out to belong to the "benzer
ilanlar" (similar postings) carousel embedded further down the same page, not the
posting itself — extracting from it would silently attribute the wrong job's type.
Left out rather than risking a wrong value.

## Rate limiting observed

None hit during investigation (a few dozen requests, single IP, honest UA, ~1
req/sec). `htmlFetch()` still backs off on 429/5xx per the portal-skill contract,
matching every other shipped portal CLI.
