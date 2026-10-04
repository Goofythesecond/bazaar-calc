# @bc/collector

Data collectors: the collector for players (files for pull requests) and the always-on scanner (pushes to GitHub).

**Depends on:** `@bc/shared`. Each is bundled into one file, so it needs no install (Node 18 or newer).

| File | What it does |
|---|---|
| `src/collect.ts` | The Node collector, bundled to `dist/bazaar-calc-collector.mjs`. Records contribution files for pull requests (`--name <login>`, `--out`, `--no-bins`) |
| `src/scanner.ts` | The always-on scanner, bundled to `dist/bazaar-calc-scanner.mjs`: the same recording, a file every 30 minutes committed straight to the repository, and paper trading around the clock |
| `src/poll.ts` | The polling loops both use: bazaar every 20 s, ended auctions every 30 s, the election hourly, the lowest-BIN scan |
| `src/github.ts` | Commits files through GitHub's REST API (no git needed), all files of a push in one commit |
| `src/server-upload.mjs` | The older uploader for a self-hosted server's API (`BC_API_KEY`, `BC_SERVER`): sends raw Hypixel responses |
| `test/github.test.mjs` | `github.ts` against a fake GitHub API (one commit, retry when the branch moved, no retry on a bad token) |

The recording logic itself is `DataCollector` in `@bc/shared` (data module), shared with the browser collector and
the server's scanner.

```bash
pnpm --filter @bc/collector build   # type check + both bundles
pnpm --filter @bc/collector test    # GitHub client tests
```

## The always-on scanner

The website's history (typical prices, fill times, competition, outlook, mayors, auction prices) only grows while
someone records. The scanner records around the clock on a small host and sends the data to GitHub every 30 minutes;
the publish workflow then rebuilds the site (about 2 minutes). No calculator runs on the host: GitHub does the maths,
and visitors' browsers calculate on live prices.

**What it records** (exactly what the server's scanner records, checked by the same rules as contributed files):
- the bazaar every 20 s: hourly closes, book flow, real trades from Hypixel's 7-day counters, time-on-top episodes
- ended auctions every 30 s (item, price, time only: no player data), lowest BINs every 30 minutes (all ~45 pages)
- the mayor election every hour

**Paper trading:** on every snapshot it runs the calculator's best bazaar flips as virtual orders (fill/paper.ts),
following only the items it trades. The picks come from `paper-candidates.json` in the website's data folder, which the publish
workflow computes; picks over 2 hours old open no new trades. The record goes to `data/paper/<login>.json` with each
push and shows on the site's Track record page.

**Memory** (measured 2026-10-04 over 15 minutes with two BIN scans): peak 360 MB with Node's default heap, 329 MB
started with `--max-old-space-size=192`. On a 512 MB host use that option (see below); if the host still stops it for
memory, set `"bins": false` (the BIN scan is the biggest part).

### Set it up

1. **A token.** On GitHub: Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new
   token. Repository access: *Only select repositories* > `bazaar-calc`. Repository permissions: *Contents: Read and
   write*. Nothing else. Pick an expiry and remember to renew it (the scanner keeps recording and queues files while
   the token does not work; queued files are pushed once it works again).
2. **Files on the host**, in one folder:
   - `bazaar-calc-scanner.mjs` (build it with `pnpm --filter @bc/collector build`, from `packages/collector/dist/`)
   - `scanner.config.json`: `{ "name": "<your GitHub login>" }`
   - `github-token.txt`: the token, nothing else. Never commit or share this file. (Or set `GITHUB_TOKEN`.)
3. **Start it:** `node --max-old-space-size=192 bazaar-calc-scanner.mjs`. On a panel host such as Wispbyte, choose a
   Node.js 18+ server, upload the three files, set the startup file to `bazaar-calc-scanner.mjs` and, if the panel
   lets you, add `--max-old-space-size=192` to the Node options.
4. **Check the log:** `GitHub: <repo> writable with this token`, then every 30 minutes a line per file and
   `pushed 1 data file(s) + paper record ... (commit abc1234)`. On GitHub a commit "Data from <login>'s scanner"
   appears and *Publish the website* runs.

**Settings** (`scanner.config.json`, all but `name` optional):

| Key | Default | Meaning |
|---|---|---|
| `name` | – | your GitHub login; files are named after it |
| `repo`, `branch` | `Goofythesecond/bazaar-calc`, `main` | where to push |
| `everyMin` | 30 | minutes per file and push |
| `bins`, `binsEveryMin` | `true`, 30 | the lowest-BIN scan (about 60 MB of downloads each) |
| `paper`, `checkMin`, `flipperLevel` | `true`, 5, 0 | paper trading: how often you would look at your orders, your Bazaar Flipper level |
| `site` | the project's GitHub Pages address | where the paper-trading picks are read |
| `out` | `scanner-data` | the working folder (see below) |
| `keepDays` | 2 | how long pushed files are kept on the host |
| `tokenFile` | `github-token.txt` | the token file, next to the config |

**The working folder** (`out`): `pending/` holds files waiting for a push, `sent/` pushed ones (deleted after
`keepDays`), `rejected/` files that failed the checks (never pushed), `paper.json` the paper-trading state (a restart
carries on), and `status.json` (last push, last error, files waiting, memory, paper summary).

**Stopping** (Ctrl+C or the panel's stop): the scanner closes the current file and pushes it before it exits (25 s at
most). A restart starts a new file; file names carry a 4-character tag per run so they never clash.

`--dry-run` records and writes files but pushes nothing; `--help` lists the settings.
