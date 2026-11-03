import { ChevronDown, ChevronUp, LoaderCircle, Search, X } from "lucide-react";
import { ToggleGroup } from "radix-ui";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SearchOptions, SearchScope } from "@/lib/engine";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useTreeStore } from "@/store/useTreeStore";

const DEBOUNCE_MS = 200;

const SCOPES: { value: SearchScope; label: string }[] = [
  { value: "both", label: "All" },
  { value: "keys", label: "Keys" },
  { value: "values", label: "Values" },
];

const sameSearch = (q: string, o: SearchOptions, q2: string, o2: SearchOptions) =>
  q === q2 && o.scope === o2.scope && o.caseSensitive === o2.caseSensitive && o.regex === o2.regex;

/** Search keys and/or values in the worker (PLAN.md 2.1). Enter / ⇧Enter step through matches. */
export function SearchBar() {
  const search = useTreeStore((s) => s.search);
  const searchFocus = useTreeStore((s) => s.searchFocus);
  const runSearch = useTreeStore((s) => s.runSearch);
  const stepMatch = useTreeStore((s) => s.stepMatch);
  const closeSearch = useTreeStore((s) => s.closeSearch);
  const [query, setQuery] = useState(search.query);
  const [options, setOptions] = useState(search.options);
  const inputRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refocus whenever ⌘F is pressed again.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [searchFocus]);

  useEffect(() => {
    const timer = window.setTimeout(() => void runSearch(query, options), query ? DEBOUNCE_MS : 0);
    return () => window.clearTimeout(timer);
  }, [query, options, runSearch]);

  const setOption = (patch: Partial<SearchOptions>) => setOptions((o) => ({ ...o, ...patch }));
  const total = search.ids.length;
  const stale = !sameSearch(query, options, search.query, search.options);

  let summary = "";
  if (search.error) summary = "Invalid regular expression";
  else if (query && (search.searching || stale)) summary = "Searching…";
  else if (query && total === 0) summary = "No matches";
  else if (total > 0) {
    summary = `${search.current >= 0 ? formatCount(search.current + 1) : "–"} of ${formatCount(total)}${search.capped ? "+" : ""}`;
  }

  return (
    <search className="flex shrink-0 flex-wrap items-center gap-1 border-b bg-muted/30 px-2 py-1 text-xs">
      <div className="relative flex min-w-48 flex-1 items-center">
        <Search
          className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground"
          aria-hidden
        />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search"
          placeholder="Search keys and values"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              // Run a pending search right away; otherwise step through matches.
              if (stale) void runSearch(query, options);
              else void stepMatch(e.shiftKey ? -1 : 1);
            } else if (e.key === "Escape") {
              e.preventDefault();
              closeSearch();
            }
          }}
          className={cn(
            "h-7 w-full rounded-md border bg-background pr-2 pl-7 font-mono text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            search.error && "border-destructive",
          )}
        />
      </div>
      <ToggleGroup.Root
        type="single"
        value={options.scope}
        onValueChange={(value) => value && setOption({ scope: value as SearchScope })}
        aria-label="Search in"
        className="inline-flex items-center gap-0.5 rounded-md bg-muted p-0.5"
      >
        {SCOPES.map(({ value, label }) => (
          <ToggleGroup.Item
            key={value}
            value={value}
            className="rounded px-2 py-0.5 font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm dark:data-[state=on]:bg-input/60"
          >
            {label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      <Button
        size="xs"
        variant={options.caseSensitive ? "secondary" : "ghost"}
        aria-pressed={options.caseSensitive}
        aria-label="Match case"
        title="Match case"
        onClick={() => setOption({ caseSensitive: !options.caseSensitive })}
        className="font-mono"
      >
        Aa
      </Button>
      <Button
        size="xs"
        variant={options.regex ? "secondary" : "ghost"}
        aria-pressed={options.regex}
        aria-label="Regular expression"
        title="Regular expression"
        onClick={() => setOption({ regex: !options.regex })}
        className="font-mono"
      >
        .*
      </Button>
      <span
        aria-live="polite"
        className={cn(
          "min-w-24 px-1 text-right tabular-nums",
          search.error ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {search.searching && (
          <LoaderCircle className="mr-1 inline size-3 animate-spin" aria-hidden />
        )}
        {summary}
      </span>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Previous match"
        title="Previous match (⇧Enter)"
        disabled={total === 0}
        onClick={() => void stepMatch(-1)}
      >
        <ChevronUp />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Next match"
        title="Next match (Enter)"
        disabled={total === 0}
        onClick={() => void stepMatch(1)}
      >
        <ChevronDown />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Close search"
        title="Close (Esc)"
        onClick={closeSearch}
      >
        <X />
      </Button>
    </search>
  );
}
