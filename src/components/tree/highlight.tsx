import type { ReactNode } from "react";

import type { SearchOptions } from "@/lib/engine";

/** A global regex for marking the current query inside visible text, or null if unusable. */
export function highlightPattern(query: string, options: SearchOptions): RegExp | null {
  if (!query) return null;
  const source = options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(source, `g${options.caseSensitive ? "" : "i"}u`);
  } catch {
    return null;
  }
}

/** Splits `text` into plain runs and <mark>ed matches. */
export function markMatches(text: string, pattern: RegExp | null): ReactNode {
  if (!pattern) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    if (m[0] === "") {
      pattern.lastIndex++;
      continue;
    }
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <mark key={m.index} className="rounded-sm bg-amber-300/80 text-inherit dark:bg-amber-500/45">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (!parts.length) return text;
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
