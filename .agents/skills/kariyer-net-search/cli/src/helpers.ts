// Data source: kariyer.net, Turkey's largest general job board. No authentication
// required; search and detail pages are public and allowed by robots.txt (verified
// 2026-10-18 — /is-ilanlari/ and /is-ilani/ are not in the Disallow list).
//
// kariyer.net has no documented JSON API: both search and detail are server-rendered
// HTML with no embedded JSON state (checked for __NEXT_DATA__/__NUXT__/__INITIAL_STATE__
// — none present). We parse the HTML with regex, same approach as linkedin-search: the
// markup is shallow, carries stable `data-test="..."` attributes, and a full DOM parser
// is unnecessary for it.

export const SEARCH_BASE = "https://www.kariyer.net/is-ilanlari"
export const DETAIL_BASE = "https://www.kariyer.net/is-ilani"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; kariyer-net-search-cli/1.0)"

export interface FetchResult {
  html: string
  finalUrl: string
}

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<FetchResult> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return { html: "", finalUrl: response.url }
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return { html: await response.text(), finalUrl: response.url }
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
}

export interface JobDetail extends JobCard {
  description: string | null
  sector: string | null
  experienceLevel: string | null
  educationLevel: string | null
  isActive: boolean
}

const TURKISH_MAP: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
}

/**
 * Build a kariyer.net URL slug from free text: transliterate Turkish letters,
 * lowercase, collapse everything else to single hyphens. kariyer.net's search
 * is slug-based (`/is-ilanlari/<query>-<city>`), not query-string based for
 * free text, so the query and location both fold into this one slug.
 */
export function slugify(text: string): string {
  return text
    .split("")
    .map((ch) => TURKISH_MAP[ch] ?? ch)
    .join("")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

/**
 * Extract the inner HTML of a <div> identified by a CSS class name, correctly
 * handling nested <div> elements by tracking tag depth. Copied from
 * linkedin-search/cli/src/helpers.ts (shared pattern, not portal-specific).
 */
export function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

/** Posting-age text ("X gün", "X saat") to an approximate day count, or null
 * when the badge text is ambiguous ("Son gün", "güncel") rather than an age. */
export function parseAgeDays(text: string | null): number | null {
  if (!text) return null
  const t = text.trim().toLowerCase()
  if (/\d+\s*(saat|dakika)/.test(t)) return 0
  const m = t.match(/(\d+)\s*g[uü]n/)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Parse the search-results page: a flat list of job cards, each a
 * `data-test="ad-card"` element. We split on that marker and parse each
 * chunk independently so one malformed card cannot break the rest. The
 * "benzer ilanlar" (similar postings) carousel uses a different marker
 * (`data-test="slick-list-item"`) and is intentionally excluded.
 */
export function parseJobCards(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/data-test="ad-card"/).slice(1)

  for (const chunk of chunks) {
    const hrefMatch = chunk.match(/href="(\/is-ilani\/[^"]*-(\d+))"/)
    if (!hrefMatch) continue
    const path = hrefMatch[1]
    const id = hrefMatch[2]
    const url = `https://www.kariyer.net${path}`

    const titleMatch = chunk.match(/data-test="ad-card-title"[^>]*>([^<]*)</)
    const title = titleMatch ? clean(titleMatch[1]) : null
    if (!title) continue

    const companyMatch = chunk.match(/data-test="subtitle"[^>]*>([^<]*)</)
    const company = companyMatch ? clean(companyMatch[1]) || null : null

    const locationMatch = chunk.match(/data-test="location"[^>]*>([^<]*)</)
    const location = locationMatch ? clean(locationMatch[1]) || null : null

    const dateSpan = chunk.match(/data-test="ad-date-item-date-[a-z]+"[^>]*>([\s\S]*?)<\/span>/i)
    let date: string | null = null
    if (dateSpan) {
      const withoutIcon = dateSpan[1].replace(/<i[^>]*>[\s\S]*?<\/i>/gi, "")
      date = clean(withoutIcon) || null
    }

    results.push({ id, title, company, location, date, url })
  }

  return results
}

/** Parse the single-job detail page. */
export function parseJobDetail(html: string, id: string, url: string): JobDetail {
  const titleMatch = html.match(/data-test="job-title"[^>]*>([\s\S]*?)<\/div>/i)
  const title = titleMatch ? clean(titleMatch[1]) : "(untitled)"

  const companyMatch = html.match(/data-test="company-name"[^>]*>([\s\S]*?)<\/a>/i)
  const company = companyMatch ? clean(companyMatch[1]) || null : null

  const locationMatch = html.match(/data-test="company-location"[^>]*>([\s\S]*?)<\/span>/i)
  const location = locationMatch ? clean(locationMatch[1]) || null : null

  const sectorMatch = html.match(/data-test="company-sector"[^>]*>([\s\S]*?)<\/div>/i)
  const sector = sectorMatch ? clean(sectorMatch[1]) || null : null

  const dateMatch = html.match(/data-test="updated-date"[^>]*>([\s\S]*?)<\/span>/i)
  const date = dateMatch ? clean(dateMatch[1]) || null : null

  let description: string | null = null
  const descHtml = extractDivContent(html, "job-detail-qualifications")
  if (descHtml) {
    const withBreaks = descHtml.replace(/\s+/g, " ").replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    description =
      withBreaks.split("\n").map(clean).filter(Boolean).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null
  }

  const criteria: Record<string, string> = {}
  const criteriaRe =
    /data-test="alignment-list-title"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([\s\S]*?)<\/div>\s*<div data-test="alignment-list-value"[^>]*>([\s\S]*?)<\/div>/gi
  let cm: RegExpExecArray | null
  while ((cm = criteriaRe.exec(html)) !== null) {
    criteria[clean(cm[1]).toLowerCase()] = clean(cm[2])
  }

  return {
    id,
    title,
    company,
    location,
    date,
    url,
    description,
    sector,
    experienceLevel: criteria["tecrübe"] ?? criteria["tecrube"] ?? null,
    educationLevel: criteria["eğitim seviyesi"] ?? criteria["egitim seviyesi"] ?? null,
    // kariyer.net shows no distinct "closed/expired" banner on an invalid posting —
    // an unresolvable id instead 302-redirects to the generic listing page, which
    // runDetail() in commands/detail.ts already treats as NOT_FOUND before this
    // function runs. A page that reaches this parser is therefore a live posting.
    isActive: true,
  }
}
