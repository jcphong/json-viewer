/** A path segment: an object key or an array index. */
export type PathSegment = string | number;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * JSONPath for a list of segments: `$.users[3].email`.
 * Keys that aren't plain identifiers are quoted: `$["a.b"]`, `$[""]`.
 */
export function toJsonPath(segments: readonly PathSegment[]): string {
  let path = "$";
  for (const segment of segments) {
    if (typeof segment === "number") path += `[${segment}]`;
    else if (IDENTIFIER.test(segment)) path += `.${segment}`;
    else path += `[${JSON.stringify(segment)}]`;
  }
  return path;
}
