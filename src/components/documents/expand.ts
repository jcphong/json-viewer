import { createContext, useContext } from "react";

/** Expansion state for a document view, kept above the virtualized list so it survives scrolling. */
export interface ExpandState {
  isOpen(path: string): boolean;
  toggle(path: string): void;
  /** How many children of `path` are currently shown. */
  limit(path: string): number;
  showMore(path: string): void;
}

export const PAGE_SIZE = 100;
const SEP = "\u001f";

export const childPath = (parent: string, key: string) => `${parent}${SEP}${key}`;
/** Separate namespace for "show the full string" toggles. */
export const stringPath = (path: string) => `str${SEP}${path}`;

export const ExpandContext = createContext<ExpandState | null>(null);

export function useExpand(): ExpandState {
  const state = useContext(ExpandContext);
  if (!state) throw new Error("useExpand must be used inside a DocumentView");
  return state;
}
