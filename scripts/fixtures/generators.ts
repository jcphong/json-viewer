/**
 * Deterministic test fixtures (PLAN.md task 0.3). Each generator yields the
 * file contents in chunks, so the CLI can stream 200 MB to disk without
 * holding it in memory, and tests can join the chunks of the small ones.
 *
 * Pure: no Node APIs (see scripts/gen-fixtures.ts for the file writing).
 * Big generators only emit ASCII, so string length equals byte length.
 */
import { Rng, seedFor } from "./random.ts";

const MiB = 1024 * 1024;
const BASE_TIME = Date.UTC(2024, 0, 1);
const YEAR_MS = 365 * 24 * 3600 * 1000;

const FIRST = ["Ada", "Linh", "Mateo", "Priya", "Kenji", "Amara", "Noah", "Sofia", "Omar", "Ivy"];
const LAST = ["Nguyen", "Garcia", "Okafor", "Tanaka", "Novak", "Silva", "Khan", "Berg", "Moreau"];
const CITIES = ["Hanoi", "Lisbon", "Nairobi", "Osaka", "Toronto", "Berlin", "Lima", "Pune", "Oslo"];
const WORDS = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
  "enim",
];
const TAGS = ["alpha", "beta", "gamma", "delta", "prod", "staging", "eu", "us", "vip", "trial"];

const iso = (rng: Rng) => new Date(BASE_TIME + rng.int(0, YEAR_MS)).toISOString();
const words = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.pick(WORDS)).join(" ");
const objectId = (rng: Rng) => rng.hex(24);
const round = (value: number, digits: number) => Number(value.toFixed(digits));

// ---------------------------------------------------------------------------
// deep.json: 500 levels of nesting, alternating objects and arrays.

export const DEEP_LEVELS = 500;

export function* deepJson(levels = DEEP_LEVELS): Generator<string> {
  const open: string[] = [];
  const close: string[] = [];
  for (let level = 1; level <= levels; level++) {
    if (level % 2 === 1) {
      open.push(`{"depth":${level},"child":`);
      close.push("}");
    } else {
      open.push(`[${level},`);
      close.push("]");
    }
  }
  yield open.join("");
  yield '"bottom"';
  yield `${close.reverse().join("")}\n`;
}

// ---------------------------------------------------------------------------
// wide.json: an array of 200k small objects, one per line.

export function* wideJson(count = 200_000): Generator<string> {
  const rng = new Rng(seedFor("wide.json"));
  yield "[\n";
  for (let i = 0; i < count; i++) {
    const item = {
      id: i,
      name: `item-${i}`,
      value: round(rng.next() * 1000, 4),
      active: rng.bool(0.7),
      category: rng.pick(TAGS),
    };
    yield `${i ? ",\n" : ""}${JSON.stringify(item)}`;
  }
  yield "\n]\n";
}

// ---------------------------------------------------------------------------
// big-50mb.json / big-200mb.json: realistic API records until the target size.

function bigRecord(rng: Rng, index: number) {
  const first = rng.pick(FIRST);
  const last = rng.pick(LAST);
  return {
    _id: { $oid: objectId(rng) },
    index,
    guid: `${rng.hex(8)}-${rng.hex(4)}-4${rng.hex(3)}-${rng.hex(4)}-${rng.hex(12)}`,
    isActive: rng.bool(),
    balance: round(rng.next() * 10_000, 2),
    age: rng.int(18, 90),
    name: `${first} ${last}`,
    email: `${first}.${last}${index}@example.com`.toLowerCase(),
    phone: `+1 (${rng.int(200, 999)}) ${rng.int(200, 999)}-${rng.int(1000, 9999)}`,
    address: {
      street: `${rng.int(1, 9999)} ${rng.pick(WORDS)} street`,
      city: rng.pick(CITIES),
      zip: String(rng.int(10000, 99999)),
      geo: { lat: round(rng.next() * 180 - 90, 6), lng: round(rng.next() * 360 - 180, 6) },
    },
    about: words(rng, 30),
    registered: iso(rng),
    tags: Array.from({ length: 5 }, () => rng.pick(TAGS)),
    friends: Array.from({ length: 3 }, (_, id) => ({
      id,
      name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
    })),
    scores: Array.from({ length: 8 }, () => round(rng.next(), 4)),
    manager: rng.bool(0.2) ? null : { id: rng.int(1, 5000), name: rng.pick(FIRST) },
  };
}

