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

## Deploy (Vercel)

The app is a static site; `vercel.json` holds the build settings and security headers.

1. In Vercel: **Add New → Project**, import this repo. The settings come from `vercel.json` (pnpm install, `pnpm build`, output `dist`).
2. Under **Settings → Git**, set the production branch to `main`.
3. Every push to `main` deploys to production; every PR gets a preview URL.

CI (`.github/workflows/ci.yml`) runs lint, tests and build on every PR and push to `main`.

**Security headers.** Production serves a Content-Security-Policy that only allows the app's own origin (`connect-src 'self'`), so the browser itself blocks sending data anywhere else. If a feature needs a new origin (for example, loading JSON from a URL), update the policy in `vercel.json` in the same change.
