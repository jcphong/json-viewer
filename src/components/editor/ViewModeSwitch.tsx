import { AlignLeft, ListTree, Minimize2, Table2 } from "lucide-react";
import { ToggleGroup } from "radix-ui";

export type ViewMode = "minify" | "beautify" | "object" | "tree";

const ITEM =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium text-[0.8rem] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/60 [&_svg]:size-3.5 [&_svg]:shrink-0";

const OPTIONS: { value: ViewMode; label: string; title: string; Icon: typeof AlignLeft }[] = [
  { value: "minify", label: "Minify", title: "One line, wrapped to fit", Icon: Minimize2 },
  { value: "beautify", label: "Beautify", title: "Indented, one value per line", Icon: AlignLeft },
  { value: "object", label: "Object", title: "Documents, like MongoDB Compass", Icon: Table2 },
  {
    value: "tree",
    label: "Tree",
    title: "Collapsible tree; handles very large files",
    Icon: ListTree,
  },
];

/**
 * Single-choice switch for how the JSON is shown. Clicking the selected option
 * again re-applies it (e.g. re-minify after edits), so `onSelect` always gets a mode.
 * `disabled` maps an option to the reason it is unavailable (shown as its tooltip).
 */
export function ViewModeSwitch({
  mode,
  onSelect,
  disabled = {},
}: {
  mode: ViewMode;
  onSelect: (mode: ViewMode) => void;
  disabled?: Partial<Record<ViewMode, string>>;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={mode}
      onValueChange={(value) => onSelect((value || mode) as ViewMode)}
      aria-label="View"
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      {OPTIONS.map(({ value, label, title, Icon }) => (
        <ToggleGroup.Item
          key={value}
          value={value}
          className={ITEM}
          disabled={Boolean(disabled[value])}
          title={disabled[value] ?? title}
        >
          <Icon aria-hidden />
          {label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
