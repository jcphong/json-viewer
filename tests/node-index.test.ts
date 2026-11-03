import { describe, expect, it } from "vitest";

import { decodeJsonString } from "@/lib/json-string";
import {
  ARRAY,
  buildIndex,
  type NodeIndex,
  NUMBER,
  OBJECT,
  STRING,
  valueEnd,
} from "@/lib/node-index";
import { toJsonPath } from "@/lib/path";
import { reformatJson } from "@/lib/reformat";

import badRaw from "../fixtures/bad.json?raw";
import bigintRaw from "../fixtures/bigint.json?raw";
import deepRaw from "../fixtures/deep.json?raw";
import llmTraceRaw from "../fixtures/llm-trace.json?raw";
import unicodeRaw from "../fixtures/unicode.json?raw";
import { BAD_JSON_ERROR, BIGINT_LITERALS, DEEP_LEVELS } from "../scripts/fixtures/generators.ts";

function index(text: string): NodeIndex {
  const result = buildIndex(text);
  if (!result.ok) throw new Error(result.error.message);
  return result.index;
}

/** Rebuilds a JS value from the index (iteratively), to compare against JSON.parse. */
function materialize(idx: NodeIndex): unknown {
  const values: unknown[] = new Array(idx.count);
  for (let id = 0; id < idx.count; id++) {
    const raw = idx.text.slice(idx.start[id], valueEnd(idx, id));
    const type = idx.type[id];
    const value =
      type === OBJECT
        ? {}
        : type === ARRAY
          ? []
          : type === STRING
            ? JSON.parse(raw)
            : JSON.parse(raw);
    values[id] = value;
    const p = idx.parent[id];
    if (p < 0) continue;
    const key = idx.key[id];
    if (key < 0) (values[p] as unknown[])[-key - 1] = value;
    else (values[p] as Record<string, unknown>)[decodeJsonString(idx.text, key).value] = value;
  }
  return values[0];
}

const VALID = [
  "0",
  "-0",
  "1.5e10",
  "-12.34E-5",
  '""',
  '"\\u00e9\\n\\"\\\\\\/"',
  "true",
  "false",
  "null",
  "[]",
  "{}",
  " [ 1 , [ ] , { } , [ [ ] ] ] ",
  '{"a":{"b":[1,{"c":null}]},"d":"x"}',
  '{"dup":1,"dup":2}',
  '["\\ud83d\\ude00", "\\ud800", "😀"]',
  "\n\t\r 42 \n",
];

const INVALID = [
  "",
  "   ",
  "{",
  "[",
  "[1,]",
  '{"a":1,}',
  "{a:1}",
  "{'a':1}",
  '{"a" 1}',
  '{"a":}',
  "01",
  "1.",
  ".5",
  "+1",
  "1e",
  "-",
  "tru",
  "nul",
  "NaN",
  "Infinity",
  '"abc',
  '"\\x"',
  '"\\u12"',
  '"tab\there"',
  "[1 2]",
  "1 2",
  "[1]]",
  '{"a":1}}',
  "]",
];

