# kariyer-net-cli

CLI for searching jobs on **kariyer.net**, Turkey's largest general job board.

**Data source**: kariyer.net's public, server-rendered `/is-ilanlari/` (search) and `/is-ilani/` (detail) pages.
**Authentication**: None required.
**Dependencies**: None (plain `bun` + `fetch`). `bun install` is optional and only pulls dev type defs.

## Installation

```bash
cd .agents/skills/kariyer-net-search/cli
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
# Dietitian roles in İstanbul
bun run src/cli.ts search -q "diyetisyen" -l "İstanbul" --format table

# Clinical roles, last 14 days
bun run src/cli.ts search -q "klinik diyetisyen" -l "İstanbul" --jobage 14 --format table

# Full detail for one job
bun run src/cli.ts detail 2341255 --format plain
```

See `../SKILL.md` for the full flag reference and `../url-reference.md` for exactly how search, pagination and job-age filtering map onto kariyer.net's HTML.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | **Required.** Job title, skill, or role. |
| `--location` | `-l` | City/region, e.g. `"İstanbul"`. Folded into the same search slug as `--query`. |
| `--jobage` | | Keep postings whose reported age is at most N days (client-side; see `url-reference.md`). |
| `--page` | | 1-indexed page. |
| `--limit` | `-n` | Cap results emitted. |
| `--format` | | `json` \| `table` \| `plain`. |
