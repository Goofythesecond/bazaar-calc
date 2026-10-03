#!/usr/bin/env node
// Bazaar Calc contributor collector. No dependencies (Node >= 18).
//   BC_API_KEY=bc_xxx BC_SERVER=https://your-site node collector.mjs
// Polls Hypixel's public (key-less) endpoints and uploads exactly what Hypixel returned:
//   /v2/skyblock/bazaar every 60 s, /v2/skyblock/auctions_ended every 60 s.
// Your own Hypixel API key is NOT needed and never sent anywhere.
const KEY = process.env.BC_API_KEY;
const SERVER = (process.env.BC_SERVER ?? "http://localhost:8787").replace(/\/$/, "");
const EVERY = Number(process.env.BC_EVERY_S ?? 60) * 1000;
if (!KEY) { console.error("Set BC_API_KEY (create one on the Contribute page)."); process.exit(1); }

const log = (...a) => console.log(new Date().toISOString(), ...a);
let lastBazaar = 0, lastEnded = 0;

async function relay(source, target, lastSeen) {
  const r = await fetch(`https://api.hypixel.net/v2/skyblock/${source}`, { headers: { "user-agent": "bazaar-calc-collector" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Hypixel ${source}: HTTP ${r.status}`);
  const body = await r.text();
  const lastUpdated = JSON.parse(body).lastUpdated;
  if (lastUpdated === lastSeen) return lastSeen; // nothing new
  const up = await fetch(`${SERVER}/api/v1/contribute/${target}`, {
    method: "POST", headers: { "content-type": "application/json", "x-api-key": KEY }, body, signal: AbortSignal.timeout(60000),
  });
  const res = await up.json().catch(() => ({}));
  log(`${target}: ${up.status} ${res.status ?? res.error ?? ""}${res.reason ? ` (${res.reason})` : ""}`);
  if (up.status === 401 || up.status === 403) { console.error("API key rejected; stopping."); process.exit(1); }
  return lastUpdated;
}

async function loop() {
  try { lastBazaar = await relay("bazaar", "bazaar", lastBazaar); } catch (e) { log("bazaar error:", e.message); }
  try { lastEnded = await relay("auctions_ended", "auctions-ended", lastEnded); } catch (e) { log("auctions error:", e.message); }
}
log(`collector started -> ${SERVER}, every ${EVERY / 1000}s`);
await loop();
setInterval(loop, EVERY);
