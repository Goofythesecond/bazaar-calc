# Bazaar Calc

A free, open-source Hypixel SkyBlock market calculator. It finds and ranks four kinds of flips, and plans the best
combination of them for your coins, slots, unlocks and playing time:

- **Bazaar flips**: buy order, then relist as a sell offer.
- **Craft flips**: buy ingredients, craft (including intermediate crafts), sell.
- **Book flips**: combine low-level enchanted books up to the highest level that can be combined, then sell.
- **Forge flips**: buy or craft the inputs, forge them, sell the output.

Every route is listed with the full working, order sizes for the daily bazaar limit, measured fill times and market
warnings (spoofed walls, mass delists, pumped prices).

> Not affiliated with or endorsed by Hypixel. NOT AN OFFICIAL MINECRAFT SERVICE. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.

## Two ways to run it

**1. The website on GitHub Pages (no server).** The calculator runs in your browser: live prices come straight from
Hypixel's public API, and everything that needs history comes from data the community records and sends in through
pull requests. This repository builds and publishes it automatically (`.github/workflows/publish.yml`):

- fill times and competition
- typical prices
- manipulation checks
- auction prices
- mayors

**2. Your own server.** The same calculator with its own 20-second scanner, a JSON API and contributor accounts. See
[Self-hosting](#self-hosting).

## Contributing data

The website is only as fresh as the data people send in. To help:

1. Record with the browser collector on the site's **Contribute** page, or the dependency-free Node collector:
   `node bazaar-calc-collector.mjs --name <your GitHub login>` (download it from the Contribute page, or build it with
   `pnpm --filter @bc/collector build`).
2. Upload the `.json.gz` files to [`data/inbox/`](data/inbox) on GitHub and open a pull request.
3. A check opens each file, verifies it, and compares it with other recordings of the same time. Everybody who polled
   the same Hypixel snapshot recorded identical values, so overlaps must match exactly.
4. The maintainer merges, and the site rebuilds with the data within minutes.

Details, file format and limits: [CONTRIBUTING.md](CONTRIBUTING.md). How the GitHub workflows work and what to do
when one fails: [docs/WORKFLOWS.md](docs/WORKFLOWS.md). Working on the code with an AI coding agent: [AGENTS.md](AGENTS.md).

## What's inside

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how the parts fit together and where to make each kind of change.
Every package has a README listing its files.

| Path | What it is |
|---|---|
| `packages/shared` | All calculations, the same code on the server, in the browser and in the collectors. Layered modules: `rules`, `market`, `recipes`, `fill`, `calc`, `data`, `service` |
| `packages/server-core` | Database, Hypixel client, ingestion, statistics, import / export of contribution files |
| `packages/worker` | The scanner's background jobs |
| `packages/api` | REST API (`/api/v1/*`, OpenAPI at `/api/openapi.json`), Discord login, API keys; serves the website |
| `packages/web` | The website. Built normally it talks to the API; built with `VITE_STATIC=1` it runs everything in the browser |
| `packages/collector` | The Node data collector, bundled into one file |
| `scripts/` | Checks (`scripts/checks/`), the contribution data pipeline (`scripts/data/`) and the site build (`scripts/site/`) |
| `data/contrib/<login>/` | Approved contributions: the history the website is built from |
| `docs/` | [Architecture](docs/ARCHITECTURE.md) and [workflows](docs/WORKFLOWS.md) |
| `research/RESEARCH.md` | Every rule, with its source |

## Data sources (and only these)

- **Hypixel Public API**: market, auctions (stored without any player ids), election, items.
- **Internet Archive copies of the Hypixel API**: older history, labelled `origin = 6`.
- **NotEnoughUpdates-REPO** (MIT): recipes, forge recipes and durations, unlock requirements, level tables.
- **hypixelskyblock.minecraft.wiki** (CC BY-NC-SA 3.0): enchant combining caps, Enchanting requirements, Forge and Bazaar rules. Facts only, with attribution.
- **No Coflnet, skykings or skyblock.bz data.** Their terms don't allow republishing.

See `NOTICE.md` for attributions. Code: MIT (`LICENSE`).

## Publishing your own copy on GitHub Pages

1. Fork or push this repository to GitHub.
2. In **Settings > Pages**, set **Source: GitHub Actions**.
3. Run the **Publish the website** workflow (Actions tab), or push to `main`.

The workflow does five things:
- moves merged contributions out of `data/inbox`
- imports every file into a temporary database
- syncs recipes (NEU), items and the election (Hypixel)
- computes the same statistics the server computes, as of the newest contributed poll
- deploys the static site

It runs on every push to `main` and once a day. GitHub turns scheduled workflows off after 60 days without commits in
a public repository, so if that happens, re-enable it in the Actions tab.

Size limits:
- **Pages:** 1 GB per site, soft limit of 100 GB of traffic a month.
- **Uploads:** files added in the browser are limited to 25 MB.
- **Repository:** recommended to stay under 1 GB. A full day of contributed data is about 3.5 MB.

To build the same thing locally:

```bash
pnpm install && pnpm -r build
node scripts/data/build-site.mjs --out site-data        # add --offline to skip the recipe / item / election sync
node scripts/site/build-pages.mjs --site-data site-data --base / --out pages
```

## Self-hosting

- `DATABASE_URL=postgres://user:pass@host/db`: a normal Postgres server. Use this for a public site (API and worker can
  run at the same time).
- `DATABASE_URL=pglite:./data/pg`: a built-in Postgres stored in a folder, with nothing to install. Only one process
  can use the folder at a time.

```bash
cp .env.example .env          # set DATABASE_URL, DISCORD_CLIENT_ID/SECRET, SESSION_SECRET, PUBLIC_URL
pnpm install && pnpm build
pnpm db:migrate
node packages/api/dist/all.js          # scanner + API + website in one process on :8787
# or separately: node packages/worker/dist/index.js and node packages/api/dist/index.js
# or: docker compose up -d   (Postgres + api + worker)
```

**Using community data on your server:** `node scripts/data/import.mjs <data/pg or postgres url> data/contrib` (stop
the service first with PGlite). Hours your own scanner already recorded are kept as they are, and importing the same
files twice adds nothing.

**Sending your server's data in:** `node scripts/data/export.mjs <copy of data/pg> <your GitHub login> <out dir>`
writes one file per UTC day. Run it on a copy of the database folder, or with the service stopped.

**Running as a Linux user service:** `deploy/bazaar-calc.service` plus `scripts/bazaar.sh install | status | start | stop | logs | open | linger-on | keepawake-on`.

**Discord login:** create an app at https://discord.com/developers/applications and add the redirect
`${PUBLIC_URL}/api/auth/discord/callback`.

**Database size:**
- Full order books are stored every 20 s.
- The retention job keeps them for `BOOK_DETAIL_DAYS` (default 3), then only the hourly ones.
- In practice that is about 8 GB plus about 30 MB a day.

**Behind a reverse proxy** (Caddy, nginx), set `TRUST_PROXY=1`.

## Checks and tests

```bash
pnpm check                                       # architecture rules + build + all tests (what CI runs)
pnpm -r test                                     # rules, calculators and ingestion
node scripts/checks/audit.mjs                           # self-hosted: re-derive every route from the exact market snapshot
node scripts/checks/screenshot.mjs <dir> [url] [width]  # load every page in headless Chrome, report errors / NaN / overflow
node scripts/checks/backtest.mjs <copy of data/pg>   # fill-model backtest on stored books
```

Contribution files are verified against the server they came from:
- **Export round-trip:** exporting a database and rebuilding the statistics from the files gives the same numbers as
  the server for every item:
  - 24 h / 7-day medians and their hour counts
  - flow and competition
  - time-on-top samples
  - auction prices
- **Collector against the server:** a collector running next to the scanner recorded identical hourly closes and
  time-on-top episodes.

## How the numbers are calculated

Every result on the site has a **Details** view that lists each step with real numbers. In short:

- **Prices:**
  - Buy orders go 0.1 above the best buy order, and sell offers 0.1 below the best sell offer.
  - Instant trades use the best price.
  - Tax depends on your Bazaar Flipper level.
- **Fill speed (measured):**
  - Every poll, each item's best buy order and best sell offer is followed from the moment a new best price appears until it is beaten or gone ("episodes", last 24 h). That gives how long a fresh top order really stays on top and how many units trade against it.
  - Flow per hour is the item's measured trade rate (min of Hypixel's 7-day figure ÷ 168 and what we saw leave the book); the episodes give its shape over time.
  - With fewer than 8 episodes on a side, a standard model (Poisson undercut rate) fills in and the route says "estimated".
