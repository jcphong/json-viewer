/**
 * Decodes a JSON string literal straight from the source text, optionally
 * stopping after `maxChars`, so previews of multi-megabyte strings stay cheap.
 * `start` is the offset of the opening quote; the literal must be valid JSON.
 */
export function decodeJsonString(
  text: string,
  start: number,
  maxChars = Number.POSITIVE_INFINITY,
): { value: string; truncated: boolean } {
  const parts: string[] = [];
  let length = 0;
  let i = start + 1;
  let runStart = i;
  const flush = (end: number) => {
    if (end > runStart) {
      const run = text.slice(runStart, end);
      parts.push(run);
      length += run.length;
    }
  };

  for (;;) {
    if (length + (i - runStart) >= maxChars) {
      flush(runStart + (maxChars - length));
      // Exactly maxChars long is not truncated.
      return { value: parts.join(""), truncated: text.charCodeAt(i) !== 34 };
    }
    const c = text.charCodeAt(i);
    if (c === 34 || Number.isNaN(c)) {
      flush(i);
      return { value: parts.join(""), truncated: false };
    }
    if (c !== 92) {
      i++;
      continue;
    }
    flush(i);
    const e = text[i + 1];
    let decoded: string;
    if (e === "u") {
      decoded = String.fromCharCode(Number.parseInt(text.slice(i + 2, i + 6), 16));
      i += 6;
    } else {
      decoded = ESCAPES[e] ?? e;
      i += 2;
    }
    parts.push(decoded);
    length += 1;
    runStart = i;
  }
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};
