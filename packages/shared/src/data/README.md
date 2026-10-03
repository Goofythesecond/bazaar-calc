# shared / data

Data in and out. **May use:** rules, market, fill.

| File | What it holds |
|---|---|
| `hypixel.ts` | Hypixel API response types, response checks (`validateBazaar`, `degradedBazaar`), book flow between polls (`bookFlow`), real instant trades between polls from the rise of Hypixel's 7-day counters (`counterTrades`) |
| `nbt.ts` | NBT reader for auction items: item key and stack size from `item_bytes`, lowest-BIN aggregation |
| `contrib-format.ts` | The contribution file format `bazaar-calc-data/1`: types, encode / decode, plausibility checks, file names; the optional trade columns (`tradeIntervals`, `tradeSeconds`, `bidTrades`, `askTrades`) since 2026-10-03 |
| `contrib-collector.ts` | `DataCollector`: turns Hypixel responses into a contribution file exactly as the server's scanner processes them |

**Change here when** the file format changes. Any change that old files can't be read with needs a new `DATA_FORMAT`
version, and decoding must keep reading the old one. Prove that collectors still match the server (docs/WORKFLOWS.md).
