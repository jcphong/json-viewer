import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type Theme, useThemeStore } from "@/store/useThemeStore";

const THEME_META: Record<Theme, { label: string; Icon: typeof Sun }> = {
  system: { label: "System", Icon: Monitor },
  light: { label: "Light", Icon: Sun },
  dark: { label: "Dark", Icon: Moon },
};

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const cycleTheme = useThemeStore((s) => s.cycleTheme);
  const { label, Icon } = THEME_META[theme];

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={cycleTheme}
      aria-label={`Theme: ${label}. Click to change.`}
      title={`Theme: ${label}`}
    >
      <Icon />
    </Button>
  );
}
