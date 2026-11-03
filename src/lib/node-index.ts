/**
 * Compact, lossless index of a JSON document (PLAN.md §3 "Node index").
 *
 * One iterative pass over the text (no recursion, so 500+ levels are fine)
 * validates the JSON and records every value as a node, in preorder, in
 * typed arrays. Nothing is materialized: keys, strings and numbers stay as
 * offsets into the source text and are decoded only for the rows on screen,
 * so numbers keep their exact digits and memory stays ~23 bytes per node.
 */
import type { JsonErrorInfo } from "./errors";
import { toJsonError } from "./errors";

export const OBJECT = 0;
export const ARRAY = 1;
export const STRING = 2;
export const NUMBER = 3;
export const BOOLEAN = 4;
export const NULL = 5;

export type NodeType = "object" | "array" | "string" | "number" | "boolean" | "null";
export const TYPE_NAMES: readonly NodeType[] = [
  "object",
  "array",
  "string",
  "number",
  "boolean",
  "null",
];

export const MAX_DEPTH = 0xffff;

export type DocumentFormat = "json" | "jsonl";

/** A malformed JSONL line (the line is skipped; the rest of the file still loads). */
export type LineError = JsonErrorInfo;

/** Line errors kept per document; the total count is always exact. */
export const MAX_LINE_ERRORS = 1000;

export interface NodeIndex {
  text: string;
  /**
   * "jsonl": node 0 is a synthetic array whose children are the values of the
   * valid lines; their `key` encodes the 1-based line number as -(line).
   */
  format: DocumentFormat;
  /** Number of nodes; node 0 is the root. */
  count: number;
  parent: Int32Array;
  /** First node id after this node's subtree (preorder), i.e. the next sibling or an ancestor's. */
  subtreeEnd: Int32Array;
  depth: Uint16Array;
  type: Uint8Array;
  /** Number of direct children (containers only). */
  childCount: Int32Array;
  /** ≥ 0: offset of the key's opening quote; < 0: array index encoded as -(index + 1). */
  key: Int32Array;
  /** Offset of the value's first character. */
  start: Int32Array;
  /** JSONL only: non-blank lines, malformed lines (exact count) and the first MAX_LINE_ERRORS of them. */
  lines: number;
  malformedLines: number;
  lineErrors: LineError[];
}

export type IndexResult = { ok: true; index: NodeIndex } | { ok: false; error: JsonErrorInfo };

/** Thrown while parsing; `pos` is relative to the string being parsed. */
class SyntaxErrorAt extends Error {
  readonly pos: number;

  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

const describe = (text: string, pos: number) =>
  pos >= text.length ? "reached end of input" : `got '${text[pos]}'`;

function fail(text: string, pos: number, expected: string): never {
  throw new SyntaxErrorAt(`${expected} but ${describe(text, pos)}`, pos);
}

/** Locates a parse error in the full document text. */
const located = (err: SyntaxErrorAt, fullText: string, base: number) =>
  toJsonError(new Error(`${err.message} at position ${base + err.pos}`), fullText);

function skipWhitespace(text: string, pos: number): number {
  for (;;) {
    const c = text.charCodeAt(pos);
    if (c === 32 || c === 10 || c === 13 || c === 9) pos++;
    else return pos;
  }
}

const isHex = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

/** `pos` is at the opening quote; returns the offset just past the closing quote. */
export function scanString(text: string, pos: number): number {
  let i = pos + 1;
  for (;;) {
    const c = text.charCodeAt(i);
    if (c === 34) return i + 1;
    if (c === 92) {
      const e = text.charCodeAt(i + 1);
      if (e === 117) {
        for (let k = 2; k < 6; k++) {
          if (!isHex(text.charCodeAt(i + k))) fail(text, i + k, "Hexadecimal digit expected");
        }
        i += 6;
      } else if (
        e === 34 ||
        e === 92 ||
        e === 47 ||
        e === 98 ||
        e === 102 ||
        e === 110 ||
        e === 114 ||
        e === 116
      ) {
        i += 2;
      } else fail(text, i + 1, "Valid escape character expected");
    } else if (Number.isNaN(c)) fail(text, i, "End of string '\"' expected");
    else if (c < 0x20) fail(text, i, "Invalid control character in string");
    else i++;
  }
}

const isDigit = (c: number) => c >= 48 && c <= 57;

/** Returns the offset just past the number starting at `pos`. */
export function scanNumber(text: string, pos: number): number {
  let i = pos;
  if (text.charCodeAt(i) === 45) i++;
  const first = text.charCodeAt(i);
  if (first === 48) i++;
  else if (first >= 49 && first <= 57) while (isDigit(text.charCodeAt(i))) i++;
  else fail(text, i, "Digit expected");
  if (text.charCodeAt(i) === 46) {
    i++;
    if (!isDigit(text.charCodeAt(i))) fail(text, i, "Digit expected after decimal point");
    while (isDigit(text.charCodeAt(i))) i++;
  }
  const e = text.charCodeAt(i);
  if (e === 101 || e === 69) {
    i++;
    const sign = text.charCodeAt(i);
    if (sign === 43 || sign === 45) i++;
    if (!isDigit(text.charCodeAt(i))) fail(text, i, "Digit expected in exponent");
    while (isDigit(text.charCodeAt(i))) i++;
  }
  return i;
}

const PROGRESS_STEP = 1 << 20;

/** Growable typed arrays for the node index. */
class IndexBuilder {
  capacity: number;
  count = 0;
  parent: Int32Array;
  subtreeEnd: Int32Array;
  depth: Uint16Array;
  type: Uint8Array;
  childCount: Int32Array;
  key: Int32Array;
  start: Int32Array;

