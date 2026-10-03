// Top-bar status: how old the prices on screen are and when the next Hypixel snapshot is due (LIVE badge), plus the
// mayor / minister perks that are changing the maths right now (QUAD TAXES, Shopping Spree, Molten Forge).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib";
import { useLive } from "../live";
import { Icon } from "./Icon";

const secs = (ms: number) => `${Math.max(0, Math.round(ms / 1000))} s`;

export function LiveBadge() {
  const l = useLive();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  const now = Date.now();
  const age = l.dataAt ? now - l.dataAt : null;
  const label = l.mode === "live" ? "LIVE" : l.mode === "minute" ? "every minute" : l.mode === "paused" ? "paused" : "scanner";
  const ok = !l.error && age != null && age < 90_000;
  return (
    <span className={`pill ${ok ? "good" : "warn"}`} title={l.error ?? "Prices come straight from Hypixel; history from published data."}>
      <Icon name="pulse" size={12} />{label}
      {age != null && <span className="mono"> · {secs(age)} old</span>}
      {l.mode === "live" && l.nextAt && <span className="mono"> · next in {secs(l.nextAt + 1500 - now)}</span>}
    </span>
  );
}

/** Rule changes from the current mayor / minister (empty most of the time). */
export function PerkNotes() {
  const r = useQuery({ queryKey: ["rules-bazaar"], queryFn: () => api<{ activePerks?: string[] }>("/api/v1/rules/bazaar"), staleTime: 600_000 });
  const perks = r.data?.activePerks ?? [];
  if (!perks.length) return null;
  return <>{perks.map(p => <span key={p} className="pill warn" title="Applied to every calculation automatically"><Icon name="info" size={12} />{p}</span>)}</>;
}

/** Shown once newer history was published while this page was open (the page already switched to it). */
export function HistoryNotice() {
  const l = useLive();
  if (!l.historyAt) return null;
  return <div className="note"><Icon name="info" />Newer history was published (up to {new Date(l.historyAt).toISOString().slice(0, 16).replace("T", " ")} UTC) and is now in use.</div>;
}
