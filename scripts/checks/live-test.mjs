#!/usr/bin/env node
// End-to-end check of a running website in headless Chrome, with evidence (a JSON report and screenshots):
//  1. live prices: every Hypixel bazaar fetch the site makes (inside its Web Worker), how often, which snapshot, and
//     whether the prices on the page are exactly the ones in the snapshot it fetched (and Hypixel's own right now)
//  2. item search: enchanted books (e.g. Ultimate Wise) and bundles are found with readable names
//  3. tracked orders: an order typed in is placed in the queue and updated on later snapshots
//  4. paper trading: the record in this browser advances with every snapshot; the published around-the-clock record
//  5. flip pages list routes, and no page shows script errors
// Usage: node scripts/checks/live-test.mjs <site url, e.g. https://goofythesecond.github.io/bazaar-calc/> [out dir] [paper minutes]
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [siteArg, outDir = "live-test", minutesArg = "6"] = process.argv.slice(2);
if (!siteArg) { console.error("usage: node scripts/checks/live-test.mjs <site url> [out dir] [paper minutes]"); process.exit(2); }
const SITE = siteArg.endsWith("/") ? siteArg : `${siteArg}/`, PAPER_MIN = Number(minutesArg);
const ITEM = "ENCHANTED_DIAMOND";
mkdirSync(outDir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now(), at = () => `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s`;
const report = { site: SITE, startedAt: new Date().toISOString(), checks: {} };
const result = (name, pass, evidence) => { report.checks[name] = { pass, ...evidence }; console.log(`${pass ? "PASS" : "FAIL"}  ${name}`); };

// ---- Chrome, driven through the DevTools protocol (one browser connection, flat sessions for the page and its worker)
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(outDir, ".chrome-"));
const chrome = spawn(process.env.CHROME ?? "google-chrome-stable", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--window-size=1440,1000", "about:blank"], { stdio: "ignore" });
let ver;
for (let i = 0; i < 60 && !ver; i++) { await sleep(250); try { ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch {} }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0;
const pending = new Map(), listeners = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  for (const l of listeners) l(m);
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, m => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId: page } = await send("Target.attachToTarget", { targetId, flatten: true });
const errors = [], fetches = [], bodies = new Map(), sessions = new Set([page]);
listeners.push(async m => {
  if (m.method === "Target.attachedToTarget") { // the site's Web Worker (it does the Hypixel fetches)
    const s = m.params.sessionId; sessions.add(s);
    await send("Network.enable", {}, s).catch(() => {});
    await send("Runtime.enable", {}, s).catch(() => {});
    await send("Runtime.runIfWaitingForDebugger", {}, s).catch(() => {});
  }
  if (m.method === "Runtime.exceptionThrown") errors.push(`${at()} exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`.slice(0, 300));
  if (m.method === "Network.requestWillBeSent" && /api\.hypixel\.net\/v2\/skyblock\/bazaar/.test(m.params.request.url))
    fetches.push({ requestId: m.params.requestId, session: m.sessionId, sentAt: Date.now(), status: null, lastUpdated: null });
  if (m.method === "Network.responseReceived") { const f = fetches.find(x => x.requestId === m.params.requestId); if (f) f.status = m.params.response.status; }
  if (m.method === "Network.loadingFinished") {
    const f = fetches.find(x => x.requestId === m.params.requestId);
    if (!f) return;
    try {
      const b = await send("Network.getResponseBody", { requestId: f.requestId }, f.session);
      const d = JSON.parse(b.base64Encoded ? Buffer.from(b.body, "base64").toString() : b.body);
      const p = d.products?.[ITEM];
      f.lastUpdated = d.lastUpdated;
      bodies.set(d.lastUpdated, { bid: p?.sell_summary?.[0]?.pricePerUnit ?? null, ask: p?.buy_summary?.[0]?.pricePerUnit ?? null });
    } catch { /* a 304 has no body: the worker keeps the snapshot it has */ }
  }
});
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, page);
for (const d of ["Page", "Runtime", "Network"]) await send(`${d}.enable`, {}, page);
await send("Emulation.setFocusEmulationEnabled", { enabled: true }, page); // a headless tab counts as visible and focused

