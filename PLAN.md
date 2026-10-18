# JSON Viewer — Build Plan

A fast, private, keyboard-first JSON/JSONL viewer for daily use, with features for AI/ML work (embeddings, LLM traces, eval dumps).
Static web app on Vercel (Hobby), installable as a PWA. Tauri wrapper is optional later.

> **How to use this file (for Claude Code):** Work one task at a time, in order. After each task: run `pnpm lint && pnpm test && pnpm build`, summarize what changed, and stop so I can review and commit. Tick the checkbox when a task is merged. Don't start the next phase until the current phase's "Done when" checks pass.

---

## 1. Goals and non-goals

**Goals**
- Opens a 50MB file in under 3s without freezing the UI. Large files stay smooth at 60fps scroll.
- No data leaves the browser. No backend, no analytics on content.
- Faster than VS Code for "find a field in an API response."
- First-class JSONL support, plus AI-specific views.

**Non-goals (for now)**
- Editing or writing JSON back. This is a viewer first.
- Accounts, cloud storage, or a server-side share feature.
- Graph view.

## 2. Stack

| Concern | Choice |
|---|---|
| Build | Vite + React + TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Parsing | `lossless-json` in a Web Worker via `comlink` |
| Virtualization | `@tanstack/react-virtual` |
| Raw text pane | CodeMirror 6 (`@codemirror/lang-json`) |
| Query (Phase 3) | `jsonpath-plus` |
| PWA (Phase 2) | `vite-plugin-pwa` |
| Lint/format | Biome |
| Tests | Vitest (unit), Playwright (a few e2e smoke tests) |
| Package manager | pnpm |
| Hosting | Vercel Hobby, auto-deploy from `main` |

Follow each library's current official setup docs for Vite. Don't rely on memory for config syntax.

## 3. Architecture

```
Main thread (React)                    Worker (parser.worker.ts)
───────────────────                    ─────────────────────────
load(text | File) ───────────────────▶ parse with lossless-json
                                       build compact node index
                  ◀──── {ok, stats} or {error, line, col}
getRows(start, end) ─────────────────▶ walk visible nodes
                  ◀──── Row[] (only that window)
toggle(id) / expandToDepth(n) ───────▶ update expanded set
                  ◀──── new visibleCount
search(query, opts) ─────────────────▶ scan index
                  ◀──── match ids + ancestor ids to expand
```

**Key rule:** the full document lives only in the worker. The main thread holds `visibleCount` and asks for row windows as the user scrolls. Never send the whole tree with `postMessage`.

**Node index (worker):** assign ids in preorder. Store `parent`, `firstChild`, `nextSibling`, `depth`, `type`, and `childCount` in typed arrays (`Int32Array`, `Uint8Array`), with keys and primitive values in side arrays. Expanded state is a `Set<number>` or bitset.

**Row (sent to UI):**
```ts
type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

interface Row {
  id: number;
  depth: number;
  key: string | number | null; // null for root, number for array index
  type: NodeType;
  preview: string;             // truncated display value or "{12}" / "[340]"
  childCount: number;          // 0 for primitives
  expanded: boolean;
  isMatch?: boolean;
}
```

**Paths:** compute JSONPath on demand from the parent chain (`$.users[3].email`), and quote keys with special characters (`$["a.b"]`).

**Errors:** convert the parser's character position to line and column, and show a snippet with a caret.

## 4. Folder structure

```
src/
  app/            App.tsx, layout, providers
  components/
    tree/         TreeView.tsx, TreeRow.tsx
    toolbar/      Toolbar.tsx
    search/       SearchBar.tsx
    input/        DropZone.tsx, PasteDialog.tsx
    raw/          RawEditor.tsx (CodeMirror)
  workers/        parser.worker.ts, api.ts (Comlink types)
  lib/            index.ts (node index), rows.ts, path.ts, search.ts, jsonl.ts, errors.ts
  store/          useViewerStore.ts
  styles/
scripts/          gen-fixtures.ts
fixtures/         generated test files (gitignored except small ones)
tests/            *.test.ts, e2e/
```

---

## 5. Phases

### Phase 0: Project setup
- [x] 0.1 Scaffold Vite React-TS, add Tailwind, shadcn/ui, Biome, Vitest, Zustand. Add scripts `dev`, `build`, `preview`, `lint`, `format`, `test`.
- [x] 0.2 Base layout: toolbar on top, main pane, status bar (file name, size, node count, parse time). Dark/light mode follows the system, with a toggle.
- [ ] 0.3 `scripts/gen-fixtures.ts` generates:
  - `deep.json`: 500 levels of nesting
  - `wide.json`: an array of 200k objects
  - `big-50mb.json` and `big-200mb.json`
  - `bigint.json`: IDs like `12345678901234567890`
  - `unicode.json`: emoji, RTL, escapes, `\u0000`
  - `bad.json`: a syntax error on a known line and column
  - `data.jsonl`: 100k lines, including 3 malformed lines
  - `embeddings.json`: records with 1024-dim float arrays
  - `llm-trace.json`: OpenAI/Anthropic-style `messages` with `tool_calls` and `usage`
- [ ] 0.4 Verify deploy on Vercel. Build output is `dist`.

**Done when:** `pnpm build` passes, the empty shell is live on Vercel, and the fixtures are generated.

