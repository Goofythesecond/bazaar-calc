#!/usr/bin/env node
// Backtest of the fill model: predict from the first part of the stored history, check against what really happened
// in the rest. Usage (on a COPY of the database folder, or with the service stopped):
//   node scripts/checks/backtest.mjs <pglite dir> [trainShare=0.6] [items=150] [checkMin=5]
// For each busy item and side:
//   predicted: time on top and units/h for one order of size Q, from the measured episodes and flow of the TRAIN window,
//              exactly as the calculator does (summarizeTop -> fillModel -> curve)
//   realized:  a virtual order replayed on the real TEST-window books: posted 0.1 better than the best price at each look
//              (every checkMin), on top while nobody posts a better price, relisted at the next look once beaten or filled.
//              Filled two ways, each with its own prediction:
//                "book"    units that left the book at or past its price (fills + cancels; older data has only this)
//                "trades"  real instant trades from Hypixel's 7-day counters (counterTrades; poll pairs where an
//                          expiry batch made a counter fall are left out of both the fills and the hours)
import { createPool } from "@bc/server-core";
import zlib from "node:zlib";
import { TopTracker, at, blendFlow, counterTrades, curve, fillModel, summarizeTop, unpackLevels } from "@bc/shared";

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
// Hypixel's 7-day counters per poll (quotes are stored when anything changed, so carried forward like the books)
const counters = new Map();
for (const r of await q(`SELECT DISTINCT ON (item_id) item_id, ibuy_week, isell_week FROM bazaar_quotes WHERE item_id = ANY($1) AND ts <= $2 ORDER BY item_id, ts DESC`, [ids, run[0].ts]))
  counters.set(r.item_id, { buyWeek: Number(r.ibuy_week), sellWeek: Number(r.isell_week) });
const quotesByTs = new Map();
for (const r of await q(`SELECT item_id, extract(epoch from ts) * 1000 AS t, ibuy_week, isell_week FROM bazaar_quotes WHERE item_id = ANY($1) AND ts > $2 AND ts <= $3 ORDER BY ts`, [ids, run[0].ts, run[run.length - 1].ts])) {
  const t = Number(r.t); if (!quotesByTs.has(t)) quotesByTs.set(t, []); quotesByTs.get(t).push(r);
}
const frames = []; // frames[i] = Map(item -> {bids, asks, buyWeek, sellWeek}) at run[i]
for (const s of run) {
  for (const r of rowsByTs.get(s.t) ?? []) cur.set(r.item_id, { bids: unbook(r.bids), asks: unbook(r.asks) });
  for (const r of quotesByTs.get(s.t) ?? []) counters.set(r.item_id, { buyWeek: Number(r.ibuy_week), sellWeek: Number(r.isell_week) });
  frames.push(new Map(ids.map(id => [id, cur.get(id) && { ...cur.get(id), ...counters.get(id) }])));
}

// ---- train: episodes + observed flow, as in production
const tracker = new TopTracker();
const eps = new Map();
const removedTrain = new Map(), tradesTrain = new Map(), tradeMsTrain = new Map();
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
  if (i > 0) { const p = frames[i - 1].get(id); if (p) {
    const t = p.buyWeek != null && b.buyWeek != null ? counterTrades(p, b) : null;
    for (const side of ["bid", "ask"]) {
      const k = `${id}|${side}`;
      removedTrain.set(k, (removedTrain.get(k) ?? 0) + removedThrough(side, side === "bid" ? p.bids : p.asks, side === "bid" ? b.bids : b.asks));
      if (t) { tradesTrain.set(k, (tradesTrain.get(k) ?? 0) + t[side]); tradeMsTrain.set(k, (tradeMsTrain.get(k) ?? 0) + run[i].t - run[i - 1].t); }
    }
  } }
}
const trainH = hours(0, split);

// ---- test: replay a virtual order of size Q on the real books
function replay(id, side, Q, measure) {
  const check = checkMin * 60_000;
  let order = null, nextLook = run[split].t, onTopMs = 0, got = 0, orders = 0, unknownMs = 0;
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
      let flow = removedThrough(side, plv, lv);
      const t = measure === "trades" && pb.buyWeek != null && b.buyWeek != null ? counterTrades(pb, b) : null;
      // an expiry batch made a counter fall: the trades in this interval are unknown, so it counts neither fills nor
      // hours (the order itself carries on: beaten or not is still known from the book)
      const unknown = measure === "trades" && !t;
      if (t) flow = t[side];
      if (unknown) unknownMs += dt;
      else if (stillTop) { onTopMs += dt; const take = Math.min(order.left, flow); order.left -= take; got += take; }
      else { onTopMs += dt / 2; const take = Math.min(order.left, flow / 2); order.left -= take; got += take; } // beaten somewhere in this interval
      if (!stillTop || order.left <= 0) order.done = true;
    }
    if (run[i].t >= nextLook) {
      nextLook += check;
      if ((!order || order.done) && lv[0]) { order = { price: side === "bid" ? lv[0].price + 0.1 : lv[0].price - 0.1, left: Q, done: false }; orders++; }
    }
  }
  const h = hours(split, run.length) - unknownMs / 3.6e6;
  return { unitsH: got / h, onTop: onTopMs / (h * 3.6e6), ordersH: orders / h };
}

