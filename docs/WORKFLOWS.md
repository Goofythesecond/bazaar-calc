# Workflows and maintainer guide

How data gets from a player's computer onto the website, what each GitHub Actions workflow does, and what to do
when one fails. For AI coding agents working on this repository, see [AGENTS.md](../AGENTS.md).

## The whole flow

```
 player's PC / browser                         GitHub                                       website
 ─────────────────────                         ──────                                       ───────
 collector (Node or the Contribute page)
   polls Hypixel's public API every 20 s
   writes <login>_<UTC start>.json.gz  ──upload──▶ data/inbox/ in a pull request
                                                    │
                                                    ▼
                                      "Check contributed data"   (check-data.yml)
                                        opens and checks each file, compares it with
                                        other recordings of the same minutes, writes a report
                                                    │
                                        maintainer reads the report and merges
                                                    ▼
                                      "Publish the website"      (publish.yml)
                                        moves files to data/contrib/<login>/<yyyy-mm>/
                                        builds statistics from all data ─────────────────▶ GitHub Pages
                                        builds the static site and deploys it               goofythesecond.github.io/bazaar-calc
```

The website itself has no server. Each visitor's browser fetches live bazaar prices from Hypixel and runs the
calculator in a Web Worker. The prices update about once a minute while a page is open: the pages re-ask every 60 s,
and the worker fetches from Hypixel at most once every 30 s. Everything that needs history comes from the files the publish workflow builds:
- fill times and competition
- typical prices and manipulation checks
- auction prices and mayors

## Workflow 1: Check contributed data (`.github/workflows/check-data.yml`)

**When it runs:** on every pull request that touches `data/inbox/`.

**What it does:**
1. Checks out the **main branch**, not the pull request. The check script therefore always comes from `main`, so a
   pull request cannot weaken its own check.
2. Fetches the pull request and copies only the **added** `data/inbox/*.json.gz` files out of git. Nothing from the
   pull request is executed.
3. Runs `scripts/data/check-pr.mjs` with the pull request author's GitHub login.
4. Writes a Markdown report to the run's summary (pull request > **Checks** > *Check contributed data* > Summary).
   The run fails when something must be fixed.

**What it checks, per file:**

