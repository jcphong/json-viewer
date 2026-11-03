import { DocumentEngine } from "@/lib/engine";
import type { ParserApi } from "@/workers/parser.worker";

/** jsdom stand-in for the parser worker: the same engine, called in-process (async like Comlink). */
const engine = new DocumentEngine();

const api: ParserApi = {
  async load(source, name, onProgress, format) {
    const text = "file" in source ? await source.file.text() : source.text;
    const size = "file" in source ? source.file.size : undefined;
    return engine.load(text, name, size, onProgress, format);
  },
  setFormat: (format, onProgress) => engine.setFormat(format, onProgress),
  clear: () => engine.clear(),
  getRows: (start, end) => engine.getRows(start, end),
  toggle: (id) => engine.toggle(id),
  expandToDepth: (levels) => engine.expandToDepth(levels),
  collapseAll: () => engine.collapseAll(),
  rowOf: (id) => engine.rowOf(id),
  reveal: (id) => engine.reveal(id),
  detail: (id) => engine.detail(id),
  copyText: (id, format) => engine.copyText(id, format),
  stats: () => engine.getStats(),
};

const asyncApi = Object.fromEntries(
  Object.entries(api).map(([name, fn]) => [
    name,
    async (...args: unknown[]) => (fn as (...a: unknown[]) => unknown)(...args),
  ]),
);

export const getParser = () => asyncApi;
export const remoteCallback = <T>(fn: T) => fn;
