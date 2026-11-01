# CLAUDE.md

Fast, private, keyboard-first JSON/JSONL viewer. Static Vite + React + TS app, deployed to Vercel. The roadmap and task list live in `PLAN.md`; work one task at a time, in order.

## Commands

```bash
pnpm dev          # Vite dev server
pnpm lint         # Biome: lint + format check + import sorting
pnpm format       # Biome: apply safe fixes and formatting
pnpm test         # Vitest (jsdom), runs once
pnpm build        # tsc -b && vite build -> dist/
pnpm fixtures     # generate test files in fixtures/ (--small, or by name); deterministic
```

Deploys: Vercel builds from `vercel.json` (production = `main`, preview per PR). CI in `.github/workflows/ci.yml` runs lint, test and build.

After every task: `pnpm lint && pnpm test && pnpm build` must pass, then stop for review.

## Hard rules

- **No data leaves the browser.** No backend, no analytics, no third-party requests at runtime (no web fonts from CDNs, etc.).
- **The CSP in `vercel.json` enforces privacy.** It allows only `'self'` for scripts and connections, and no inline scripts (put pre-paint code in `public/`). A feature that needs another origin must update the policy deliberately; `tests/deploy-config.test.ts` guards it.
- **No `innerHTML` / `dangerouslySetInnerHTML`.** Biome enforces `noDangerouslySetInnerHtml` as an error. Render untrusted JSON as text only.
- **The full document lives only in the worker.** The main thread asks for row windows; never `postMessage` the whole tree. The one exception is the text views (Minify / Beautify / Object), which hold the editor text on the main thread and are limited to 20 MB (`TEXT_VIEW_LIMIT`); bigger documents go straight to the worker and open in Tree mode.
- **No recursion over document data.** Use iterative traversal (500-level nesting must not blow the stack).
- Use the current official docs for library config; don't rely on memory.

## Layout

- `src/app/` — `App.tsx` (toolbar / main pane / status bar shell), app-level hooks.
- `src/components/ui/` — shadcn/ui components. `src/components/<feature>/` for app components.
- `src/components/editor/` — `EditorPane` (view switch, Open / drag-and-drop / paste-anywhere, Copy / Clear, validation, big-file routing), `ViewModeSwitch` (single-choice **Minify · Beautify · Object · Tree**; Minify soft-wraps the one-line JSON, and a paste into an empty editor follows the selected mode), `ErrorPanel`, and `JsonEditor` (CodeMirror 6, lazy-loaded into its own chunk). Tests swap in `tests/fakes/FakeJsonEditor.tsx` because CodeMirror doesn't run in jsdom.
- `src/components/tree/` — Tree mode: `TreePane` (loading / error / ready), `TreeView` (virtualized rows fetched from the worker in prefetched windows), `TreeRow`, `TreeToolbar` (expand 1/2/3/all, collapse all; confirm above 500k nodes), `SidePanel` (path, type, size, value, copy actions). State in `src/store/useTreeStore.ts`.
- `src/workers/` — `parser.worker.ts` exposes the `DocumentEngine` via Comlink (files are read inside the worker); `client.ts` starts it lazily. Tests replace the client with `tests/fakes/inProcessParser.ts` (globally, in `tests/setup.ts`) because jsdom has no workers.
- `src/components/documents/` — MongoDB Compass-style document view (the **Object** option of the editor's view switch): `DocumentView` (virtualized cards via `@tanstack/react-virtual`, expansion state kept above the list), `FieldList` (`key: value` rows, paged children). Value formatting and Extended JSON (`$oid`, `$date`, …) live in `src/lib/bson.ts`. Tests stub layout with `tests/helpers/layout.ts`.
- `src/store/` — Zustand stores (`useViewerStore`, `useThemeStore`).
- `src/lib/` — pure logic. Unit-test everything here.
  - `node-index.ts`: iterative one-pass validator + preorder typed-array index (offsets into the text, ~23 bytes/node, numbers never materialized). `engine.ts`: `DocumentEngine` (row windows with checkpoints, expand/collapse, node detail, lossless copy) — runs in the worker.
  - `json-string.ts` (decode only the shown part of a string), `reformat.ts` (lossless re-indent/minify of valid JSON text), `path.ts` (JSONPath with quoted special keys), `clipboard.ts`.
  - `json.ts` parses/formats the editor text with `lossless-json`; `errors.ts` maps parser positions to line/column + snippet.
- `src/styles/globals.css` — Tailwind v4 entry + shadcn theme tokens (neutral). Dark mode is the `.dark` class on `<html>`.
- `scripts/gen-fixtures.ts` — fixture CLI (Node runs the `.ts` directly). Generators are pure and live in `scripts/fixtures/` so tests can import them. Big fixtures are gitignored; small ones are committed and must match the generator (`tests/fixtures.test.ts`). Biome skips `fixtures/` (it contains invalid JSON on purpose).
- `tests/` — Vitest tests (`*.test.ts[x]`); `tests/setup.ts` mocks `matchMedia` and the parser worker. `tests/node/` holds tests that need Node APIs (type-checked by `tsconfig.node.json`), e.g. the security pass that scans `src/` for `innerHTML`, `eval`, etc.
- Import alias: `@/` → `src/`.

## Conventions

- Biome formatting: 2-space indent, double quotes, semicolons, 100-col lines. Run `pnpm format` rather than hand-formatting.
- TypeScript strict. Prefer `type` imports (`verbatimModuleSyntax` is on).
- shadcn/ui: `components.json` targets style `radix-nova`, base color `neutral`, icons `lucide`. Add components with `pnpm dlx shadcn@latest add <name>`, then run `pnpm format`.
- JSON syntax colors are CSS variables (`--syntax-key`, `--syntax-string`, …) in `globals.css`, also exposed as Tailwind colors (`text-syntax-string`). Reuse them for the tree view.
- Theme: `system | light | dark`, stored in `localStorage` under `json-viewer:theme` (absent = system). `public/theme-init.js` (loaded by `index.html` before first paint) mirrors `src/store/useThemeStore.ts` — keep them in sync.
