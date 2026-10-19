import { useVirtualizer } from "@tanstack/react-virtual";
import { stringify } from "lossless-json";
import { Check, Copy } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { describeExtendedJson, isPlainObject, toDocuments } from "@/lib/bson";
import { formatCount } from "@/lib/format";

import { ExpandContext, type ExpandState, PAGE_SIZE } from "./expand";
import { FieldList, FieldRow } from "./FieldList";

/**
 * MongoDB Compass-style list view: one card per document (each element of a
 * root array, or the root object itself), virtualized so large arrays scroll smoothly.
 */
export function DocumentView({ root }: { root: unknown }) {
  const documents = useMemo(() => toDocuments(root), [root]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(() => new Map());

  const expand = useMemo<ExpandState>(
    () => ({
      isOpen: (path) => open.has(path),
      toggle: (path) =>
        setOpen((prev) => {
          const next = new Set(prev);
          if (!next.delete(path)) next.add(path);
          return next;
        }),
      limit: (path) => limits.get(path) ?? PAGE_SIZE,
      showMore: (path) =>
        setLimits((prev) => new Map(prev).set(path, (prev.get(path) ?? PAGE_SIZE) + PAGE_SIZE)),
    }),
    [open, limits],
  );

  const virtualizer = useVirtualizer({
    count: documents.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 160,
    overscan: 4,
    gap: 8,
    paddingStart: 12,
    paddingEnd: 12,
  });

  return (
    <ExpandContext.Provider value={expand}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b px-3 py-1 text-muted-foreground text-xs">
          {formatCount(documents.length)} {documents.length === 1 ? "document" : "documents"}
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-muted/40">
          <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-3 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <DocumentCard document={documents[item.index]} index={item.index} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ExpandContext.Provider>
  );
}

function DocumentCard({ document, index }: { document: unknown; index: number }) {
  const path = String(index);
  const isDocument = isPlainObject(document) && !describeExtendedJson(document);

  return (
    <article
      aria-label={`Document ${index + 1}`}
      className="group relative rounded-lg border bg-card px-3 py-2 font-mono text-[13px] text-card-foreground"
    >
      <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CopyDocumentButton document={document} index={index} />
      </div>
      {isDocument ? (
        <FieldList value={document} path={path} depth={0} />
      ) : (
        <FieldRow name={null} value={document} path={path} depth={0} />
      )}
    </article>
  );
}

function CopyDocumentButton({ document, index }: { document: unknown; index: number }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(stringify(document, null, 2) ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); nothing else to do.
    }
  };
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      onClick={copy}
      aria-label={`Copy document ${index + 1}`}
      title="Copy document"
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}
