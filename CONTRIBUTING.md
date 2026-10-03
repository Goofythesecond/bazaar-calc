# Contributing

## Data

The website has no server. Live prices come from Hypixel in each visitor's browser; everything that needs history
comes from data recorded by players and sent in as pull requests:

- fill times and competition
- typical prices and manipulation checks
- auction prices and mayor terms

The more hours people record, the better the numbers.

### Record

Either collector writes the same files (format `bazaar-calc-data/1`, see `packages/shared/src/data/contrib-format.ts`).

**In the browser:** open the website's **Contribute** page, enter your GitHub username and press **Start collecting**.
- Keep the tab open and visible: browsers slow down hidden tabs, and only polls at most 150 s apart count toward fill
  times.
- A file is finished at 00:00 UTC or when you stop; download it from the list.

**With Node 18 or newer:** download `bazaar-calc-collector.mjs` from the Contribute page (or build it with
`pnpm --filter @bc/collector build`) and run:

```bash
node bazaar-calc-collector.mjs --name <your GitHub login>             # files go to ./bazaar-data
node bazaar-calc-collector.mjs --name <your GitHub login> --no-bins   # without the auction BIN scan
```

It keeps working with the screen locked, writes the current day's file every 5 minutes and starts a new file at 00:00 UTC.

**Download:**
Measured 2026-10-03 (compressed, as both collectors download it):
- **Bazaar polls:** about 0.5 MB per poll, every 20 s, which is about 2 GB a day. Hypixel only sends it when it has
  changed.
- **Ended auctions:** about 0.13 MB per update, which is about 0.2 GB a day.
- **Auction BIN scan:** 45 pages of about 1.3 MB, so about 60 MB every 30 min, which is about 3 GB a day (`--no-bins`
  skips it).

**What is recorded:**
- Hypixel's public bazaar, ended-auction, auction and election endpoints, which need no API key.
- From them: the hourly best prices, how many units left the top of the book, how long each new best price stayed on
  top, lowest BINs and sale prices.
- No player names or ids, nothing about your account.

A full day is about 3.5 MB compressed.

### Send it

1. On GitHub, open the repository's [`data/inbox/`](data/inbox) folder, choose **Add file > Upload files** and drop in
   your `.json.gz` files (25 MB at most each; GitHub's limit for browser uploads).
2. Choose **Create a new branch for this commit and start a pull request**. GitHub makes a copy (fork) for you if
   you cannot write to the repository.
3. The **Check contributed data** workflow runs on your pull request. It checks each file and writes a report on the
   pull request's Checks tab:
   - it is named after you, holds only the data it should and is plausible
   - it matches other recordings of the same time exactly (everyone who polled the same Hypixel snapshot recorded
     identical values)
4. The maintainer looks at the report and merges. The website rebuilds with your data within minutes, and you are
   listed on the Contribute page.

Rules:
- Only send files you recorded yourself.
- Never edit them.
- Don't mix code changes into a data pull request.

Hand-edited or invented data is rejected. Overlaps with other contributors make edits obvious.

## Code

Bug reports and pull requests are welcome. Before sending code:

```bash
pnpm install && pnpm check     # architecture rules, build, all tests
```

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): it has the layers, where each kind of change goes, and the
conventions. Every file starts with a comment saying what it is for, and every folder's README lists its files. Keep
both current; the Architecture workflow checks them.

Calculations live in `packages/shared` and run both on the server and in the browser. Any change to a number the site
shows should come with how it was checked:
- a test
- `scripts/checks/audit.mjs` (self-hosted)
- a comparison against the raw Hypixel data

Rules and constants cite their source in `research/RESEARCH.md`. Data from Coflnet, skykings or skyblock.bz cannot be
used (their terms do not allow republishing).
