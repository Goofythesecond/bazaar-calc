// Live updates for every page: keeps prices current and tells pages when to recalculate.
// Static site: the backend worker reports each new Hypixel snapshot (every 20 s while the tab is visible; once a minute in
// the background when alerts or tracked orders need it, else paused) and newly published history.
// Self-hosted: /api/v1/health is checked every 10 s (the server's scanner polls Hypixel every 20 s).
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { STATIC, api } from "./lib";
import { paperRecord } from "./prefs";

export interface LiveState {
  /** Hypixel time of the prices on screen */
  dataAt: number | null;
  /** local time the next snapshot is due (static site, live mode) */
  nextAt: number | null;
  mode: "live" | "minute" | "paused" | "server";
  /** set when newer history was published while the page was open */
  historyAt: number | null;
  error: string | null;
}

let state: LiveState = { dataAt: null, nextAt: null, mode: STATIC ? "live" : "server", historyAt: null, error: null };
const subs = new Set<() => void>();
const set = (p: Partial<LiveState>) => { state = { ...state, ...p }; subs.forEach(f => f()); };
export const useLive = () => useSyncExternalStore(fn => { subs.add(fn); return () => subs.delete(fn); }, () => state);

/** Something on the page needs prices while the tab is hidden (alerts, tracked orders, paper trading). */
const backgroundNeeds = new Set<string>();
export function needInBackground(who: string, on: boolean) { if (on) backgroundNeeds.add(who); else backgroundNeeds.delete(who); applyMode(); }

let applyMode = () => {};

// queries that depend on live prices; the rest (rules, recipes, mayors, fill reports) refresh on their own schedule
const LIVE_KEYS = new Set(["calc", "plan", "item", "hist", "status", "dips", "orders-book", "alerts", "paper"]);

/** Mount once (in the page frame). */
export function useLiveUpdates() {
  const qc = useQueryClient();
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ predicate: q => LIVE_KEYS.has(String(q.queryKey[0])) });
    if (STATIC) {
      let off = () => {};
      let alive = true;
      void import("./static/client").then(c => {
        if (!alive) return;
        off = c.onWorkerEvent(ev => {
          if (ev.type === "snapshot") { set({ dataAt: ev.dataAt, nextAt: ev.nextAt, mode: ev.mode, error: null }); refresh(); }
          else if (ev.type === "history") { set({ historyAt: ev.asOf }); void qc.invalidateQueries(); }
          else if (ev.type === "paper") paperRecord.set(ev.state);
          else set({ error: ev.message });
        });
        applyMode = () => {
          const visible = document.visibilityState === "visible";
          const mode = visible ? "live" : backgroundNeeds.size ? "minute" : "paused";
          set({ mode });
          c.setLiveMode(mode);
        };
        applyMode();
      });
      const onVis = () => applyMode();
      document.addEventListener("visibilitychange", onVis);
      return () => { alive = false; off(); document.removeEventListener("visibilitychange", onVis); };
    }
    // self-hosted: follow the server's newest prices
    const t = setInterval(async () => {
      try {
        const h = await api<{ dataAt?: number }>("/api/v1/health");
        if (h.dataAt && h.dataAt !== state.dataAt) { set({ dataAt: h.dataAt, error: null }); refresh(); }
      } catch (e) { set({ error: (e as Error).message }); }
    }, 10_000);
    return () => clearInterval(t);
  }, [qc]);
}
