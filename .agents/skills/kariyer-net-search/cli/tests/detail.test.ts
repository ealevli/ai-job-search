import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runDetailAgainst(handler: (req: Request) => Response | Promise<Response>, args: string[]) {
  const requests: URL[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      requests.push(new URL(request.url));
      return handler(request);
    },
  });
  const dir = mkdtempSync(join(tmpdir(), "kariyer-net-detail-"));
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
      return originalFetch(${JSON.stringify(server.url.origin)} + url.pathname + url.search, { ...init, redirect: "follow" });
    };
  `,
  );
  try {
    const proc = Bun.spawn(
      [process.execPath, "run", "--preload", preload, join(import.meta.dir, "../src/cli.ts"), "detail", ...args],
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

test("detail fetches /is-ilani/x-<id> and parses a real posting", async () => {
  const fixture = readFileSync(join(import.meta.dir, "fixtures/detail-page-excerpt.html"), "utf-8");
  const { stdout, exitCode, requests } = await runDetailAgainst(
    () => new Response(fixture, { headers: { "Content-Type": "text/html" } }),
    ["2341255", "--format", "json"],
  );
  expect(exitCode).toBe(0);
  expect(requests[0]!.pathname).toBe("/is-ilani/x-2341255");
  const job = JSON.parse(stdout);
  expect(job.id).toBe("2341255");
  expect(job.title).toBe("Diyetisyen");
  expect(job.description).toContain("İş Tanımı");
});

test("an id that redirects to the generic listing page is reported as NOT_FOUND", async () => {
  // This mirrors kariyer.net's real behavior for an id that doesn't resolve
  // to a posting: a 302 to /is-ilanlari (the search landing page) rather than
  // a distinct 404 or "closed" page.
  const { exitCode, stderr } = await runDetailAgainst((req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/is-ilani/")) {
      return new Response(null, { status: 302, headers: { Location: "/is-ilanlari" } });
    }
    return new Response("<title>İş İlanları</title>", { headers: { "Content-Type": "text/html" } });
  }, ["999999999"]);
  expect(exitCode).toBe(1);
  const err = JSON.parse(stderr);
  expect(err.code).toBe("NOT_FOUND");
});

test("a full kariyer.net URL is accepted and its id extracted", async () => {
  const fixture = readFileSync(join(import.meta.dir, "fixtures/detail-page-excerpt.html"), "utf-8");
  const { exitCode, requests } = await runDetailAgainst(
    () => new Response(fixture, { headers: { "Content-Type": "text/html" } }),
    ["https://www.kariyer.net/is-ilani/naturel-yemek-gida-temizlik-ve-egitim-san-tic-l-diyetisyen-2341255"],
  );
  expect(exitCode).toBe(0);
  expect(requests[0]!.pathname).toBe("/is-ilani/x-2341255");
});
