# Architecture

How Bazaar Calc is put together, the rules that keep it easy to change, and where to make each kind of change. Written
for people and for AI coding agents alike; [AGENTS.md](../AGENTS.md) adds the working rules for agents, and
[docs/WORKFLOWS.md](WORKFLOWS.md) covers the GitHub workflows.

## Principles

1. **One implementation of every calculation.** The server, the static website and both collectors run the same code
   from `@bc/shared`. A number can't differ between them, because there is no second copy.
2. **Measured, not assumed.** Fill times, competition and typical prices come from recorded order books. Every rule
   has a source (research/RESEARCH.md).
3. **Show everything.** Every route is listed, including losing ones. Unpriceable recipes come with the reason,
   and flagged markets keep their flags.
4. **Structure is checked by a program, not remembered.** `scripts/checks/architecture.mjs` enforces the rules
   below on every push and pull request.

## The parts

```
                         ┌──────────────────────────── @bc/shared ─────────────────────────────┐
                         │  rules → market / recipes → fill → calc / data → service              │
                         └────▲─────────────▲──────────────────▲──────────────────▲────────────┘
                              │             │                  │                  │
 Hypixel API ──▶ @bc/worker ──┤      @bc/server-core       @bc/web             @bc/collector
 (every 20 s)    scanner jobs │   (Postgres / PGlite,   (React; static build   (Node collector,
                              │    ingestion, stats,     runs service/ in a      one bundled file)
                              └── @bc/api ◀─ market)     Web Worker)
                                  REST API + website
```

| Package | Role | May depend on |
|---|---|---|
| `packages/shared` | All calculations, rules, data formats; runs in Node and browsers | – (zod only) |
| `packages/server-core` | Database, Hypixel client, ingestion, statistics, contribution import / export (Node only) | shared |
| `packages/worker` | The scanner's background jobs | shared, server-core |
| `packages/api` | REST API, accounts, serves the website; `all.ts` runs the worker in the same process | shared, server-core, worker |
| `packages/web` | The website (self-hosted build and static GitHub Pages build) | shared |
| `packages/collector` | The players' Node data collector | shared |

Each package has a README listing its files. Other packages import `@bc/<name>` only, never files inside it.

### Inside @bc/shared: layered modules

Each module may import only from the modules to its left, and across modules only through that module's `index.ts`:

```
rules  ←  market, recipes  ←  fill  ←  calc, data  ←  service
```

| Module | Holds | May use |
|---|---|---|
| `rules` | game rules: bazaar, Forge, enchants, calendar, timing, requirements, mayor perks | – |
| `market` | market types, signals and flags, names, book packing, `assembleMarket`, event impact, dips | rules |
| `recipes` | `Recipe`, NotEnoughUpdates-REPO parser | rules |
| `fill` | time-on-top episodes, fill / order-size model, order tracker, paper trading | rules, market |
| `calc` | route engine, route builders (bazaar, craft, book, forge, NPC, Kat, fusion), confidence, planner | rules, market, recipes, fill |
| `data` | Hypixel shapes and checks, NBT reader, contribution file format, collector core | rules, market, fill |
| `service` | endpoint logic shared by the API and the static site | rules, market, recipes, fill, calc |

Why layers: a change in a module can only affect the modules to its right. You can read and test `rules` or `market`
without the calculators, and the import graph has no cycles.

## How data flows

**Self-hosted server:**
1. `@bc/worker` polls Hypixel and `server-core/ingest` stores the polls.
2. `stats.ts` and `hold.ts` compute per-item statistics.
3. `market.ts` loads them and `assembleMarket` (shared) builds the market.
4. `@bc/api` answers with `service` functions (shared), and the website shows the result.

**Static website (GitHub Pages):**
1. The visitor's browser fetches the live bazaar from Hypixel.
2. `web/src/static/backend.ts` combines it with the published data files using the same `assembleMarket` and
   `service` functions.
3. The data files come from `scripts/data/build-site.mjs`, which imports every approved contribution into a temporary
   database and runs the same `server-core` statistics as of the newest poll.

**Contributions:**
1. A collector records a file in the `bazaar-calc-data/1` format, using `DataCollector` from the `data` module.
2. The player opens a pull request into `data/inbox/`.
3. `check-data.yml` verifies the file.
4. The maintainer merges, then `publish.yml` files it under `data/contrib/` and rebuilds the site.

Details: [docs/WORKFLOWS.md](WORKFLOWS.md).

**The always-on scanner** (`packages/collector/src/scanner.ts`): records like any collector on a small host and every 30
minutes commits the new file plus its paper-trading record to `data/contrib/` and `data/paper/` through GitHub's API;
the publish workflow rebuilds the site and writes the picks the scanner trades next (`paper-candidates.json`).

**Live updates and trading tools:**
- Static website: the backend worker fetches Hypixel's bazaar about 1.5 s after each 20-second snapshot while a tab is
  visible (once a minute in the background when alerts or tracked orders need it, otherwise paused) and checks for
  newly published history every 10 minutes. `web/src/live.ts` tells pages to recalculate.
- Self-hosted: the website checks `/api/v1/health` every 10 s and recalculates when the scanner has new data.
- On every snapshot `web/src/runners.ts` checks your tracked orders (`fill/order-tracker.ts`) and flip alerts.
  Paper trading (`fill/paper.ts`) runs in the static worker, or on the server in `api/src/jobs.ts`.
- What a visitor sets up (favourites, orders, alerts, journal, paper record) stays in their browser (`web/src/prefs.ts`).

