import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Runs the real CLI binary with `fetch` shimmed to a local server that serves
 * the saved search-results fixture, so the test exercises the whole CLI
 * (arg parsing -> URL building -> fetch -> parse -> format) without a real
 * network request. Same pattern as jobindex-search's documented-search test.
 */
async function search(args: string[]) {
  const requests: URL[] = [];
  const fixture = readFileSync(join(import.meta.dir, "fixtures/search-results-excerpt.html"), "utf-8");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      requests.push(new URL(request.url));
      return new Response(fixture, { headers: { "Content-Type": "text/html" } });
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "kariyer-net-search-"));
  const preload = join(dir, "fetch.ts");
  writeFileSync(
    preload,
    `
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== "https://www.kariyer.net") {
        throw new Error("Unexpected request origin: " + url.origin);
      }
      return originalFetch(${JSON.stringify(server.url.origin)} + url.pathname + url.search, init);
    };
  `,
  );
  try {
    const proc = Bun.spawn(
      [process.execPath, "run", "--preload", preload, join(import.meta.dir, "../src/cli.ts"), "search", ...args],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode, requests };
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}

test("search builds the documented slug URL from --query and --location", async () => {
  const { requests, exitCode, stderr } = await search(["--query", "diyetisyen", "--location", "İstanbul"]);
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.pathname).toBe("/is-ilanlari/diyetisyen-istanbul");
});

test("page 2 appends the numeric page suffix, matching kariyer.net's own pagination links", async () => {
  const { requests, exitCode } = await search(["--query", "diyetisyen", "--location", "İstanbul", "--page", "2"]);
  expect(exitCode).toBe(0);
  expect(requests[0]!.pathname).toBe("/is-ilanlari/diyetisyen-istanbul-2");
});

test("results come back in the documented JSON shape with real fields populated", async () => {
  const { stdout, exitCode } = await search(["--query", "diyetisyen", "--location", "İstanbul", "--format", "json"]);
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.meta.count).toBe(2);
  expect(parsed.results).toHaveLength(2);
  expect(parsed.results[0].id).toBe("2341255");
  expect(parsed.results[0].title).toBe("Diyetisyen");
  expect(parsed.results[0].url).toContain("kariyer.net/is-ilani/");
});

test("--jobage keeps only cards whose reported age is within the window", async () => {
  // Fixture cards are "19 gün" and "6 gün" old.
  const { stdout, exitCode } = await search([
    "--query", "diyetisyen", "--location", "İstanbul", "--jobage", "10", "--format", "json",
  ]);
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout);
  expect(parsed.results).toHaveLength(1);
  expect(parsed.results[0].id).toBe("4566988");
});

test("table format renders a header and one row per result", async () => {
  const { stdout, exitCode } = await search(["--query", "diyetisyen", "--location", "İstanbul", "--format", "table"]);
  expect(exitCode).toBe(0);
  const lines = stdout.split("\n");
  expect(lines[0]).toContain("TITLE");
  expect(lines.length).toBe(4); // header + separator + 2 result rows
});
