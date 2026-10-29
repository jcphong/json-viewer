/**
 * Writes the test fixtures in fixtures/ (PLAN.md task 0.3). Output is deterministic.
 *
 *   pnpm fixtures                  # everything (~300 MB)
 *   pnpm fixtures --small          # only the small, committed fixtures
 *   pnpm fixtures bad.json deep    # by name (".json"/".jsonl" optional)
 */
import { closeSync, mkdirSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";

import { FIXTURES, type FixtureSpec } from "./fixtures/generators.ts";

const OUT_DIR = join(import.meta.dirname, "..", "fixtures");
const FLUSH_BYTES = 4 * 1024 * 1024;

function write(spec: FixtureSpec): number {
  const fd = openSync(join(OUT_DIR, spec.file), "w");
  let bytes = 0;
  let buffer: string[] = [];
  let buffered = 0;
  const flush = () => {
    if (!buffered) return;
    bytes += writeSync(fd, buffer.join(""));
    buffer = [];
    buffered = 0;
  };
  try {
    for (const chunk of spec.generate()) {
      buffer.push(chunk);
      buffered += chunk.length;
      if (buffered >= FLUSH_BYTES) flush();
    }
    flush();
  } finally {
    closeSync(fd);
  }
  return bytes;
}

function select(args: string[]): FixtureSpec[] {
  const names = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--small")) return FIXTURES.filter((f) => f.small);
  if (!names.length) return FIXTURES;
  return names.map((name) => {
    const spec = FIXTURES.find((f) => f.file === name || f.file.replace(/\.jsonl?$/, "") === name);
    if (!spec) {
      console.error(`Unknown fixture "${name}". Known: ${FIXTURES.map((f) => f.file).join(", ")}`);
      process.exit(1);
    }
    return spec;
  });
}

mkdirSync(OUT_DIR, { recursive: true });
for (const spec of select(process.argv.slice(2))) {
  const start = performance.now();
  const bytes = write(spec);
  const seconds = ((performance.now() - start) / 1000).toFixed(1);
  const size =
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`;
  console.log(`${spec.file.padEnd(16)} ${size.padStart(10)}  ${seconds}s  ${spec.description}`);
}
