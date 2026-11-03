import { ChevronsDownUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCount } from "@/lib/format";
import { useTreeStore } from "@/store/useTreeStore";

/** Expanding everything above this many nodes asks first (PLAN.md 1.4). */
export const EXPAND_ALL_CONFIRM_NODES = 500_000;

export function TreeToolbar() {
  const stats = useTreeStore((s) => s.stats);
  const expandToDepth = useTreeStore((s) => s.expandToDepth);
  const collapseAll = useTreeStore((s) => s.collapseAll);
  const [confirming, setConfirming] = useState(false);
  const nodeCount = stats?.nodeCount ?? 0;

  const expandAll = () => {
    if (nodeCount > EXPAND_ALL_CONFIRM_NODES && !confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void expandToDepth(Number.POSITIVE_INFINITY);
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1 text-xs">
      <span className="mr-1 text-muted-foreground">Expand</span>
      {[1, 2, 3].map((levels) => (
        <Button
          key={levels}
          size="xs"
          variant="ghost"
          onClick={() => void expandToDepth(levels)}
          aria-label={`Expand ${levels} ${levels === 1 ? "level" : "levels"}`}
        >
          {levels}
        </Button>
      ))}
      <Button size="xs" variant="ghost" onClick={expandAll} aria-label="Expand all levels">
        All
      </Button>
      <Button size="xs" variant="ghost" onClick={() => void collapseAll()}>
        <ChevronsDownUp data-icon="inline-start" />
        Collapse all
      </Button>
      {confirming && (
        <div role="alert" className="ml-2 flex items-center gap-2 rounded-md bg-muted px-2 py-0.5">
          <span>
            Expand all {formatCount(nodeCount)} rows? Scrolling stays fast, but it takes a moment.
          </span>
          <Button size="xs" onClick={expandAll}>
            Expand all
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
