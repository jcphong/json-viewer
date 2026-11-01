import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";

import type { Row } from "@/lib/engine";
import { useTreeStore } from "@/store/useTreeStore";
import { getParser } from "@/workers/client";

import { INDENT_PX, PlaceholderRow, ROW_HEIGHT, TreeRow } from "./TreeRow";

/** Minimum width left for key and value on deeply indented rows. */
const MIN_TEXT_PX = 360;
/** Rows fetched beyond the visible range on each side. */
const FETCH_MARGIN = 400;
/** Fetch the next window once the visible range is this close to the loaded window's edge. */
const PREFETCH_THRESHOLD = 200;

interface RowWindow {
  version: number;
  start: number;
  rows: Row[];
}

interface Span {
  version: number;
  start: number;
  end: number;
}

const covers = (span: Span | null, version: number, from: number, to: number) =>
  span !== null && span.version === version && span.start <= from && to < span.end;

/**
 * Keeps a window of rows from the worker around [first, last], fetching the
 * next one ahead of time so fast scrolling doesn't reach unloaded rows.
 */
function useRowWindow(
  version: number,
  first: number,
  last: number,
  total: number,
): RowWindow | null {
  const [rowWindow, setRowWindow] = useState<RowWindow | null>(null);
  const requestSeq = useRef(0);
  const inflight = useRef<Span | null>(null);

  useEffect(() => {
    // The range we want loaded: visible rows plus slack, clamped to the document.
    const wantFrom = Math.max(0, first - PREFETCH_THRESHOLD);
    const wantTo = Math.min(total - 1, last + PREFETCH_THRESHOLD);
    const loaded: Span | null = rowWindow && {
      version: rowWindow.version,
      start: rowWindow.start,
      end: rowWindow.start + rowWindow.rows.length,
    };
    if (
      covers(loaded, version, wantFrom, wantTo) ||
      covers(inflight.current, version, wantFrom, wantTo)
    ) {
      return;
    }
    const seq = ++requestSeq.current;
    const span = {
      version,
      start: Math.max(0, first - FETCH_MARGIN),
      end: Math.min(total, last + 1 + FETCH_MARGIN),
    };
    inflight.current = span;
    void getParser()
      .getRows(span.start, span.end)
      .then((rows) => {
        if (seq !== requestSeq.current) return;
        inflight.current = null;
        setRowWindow({ version, start: span.start, rows });
      });
  }, [version, first, last, total, rowWindow]);

  return rowWindow;
}

/** Virtualized tree of the worker's document; only on-screen rows exist in the DOM. */
export function TreeView() {
  const visibleCount = useTreeStore((s) => s.visibleCount);
  const version = useTreeStore((s) => s.version);
  const selectedId = useTreeStore((s) => s.selectedId);
  const select = useTreeStore((s) => s.select);
  const toggle = useTreeStore((s) => s.toggle);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: visibleCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });
  const items = virtualizer.getVirtualItems();
  const first = items[0]?.index ?? 0;
  const last = items.at(-1)?.index ?? 0;
  const rowWindow = useRowWindow(version, first, last, visibleCount);

  const onToggle = useCallback((id: number) => void toggle(id), [toggle]);

  return (
    <div
      ref={scrollRef}
      role="tree"
      aria-label="JSON tree"
      className="min-h-0 flex-1 overflow-auto py-1"
    >
      <div className="relative min-w-full" style={{ height: virtualizer.getTotalSize() }}>
        {items.map((item) => {
          const style = {
            position: "absolute",
            top: 0,
            left: 0,
            height: ROW_HEIGHT,
            transform: `translateY(${item.start}px)`,
          } as const;
          const row = rowWindow ? rowWindow.rows[item.index - rowWindow.start] : undefined;
          return row ? (
            <TreeRow
              key={item.key}
              row={row}
              selected={row.id === selectedId}
              // Fill the pane so long values end in "…", but give deep rows room to scroll sideways.
              style={{ ...style, width: `max(100%, ${row.depth * INDENT_PX + MIN_TEXT_PX}px)` }}
              onSelect={select}
              onToggle={onToggle}
            />
          ) : (
            <PlaceholderRow key={item.key} style={{ ...style, width: "100%" }} />
          );
        })}
      </div>
    </div>
  );
}
