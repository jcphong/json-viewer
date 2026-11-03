import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PLAN.md 1.8: untrusted JSON is only ever rendered as text. This keeps HTML
 * injection sinks and dynamic code evaluation out of our own source.
 * Files are read from disk at run time, so newly added files are always checked.
 */
const ROOT = join(import.meta.dirname, "..", "..");

function sourceFiles(): string[] {
  const files = readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => join("src", f));
  return [...files, "index.html", join("public", "theme-init.js")];
}

const FORBIDDEN: [RegExp, string][] = [
  [/dangerouslySetInnerHTML/, "dangerouslySetInnerHTML"],
  [/\.(innerHTML|outerHTML)\s*\+?=/, "innerHTML/outerHTML assignment"],
  [/insertAdjacentHTML/, "insertAdjacentHTML"],
  [/document\.write/, "document.write"],
  [/\beval\s*\(/, "eval()"],
  [/new\s+Function\s*\(/, "new Function()"],
  [/createContextualFragment/, "createContextualFragment"],
];

describe("security pass", () => {
  const files = sourceFiles();
  const contents = new Map(files.map((f) => [f, readFileSync(join(ROOT, f), "utf8")]));

  it("checks every source file", () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(join("src", "components", "tree", "TreeRow.tsx"));
  });

  it.each(FORBIDDEN)("no source file uses %s", (pattern, name) => {
    const offenders = files.filter((f) => pattern.test(contents.get(f) ?? ""));
    expect(offenders, `${name} found in`).toEqual([]);
  });
});
