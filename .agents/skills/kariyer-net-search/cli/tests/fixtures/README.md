# kariyer.net fixtures

Both files are verbatim excerpts of real kariyer.net responses, fetched with this
CLI's own `htmlFetch` (honest User-Agent, no bypass) on 2026-10-18, trimmed to the
markup the parsers read.

- `search-results-excerpt.html` — the first two job cards from
  `https://www.kariyer.net/is-ilanlari/diyetisyen-istanbul`.
- `detail-page-excerpt.html` — the title/company/location/date/description/criteria
  block from `https://www.kariyer.net/is-ilani/naturel-yemek-gida-temizlik-ve-egitim-san-tic-l-diyetisyen-2341255`.

Recruiter cards, images, tracking scripts, the "benzer ilanlar" carousel and
unrelated page chrome are omitted; the retained bytes are unmodified. Tests serve
these over loopback (see `tests/search.test.ts`, `tests/detail.test.ts`) and make
no live kariyer.net requests.
