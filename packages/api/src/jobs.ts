// Server-side work on top of the scanner (self-hosted), run after each market refresh:
//  - paper trading around the clock (fill/paper.ts), with the default settings or those in ALERTS_FILE; the record is
//    kept in the database (kv "paper") and served at GET /api/v1/paper
//  - Discord alerts from ALERTS_FILE (the file the website's Alerts page exports): routes newly meeting its rules. The
//    first check only records what already qualifies, so a restart does not repeat old alerts.
import { readFileSync } from "node:fs";
import type { Db } from "@bc/server-core";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type PaperState, ProfileSchema, SettingsSchema, applyFilters, newPaperState, paperCandidates, paperStep } from "@bc/shared";
import type { State } from "./state.js";

interface AlertsFile {
  discordWebhook?: string;
  rules?: { minCoinsH?: number; minMarginPct?: number; kinds?: string[]; noWarnings?: boolean; minConfidence?: "low" | "medium" | "high" };
  settings?: unknown; profile?: unknown;
}
const RANK = { low: 0, medium: 1, high: 2 } as const;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[jobs]", ...a);

export async function startServerJobs(state: State, db: Db): Promise<{ stop: () => void; paper: () => { state: PaperState; since: number | null } }> {
  let cfg: AlertsFile = {};
  if (process.env.ALERTS_FILE) {
    try { cfg = JSON.parse(readFileSync(process.env.ALERTS_FILE, "utf8")) as AlertsFile; log(`alerts from ${process.env.ALERTS_FILE}`); }
    catch (e) { log(`could not read ALERTS_FILE: ${(e as Error).message}`); }
  }
  const settings = SettingsSchema.parse(cfg.settings ?? DEFAULT_SETTINGS), profile = ProfileSchema.parse(cfg.profile ?? DEFAULT_PROFILE);

  let paper: PaperState = newPaperState(), since: number | null = null;
  try {
    const r = (await db.query("SELECT value, extract(epoch from updated_at) * 1000 AS t FROM kv WHERE key = 'paper'")).rows[0];
    if (r) { paper = r.value as PaperState; since = paper.trades[0]?.openedAt ?? Number(r.t); }
  } catch { /* first run */ }

  let seen: Set<string> | null = null, lastData = 0;
  const webhook = cfg.discordWebhook?.trim() ?? "";
  const post = async (content: string) => {
    if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhook)) return;
    try { await fetch(webhook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }) }); }
    catch (e) { log(`discord: ${(e as Error).message}`); }
    await new Promise(r => setTimeout(r, 2000));
  };

  const tick = async () => {
    if (!state.dataAt || state.dataAt === lastData) return;
    lastData = state.dataAt;
    // paper trading on this snapshot
    paper = paperStep(paper, state.dataAt, state.market, () => paperCandidates(state.opportunities("bazaar", settings, profile).list),
      { checkMin: settings.checkIntervalMin, flipperLevel: settings.bazaarFlipperLevel, quadTaxes: state.perks.quadTaxes });
    since ??= paper.trades[0]?.openedAt ?? null;
    await db.query("INSERT INTO kv (key, value, source, updated_at) VALUES ('paper', $1, 'server paper trading', now()) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()", [JSON.stringify(paper)]);
    // Discord alerts
    if (!webhook) return;
    const r = cfg.rules ?? {};
    const rows = applyFilters(state.opportunities("all", settings, profile, false, true).list, {
      sort: "scoreH", profitableOnly: true, minCoinsH: r.minCoinsH, minMargin: r.minMarginPct ? r.minMarginPct / 100 : undefined, noFlags: r.noWarnings });
    const ok = rows.filter(o => (!r.kinds || r.kinds.includes(o.kind)) && RANK[o.confidence.level] >= RANK[r.minConfidence ?? "low"] && !o.key.endsWith(":instant"));
    if (seen) for (const o of ok.filter(o => !seen!.has(o.key)).slice(0, 5))
      await post(`**${o.title}** (${o.kind})\n${Math.round(o.coinsH).toLocaleString("en-US")} coins/h · ${Math.round(o.profitPerUnit).toLocaleString("en-US")} per unit · ${(o.marginPct * 100).toFixed(1)}% margin · ${o.confidence.level} confidence`);
    seen = new Set(ok.map(o => o.key));
  };
  let busy = false;
  const t = setInterval(() => { if (busy) return; busy = true; void tick().catch(e => log((e as Error).message)).finally(() => { busy = false; }); }, 10_000);
  return { stop: () => clearInterval(t), paper: () => ({ state: paper, since }) };
}
