#!/usr/bin/env node
// Backtest of the fill model: predict from the first part of the stored history, check against what really happened
// in the rest. Usage (on a COPY of the database folder, or with the service stopped):
//   node scripts/checks/backtest.mjs <pglite dir> [trainShare=0.6] [items=150] [checkMin=5]
// For each busy item and side:
//   predicted: time on top and units/h for one order of size Q, from the measured episodes and flow of the TRAIN window,
//              exactly as the calculator does (summarizeTop -> fillModel -> curve)
//   realized:  a virtual order replayed on the real TEST-window books: posted 0.1 better than the best price at each look
//              (every checkMin), on top while nobody posts a better price, filled by the units that left the book at or
//              above it (fills + cancels: an upper bound), relisted at the next look once beaten or filled
import { createPool } from "@bc/server-core";
import zlib from "node:zlib";
import { TopTracker, at, blendFlow, curve, fillModel, summarizeTop, unpackLevels } from "@bc/shared";

const [dir, trainShareArg = "0.6", itemsArg = "150", checkArg = "5"] = process.argv.slice(2);
const trainShare = Number(trainShareArg), nItems = Number(itemsArg), checkMin = Number(checkArg);
const STRICT = process.env.BACKTEST_LENIENT !== "1"; // equal price = beaten (see replay)
const db = createPool(`pglite:${dir}`);
const q = async (s, p) => (await db.query(s, p)).rows;
const unbook = b => (b ? unpackLevels(new Uint8Array(zlib.zstdDecompressSync(Buffer.from(b)))) : []);

// continuous stretch of 20 s polls (the longest run without gaps over 150 s)
const snaps = (await q("SELECT extract(epoch from ts) * 1000 AS t, ts FROM bazaar_snapshots WHERE origin = 1 AND ts > now() - interval '3 days' ORDER BY ts")).map(r => ({ t: Number(r.t), ts: r.ts }));
let best = [0, 0];
for (let i = 1, s = 0; i <= snaps.length; i++) {
  if (i === snaps.length || snaps[i].t - snaps[i - 1].t > 150_000) { if (i - s > best[1] - best[0]) best = [s, i]; s = i; }
}
const run = snaps.slice(best[0], best[1]);
const split = Math.floor(run.length * trainShare);
const hours = (a, b) => (run[b - 1].t - run[a].t) / 3.6e6;
console.log(`continuous run: ${run.length} polls, ${hours(0, run.length).toFixed(1)} h; train ${hours(0, split).toFixed(1)} h, test ${hours(split, run.length).toFixed(1)} h; looks every ${checkMin} min`);

// busy items with both sides (from the latest market)
const items = (await q(`SELECT item_id, ibuy_week, isell_week FROM bazaar_latest WHERE ask_top IS NOT NULL AND bid_top IS NOT NULL ORDER BY least(ibuy_week, isell_week) DESC LIMIT $1`, [nItems]));
const week = new Map(items.map(r => [r.item_id, { buy: Number(r.ibuy_week) / 168, sell: Number(r.isell_week) / 168 }]));
const ids = items.map(r => r.item_id);

// books per poll for these items, carried forward (rows are stored only when something changed)
const cur = new Map();
for (const r of await q(`SELECT DISTINCT ON (item_id) item_id, bids, asks FROM bazaar_books WHERE item_id = ANY($1) AND ts <= $2 ORDER BY item_id, ts DESC`, [ids, run[0].ts]))
  cur.set(r.item_id, { bids: unbook(r.bids), asks: unbook(r.asks) });
const rowsByTs = new Map();
for (const r of await q(`SELECT item_id, extract(epoch from ts) * 1000 AS t, bids, asks FROM bazaar_books WHERE item_id = ANY($1) AND ts > $2 AND ts <= $3 ORDER BY ts`, [ids, run[0].ts, run[run.length - 1].ts])) {
  const t = Number(r.t); if (!rowsByTs.has(t)) rowsByTs.set(t, []); rowsByTs.get(t).push(r);
}
const frames = []; // frames[i] = Map(item -> {bids, asks}) at run[i]
for (const s of run) {
  for (const r of rowsByTs.get(s.t) ?? []) cur.set(r.item_id, { bids: unbook(r.bids), asks: unbook(r.asks) });
  frames.push(new Map(ids.map(id => [id, cur.get(id)])));
}

// ---- train: episodes + observed flow, as in production
const tracker = new TopTracker();
const eps = new Map();
const removedTrain = new Map();
const better = (side, a, b) => (side === "bid" ? a > b + 1e-9 : a < b - 1e-9);
const removedThrough = (side, prev, now) => { // units that left prev levels at or better than the new best (bookFlow)
  const nb = now[0]?.price, m = new Map(now.map(l => [Math.round(l.price * 100), l.amount]));
  let n = 0;
  for (const l of prev) if (nb == null || !better(side, nb, l.price)) n += Math.max(0, l.amount - (m.get(Math.round(l.price * 100)) ?? 0));
  return n;
};
for (let i = 0; i < split; i++) for (const id of ids) {
  const b = frames[i].get(id); if (!b) continue;
  for (const e of tracker.step(id, run[i].t, b.bids, b.asks)) { const k = `${id}|${e.side}`; if (!eps.has(k)) eps.set(k, []); eps.get(k).push(e); }
  if (i > 0) { const p = frames[i - 1].get(id); if (p) for (const side of ["bid", "ask"]) { const k = `${id}|${side}`; removedTrain.set(k, (removedTrain.get(k) ?? 0) + removedThrough(side, side === "bid" ? p.bids : p.asks, side === "bid" ? b.bids : b.asks)); } }
}
const trainH = hours(0, split);