  constructor(textLength: number) {
    this.capacity = Math.max(1024, textLength >> 3);
    this.parent = new Int32Array(this.capacity);
    this.subtreeEnd = new Int32Array(this.capacity);
    this.depth = new Uint16Array(this.capacity);
    this.type = new Uint8Array(this.capacity);
    this.childCount = new Int32Array(this.capacity);
    this.key = new Int32Array(this.capacity);
    this.start = new Int32Array(this.capacity);
  }

  private grow() {
    this.capacity *= 2;
    const grown = <T extends Int32Array | Uint16Array | Uint8Array>(a: T, next: T) => {
      next.set(a);
      return next;
    };
    const n = this.capacity;
    this.parent = grown(this.parent, new Int32Array(n));
    this.subtreeEnd = grown(this.subtreeEnd, new Int32Array(n));
    this.depth = grown(this.depth, new Uint16Array(n));
    this.type = grown(this.type, new Uint8Array(n));
    this.childCount = grown(this.childCount, new Int32Array(n));
    this.key = grown(this.key, new Int32Array(n));
    this.start = grown(this.start, new Int32Array(n));
  }

  add(nodeType: number, parent: number, depth: number, key: number, at: number): number {
    if (this.count === this.capacity) this.grow();
    const id = this.count++;
    this.parent[id] = parent;
    this.depth[id] = depth;
    this.type[id] = nodeType;
    this.key[id] = key;
    this.start[id] = at;
    this.childCount[id] = 0;
    this.subtreeEnd[id] = id + 1;
    if (parent >= 0) this.childCount[parent]++;
    return id;
  }

  /** Drops nodes added after `count` (a malformed JSONL line). */
  rollback(count: number, parent: number) {
    if (this.count > count && parent >= 0) this.childCount[parent]--;
    this.count = count;
  }

