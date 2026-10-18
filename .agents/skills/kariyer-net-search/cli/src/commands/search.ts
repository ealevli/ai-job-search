import { SEARCH_BASE, htmlFetch, parseJobCards, parseAgeDays, slugify, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const text = opts.location ? `${opts.query} ${opts.location}` : opts.query
  const slug = slugify(text)
  // kariyer.net is slug-based, not query-string based, for free text: page 1 is
  // the bare slug, page N>1 appends "-N" (verified against the site's own
  // pagination links, which render exactly this pattern).
  const path = opts.page > 1 ? `${slug}-${opts.page}` : slug
  return `${SEARCH_BASE}/${path}`
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const date = c.date || "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(11) + " " + "TITLE".padEnd(42) + " " + "COMPANY".padEnd(26) + " " + "LOCATION".padEnd(24) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const { html } = await htmlFetch(buildUrl(opts))
    let cards = parseJobCards(html)

    // Client-side jobage filter. kariyer.net exposes no reliable URL parameter
    // for posting age (see url-reference.md); a card whose age text can't be
    // parsed ("Son gün", "güncel") is KEPT rather than dropped, since we can't
    // tell whether it's within the window or not — never silently discard on
    // an ambiguous read.
    if (opts.jobage !== undefined) {
      cards = cards.filter((c) => {
        const days = parseAgeDays(c.date)
        return days === null || days <= opts.jobage!
      })
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map((c) => `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`)
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(JSON.stringify({ meta: { count: cards.length, page: opts.page }, results: cards }, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