describe("buildIndex", () => {
  it.each(VALID)("accepts %j like JSON.parse and rebuilds the same value", (text) => {
    const result = buildIndex(text);
    expect(result.ok).toBe(true);
    if (result.ok) expect(materialize(result.index)).toEqual(JSON.parse(text));
  });

  it.each(INVALID)("rejects %j like JSON.parse", (text) => {
    expect(() => JSON.parse(text)).toThrow();
    expect(buildIndex(text).ok).toBe(false);
  });

  it.each([
    ["fixtures/unicode.json", unicodeRaw],
    ["fixtures/llm-trace.json", llmTraceRaw],
    ["fixtures/deep.json", deepRaw],
  ])("rebuilds %s exactly", (_, text) => {
    expect(materialize(index(text))).toEqual(JSON.parse(text));
  });

  it("stores the tree in preorder with parents, depths, child counts and subtree ends", () => {
    const idx = index('{"a":[10,20],"b":{"c":true}}');
    // 0 root, 1 a, 2 10, 3 20, 4 b, 5 c
    expect(idx.count).toBe(6);
    expect([...idx.parent]).toEqual([-1, 0, 1, 1, 0, 4]);
    expect([...idx.depth]).toEqual([0, 1, 2, 2, 1, 2]);
    expect([...idx.subtreeEnd]).toEqual([6, 4, 3, 4, 6, 6]);
    expect(idx.childCount[0]).toBe(2);
    expect(idx.childCount[1]).toBe(2);
    expect(idx.key[2]).toBe(-1); // array index 0
    expect(idx.key[3]).toBe(-2); // array index 1
    expect(decodeJsonString(idx.text, idx.key[4]).value).toBe("b");
    expect(idx.type[2]).toBe(NUMBER);
  });

  it(`handles ${DEEP_LEVELS} levels without recursion`, () => {
    const idx = index(deepRaw);
    expect(Math.max(...idx.depth)).toBe(DEEP_LEVELS);
  });

  it("handles 60k levels of nesting and rejects more than 65535 with a clear error", () => {
    const text = (n: number) => `${"[".repeat(n)}1${"]".repeat(n)}`;
    expect(index(text(60_000)).count).toBe(60_001);
    const result = buildIndex(text(70_000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/Nesting deeper than 65535 levels/);
  });

  it("keeps number text exactly", () => {
    const idx = index(bigintRaw);
    const numbers = new Set<string>();
    for (let id = 0; id < idx.count; id++) {
      if (idx.type[id] === NUMBER) numbers.add(idx.text.slice(idx.start[id], valueEnd(idx, id)));
    }
    for (const literal of BIGINT_LITERALS) expect(numbers).toContain(literal);
  });

  it("reports bad.json at its documented line and column", () => {
    const result = buildIndex(badRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatchObject(BAD_JSON_ERROR);
      expect(result.error.message).toMatch(/Comma ',' or end of object/);
    }
  });

  it("locates errors precisely", () => {
    const result = buildIndex("[1,\n  2,\n  ]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ line: 3, column: 3 });
  });

  it("reports progress", () => {
    const fractions: number[] = [];
    buildIndex(`[${"1,".repeat(1_500_000)}1]`, (f) => fractions.push(f));
    expect(fractions.length).toBeGreaterThan(1);
    expect(fractions.at(-1)).toBe(1);
  });
});

describe("decodeJsonString", () => {
  it("decodes escapes and surrogate pairs", () => {
    expect(decodeJsonString('"a\\tb\\u00e9\\ud83d\\ude00\\""', 0).value).toBe('a\tbé😀"');
  });

  it("stops after maxChars", () => {
    expect(decodeJsonString(`"${"x".repeat(1000)}"`, 0, 10)).toEqual({
      value: "xxxxxxxxxx",
      truncated: true,
    });
    expect(decodeJsonString('"a\\nbcdef"', 0, 3)).toEqual({ value: "a\nb", truncated: true });
    expect(decodeJsonString('"abc"', 0, 3)).toEqual({ value: "abc", truncated: false });
  });
});

describe("toJsonPath", () => {
  it("uses dots for identifiers and brackets otherwise", () => {
    expect(toJsonPath([])).toBe("$");
    expect(toJsonPath(["users", 3, "email"])).toBe("$.users[3].email");
    expect(toJsonPath(["a.b", "", 'q"k', "$ok", "9x"])).toBe('$["a.b"][""]["q\\"k"].$ok["9x"]');
  });
});

describe("reformatJson", () => {
  const source = '{ "a" : [ 1 , 12345678901234567890 , { } , [ ] ], "s":"x, y: [z]" , "n":null }';

  it("minifies losslessly", () => {
    expect(reformatJson(source, 0).text).toBe(
      '{"a":[1,12345678901234567890,{},[]],"s":"x, y: [z]","n":null}',
    );
  });

  it("pretty prints with indentation", () => {
    expect(reformatJson('{"a":[1,{"b":"c"}],"e":{}}', 2).text).toBe(
      '{\n  "a": [\n    1,\n    {\n      "b": "c"\n    }\n  ],\n  "e": {}\n}',
    );
  });

  it("caps output", () => {
    const result = reformatJson(`[${"1,".repeat(1000)}1]`, 2, 50);
    expect(result.truncated).toBe(true);
    expect(result.text).toHaveLength(50);
  });

  it("matches JSON.stringify for documents without numeric-looking keys", () => {
    for (const text of [llmTraceRaw, deepRaw]) {
      expect(reformatJson(text, 2).text).toBe(JSON.stringify(JSON.parse(text), null, 2));
    }
  });

  it("keeps key order and escapes as written (unlike JSON.stringify)", () => {
    const pretty = reformatJson(unicodeRaw, 2).text;
    expect(JSON.parse(pretty)).toEqual(JSON.parse(unicodeRaw));
    expect(pretty.indexOf('"emoji"')).toBeLessThan(pretty.indexOf('"123"'));
    expect(pretty).toContain(String.raw`"before\u0000after"`);
  });
});
