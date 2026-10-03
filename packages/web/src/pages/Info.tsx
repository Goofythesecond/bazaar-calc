import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ACTIONS, BAZAAR, BAZAAR_SOURCES, NOTICE, actionSeconds, msUntilLimitReset, orderSlots, taxRate } from "@bc/shared";
import { Icon } from "../components/Icon";
import { api, coins, num, utc } from "../lib";
import { useApp } from "../state";

// ------------------------------------------------------------------ Timing & limits
export function Timing() {
  const { settings: s } = useApp();
  const m = useQuery({ queryKey: ["timing", s.pingMs, s.clickDelayMs, s.typingMs], queryFn: () => api<{ measuredByContributors: { action: string; n: number; median_ms: number; avg_ping: number }[] }>(`/api/v1/rules/timing?ping=${s.pingMs}&click=${s.clickDelayMs}&typing=${s.typingMs}`) });
  const reset = msUntilLimitReset();
  const max = Math.max(...Object.keys(ACTIONS).map(k => actionSeconds(k, s)));
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Reference</span><h1>Timing &amp; limits</h1>
        <p className="lede">How long each bazaar action takes for you: every menu step is your ping ({s.pingMs} ms) plus a 50 ms server tick plus your click delay ({s.clickDelayMs} ms); commands and amount signs use your typing time ({s.typingMs} ms).</p></div></div>
      <div className="tablewrap"><table><thead><tr><th className="l">Action</th><th>Steps</th><th className="l" style={{ width: "34%" }}>Time</th><th className="l">Menus you go through</th></tr></thead><tbody>
        {Object.entries(ACTIONS).map(([k, a]) => { const sec = actionSeconds(k, s); return (
          <tr key={k}><td className="l"><b>{a.label}</b></td><td className="n">{a.steps.length}</td>
            <td className="l"><div className="row" style={{ flexWrap: "nowrap" }}><div className="meter" style={{ flex: 1 }}><div className="track"><div className="fill" style={{ width: `${(sec / max) * 100}%` }} /></div></div><b className="num">{sec.toFixed(1)} s</b></div></td>
            <td className="l small muted" style={{ whiteSpace: "normal" }}>{a.menus.join(" → ")}</td></tr>); })}
      </tbody></table></div>
      {m.data && m.data.measuredByContributors.length > 0 && <><h2>Measured by contributors</h2><div className="tablewrap"><table><tbody>
        {m.data.measuredByContributors.map(x => <tr key={x.action}><td className="l">{x.action}</td><td className="n">{num(x.median_ms)} ms median</td><td className="n muted">{x.n} samples · ping {num(x.avg_ping)} ms</td></tr>)}</tbody></table></div></>}

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Daily bazaar limit</h2>
          <div><span className="coin" style={{ fontSize: 26, fontWeight: 600 }}>{coins(s.dailyLimit)}</span> <span className="muted">per day · resets 00:00 UTC, in {num(reset / 3600_000, 1)} h</span></div>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Counts instant buys, instant sells (before tax) and the full value of every buy order and sell offer <b>when you create it</b>.</li>
            <li>Does not count orders filling, claiming, or flipping a filled order.</li>
            <li><b>Relisting counts again.</b> The calculators include this.</li>
            <li>One action counts at most {num(BAZAAR.dailyLimitPerActionCap)} coins.</li>
          </ul>
          <p className="small muted" style={{ margin: 0, overflowWrap: "anywhere" }}>{BAZAAR_SOURCES.dailyLimit}</p>
        </section>
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Bazaar rules</h2>
          <div style={{ overflowX: "auto" }}><table className="small"><tbody>
            <tr><td className="l">Orders at once</td><td className="n">{[0, 1, 2].map(orderSlots).join(" / ")}</td><td className="l muted">Bazaar Flipper 0 / 1 / 2</td></tr>
            <tr><td className="l">Tax on sales</td><td className="n">{[0, 1, 2].map(l => `${(taxRate(l) * 100).toFixed(3).replace(/0+$/, "")}%`).join(" / ")}</td><td className="l muted">Bazaar Flipper 0 / 1 / 2</td></tr>
            <tr><td className="l">Units per order</td><td className="n">{num(BAZAAR.maxUnitsPerOrder)}</td><td className="l muted">{BAZAAR.maxUnitsPerOrderUnstackable} for unstackable items</td></tr>
            <tr><td className="l">On sell offer at once</td><td className="n">{coins(BAZAAR.maxSellOfferValue)}</td><td className="l muted">coins of items</td></tr>
            <tr><td className="l">Orders expire after</td><td className="n">{BAZAAR.orderExpiryDays} days</td><td className="l muted"></td></tr>
          </tbody></table></div>
          <p className="small muted" style={{ margin: 0, overflowWrap: "anywhere" }}>{BAZAAR_SOURCES.rules}</p>
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Contribute
interface Me { user: { id: number; username: string; avatar: string | null; discordId: string; role: string; trust: number } | null; contributions?: { kind: string; status: string; n: number }[] }
export function Contribute() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/api/v1/me") });
  const keys = useQuery({ queryKey: ["keys"], enabled: !!me.data?.user, queryFn: () => api<{ id: number; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }[]>("/api/v1/me/keys") });
  const board = useQuery({ queryKey: ["board"], queryFn: () => api<{ username: string; accepted: number }[]>("/api/v1/contributors") });
  const [newKey, setNewKey] = useState<string | null>(null);
  const create = async () => { const r = await api<{ key: string }>("/api/v1/me/keys", { name: "collector" }); setNewKey(r.key); void keys.refetch(); };
  const revoke = async (id: number) => { await fetch(`/api/v1/me/keys/${id}`, { method: "DELETE", credentials: "include" }); void keys.refetch(); };
  const u = me.data?.user;
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Community</span><h1>Contribute data</h1>
        <p className="lede">Keep the history complete by relaying Hypixel's public bazaar and auction data, and with the companion mod, your own order timings. Uploads are checked against data we already have; mismatches are rejected and lower your trust.</p></div></div>
      <div className="grid cols-2">
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Your key</h2>
          {!u ? <><p className="small" style={{ margin: 0 }}>Sign in with Discord to get a personal API key.</p><a className="btn primary" href="/api/auth/discord/login" style={{ alignSelf: "flex-start" }}>Sign in with Discord</a></> : <>
            <div className="spread"><span>Signed in as <b>{u.username}</b> <span className="pill">{u.role}</span> <span className="pill">trust {u.trust.toFixed(2)}</span></span>
              <button className="ghost" onClick={async () => { await api("/api/auth/logout", {}); void me.refetch(); }}>Sign out</button></div>
            {newKey && <div className="note"><Icon name="info" /><span>Your new key, shown once: <code className="mono">{newKey}</code></span></div>}
            <table className="small"><tbody>{(keys.data ?? []).map(k => <tr key={k.id}><td className="l mono">{k.prefix}…</td><td className="l muted">created {utc(Date.parse(k.created_at))}</td>
              <td>{k.revoked_at ? <span className="pill crit">revoked</span> : <button className="ghost" onClick={() => revoke(k.id)}>Revoke</button>}</td></tr>)}</tbody></table>
            <button className="primary" onClick={create} style={{ alignSelf: "flex-start" }}>Create key</button>
          </>}
        </section>
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Top contributors this month</h2>
          {(board.data ?? []).length === 0 ? <p className="small muted" style={{ margin: 0 }}>No uploads yet. Be the first.</p> :
            <table className="small"><tbody>{board.data!.map((b, i) => <tr key={b.username}><td className="l n muted">{i + 1}</td><td className="l"><b>{b.username}</b></td><td className="n">{num(b.accepted)} uploads</td></tr>)}</tbody></table>}
        </section>
      </div>
      <h2>Run the collector</h2>
      <section className="card pad stack">
        <p className="small" style={{ margin: 0 }}>Node 18 or newer, no dependencies. It polls Hypixel's key-less endpoints every 60 seconds and uploads exactly what Hypixel returned.</p>
        <pre className="mono small" style={{ margin: 0, overflowX: "auto", background: "var(--sunken)", padding: 12, borderRadius: 8 }}>{`BC_API_KEY=bc_your_key BC_SERVER=${location.origin} node packages/collector/src/server-upload.mjs`}</pre>
      </section>
      <h2>Companion mod events</h2>
      <section className="card pad stack small">
        <p style={{ margin: 0 }}>A client mod can send your own bazaar actions to <code className="mono">/api/v1/contribute/mod-events</code>. This is how real action times and fill speeds get measured. Only aggregates are published, and nothing here automates gameplay.</p>
        <pre className="mono" style={{ margin: 0, overflowX: "auto", background: "var(--sunken)", padding: 12, borderRadius: 8 }}>{`{ "events": [ { "ts": 1790000000000, "event": "order_created", "item_id": "ENCHANTED_DIAMOND",
  "side": "buy", "amount": 640, "price": 1242.6, "duration_ms": 412, "ping_ms": 78, "action": "create_buy_order" } ] }`}</pre>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ API docs
export function ApiDocs() {
  const spec = useQuery({ queryKey: ["openapi"], queryFn: () => api<{ info: { description: string }; paths: Record<string, Record<string, { summary: string; security?: unknown }>> }>("/api/openapi.json") });
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Reference</span><h1>API</h1><p className="lede">Every number on this site is available as JSON. Reading is public and rate limited; contributing needs a key. Full spec: <a href="/api/openapi.json">openapi.json</a>.</p></div></div>
      <section className="card pad stack" style={{ marginBottom: 14 }}>
        <span className="eyebrow">Example: top craft flips for 500M coins, only what you have unlocked</span>
        <pre className="mono small" style={{ margin: 0, overflowX: "auto", background: "var(--sunken)", padding: 12, borderRadius: 8 }}>{`curl -X POST ${location.origin}/api/v1/calc/craft -H 'content-type: application/json' -d '{
  "settings": { "coins": 500000000, "bazaarFlipperLevel": 2 },
  "profile":  { "ignoreRequirements": false, "collections": { "Diamond": 9 }, "hotmTier": 7 },
  "filters":  { "requirementsMet": true, "limit": 10 } }'`}</pre>
      </section>
      <div className="tablewrap"><table><thead><tr><th className="l">Method</th><th className="l">Path</th><th className="l">What it returns</th><th className="l">Access</th></tr></thead><tbody>
        {/* one row per path: GET (defaults) and POST (your settings) of the same endpoint are shown together */}
        {Object.entries(spec.data?.paths ?? {}).map(([p, ops]) => {
          const list = Object.entries(ops), main = (ops.post ?? list[0]![1]);
          return (
            <tr key={p}><td className="l mono small"><b>{list.map(([m]) => m.toUpperCase()).join(" · ")}</b></td><td className="l mono small">{p}</td>
              <td className="l" style={{ whiteSpace: "normal" }}>{main.summary}{ops.get && ops.post ? <span className="muted"> (GET uses the default settings)</span> : null}</td>
              <td className="l">{list.some(([, op]) => op.security) ? <span className="pill warn">API key</span> : <span className="pill good">public</span>}</td></tr>
          );
        })}
      </tbody></table></div>
    </>
  );
}

