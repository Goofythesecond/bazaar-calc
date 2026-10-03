# @bc/web

The React website. **Depends on:** `@bc/shared` only. It never uses server code, because the static build must run
without a server.

The same pages build two ways:
- **Self-hosted** (`pnpm --filter @bc/web build`): pages call the API server.
- **Static, for GitHub Pages** (`scripts/site/build-pages.mjs`, `VITE_STATIC=1`): `api()` in `src/lib.ts` sends
  requests to `src/static/backend.ts`, which runs in a Web Worker. Live prices come from Hypixel; history comes from
  the published data files.

| Path | What it holds |
|---|---|
| `src/main.tsx` | Entry and page routes |
| `src/lib.ts` | `api()`, number / time formatting, saved settings, data-age notes |
| `src/state.tsx`, `src/theme.ts` | Settings and unlocks state; theme |
| `src/pages/Planner.tsx` | Best route |
| `src/pages/Flips.tsx` | Flip tables |
| `src/pages/Market.tsx` | Outlook, Items, Item, Events & mayors |
| `src/pages/Info.tsx` | Self-hosted reference pages: Timing, Contribute, API, Status, Sources |
| `src/pages/Static.tsx` | Static-site versions: Contribute (collectors), Data status, Data files |
| `src/components/` | Charts, layout, route detail, order plan, fill panel, settings drawer, icons |
| `src/static/backend.ts` | The static site's backend: the same `/api/v1/...` paths, answered in the browser |
| `src/static/worker.ts`, `src/static/client.ts` | Run that backend in a Web Worker and talk to it |
| `src/static/collect-worker.ts` | The browser data collector |

**Adding an API call:** add it to `packages/api` and to `src/static/backend.ts`, otherwise the static site shows "not
available". Check pages with `scripts/checks/screenshot.mjs`, at 1440 px and 390 px wide.
