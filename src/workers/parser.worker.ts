/**
 * Parser worker: owns the document text and its node index (PLAN.md §3).
 * The main thread talks to it through Comlink and only receives row windows.
 */
import * as Comlink from "comlink";

import { type CopyFormat, DocumentEngine, type FormatChoice, type LoadResult } from "@/lib/engine";

export type LoadSource = { text: string } | { file: File };

const engine = new DocumentEngine();

const api = {
  /** Reads (for files, inside the worker, so the main thread never holds the text) and indexes. */
  async load(
    source: LoadSource,
    name: string,
    onProgress?: (fraction: number) => void,
    format: FormatChoice = "auto",
  ): Promise<LoadResult> {
    const text = "file" in source ? await source.file.text() : source.text;
    const size = "file" in source ? source.file.size : undefined;
    return engine.load(text, name, size, onProgress, format);
  },
  setFormat: (format: FormatChoice, onProgress?: (fraction: number) => void) =>
    engine.setFormat(format, onProgress),
  clear: () => engine.clear(),
  getRows: (start: number, end: number) => engine.getRows(start, end),
  toggle: (id: number) => engine.toggle(id),
  expandToDepth: (levels: number) => engine.expandToDepth(levels),
  collapseAll: () => engine.collapseAll(),
  rowOf: (id: number) => engine.rowOf(id),
  reveal: (id: number) => engine.reveal(id),
  detail: (id: number) => engine.detail(id),
  copyText: (id: number, format: CopyFormat) => engine.copyText(id, format),
  stats: () => engine.getStats(),
};

export type ParserApi = typeof api;

Comlink.expose(api);
