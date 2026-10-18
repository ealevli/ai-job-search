import { DETAIL_BASE, htmlFetch, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const KARIYER_HOST = /(^|\.)kariyer\.net$/i

/**
 * Accept a raw numeric job id, a full kariyer.net /is-ilani/... URL (with or
 * without scheme), or a bare slug ending in the id. kariyer.net resolves a
 * posting by its trailing numeric id regardless of the slug prefix (a 301 to
 * the canonical slug — verified live, 2026-10-18), so we only need the id.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{4,}$/.test(trimmed)) return trimmed

  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!KARIYER_HOST.test(parsed.hostname)) return null
    const m = parsed.pathname.match(/\/is-ilani\/[^/]*-(\d{4,})\/?$/)
    return m ? m[1] : null
  }

  const slug = trimmed.match(/^[a-z0-9-]*-(\d{4,})$/i)
  return slug ? slug[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(`Could not parse a job ID from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const { html, finalUrl } = await htmlFetch(`${DETAIL_BASE}/x-${id}`)
    // An unresolvable id 301s to the canonical slug if the posting exists, or
    // redirects to the generic /is-ilanlari listing page if it doesn't — no
    // distinct "closed" page. finalUrl lets us tell those apart.
    const isDetailPage = !html ? false : /\/is-ilani\//i.test(new URL(finalUrl).pathname)
    if (!html || !isDetailPage) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id, finalUrl)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.sector ? `Sector: ${job.sector}` : "",
        job.experienceLevel ? `Experience: ${job.experienceLevel}` : "",
        job.educationLevel ? `Education: ${job.educationLevel}` : "",
        job.date ? `Posted: ${job.date}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
