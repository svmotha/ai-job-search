import { test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

interface SearchResponse {
  meta: { count: number; page: number; total: number | null };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string;
  }>;
}

test("search returns real results with non-null id/title/url", async () => {
  const res = await runCLI([
    "search",
    "-q",
    "Product Manager",
    "--limit",
    "5",
  ]);
  const data = parseJSON<SearchResponse>(res);

  expect(res.exitCode).toBe(0);
  expect(data.results.length).toBeGreaterThan(0);

  for (const job of data.results) {
    expect(job.id).toBeTruthy();
    expect(job.title).toBeTruthy();
    expect(job.url).toContain("pnet.co.za");
  }
});

test("search with location narrows and stays valid", async () => {
  const res = await runCLI([
    "search",
    "-q",
    "Product Manager",
    "-l",
    "Cape Town",
    "--limit",
    "3",
  ]);
  const data = parseJSON<SearchResponse>(res);
  expect(res.exitCode).toBe(0);
  expect(data.results.length).toBeGreaterThan(0);
});

test("detail returns a readable description for a live job id", async () => {
  // Pull a fresh id from search, then fetch its detail (ids expire, so we
  // don't hard-code one).
  const search = await runCLI(["search", "-q", "Product Manager", "--limit", "1"]);
  const data = parseJSON<SearchResponse>(search);
  const id = data.results[0]?.id;
  expect(id).toBeTruthy();

  const detail = await runCLI(["detail", id!, "--format", "plain"]);
  expect(detail.exitCode).toBe(0);
  expect(detail.stdout.length).toBeGreaterThan(50);
});

test("missing --query exits 1 with a JSON error on stderr", async () => {
  const res = await runCLI(["search"]);
  expect(res.exitCode).toBe(1);
  expect(res.stdout).toBe("");
  const err = JSON.parse(res.stderr);
  expect(err.code).toBe("NO_QUERY");
});

test("a bogus numeric flag exits 1 with a JSON error on stderr", async () => {
  const res = await runCLI(["search", "-q", "test", "--page", "abc"]);
  expect(res.exitCode).toBe(1);
  const err = JSON.parse(res.stderr);
  expect(err.code).toBe("BAD_ARG");
});
