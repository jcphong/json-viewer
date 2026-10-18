import { formatBytes, formatCount, formatDuration } from "@/lib/format";
import { useViewerStore } from "@/store/useViewerStore";

export function StatusBar() {
  const stats = useViewerStore((s) => s.stats);

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t px-3 font-mono text-muted-foreground text-xs">
      {stats ? (
        <>
          <span className="min-w-0 truncate text-foreground" title={stats.fileName}>
            {stats.fileName}
          </span>
          <span>{formatBytes(stats.sizeBytes)}</span>
          <span>{formatCount(stats.nodeCount)} nodes</span>
          <span>parsed in {formatDuration(stats.parseMs)}</span>
        </>
      ) : (
        <span>No document loaded</span>
      )}
      <span className="ml-auto">Local only · nothing leaves your browser</span>
    </footer>
  );
}