export function* bigJson(targetBytes: number, name = "big.json"): Generator<string> {
  const rng = new Rng(seedFor(name));
  let bytes = 2;
  yield "[\n";
  for (let index = 0; bytes < targetBytes; index++) {
    const chunk = `${index ? ",\n" : ""}${JSON.stringify(bigRecord(rng, index))}`;
    bytes += chunk.length;
    yield chunk;
  }
  yield "\n]\n";
}

// ---------------------------------------------------------------------------
// bigint.json: integers and decimals that lose precision as JS numbers.

/** Number literals in bigint.json that must survive parse → format exactly. */
export const BIGINT_LITERALS = [
  "12345678901234567890",
  "9007199254740993",
  "9223372036854775807",
  "-9223372036854775808",
  "18446744073709551615",
  "123456789012345678901234567890",
  "0.1000000000000000055511151231257827021181583404541015625",
  "1.10",
  "1e400",
  "1e-400",
  "-0.0",
  "6.02E+23",
] as const;

export function* bigintJson(): Generator<string> {
  const base = 12345678901234567890n;
  const ids = Array.from({ length: 10 }, (_, i) => String(base + BigInt(i)));
  const records = Array.from({ length: 20 }, (_, i) => {
    const id = base + BigInt(i * 7);
    return `    { "id": ${id}, "parent_id": ${id - 1n}, "amount_minor": ${9007199254740993n + BigInt(i)}, "ratio": 0.${String(i).padStart(2, "0")}0000000000000000001 }`;
  });
  yield `{
  "description": "Numbers that JSON.parse cannot represent exactly; a lossless viewer must show these digits unchanged.",
  "ids": [${ids.join(", ")}],
  "records": [
${records.join(",\n")}
  ],
  "edge_cases": {
    "max_safe_integer": 9007199254740991,
    "max_safe_plus_one": 9007199254740992,
    "max_safe_plus_two": 9007199254740993,
    "int64_max": 9223372036854775807,
    "int64_min": -9223372036854775808,
    "uint64_max": 18446744073709551615,
    "huge": 123456789012345678901234567890,
    "precise_decimal": 0.1000000000000000055511151231257827021181583404541015625,
    "trailing_zero": 1.10,
    "overflow": 1e400,
    "underflow": 1e-400,
    "negative_zero": -0.0,
    "exponent_upper": 6.02E+23
  }
}
`;
}

// ---------------------------------------------------------------------------
// unicode.json: emoji, RTL, combining marks, escapes, odd keys.

/** [raw JSON key, raw JSON value] pairs; written verbatim so escapes stay as authored. */
const UNICODE_ENTRIES: [string, string][] = [
  ['"emoji"', '"😀 🎉 🚀 ❤️ 🧪"'],
  ['"zwj_family"', '"👨‍👩‍👧‍👦"'],
  ['"flags"', '"🇻🇳 🇯🇵 🇧🇷 🇺🇳"'],
  ['"skin_tones"', '"👋🏻 👋🏽 👋🏿"'],
  ['"arabic"', '"مرحبا بالعالم"'],
  ['"hebrew"', '"שלום עולם"'],
  ['"mixed_bidi"', '"order 123 הזמנה 456 done"'],
  ['"vietnamese"', '"Tiếng Việt có dấu: bần nông, nghiêng"'],
  ['"cjk"', '"日本語 中文 한국어"'],
  ['"combining"', String.raw`"e\u0301 vs \u00e9 (decomposed vs precomposed)"`],
  ['"escaped_unicode"', String.raw`"\u00e9 \u4e2d \ud83d\ude00"`],
  ['"null_char"', String.raw`"before\u0000after"`],
  ['"control_chars"', String.raw`"tab:\t newline:\n cr:\r backspace:\b formfeed:\f"`],
  ['"quotes_and_slashes"', String.raw`"she said \"hi\" \\ C:\\path \/ url"`],
  ['"lone_surrogate"', String.raw`"\ud800"`],
  ['"zero_width"', String.raw`"a\u200bb\u200dc\ufeffd"`],
  ['"line_separators"', String.raw`"LS:\u2028 PS:\u2029"`],
  ['"long_emoji_run"', `"${"🙂".repeat(300)}"`],
  ['""', '"empty key"'],
  ['"a.b"', '"dot in key (path must quote it)"'],
  ['"with space"', '"space in key"'],
  [String.raw`"quote\"key"`, '"quote in key"'],
  ['"$special"', '"dollar key"'],
  ['"123"', '"numeric-looking key"'],
  ['"ключ"', '"Cyrillic key"'],
  ['"🔑"', '"emoji key"'],
];

