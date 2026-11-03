import { Button } from "@/components/ui/button";
import type { JsonErrorInfo } from "@/lib/errors";

/** Parse error with line, column, message and a caret snippet (PLAN.md 1.7). */
export function ErrorPanel({ error, onJump }: { error: JsonErrorInfo; onJump?: () => void }) {
  return (
    <div
      role="alert"
      className="shrink-0 border-destructive/30 border-t bg-destructive/5 px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium text-destructive">
          Line {error.line}, column {error.column}
        </span>
        <span className="text-foreground">{error.message}</span>
        {onJump && (
          <Button size="xs" variant="link" className="h-auto px-0" onClick={onJump}>
            Go to error
          </Button>
        )}
      </div>
      <pre className="mt-1 overflow-x-auto font-mono text-muted-foreground text-xs leading-5">
        {error.snippet}
        {"\n"}
        <span className="text-destructive">{`${" ".repeat(error.caret)}^`}</span>
      </pre>
    </div>
  );
}
