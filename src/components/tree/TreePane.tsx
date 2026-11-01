import { ErrorPanel } from "@/components/editor/ErrorPanel";
import { useTreeStore } from "@/store/useTreeStore";

import { SidePanel } from "./SidePanel";
import { TreeToolbar } from "./TreeToolbar";
import { TreeView } from "./TreeView";

/** Tree mode: expand controls, the virtualized tree, and the selection side panel. */
export function TreePane() {
  const status = useTreeStore((s) => s.status);
  const progress = useTreeStore((s) => s.progress);
  const loadingName = useTreeStore((s) => s.loadingName);
  const error = useTreeStore((s) => s.error);

  if (status === "loading") {
    const percent = progress === null ? null : Math.round(progress * 100);
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 p-6"
        aria-live="polite"
      >
        <p className="text-sm">
          {percent === null ? "Reading" : "Indexing"}{" "}
          <span className="font-medium">{loadingName}</span>
          {percent !== null && (
            <span className="text-muted-foreground tabular-nums"> · {percent}%</span>
          )}
        </p>
        <div
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent ?? undefined}
          className="h-1.5 w-64 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${percent ?? 5}%` }}
          />
        </div>
      </div>
    );
  }

  if (status === "error" && error) {
    return (
      <div className="flex flex-1 flex-col justify-end">
        <ErrorPanel error={error} />
      </div>
    );
  }

  if (status !== "ready") return <div className="flex-1" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TreeToolbar />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <TreeView />
        <div className="flex max-h-[40%] min-h-0 shrink-0 flex-col border-t md:max-h-none md:w-96 md:border-t-0 md:border-l">
          <SidePanel />
        </div>
      </div>
    </div>
  );
}
