import { Braces } from "lucide-react";

import { ThemeToggle } from "./ThemeToggle";

export function Toolbar() {
  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <div className="flex items-center gap-2 font-medium text-sm">
        <Braces className="size-4 text-muted-foreground" aria-hidden />
        <span>JSON Viewer</span>
      </div>
      {/* Document actions (open, expand, format, raw view) land here in Phase 1. */}
      <div className="flex-1" />
      <ThemeToggle />
    </header>
  );
}