| Check | Fails when |
|---|---|
| Pull request contents | Anything other than added `.json.gz` files in `data/inbox/` (code changes go in separate pull requests) |
| Size | Over 25 MB (GitHub's limit for browser uploads) |
| Name | Not `<login>_<yyyymmddThhmm>[_suffix].json.gz`, or the login is not the pull request author's |
| Contents | Cannot be decoded, or the login stored inside differs from the name |
| Kind | A database export (`collector.kind = export`): only the maintainer adds those, directly |
| Plausibility (`sanityCheck`) | Any of these:<br>• ends in the future, starts before 2019, or covers more than 8 days<br>• two polls under 5 s apart<br>• duplicate hourly closes or flow rows<br>• prices above 1T coins<br>• more than 1% of closes with the buy order above the sell offer<br>• rows outside the file's time span |
| Overlap with existing data | Any of these:<br>• any price differs from another recording of the **same Hypixel snapshot**<br>• more than 1% of shared time-on-top episodes differ (with at least 20 compared) |

**Warnings** don't fail the check but are shown to you. Examples: polls more than 120 s apart, or fewer than 80% of
another recording's auction sales.

**No overlap:** if nobody else covered that time, the report says so. The file can't be cross-checked yet; it gets
compared against later contributions instead.

**Why overlaps must match exactly:** Hypixel publishes one bazaar snapshot about every 20 s, identified by its
`lastUpdated` time. Everyone who polled that snapshot received the same bytes, so their hourly closes and time-on-top
episodes must be identical. In testing:
- The Node and browser collectors matched the maintainer's server exactly: 2,197 of 2,197 closes, 1,039 of 1,039
  episodes and 550 of 550 episodes.
- A tampered copy was rejected: 345 of 1,029 episodes differed.

## Workflow 2: Publish the website (`.github/workflows/publish.yml`)

**When it runs:**
- on every push to `main`, including every merged pull request
- daily at 04:23 UTC, so recipes, items and the election stay current
- by hand: Actions > *Publish the website* > **Run workflow**

**Steps (job `build`, then job `deploy`):**
1. `pnpm install --frozen-lockfile`, then build `shared`, `server-core` and `collector`.
2. `scripts/data/file-inbox.mjs`: `git mv` every `data/inbox/*.json.gz` to `data/contrib/<login>/<yyyy-mm>/`, commit
   as `github-actions[bot]` and push. Pushes made with the workflow token do not start another run.
3. `scripts/data/build-site.mjs --out site-data`:
   - import every file into a temporary in-memory database; for each hour, the stretches of polling with the most
     polls win, and overlaps are never counted twice
   - sync recipes (NotEnoughUpdates-REPO), items and the election (Hypixel)
   - compute the same statistics the self-hosted server computes, **as of the newest contributed poll**
   - write the JSON files
   - bad files are skipped and listed in `manifest.json`
4. `actions/configure-pages` reports the site's base path (`/bazaar-calc`).
5. `scripts/site/build-pages.mjs` puts the site together:
   - Vite build with `VITE_STATIC=1`
   - the data in `data/`
   - the collector in `collector/`
   - an `index.html` copy per fixed page, and `404.html` for item pages
6. `upload-pages-artifact`, then `deploy-pages`.

**Permissions:** `contents: write` (step 2), `pages: write` and `id-token: write` (deploy).

**Limits:**
- **Pages:** 1 GB per site, soft limit of 100 GB of traffic a month. The site is about 41 MB today.
- **Repository:** recommended to stay under 1 GB. A full day of data is about 3.5 MB.
- **Schedule:** GitHub turns the daily schedule off after 60 days without commits in a public repository. Any merge
  or push resets that; if it does get turned off, re-enable it in the Actions tab.

## Workflow 3: Architecture (`.github/workflows/architecture.yml`)

**When it runs:** on every push to `main` and every pull request.

**What it does:** `node scripts/checks/architecture.mjs`. It needs no install, so it reports within seconds. It
checks the structure rules from [docs/ARCHITECTURE.md](ARCHITECTURE.md):
1. packages depend only in the allowed direction
2. `@bc/shared` stays browser-safe
3. shared modules respect their layers and import each other only through `index.ts`; there are no import cycles
4. every source, script and workflow file starts with a role comment
5. every package and module has a README naming its files
6. every repository path mentioned in documentation, comments, workflows and package scripts exists

**When it fails:** the log lists each problem with how to fix it. Most often:
- a new file has no role comment, or no line in its folder's README
- a moved file is still mentioned at its old path

## Workflow 4: Tests (`.github/workflows/ci.yml`)

**When it runs:** on pushes to `main` and on pull requests, unless they only change `data/`.

**What it does:** `pnpm -r build` (TypeScript type checks and the web build), then `pnpm -r test`: 34 tests of the
rules and calculators and 4 of ingestion on PGlite.

## Maintainer runbook

### A data pull request arrives
1. **First-time contributor?** This repository's policy is `first_time_contributors`, so their first run waits for
   you. Open the pull request, check the **Files changed** tab (only `.json.gz` files in `data/inbox/`), then press
   **Awaiting approval > Approve workflows to run**.
2. **Read the report:** pull request > **Checks** > *Check contributed data*. A green check means it passed. Also
   read the "For the maintainer" notes and how much of the file overlapped other data.
3. **Merge.** The site rebuilds in about 3 minutes, and the contributor appears on the Contribute and Data status pages.
4. **Failed?** The report's "To fix" list says why. Common causes:
   - the file was uploaded under someone else's account
   - a code change was mixed in
   - the file was renamed
   - the file is over 25 MB

### Adding your own data
- **Collector:** run it like everyone else. You can also commit its files straight into
  `data/contrib/<login>/<yyyy-mm>/`.
- **From a self-hosted server:**
  1. `node scripts/data/export.mjs <copy of data/pg> <login> <out dir>` (always on a copy, or with the service
     stopped).
  2. Put the files under `data/contrib/<login>/<yyyy-mm>/`.
  3. Commit and push.

### Removing bad data
1. Delete the file(s) from `data/contrib/` and push. The next build no longer uses them.
2. They stay in git history. Rewriting history is possible but rarely worth it.

### When a workflow fails

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE` | `package.json` changed without updating `pnpm-lock.yaml` (this happened on the first push, when `packageManager` was added) | Run `pnpm install` locally, commit `pnpm-lock.yaml`, push |
| `NEU download failed` / Hypixel `HTTP 5xx` in *Build the site data* | A source was down | Re-run the workflow; the last deployed site stays online meanwhile |
| `configure-pages` error | Pages not enabled, or not set to Actions | Settings > Pages > Source: **GitHub Actions** |
| The push in *Move approved contributions* is rejected | `main` moved during the run | Re-run; the next run moves the files |
| *Check contributed data* "file not found" | The pull request deleted or renamed a file instead of adding one | Ask the contributor to add new files only |
| Old red runs in the Actions list | Earlier failed runs stay in history | Nothing to fix if the newest run is green. `gh run delete <id>` removes one |

### Useful commands (GitHub CLI)

```bash
gh run list --limit 10                                  # latest runs and their results
gh run view <id> --log-failed                           # only the failing step's log
gh run rerun <id> --failed                              # re-run failed jobs
gh workflow run "Publish the website"                   # rebuild the site now
gh pr list                                              # open pull requests (data contributions)
gh pr checks <number>                                   # check results of one pull request
gh pr merge <number> --merge                            # approve a data pull request
gh api -X POST repos/Goofythesecond/bazaar-calc/actions/runs/<id>/approve   # let a first-time contributor's run start
```

### Reproducing a workflow locally

```bash
node scripts/checks/architecture.mjs                                             # Architecture
pnpm install && pnpm -r build && pnpm -r test                                    # Tests
node scripts/data/check-pr.mjs --author <login> data/inbox/<file>.json.gz        # Check contributed data, for one file
node scripts/data/build-site.mjs --out site-data                                 # Publish: data step (--offline skips the syncs)
node scripts/site/build-pages.mjs --site-data site-data --base /bazaar-calc/ --out pages   # Publish: site step
```

To preview the result, serve `pages/` under `/bazaar-calc/`, with `404.html` for missing paths (as GitHub Pages
does). Then run `node scripts/checks/screenshot.mjs <dir> http://localhost:<port>/bazaar-calc`. It reports script errors,
empty pages, NaN/undefined text and sideways scrolling.
