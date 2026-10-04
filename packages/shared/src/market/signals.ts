// Market signals computed from one item's data: trade flow per hour (old + new data blended), typical prices from
// history, warning flags (manipulation, mass delists, walls, spikes...) and the enchanted-book price ladder.
import type { HourProfile, ItemMarket } from "./types.js";

export const MIN_FLOW_HOURS = 2;
/** Hours of Hypixel's 7-day rate counted as if we had watched them ourselves (the prior in the blend below). Backtest
 *  2026-10-05 (600 item sides, 8.5 h train / 5.7 h test): 12 -> 6 brought items with few episodes from 1.94x to 1.82x
 *  predicted / real (640-unit orders) and 1.14x -> 1.05x (71,680), while well-measured items stayed at 1.01x (640) and
 *  went 0.86x -> 0.83x (71,680); 3 helped thin items more (1.56x) but under-predicted big orders for everyone. */
export const FLOW_PRIOR_HOURS = 6;
/**
 * Trades per hour on one side, blending old and new data: what we watched leave the top of the book (last 24 h of polls,
 * T hours of them) and Hypixel's 7-day average, weighted as (observed x T + week x 6) / (T + 6), never above the 7-day
 * average. A rare item that happened not to trade for a few hours keeps much of its weekly rate; a market that really
 * went quiet for a day is pulled down. (Taking the plain minimum used to zero rare items after one quiet stretch.)
 */
export function blendFlow(weekPerH: number, observedPerH: number | null | undefined, watchedHours: number, priorHours = FLOW_PRIOR_HOURS): number {
  if (observedPerH == null || !(watchedHours > 0)) return weekPerH;
  return Math.min(weekPerH, (observedPerH * watchedHours + weekPerH * priorHours) / (watchedHours + priorHours));
}
/** How much faster (or slower) than the 24-hour average the bazaar trades while you play: the profile averaged over
 *  your hours, starting at `fromUtc` (a UTC hour; -1 or no profile: 1, the daily average). bid: instant sells (fill buy
 *  orders), ask: instant buys (fill sell offers). */
export function playFactor(p: HourProfile | null | undefined, fromUtc: number, hours: number): { bid: number; ask: number } {
  if (!p || fromUtc < 0 || !(hours > 0)) return { bid: 1, ask: 1 };
  let bid = 0, ask = 0, w = 0;
  for (let t = 0; t < Math.min(24, hours); t++) {
    const k = Math.min(1, hours - t), h = (Math.floor(fromUtc) + t) % 24;
    bid += k * (p.sell[h] ?? 1); ask += k * (p.buy[h] ?? 1); w += k;
  }
  return { bid: bid / w, ask: ask / w };
}
/** Units instant-sold into buy orders per hour (what fills YOUR buy orders). */
export const buyFlowH = (m: ItemMarket) => blendFlow(m.isellWeek / 168, m.observedBuyFlowH, m.liveHours);
/** Units instant-bought from sell offers per hour (what fills YOUR sell offers). */
export const sellFlowH = (m: ItemMarket) => blendFlow(m.ibuyWeek / 168, m.observedSellFlowH, m.liveHours);

/** A sale is priced at most this far above its typical level (normal swings fit inside; pumps do not). */
export const TYPICAL_BAND = 1.1;
/** Hourly closes needed before a window's median counts as "typical". */
export const TYPICAL_MIN_HOURS = { day: 6, week: 12 } as const;

/**
 * The item's typical best price on one side, from history: the last 24 h median when at least 6 hourly closes back it,
 * else the 7-day median with at least 12. Null when history is too thin to say.
 */
export function typicalPrice(m: ItemMarket, side: "ask" | "bid"): { price: number; basis: string; hours: number } | null {
  const r = m.ref;
  if (!r) return null;
  const d = side === "ask" ? r.ask24 : r.bid24, w = side === "ask" ? r.ask7 : r.bid7;
  if (d != null && (r.n24 ?? 0) >= TYPICAL_MIN_HOURS.day) return { price: d, basis: "24 h median", hours: r.n24 ?? 0 };
  if (w != null && (r.n7 ?? 0) >= TYPICAL_MIN_HOURS.week) return { price: w, basis: "7-day median", hours: r.n7 ?? 0 };
  return null;
}

