// API client, formatting and persisted settings.
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, type Opportunity, type Profile, type RankedOpportunity, type Settings } from "@bc/shared";

/** Built as the static website (GitHub Pages): no server, the calculator runs in the browser (src/static). */
export const STATIC = import.meta.env.VITE_STATIC === "1";
/** GitHub repository (owner/name) the static website is published from: where contributions go. */
export const REPO = (import.meta.env.VITE_REPO as string | undefined) || "";

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (STATIC) return (await import("./static/client")).staticApi<T>(path, body);
  const r = await fetch(path, body === undefined ? { credentials: "include" } : {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export const coins = (v: number | null | undefined, d?: number) => {
  if (v == null || !Number.isFinite(v)) return "–";
  const a = Math.abs(v);
  if (d !== undefined) return v.toLocaleString(undefined, { maximumFractionDigits: d });
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
};
export const num = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
export const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "–" : `${(v * 100).toFixed(d)}%`);
export const dur = (h: number | null | undefined) => (h == null || !Number.isFinite(h) ? "–" : h < 1 / 60 ? "<1 min" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`);
export const utc = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
export const ago = (ms: number) => {
  const s = (Date.now() - ms) / 1000, a = Math.abs(s), f = (x: number, u: string) => (s >= 0 ? `${Math.round(x)} ${u} ago` : `in ${Math.round(x)} ${u}`);
  return a < 90 ? f(a, "s") : a < 5400 ? f(a / 60, "min") : a < 172800 ? f(a / 3600, "h") : f(a / 86400, "d");
};

const KEY = "bazaar-calc.v1";
export interface Saved { settings: Settings; profile: Profile }
export function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    // settings saved before 2026-10-02 carried the old default "at least 1 unit per hour", which hid rare high-value flips
    if (s.settings && !s.v) delete s.settings.minUnitsPerHour;
    return { settings: { ...DEFAULT_SETTINGS, ...s.settings }, profile: { ...DEFAULT_PROFILE, ...s.profile } };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, profile: { ...DEFAULT_PROFILE } };
  }
}
export function save(v: Saved) { try { localStorage.setItem(KEY, JSON.stringify({ ...v, v: 2 })); } catch { /* private mode */ } }

export interface CalcResponse {
  total: number; profitable: number; offset: number; rows: RankedOpportunity[]; marketAt: number; dataAt?: number; statsAt?: number; statsUsed?: boolean; perks?: string[];
  skipped: { kind: Opportunity["kind"]; key: string; title: string; reason: string }[];
}

/** "prices from 14:32" plus a warning when the scanner has not delivered new prices for a while */
export function dataAge(dataAt: number | undefined, fallback: number): { label: string; stale: string | null } {
  const t = dataAt || fallback, min = (Date.now() - t) / 60_000;
  return { label: `prices from ${new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    stale: min > 5 ? `These prices are ${min < 120 ? `${Math.round(min)} min` : `${(min / 60).toFixed(1)} h`} old: the scanner has not delivered new data, so the numbers may be out of date.` : null };
}

export const KIND_LABEL: Record<Opportunity["kind"], string> = { bazaar: "Bazaar flip", craft: "Craft flip", book: "Book flip", forge: "Forge", npc: "NPC flip" };

/** Static website: how old the published history (competition, fill times, typical prices) is, when that matters. */
export function historyAge(statsAt: number | undefined, used: boolean | undefined): string | null {
  if (statsAt == null) return null;
  const h = (Date.now() - statsAt) / 3600_000, when = h < 48 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`;
  if (used === false) return `The published history is ${when} old, too old to use: fill times, competition and typical prices are estimated without it. Contribute data to bring it up to date.`;
  if (h > 24) return `Prices are live from Hypixel, but the published history (fill times, competition, typical prices) is ${when} old. Contribute data to keep it fresh.`;
  return null;
}
