# CLAUDE.md

Fast, private, keyboard-first JSON/JSONL viewer. Static Vite + React + TS app, deployed to Vercel. The roadmap and task list live in `PLAN.md`; work one task at a time, in order.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm lint         # Biome: lint + format check + import sorting
pnpm format       # Biome: apply safe fixes and formatting
pnpm test         # Vitest (jsdom), runs once
pnpm build        # tsc -b && vite build -> dist/
```

After every task: `pnpm lint && pnpm test && pnpm build` must pass, then stop for review.

## Hard rules

- **No data leaves the browser.** No backend, no analytics, no third-party requests at runtime (no web fonts from CDNs, etc.).
- **No `innerHTML` / `dangerouslySetInnerHTML`.** Biome enforces `noDangerouslySetInnerHtml` as an error. Render untrusted JSON as text only.
- **The full document lives only in the worker.** The main thread asks for row windows; never `postMessage` the whole tree.
- **No recursion over document data.** Use iterative traversal (500-level nesting must not blow the stack).
- Use the current official docs for library config; don't rely on memory.

## Layout

- `src/app/` — `App.tsx` (toolbar / main pane / status bar shell), app-level hooks.
- `src/components/ui/` — shadcn/ui components. `src/components/<feature>/` for app components.
- `src/store/` — Zustand stores (`useViewerStore`, `useThemeStore`).
- `src/lib/` — pure logic (formatting now; node index, rows, paths, search later). Unit-test everything here.
- `src/styles/globals.css` — Tailwind v4 entry + shadcn theme tokens (neutral). Dark mode is the `.dark` class on `<html>`.
- `tests/` — Vitest tests (`*.test.ts[x]`); `tests/setup.ts` mocks `matchMedia`.
- Import alias: `@/` → `src/`.

## Conventions

- Biome formatting: 2-space indent, double quotes, semicolons, 100-col lines. Run `pnpm format` rather than hand-formatting.
- TypeScript strict. Prefer `type` imports (`verbatimModuleSyntax` is on).
- shadcn/ui: `components.json` targets style `radix-nova`, base color `neutral`, icons `lucide`. Add components with `pnpm dlx shadcn@latest add <name>`, then run `pnpm format`.
- Theme: `system | light | dark`, stored in `localStorage` under `json-viewer:theme` (absent = system). `index.html` has a pre-paint script that mirrors `src/store/useThemeStore.ts` — keep them in sync.