export const FLAG_TEXT: Record<string, string> = {
  above_higher_level: "this book costs more than a higher level of the same enchant",
  stale: "Hypixel stopped updating this product",
  mass_delists: "far more units were pulled from the book than were traded: offers or orders that are not really there",
  likely_manipulated: "prices look artificially pushed: see the evidence before trading",
  dead_book: "fewer than 3 orders on a side",
  absurd_spread: "spread above 50%",
  price_off_median: "price more than 50% away from its reference median",
  margin_spike: "spread more than 3x its usual level",
  wall: "one order holds most of the visible depth at the top of a side",
  recent_jump: "top price moved more than 25% in the last hour",
  low_history: "not enough live data yet for competition estimates",
};

/** Market-health flags with the numbers that triggered them. `hourAgo` = top prices one hour earlier. */
export function computeFlags(m: ItemMarket, hourAgo?: { ask: number | null; bid: number | null }): void {
  const flags: string[] = [], why: Record<string, string> = {};
  const { ask, bid } = m;
  if (m.bidOrders < 3 || m.askOrders < 3) {
    flags.push("dead_book");
    why.dead_book = `${m.bidOrders} buy orders, ${m.askOrders} sell offers (minimum 3 each)`;
  }
  // a 50%+ spread is only a warning when it is wide for this item: expensive books often sit at 50-70% every day
  const usualSpread = m.ref?.spreadMed ?? null;
  // ...but above 200% it is always a dead or dust-bid market, however usual that is for the item
  if (ask && bid && (ask - bid) / bid > 0.5 && (usualSpread == null || (ask - bid) / bid > 1.5 * usualSpread || (ask - bid) / bid > 2)) {
    flags.push("absurd_spread");
    why.absurd_spread = `sell offer ${ask.toFixed(1)} is ${(((ask - bid) / bid) * 100).toFixed(0)}% above buy order ${bid.toFixed(1)}${usualSpread != null ? ` (usual ${(usualSpread * 100).toFixed(0)}%)` : ""}`;
  }
  const r = m.ref;
  if (r && ask && bid && r.askMed && r.bidMed) {
    const off = (v: number, med: number) => v > 1.5 * med || v < med / 1.5;
    if (off(ask, r.askMed) || off(bid, r.bidMed)) {
      flags.push("price_off_median");
      why.price_off_median = `sell offer ${ask.toFixed(1)} vs ${r.days}-day median ${r.askMed.toFixed(1)}; buy order ${bid.toFixed(1)} vs ${r.bidMed.toFixed(1)}`;
    }
    const sp = (ask - bid) / bid;
    if (r.spreadMed && sp > 3 * r.spreadMed && sp > 0.02) {
      flags.push("margin_spike");
      why.margin_spike = `spread ${(sp * 100).toFixed(1)}% vs usual ${(r.spreadMed * 100).toFixed(1)}%`;
    }
  }
  if (hourAgo && ask && bid && hourAgo.ask && hourAgo.bid) {
    const ca = (ask - hourAgo.ask) / hourAgo.ask, cb = (bid - hourAgo.bid) / hourAgo.bid;
    if (Math.abs(ca) > 0.25 || Math.abs(cb) > 0.25) {
      flags.push("recent_jump");
      why.recent_jump = `last hour: sell offer ${(ca * 100).toFixed(0)}%, buy order ${(cb * 100).toFixed(0)}%`;
    }
  }
  for (const [side, levels] of [["buy", m.topBid], ["sell", m.topAsk]] as const) {
    if (!levels || levels.length <= 3) continue;
    const total = levels.reduce((s, l) => s + l.amount, 0);
    const top = levels[0]!;
    if (total && top.orders === 1 && top.amount / total > 0.8) {
      flags.push("wall");
      why.wall = `one ${side} order at ${top.price.toFixed(1)} holds ${((top.amount / total) * 100).toFixed(0)}% of visible units`;
      break;
    }
  }
  // likely manipulated: price pushed far above its typical level, with supporting evidence from the book or history
  const ta = typicalPrice(m, "ask"), tb = typicalPrice(m, "bid");
  const ev: string[] = [];
  let strong = false;
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  if (ask && ta && ask >= 1.4 * ta.price) { ev.push(`sell offers ${pct(ask / ta.price - 1)} above their typical ${ta.price.toFixed(1)} (${ta.basis}, ${ta.hours} h)`); strong ||= ask >= 2 * ta.price; }
  // a buy order only "pumps" anything when it is a real price level: at least half the typical sell offer (a 0.1 -> 0.2
  // dust bid on a 7,000-coin item is noise)
  const refAsk = ta?.price ?? ask ?? 0;
  if (bid && tb && bid >= 1.4 * tb.price && bid >= 0.5 * refAsk) { ev.push(`buy orders ${pct(bid / tb.price - 1)} above their typical ${tb.price.toFixed(1)} (${tb.basis}, ${tb.hours} h)`); strong ||= bid >= 2 * tb.price; }
  if (ask && ta && ask >= 1.15 * ta.price && r?.askVol24 && m.askVolume < 0.3 * r.askVol24)
    ev.push(`only ${m.askVolume.toLocaleString("en-US")} units offered vs a typical ${Math.round(r.askVol24).toLocaleString("en-US")}: the cheap supply was bought out`);
  const b0 = m.topBid?.[0], b1 = m.topBid?.[1];
  // bait: one small order well above the rest (more than 10% and at least 5 price steps), at a real price level
  if (b0 && b1 && b0.orders === 1 && b0.price >= 1.1 * b1.price && b0.price - b1.price >= 0.5 && b0.price >= 0.5 * refAsk && b0.amount * b0.price < 0.02 * Math.max(1, m.bidVolume * b1.price))
    ev.push(`a single small buy order (${b0.amount} at ${b0.price.toFixed(1)}) sits ${pct(b0.price / b1.price - 1)} above the rest: bait for instant sellers`);
  if (r?.spreadMed && ask && bid && (ask - bid) / bid > 3 * r.spreadMed && (ask - bid) / bid > 0.05) ev.push(`spread ${pct((ask - bid) / bid)} vs usual ${pct(r.spreadMed)}`);
  // mass delists: at least 5x more pulled from a side than really traded, worth 5M+ coins. Informational on its own
  // (busy players reprice), evidence toward "likely manipulated" when a price signal is also there.
  const d = r?.delists;
  if (d) {
    const sides: string[] = [];
    for (const [name, removed, traded, price] of [["buy orders", d.bidRemoved, d.bidTrades, bid], ["sell offers", d.askRemoved, d.askTrades, ask]] as const)
      if (price && removed >= 5 * Math.max(1, traded) && (removed - traded) * price >= 5e6)
        sides.push(`${Math.round(removed).toLocaleString("en-US")} units pulled from ${name} vs ~${Math.round(traded).toLocaleString("en-US")} really traded in ${d.hours.toFixed(0)} h`);
    if (sides.length) { flags.push("mass_delists"); why.mass_delists = sides.join("; "); ev.push(...sides); }
  }
  if (strong || ev.length >= 2) {
    flags.push("likely_manipulated");
    why.likely_manipulated = ev.join("; ");
  }
  if (m.liveHours < 2) {
    flags.push("low_history");
    why.low_history = `${m.liveHours.toFixed(1)} h of live data (2 h needed)`;
  }
  m.flags = flags;
  m.flagWhy = why;
}

