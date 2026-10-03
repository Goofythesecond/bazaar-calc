// Discord OAuth2 login (authorization-code flow), cookie sessions, and personal API keys for contributors.
import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "@bc/server-core";
import { ENV } from "./env.js";

export interface User { id: number; discord_id: string; username: string; avatar: string | null; role: "user" | "contributor" | "admin"; trust: number; banned: boolean }

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const SESSION_COOKIE = "bc_session";
const STATE_COOKIE = "bc_oauth_state";
const SESSION_DAYS = 30;

declare module "fastify" {
  interface FastifyRequest { user?: User | null; apiKeyId?: number | null }
}

export async function userFromRequest(db: Db, req: FastifyRequest): Promise<{ user: User | null; keyId: number | null }> {
  const header = req.headers.authorization;
  const key = (typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"] : null) ?? (header?.startsWith("Bearer ") ? header.slice(7) : null);
  if (key) {
    const r = await db.query(
      `SELECT u.*, k.id AS key_id FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = $1 AND k.revoked_at IS NULL`, [sha(key)]);
    if (!r.rowCount) return { user: null, keyId: null };
    await db.query("UPDATE api_keys SET last_used_at = now() WHERE id = $1", [r.rows[0].key_id]);
    return { user: r.rows[0], keyId: r.rows[0].key_id };
  }
  const cookie = req.cookies?.[SESSION_COOKIE];
  if (!cookie) return { user: null, keyId: null };
  const r = await db.query(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > now()`, [sha(cookie)]);
  return { user: r.rows[0] ?? null, keyId: null };
}

export function requireUser(req: FastifyRequest, reply: FastifyReply): User | null {
  if (!req.user) { void reply.code(401).send({ error: "login required (Discord) or an API key in X-API-Key" }); return null; }
  if (req.user.banned) { void reply.code(403).send({ error: "account banned" }); return null; }
  return req.user;
}

export function registerAuth(app: FastifyInstance, db: Db) {
  const redirectUri = `${ENV.publicUrl}/api/auth/discord/callback`;

  app.get("/api/auth/discord/login", async (_req, reply) => {
    if (!ENV.discordClientId) return reply.code(503).send({ error: "Discord login is not configured (DISCORD_CLIENT_ID)" });
    const state = randomBytes(16).toString("hex");
    reply.setCookie(STATE_COOKIE, state, { path: "/", httpOnly: true, sameSite: "lax", secure: ENV.secureCookies, maxAge: 600 });
    const url = new URL("https://discord.com/oauth2/authorize");
    url.search = new URLSearchParams({ client_id: ENV.discordClientId, response_type: "code", redirect_uri: redirectUri, scope: "identify", state, prompt: "none" }).toString();
    return reply.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string } }>("/api/auth/discord/callback", async (req, reply) => {
    const { code, state } = req.query;
    if (!code || !state || state !== req.cookies[STATE_COOKIE]) return reply.code(400).send({ error: "invalid OAuth state" });
    reply.clearCookie(STATE_COOKIE, { path: "/" });
    const tok = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: ENV.discordClientId, client_secret: ENV.discordClientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    if (!tok.ok) return reply.code(502).send({ error: "Discord token exchange failed" });
    const { access_token } = (await tok.json()) as { access_token: string };
    const me = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${access_token}` } });
    if (!me.ok) return reply.code(502).send({ error: "Discord profile request failed" });
    const d = (await me.json()) as { id: string; username: string; global_name?: string; avatar?: string };
    const role = ENV.admins.has(d.id) ? "admin" : "user";
    const u = await db.query(
      `INSERT INTO users (discord_id, username, avatar, role, last_login_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (discord_id) DO UPDATE SET username = excluded.username, avatar = excluded.avatar, last_login_at = now(),
         role = CASE WHEN excluded.role = 'admin' THEN 'admin' ELSE users.role END
       RETURNING id`, [d.id, d.global_name ?? d.username, d.avatar ?? null, role]);
    const token = randomBytes(32).toString("base64url");
    await db.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))", [sha(token), u.rows[0].id, SESSION_DAYS]);
    reply.setCookie(SESSION_COOKIE, token, { path: "/", httpOnly: true, sameSite: "lax", secure: ENV.secureCookies, maxAge: SESSION_DAYS * 86400 });
    return reply.redirect(`${ENV.publicUrl}/contribute`);
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const c = req.cookies[SESSION_COOKIE];
    if (c) await db.query("DELETE FROM sessions WHERE id = $1", [sha(c)]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/v1/me", async req => {
    if (!req.user) return { user: null };
    const stats = await db.query("SELECT kind, status, count(*)::int AS n FROM contributions WHERE user_id = $1 GROUP BY 1, 2", [req.user.id]);
    return { user: { id: req.user.id, username: req.user.username, avatar: req.user.avatar, discordId: req.user.discord_id, role: req.user.role, trust: req.user.trust }, contributions: stats.rows };
  });

  app.get("/api/v1/me/keys", async (req, reply) => {
    const u = requireUser(req, reply); if (!u) return;
    return (await db.query("SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [u.id])).rows;
  });

  app.post<{ Body: { name?: string } }>("/api/v1/me/keys", async (req, reply) => {
    const u = requireUser(req, reply); if (!u) return;
    if (req.apiKeyId) return reply.code(403).send({ error: "create keys from the website session, not with a key" });
    const active = await db.query("SELECT count(*)::int AS n FROM api_keys WHERE user_id = $1 AND revoked_at IS NULL", [u.id]);
    if (active.rows[0].n >= 5) return reply.code(400).send({ error: "at most 5 active keys" });
    const key = `bc_${randomBytes(24).toString("base64url")}`;
    const name = String(req.body?.name ?? "collector").slice(0, 40);
    await db.query("INSERT INTO api_keys (user_id, name, prefix, key_hash) VALUES ($1, $2, $3, $4)", [u.id, name, key.slice(0, 10), sha(key)]);
    if (u.role === "user") await db.query("UPDATE users SET role = 'contributor' WHERE id = $1", [u.id]);
    return { key, note: "Shown once. Store it in your collector config." };
  });

  app.delete<{ Params: { id: string } }>("/api/v1/me/keys/:id", async (req, reply) => {
    const u = requireUser(req, reply); if (!u) return;
    await db.query("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2", [Number(req.params.id), u.id]);
    return { ok: true };
  });
}
