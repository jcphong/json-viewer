import { describe, expect, it } from "vitest";

import { DocumentEngine, type Row } from "@/lib/engine";

import bigintRaw from "../fixtures/bigint.json?raw";
import deepRaw from "../fixtures/deep.json?raw";
import { bigJson, DEEP_LEVELS } from "../scripts/fixtures/generators.ts";

const SAMPLE =
  '{"users":[{"name":"Ada","email":"ada@example.com"},{"name":"Linh"}],"count":2,"ok":true}';

function loaded(text: string): DocumentEngine {
  const engine = new DocumentEngine();
  const result = engine.load(text, "test.json");
  if (!result.ok) throw new Error(result.error.message);
  return engine;
}

const label = (r: Row) =>
  `${"  ".repeat(r.depth)}${r.key ?? "$"}:${r.type}${r.preview ? `=${r.preview}` : ""}`;

describe("DocumentEngine", () => {
  it("starts with the root expanded and reports stats", () => {
    const engine = new DocumentEngine();
    const result = engine.load(SAMPLE, "sample.json");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats).toMatchObject({ name: "sample.json", nodeCount: 9, maxDepth: 3 });
    expect(result.stats.sizeBytes).toBe(SAMPLE.length);
    expect(result.visibleCount).toBe(4);
    expect(engine.getRows(0, 10).map(label)).toEqual([
      "$:object",
      "  users:array",
      "  count:number=2",
      "  ok:boolean=true",
    ]);
  });

  it("returns errors instead of a document for invalid JSON", () => {
    const result = new DocumentEngine().load('{"a":1,}', "bad.json");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ line: 1, column: 8 });
  });

  it("toggles nodes and shows array indexes as keys", () => {
    const engine = loaded(SAMPLE);
    const users = engine.getRows(1, 2)[0];
    expect(users).toMatchObject({ key: "users", childCount: 2, expanded: false });
    expect(engine.toggle(users.id)).toBe(6);
    expect(engine.getRows(0, 10).map(label)).toEqual([
      "$:object",
      "  users:array",
      "    0:object",
      "    1:object",
      "  count:number=2",
      "  ok:boolean=true",
    ]);
    expect(engine.toggle(users.id)).toBe(4);
  });

  it("expands to a depth, expands all, and collapses all", () => {
    const engine = loaded(SAMPLE);
    expect(engine.expandToDepth(2)).toBe(6);
    expect(engine.expandToDepth(Number.POSITIVE_INFINITY)).toBe(9);
    expect(engine.getRows(0, 10).map(label)).toContain("      email:string=ada@example.com");
    expect(engine.collapseAll()).toBe(4);
  });

  it("serves any window consistently with a full walk (checkpointed rows)", () => {
    const engine = loaded([...bigJson(400_000)].join(""));
    const visible = engine.expandToDepth(Number.POSITIVE_INFINITY);
    expect(visible).toBeGreaterThan(5_000);
    const all = engine.getRows(0, visible);
    expect(all).toHaveLength(visible);
    for (const start of [0, 1, 255, 256, 257, 1000, visible - 3]) {
      expect(engine.getRows(start, start + 3)).toEqual(all.slice(start, start + 3));
    }
    expect(engine.getRows(visible, visible + 10)).toEqual([]);
    // Every visible node maps back to its row.
    for (const row of [0, 300, 4321, visible - 1]) expect(engine.rowOf(all[row].id)).toBe(row);
  });

  it("finds rows of nodes and reveals hidden ones", () => {
    const engine = loaded(SAMPLE);
    engine.expandToDepth(Number.POSITIVE_INFINITY);
    const email = engine.getRows(0, 20).find((r) => r.key === "email");
    expect(email).toBeDefined();
    if (!email) return;
    engine.collapseAll();
    expect(engine.rowOf(email.id)).toBe(-1);
    const row = engine.reveal(email.id);
    expect(engine.getRows(row, row + 1)[0].id).toBe(email.id);
  });

  it("describes a node with its JSONPath, size and full value", () => {
    const engine = loaded(SAMPLE);
    engine.expandToDepth(Number.POSITIVE_INFINITY);
    const rows = engine.getRows(0, 20);
    const email = rows.find((r) => r.key === "email");
    const first = rows.find((r) => r.key === 0);
    if (!email || !first) throw new Error("missing rows");
    expect(engine.detail(email.id)).toMatchObject({
      path: "$.users[0].email",
      type: "string",
      value: "ada@example.com",
      valueTruncated: false,
      sizeBytes: '"ada@example.com"'.length,
    });
    expect(engine.detail(first.id)?.value).toBe(
      '{\n  "name": "Ada",\n  "email": "ada@example.com"\n}',
    );
    expect(engine.detail(0)?.path).toBe("$");
  });

  it("copies values, pretty JSON and minified JSON losslessly", () => {
    const engine = loaded(bigintRaw);
    expect(engine.copyText(0, "minified")).toContain('"int64_max":9223372036854775807');
    expect(engine.copyText(0, "pretty")).toContain('"trailing_zero": 1.10');
    engine.expandToDepth(1);
    const description = engine.getRows(0, 5).find((r) => r.key === "description");
    if (!description) throw new Error("missing description");
    expect(engine.copyText(description.id, "value")).toMatch(/^Numbers that JSON.parse/);
    expect(engine.copyText(description.id, "minified")).toMatch(/^"Numbers that/);
  });

  it("previews unsafe numbers exactly and caps long strings", () => {
    const engine = loaded(`{"id":12345678901234567890,"long":"${"x".repeat(5000)}"}`);
    const [, id, long] = engine.getRows(0, 3);
    expect(id.preview).toBe("12345678901234567890");
    expect(long.preview).toHaveLength(300);
    expect(long.truncated).toBe(true);
  });

  it(`expands all ${DEEP_LEVELS} levels of deep.json`, () => {
    const engine = loaded(deepRaw);
    const visible = engine.expandToDepth(Number.POSITIVE_INFINITY);
    expect(visible).toBe(2 * DEEP_LEVELS + 1);
    const last = engine.getRows(visible - 1, visible)[0];
    expect(last).toMatchObject({ depth: DEEP_LEVELS, preview: "bottom" });
    expect(engine.detail(last.id)?.path).toMatch(/^\$\.child\[1\]\.child\[1\]\.child/);
  });

  it("clears the document", () => {
    const engine = loaded(SAMPLE);
    engine.clear();
    expect(engine.getRows(0, 10)).toEqual([]);
    expect(engine.getStats()).toBeNull();
  });
});