### Phase 1: Core viewer (v0)
- [ ] 1.1 Worker + Comlink API: `load`, `getRows`, `toggle`, `expandToDepth`, `collapseAll`, `stats`. Unit-test the index and row windowing.
- [ ] 1.2 Input: paste (`⌘V` anywhere when nothing is focused), drag-and-drop, and a file picker. Show a loading state with parse progress if possible.
- [ ] 1.3 Virtualized `TreeView`: indent guides, type colors, array index labels, `{n}`/`[n]` counts, and truncated long strings with a full value on hover or in the side panel.
- [ ] 1.4 Expand controls: expand to depth 1/2/3/all and collapse all. Expanding "all" on huge files asks for confirmation or caps at N rows.
- [ ] 1.5 Selection + side panel: shows the selected node's path, type, full value, and size. Buttons for Copy path, Copy value, and Copy as formatted JSON.
- [ ] 1.6 Toolbar: format, minify, and copy the whole document. A raw view toggle opens CodeMirror (disabled above roughly 20MB, with a message).
- [ ] 1.7 Parse errors: a clear panel with line, column, and a snippet.
- [ ] 1.8 Security pass: no `innerHTML` or `dangerouslySetInnerHTML` anywhere, and grep to prove it.

**Done when:** `big-50mb.json` opens in under 3s and scrolls smoothly; `bigint.json` keeps exact digits; `bad.json` shows the right line and column; `deep.json` doesn't crash (iterative traversal, no recursion).

### Phase 2: Daily-driver essentials
- [ ] 2.1 Search (`⌘K` / `⌘F`): keys, values, or both; case-sensitive and regex toggles; match count; next/previous (`Enter` / `⇧Enter`); auto-expand ancestors; highlight matches. Runs in the worker, cancellable.
- [ ] 2.2 JSONL: auto-detect (or a toggle), each line becomes a root row (`#1`, `#2`, …), and malformed lines are listed in an error panel without failing the load.
- [ ] 2.3 Keyboard navigation: `↑`/`↓` to move, `→`/`←` to expand/collapse or go to the parent, `Space` to toggle, `c` to copy the path, `y` to copy the value, `?` for a shortcuts overlay.
- [ ] 2.4 Breadcrumb bar for the selected path; click a segment to jump to it.
- [ ] 2.5 PWA: installable, works offline, and registers `file_handlers` for `.json`/`.jsonl` (Chromium) so it can be the "Open With" app.
- [ ] 2.6 On app open: if the clipboard contains valid JSON, offer one-click load. Requires permission, so it must never be automatic or silent.
- [ ] 2.7 Recent items: the last 10 entries, stored locally (IndexedDB) with name, size, and date only. Content is stored only if I enable it in settings. Include a "Clear history" button.
- [ ] 2.8 Load from URL with optional Bearer header. Show a clear CORS error message when it fails.

**Done when:** it's my default JSON tool for a full week, and every annoyance from that week is logged in `TODO.md`.

### Phase 3: AI/ML features
- [ ] 3.1 Embedding collapse: numeric arrays longer than N (default 64) render as `float[1024] · ‖v‖=1.00 · μ=… σ=…` with a sparkline. Expand on demand. The threshold is configurable.
- [ ] 3.2 Table view: for an array of objects or JSONL rows, show a virtualized grid with auto-discovered columns, sorting, a filter per column, and nested values shown as previews. Export to CSV.
- [ ] 3.3 LLM trace view: detect `messages[]` (role/content), `tool_calls`, and `usage`. Render a chat transcript with role badges, collapsible tool calls and results, and token totals. Toggle back to the tree.
- [ ] 3.4 Query bar: JSONPath via `jsonpath-plus`, with results as a filtered tree and a "copy results" button.
- [ ] 3.5 Related values: for the selected key, list all values of that key across the document, with counts, distinct values, and missing/undefined occurrences.
- [ ] 3.6 Diff two documents or JSONL runs (join by a chosen ID field): added, removed, and changed, with a side-by-side detail view.

### Phase 4: Optional
- [ ] 4.1 Schema inference and generating TypeScript types (`quicktype-core`)
- [ ] 4.2 Tauri wrapper for macOS: native "Open With", file watching with live reload, and files over 500MB parsed in Rust
- [ ] 4.3 Graph view

---

## 6. Performance budgets (test on `fixtures/`)

| Scenario | Target |
|---|---|
| Open 50MB JSON | < 3s to first rows |
| Open 200MB JSON | Works, < 10s, UI never frozen |
| Scroll | 60fps, no blank rows |
| Search 50MB (plain text) | < 1s to first results |
| Expand/collapse | < 50ms |
| Bundle (gzipped, excluding CodeMirror chunk) | < 300KB |

Lazy-load CodeMirror, jsonpath, and the diff code.

## 7. Workflow

```bash
git checkout -b feat/<task-id>-<short-name>
claude                     # "Do task X.Y from PLAN.md"
pnpm dev                   # test with fixtures
pnpm lint && pnpm test && pnpm build
git commit -am "feat(X.Y): ..."
git push -u origin HEAD && gh pr create --fill   # check the Vercel preview URL
gh pr merge --squash --delete-branch
```

- One task per branch and per Claude session; clear the context between tasks.
- If I correct Claude on the same thing twice, add the rule to `CLAUDE.md`.
- Log friction from daily use in `TODO.md` and promote items into this plan.

## 8. Kickoff prompts

**Session 1**
> Read CLAUDE.md and PLAN.md. Do Phase 0, tasks 0.1 and 0.2 only. Use current official setup docs for Tailwind and shadcn with Vite. Stop when `pnpm build` passes.

**Session 2**
> Do task 0.3 from PLAN.md (fixture generator). Make the generator deterministic (seeded) and gitignore the large outputs.

**Later sessions**
> Do task X.Y from PLAN.md. Check the "Done when" criteria for this phase, add tests, and stop for review.
