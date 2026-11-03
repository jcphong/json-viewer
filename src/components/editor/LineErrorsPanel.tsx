import type { JsonErrorInfo } from "@/lib/errors";
import { formatCount } from "@/lib/format";

/** Malformed JSONL lines: listed, skipped, and never fatal (PLAN.md 2.2). */
export function LineErrorsPanel({
  errors,
  total,
  onJump,
}: {
  errors: JsonErrorInfo[];
  total: number;
  onJump?: (error: JsonErrorInfo) => void;
}) {
  if (total === 0) return null;
  return (
    <details
      open
      className="shrink-0 border-amber-500/30 border-t bg-amber-500/5 text-sm"
      aria-label="Malformed lines"
    >
      <summary className="cursor-pointer select-none px-3 py-1.5 font-medium text-amber-700 dark:text-amber-400">
        {formatCount(total)} malformed {total === 1 ? "line" : "lines"} skipped
        {errors.length < total && (
          <span className="font-normal text-muted-foreground">
            {" "}
            · showing first {formatCount(errors.length)}
          </span>
        )}
      </summary>
      <ul className="max-h-48 overflow-auto px-3 pb-2">
        {errors.map((error) => (
          <li key={error.position} className="border-border/60 border-t py-1.5 first:border-t-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              {onJump ? (
                <button
                  type="button"
                  onClick={() => onJump(error)}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Line {formatCount(error.line)}, column {error.column}
                </button>
              ) : (
                <span className="font-medium">
                  Line {formatCount(error.line)}, column {error.column}
                </span>
              )}
              <span className="text-muted-foreground">{error.message}</span>
            </div>
            <pre className="mt-0.5 overflow-x-auto font-mono text-muted-foreground text-xs leading-5">
              {error.snippet}
              {"\n"}
              <span className="text-destructive">{`${" ".repeat(error.caret)}^`}</span>
            </pre>
          </li>
        ))}
      </ul>
    </details>
  );
}
