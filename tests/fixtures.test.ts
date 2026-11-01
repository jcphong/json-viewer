import { isLosslessNumber, parse } from "lossless-json";
import { describe, expect, it } from "vitest";
import { minifyJson, parseJson } from "@/lib/json";
import badRaw from "../fixtures/bad.json?raw";
import bigintRaw from "../fixtures/bigint.json?raw";
import deepRaw from "../fixtures/deep.json?raw";
import llmTraceRaw from "../fixtures/llm-trace.json?raw";
import unicodeRaw from "../fixtures/unicode.json?raw";
import {
  BAD_JSON_ERROR,
  BIGINT_LITERALS,
  badJson,
  bigintJson,
  bigJson,
  DEEP_LEVELS,
  dataJsonl,
  deepJson,
  EMBEDDING_DIM,
  embeddingsJson,
  FIXTURES,
  JSONL_MALFORMED_LINES,
  llmTraceJson,
  unicodeJson,
  wideJson,
} from "../scripts/fixtures/generators.ts";

const text = (chunks: Iterable<string>) => [...chunks].join("");

/** Maximum container nesting, scanning characters iteratively (strings skipped). */
function maxDepth(json: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{" || c === "[") max = Math.max(max, ++depth);
    else if (c === "}" || c === "]") depth--;
  }
  return max;
}

describe("committed fixtures", () => {
  it.each([
    ["deep.json", deepRaw],
    ["bigint.json", bigintRaw],
    ["unicode.json", unicodeRaw],
    ["bad.json", badRaw],
    ["llm-trace.json", llmTraceRaw],
  ])("%s matches the generator output (run `pnpm fixtures --small`)", (file, raw) => {
    const spec = FIXTURES.find((f) => f.file === file);
    expect(spec?.small).toBe(true);
    expect(raw).toBe(text(spec?.generate() ?? []));
  });

  it("covers every fixture in PLAN.md 0.3", () => {
    expect(FIXTURES.map((f) => f.file).sort()).toEqual(
      [
        "bad.json",
        "big-200mb.json",
        "big-50mb.json",
        "bigint.json",
        "data.jsonl",
        "deep.json",
        "embeddings.json",
        "llm-trace.json",
        "unicode.json",
        "wide.json",
      ].sort(),
    );
  });
});

describe("generators are deterministic", () => {
  it.each([
    ["deep", () => deepJson()],
    ["wide", () => wideJson(500)],
    ["big", () => bigJson(100_000)],
    ["jsonl", () => dataJsonl(500)],
    ["embeddings", () => embeddingsJson(3)],
  ])("%s produces identical output twice", (_, make) => {
    expect(text(make())).toBe(text(make()));
  });
});

describe("deep.json", () => {
  it(`nests ${DEEP_LEVELS} levels and parses`, () => {
    expect(maxDepth(deepRaw)).toBe(DEEP_LEVELS);
    const result = parseJson(deepRaw);
    expect(result.ok).toBe(true);
    // 500 containers + one number per container + the "bottom" leaf.
    if (result.ok) expect(result.nodeCount).toBe(2 * DEEP_LEVELS + 1);
  });
});

describe("bigint.json", () => {
  it("keeps every unsafe number exactly through parse and minify", () => {
    const minified = minifyJson(bigintRaw);
    expect(minified.ok).toBe(true);
    if (!minified.ok) return;
    for (const literal of BIGINT_LITERALS) expect(minified.text).toContain(literal);
    expect(minified.text).toContain("12345678901234567899");
  });

  it("actually needs lossless parsing (JSON.parse loses digits)", () => {
    const lossy = JSON.stringify(JSON.parse(bigintRaw));
    expect(lossy).not.toContain("12345678901234567890");
    const lossless = parse(bigintRaw) as { edge_cases: Record<string, unknown> };
    expect(isLosslessNumber(lossless.edge_cases.int64_max)).toBe(true);
    expect(String(lossless.edge_cases.int64_max)).toBe("9223372036854775807");
  });
});

describe("unicode.json", () => {
  it("parses and survives a minify round trip", () => {
    const minified = minifyJson(unicodeRaw);
    expect(minified.ok).toBe(true);
    if (!minified.ok) return;
    expect(JSON.parse(minified.text)).toEqual(JSON.parse(unicodeRaw));
  });

  it("contains the tricky cases", () => {
    const value = JSON.parse(unicodeRaw) as Record<string, string>;
    expect(value.null_char).toBe("before\u0000after");
    expect(value.zwj_family).toBe("👨‍👩‍👧‍👦");
    expect(value.lone_surrogate).toBe("\ud800");
    expect(value[""]).toBe("empty key");
    expect(value["a.b"]).toBeDefined();
    expect(value['quote"key']).toBeDefined();
  });
});

describe("bad.json", () => {
  it("fails at the documented line and column", () => {
    expect(BAD_JSON_ERROR).toEqual({ line: 18, column: 5 });
    const result = parseJson(badRaw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject(BAD_JSON_ERROR);
    expect(text(badJson())).toBe(badRaw);
  });
});

describe("data.jsonl", () => {
  it("has one record per line and breaks exactly the documented lines", () => {
    const lines = text(dataJsonl(1_300)).split("\n");
    expect(lines.pop()).toBe("");
    expect(lines).toHaveLength(1_300);
    const broken = lines.flatMap((line, i) => (parseJson(line).ok ? [] : [i + 1]));
    expect(broken).toEqual([1_234]);
  });

  it("documents three malformed lines within 100k", () => {
    expect(JSONL_MALFORMED_LINES.map((m) => m.line)).toEqual([1_234, 50_000, 99_999]);
  });
});

describe("big and wide generators", () => {
  it("bigJson stops just past the target size with valid records", () => {
    const json = text(bigJson(200_000));
    expect(json.length).toBeGreaterThanOrEqual(200_000);
    expect(json.length).toBeLessThan(205_000);
    const records = JSON.parse(json) as { _id: { $oid: string } }[];
    expect(records[0]._id.$oid).toMatch(/^[0-9a-f]{24}$/);
  });

  it("wideJson emits the requested number of objects", () => {
    expect(JSON.parse(text(wideJson(1_000)))).toHaveLength(1_000);
  });
});

describe("embeddings.json", () => {
  it(`emits ${EMBEDDING_DIM}-dim unit vectors`, () => {
    const response = JSON.parse(text(embeddingsJson(3))) as {
      data: { embedding: number[]; bbox: number[] }[];
    };
    expect(response.data).toHaveLength(3);
    for (const { embedding, bbox } of response.data) {
      expect(embedding).toHaveLength(EMBEDDING_DIM);
      expect(Math.hypot(...embedding)).toBeCloseTo(1, 3);
      expect(bbox).toHaveLength(4);
    }
  });
});

describe("llm-trace.json", () => {
  it("has messages, tool calls and usage in both styles", () => {
    const trace = JSON.parse(text(llmTraceJson()));
    const chat = trace.chat_completions;
    expect(chat.request.messages.map((m: { role: string }) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
    ]);
    expect(chat.request.messages[2].tool_calls[0].function.name).toBe("get_weather");
    expect(chat.response.usage.total_tokens).toBe(201);
    const blocks = trace.messages.request.messages.flatMap((m: { content: { type: string }[] }) =>
      m.content.map((c) => c.type),
    );
    expect(blocks).toEqual(["text", "text", "tool_use", "tool_result"]);
    expect(trace.messages.response.usage.cache_read_input_tokens).toBe(256);
  });
});

describe("unicodeJson / bigintJson exports", () => {
  it("are single-chunk files ending in a newline", () => {
    expect(text(unicodeJson()).endsWith("}\n")).toBe(true);
    expect(text(bigintJson()).endsWith("}\n")).toBe(true);
  });
});
