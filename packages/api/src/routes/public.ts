// Public read-only API: items, bazaar history and books, auctions, mayors, events, outlook, rules, timing, status.
import zlib from "node:zlib";
import type { FastifyInstance } from "fastify";
import { type Db, loadMayors } from "@bc/server-core";
import {
  BAZAAR, BAZAAR_SOURCES, ENCHANT_SOURCE, type ItemMarket, FORGE, FORGE_SOURCES, NOTICE, type EventImpact, enchantRules, forgeSlots, orderSlots,
  booksResponse, describePerks, dipsResponse, ordersCheckResponse, outlookResponse, perksResponse, parseBookId, prettyName, quickForgeReduction, requirementsCatalog, taxRate, timingTable, unpackLevels,
} from "@bc/shared";
import type { State } from "../state.js";

const unpack = (b: Buffer | null) => (b ? unpackLevels(new Uint8Array(zlib.zstdDecompressSync(b))) : []);
const toNum = (v: unknown, d: number) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

export function registerPublic(app: FastifyInstance, db: Db, state: State) {
  app.get("/api/v1/health", async () => ({ ok: true, marketItems: state.market.size, loadedAt: state.loadedAt, dataAt: state.dataAt }));

  app.get("/api/v1/status", async () => {
    const [snap, contrib, ah, rec] = await Promise.all([
      db.query(`SELECT origin, count(*)::int AS n, extract(epoch from min(ts)) * 1000 AS first, extract(epoch from max(ts)) * 1000 AS last FROM bazaar_snapshots GROUP BY origin`),
      db.query(`SELECT count(DISTINCT user_id)::int AS contributors, count(*) FILTER (WHERE status = 'accepted')::int AS accepted FROM contributions WHERE received_at > now() - interval '7 days'`),
      db.query(`SELECT count(*)::int AS keys, extract(epoch from max(ts)) * 1000 AS last FROM ah_latest`),
      db.query(`SELECT count(*)::int AS n, max(source_version) AS version FROM recipes`),
    ]);
    return { notice: NOTICE, snapshots: snap.rows, contributors7d: contrib.rows[0], auctions: ah.rows[0], recipes: rec.rows[0], marketLoadedAt: state.loadedAt, dataAt: state.dataAt };
  });

  app.get<{ Querystring: { q?: string; bazaar?: string; limit?: string } }>("/api/v1/items", async req => {
    const q = (req.query.q ?? "").trim().toUpperCase();
    const res = await db.query(
      `SELECT id, name, category, tier, on_bazaar FROM items WHERE ($1 = '' OR id LIKE '%' || replace($1, ' ', '_') || '%' OR upper(name) LIKE '%' || $1 || '%')
         AND ($2::boolean IS NULL OR on_bazaar = $2) ORDER BY on_bazaar DESC, length(id), id LIMIT $3`,
      [q, req.query.bazaar == null ? null : req.query.bazaar === "1", Math.min(500, toNum(req.query.limit, 50))]);
    return res.rows.map(r => ({ ...r, name: prettyName(r.id, r.name) }));
  });

  app.get<{ Params: { id: string } }>("/api/v1/items/:id", async (req, reply) => {
    const id = req.params.id;
    const [item, latest, recipes, usedIn, stats] = await Promise.all([
      db.query("SELECT * FROM items WHERE id = $1", [id]),
      db.query("SELECT extract(epoch from ts) * 1000 AS ts, bids, asks FROM bazaar_latest WHERE item_id = $1", [id]),
      db.query("SELECT kind, inputs, output_count, duration_s, requirements, requirement_text FROM recipes WHERE output_id = $1", [id]),
      db.query("SELECT DISTINCT output_id, kind FROM recipes WHERE inputs @> $1::jsonb LIMIT 60", [JSON.stringify([{ id }])]),
      db.query("SELECT data FROM item_stats WHERE item_id = $1", [id]),
    ]);
    const m = state.market.get(id);
    if (!item.rowCount && !m) return reply.code(404).send({ error: "unknown item" });
    const book = parseBookId(id);
    return {
      id, name: prettyName(id, item.rows[0]?.name), item: item.rows[0] ?? null, market: m ?? null,
      book: latest.rows[0] ? { ts: Number(latest.rows[0].ts), bids: unpack(latest.rows[0].bids), asks: unpack(latest.rows[0].asks) } : null,
      recipes: recipes.rows, usedIn: usedIn.rows.map(r => ({ ...r, name: prettyName(r.output_id, state.market.get(r.output_id)?.name) })),
      stats: stats.rows[0]?.data ?? null,
      enchant: book ? { ...enchantRules()[book.enchant], level: book.level } : null,
    };
  });

  // the exact market the calculators are using right now (refreshed every 30 s): lets anyone check a route's prices
  app.get<{ Querystring: { ids?: string } }>("/api/v1/market", async req => {
    const ids = (req.query.ids ?? "").split(",").filter(Boolean).slice(0, 5000);
    const pick = (m: ItemMarket) => ({ ts: m.ts, bid: m.bid, ask: m.ask, ibuyWeek: m.ibuyWeek, isellWeek: m.isellWeek, observedBuyFlowH: m.observedBuyFlowH ?? null,
      observedSellFlowH: m.observedSellFlowH ?? null, liveHours: m.liveHours, flowBasis: m.flowBasis ?? null, npcSellPrice: m.npcSellPrice ?? null,
      ahLowestBin: m.ahLowestBin ?? null, ahSales24h: m.ahSales24h ?? null, flags: m.flags, flagWhy: m.flagWhy, ref: m.ref ?? null });
    const items = ids.length ? Object.fromEntries(ids.map(id => [id, state.market.get(id)]).filter(([, m]) => m).map(([id, m]) => [id, pick(m as ItemMarket)]))
      : Object.fromEntries([...state.market].map(([id, m]) => [id, pick(m)]));
    return { marketAt: state.loadedAt, dataAt: state.dataAt, items };
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string; step?: string } }>("/api/v1/bazaar/:id/history", async req => {
    const to = toNum(req.query.to, Date.now()), from = toNum(req.query.from, to - 14 * 86400_000);
    // at most ~5,000 points per request, whatever step is asked for
    const step = Math.max(60, Math.ceil((to - from) / 1000 / 5000), toNum(req.query.step, Math.max(60, Math.round((to - from) / 1000 / 600))));
    const res = await db.query(
      `SELECT DISTINCT ON (b) extract(epoch from b) * 1000 AS t, ask_top, bid_top, ask_volume, bid_volume, ask_orders, bid_orders, ibuy_week, isell_week, origin
         FROM (SELECT date_bin(make_interval(secs => $4), ts, 'epoch') AS b, * FROM bazaar_quotes
               WHERE item_id = $1 AND ts BETWEEN to_timestamp($2 / 1000.0) AND to_timestamp($3 / 1000.0)) x
        ORDER BY b, ts DESC`, [req.params.id, from, to, step]);
    const cols = ["ask_top", "bid_top", "ask_volume", "bid_volume", "ask_orders", "bid_orders", "ibuy_week", "isell_week", "origin"] as const;
    // where nothing was recorded (scanner off) insert an empty point so charts show a gap instead of a straight line
    const rows: (Record<string, unknown> | null)[] = [];
    let prevT: number | null = null;
    for (const r of res.rows) {
      const t = Number(r.t);
      if (prevT != null && t - prevT > Math.max(3 * step * 1000, 10 * 60_000)) rows.push({ t: prevT + step * 1000 });
      rows.push(r); prevT = t;
    }
    const out: Record<string, (number | null)[]> = { t: rows.map(r => Number(r!.t)) };
    for (const c of cols) out[c] = rows.map(r => (r![c] == null ? null : c.endsWith("_top") ? (r![c] as number) / 100 : Number(r![c])));
    return { id: req.params.id, from, to, stepSeconds: step, series: out };
  });

  app.get<{ Params: { id: string }; Querystring: { ts?: string } }>("/api/v1/bazaar/:id/book", async (req, reply) => {
    const ts = toNum(req.query.ts, Date.now());
    const r = await db.query(
      `SELECT extract(epoch from ts) * 1000 AS ts, origin, bids, asks FROM bazaar_books WHERE item_id = $1 AND ts <= to_timestamp($2 / 1000.0) ORDER BY ts DESC LIMIT 1`, [req.params.id, ts]);
    if (!r.rowCount) return reply.code(404).send({ error: "no book stored" });
    return { ts: Number(r.rows[0].ts), origin: r.rows[0].origin, bids: unpack(r.rows[0].bids), asks: unpack(r.rows[0].asks) };
  });

  app.get<{ Params: { key: string }; Querystring: { days?: string } }>("/api/v1/auctions/:key", async req => {
    const days = Math.min(90, toNum(req.query.days, 7));
    const [latest, hist, sales] = await Promise.all([
      db.query("SELECT * FROM ah_latest WHERE item_key = $1", [req.params.key]),
      db.query(`SELECT extract(epoch from date_bin('1 hour', ts, 'epoch')) * 1000 AS t, min(lowest_bin) / 100.0 AS lowest FROM ah_bin_snapshots
                WHERE item_key = $1 AND ts > now() - make_interval(days => $2) GROUP BY 1 ORDER BY 1`, [req.params.key, days]),
      db.query(`SELECT extract(epoch from ts) * 1000 AS t, price / 100.0 AS price, bin FROM ah_sales WHERE item_key = $1 AND ts > now() - make_interval(days => $2) ORDER BY ts DESC LIMIT 500`, [req.params.key, days]),
    ]);
    return { key: req.params.key, latest: latest.rows[0] ?? null, lowestBinHourly: hist.rows, sales: sales.rows };
  });

  app.get<{ Querystring: { limit?: string } }>("/api/v1/mayors", async req => {
    const terms = await loadMayors(db);
    const current = await db.query("SELECT data FROM election_snapshots WHERE origin IN (1, 2) ORDER BY ts DESC LIMIT 1");
    return { terms: terms.reverse().slice(0, toNum(req.query.limit, 200)), election: current.rows[0]?.data?.current ?? null };
  });

  app.get<{ Querystring: { from?: string; to?: string } }>("/api/v1/events", async req => {
    // at most one year of calendar per request
    const to = Math.min(toNum(req.query.to, Date.now() + 7 * 86400_000), Date.now() + 366 * 86400_000);
    const from = Math.max(toNum(req.query.from, Date.now() - 2 * 86400_000), to - 366 * 86400_000);
    return state.events.filter(e => e.end > from && e.start < to);
  });

  app.get<{ Querystring: { days?: string; minChange?: string } }>("/api/v1/outlook", async req => {
    const el = (await db.query("SELECT data FROM election_snapshots WHERE origin IN (1, 2) ORDER BY ts DESC LIMIT 1")).rows[0]?.data?.current;
    const rows = await db.query("SELECT item_id, data->'eventImpact' AS impact FROM item_stats WHERE data ? 'eventImpact'");
    const impacts = new Map<string, EventImpact[]>(rows.rows.filter(r => Array.isArray(r.impact)).map(r => [r.item_id, r.impact]));
    return outlookResponse(state.events, el, impacts, state.market, req.query);
  });

  app.get<{ Querystring: { minDrop?: string; flipperLevel?: string; limit?: string } }>("/api/v1/dips", async req => dipsResponse(state.market, req.query, state.perks));
  app.get<{ Querystring: { ids?: string } }>("/api/v1/books", async req => booksResponse(state.market, (req.query.ids ?? "").split(",").filter(Boolean)));
  app.post("/api/v1/orders/check", async req => ordersCheckResponse(state.market, req.body));
  app.get("/api/v1/perks", async () => perksResponse(state.perks));

  app.get("/api/v1/rules/bazaar", async () => ({
    ...BAZAAR, orderSlotsByFlipperLevel: [0, 1, 2].map(orderSlots), taxByFlipperLevel: [0, 1, 2].map(l => taxRate(l, state.perks.quadTaxes)),
    activePerks: describePerks(state.perks), sources: BAZAAR_SOURCES,
  }));
  app.get("/api/v1/rules/forge", async () => ({
    ...FORGE, slotsByHotm: Array.from({ length: 11 }, (_, i) => forgeSlots(i)), quickForgeByLevel: Array.from({ length: 21 }, (_, i) => quickForgeReduction(i)), sources: FORGE_SOURCES,
  }));
  // Everything the recipes can require, so the requirements form only asks about what matters.
  app.get("/api/v1/rules/requirements", async () => requirementsCatalog([...state.recipes.values()].flat()));
  app.get("/api/v1/rules/enchants", async () => ({ source: ENCHANT_SOURCE, rules: enchantRules() }));
  app.get<{ Querystring: { ping?: string; click?: string; typing?: string } }>("/api/v1/rules/timing", async req => {
    const t = { pingMs: toNum(req.query.ping, 80), clickDelayMs: toNum(req.query.click, 350), typingMs: toNum(req.query.typing, 1500) };
    const measured = await db.query(
      `SELECT extra->>'action' AS action, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median_ms, avg(ping_ms) AS avg_ping
         FROM mod_events WHERE event = 'gui_step' AND duration_ms IS NOT NULL AND ts > now() - interval '30 days' GROUP BY 1 HAVING count(*) >= 20`);
    return { model: "step = ping + 50 ms server tick + click delay (typing for commands and signs)", settings: t, actions: timingTable(t), measuredByContributors: measured.rows };
  });
}