const evalJs = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, page)).result.value;
const go = async path => { await send("Page.navigate", { url: SITE + path }, page); await sleep(6000); };
const shot = async name => { const s = await send("Page.captureScreenshot", { format: "png" }, page); const f = join(outDir, `${name}.png`); writeFileSync(f, Buffer.from(s.data, "base64")); return f; };
const text = () => evalJs("document.body.innerText");
const num = s => (s == null ? null : Number(String(s).replace(/,/g, "")));
const hypixel = async () => { const d = await (await fetch("https://api.hypixel.net/v2/skyblock/bazaar")).json(); const p = d.products[ITEM]; return { lastUpdated: d.lastUpdated, bid: p.sell_summary[0]?.pricePerUnit, ask: p.buy_summary[0]?.pricePerUnit }; };

// ---- 1. live prices on an item page
console.log(`${at()} live prices on ${SITE}item/${ITEM} (90 s)`);
await go(`item/${ITEM}`);
const samples = [];
for (let i = 0; i < 18; i++) {
  const s = await evalJs(`(() => { const t = document.body.innerText;
    const grab = re => (t.match(re) || [])[1] || null;
    return { badge: grab(/(LIVE[^\\n]*|Live prices[^\\n]*|paused[^\\n]*)/), bid: grab(/Best buy order[^\\n]*\\n\\s*([\\d,.]+)/), ask: grab(/Best sell offer[^\\n]*\\n\\s*([\\d,.]+)/), updated: grab(/(updated [^\\n]*ago)/) }; })()`);
  const lastFetch = [...fetches].reverse().find(f => f.lastUpdated);
  samples.push({ t: at().trim(), ...s, pageSnapshot: lastFetch?.lastUpdated ?? null });
  await sleep(5000);
}
await shot("1-item-live");
const now = await hypixel();
const shown = samples.at(-1), snap = bodies.get(samples.at(-1).pageSnapshot);
const sent = fetches.map(f => f.sentAt), gaps = sent.slice(1).map((t, i) => Math.round((t - sent[i]) / 1000));
const snaps = [...new Set(fetches.map(f => f.lastUpdated).filter(Boolean))];
const exact = snap && num(shown.bid) === Math.round(snap.bid * 10) / 10 && num(shown.ask) === Math.round(snap.ask * 10) / 10;
result("live prices: the site fetches Hypixel's bazaar on its own, about every 20 s", fetches.length >= 4 && snaps.length >= 3, { fetches: fetches.length, secondsBetweenFetches: gaps, distinctSnapshots: snaps.length, statuses: [...new Set(fetches.map(f => f.status))] });
result("live prices: the page shows exactly the prices of the snapshot it fetched", !!exact, { shownBid: shown.bid, shownAsk: shown.ask, snapshot: snap, snapshotAt: shown.pageSnapshot, hypixelNow: now, samples });