  finish(
    text: string,
    format: DocumentFormat,
    jsonl?: Pick<NodeIndex, "lines" | "malformedLines" | "lineErrors">,
  ): NodeIndex {
    const n = this.count;
    return {
      text,
      format,
      count: n,
      parent: this.parent.slice(0, n),
      subtreeEnd: this.subtreeEnd.slice(0, n),
      depth: this.depth.slice(0, n),
      type: this.type.slice(0, n),
      childCount: this.childCount.slice(0, n),
      key: this.key.slice(0, n),
      start: this.start.slice(0, n),
      lines: jsonl?.lines ?? 0,
      malformedLines: jsonl?.malformedLines ?? 0,
      lineErrors: jsonl?.lineErrors ?? [],
    };
  }
}

interface ValueRoot {
  /** Parent of the top-level value (-1 for a JSON document, 0 for a JSONL line). */
  parent: number;
  depth: number;
  /** Key stored for the top-level value. */
  key: number;
  /** What must follow the value ("input" for a document, "line" for JSONL). */
  endLabel: string;
}

/**
 * Parses exactly one JSON value spanning all of `src` (surrounding whitespace
 * allowed) into the builder, iteratively. Offsets are stored as `base + pos`.
 * Throws SyntaxErrorAt with a position relative to `src`.
 */
function parseValue(
  b: IndexBuilder,
  src: string,
  base: number,
  root: ValueRoot,
  progress?: (offset: number) => void,
): void {
  const stack: number[] = [];

  const addNode = (nodeType: number, keyOffset: number, at: number): number => {
    if (stack.length === 0) return b.add(nodeType, root.parent, root.depth, root.key, base + at);
    const p = stack[stack.length - 1];
    const key = b.type[p] === ARRAY ? -(b.childCount[p] + 1) : base + keyOffset;
    return b.add(nodeType, p, root.depth + stack.length, key, base + at);
  };

  const open = (id: number, at: number) => {
    if (root.depth + stack.length >= MAX_DEPTH) {
      fail(src, at, `Nesting deeper than ${MAX_DEPTH} levels`);
    }
    stack.push(id);
  };

  const readKey = (at: number): [keyOffset: number, next: number] => {
    if (src.charCodeAt(at) !== 34) fail(src, at, "Quoted object key expected");
    let pos = skipWhitespace(src, scanString(src, at));
    if (src.charCodeAt(pos) !== 58) fail(src, pos, "Colon ':' expected after property name");
    pos = skipWhitespace(src, pos + 1);
    return [at, pos];
  };

  let pos = skipWhitespace(src, 0);
  let expectValue = true;
  let pendingKey = -1;
  let nextProgress = PROGRESS_STEP;

  for (;;) {
    if (expectValue) {
      const c = src.charCodeAt(pos);
      if (c === 123) {
        const id = addNode(OBJECT, pendingKey, pos);
        open(id, pos);
        pos = skipWhitespace(src, pos + 1);
        if (src.charCodeAt(pos) === 125) {
          stack.pop();
          b.subtreeEnd[id] = b.count;
          pos++;
          expectValue = false;
        } else [pendingKey, pos] = readKey(pos);
        continue;
      }
      if (c === 91) {
        const id = addNode(ARRAY, pendingKey, pos);
        open(id, pos);
        pos = skipWhitespace(src, pos + 1);
        if (src.charCodeAt(pos) === 93) {
          stack.pop();
          b.subtreeEnd[id] = b.count;
          pos++;
          expectValue = false;
        }
        pendingKey = -1;
        continue;
      }
      if (c === 34) {
        addNode(STRING, pendingKey, pos);
        pos = scanString(src, pos);
      } else if (c === 45 || isDigit(c)) {
        addNode(NUMBER, pendingKey, pos);
        pos = scanNumber(src, pos);
      } else if (c === 116 && src.startsWith("true", pos)) {
        addNode(BOOLEAN, pendingKey, pos);
        pos += 4;
      } else if (c === 102 && src.startsWith("false", pos)) {
        addNode(BOOLEAN, pendingKey, pos);
        pos += 5;
      } else if (c === 110 && src.startsWith("null", pos)) {
        addNode(NULL, pendingKey, pos);
        pos += 4;
      } else fail(src, pos, "JSON value expected");
      expectValue = false;
      if (progress && pos >= nextProgress) {
        progress(base + pos);
        nextProgress = pos + PROGRESS_STEP;
      }
      continue;
    }

    pos = skipWhitespace(src, pos);
    if (stack.length === 0) {
      if (pos < src.length) fail(src, pos, `Expected end of ${root.endLabel}`);
      return;
    }
    const top = stack[stack.length - 1];
    const c = src.charCodeAt(pos);
    const isObject = b.type[top] === OBJECT;
    if (c === 44) {
      pos = skipWhitespace(src, pos + 1);
      if (isObject) [pendingKey, pos] = readKey(pos);
      else pendingKey = -1;
      expectValue = true;
    } else if ((isObject && c === 125) || (!isObject && c === 93)) {
      stack.pop();
      b.subtreeEnd[top] = b.count;
      pos++;
    } else if (isObject) {
      fail(src, pos, "Comma ',' or end of object '}' expected after property value");
    } else fail(src, pos, "Comma ',' or end of array ']' expected after array item");
  }
}

/**
 * Builds the index of a JSON document, or returns a located syntax error.
 * `onProgress(fraction)` is called about every 1M characters.
 */
export function buildIndex(text: string, onProgress?: (fraction: number) => void): IndexResult {
  const b = new IndexBuilder(text.length);
  try {
    parseValue(
      b,
      text,
      0,
      { parent: -1, depth: 0, key: -1, endLabel: "input" },
      onProgress && ((offset) => onProgress(offset / text.length)),
    );
  } catch (err) {
    if (err instanceof SyntaxErrorAt) return { ok: false, error: located(err, text, 0) };
    throw err;
  }
  onProgress?.(1);
  return { ok: true, index: b.finish(text, "json") };
}

/**
 * Builds the index of a JSON Lines document: one value per non-blank line,
 * under a synthetic root array. Malformed lines are recorded and skipped, so
 * this never fails.
 */
export function buildJsonlIndex(text: string, onProgress?: (fraction: number) => void): NodeIndex {
  const b = new IndexBuilder(text.length);
  b.add(ARRAY, -1, 0, -1, 0);
  const lineErrors: LineError[] = [];
  let lines = 0;
  let malformedLines = 0;
  let nextProgress = PROGRESS_STEP;

  for (let lineStart = 0, lineNo = 1; lineStart <= text.length; lineNo++) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    const contentEnd =
      lineEnd > lineStart && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
    const line = text.slice(lineStart, contentEnd);
    if (line.trim() !== "") {
      lines++;
      const before = b.count;
      try {
        parseValue(b, line, lineStart, { parent: 0, depth: 1, key: -lineNo, endLabel: "line" });
      } catch (err) {
        if (!(err instanceof SyntaxErrorAt)) throw err;
        b.rollback(before, 0);
        malformedLines++;
        if (lineErrors.length < MAX_LINE_ERRORS) lineErrors.push(located(err, text, lineStart));
      }
    }
    if (onProgress && lineEnd >= nextProgress) {
      onProgress(lineEnd / Math.max(1, text.length));
      nextProgress = lineEnd + PROGRESS_STEP;
    }
    lineStart = lineEnd + 1;
  }
  b.subtreeEnd[0] = b.count;
  onProgress?.(1);
  return b.finish(text, "jsonl", { lines, malformedLines, lineErrors });
}

