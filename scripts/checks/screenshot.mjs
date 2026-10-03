#!/usr/bin/env node
// Headless check of the website: loads pages in Chrome, reports JavaScript errors and failed requests, saves screenshots.
// Usage: node scripts/checks/screenshot.mjs <outDir> [baseUrl] [width] [path ...]
//   default paths: every page of the site; default width 1440 (use 390 for a phone)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir = "screens", base = "http://127.0.0.1:8787", width = "1440", ...given] = process.argv.slice(2);
const paths = given.length ? given : ["/", "/flips/bazaar", "/flips/craft", "/flips/book", "/flips/forge", "/flips/npc", "/dips", "/orders", "/alerts", "/record", "/outlook", "/items",
  "/item/ENCHANTED_DIAMOND", "/events", "/timing", "/api-docs", "/contribute", "/status", "/about"];
mkdirSync(outDir, { recursive: true });
const profile = mkdtempSync(join(outDir, ".chrome-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME ?? "google-chrome-stable", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); let errors = [];
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`.slice(0, 300));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(`console: ${m.params.args.map(a => a.value ?? a.description).join(" ")}`.slice(0, 300));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ""}`.slice(0, 300));
  if (m.method === "Network.responseReceived" && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable"); await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: 1000, deviceScaleFactor: 1, mobile: Number(width) < 600 });
let bad = 0;
for (const p of paths) {
  errors = [];
  await send("Page.navigate", { url: base + p });
  await sleep(7000);
  const info = (await send("Runtime.evaluate", { returnByValue: true, expression:
    `({ root: document.getElementById('root')?.innerText.length ?? 0, // a phone's layout viewport grows to fit content that is too wide: compare with the real screen width
       overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
       clipped: (() => { const scrolls = el => { for (let a = el.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
         const bad = [...document.querySelectorAll('#root *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 2 && !scrolls(el) && getComputedStyle(el).position !== 'fixed'; });
         return bad.length ? bad.length + ' elements past the right edge, e.g. ' + (bad.at(-1).innerText || bad.at(-1).tagName).slice(0, 60).replace(/\\s+/g, ' ') : ''; })(),
       nan: /\\bNaN\\b|undefined|\\[object Object\\]|Infinity/.test(document.body.innerText) ? (document.body.innerText.match(/.{0,40}(\\bNaN\\b|undefined|\\[object Object\\]|Infinity).{0,40}/)||[''])[0] : '' })` })).result.result.value;
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const file = join(outDir, `${p.replace(/[^a-z0-9]+/gi, "_") || "home"}_${width}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  const problems = [...errors, ...(info.root < 50 ? ["page is empty"] : []), ...(info.overflow > 2 ? [`page scrolls sideways by ${info.overflow}px`] : []), ...(info.clipped ? [`cut off: ${info.clipped}`] : []), ...(info.nan ? [`shows "${info.nan.trim()}"`] : [])];
  if (problems.length) bad++;
  console.log(`${problems.length ? "PROBLEM" : "ok     "} ${p} -> ${file}${problems.length ? "\n    " + problems.join("\n    ") : ""}`);
}
ws.close(); chrome.kill();
await new Promise(r => (chrome.exitCode != null ? r() : chrome.once("exit", r)));
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* Chrome may still be flushing its profile */ }
process.exitCode = bad ? 1 : 0;
