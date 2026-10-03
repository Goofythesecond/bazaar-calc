// Page frame: navigation, the strip with your settings, theme switch, and the settings drawer.
import { Link, NavLink, Outlet } from "react-router-dom";
import { NOTICE, orderSlots, taxRate } from "@bc/shared";
import { useQuery } from "@tanstack/react-query";
import { STATIC, api, coins } from "../lib";
import { useApp } from "../state";
import { useTheme } from "../theme";
import { Icon, Logo } from "./Icon";
import { HistoryNotice, LiveBadge, PerkNotes } from "./Live";
import { SettingsDrawer } from "./SettingsDrawer";
import { useLiveUpdates } from "../live";
import { useAlertRunner, useOrderRunner, usePaperRunner } from "../runners";
import { Toasts } from "./Toasts";

const GROUPS: { label: string; links: [string, string, string][] }[] = [
  { label: "Plan", links: [["/", "Best route", "route"]] },
  { label: "Flips", links: [["/flips/bazaar", "Bazaar", "swap"], ["/flips/craft", "Craft", "craft"], ["/flips/book", "Books", "book"], ["/flips/forge", "Forge", "flame"], ["/flips/npc", "NPC", "sell"]] },
  { label: "Trading", links: [["/orders", "My orders", "order"], ["/alerts", "Alerts", "bolt"], ["/record", "Track record", "check"]] },
  { label: "Market", links: [["/outlook", "Outlook", "trend"], ["/dips", "Dips", "trend"], ["/items", "Items", "box"], ["/events", "Events & mayors", "calendar"]] },
  { label: "Reference", links: [["/timing", "Timing & limits", "clock"], ["/api-docs", STATIC ? "Data files" : "API", "code"], ["/contribute", "Contribute", "upload"], ["/status", "Data status", "pulse"], ["/about", "Sources", "info"]] },
];

export function Layout() {
  const { setDrawer, settings: s, profile: p } = useApp();
  useLiveUpdates();
  useAlertRunner();
  useOrderRunner();
  usePaperRunner();
  // effective tax: the server / static backend applies active mayor perks (Derpy's QUAD TAXES!!! = x4)
  const rules = useQuery({ queryKey: ["rules-bazaar"], queryFn: () => api<{ taxByFlipperLevel?: number[] }>("/api/v1/rules/bazaar"), staleTime: 600_000 });
  const tax = rules.data?.taxByFlipperLevel?.[s.bazaarFlipperLevel] ?? taxRate(s.bazaarFlipperLevel);
  const [theme, setTheme] = useTheme();
  return (
    <div className="shell">
      <aside className="rail">
        <Link to="/" className="logo"><Logo /><span>Bazaar Calc<small>SkyBlock market planner</small></span></Link>
        {GROUPS.map(g => (
          <nav key={g.label} className="navgroup" aria-label={g.label}>
            <span className="eyebrow">{g.label}</span>
            {g.links.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => (isActive ? "active" : "")}><Icon name={icon} />{label}</NavLink>
            ))}
          </nav>
        ))}
        <div className="rail-foot stack" style={{ gap: 10 }}>
          <div className="seg" role="radiogroup" aria-label="Theme">
            {(["system", "light", "dark"] as const).map(t => <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? "on" : ""} onClick={() => setTheme(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}
          </div>
          <span>Not affiliated with Hypixel. Data from the Hypixel Public API{STATIC ? ", recorded by contributors" : ""}.</span>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="strip" aria-label="Your settings">
            <LiveBadge />
            <PerkNotes />
            <span className="chip"><b className="coin">{coins(s.coins)}</b> coins</span>
            <span className="chip"><b>{orderSlots(s.bazaarFlipperLevel)}</b> order slots</span>
            <span className="chip"><b>{(tax * 100).toFixed(3).replace(/0+$/, "")}%</b> tax</span>
            <span className="chip">check every <b>{s.checkIntervalMin}m</b></span>
            <span className="chip"><b>{s.pingMs}</b> ms ping</span>
            <span className="chip"><b>{s.hoursPerDay}h</b>/day</span>
            <span className="chip">HotM <b>{p.hotmTier}</b></span>
            {p.ignoreRequirements ? <span className="pill warn"><Icon name="warn" size={12} />unlocks ignored</span> : <span className="pill good"><Icon name="check" size={12} />using your unlocks</span>}
          </div>
          <button onClick={() => setDrawer(true)}><Icon name="sliders" />Settings &amp; unlocks</button>
        </div>
        <HistoryNotice />
        <Outlet />
        <div className="footer">{NOTICE.affiliation} {NOTICE.data}</div>
      </main>
      <SettingsDrawer />
      <Toasts />
    </div>
  );
}