- **Batches and order sizes:** a route runs in batches of B: one buy order per ingredient for B × the recipe amount and one sell offer for B, so you only ever sell what you bought. B is the smallest batch that gets the best rate within your coins (orders + stock), daily limit and clicking time. Bigger orders do not fill faster; they only tie up more coins and count more toward the daily limit on every relist. Open a route and press **Order sizes & daily limit** for the batch table.
- **Planner:** coins are handed out in 5% steps, each to the route (new or already picked) that earns the most extra per step, within order slots, forge slots, the daily limit and clicking time. Coins are "tied up at once" (money in orders + unsold stock), so they are reused as items sell; profit made during the day is not reinvested in the estimate.
- **Limits:**
  - Throughput is the lowest of: ingredient supply, output demand, crafting speed, forge slots (runs that fit in your playing hours plus the one you start before logging off), and three budgets solved together at the route's rate: coins (money in orders + stock in offers), clicking time (relists, claims, crafting), and the daily bazaar limit.
  - The daily limit counts every order you create at full value, every relist again, and every instant trade; fills, claims and Flip Order do not. The planner's **Daily limit breakdown** lists every order of every pick.
- **Typical prices (old + new data):** each item gets a typical best price from history (24 h median of hourly closes when at least 6 hours back it, else the 7-day median with at least 12). A sale is never priced more than 10% above that: pushed prices rarely hold until you sell. Routes show both the current and the used price.
- **Trades per hour (old + new data):** what we watched trade in the last 24 h is blended with Hypixel's 7-day average, (observed x hours watched + 7-day x 12) / (hours watched + 12), never above the 7-day average, so a rare item that did not trade for a few hours is not written off.
- **Book ladder:** a book's sale is never priced above the cheapest sell offer of a higher level of the same enchant (nobody pays 12M for Last Stand IV while V costs 3.8M); such books are flagged "above higher level". A 50%+ spread is only flagged when it is wide for that item (expensive books often sit at 50-70%).
- **Likely manipulated:** flagged with the evidence when a price sits far above its typical level (2x, or 1.4x plus a second sign: cheap supply bought out, one small bait buy order far above the rest, a spread 3x its usual). Flagged items stay listed (red tag) but the planner leaves them out. Both get stronger as our own history grows.
- **Audit:** `node scripts/checks/audit.mjs` re-derives every listed route from the exact market snapshot the calculator used (`GET /api/v1/market`), checks books and recipes against the raw sources, and compares with skyblock.bz.
- **Every route is listed**, losing ones too (shown in red at your settings); routes with market warnings come after clean ones; recipes that cannot be priced are listed with the reason.
- **Per item:** the item page shows time on top (survival curve), outbid vs filled, the order-size table and a quota calculator ("how long to buy 10,000?": p10 / p50 / p90 from 2,000 runs over real episodes). API: `GET /api/v1/bazaar/{id}/fill?check=5&qty=10000`.
- **Requirements:** come from NEU's craft text (collections, HotM, slayer, reputation), the Forge (HotM 2), and XP costs for combining books.
- Two planner picks never order the same item (they would compete with each other).
