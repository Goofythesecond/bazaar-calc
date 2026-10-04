# scripts

Commands run from the repository root with `node scripts/...`. Each file starts with a comment giving its usage.

| Script | What it does |
|---|---|
| `scripts/bazaar.sh` | Controls the self-hosted service on Linux (systemd user unit): install, start / stop, logs, linger, keep-awake |
| `scripts/checks/architecture.mjs` | The structural rules (package and module boundaries, role comments, READMEs, paths in docs). Runs in CI |
| `scripts/checks/audit.mjs` | Self-hosted: re-derives every listed route from the exact market snapshot and compares with raw sources |
| `scripts/checks/backtest.mjs` | Fill-model backtest on stored order books (run on a copy of the database) |
| `scripts/checks/outputs.mjs` | Records every public output of @bc/shared on frozen inputs: run before and after a refactor, the files must be identical |
| `scripts/checks/live-test.mjs` | End-to-end check of a running site in headless Chrome, with evidence: the site's own Hypixel fetches and that the page shows exactly those prices, item search, tracked orders, paper trading, flip pages |
| `scripts/checks/screenshot.mjs` | Loads pages in headless Chrome: script errors, empty pages, NaN / undefined, content past the screen edge; saves screenshots |
| `scripts/data/export.mjs` | Database to contribution files (one per UTC day) |
| `scripts/data/import.mjs` | Contribution files to a self-hosted database (hours it already has are kept) |
| `scripts/data/check-pr.mjs` | The pull-request data check (used by .github/workflows/check-data.yml) |
| `scripts/data/build-site.mjs` | All contribution files to the website's data (used by .github/workflows/publish.yml) |
| `scripts/data/file-inbox.mjs` | Moves merged files from data/inbox to data/contrib/<login>/<yyyy-mm>/ |
| `scripts/site/build-pages.mjs` | Packages the static website for GitHub Pages |
| `scripts/legacy/migrate-from-sbdb.mjs` | One-off: moved the history of the older sbdb database into this one |
| `scripts/legacy/make-fixture.mjs` | One-off: built packages/shared/test-data/fixture.json from sbdb polls and a NEU checkout |
