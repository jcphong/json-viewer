export interface JsonErrorInfo {
  /** Parser message without the trailing "at position N". */
  message: string;
  /** 0-based character offset into the source text. */
  position: number;
  /** 1-based line number. */
  line: number;
  /** 1-based column (in UTF-16 code units, like the editor). */
  column: number;
  /** The offending line, clipped around the error for very long (e.g. minified) lines. */
  snippet: string;
  /** Offset of the error within `snippet`, for drawing a caret. */
  caret: number;
}

const POSITION_RE = /\s*at position (\d+)\s*$/;
const SNIPPET_CONTEXT = 40;

export function positionToLineColumn(
  text: string,
  position: number,
): { line: number; column: number } {
  const pos = Math.max(0, Math.min(position, text.length));
  let line = 1;
  let lineStart = 0;
  let next = text.indexOf("\n");
  while (next !== -1 && next < pos) {
    line++;
    lineStart = next + 1;
    next = text.indexOf("\n", lineStart);
  }
  return { line, column: pos - lineStart + 1 };
}

function snippetAt(text: string, position: number): { snippet: string; caret: number } {
  const pos = Math.max(0, Math.min(position, text.length));
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  let lineEnd = text.indexOf("\n", pos);
  if (lineEnd === -1) lineEnd = text.length;
  if (lineEnd > lineStart && text[lineEnd - 1] === "\r") lineEnd--;

  const from = Math.max(lineStart, pos - SNIPPET_CONTEXT);
  const to = Math.min(lineEnd, pos + SNIPPET_CONTEXT);
  const head = from > lineStart ? "…" : "";
  const tail = to < lineEnd ? "…" : "";
  // Tabs would misalign the caret line, so show them as single spaces.
  const body = text.slice(from, to).replace(/\t/g, " ");
  return { snippet: head + body + tail, caret: head.length + (pos - from) };
}

/** Turns a parser exception into a located error with a snippet. */
export function toJsonError(err: unknown, text: string): JsonErrorInfo {
  const raw = err instanceof Error ? err.message : String(err);
  const match = POSITION_RE.exec(raw);
  const position = match ? Number(match[1]) : text.length;
  const message = match ? raw.slice(0, match.index) : raw;
  return {
    message,
    position,
    ...positionToLineColumn(text, position),
    ...snippetAt(text, position),
  };
}
