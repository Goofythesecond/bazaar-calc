#!/usr/bin/env node
// Transfer Hypixel-origin data from the old sbdb SQLite database into bazaar-calc.
//
// Only data that came from Hypixel is moved:
//   * live bazaar polls (sbdb source 1: rows + compressed daily blocks) .......... origin 1
//   * Internet Archive copies of the Hypixel bazaar API (sbdb source 6) ......... origin 6
//   * order books from both of the above (same "sbbook-v1" packing)
//   * Hypixel election snapshots (live polls + archive copies) and the mayors derived from them
//   * Hypixel item metadata
// Never moved: Coflnet history/snapshots/mayors/recipes/auction data, skykings, skyblock.bz.
//
// Usage (Node >= 22.15, no npm install needed for export):
//   node scripts/legacy/migrate-from-sbdb.mjs --sbdb ../data/skyblock.db --out ./export          # write export files
//   node scripts/legacy/migrate-from-sbdb.mjs --from-export ./export --pg postgres://...         # load files into Postgres
//   node scripts/legacy/migrate-from-sbdb.mjs --sbdb ../data/skyblock.db --pg postgres://...     # both in one go
//   node scripts/legacy/migrate-from-sbdb.mjs --from-export ./export --pg pglite:./data/pg       # into the built-in database
//   add --dry-run to only count what would be moved.
// Loading into Postgres needs the `pg` package (installed with the api workspace).

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import zlib from "node:zlib";

// ---------------------------------------------------------------------------- args
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
  return acc;
}, []));
const SBDB = args.sbdb ? resolve(args.sbdb) : null;
const OUT = args.out ? resolve(args.out) : null;
const FROM = args["from-export"] ? resolve(args["from-export"]) : null;
const PG = typeof args.pg === "string" ? args.pg : null;
const DRY = !!args["dry-run"];
if (!SBDB && !FROM) {
  console.error("need --sbdb <path> or --from-export <dir>  (see header of this file)");
  process.exit(1);
}

// ---------------------------------------------------------------------------- sbdb constants
const SRC = { HYPIXEL: 1, SKYBLOCK_BZ: 2, COFL_HISTORY: 3, COFL_SNAPSHOT: 4, SKYKINGS: 5, WAYBACK: 6 };
const ORIGIN = { [SRC.HYPIXEL]: 1, [SRC.WAYBACK]: 6 }; // the only sources we move
const QUOTE_COLS = ["ask_top", "bid_top", "ask_wavg", "bid_wavg", "ask_min", "ask_max", "bid_min", "bid_max",
  "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week"];
const OUT_COLS = ["ask_top", "bid_top", "ask_wavg", "bid_wavg", "ask_volume", "bid_volume", "ask_orders", "bid_orders",
  "ibuy_week", "isell_week"];
const NULL64 = -(2n ** 63n);

// SkyBlock calendar (verified against real mayor terms): year 1 began 2019-06-11 17:55 UTC; day = 20 min.
const SB_EPOCH = 1560275700000, SB_DAY = 20 * 60 * 1000, SB_MONTH = 31 * SB_DAY, SB_YEAR = 12 * SB_MONTH;
const sbDate = (year, month, day) => SB_EPOCH + (year - 1) * SB_YEAR + (month - 1) * SB_MONTH + (day - 1) * SB_DAY;

