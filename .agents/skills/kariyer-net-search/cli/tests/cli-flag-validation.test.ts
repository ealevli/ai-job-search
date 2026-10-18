import { expect, test } from "bun:test";
import { runCLI, parseJSON } from "./helpers.js";

// Every case here fails before any network request, so these run fully offline.

test("search with no --query exits 1 with a JSON error naming NO_QUERY", async () => {
  const result = await runCLI(["search", "--location", "İstanbul"]);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe("NO_QUERY");
});

test("an unknown flag is rejected rather than silently dropped", async () => {
  const result = await runCLI(["search", "--query", "diyetisyen", "--bogus", "foo"]);
  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe("UNKNOWN_FLAG");
});

test("--format rejects a value outside json|table|plain", async () => {
  const result = await runCLI(["search", "--query", "diyetisyen", "--format", "xml"]);
  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe("BAD_ARG");
});

test("--jobage rejects a non-whole-number value", async () => {
  const result = await runCLI(["search", "--query", "diyetisyen", "--jobage", "abc"]);
  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe("BAD_ARG");
});

test("detail with no id exits 1 with a JSON error naming NO_ID", async () => {
  const result = await runCLI(["detail"]);
  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe("NO_ID");
});

test("detail with an unparseable id exits 1 with a JSON error naming BAD_ID", async () => {
  const result = await runCLI(["detail", "not-a-valid-id"]);
  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr);
  expect(err.code).toBe("BAD_ID");
});

test("search --help prints usage and exits 0", async () => {
  const result = await runCLI(["search", "--help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("kariyer-net-cli");
});

test("no command prints usage and exits 1", async () => {
  const result = await runCLI([]);
  expect(result.exitCode).toBe(1);
});