export function* unicodeJson(): Generator<string> {
  const lines = UNICODE_ENTRIES.map(([key, value]) => `  ${key}: ${value}`);
  yield `{\n${lines.join(",\n")},\n  "nested": [${UNICODE_ENTRIES.slice(0, 6)
    .map(([, value]) => value)
    .join(", ")}]\n}\n`;
}

// ---------------------------------------------------------------------------
// bad.json: a missing comma at a known line and column.

const BAD_LINES = [
  "{",
  '  "service": "checkout",',
  '  "version": "2.4.1",',
  '  "replicas": 3,',
  '  "features": {',
  '    "cart": true,',
  '    "wishlist": false,',
  '    "gift_cards": true',
  "  },",
  '  "regions": ["eu-west-1", "us-east-1", "ap-southeast-1"],',
  '  "limits": {',
  '    "rps": 1200,',
  '    "burst": 300,',
  '    "timeout_ms": 2500',
  "  },",
  '  "database": {',
  '    "port": 5432',
  '    "host": "db.internal",',
  '    "pool": 20',
  "  },",
  '  "owners": ["team-payments"]',
  "}",
];

const badErrorLine = BAD_LINES.findIndex((line) => line.includes('"host"'));

/** Where a parser must report the error in bad.json (1-based; the `"` of `"host"`). */
export const BAD_JSON_ERROR = {
  line: badErrorLine + 1,
  column: BAD_LINES[badErrorLine].indexOf('"') + 1,
} as const;

export function* badJson(): Generator<string> {
  yield `${BAD_LINES.join("\n")}\n`;
}

// ---------------------------------------------------------------------------
// data.jsonl: 100k JSON lines, three of them malformed.

/** 1-based line numbers of the malformed lines in data.jsonl, with the kind of damage. */
export const JSONL_MALFORMED_LINES = [
  { line: 1_234, kind: "truncated" },
  { line: 50_000, kind: "trailing comma" },
  { line: 99_999, kind: "not JSON" },
] as const;

export function* dataJsonl(lines = 100_000): Generator<string> {
  const rng = new Rng(seedFor("data.jsonl"));
  const malformed = new Map<number, string>(JSONL_MALFORMED_LINES.map((m) => [m.line, m.kind]));
  for (let n = 1; n <= lines; n++) {
    const record = {
      id: n,
      ts: iso(rng),
      level: rng.pick(["debug", "info", "info", "info", "warn", "error"]),
      event: rng.pick(["request", "completion", "tool_call", "retry", "cache_hit"]),
      user_id: `u_${rng.hex(8)}`,
      latency_ms: rng.int(5, 4000),
      prompt_tokens: rng.int(10, 8000),
      completion_tokens: rng.int(1, 2000),
      ok: rng.bool(0.95),
      tags: [rng.pick(TAGS), rng.pick(TAGS)],
    };
    const json = JSON.stringify(record);
    const kind = malformed.get(n);
    if (kind === "truncated") yield `${json.slice(0, json.length >> 1)}\n`;
    else if (kind === "trailing comma") yield `${json.slice(0, -1)},}\n`;
    else if (kind === "not JSON")
      yield "ERROR: connection reset by peer (line written by a crashing worker)\n";
    else yield `${json}\n`;
  }
}

// ---------------------------------------------------------------------------
// embeddings.json: an embeddings-API-style response with 1024-dim unit vectors.

export const EMBEDDING_DIM = 1024;

export function* embeddingsJson(count = 1000, dim = EMBEDDING_DIM): Generator<string> {
  const rng = new Rng(seedFor("embeddings.json"));
  yield `{"object":"list","model":"example-embedding-${dim}","data":[\n`;
  for (let index = 0; index < count; index++) {
    const raw = Array.from({ length: dim }, () => rng.gaussian());
    const norm = Math.sqrt(raw.reduce((sum, x) => sum + x * x, 0));
    const record = {
      object: "embedding",
      index,
      id: `doc-${String(index).padStart(5, "0")}`,
      text: words(rng, 12),
      bbox: [
        round(rng.next(), 3),
        round(rng.next(), 3),
        round(rng.next(), 3),
        round(rng.next(), 3),
      ],
      embedding: raw.map((x) => round(x / norm, 6)),
    };
    yield `${index ? ",\n" : ""}${JSON.stringify(record)}`;
  }
  yield `\n],"usage":{"prompt_tokens":${count * 12},"total_tokens":${count * 12}}}\n`;
}