// "sbdb block": zstd( u32 n + int64[15 * n] column-wise deltas ), NULL = -2^63
function decodeBlock(blob) {
  const raw = zlib.zstdDecompressSync(Buffer.from(blob));
  const n = raw.readUInt32LE(0);
  const body = raw.subarray(4);
  const flat = new BigInt64Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  const cols = ["ts", ...QUOTE_COLS];
  const out = Array.from({ length: n }, () => ({}));
  cols.forEach((c, k) => {
    let prev = 0n;
    for (let i = 0; i < n; i++) {
      const v = flat[k * n + i];
      if (v === NULL64) out[i][c] = null;
      else { prev += v; out[i][c] = Number(prev); }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------- export writer
class Writer {
  constructor(dir) { this.dir = dir; this.files = {}; this.counts = {}; }
  open(name) {
    if (!this.files[name]) {
      const gz = zlib.createZstdCompress({ params: { [zlib.constants.ZSTD_c_compressionLevel]: 6 } });
      const fh = createWriteStream(join(this.dir, `${name}.ndjson.zst`));
      gz.pipe(fh);
      this.files[name] = { gz, fh, hash: createHash("sha256") };
      this.counts[name] = 0;
    }
    return this.files[name];
  }
  write(name, row) {
    const f = this.open(name);
    const line = JSON.stringify(row) + "\n";
    f.hash.update(line);
    this.counts[name]++;
    return f.gz.write(line) ? null : new Promise(r => f.gz.once("drain", r));
  }
  async close(meta) {
    const manifest = { format: "bazaar-calc-export-v1", created_at: new Date().toISOString(), ...meta, tables: {} };
    for (const [name, f] of Object.entries(this.files)) {
      await new Promise(r => { f.fh.on("close", r); f.gz.end(); });
      manifest.tables[name] = { rows: this.counts[name], sha256_of_ndjson: f.hash.digest("hex") };
    }
    writeFileSync(join(this.dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  }
}

// ---------------------------------------------------------------------------- read sbdb
async function* readSbdb(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  const tag = new Map(db.prepare("SELECT item_id, tag FROM items").all().map(r => [r.item_id, r.tag]));
  const meta = Object.fromEntries(db.prepare("SELECT key, value FROM meta").all().map(r => [r.key, r.value]));
  const liveStart = Number(meta.live_start_ms || 0);

  // items (Hypixel resources metadata; on_bazaar from live polls)
  for (const r of db.prepare("SELECT tag, name, category, tier, npc_sell_price, on_bazaar FROM items").iterate())
    yield ["items", { id: r.tag, name: r.name, category: r.category, tier: r.tier, npc_sell_price: r.npc_sell_price, on_bazaar: !!r.on_bazaar }];

  // snapshots: our live polls ...
  for (const r of db.prepare("SELECT ts, source_id, n_products, n_quote_changes, keyframe FROM live_fetches WHERE source_id = 1").iterate())
    yield ["bazaar_snapshots", { ts: r.ts, origin: 1, n_products: r.n_products, n_changes: r.n_quote_changes, keyframe: !!r.keyframe }];
  // ... and archive captures (one snapshot per distinct capture time)
  for (const r of db.prepare("SELECT ts, count(*) AS n FROM quotes WHERE source_id = 6 GROUP BY ts").iterate())
    yield ["bazaar_snapshots", { ts: r.ts, origin: 6, n_products: r.n, n_changes: r.n, keyframe: true }];

  // quotes: rows
  const cols = OUT_COLS.join(", ");
  for (const r of db.prepare(`SELECT item_id, source_id, ts, ${cols} FROM quotes WHERE source_id IN (1, 6)`).iterate()) {
    const row = { item_id: tag.get(r.item_id), ts: r.ts, origin: ORIGIN[r.source_id] };
    for (const c of OUT_COLS) row[c] = r[c];
    yield ["bazaar_quotes", row];
  }
  // quotes: compacted live blocks
  for (const b of db.prepare("SELECT item_id, data FROM quote_blocks WHERE source_id = 1").iterate()) {
    for (const p of decodeBlock(b.data)) {
      const row = { item_id: tag.get(b.item_id), ts: p.ts, origin: 1 };
      for (const c of OUT_COLS) row[c] = p[c];
      yield ["bazaar_quotes", row];
    }
  }
  // order books (same packing in both systems; passed through byte-for-byte)
  for (const r of db.prepare("SELECT item_id, source_id, ts, bids, asks FROM books WHERE source_id IN (1, 6)").iterate())
    yield ["bazaar_books", { item_id: tag.get(r.item_id), ts: r.ts, origin: ORIGIN[r.source_id],
      bids: r.bids ? Buffer.from(r.bids).toString("base64") : null, asks: r.asks ? Buffer.from(r.asks).toString("base64") : null }];

  // election snapshots: polled by us (>= live start) or archive copies (before)
  const mayors = new Map();
  for (const r of db.prepare("SELECT ts, sb_year, data FROM election_snapshots ORDER BY ts").iterate()) {
    const data = JSON.parse(r.data);
    yield ["election_snapshots", { ts: r.ts, sb_year: r.sb_year, origin: r.ts >= liveStart ? 1 : 6, data }];
    const m = data.mayor;
    const year = m?.election?.year;
    if (!year || !m.name) continue;
    const start = sbDate(year + 1, 3, 27); // Late Spring 27 of the following SkyBlock year
    const cands = m.election.candidates || [];
    mayors.set(year, {
      election_year: year, mayor_key: m.key ?? null, mayor_name: m.name, start_ts: start, end_ts: start + SB_YEAR,
      votes: cands.find(c => c.key === m.key)?.votes ?? null,
      perks: (m.perks || []).map(p => ({ name: p.name, description: p.description ?? null })),
      minister: m.minister ? { key: m.minister.key, name: m.minister.name, perk: m.minister.perk?.name ?? null } : null,
      candidates: cands.map(c => ({ key: c.key, name: c.name, votes: c.votes ?? null, perks: (c.perks || []).map(p => p.name) })),
    });
  }
  for (const m of mayors.values()) yield ["mayors", m];
  db.close();
  yield ["__meta", { sbdb_path: path, live_start_ms: liveStart, sbdb_meta_keys: Object.keys(meta) }];
}

async function* readExport(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  if (manifest.format !== "bazaar-calc-export-v1") throw new Error("unknown export format");
  for (const name of Object.keys(manifest.tables)) {
    const rl = createInterface({ input: createReadStream(join(dir, `${name}.ndjson.zst`)).pipe(zlib.createZstdDecompress()), crlfDelay: Infinity });
    for await (const line of rl) if (line) yield [name, JSON.parse(line)];
  }
  yield ["__meta", manifest];
}

// ---------------------------------------------------------------------------- Postgres loader
async function pgLoader(url) {
  let client;
  if (url.startsWith("pglite:")) {
    // built-in Postgres stored in a folder (same as the worker's DATABASE_URL=pglite:...); run migrations first
    let mod;
    try { mod = await import("../../packages/server-core/node_modules/@electric-sql/pglite/dist/index.js"); } catch {
      throw new Error("Loading into PGlite needs `pnpm install` in bazaar-calc first.");
    }
    mkdirSync(resolve(url.slice(7) || "./data/pg", ".."), { recursive: true });
    const lite = await mod.PGlite.create(url.slice(7) || "./data/pg", { parsers: { 20: v => Number(v), 1700: v => Number(v) } });
    client = { query: (text, params) => (params?.length ? lite.query(text, params) : lite.exec(text)), end: () => lite.close() };
  } else {
    let pg;
    try { pg = await import("pg"); } catch {
      throw new Error("Loading into Postgres needs the 'pg' package: run `pnpm install` in bazaar-calc first.");
    }
    client = new (pg.default?.Client ?? pg.Client)({ connectionString: url });
    await client.connect();
  }
  const partitioned = new Set(["bazaar_quotes", "bazaar_books"]);
  const months = new Set();
  const batches = {};
  const conflict = {
    items: "ON CONFLICT (id) DO UPDATE SET name = coalesce(items.name, excluded.name), category = coalesce(items.category, excluded.category), tier = coalesce(items.tier, excluded.tier), npc_sell_price = coalesce(items.npc_sell_price, excluded.npc_sell_price), on_bazaar = items.on_bazaar OR excluded.on_bazaar",
    mayors: "ON CONFLICT (election_year) DO NOTHING",
  };
  const toPg = (name, r) => {
    const out = { ...r };
    for (const k of ["ts", "start_ts", "end_ts"]) if (k in out && out[k] != null) out[k] = new Date(out[k]).toISOString();
    if (name === "bazaar_books") { out.bids = out.bids ? Buffer.from(out.bids, "base64") : null; out.asks = out.asks ? Buffer.from(out.asks, "base64") : null; }
    for (const k of ["data", "perks", "minister", "candidates"]) if (k in out && out[k] != null && typeof out[k] === "object") out[k] = JSON.stringify(out[k]);
    return out;
  };
  async function flush(name) {
    const rows = batches[name];
    if (!rows?.length) return;
    batches[name] = [];
    const cols = Object.keys(rows[0]);
    const values = [], params = [];
    rows.forEach((r, i) => {
      values.push(`(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(", ")})`);
      cols.forEach(c => params.push(r[c]));
    });
    await client.query(`INSERT INTO ${name} (${cols.join(", ")}) VALUES ${values.join(", ")} ${conflict[name] ?? "ON CONFLICT DO NOTHING"}`, params);
  }
  return {
    async add(name, row) {
      const r = toPg(name, row);
      if (partitioned.has(name)) {
        const d = new Date(r.ts);
        const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
        if (!months.has(name + m)) {
          await client.query("SELECT bc_ensure_month_partition($1, $2::date)", [name, m]);
          months.add(name + m);
        }
      }
      (batches[name] ||= []).push(r);
      const width = Object.keys(r).length;
      if (batches[name].length * width >= 30000) await flush(name);
    },
    async end() {
      for (const name of ["items", ...Object.keys(batches).filter(n => n !== "items")]) await flush(name);
      // the "now" table from the newest quote/book per item
      await client.query(`INSERT INTO bazaar_latest (item_id, ts, ask_top, bid_top, ask_wavg, bid_wavg, ask_volume, bid_volume, ask_orders, bid_orders, ibuy_week, isell_week, bids, asks)
        SELECT DISTINCT ON (q.item_id) q.item_id, q.ts, q.ask_top, q.bid_top, q.ask_wavg, q.bid_wavg, q.ask_volume, q.bid_volume, q.ask_orders, q.bid_orders, q.ibuy_week, q.isell_week,
               (SELECT b.bids FROM bazaar_books b WHERE b.item_id = q.item_id ORDER BY b.ts DESC LIMIT 1),
               (SELECT b.asks FROM bazaar_books b WHERE b.item_id = q.item_id ORDER BY b.ts DESC LIMIT 1)
        FROM bazaar_quotes q ORDER BY q.item_id, q.ts DESC
        ON CONFLICT (item_id) DO NOTHING`);
      await client.end();
    },
  };
}

// ---------------------------------------------------------------------------- main
const started = Date.now();
const source = FROM ? readExport(FROM) : readSbdb(SBDB);
if (OUT && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const writer = OUT && !DRY && !FROM ? new Writer(OUT) : null;
const loader = PG && !DRY ? await pgLoader(PG) : null;
const counts = {};
let meta = {};
let n = 0;
for await (const [name, row] of source) {
  if (name === "__meta") { meta = row; continue; }
  if (name === "bazaar_quotes" || name === "bazaar_books") if (!row.item_id) continue;
  counts[name] = (counts[name] || 0) + 1;
  if (writer) { const p = writer.write(name, row); if (p) await p; }
  if (loader) await loader.add(name, row);
  if (++n % 200000 === 0) console.error(`  ${n.toLocaleString()} rows ...`);
}
if (writer) {
  const manifest = await writer.close({ source: meta, note: "Hypixel-origin data only (origin 1 = our polls, 6 = Internet Archive copies)." });
  console.log(`export written to ${OUT}`);
  console.table(manifest.tables);
}
if (loader) { await loader.end(); console.log("loaded into Postgres"); }
if (DRY || (!writer && !loader)) console.table(counts);
console.log(`done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