const JSONL_NAME = /\.(jsonl|ndjson)$/i;

/** `.jsonl` / `.ndjson` file names. */
export const isJsonlName = (name: string) => JSONL_NAME.test(name);

/**
 * Picks JSON or JSONL: by file extension, else JSON unless parsing stops with
 * "Expected end of input" at a value on a later line (the JSONL signature).
 */
export function buildIndexAuto(
  text: string,
  name: string,
  onProgress?: (fraction: number) => void,
): IndexResult {
  if (isJsonlName(name)) return { ok: true, index: buildJsonlIndex(text, onProgress) };
  const json = buildIndex(text, onProgress);
  if (json.ok || !looksLikeJsonl(text, json.error)) return json;
  return { ok: true, index: buildJsonlIndex(text, onProgress) };
}

/** True when a JSON parse error is "a second value starts on a later line". */
export function looksLikeJsonl(text: string, error: JsonErrorInfo): boolean {
  return (
    error.message.startsWith("Expected end of input") &&
    text.lastIndexOf("\n", error.position) !== -1
  );
}

/** Offset just past the value of `id` (containers: scans to the matching bracket). */
export function valueEnd(index: NodeIndex, id: number): number {
  const { text } = index;
  if (id === 0 && index.format === "jsonl") return text.length;
  const at = index.start[id];
  switch (index.type[id]) {
    case STRING:
      return scanString(text, at);
    case NUMBER:
      return scanNumber(text, at);
    case BOOLEAN:
      return at + (text.charCodeAt(at) === 116 ? 4 : 5);
    case NULL:
      return at + 4;
  }
  let level = 0;
  for (let i = at; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) i = scanString(text, i) - 1;
    else if (c === 123 || c === 91) level++;
    else if (c === 125 || c === 93) {
      level--;
      if (level === 0) return i + 1;
    }
  }
  return text.length;
}
