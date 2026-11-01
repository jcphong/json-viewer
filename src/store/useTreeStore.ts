import { create } from "zustand";

import type { DocumentStats } from "@/lib/engine";
import type { JsonErrorInfo } from "@/lib/errors";
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
  visibleCount: number;
  /** Bumped whenever the visible rows change, so cached rows are refetched. */
  version: number;
  selectedId: number | null;

  load: (source: LoadSource, name: string) => Promise<boolean>;
  toggle: (id: number) => Promise<void>;
  expandToDepth: (levels: number) => Promise<void>;
  collapseAll: () => Promise<void>;
  select: (id: number | null) => void;
  reset: () => void;
}

let loadSeq = 0;

export const useTreeStore = create<TreeState>((set, get) => {
  const updateVisible = (visibleCount: number) =>
    set((s) => ({ visibleCount, version: s.version + 1 }));

  return {
    status: "empty",
    progress: null,
    loadingName: null,
    stats: null,
    error: null,
    visibleCount: 0,
    version: 0,
    selectedId: null,

    load: async (source, name) => {
      const seq = ++loadSeq;
      set({ status: "loading", progress: null, loadingName: name, error: null, selectedId: null });
      const result = await getParser().load(
        source,
        name,
        remoteCallback((fraction: number) => {
          if (seq === loadSeq) set({ progress: fraction });
        }),
      );
      // A newer load (or a reset) started meanwhile; drop this result.
      if (seq !== loadSeq) return false;
      if (!result.ok) {
        set({
          status: "error",
          error: result.error,
          stats: null,
          visibleCount: 0,
          loadingName: null,
        });
        return false;
      }
      set((s) => ({
        status: "ready",
        stats: result.stats,
        visibleCount: result.visibleCount,
        version: s.version + 1,
        progress: 1,
        loadingName: null,
      }));
      return true;
    },

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
        visibleCount: 0,
        selectedId: null,
      });
    },
  };
});