const results = [];
for (const id of ids) for (const side of ["bid", "ask"]) {
  const k = `${id}|${side}`, e = eps.get(k) ?? [];
  const stats = summarizeTop(e, trainH);
  const weekH = side === "bid" ? week.get(id).sell : week.get(id).buy; // buy orders fill from instant SELLS
  const tradeH = (tradeMsTrain.get(k) ?? 0) / 3.6e6;
  for (const measure of ["book", "trades"]) {
    // as in production (server-core stats.ts): observed trades once an hour of them is measured, else book removals
    const useTrades = measure === "trades" && tradeH >= 1;
    if (measure === "trades" && !useTrades) continue;
    const observed = useTrades ? (tradesTrain.get(k) ?? 0) / tradeH : (removedTrain.get(k) ?? 0) / trainH;
    // FLOW_PRIOR=<hours> tries another weight for Hypixel's 7-day rate in the blend (default: the calculator's)
    const flowH = blendFlow(weekH, observed, useTrades ? tradeH : trainH, process.env.FLOW_PRIOR ? Number(process.env.FLOW_PRIOR) : undefined);
    // times the best price was beaten per hour of the train window: what production passes (server-core stats.ts)
    const model = fillModel(stats, flowH, stats && trainH > 0 ? ((stats.n - stats.censored) * stats.outbid) / trainH : null, checkMin, 0.5);
    const c = curve(model, checkMin);
    for (const Q of [64, 640, 71680]) {
      const p = at(c, Q), r = replay(id, side, Q, measure);
      results.push({ id, side, Q, measure, basis: model.basis, n: e.length, predUnits: p.unitsH, realUnits: r.unitsH, predTop: p.onTop, realTop: r.onTop, weekH, observed });
    }
  }
}
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
for (const measure of ["book", "trades"]) for (const basis of ["measured", "estimated"]) for (const Q of [64, 640, 71680]) {
  const rs = results.filter(r => r.measure === measure && r.basis === basis && r.Q === Q && r.realUnits > 0 && r.predUnits > 0);
  if (!rs.length) continue;
  const ratio = rs.map(r => r.predUnits / r.realUnits), topErr = rs.map(r => r.predTop - r.realTop);
  const within = rs.filter(r => r.predUnits / r.realUnits > 0.5 && r.predUnits / r.realUnits < 2).length;
  console.log(`${measure.padEnd(6)} ${basis.padEnd(9)} Q=${String(Q).padStart(5)}: n=${rs.length}  units predicted/realized median ${med(ratio).toFixed(2)} (p25 ${pct(ratio, 0.25).toFixed(2)}, p75 ${pct(ratio, 0.75).toFixed(2)}), within 2x: ${((within / rs.length) * 100).toFixed(0)}% | time on top predicted - realized: median ${(med(topErr) * 100).toFixed(0)} pts (p25 ${(pct(topErr, 0.25) * 100).toFixed(0)}, p75 ${(pct(topErr, 0.75) * 100).toFixed(0)})`);
}
const zero = results.filter(r => r.measure === "book" && r.Q === 640 && r.realUnits === 0);
console.log(`orders that filled nothing in the test window (Q=640, book): ${zero.length} of ${results.filter(r => r.measure === "book" && r.Q === 640).length}`);
const flowRatio = results.filter(r => r.measure === "book" && r.Q === 640 && r.weekH > 1).map(r => r.observed / r.weekH);
console.log(`removed-from-top flow vs Hypixel 7-day rate in the train window: median ${med(flowRatio).toFixed(2)} (p25 ${pct(flowRatio, 0.25).toFixed(2)}, p75 ${pct(flowRatio, 0.75).toFixed(2)})`);
console.log("biggest misses (Q=640, trades):");
for (const r of results.filter(r => r.measure === "trades" && r.Q === 640 && r.realUnits > 0).sort((a, b) => Math.abs(Math.log(b.predUnits / b.realUnits)) - Math.abs(Math.log(a.predUnits / a.realUnits))).slice(0, 8))
  console.log(`  ${r.id} ${r.side}: predicted ${r.predUnits.toFixed(1)}/h (top ${(r.predTop * 100).toFixed(0)}%), realized ${r.realUnits.toFixed(1)}/h (top ${(r.realTop * 100).toFixed(0)}%), ${r.basis} from ${r.n} episodes`);
await db.end();
