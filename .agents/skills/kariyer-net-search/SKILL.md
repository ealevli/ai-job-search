---
name: kariyer-net-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search for jobs in Turkey, find job
  listings on kariyer.net, or look up a specific kariyer.net job posting. Trigger
  phrases: find a job in Turkey, Türkiye'de iş ara, iş ilanı, iş ilanları, is
  ilanlari, kariyer.net, job search Turkey, open positions Turkey, "are there any
  X jobs in <Turkish city>", look up this kariyer.net posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/kariyer-net-search/cli/src/cli.ts *)
---

# kariyer.net Search Skill

Search live job listings from **kariyer.net**, Turkey's largest general job board.
No authentication, no API key, and **zero runtime dependencies** — it runs with just
`bun`. Built with `/add-portal` following the repo's portal-skill contract (same
commands, flags, output shape and error convention as `linkedin-search` and the
shipped Danish portals).

## When to use this skill

- Search for job openings on kariyer.net in a given Turkish city or region
- Filter by recency (posted within the last N days, as the site reports it)
- Get the full description of a specific kariyer.net job listing

## Commands

### Search job listings

```bash
bun run .agents/skills/kariyer-net-search/cli/src/cli.ts search --query "<text>" [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — **required.** Job title, skill, or role, e.g. `"diyetisyen"`, `"yazılım geliştirici"`.
- `--location <text>` / `-l <text>` — city or region, e.g. `"İstanbul"`, `"Ankara"`, `"İzmir"`. Folded into the same search slug as `--query` — kariyer.net's free-text search has no separate location parameter (see `url-reference.md`).
- `--jobage <days>` — keep only postings whose reported age is at most N days. A posting whose age badge is ambiguous (`"Son gün"`, `"güncel"`) is kept, not dropped, since it can't be read as a day count.
- `--page <n>` — page number (1-indexed).
- `--limit <n>` / `-n <n>` — cap total results emitted (client-side).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/kariyer-net-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric job id from `search` results (e.g. `2341255`). You may also pass
a full `kariyer.net/is-ilani/...` URL. kariyer.net resolves a posting by its id alone
(a wrong slug prefix still redirects to the real posting), so the bare id is enough.
Returns the full description, sector, and candidate-criteria fields (experience /
education level) where the posting states them.

## Usage examples

```bash
# Dietitian roles in İstanbul
bun run .agents/skills/kariyer-net-search/cli/src/cli.ts search -q "diyetisyen" -l "İstanbul" --format table

# Clinical dietitian roles in İstanbul, posted in the last 14 days
bun run .agents/skills/kariyer-net-search/cli/src/cli.ts search -q "klinik diyetisyen" -l "İstanbul" --jobage 14 --format table

# Software developer roles in İzmir, page 2
bun run .agents/skills/kariyer-net-search/cli/src/cli.ts search -q "yazılım geliştirici" -l "İzmir" --page 2 --format json

# Full detail for a specific posting
bun run .agents/skills/kariyer-net-search/cli/src/cli.ts detail 2341255 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data is from kariyer.net's public, server-rendered job-listing pages — no credentials required, and `robots.txt` permits both the search and detail paths (checked 2026-10-18).
- kariyer.net's free-text search has no documented posting-age URL parameter; `--jobage` filters client-side on the age text the site itself displays (see `url-reference.md` for exactly how).
- kariyer.net may rate-limit; the CLI retries 429/5xx with exponential backoff, matching every other shipped portal CLI.
- This is a **market-specific** skill (Turkey). Per the repo's contribution policy (`CONTRIBUTING.md`, "Building for your own market? Do this instead"), country-specific portal skills live in forks rather than being merged upstream — this one is announced in the [Community forks & adaptations](https://github.com/MadsLorentzen/ai-job-search/discussions/78) discussion for other Turkish forkers to find and copy.
