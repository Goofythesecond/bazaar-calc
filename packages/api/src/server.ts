import Fastify, { type FastifyError } from "fastify";
import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Db, migrate } from "@bc/server-core";
import { NOTICE } from "@bc/shared";
import { registerAuth, userFromRequest } from "./auth.js";
import { ENV } from "./env.js";
import { OPENAPI } from "./openapi.js";
import { registerCalc } from "./routes/calc.js";
import { registerContribute } from "./routes/contribute.js";
import { registerFill } from "./routes/fill.js";
import { registerPublic } from "./routes/public.js";
import { State } from "./state.js";

/** Start the API (and the built website) on `db`. Returns a function that closes the server. */
export async function startApi(db: Db, opts: { port?: number; host?: string } = {}): Promise<() => Promise<void>> {
await migrate(db);
const state = new State(db);
await state.start();

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: ENV.trustProxy });
await app.register(cookie, { secret: ENV.sessionSecret });
// gzip / brotli for everything over 1 KB: flip lists and the planner are JSON that shrinks ~10x
await app.register(compress, { global: true, threshold: 1024, encodings: ["br", "gzip", "deflate"] });
app.addHook("onRequest", async req => {
  const { user, keyId } = await userFromRequest(db, req);
  req.user = user;
  req.apiKeyId = keyId;
});
await app.register(rateLimit, {
  max: (req) => (req.user ? 600 : 120),
  timeWindow: "1 minute",
  keyGenerator: (req) => (req.user ? `u${req.user.id}` : req.ip),
});
app.addHook("onSend", async (_req, reply) => { reply.header("x-notice", NOTICE.affiliation); });
// item ids and keys in the URL: Hypixel ids are short and printable; anything else (null bytes, huge strings) is a 404
app.addHook("preHandler", async (req, reply) => {
  const p = req.params as Record<string, unknown> | undefined;
  for (const k of ["id", "key"]) {
    const v = p?.[k];
    if (typeof v === "string" && (v.length > 120 || /[\u0000-\u001f]/.test(v))) return reply.code(404).send({ error: "unknown item" });
  }
});
app.setErrorHandler((err: FastifyError, _req, reply) => {
  const issues = (err as unknown as { issues?: unknown }).issues;
  if (issues) return reply.code(400).send({ error: "invalid request", issues });
  app.log.error(err);
  return reply.code(err.statusCode ?? 500).send({ error: err.statusCode && err.statusCode < 500 ? err.message : "internal error" });
});

app.get("/api/openapi.json", async () => OPENAPI);
registerAuth(app, db);
registerPublic(app, db, state);
registerFill(app, db, state);
registerCalc(app, state);
registerContribute(app, db);

// Serve the built website (packages/web/dist) from the same process when it exists; SPA routes fall back to index.html.
const webDist = resolve(process.env.WEB_DIST ?? new URL("../../web/dist", import.meta.url).pathname);
if (existsSync(webDist)) {
  // built files have a content hash in their name, so browsers may keep them forever; index.html must always be fresh
  const cacheHeaders = (reply: { header: (k: string, v: string) => unknown }, path: string) => {
    reply.header("cache-control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
  };
  await app.register(fastifyStatic, { root: webDist, wildcard: false, setHeaders: cacheHeaders });
  // wildcard:false lists files at startup; serve assets from a newer build too, and never answer a missing asset with HTML
  app.setNotFoundHandler((req, reply) => {
    const path = req.url.split("?")[0]!;
    if (path.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
    if (path.startsWith("/assets/")) {
      const rel = path.slice(1);
      return !rel.includes("..") && existsSync(resolve(webDist, rel)) ? reply.sendFile(rel) : reply.code(404).send("not found");
    }
    return reply.sendFile("index.html");
  });
}

await app.listen({ port: opts.port ?? ENV.port, host: opts.host ?? process.env.API_HOST ?? "0.0.0.0" });
return async () => { state.stop(); await app.close(); };
}