// ---- test: replay a virtual order of size Q on the real books
function replay(id, side, Q) {
  const check = checkMin * 60_000;
  let order = null, nextLook = run[split].t, onTopMs = 0, got = 0, orders = 0;
  for (let i = split; i < run.length; i++) {
    const b = frames[i].get(id); if (!b) continue;
    const lv = side === "bid" ? b.bids : b.asks;
    if (i > split && order && !order.done) {
      const pb = frames[i - 1].get(id), plv = side === "bid" ? pb.bids : pb.asks;
      const top = lv[0]?.price;
      // our virtual order is not really in the book: a competitor who posts at OUR price was aiming at the visible best
      // and in reality would have gone one tick past us, so an equal price counts as beaten too
      const stillTop = top == null || (STRICT ? better(side, order.price, top) : !better(side, top, order.price));
      const dt = run[i].t - run[i - 1].t;
      const flow = removedThrough(side, plv, lv);
      if (stillTop) { onTopMs += dt; const take = Math.min(order.left, flow); order.left -= take; got += take; }
      else { onTopMs += dt / 2; const take = Math.min(order.left, flow / 2); order.left -= take; got += take; } // beaten somewhere in this interval
      if (!stillTop || order.left <= 0) order.done = true;
    }
    if (run[i].t >= nextLook) {
      nextLook += check;
      if ((!order || order.done) && lv[0]) { order = { price: side === "bid" ? lv[0].price + 0.1 : lv[0].price - 0.1, left: Q, done: false }; orders++; }
    }
  }
  const h = hours(split, run.length);
  return { unitsH: got / h, onTop: onTopMs / (h * 3.6e6), ordersH: orders / h };
}

const results = [];
for (const id of ids) for (const side of ["bid", "ask"]) {
  const k = `${id}|${side}`, e = eps.get(k) ?? [];
  const stats = summarizeTop(e, trainH);
  const observed = (removedTrain.get(k) ?? 0) / trainH;
  const weekH = side === "bid" ? week.get(id).sell : week.get(id).buy; // buy orders fill from instant SELLS
  const flowH = blendFlow(weekH, observed, trainH);
  const model = fillModel(stats, flowH, null, checkMin, 0.5);
  const c = curve(model, checkMin);
  for (const Q of [64, 640, 71680]) {
    const p = at(c, Q), r = replay(id, side, Q);
    results.push({ id, side, Q, basis: model.basis, n: e.length, predUnits: p.unitsH, realUnits: r.unitsH, predTop: p.onTop, realTop: r.onTop, weekH, observed });
  }
}
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
for (const basis of ["measured", "estimated"]) for (const Q of [64, 640, 71680]) {
  const rs = results.filter(r => r.basis === basis && r.Q === Q && r.realUnits > 0 && r.predUnits > 0);
  if (!rs.length) continue;
  const ratio = rs.map(r => r.predUnits / r.realUnits), topErr = rs.map(r => r.predTop - r.realTop);
  const within = rs.filter(r => r.predUnits / r.realUnits > 0.5 && r.predUnits / r.realUnits < 2).length;
  console.log(`${basis.padEnd(9)} Q=${String(Q).padStart(5)}: n=${rs.length}  units predicted/realized median ${med(ratio).toFixed(2)} (p25 ${pct(ratio, 0.25).toFixed(2)}, p75 ${pct(ratio, 0.75).toFixed(2)}), within 2x: ${((within / rs.length) * 100).toFixed(0)}% | time on top predicted - realized: median ${(med(topErr) * 100).toFixed(0)} pts (p25 ${(pct(topErr, 0.25) * 100).toFixed(0)}, p75 ${(pct(topErr, 0.75) * 100).toFixed(0)})`);
}
const zero = results.filter(r => r.Q === 640 && r.realUnits === 0);
console.log(`orders that filled nothing in the test window (Q=640): ${zero.length} of ${results.filter(r => r.Q === 640).length}`);
const flowRatio = results.filter(r => r.Q === 640 && r.weekH > 1).map(r => r.observed / r.weekH);
console.log(`removed-from-top flow vs Hypixel 7-day rate in the train window: median ${med(flowRatio).toFixed(2)} (p25 ${pct(flowRatio, 0.25).toFixed(2)}, p75 ${pct(flowRatio, 0.75).toFixed(2)})`);
console.log("biggest misses (Q=640):");
for (const r of results.filter(r => r.Q === 640 && r.realUnits > 0).sort((a, b) => Math.abs(Math.log(b.predUnits / b.realUnits)) - Math.abs(Math.log(a.predUnits / a.realUnits))).slice(0, 8))
  console.log(`  ${r.id} ${r.side}: predicted ${r.predUnits.toFixed(1)}/h (top ${(r.predTop * 100).toFixed(0)}%), realized ${r.realUnits.toFixed(1)}/h (top ${(r.realTop * 100).toFixed(0)}%), ${r.basis} from ${r.n} episodes`);
await db.end();
