/** Characters that end a number or literal (true/false/null). */
const ENDS_LITERAL = new Set([" ", "\n", "\r", "\t", ",", ":", "]", "}"]);

/**
 * Re-indents or minifies a slice of *valid* JSON text in one linear pass,
 * copying strings and numbers verbatim (so it is lossless) and never recursing.
 * `indent` 0 minifies. Stops after `maxChars` of output when given.
 */
export function reformatJson(
  raw: string,
  indent: number,
  maxChars = Number.POSITIVE_INFINITY,
): { text: string; truncated: boolean } {
  const out: string[] = [];
  let length = 0;
  let level = 0;
  const pad = indent > 0 ? " ".repeat(indent) : "";
  const push = (s: string) => {
    out.push(s);
    length += s.length;
  };
  const newline = () => {
    if (indent > 0) push(`\n${pad.repeat(level)}`);
  };

  for (let i = 0; i < raw.length; i++) {
    if (length >= maxChars) return { text: out.join("").slice(0, maxChars), truncated: true };
    const c = raw[i];
    if (c === '"') {
      let j = i + 1;
      while (raw[j] !== '"') j += raw[j] === "\\" ? 2 : 1;
      push(raw.slice(i, j + 1));
      i = j;
    } else if (c === "{" || c === "[") {
      let j = i + 1;
      while (
        j < raw.length &&
        (raw[j] === " " || raw[j] === "\n" || raw[j] === "\r" || raw[j] === "\t")
      )
        j++;
      if (raw[j] === (c === "{" ? "}" : "]")) {
        push(c === "{" ? "{}" : "[]");
        i = j;
      } else {
        push(c);
        level++;
        newline();
      }
    } else if (c === "}" || c === "]") {
      level--;
      newline();
      push(c);
    } else if (c === ",") {
      push(",");
      newline();
    } else if (c === ":") {
      push(indent > 0 ? ": " : ":");
    } else if (c !== " " && c !== "\n" && c !== "\r" && c !== "\t") {
      let j = i + 1;
      while (j < raw.length && !ENDS_LITERAL.has(raw[j])) j++;
      push(raw.slice(i, j));
      i = j - 1;
    }
  }
  return { text: out.join(""), truncated: false };
}
