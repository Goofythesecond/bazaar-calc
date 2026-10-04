// Alert settings: which new flips and which order events notify you, and how (toast, sound, browser notification,
// Discord webhook). Settings stay in this browser. For alerts around the clock without a browser, a self-hosted server
// can run the same rules (ALERTS_FILE, see packages/api/README.md); the button below exports them.
import { useState } from "react";
import { Icon } from "../components/Icon";
import { KIND_LABEL, STATIC } from "../lib";
import { notify } from "../notify";
import { type AlertSettings, alertSettings, favourites } from "../prefs";
import { useApp } from "../state";

const KINDS = ["bazaar", "craft", "book", "forge", "npc", "kat", "fusion"] as const;

export function Alerts() {
  const s = alertSettings.use(), fav = favourites.use();
  const { settings, profile } = useApp();
  const set = (p: Partial<AlertSettings>) => alertSettings.set(v => ({ ...v, ...p }));
  const [perm, setPerm] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied");
  const webhookOk = !s.discordWebhook || /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(s.discordWebhook.trim());
  const serverConfig = JSON.stringify({ discordWebhook: s.discordWebhook, rules: { minCoinsH: s.minCoinsH, minMarginPct: s.minMarginPct, kinds: s.kinds, noWarnings: s.noWarnings, minConfidence: s.minConfidence,
    ...(s.favouritesOnly ? { items: fav } : {}) }, settings, profile }, null, 2);
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Trading</span><h1>Alerts</h1>
        <p className="lede">Get told when a new flip meets your rules, and when one of your tracked orders is outbid or filled. Checked on every new snapshot while this site is open (in a background tab about once a minute).</p></div></div>
      <div className="grid cols-2">
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>New flips</h2>
          <label className="check"><input type="checkbox" checked={s.enabled} onChange={e => set({ enabled: e.target.checked })} /> Alert me about new flips</label>
          <div className="grid cols-2">
            <label className="field" htmlFor="am"><span>At least coins / h</span><input id="am" type="number" step={500000} value={s.minCoinsH} onChange={e => set({ minCoinsH: Math.max(0, Number(e.target.value)) })} /></label>
            <label className="field" htmlFor="ag"><span>At least margin %</span><input id="ag" type="number" step={0.5} value={s.minMarginPct} onChange={e => set({ minMarginPct: Math.max(0, Number(e.target.value)) })} /></label>
          </div>
          <label className="field" htmlFor="ac"><span>At least confidence</span><select id="ac" value={s.minConfidence} onChange={e => set({ minConfidence: e.target.value as AlertSettings["minConfidence"] })}>
            <option value="low">any</option><option value="medium">medium</option><option value="high">high</option></select></label>
          <div className="row">{KINDS.map(k => (
            <label key={k} className="check"><input type="checkbox" checked={s.kinds.includes(k)} onChange={e => set({ kinds: e.target.checked ? [...s.kinds, k] : s.kinds.filter(x => x !== k) })} /> {KIND_LABEL[k]}</label>))}</div>
          <label className="check"><input type="checkbox" checked={s.noWarnings} onChange={e => set({ noWarnings: e.target.checked })} /> Skip markets with warnings</label>
          <label className="check"><input type="checkbox" checked={s.favouritesOnly} onChange={e => set({ favouritesOnly: e.target.checked })} /> Only my favourite items</label>
          <p className="small muted" style={{ margin: 0 }}>Uses your settings and unlocks from the settings drawer. The first check after you turn this on only notes what already qualifies.</p>
        </section>
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>How to tell you</h2>
          <label className="check"><input type="checkbox" checked={s.orderEvents} onChange={e => set({ orderEvents: e.target.checked })} /> Tracked orders: outbid, undercut, filled</label>
          <label className="check"><input type="checkbox" checked={s.sound} onChange={e => set({ sound: e.target.checked })} /> Sound</label>
          <label className="check"><input type="checkbox" checked={s.browser} onChange={async e => {
            const on = e.target.checked;
            if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") setPerm(await Notification.requestPermission());
            set({ browser: on });
          }} /> Browser notifications {perm === "denied" && s.browser && <span className="pill warn">blocked by the browser</span>}</label>
          <label className="field" htmlFor="aw"><span>Discord webhook (Server settings, Integrations, Webhooks, Copy URL)</span>
            <input id="aw" value={s.discordWebhook} placeholder="https://discord.com/api/webhooks/..." onChange={e => set({ discordWebhook: e.target.value.trim() })} aria-invalid={!webhookOk} /></label>
          {!webhookOk && <div className="note"><Icon name="warn" />That does not look like a Discord webhook URL.</div>}
          <div className="row">
            <label className="check"><input type="checkbox" checked={s.discordFlips} onChange={e => set({ discordFlips: e.target.checked })} /> Flips to Discord</label>
            <label className="check"><input type="checkbox" checked={s.discordOrders} onChange={e => set({ discordOrders: e.target.checked })} /> Orders to Discord</label>
          </div>
          <button onClick={() => notify({ channel: "test", level: "info", title: "Bazaar Calc test alert", body: "Alerts work. You will get flips and order events like this one." })} style={{ alignSelf: "flex-start" }}>Send a test alert</button>
          <p className="small muted" style={{ margin: 0 }}>The webhook is kept in this browser only. Anyone who has the URL can post to that channel, so do not share it.</p>
        </section>
      </div>
      <section className="card pad stack" style={{ marginTop: 14 }}>
        <h2 style={{ margin: 0 }}>Around the clock</h2>
        <p className="small" style={{ margin: 0 }}>{STATIC ? "This site only checks while it is open. " : ""}A self-hosted server (see the repository README) can send the same Discord alerts all day: save this as a file and start the server with <code className="mono">ALERTS_FILE=/path/to/alerts.json</code>.</p>
        <button className="ghost" style={{ alignSelf: "flex-start" }} onClick={() => {
          const url = URL.createObjectURL(new Blob([serverConfig], { type: "application/json" }));
          const a = document.createElement("a"); a.href = url; a.download = "alerts.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
        }}><Icon name="upload" />Download alerts.json</button>
      </section>
    </>
  );
}
