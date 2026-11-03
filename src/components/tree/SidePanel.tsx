import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import type { CopyFormat, NodeDetail } from "@/lib/engine";
import { formatBytes, formatCount } from "@/lib/format";
import { useTreeStore } from "@/store/useTreeStore";
import { getParser } from "@/workers/client";

/** Path, type, size and full value of the selected node, with copy actions (PLAN.md 1.5). */
export function SidePanel() {
  const selectedId = useTreeStore((s) => s.selectedId);
  const version = useTreeStore((s) => s.version);
  const [detail, setDetail] = useState<NodeDetail | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new document (version) invalidates the detail.
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let current = true;
    void getParser()
      .detail(selectedId)
      .then((d) => {
        if (current) setDetail(d);
      });
    return () => {
      current = false;
    };
  }, [selectedId, version]);

  if (selectedId === null || !detail) {
    return (
      <aside className="flex items-center justify-center p-6 text-center text-muted-foreground text-sm">
        Select a row to see its path and full value.
      </aside>
    );
  }

  const isContainer = detail.type === "object" || detail.type === "array";

  return (
    <aside
      aria-label="Selected value"
      className="flex min-h-0 flex-col gap-3 overflow-auto p-3 text-sm"
    >
      <section>
        <h2 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Path
        </h2>
        <p className="break-all font-mono text-[13px]">{detail.path}</p>
      </section>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {detail.line !== undefined && (
          <>
            <dt className="text-muted-foreground">Line</dt>
            <dd className="font-mono tabular-nums">{formatCount(detail.line)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Type</dt>
        <dd className="font-mono">{detail.type}</dd>
        {isContainer && (
          <>
            <dt className="text-muted-foreground">{detail.type === "array" ? "Items" : "Keys"}</dt>
            <dd className="font-mono tabular-nums">{formatCount(detail.childCount)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Size</dt>
        <dd className="font-mono tabular-nums">{formatBytes(detail.sizeBytes)}</dd>
      </dl>
      <div className="flex flex-wrap gap-1">
        <CopyButton label="Copy path" text={() => detail.path} />
        <CopyButton
          label="Copy value"
          text={() => copy(detail.id, isContainer ? "minified" : "value")}
        />
        <CopyButton label="Copy as formatted JSON" text={() => copy(detail.id, "pretty")} />
      </div>
      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          Value
        </h2>
        <pre className="min-h-24 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-[12px] leading-5">
          {detail.value}
        </pre>
        {detail.valueTruncated && (
          <p className="mt-1 text-muted-foreground text-xs">
            Showing the first 200,000 characters. Copy to get the full value.
          </p>
        )}
      </section>
    </aside>
  );
}

const copy = (id: number, format: CopyFormat) => getParser().copyText(id, format);

function CopyButton({ label, text }: { label: string; text: () => string | Promise<string> }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const onClick = async () => {
    try {
      await copyToClipboard(text());
      setState("copied");
    } catch {
      setState("failed");
    }
    window.setTimeout(() => setState("idle"), 1500);
  };
  return (
    <Button size="xs" variant="outline" onClick={onClick}>
      {state === "copied" ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
      {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
    </Button>
  );
}
