// What you keep in this browser: favourites, tracked orders, alert settings, your decision journal and the paper-
// trading record. Saved in localStorage on this device only (nothing is uploaded); every read and write tolerates
// storage being blocked (private windows), in which case it lasts until the tab closes.
import { useSyncExternalStore } from "react";
import type { PaperState, RankedOpportunity, TrackedOrder } from "@bc/shared";

function store<T>(key: string, initial: T) {
  let value: T = initial;
  try {
    const raw = localStorage.getItem(key);
    // objects are merged over the defaults, so settings saved by an older version gain new fields
    if (raw != null) { const saved = JSON.parse(raw); value = (Array.isArray(initial) ? saved : { ...initial, ...saved }) as T; }
  } catch { /* blocked or corrupt: start from the defaults */ }
  const subs = new Set<() => void>();
  const get = () => value;
  const set = (v: T | ((prev: T) => T)) => {
    value = typeof v === "function" ? (v as (p: T) => T)(value) : v;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* blocked: keep in memory */ }
    subs.forEach(f => f());
  };
  const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
  const use = () => useSyncExternalStore(subscribe, get);
  return { get, set, use, subscribe };
}

export const favourites = store<string[]>("bazaar-calc.favourites", []);
export const toggleFavourite = (id: string) => favourites.set(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]));

export const trackedOrders = store<TrackedOrder[]>("bazaar-calc.orders", []);

export interface AlertSettings {
  enabled: boolean;
  minCoinsH: number;
  minMarginPct: number;
  kinds: string[];
  noWarnings: boolean;
  favouritesOnly: boolean;
  minConfidence: "low" | "medium" | "high";
  orderEvents: boolean;
  sound: boolean;
  browser: boolean;
  /** Discord webhook URL (kept on this device only) */
  discordWebhook: string;
  discordFlips: boolean;
  discordOrders: boolean;
}
export const DEFAULT_ALERTS: AlertSettings = {
  enabled: false, minCoinsH: 5_000_000, minMarginPct: 2, kinds: ["bazaar", "craft", "book", "forge", "npc"], noWarnings: true, favouritesOnly: false,
  minConfidence: "medium", orderEvents: true, sound: true, browser: false, discordWebhook: "", discordFlips: true, discordOrders: true,
};
export const alertSettings = store<AlertSettings>("bazaar-calc.alerts", DEFAULT_ALERTS);

/** A route you decided to run: what the calculator predicted at that moment, linked to the orders you track for it. */
export interface Decision {
  id: string;
  at: number;
  key: string; title: string; kind: string;
  predicted: Pick<RankedOpportunity, "profitPerUnit" | "coinsH" | "unitsH" | "batch" | "capitalUsed" | "marginPct"> & {
    confidence: RankedOpportunity["confidence"]; buys: { item: string; name: string; mode: string; price: number; qty: number }[];
    sell: { item: string; name: string; mode: string; price: number }; hoursForBatch: number | null;
  };
  orderIds: string[];
  closedAt?: number;
}
export const journal = store<Decision[]>("bazaar-calc.journal", []);

export const paperRecord = store<PaperState>("bazaar-calc.paper", { trades: [], lastPick: 0, counters: {}, lastTs: 0 });
