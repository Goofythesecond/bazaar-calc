// Contributor uploads (API key required). Collector: raw Hypixel bazaar / ended-auction responses.
// Companion mod: the contributor's own bazaar actions and GUI timings (published only as aggregates).
import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type BazaarResponse, type Db, type EndedAuction, ORIGIN, crossCheck, ingestBazaar, ingestEndedAuctions } from "@bc/server-core";
import { requireUser } from "../auth.js";

const MAX_TRUST = 1, MIN_TRUST = 0;

async function record(db: Db, userId: number, kind: string, status: string, reason: string | null, body: string, dataTs: number | null) {
  await db.query("INSERT INTO contributions (user_id, kind, status, reason, payload_sha256, bytes, data_ts) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7 / 1000.0))",
    [userId, kind, status, reason, createHash("sha256").update(body).digest("hex"), body.length, dataTs]);
}
async function adjustTrust(db: Db, userId: number, delta: number) {
  await db.query("UPDATE users SET trust = least($2, greatest($3, trust + $4)) WHERE id = $1", [userId, MAX_TRUST, MIN_TRUST, delta]);
}

const ModEvent = z.object({
  ts: z.number().int(),
  event: z.enum(["order_created", "order_filled", "order_claimed", "order_cancelled", "order_flipped", "instant_buy", "instant_sell", "gui_step"]),
  item_id: z.string().max(80).optional(),
  side: z.enum(["buy", "sell"]).optional(),
  amount: z.number().int().min(0).max(1e9).optional(),
  price: z.number().min(0).max(1e10).optional(),          // coins per unit
  duration_ms: z.number().int().min(0).max(600_000).optional(),
  ping_ms: z.number().int().min(0).max(10_000).optional(),
  order_age_ms: z.number().int().min(0).max(30 * 86400_000).optional(),
  action: z.string().max(40).optional(),                   // for gui_step: which ACTIONS key the step belongs to
});

export function registerContribute(app: FastifyInstance, db: Db) {
  app.post("/api/v1/contribute/bazaar", { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const u = requireUser(req, reply); if (!u) return;
    const body = JSON.stringify(req.body ?? {});
    const data = req.body as BazaarResponse;
    // an upload dated ahead of our clock would sit in "latest" until our own polls caught up with it
    if (typeof data?.lastUpdated === "number" && data.lastUpdated > Date.now() + 15_000)
      return reply.code(422).send({ status: "rejected", reason: "lastUpdated is ahead of the server clock" });
    const check = await crossCheck(db, data).catch(() => null);
    if (check && check.compared >= 20 && check.mismatches / check.compared > 0.05) {
      await record(db, u.id, "bazaar", "rejected", `does not match our own poll (${check.mismatches}/${check.compared} prices off by >5%)`, body, data?.lastUpdated ?? null);
      await adjustTrust(db, u.id, -0.1);
      return reply.code(422).send({ status: "rejected", reason: "prices do not match Hypixel data we already have" });
    }
    if (!check && u.trust < 0.5) {
      await record(db, u.id, "bazaar", "pending", "nothing to cross-check against and trust < 0.5", body, data?.lastUpdated ?? null);
      return reply.code(202).send({ status: "pending", reason: "kept for review: no overlapping data to verify against yet" });
    }
    const res = await ingestBazaar(db, data, ORIGIN.CONTRIBUTOR, u.id);
    await record(db, u.id, "bazaar", res.status, res.reason ?? null, body, res.ts ?? null);
    if (res.status === "accepted") await adjustTrust(db, u.id, check ? 0.01 : 0.002);
    return reply.code(res.status === "rejected" ? 422 : 200).send(res);
  });

  app.post("/api/v1/contribute/auctions-ended", { bodyLimit: 4 * 1024 * 1024 }, async (req, reply) => {
    const u = requireUser(req, reply); if (!u) return;
    const d = req.body as { success?: boolean; lastUpdated?: number; auctions?: EndedAuction[] };
    if (!d?.success || !Array.isArray(d.auctions) || d.auctions.length > 5000) return reply.code(422).send({ error: "expected the raw /v2/skyblock/auctions_ended response" });
    const n = await ingestEndedAuctions(db, d.auctions, ORIGIN.CONTRIBUTOR);
    await record(db, u.id, "auctions_ended", n ? "accepted" : "duplicate", null, JSON.stringify(d), d.lastUpdated ?? null);
    return { status: n ? "accepted" : "duplicate", inserted: n };
  });

  app.post("/api/v1/contribute/mod-events", { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    const u = requireUser(req, reply); if (!u) return;
    const parsed = z.object({ events: z.array(ModEvent).max(2000) }).safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: parsed.error.issues.slice(0, 5) });
    const now = Date.now();
    const rows = parsed.data.events.filter(e => e.ts <= now + 60_000 && e.ts > now - 30 * 86400_000);
    for (const e of rows)
      await db.query(
        `INSERT INTO mod_events (user_id, ts, event, item_id, side, amount, price, duration_ms, ping_ms, order_age_ms, extra)
         VALUES ($1, to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [u.id, e.ts, e.event, e.item_id ?? null, e.side ?? null, e.amount ?? null, e.price != null ? Math.round(e.price * 100) : null,
          e.duration_ms ?? null, e.ping_ms ?? null, e.order_age_ms ?? null, e.action ? JSON.stringify({ action: e.action }) : null]);
    await record(db, u.id, "mod_events", "accepted", null, JSON.stringify(req.body), now);
    return { status: "accepted", stored: rows.length, dropped: parsed.data.events.length - rows.length };
  });

  app.get("/api/v1/contributors", async () => {
    const r = await db.query(
      `SELECT u.username, u.avatar, u.discord_id, count(*) FILTER (WHERE c.status = 'accepted')::int AS accepted, max(c.received_at) AS last
         FROM contributions c JOIN users u ON u.id = c.user_id WHERE c.received_at > now() - interval '30 days' AND NOT u.banned
        GROUP BY u.id ORDER BY accepted DESC LIMIT 50`);
    return r.rows;
  });
}
