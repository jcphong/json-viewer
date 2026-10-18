import { StatusBar } from "@/components/status/StatusBar";
import { Toolbar } from "@/components/toolbar/Toolbar";

import { useThemeEffect } from "./useThemeEffect";

export function App() {
  useThemeEffect();

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center text-muted-foreground text-sm">
          <p className="font-medium text-foreground">Open a JSON or JSONL file</p>
          <p className="mt-1">Paste, drop a file, or pick one. Coming in Phase 1.</p>
        </div>
      </main>
      <StatusBar />
    </div>
  );
}
