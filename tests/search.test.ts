import { describe, expect, it } from "vitest";

import { DocumentEngine, MAX_SEARCH_MATCHES, type SearchOptions } from "@/lib/engine";

import unicodeRaw from "../fixtures/unicode.json?raw";

const DOC = JSON.stringify({
  users: [
    { name: "Ada Lovelace", email: "ada@example.com", role: "Admin" },
    { name: "Linh", email: "linh@example.com", role: "admin", note: "Ask Ada" },
  ],
  admin: true,
  count: 12345678901234,
});

const opts = (o: Partial<SearchOptions> = {}): SearchOptions => ({
  scope: "both",
  caseSensitive: false,
  regex: false,
  ...o,
});

function loaded(text = DOC, name = "doc.json") {
  const e = new DocumentEngine();
  const r = e.load(text, name);
  if (!r.ok) throw new Error(r.error.message);
  return e;
}

async function paths(e: DocumentEngine, query: string, o?: Partial<SearchOptions>) {
  const result = await e.search(query, opts(o));
  if (!result?.ok) throw new Error(result ? result.error : "cancelled");
  return result.ids.map((id) => e.detail(id)?.path);
}

describe("DocumentEngine.search", () => {
  it("finds values and keys, case-insensitively by default, in document order", async () => {
    const e = loaded();
    expect(await paths(e, "admin")).toEqual(["$.users[0].role", "$.users[1].role", "$.admin"]);
  });

  it("respects case sensitivity", async () => {
    const e = loaded();
    expect(await paths(e, "Admin", { caseSensitive: true })).toEqual(["$.users[0].role"]);
  });

  it("limits the search to keys or values", async () => {
    const e = loaded();
    expect(await paths(e, "admin", { scope: "keys" })).toEqual(["$.admin"]);
    expect(await paths(e, "admin", { scope: "values" })).toEqual([
      "$.users[0].role",
      "$.users[1].role",
    ]);
  });

  it("matches numbers by their text", async () => {
    const e = loaded();
    expect(await paths(e, "56789012")).toEqual(["$.count"]);
  });

  it("supports regular expressions and reports invalid ones", async () => {
    const e = loaded();
    expect(await paths(e, "^ada", { regex: true, scope: "values" })).toEqual([
      "$.users[0].name",
      "$.users[0].email",
    ]);
    const bad = await e.search("(", opts({ regex: true }));
    expect(bad?.ok).toBe(false);
  });

  it("finds text written with escapes (full scan for non-ASCII queries)", async () => {
    const e = loaded(unicodeRaw, "unicode.json");
    // The file spells "é" both literally and as \\u00e9.
    const hits = await paths(e, "é", { scope: "values" });
    expect(hits).toContain("$.combining");
    expect(hits).toContain("$.escaped_unicode");
    expect(await paths(e, "after", { scope: "values" })).toEqual(["$.null_char"]);
    expect(await paths(e, 'quote"key', { scope: "keys" })).toEqual(['$["quote\\"key"]']);
  });

  it("doesn't match escape sequences as text", async () => {
    const e = loaded('{"a":"line1\\nline2","b":"n"}');
    expect(await paths(e, "n", { caseSensitive: true, scope: "values" })).toEqual(["$.a", "$.b"]);
    expect(await paths(e, "1n", { scope: "values" })).toEqual([]);
  });

  it("flags matches on rows", async () => {
    const e = loaded();
    e.expandToDepth(Number.POSITIVE_INFINITY);
    await e.search("linh", opts());
    const flagged = e.getRows(0, 50).filter((r) => r.isMatch);
    expect(flagged.map((r) => r.key)).toEqual(["name", "email"]);
    e.clearSearch();
    expect(e.getRows(0, 50).some((r) => r.isMatch)).toBe(false);
  });

  it("returns nothing for an empty query", async () => {
    expect(await loaded().search("", opts())).toMatchObject({ ok: true, ids: [] });
  });

  it("stops at the match cap", async () => {
    const e = loaded(`[${'"x",'.repeat(MAX_SEARCH_MATCHES + 10)}"x"]`);
    const result = await e.search("x", opts());
    expect(result?.ok && result.ids.length).toBe(MAX_SEARCH_MATCHES);
    expect(result?.ok && result.capped).toBe(true);
  });

  it("can be cancelled", async () => {
    const e = loaded(`[${'"needle",'.repeat(200_000)}"needle"]`);
    expect(await e.search("needle", opts(), () => false)).toBeNull();
  });

  it("works on JSON Lines with paths relative to the line", async () => {
    const e = new DocumentEngine();
    e.load('{"id":1,"tag":"a"}\n{"id":2,"tag":"needle"}', "x.jsonl");
    const result = await e.search("needle", opts());
    if (!result?.ok) throw new Error("search failed");
    expect(result.ids.map((id) => [e.detail(id)?.line, e.detail(id)?.path])).toEqual([
      [2, "$.tag"],
    ]);
  });
});