/** Warnings that keep an item out of the planner. Low history and mass delists alone are informational. */
export const seriousFlags = (m: ItemMarket) => m.flags.filter(f => f !== "low_history" && f !== "mass_delists");

const BOOK = /^(ENCHANTMENT_.+)_(\d+)$/;
/**
 * Cheapest sell offer among HIGHER levels of the same enchanted book. Nobody instant-buys Last Stand IV for 12M while
 * Last Stand V sells for 3.8M, so a sell offer of a book is never worth more than that.
 */
export function bookCeiling(market: Map<string, ItemMarket>, id: string): { price: number; item: string } | null {
  const b = BOOK.exec(id);
  if (!b) return null;
  let best: { price: number; item: string } | null = null;
  for (let l = Number(b[2]) + 1; l <= Number(b[2]) + 10; l++) {
    const h = market.get(`${b[1]}_${l}`);
    if (h?.ask != null && (!best || h.ask < best.price)) best = { price: h.ask, item: h.id };
  }
  return best;
}

/** Flag books whose sell offers cost more than a higher level of the same enchant (needs the whole market). */
export function flagBookLadders(market: Map<string, ItemMarket>): void {
  for (const m of market.values()) {
    const c = m.ask != null ? bookCeiling(market, m.id) : null;
    if (!c || m.ask! <= c.price) continue;
    m.flags.push("above_higher_level");
    m.flagWhy.above_higher_level = `sell offers at ${m.ask!.toFixed(1)} cost more than ${market.get(c.item)?.name ?? c.item} at ${c.price.toFixed(1)}`;
  }
}
