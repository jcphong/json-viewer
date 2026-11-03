import { describe, expect, it } from "vitest";

import { DocumentEngine } from "@/lib/engine";
import { minifyJsonl, parseJsonl } from "@/lib/jsonl";
import { buildIndex, buildIndexAuto, buildJsonlIndex, looksLikeJsonl } from "@/lib/node-index";

import { dataJsonl, JSONL_MALFORMED_LINES } from "../scripts/fixtures/generators.ts";

const SAMPLE =
  '{"id":1,"name":"Ada"}\n{"id":2,"tags":["x"]}\n\n{"id":3, oops}\r\n{"id":12345678901234567890}\n';

describe("buildJsonlIndex", () => {
  it("indexes one value per line under a synthetic root, keyed by line number", () => {
    const idx = buildJsonlIndex(SAMPLE);
    expect(idx.format).toBe("jsonl");
    expect(idx.lines).toBe(4);
    expect(idx.malformedLines).toBe(1);
    expect(idx.childCount[0]).toBe(3);
    const lineKeys: number[] = [];
    for (let id = 1; id < idx.count; id = idx.subtreeEnd[id]) lineKeys.push(-idx.key[id]);
    expect(lineKeys).toEqual([1, 2, 5]);
  });

  it("reports malformed lines with their real line and column and keeps going", () => {
    const idx = buildJsonlIndex(SAMPLE);
    expect(idx.lineErrors).toHaveLength(1);
    expect(idx.lineErrors[0]).toMatchObject({ line: 4, column: 10 });
    expect(idx.lineErrors[0].message).toMatch(/Quoted object key expected/);
  });

  it("handles the data.jsonl fixture's malformed lines", () => {
    const text = [...dataJsonl(1_300)].join("");
    const idx = buildJsonlIndex(text);
    expect(idx.lines).toBe(1_300);
    expect(idx.malformedLines).toBe(1);
    expect(idx.lineErrors[0].line).toBe(JSONL_MALFORMED_LINES[0].line);
    expect(idx.childCount[0]).toBe(1_299);
  });

  it("caps stored errors but counts them all", () => {
    const text = "x\n".repeat(1500);
    const idx = buildJsonlIndex(text);
    expect(idx.malformedLines).toBe(1500);
    expect(idx.lineErrors).toHaveLength(1000);
    expect(idx.childCount[0]).toBe(0);
  });
});

describe("format detection", () => {
  it("uses the file extension", () => {
    const result = buildIndexAuto('{"a":1}', "events.jsonl");
    expect(result.ok && result.index.format).toBe("jsonl");
    const ndjson = buildIndexAuto('{"a":1}', "x.NDJSON");
    expect(ndjson.ok && ndjson.index.format).toBe("jsonl");
  });

  it("detects JSON Lines from a second value on a later line", () => {
    const result = buildIndexAuto('{"a":1}\n{"a":2}', "pasted");
    expect(result.ok && result.index.format).toBe("jsonl");
  });

  it("keeps ordinary JSON and ordinary JSON errors as JSON", () => {
    const json = buildIndexAuto('{"a":[1,2]}', "data.json");
    expect(json.ok && json.index.format).toBe("json");
    const bad = buildIndexAuto('{"a":1,}', "bad.json");
    expect(bad.ok).toBe(false);
    const sameLine = buildIndex('{"a":1} {"b":2}');
    expect(!sameLine.ok && looksLikeJsonl('{"a":1} {"b":2}', sameLine.error)).toBe(false);
  });
});

describe("DocumentEngine with JSONL", () => {
  function engine(text: string, name = "events.jsonl") {
    const e = new DocumentEngine();
    const result = e.load(text, name);
    if (!result.ok) throw new Error(result.error.message);
    return { e, result };
  }

  it("shows each line as a root row labelled with its line number", () => {
    const { e, result } = engine(SAMPLE);
    expect(result.stats).toMatchObject({ format: "jsonl", lines: 4, malformedLines: 1 });
    expect(result.lineErrors).toHaveLength(1);
    const rows = e.getRows(0, 10);
    expect(rows.map((r) => r.line)).toEqual([undefined, 1, 2, 5]);
    expect(rows[3].childCount).toBe(1);
  });

  it("gives paths relative to the line, plus the line number", () => {
    const { e } = engine(SAMPLE);
    e.expandToDepth(Number.POSITIVE_INFINITY);
    const tag = e.getRows(0, 20).find((r) => r.preview === "x");
    if (!tag) throw new Error("missing row");
    expect(e.detail(tag.id)).toMatchObject({ path: "$.tags[0]", line: 2, value: "x" });
    expect(e.detail(0)).toMatchObject({ path: "$", type: "array", childCount: 3 });
  });

  it("copies the whole file as JSON Lines or as a pretty JSON array, losslessly", () => {
    const { e } = engine(SAMPLE);
    expect(e.copyText(0, "minified")).toBe(
      '{"id":1,"name":"Ada"}\n{"id":2,"tags":["x"]}\n{"id":12345678901234567890}',
    );
    expect(JSON.parse(e.copyText(0, "pretty").replace("12345678901234567890", "0"))).toHaveLength(
      3,
    );
    expect(e.copyText(0, "pretty")).toContain("12345678901234567890");
  });

  it("switches between JSON and JSONL without reloading, even after a failed parse", () => {
    const e = new DocumentEngine();
    const failed = e.load('{"a":1}\n{"a":2', "x.json", undefined, undefined, "json");
    expect(failed.ok).toBe(false);
    const jsonl = e.setFormat("jsonl");
    expect(jsonl?.ok && jsonl.stats).toMatchObject({
      format: "jsonl",
      lines: 2,
      malformedLines: 1,
    });
    const back = e.load("[1,2]", "y.json");
    expect(back.ok && back.stats.format).toBe("json");
    const asLines = e.setFormat("jsonl");
    expect(asLines?.ok && asLines.stats.lines).toBe(1);
  });
});

describe("parseJsonl / minifyJsonl (editor text)", () => {
  it("parses valid lines and locates malformed ones in the whole text", () => {
    const parsed = parseJsonl(SAMPLE);
    expect(parsed.values).toHaveLength(3);
    expect(parsed.lineNumbers).toEqual([1, 2, 5]);
    expect(parsed.lines).toBe(4);
    expect(parsed.malformed).toBe(1);
    expect(parsed.errors[0]).toMatchObject({ line: 4 });
    expect(String((parsed.values[2] as { id: unknown }).id)).toBe("12345678901234567890");
  });

  it("minifies line by line, keeping blank and malformed lines in place", () => {
    const text = '{ "a" : 1 }\n\n{ oops }\n[ 1, 2 ]';
    expect(minifyJsonl(text)).toBe('{"a":1}\n\n{ oops }\n[1,2]');
  });
});