// ------------------------------------------------------------------ Status & sources
export function Status() {
  const q = useQuery({ queryKey: ["status"], queryFn: () => api<{ snapshots: { origin: number; n: number; first: number; last: number }[]; contributors7d: { contributors: number; accepted: number }; auctions: { keys: number; last: number }; recipes: { n: number; version: string }; marketLoadedAt: number }>("/api/v1/status"), refetchInterval: 30_000 });
  const names: Record<number, string> = { 1: "Our Hypixel polls", 2: "Contributor uploads", 6: "Internet Archive copies of the Hypixel API" };
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Reference</span><h1>Data status</h1><p className="lede">Where the history comes from and how fresh it is.</p></div></div>
      {q.data && <>
        <div className="grid cols-3">
          <div className="card tile"><div className="label">Market loaded</div><div className="value">{new Date(q.data.marketLoadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div><div className="sub">refreshes every 30 s</div></div>
          <div className="card tile"><div className="label">Recipes</div><div className="value">{num(q.data.recipes.n)}</div><div className="sub">NEU repo {q.data.recipes.version?.slice(0, 7) ?? "–"}</div></div>
          <div className="card tile"><div className="label">Auction items tracked</div><div className="value">{num(q.data.auctions.keys)}</div><div className="sub">{num(q.data.contributors7d.contributors)} contributors this week</div></div>
        </div>
        <h2>Bazaar history by source</h2>
        <div className="tablewrap"><table><thead><tr><th className="l">Source</th><th>Snapshots</th><th>First</th><th>Latest</th></tr></thead><tbody>
          {q.data.snapshots.map(s => <tr key={s.origin}><td className="l">{names[s.origin] ?? s.origin}</td><td className="n">{num(s.n)}</td><td className="n">{utc(Number(s.first))}</td><td className="n">{utc(Number(s.last))}</td></tr>)}
        </tbody></table></div>
      </>}
    </>
  );
}

export function About() {
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Reference</span><h1>Sources</h1><p className="lede">{NOTICE.affiliation}</p></div></div>
      <div className="grid cols-2">
        {[
          ["Market data", "The Hypixel Public API: bazaar, auctions, elections and items, polled by this site and its contributors. Older history comes from Internet Archive copies of the same endpoints. Auction records keep no player identifiers."],
          ["Recipes and forge", "NotEnoughUpdates-REPO, MIT License, © 2020 Moulberry: recipes, forge recipes and durations, unlock requirements and the Quick Forge formula."],
          ["Game rules", "hypixelskyblock.minecraft.wiki, CC BY-NC-SA 3.0: which enchanted books can be combined and up to which level, Enchanting requirements, XP costs, Forge and Bazaar rules."],
          ["Daily bazaar limit", "Community findings from the open-source SkyHanni and Bazaar Utils mods. Hypixel has not confirmed it, so the value is a setting."],
          ["Action timing", "A model of ping, server tick and click delay per menu step, replaced by measured timings from contributors where available."],
          ["What this site does not do", "No auction or NPC flips (auction prices are only a reference), and no automation of any kind. Estimates assume today's market holds."],
        ].map(([t, b]) => <section key={t} className="card pad"><h2 style={{ margin: "0 0 6px" }}>{t}</h2><p className="small" style={{ margin: 0, color: "var(--ink-2)" }}>{b}</p></section>)}
      </div>
    </>
  );
}
