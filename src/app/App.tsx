import { EditorPane } from "@/components/editor/EditorPane";
import { StatusBar } from "@/components/status/StatusBar";
import { Toolbar } from "@/components/toolbar/Toolbar";

import { useThemeEffect } from "./useThemeEffect";

export function App() {
  useThemeEffect();

  return (
    <div className="flex h-full flex-col">
      <Toolbar />
      <main className="flex min-h-0 flex-1 flex-col">
        <EditorPane />
      </main>
      <StatusBar />
    </div>
  );
}
