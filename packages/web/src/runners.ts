// Background work while the site is open (mounted once in the page frame), run on every new market snapshot:
//  - flip alerts: routes newly meeting your alert rules (the first check only records what is already there)
//  - tracked orders: each of your orders checked against the live order book (fill/order-tracker.ts)
//  - paper trading: the static site runs it in the backend worker; a self-hosted server runs its own around the clock
import { useEffect, useRef } from "react";
import { type RankedOpportunity, type TrackedOrder, updateOrder } from "@bc/shared";
import { KIND_LABEL, STATIC, api, coins, num, pct } from "./lib";
import { needInBackground, useLive } from "./live";
import { notify } from "./notify";
import { alertSettings, favourites, paperRecord, trackedOrders } from "./prefs";
import { useApp } from "./state";

const RANK = { low: 0, medium: 1, high: 2 } as const;

export function useAlertRunner() {
  const s = alertSettings.use(), fav = favourites.use(), live = useLive();
  const { settings, profile } = useApp();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => { needInBackground("alerts", s.enabled); seen.current = null; }, [s.enabled, s.minCoinsH, s.minMarginPct, s.kinds.join(), s.noWarnings, s.favouritesOnly, s.minConfidence]);
  useEffect(() => {
    if (!s.enabled || !live.dataAt) return;
    let cancelled = false;
    void api<{ rows: RankedOpportunity[] }>("/api/v1/calc/all", { settings, profile,
      filters: { limit: 500, minCoinsH: s.minCoinsH || undefined, minMargin: s.minMarginPct ? s.minMarginPct / 100 : undefined, noFlags: s.noWarnings || undefined, profitableOnly: true, sort: "scoreH" } })
      .then(r => {
        if (cancelled) return;
        const ok = r.rows.filter(o => s.kinds.includes(o.kind) && RANK[o.confidence.level] >= RANK[s.minConfidence] && !o.key.endsWith(":instant")
          && (!s.favouritesOnly || fav.includes(o.outputId)));
        if (seen.current) for (const o of ok.filter(o => !seen.current!.has(o.key)).slice(0, 5))
          notify({ channel: "flips", level: "good", link: `/flips/${o.kind}`, title: `${KIND_LABEL[o.kind]}: ${o.title}`,
            body: `${coins(o.coinsH)}/h · ${coins(o.profitPerUnit)} per unit · ${pct(o.marginPct)} margin · ${o.confidence.level} confidence` });
        seen.current = new Set(ok.map(o => o.key));
      }).catch(() => { /* next snapshot tries again */ });
    return () => { cancelled = true; };
  }, [live.dataAt, s, fav, settings, profile]);
}

const sideWord = (o: TrackedOrder) => (o.side === "buy" ? "buy order" : "sell offer");

export function useOrderRunner() {
  const orders = trackedOrders.use(), s = alertSettings.use(), live = useLive();
  const ids = [...new Set(orders.filter(o => o.status !== "filled").map(o => o.item))].sort().join(",");
  useEffect(() => { needInBackground("orders", ids.length > 0); }, [ids]);
  useEffect(() => {
    if (!ids || !live.dataAt) return;
    let cancelled = false;
    void api<{ items: Record<string, Parameters<typeof updateOrder>[1]> }>(`/api/v1/books?ids=${encodeURIComponent(ids)}`).then(r => {
      if (cancelled) return;
      const events: ReturnType<typeof updateOrder>["events"] = [];
      trackedOrders.set(all => all.map(o => { const b = r.items[o.item]; if (!b) return o; const u = updateOrder(o, b); events.push(...u.events); return u.order; }));
      if (!s.orderEvents) return;
      for (const e of events) {
        const o = e.order, what = `${o.name}: your ${sideWord(o)} of ${num(o.amount)} at ${num(o.price, 1)}`;
        if (e.type === "outbid") notify({ channel: "orders", level: "warn", link: "/orders", title: `${o.side === "buy" ? "Outbid" : "Undercut"}: ${o.name}`, body: `${what} is no longer on top (best ${num(o.best, 1)}). Relist at ${num(e.relist, 1)}.` });
        else if (e.type === "filled") notify({ channel: "orders", level: "good", link: "/orders", title: `Filled: ${o.name}`, body: `${what} ${e.confirmed ? "is filled (the best price moved past yours)" : "looks filled (estimate)"}. Claim it in the bazaar.` });
        else if (e.type === "top") notify({ channel: "orders", level: "info", link: "/orders", title: `Back on top: ${o.name}`, body: `${what} is the best price again.` });
      }
    }).catch(() => { /* next snapshot tries again */ });
    return () => { cancelled = true; };
  }, [live.dataAt, ids, s.orderEvents]);
}

/** Static site: paper trading runs in the backend worker with your settings; the record is saved here. */
export function usePaperRunner() {
  const { settings, profile } = useApp();
  useEffect(() => {
    if (!STATIC) return;
    void import("./static/client").then(c => c.setPaper({ settings, profile, state: paperRecord.get() }));
  }, [settings, profile]);
}
