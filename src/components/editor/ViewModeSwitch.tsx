import { AlignLeft, Minimize2, Table2 } from "lucide-react";
import { ToggleGroup } from "radix-ui";

export type ViewMode = "minify" | "beautify" | "object";

const ITEM =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-[0.8rem] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/60 [&_svg]:size-3.5 [&_svg]:shrink-0";

/**
 * Single-choice switch for how the JSON is shown. Clicking the selected option
 * again re-applies it (e.g. re-minify after edits), so `onSelect` always gets a mode.
 */
export function ViewModeSwitch({
  mode,
  onSelect,
  objectDisabled,
}: {
  mode: ViewMode;
  onSelect: (mode: ViewMode) => void;
  objectDisabled: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={mode}
      onValueChange={(value) => onSelect((value || mode) as ViewMode)}
      aria-label="View"
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      <ToggleGroup.Item value="minify" className={ITEM} title="One line, wrapped to fit">
        <Minimize2 aria-hidden />
        Minify
      </ToggleGroup.Item>
      <ToggleGroup.Item value="beautify" className={ITEM} title="Indented, one value per line">
        <AlignLeft aria-hidden />
        Beautify
      </ToggleGroup.Item>
      <ToggleGroup.Item
        value="object"
        className={ITEM}
        disabled={objectDisabled}
        title="Documents, like MongoDB Compass"
      >
        <Table2 aria-hidden />
        Object
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
