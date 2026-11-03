/**
 * JSON Lines for the editor's text views (≤ 20 MB, main thread). The worker has
 * its own indexer (buildJsonlIndex); this mirrors its rules: one value per
 * non-blank line, malformed lines reported and skipped.
 */
import { parse, stringify } from "lossless-json";

import { type JsonErrorInfo, toJsonError } from "./errors";
import { countNodes } from "./json";

export interface JsonlParse {
  /** Values of the valid lines, in order. */
  values: unknown[];
  /** 1-based line number of each value. */
  lineNumbers: number[];
  /** Non-blank lines. */
  lines: number;
  malformed: number;
  /** Malformed lines, located in the whole text. */
  errors: JsonErrorInfo[];
  nodeCount: number;
  parseMs: number;
}

const POSITION = /\s*at position (\d+)\s*$/;

/** Calls `fn(line, lineStart, lineNo)` for every non-blank line. */
function forEachLine(text: string, fn: (line: string, lineStart: number, lineNo: number) => void) {
  for (let lineStart = 0, lineNo = 1; lineStart <= text.length; lineNo++) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    const end = lineEnd > lineStart && text.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
    const line = text.slice(lineStart, end);
    if (line.trim() !== "") fn(line, lineStart, lineNo);
    lineStart = lineEnd + 1;
  }
}

export function parseJsonl(text: string): JsonlParse {
  const startedAt = performance.now();
  const result: JsonlParse = {
    values: [],
    lineNumbers: [],
    lines: 0,
    malformed: 0,
    errors: [],
    nodeCount: 0,
    parseMs: 0,
  };
  forEachLine(text, (line, lineStart, lineNo) => {
    result.lines++;
    try {
      const value = parse(line);
      result.values.push(value);
      result.lineNumbers.push(lineNo);
      result.nodeCount += countNodes(value);
    } catch (err) {
      result.malformed++;
      const message = err instanceof Error ? err.message : String(err);
      const match = POSITION.exec(message);
      const local = match ? Number(match[1]) : line.length;
      const base = match ? message.slice(0, match.index) : message;
      result.errors.push(toJsonError(new Error(`${base} at position ${lineStart + local}`), text));
    }
  });
  result.parseMs = performance.now() - startedAt;
  return result;
}

/** Minifies every valid line (losslessly). Malformed and blank lines stay, so line numbers don't move. */
export function minifyJsonl(text: string): string {
  return text
    .split("\n")
    .map((raw) => {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (line.trim() === "") return line;
      try {
        return stringify(parse(line)) ?? line;
      } catch {
        return line;
      }
    })
    .join("\n");
}
