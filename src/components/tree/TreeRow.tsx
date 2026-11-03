import { ChevronRight } from "lucide-react";
import { type CSSProperties, memo } from "react";

import type { Row } from "@/lib/engine";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export const ROW_HEIGHT = 24;
export const INDENT_PX = 16;

const VALUE_CLASS: Record<Row["type"], string> = {
  object: "text-muted-foreground",
  array: "text-muted-foreground",
  string: "text-syntax-string",
  number: "text-syntax-number",
  boolean: "text-syntax-literal",
  null: "text-syntax-literal",
};

function valueText(row: Row): string {
  if (row.type === "object") return `{${formatCount(row.childCount)}}`;
  if (row.type === "array") return `[${formatCount(row.childCount)}]`;
  if (row.type === "string") return `"${row.preview}${row.truncated ? "…" : ""}"`;
  return row.preview;
}

/** One line of the tree: indent guides, expander, key, and a type-colored value. */
export const TreeRow = memo(function TreeRow({
  row,
  selected,
  style,
  onSelect,
  onToggle,
}: {
  row: Row;
  selected: boolean;
  style: CSSProperties;
  onSelect: (id: number) => void;
  onToggle: (id: number) => void;
}) {
  const expandable = (row.type === "object" || row.type === "array") && row.childCount > 0;
  const text = valueText(row);

  return (
    <div
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={expandable ? row.expanded : undefined}
      aria-selected={selected}
      tabIndex={-1}
      data-row-id={row.id}
      style={style}
      onClick={() => onSelect(row.id)}
      onDoubleClick={() => expandable && onToggle(row.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect(row.id);
      }}
      className={cn(
        "flex cursor-default items-center whitespace-nowrap pr-3 font-mono text-[13px]",
        selected ? "bg-accent" : "hover:bg-muted/60",
      )}
    >
      <span
        aria-hidden
        className="h-full shrink-0"
        style={{
          width: 8 + row.depth * INDENT_PX,
          backgroundImage:
            "repeating-linear-gradient(to right, transparent 0 15px, var(--border) 15px 16px)",
          backgroundPosition: "-0.5px 0",
          backgroundSize: `${row.depth * INDENT_PX + 0.5}px 100%`,
          backgroundRepeat: "no-repeat",
        }}
      />
      {expandable ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label={row.expanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(row.id);
          }}
          className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRight
            className={cn("size-3.5 transition-transform", row.expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="ml-1 shrink-0">
        {row.key === null ? (
          <span className="text-muted-foreground">$</span>
        ) : typeof row.key === "number" ? (
          <span className="text-muted-foreground">{row.key}</span>
        ) : (
          <span className="text-syntax-key">{row.key}</span>
        )}
        <span className="mr-1.5 text-muted-foreground">:</span>
      </span>
      <span
        className={cn("min-w-0 truncate", VALUE_CLASS[row.type])}
        title={row.type === "string" ? text : undefined}
      >
        {text}
      </span>
    </div>
  );
});

export function PlaceholderRow({ style }: { style: CSSProperties }) {
  return (
    <div style={style} className="flex items-center px-6" aria-hidden>
      <span className="h-2.5 w-40 rounded bg-muted" />
    </div>
  );
}
