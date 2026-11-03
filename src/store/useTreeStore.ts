import { create } from "zustand";

import type { DocumentStats, FormatChoice, LoadResult } from "@/lib/engine";
import type { JsonErrorInfo } from "@/lib/errors";
import type { LineError } from "@/lib/node-index";
import { getParser, remoteCallback } from "@/workers/client";
import type { LoadSource } from "@/workers/parser.worker";

export type TreeStatus = "empty" | "loading" | "ready" | "error";

interface TreeState {
  status: TreeStatus;
  /** 0–1 while indexing; null while reading a file. */
  progress: number | null;
  /** Name shown while loading. */
  loadingName: string | null;
  stats: DocumentStats | null;
  error: JsonErrorInfo | null;
  /** JSONL: the first malformed lines (stats.malformedLines has the exact count). */
  lineErrors: LineError[];
  visibleCount: number;
  /** Bumped whenever the visible rows change, so cached rows are refetched. */
  version: number;
  selectedId: number | null;

  load: (source: LoadSource, name: string, format?: FormatChoice) => Promise<boolean>;
  /** Re-reads the loaded text as JSON or JSONL. */
  setFormat: (format: FormatChoice) => Promise<boolean>;
  toggle: (id: number) => Promise<void>;
  expandToDepth: (levels: number) => Promise<void>;
  collapseAll: () => Promise<void>;
  select: (id: number | null) => void;
  reset: () => void;
}

let loadSeq = 0;
/** Name of the last loaded document, kept for format switches after a failed parse. */
let currentName = "document";

export const useTreeStore = create<TreeState>((set, get) => {
  const updateVisible = (visibleCount: number) =>
    set((s) => ({ visibleCount, version: s.version + 1 }));

  /** Runs a load-like worker call, ignoring results superseded by a newer call. */
  const run = async (
    name: string,
    call: (onProgress: (fraction: number) => void) => Promise<LoadResult | null>,
  ): Promise<boolean> => {
    const seq = ++loadSeq;
    set({ status: "loading", progress: null, loadingName: name, error: null, selectedId: null });
    const result = await call(
      remoteCallback((fraction: number) => {
        if (seq === loadSeq) set({ progress: fraction });
      }),
    );
    // A newer load (or a reset) started meanwhile; drop this result.
    if (seq !== loadSeq || !result) return false;
    if (!result.ok) {
      set({
        status: "error",
        error: result.error,
        stats: null,
        lineErrors: [],
        visibleCount: 0,
        loadingName: null,
      });
      return false;
    }
    set((s) => ({
      status: "ready",
      stats: result.stats,
      lineErrors: result.lineErrors,
      visibleCount: result.visibleCount,
      version: s.version + 1,
      progress: 1,
      loadingName: null,
    }));
    return true;
  };

  return {
    status: "empty",
    progress: null,
    loadingName: null,
    stats: null,
    error: null,
    lineErrors: [],
    visibleCount: 0,
    version: 0,
    selectedId: null,

    load: (source, name, format = "auto") => {
      currentName = name;
      return run(name, (onProgress) => getParser().load(source, name, onProgress, format));
    },

    setFormat: (format) =>
      run(currentName, (onProgress) => getParser().setFormat(format, onProgress)),

    toggle: async (id) => updateVisible(await getParser().toggle(id)),
    expandToDepth: async (levels) => updateVisible(await getParser().expandToDepth(levels)),
    collapseAll: async () => updateVisible(await getParser().collapseAll()),
    select: (selectedId) => set({ selectedId }),

    reset: () => {
      loadSeq++;
      if (get().status !== "empty") void getParser().clear();
      set({
        status: "empty",
        progress: null,
        loadingName: null,
        stats: null,
        error: null,
        lineErrors: [],
        visibleCount: 0,
        selectedId: null,
      });
    },
  };
});
