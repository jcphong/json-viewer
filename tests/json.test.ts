import { describe, expect, it } from "vitest";

import { beautifyJson, countNodes, minifyJson, parseJson } from "@/lib/json";

describe("beautify / minify", () => {
  it("beautifies with 2-space indentation", () => {
    const result = beautifyJson('{"a":[1,{"b":null}],"c":"x"}');
    expect(result.ok && result.text).toBe(
      '{\n  "a": [\n    1,\n    {\n      "b": null\n    }\n  ],\n  "c": "x"\n}',
    );
  });

  it("minifies to a single line with no whitespace", () => {
    const result = minifyJson('{\n  "a": [ 1, 2 ],\n  "b": { "c": true }\n}\n');
    expect(result.ok && result.text).toBe('{"a":[1,2],"b":{"c":true}}');
  });

  it("round-trips numbers exactly as written", () => {
    const source = '{"id":12345678901234567890,"price":1.10,"big":1e400,"neg":-0.0}';
    const pretty = beautifyJson(source);
    expect(pretty.ok).toBe(true);
    if (!pretty.ok) return;
    expect(pretty.text).toContain("12345678901234567890");
    expect(pretty.text).toContain("1.10");
    expect(pretty.text).toContain("1e400");
    const compact = minifyJson(pretty.text);
    expect(compact.ok && compact.text).toBe(source);
  });

  it("keeps unicode and control-character escapes valid", () => {
    const result = minifyJson('["😀", "שלום", "\\u0000", "a\\"b"]');
    expect(result.ok && result.text).toBe('["😀","שלום","\\u0000","a\\"b"]');
  });

  it("handles 500 levels of nesting", () => {
    const deep = `${"[".repeat(500)}1${"]".repeat(500)}`;
    const result = beautifyJson(deep);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.nodeCount).toBe(501);
  });

  it("reports errors with line and column instead of formatting", () => {
    const result = beautifyJson('{\n  "a": 1,\n}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ line: 3, column: 1 });
  });

  it("rejects duplicate keys with different values rather than dropping one", () => {
    const result = minifyJson('{"a":1,"a":2}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/duplicate key/i);
  });
});

describe("parseJson", () => {
  it("returns node count and parse time", () => {
    const result = parseJson('{"a":[1,2,3],"b":{"c":null}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // root, a, 1, 2, 3, b, c
    expect(result.nodeCount).toBe(7);
    expect(result.parseMs).toBeGreaterThanOrEqual(0);
  });

  it("treats empty input as an error", () => {
    expect(parseJson("").ok).toBe(false);
  });
});

describe("countNodes", () => {
  it("counts primitives as one node", () => {
    expect(countNodes(null)).toBe(1);
    expect(countNodes("x")).toBe(1);
  });

  it("does not recurse (100k deep)", () => {
    let value: unknown = 0;
    for (let i = 0; i < 100_000; i++) value = [value];
    expect(countNodes(value)).toBe(100_001);
  });
});
