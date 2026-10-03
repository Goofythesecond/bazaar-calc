import { Link, NavLink, Outlet } from "react-router-dom";
import { NOTICE, orderSlots, taxRate } from "@bc/shared";
import { STATIC, coins } from "../lib";
import { useApp } from "../state";
import { useTheme } from "../theme";
import { Icon, Logo } from "./Icon";
import { SettingsDrawer } from "./SettingsDrawer";

const GROUPS: { label: string; links: [string, string, string][] }[] = [
  { label: "Plan", links: [["/", "Best route", "route"]] },
  { label: "Flips", links: [["/flips/bazaar", "Bazaar", "swap"], ["/flips/craft", "Craft", "craft"], ["/flips/book", "Books", "book"], ["/flips/forge", "Forge", "flame"]] },
  { label: "Market", links: [["/outlook", "Outlook", "trend"], ["/items", "Items", "box"], ["/events", "Events & mayors", "calendar"]] },
  { label: "Reference", links: [["/timing", "Timing & limits", "clock"], ["/api-docs", STATIC ? "Data files" : "API", "code"], ["/contribute", "Contribute", "upload"], ["/status", "Data status", "pulse"], ["/about", "Sources", "info"]] },
];

export function Layout() {
  const { setDrawer, settings: s, profile: p } = useApp();
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
            <span className="chip"><b className="coin">{coins(s.coins)}</b> coins</span>
            <span className="chip"><b>{orderSlots(s.bazaarFlipperLevel)}</b> order slots</span>
            <span className="chip"><b>{(taxRate(s.bazaarFlipperLevel) * 100).toFixed(3).replace(/0+$/, "")}%</b> tax</span>
            <span className="chip">check every <b>{s.checkIntervalMin}m</b></span>
            <span className="chip"><b>{s.pingMs}</b> ms ping</span>
            <span className="chip"><b>{s.hoursPerDay}h</b>/day</span>
            <span className="chip">HotM <b>{p.hotmTier}</b></span>
            {p.ignoreRequirements ? <span className="pill warn"><Icon name="warn" size={12} />unlocks ignored</span> : <span className="pill good"><Icon name="check" size={12} />using your unlocks</span>}
          </div>
          <button onClick={() => setDrawer(true)}><Icon name="sliders" />Settings &amp; unlocks</button>
        </div>
        <Outlet />
        <div className="footer">{NOTICE.affiliation} {NOTICE.data}</div>
      </main>
      <SettingsDrawer />
    </div>
  );
}