// ---------------------------------------------------------------------------
// llm-trace.json: chat-completions style and messages style traces.

export function* llmTraceJson(): Generator<string> {
  const chatCompletions = {
    request: {
      model: "example-chat-model",
      temperature: 0.2,
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Current weather for a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" }, unit: { enum: ["c", "f"] } },
              required: ["city"],
            },
          },
        },
      ],
      messages: [
        { role: "system", content: "You are a concise travel assistant." },
        { role: "user", content: "Should I bring an umbrella to Hanoi tomorrow?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_01",
              type: "function",
              function: { name: "get_weather", arguments: '{"city":"Hanoi","unit":"c"}' },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_01",
          content: '{"city":"Hanoi","forecast":"rain","high_c":29,"precip_mm":12}',
        },
      ],
    },
    response: {
      id: "chatcmpl-0001",
      object: "chat.completion",
      created: 1735689600,
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: {
            role: "assistant",
            content: "Yes. Rain is expected (about 12 mm), so bring an umbrella.",
          },
        },
      ],
      usage: { prompt_tokens: 182, completion_tokens: 19, total_tokens: 201 },
    },
  };

  const messages = {
    request: {
      model: "example-messages-model",
      max_tokens: 1024,
      system: "You are a careful coding assistant.",
      tools: [
        {
          name: "run_tests",
          description: "Run the project's unit tests",
          input_schema: { type: "object", properties: { path: { type: "string" } } },
        },
      ],
      messages: [
        { role: "user", content: [{ type: "text", text: "Do the tests pass on main?" }] },
        {
          role: "assistant",
          content: [
            { type: "text", text: "I'll run them." },
            { type: "tool_use", id: "toolu_01", name: "run_tests", input: { path: "tests/" } },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01",
              content: "65 passed, 0 failed (2.4s)",
              is_error: false,
            },
          ],
        },
      ],
    },
    response: {
      id: "msg_0001",
      type: "message",
      role: "assistant",
      stop_reason: "end_turn",
      content: [{ type: "text", text: "All 65 tests pass on main." }],
      usage: {
        input_tokens: 412,
        output_tokens: 11,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 256,
      },
    },
  };

  yield `${JSON.stringify({ chat_completions: chatCompletions, messages }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------

export interface FixtureSpec {
  file: string;
  description: string;
  /** Small fixtures are committed; the rest are gitignored and generated locally. */
  small: boolean;
  generate: () => Iterable<string>;
}

export const FIXTURES: FixtureSpec[] = [
  {
    file: "deep.json",
    description: "500 levels of nesting",
    small: true,
    generate: () => deepJson(),
  },
  {
    file: "wide.json",
    description: "array of 200k objects",
    small: false,
    generate: () => wideJson(),
  },
  {
    file: "big-50mb.json",
    description: "~50 MB array of API records",
    small: false,
    generate: () => bigJson(50 * MiB, "big-50mb.json"),
  },
  {
    file: "big-200mb.json",
    description: "~200 MB array of API records",
    small: false,
    generate: () => bigJson(200 * MiB, "big-200mb.json"),
  },
  {
    file: "bigint.json",
    description: "unsafe integers and decimals",
    small: true,
    generate: bigintJson,
  },
  {
    file: "unicode.json",
    description: "emoji, RTL, escapes, \\u0000",
    small: true,
    generate: unicodeJson,
  },
  {
    file: "bad.json",
    description: "syntax error at a known line/column",
    small: true,
    generate: badJson,
  },
  {
    file: "data.jsonl",
    description: "100k JSON lines, 3 malformed",
    small: false,
    generate: () => dataJsonl(),
  },
  {
    file: "embeddings.json",
    description: "1000 records with 1024-dim vectors",
    small: false,
    generate: () => embeddingsJson(),
  },
  {
    file: "llm-trace.json",
    description: "chat traces with tool calls and usage",
    small: true,
    generate: llmTraceJson,
  },
];
