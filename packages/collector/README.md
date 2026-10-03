# @bc/collector

Data collectors for players.

**Depends on:** `@bc/shared`. It is bundled into one file, so it needs no install.

| File | What it does |
|---|---|
| `src/collect.ts` | The Node collector, bundled to `dist/bazaar-calc-collector.mjs`. Records contribution files for pull requests (`--name <login>`, `--out`, `--no-bins`) |
| `src/server-upload.mjs` | The older uploader for a self-hosted server's API (`BC_API_KEY`, `BC_SERVER`): sends raw Hypixel responses |

The recording logic itself is `DataCollector` in `@bc/shared` (data module), shared with the browser collector.

```bash
pnpm --filter @bc/collector build   # esbuild bundle
```
