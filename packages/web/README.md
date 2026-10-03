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
| `src/live.ts` | Live updates: tells pages when a new snapshot (static site: every 20 s while visible) or new history is in |
| `src/prefs.ts` | What stays in this browser: favourites, tracked orders, alert settings, decision journal, paper record |
| `src/runners.ts` | Background work on every snapshot: flip alerts, tracked orders |
| `src/notify.ts` | Toasts, sound, browser notifications, Discord webhook |
| `src/track.ts` | "Track this route": journal entry plus the route's buy orders in My orders |
| `src/pages/Planner.tsx` | Best route |
| `src/pages/Flips.tsx` | Flip tables (bazaar, craft, book, forge, NPC), with confidence, favourites and top picks |
| `src/pages/Dips.tsx` | Items far below their typical price |
| `src/pages/Orders.tsx` | My orders: orders you placed in game, followed on every snapshot |
| `src/pages/Alerts.tsx` | Alert rules and channels; export for a server |
| `src/pages/Record.tsx` | Track record: paper trading and your decision journal |
| `src/pages/Market.tsx` | Outlook, Items, Item, Events & mayors |
| `src/pages/Info.tsx` | Self-hosted reference pages: Timing, Contribute, API, Status, Sources |
| `src/pages/Static.tsx` | Static-site versions: Contribute (collectors), Data status, Data files |
| `src/components/` | Charts, layout, route detail, order plan, fill panel, settings drawer, icons, live badge and perk notes, toasts, quantity calculator |
| `src/static/backend.ts` | The static site's backend: the same `/api/v1/...` paths, answered in the browser |
| `src/static/worker.ts`, `src/static/client.ts` | Run that backend in a Web Worker and talk to it |
| `src/static/collect-worker.ts` | The browser data collector |

**Adding an API call:** add it to `packages/api` and to `src/static/backend.ts`, otherwise the static site shows "not
available". Check pages with `scripts/checks/screenshot.mjs`, at 1440 px and 390 px wide.