**Real trades vs book changes:** Hypixel's 7-day counters (`sellMovingWeek`, `buyMovingWeek`) rise by exactly the
units traded instantly between two polls (`counterTrades` in the `data` module); they drop about every 30 minutes when a
batch expires, and those intervals are left unmeasured. Statistics use these trades once an item has at least 1 hour of
them (`flowBasis: "trades"`), and units that left the book otherwise (`"book"`, older data).

**Units and time:**
- Prices are coins in memory and centicoins (integers) in the database and in data files.
- Every time is UTC: database sessions, partitions, hourly buckets, file names.

## Where to change what

| You want to… | Change | Then |
|---|---|---|
| Fix or update a game rule | `packages/shared/src/rules/`, with the source in research/RESEARCH.md | `pnpm --filter @bc/shared test` |
| Add or change a market warning | `computeFlags`, `FLAG_TEXT` and the `flagWhy` evidence in `packages/shared/src/market/signals.ts` | tests; self-hosted `scripts/checks/audit.mjs` |
| Change flip maths or order sizing | `packages/shared/src/calc/` (engine, routes, planner) or `packages/shared/src/fill/` (fill model) | tests, audit, `scripts/checks/backtest.mjs` for the fill model |
| Add a flip type | builder in `packages/shared/src/calc/routes.ts` → `buildOpportunities` and `CALC_KINDS` in `packages/shared/src/service/endpoints.ts` → page and nav in `packages/web` | screenshots of the new page |
| Add an API endpoint | logic in `packages/shared/src/service/` → route in `packages/api/src/routes/` and `openapi.ts` → the same path in `packages/web/src/static/backend.ts` | both sites answer it |
| Add or change a mayor perk | `packages/shared/src/rules/mayor-perks.ts` (with its source) → `Profile` in `requirements.ts` if it changes a calculation | tests; the "Mayor perks" note on the flip pages |
| Change how much a route is trusted | `routeConfidence` in `packages/shared/src/calc/confidence.ts` | tests; the confidence column on the flip pages |
| Change the order tracker or paper trading | `packages/shared/src/fill/order-tracker.ts`, `packages/shared/src/fill/paper.ts` | tests; My orders and Track record pages |
| Add a per-item statistic | `packages/server-core/src/stats.ts` (keep the `now` parameter) → `ItemStats` in `packages/shared/src/market/assemble.ts` | the published `market.json` carries it automatically |
| Add a field to contribution files | `packages/shared/src/data/contrib-format.ts` (new `DATA_FORMAT` version if old files can't be read), `packages/shared/src/data/contrib-collector.ts`, `packages/server-core/src/contrib.ts` import / export | a collector next to a server must still match it exactly (docs/WORKFLOWS.md) |
| Add a website page | `packages/web/src/pages/` → route in `packages/web/src/main.tsx` → nav in `packages/web/src/components/Layout.tsx` → fixed page list in `scripts/site/build-pages.mjs` | `scripts/checks/screenshot.mjs` at 1440 and 390 px |
| Add a scanner job | `packages/worker/src/jobs.ts` (the logic in server-core) | logs show `[job] ok` |
| Add a script | `scripts/<checks or data or site>/`, with a role comment and a line in scripts/README.md | architecture check |

## Conventions

- **Role comment:** every source, script and workflow file starts with a comment saying what it is for. Where it
  matters, the comment also says what the file must not do.
- **Comments:** explain why, with numbers and sources ("polling every 60 s lost ~14% of sales"), not what the next
  line does.
- **Tests:** they sit next to the code (`*.test.ts`) and use real data where possible (`test-data/fixture.json`).
- **No silent drops:** anything left out of a result carries a reason the user can read.
- **Names:**
  - files: `kebab-case.ts`
  - React components: `PascalCase.tsx`
  - one concept per file, named after the concept

## The checks

| Check | Command | What it guards |
|---|---|---|
| Architecture | `node scripts/checks/architecture.mjs` | the structure rules on this page (no install needed) |
| Build and types | `pnpm -r build` | every package compiles, including the website |
| Tests | `pnpm -r test` | rules and calculators on real data, fill model, ingestion on PGlite |
| Same outputs | `node scripts/checks/outputs.mjs` | a refactor changed no result (records every public output on frozen inputs; compare two runs) |
| Audit (self-hosted) | `node scripts/checks/audit.mjs` | every listed route re-derived from the exact market snapshot |
| Pages | `node scripts/checks/screenshot.mjs <dir> <url> <width>` | errors, empty pages, NaN / undefined, content past the screen edge |

`pnpm check` runs the first three. CI runs them in `.github/workflows/architecture.yml` and
`.github/workflows/ci.yml`.

### Refactoring without changing behaviour

Record every public output before and after the change, and require them to be identical:

```bash
node scripts/checks/outputs.mjs --freeze /tmp/frozen --site-data <site-data dir>   # once: save inputs
node scripts/checks/outputs.mjs /tmp/frozen /tmp/before.json                       # before the change
# ...refactor, pnpm --filter @bc/shared build...
node scripts/checks/outputs.mjs /tmp/frozen /tmp/after.json && cmp /tmp/before.json /tmp/after.json
```

What `outputs.mjs` records:
- the market
- every calculator at several settings, and the planner
- fill reports, outlook and events
- requirements and rules
- the Hypixel helpers, the collector and data-file format, and the fill model
- the list of public exports

The October 2026 restructuring into modules was verified this way: all 82 outputs were byte-identical.
