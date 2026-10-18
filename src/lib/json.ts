import { isLosslessNumber, parse, stringify } from "lossless-json";

import { type JsonErrorInfo, toJsonError } from "./errors";

export type ParseResult =
  | { ok: true; value: unknown; nodeCount: number; parseMs: number }
  | { ok: false; error: JsonErrorInfo };

export type FormatResult =
  | { ok: true; text: string; nodeCount: number; parseMs: number }
  | { ok: false; error: JsonErrorInfo };

/**
 * Parses with lossless-json so numbers keep their exact source text
 * (big integers, trailing zeros, exponents) through beautify/minify.
 */
export function parseJson(text: string): ParseResult {
  const start = performance.now();
  try {
    const value = parse(text);
    const parseMs = performance.now() - start;
    return { ok: true, value, nodeCount: countNodes(value), parseMs };
  } catch (err) {
    return { ok: false, error: toJsonError(err, text) };
  }
}

/** Re-serializes `text` with `indent` (spaces or a string like "\t"); 0 means fully compact. */
export function formatJson(text: string, indent: number | string): FormatResult {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const out = stringify(parsed.value, null, indent) ?? "";
  return { ok: true, text: out, nodeCount: parsed.nodeCount, parseMs: parsed.parseMs };
}

export const beautifyJson = (text: string) => formatJson(text, 2);
export const minifyJson = (text: string) => formatJson(text, 0);

/** Counts every value (containers and primitives) iteratively, so deep nesting can't overflow the stack. */
export function countNodes(root: unknown): number {
  let count = 0;
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    count++;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) stack.push(value[i]);
    } else if (value !== null && typeof value === "object" && !isLosslessNumber(value)) {
      for (const key in value) stack.push((value as Record<string, unknown>)[key]);
    }
  }
  return count;
}
