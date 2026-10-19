import { ChevronRight } from "lucide-react";

import { childEntries, describeValue, KIND_LABEL, type ValueKind } from "@/lib/bson";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

import { childPath, PAGE_SIZE, stringPath, useExpand } from "./expand";

const INDENT_PX = 16;
/** Strings longer than this get a click-to-expand toggle; shorter ones always fit. */
const LONG_STRING = 40;
/** Collapsed strings render at most this many characters (the rest is cut by CSS ellipsis anyway). */
const COLLAPSED_CHARS = 300;

const KIND_CLASS: Partial<Record<ValueKind, string>> = {
  string: "text-syntax-string",
  number: "text-syntax-number",
  int32: "text-syntax-number",
  int64: "text-syntax-number",
  double: "text-syntax-number",
  decimal128: "text-syntax-number",
  boolean: "text-syntax-literal",
  null: "text-syntax-literal",
  minKey: "text-syntax-literal",
  maxKey: "text-syntax-literal",
  objectId: "text-syntax-key",
  uuid: "text-syntax-key",
  binary: "text-syntax-key",
  date: "text-syntax-key",
  timestamp: "text-syntax-key",
  regex: "text-syntax-key",
};

/** The children of an array/object at `path`, paged so huge arrays don't flood the DOM. */
export function FieldList({ value, path, depth }: { value: unknown; path: string; depth: number }) {
  const expand = useExpand();
  const { entries, total } = childEntries(value, expand.limit(path));
  const remaining = total - entries.length;

  return (
    <div>
      {entries.map(([key, child]) => (
        <FieldRow key={key} name={key} value={child} path={childPath(path, key)} depth={depth} />
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => expand.showMore(path)}
          className="my-0.5 rounded text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
          style={{ marginLeft: depth * INDENT_PX + INDENT_PX + 4 }}
        >
          Show {formatCount(Math.min(PAGE_SIZE, remaining))} more ({formatCount(remaining)} hidden)
        </button>
      )}
    </div>
  );
}

/** One `key: value` line, Compass style, with an expander for non-empty arrays and objects. */
export function FieldRow({
  name,
  value,
  path,
  depth,
}: {
  name: string | null;
  value: unknown;
  path: string;
  depth: number;
}) {
  const expand = useExpand();
  const desc = describeValue(value);
  const expandable = (desc.kind === "array" || desc.kind === "object") && desc.size > 0;
  const open = expandable && expand.isOpen(path);
  const label = name ?? "value";

  return (
    <div>
      <div
        className="flex min-w-0 items-start gap-1 leading-6"
        style={{ paddingLeft: depth * INDENT_PX }}
      >
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
            onClick={() => expand.toggle(path)}
            className="mt-1 flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {name !== null && (
          <span className="shrink-0 font-semibold text-foreground">
            {name}
            <span className="font-normal text-muted-foreground">:</span>
          </span>
        )}
        {expandable ? (
          <button
            type="button"
            onClick={() => expand.toggle(path)}
            className="min-w-0 truncate text-left text-muted-foreground hover:text-foreground"
            title={KIND_LABEL[desc.kind]}
          >
            {desc.text}
          </button>
        ) : desc.kind === "string" ? (
          <StringValue value={value as string} path={path} />
        ) : (
          <span
            className={cn("min-w-0 truncate", KIND_CLASS[desc.kind] ?? "text-muted-foreground")}
            title={KIND_LABEL[desc.kind]}
          >
            {desc.text}
          </span>
        )}
      </div>
      {open && <FieldList value={value} path={path} depth={depth + 1} />}
    </div>
  );
}

function StringValue({ value, path }: { value: string; path: string }) {
  const expand = useExpand();
  const key = stringPath(path);
  const full = expand.isOpen(key);

  if (value.length <= LONG_STRING) {
    return (
      <span className="min-w-0 truncate text-syntax-string" title="String">
        "{value}"
      </span>
    );
  }
  if (full) {
    return (
      <button
        type="button"
        onClick={() => expand.toggle(key)}
        className="min-w-0 whitespace-pre-wrap break-words text-left text-syntax-string"
        title="Click to collapse"
      >
        "{value}"
      </button>
    );
  }
  const shown = value.length > COLLAPSED_CHARS ? `${value.slice(0, COLLAPSED_CHARS)}…` : value;
  return (
    <button
      type="button"
      onClick={() => expand.toggle(key)}
      className="min-w-0 truncate text-left text-syntax-string"
      title={`String (${formatCount(value.length)} characters). Click to show all.`}
    >
      "{shown}"
    </button>
  );
}
