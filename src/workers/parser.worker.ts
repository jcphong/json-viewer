/**
 * Parser worker: owns the document text and its node index (PLAN.md §3).
 * The main thread talks to it through Comlink and only receives row windows.
 */
import * as Comlink from "comlink";

import {
  type CopyFormat,
  DocumentEngine,
  type FormatChoice,
  type LoadResult,
  type SearchOptions,
} from "@/lib/engine";

export type LoadSource = { text: string } | { file: File };

const engine = new DocumentEngine();
/** Each search gets a number; an older one stops at its next yield. */
let searchSeq = 0;

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
  /** Expands the node's ancestors; returns its row and the new visible row count. */
  reveal: (id: number) => ({ row: engine.reveal(id), visibleCount: engine.visibleCount() }),
  search: (query: string, options: SearchOptions) => {
    const seq = ++searchSeq;
    return engine.search(query, options, () => seq === searchSeq);
  },
  clearSearch: () => {
    searchSeq++;
    engine.clearSearch();
  },
  detail: (id: number) => engine.detail(id),
  copyText: (id: number, format: CopyFormat) => engine.copyText(id, format),
  stats: () => engine.getStats(),
};

export type ParserApi = typeof api;

Comlink.expose(api);
