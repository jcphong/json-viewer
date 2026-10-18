# JSON Viewer

A fast, private, keyboard-first JSON/JSONL viewer, with extras for AI/ML work (embeddings, LLM traces, eval dumps). Everything runs in your browser; no data is uploaded.

See [`PLAN.md`](./PLAN.md) for the roadmap.

## Develop

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm dev
```

| Script | What it does |
|---|---|
| `pnpm dev` | Start the Vite dev server |
| `pnpm build` | Type-check and build to `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm lint` | Biome lint + format check |
| `pnpm format` | Apply Biome fixes and formatting |
| `pnpm test` | Run Vitest unit tests |

Stack: Vite, React, TypeScript, Tailwind CSS v4, shadcn/ui, Zustand, Biome, Vitest.
