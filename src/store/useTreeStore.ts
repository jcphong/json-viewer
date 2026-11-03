import { create } from "zustand";

import type { DocumentStats, FormatChoice, LoadResult, SearchOptions } from "@/lib/engine";
import type { JsonErrorInfo } from "@/lib/errors";
import type { LineError } from "@/lib/node-index";
import { getParser, remoteCallback } from "@/workers/client";
import type { LoadSource } from "@/workers/parser.worker";

export type TreeStatus = "empty" | "loading" | "ready" | "error";

export interface SearchState {
  query: string;
  options: SearchOptions;
  /** Matching node ids in document order. */
  ids: number[];
  capped: boolean;
  /** Index into `ids` of the current match, or -1. */
  current: number;
  searching: boolean;
  /** Set when the regular expression is invalid. */
  error: string | null;
}

export const INITIAL_SEARCH: SearchState = {
  query: "",
  options: { scope: "both", caseSensitive: false, regex: false },
  ids: [],
  capped: false,
  current: -1,
  searching: false,
  error: null,
};

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
  /** A row the tree should scroll into view (seq makes repeated requests distinct). */
  scrollTarget: { row: number; seq: number } | null;
  searchOpen: boolean;
  /** Bumped to (re)focus the search box, e.g. on a repeated ⌘F. */
  searchFocus: number;
  search: SearchState;

  load: (source: LoadSource, name: string, format?: FormatChoice) => Promise<boolean>;
  /** Re-reads the loaded text as JSON or JSONL. */
  setFormat: (format: FormatChoice) => Promise<boolean>;
  toggle: (id: number) => Promise<void>;
  expandToDepth: (levels: number) => Promise<void>;
  collapseAll: () => Promise<void>;
  select: (id: number | null) => void;
  reset: () => void;
  openSearch: () => void;
  closeSearch: () => void;
  /** Runs (or re-runs) a search; an empty query clears it. */
  runSearch: (query: string, options: SearchOptions) => Promise<void>;
  /** Moves to the next (1) or previous (-1) match, wrapping around. */
  stepMatch: (direction: 1 | -1) => Promise<void>;
}

let loadSeq = 0;
let searchSeq = 0;
let scrollSeq = 0;
/** The match being navigated to, updated synchronously so rapid Enter presses each advance. */
let cursor = -1;
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
      search: { ...s.search, ids: [], current: -1, capped: false, error: null },
    }));
    // Keep an open search running against the new document.
    const { searchOpen, search } = get();
    if (searchOpen && search.query) void get().runSearch(search.query, search.options);
    return true;
  };

  /** Reveals and selects the match at `current`, scrolling it into view. */
  const goToMatch = async (current: number) => {
    cursor = current;
    const id = get().search.ids[current];
    if (id === undefined) return;
    const { row, visibleCount } = await getParser().reveal(id);
    // A later step (or a new search) took over meanwhile.
    if (current !== cursor || get().search.ids[current] !== id) return;
    set((s) => ({
      visibleCount,
      version: s.version + 1,
      selectedId: id,
      scrollTarget: row >= 0 ? { row, seq: ++scrollSeq } : s.scrollTarget,
      search: { ...s.search, current },
    }));
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
    scrollTarget: null,
    searchOpen: false,
    searchFocus: 0,
    search: INITIAL_SEARCH,

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

    openSearch: () => set((s) => ({ searchOpen: true, searchFocus: s.searchFocus + 1 })),

    closeSearch: () => {
      searchSeq++;
      void getParser().clearSearch();
      set((s) => ({
        searchOpen: false,
        version: s.version + 1,
        search: { ...s.search, ids: [], current: -1, capped: false, searching: false, error: null },
      }));
    },

    runSearch: async (query, options) => {
      const seq = ++searchSeq;
      set((s) => ({
        search: { ...s.search, query, options, searching: query !== "", error: null },
      }));
      if (get().status !== "ready") return;
      const result = await getParser().search(query, options);
      // Cancelled by a newer search (null), or superseded meanwhile.
      if (!result || seq !== searchSeq) return;
      if (!result.ok) {
        set((s) => ({
          version: s.version + 1,
          search: {
            ...s.search,
            ids: [],
            current: -1,
            capped: false,
            searching: false,
            error: result.error,
          },
        }));
        return;
      }
      cursor = -1;
      set((s) => ({
        version: s.version + 1,
        search: {
          ...s.search,
          ids: result.ids,
          capped: result.capped,
          current: -1,
          searching: false,
          error: null,
        },
      }));
      if (result.ids.length) await goToMatch(0);
    },

    stepMatch: async (direction) => {
      const { ids } = get().search;
      if (!ids.length) return;
      await goToMatch(
        (Math.max(cursor, 0) + (cursor < 0 ? 0 : direction) + ids.length) % ids.length,
      );
    },

    reset: () => {
      loadSeq++;
      searchSeq++;
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
        scrollTarget: null,
        search: {
          ...get().search,
          ids: [],
          current: -1,
          capped: false,
          searching: false,
          error: null,
        },
      });
    },
  };
});
