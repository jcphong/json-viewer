import { create } from "zustand";

export interface DocumentStats {
  fileName: string;
  sizeBytes: number;
  nodeCount: number;
  parseMs: number;
  /** JSON Lines: non-blank lines and how many are malformed. */
  lines?: number;
  malformedLines?: number;
}

interface ViewerState {
  /** Stats for the loaded document, or null when nothing is loaded. */
  stats: DocumentStats | null;
  setStats: (stats: DocumentStats | null) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  stats: null,
  setStats: (stats) => set({ stats }),
}));
