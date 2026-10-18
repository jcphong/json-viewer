import { useEffect } from "react";

import { applyTheme, useThemeStore, watchSystemTheme } from "@/store/useThemeStore";

/** Keeps the <html> class in sync with the chosen theme and, in "system" mode, with the OS. */
export function useThemeEffect() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [theme]);
}
