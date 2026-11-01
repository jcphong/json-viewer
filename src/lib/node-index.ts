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

export interface NodeIndex {
  text: string;
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
}

export type IndexResult = { ok: true; index: NodeIndex } | { ok: false; error: JsonErrorInfo };

class SyntaxErrorAt extends Error {}

const describe = (text: string, pos: number) =>
  pos >= text.length ? "reached end of input" : `got '${text[pos]}'`;

function fail(text: string, pos: number, expected: string): never {
  throw new SyntaxErrorAt(`${expected} but ${describe(text, pos)} at position ${pos}`);
}

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

/**
 * Builds the index, or returns a located syntax error.
 * `onProgress(fraction)` is called about every 1M characters.
 */
export function buildIndex(text: string, onProgress?: (fraction: number) => void): IndexResult {
  let capacity = Math.max(1024, text.length >> 3);
  let parent = new Int32Array(capacity);
  let subtreeEnd = new Int32Array(capacity);
  let depth = new Uint16Array(capacity);
  let type = new Uint8Array(capacity);
  let childCount = new Int32Array(capacity);
  let key = new Int32Array(capacity);
  let start = new Int32Array(capacity);
  let count = 0;

  const grow = () => {
    capacity *= 2;
    const resize = <T extends Int32Array | Uint16Array | Uint8Array>(
      a: T,
      make: (n: number) => T,
    ) => {
      const next = make(capacity);
      next.set(a);
      return next;
    };
    parent = resize(parent, (n) => new Int32Array(n));
    subtreeEnd = resize(subtreeEnd, (n) => new Int32Array(n));
    depth = resize(depth, (n) => new Uint16Array(n));
    type = resize(type, (n) => new Uint8Array(n));
    childCount = resize(childCount, (n) => new Int32Array(n));
    key = resize(key, (n) => new Int32Array(n));
    start = resize(start, (n) => new Int32Array(n));
  };

  const stack: number[] = [];

  const addNode = (nodeType: number, keyOffset: number, at: number): number => {
    if (count === capacity) grow();
    const id = count++;
    const p = stack.length ? stack[stack.length - 1] : -1;
    parent[id] = p;
    depth[id] = stack.length;
    type[id] = nodeType;
    start[id] = at;
    if (p >= 0) {
      key[id] = type[p] === ARRAY ? -(childCount[p] + 1) : keyOffset;
      childCount[p]++;
    } else key[id] = -1;
    subtreeEnd[id] = id + 1;
    return id;
  };

  const open = (id: number, at: number) => {
    if (stack.length >= MAX_DEPTH) fail(text, at, `Nesting deeper than ${MAX_DEPTH} levels`);
    stack.push(id);
  };

  const readKey = (at: number): [keyOffset: number, next: number] => {
    if (text.charCodeAt(at) !== 34) fail(text, at, "Quoted object key expected");
    let pos = skipWhitespace(text, scanString(text, at));
    if (text.charCodeAt(pos) !== 58) fail(text, pos, "Colon ':' expected after property name");
    pos = skipWhitespace(text, pos + 1);
    return [at, pos];
  };

  let pos = skipWhitespace(text, 0);
  let expectValue = true;
  let pendingKey = -1;
  let nextProgress = PROGRESS_STEP;

  try {
    for (;;) {
      if (expectValue) {
        const c = text.charCodeAt(pos);
        if (c === 123) {
          const id = addNode(OBJECT, pendingKey, pos);
          open(id, pos);
          pos = skipWhitespace(text, pos + 1);
          if (text.charCodeAt(pos) === 125) {
            stack.pop();
            subtreeEnd[id] = count;
            pos++;
            expectValue = false;
          } else [pendingKey, pos] = readKey(pos);
          continue;
        }
        if (c === 91) {
          const id = addNode(ARRAY, pendingKey, pos);
          open(id, pos);
          pos = skipWhitespace(text, pos + 1);
          if (text.charCodeAt(pos) === 93) {
            stack.pop();
            subtreeEnd[id] = count;
            pos++;
            expectValue = false;
          }
          pendingKey = -1;
          continue;
        }
        if (c === 34) {
          addNode(STRING, pendingKey, pos);
          pos = scanString(text, pos);
        } else if (c === 45 || isDigit(c)) {
          addNode(NUMBER, pendingKey, pos);
          pos = scanNumber(text, pos);
        } else if (c === 116 && text.startsWith("true", pos)) {
          addNode(BOOLEAN, pendingKey, pos);
          pos += 4;
        } else if (c === 102 && text.startsWith("false", pos)) {
          addNode(BOOLEAN, pendingKey, pos);
          pos += 5;
        } else if (c === 110 && text.startsWith("null", pos)) {
          addNode(NULL, pendingKey, pos);
          pos += 4;
        } else fail(text, pos, "JSON value expected");
        expectValue = false;
        if (onProgress && pos >= nextProgress) {
          onProgress(pos / text.length);
          nextProgress = pos + PROGRESS_STEP;
        }
        continue;
      }

      pos = skipWhitespace(text, pos);
      if (stack.length === 0) {
        if (pos < text.length) fail(text, pos, "Expected end of input");
        break;
      }
      const top = stack[stack.length - 1];
      const c = text.charCodeAt(pos);
      const isObject = type[top] === OBJECT;
      if (c === 44) {
        pos = skipWhitespace(text, pos + 1);
        if (isObject) [pendingKey, pos] = readKey(pos);
        else pendingKey = -1;
        expectValue = true;
      } else if ((isObject && c === 125) || (!isObject && c === 93)) {
        stack.pop();
        subtreeEnd[top] = count;
        pos++;
      } else if (isObject) {
        fail(text, pos, "Comma ',' or end of object '}' expected after property value");
      } else fail(text, pos, "Comma ',' or end of array ']' expected after array item");
    }
  } catch (err) {
    if (err instanceof SyntaxErrorAt) return { ok: false, error: toJsonError(err, text) };
    throw err;
  }

  onProgress?.(1);
  return {
    ok: true,
    index: {
      text,
      count,
      parent: parent.slice(0, count),
      subtreeEnd: subtreeEnd.slice(0, count),
      depth: depth.slice(0, count),
      type: type.slice(0, count),
      childCount: childCount.slice(0, count),
      key: key.slice(0, count),
      start: start.slice(0, count),
    },
  };
}

/** Offset just past the value of `id` (containers: scans to the matching bracket). */
export function valueEnd(index: NodeIndex, id: number): number {
  const { text } = index;
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