// ---- 2. item search
const search = async q => {
  await go("items");
  await evalJs(`(() => { const i = document.getElementById("itemq"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(q)}); i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(4000);
  return evalJs(`[...document.querySelectorAll("table tbody tr")].map(r => r.innerText.replace(/\\s+/g, " ").trim()).slice(0, 12)`);
};
const wise = await search("ultimate wise");
await shot("2-search-ultimate-wise");
result("search: 'ultimate wise' finds the Ultimate Wise books", wise.some(r => /Ultimate Wise V\b/.test(r)) && wise.some(r => /Ultimate Wise I\b/.test(r)), { rows: wise });
const bundles = await search("enchanted book bundle");
result("search: bundles say which enchant they hold", bundles.length > 0 && bundles.every(r => /Enchanted Book Bundle \(/.test(r) || !/Enchanted Book Bundle/.test(r)), { rows: bundles });

// ---- 3. tracked order
console.log(`${at()} tracked order`);
await go("orders");
const h = await hypixel();
await evalJs(`(() => { const set = (id, v) => { const el = document.getElementById(id); const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
  set("oi", "${ITEM}"); set("os", "buy"); set("op", "${h.bid}"); set("oa", "64"); })()`);
await sleep(500);
await evalJs(`[...document.querySelectorAll("button")].find(b => b.innerText.trim() === "Track order").click()`);
await sleep(4000);
const row1 = await evalJs(`(document.querySelector("table tbody tr") || {}).innerText || document.body.innerText.slice(0, 300)`);
await sleep(45_000);
const row2 = await evalJs(`(document.querySelector("table tbody tr") || {}).innerText || ""`);
const stored = await evalJs(`JSON.parse(localStorage.getItem("bazaar-calc.orders") || "[]")`);
await shot("3-orders");
const o = stored.find(x => x.item === ITEM);
result("orders: an order typed in is tracked and updated on later snapshots", !!o && o.updatedAt > o.createdAt, { placedAtBid: h.bid, firstView: row1.replace(/\s+/g, " "), after45s: row2.replace(/\s+/g, " "), stored: o });

// ---- 4. paper trading
console.log(`${at()} paper trading (${PAPER_MIN} min)`);
await go("record");
const paper = [];
for (let i = 0; i < Math.max(1, Math.round((PAPER_MIN * 60) / 20)); i++) {
  const p = await evalJs(`JSON.parse(localStorage.getItem("bazaar-calc.paper") || "null")`);
  paper.push({ t: at().trim(), lastTs: p?.lastTs ?? null, trades: (p?.trades ?? []).map(t => `${t.title}: ${t.phase} @ ${t.price} ${t.bought}/${t.qty} bought, ${t.sold} sold${t.onTop ? "" : " (beaten)"}, ${t.relists} relists`) });
  await sleep(20_000);
}
await shot("4-record");
const recordText = await text();
const steps = new Set(paper.map(p => p.lastTs).filter(Boolean)).size;
result("paper trading (this browser): advances on every snapshot and opens trades", steps >= Math.min(5, paper.length - 1) && paper.at(-1).trades.length > 0, { distinctSnapshotsProcessed: steps, samples: paper });
const around = (recordText.match(/Around the clock[\s\S]*?(?=In this browser|Your decisions)/) || [""])[0].slice(0, 1200);
result("paper trading (around the clock): the scanner's published record is shown", /updated .* ago/.test(around) && !/no paper-trading record/.test(around), { section: around });

// ---- 5. flip pages
const flips = {};
for (const k of ["bazaar", "craft", "book", "forge", "npc"]) {
  // the calculation runs in the visitor's browser: wait up to 40 s and record how long it took
  await send("Page.navigate", { url: `${SITE}flips/${k}` }, page);
  const start = Date.now();
  let found = null;
  while (!found && Date.now() - start < 40_000) {
    await sleep(500);
    found = await evalJs(`(document.body.innerText.match(/([\\d,]+) routes, ([\\d,]+) make money/) || [null])[0]`);
  }
  flips[k] = found ? `${found} (shown after ${((Date.now() - start) / 1000).toFixed(1)} s)` : `nothing after 40 s: ${(await text()).slice(0, 200)}`;
}
await shot("5-flips-npc");
result("flip pages: every kind lists routes", Object.values(flips).every(v => /routes, [\d,]+ make money/.test(v) && !/^0 routes/.test(v)), { flips });
result("no script errors on any page", errors.length === 0, { errors });

report.finishedAt = new Date().toISOString();
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 1));
const failed = Object.values(report.checks).filter(c => !c.pass).length;
console.log(`${failed ? `${failed} FAILED` : "ALL PASSED"}; evidence in ${join(outDir, "report.json")} and the screenshots there`);
ws.close(); chrome.kill();
process.exitCode = failed ? 1 : 0;
