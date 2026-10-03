import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FLAG_TEXT, type GameEvent, type ItemMarket, type OutlookEntry } from "@bc/shared";
import { Spark, TimeChart } from "../components/Chart";
import { FillPanel } from "../components/FillPanel";
import { Icon } from "../components/Icon";
import { api, ago, coins, num, pct, utc } from "../lib";

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const Signed = ({ v, d = 1 }: { v: number | null | undefined; d?: number }) =>
  v == null ? <span className="muted">–</span> : <span className={v > 0 ? "up" : v < 0 ? "down" : ""}>{v > 0 ? "+" : ""}{pct(v, d)}</span>;

// ------------------------------------------------------------------ Outlook
export function Outlook() {
  const [days, setDays] = useState(7);
  const q = useQuery({ queryKey: ["outlook", days], queryFn: () => api<{ upcoming: GameEvent[]; outlook: (OutlookEntry & { name: string })[]; note: string }>(`/api/v1/outlook?days=${days}`) });
  const byEvent = useMemo(() => {
    const m = new Map<string, (OutlookEntry & { name: string })[]>();
    for (const o of q.data?.outlook ?? []) m.set(`${o.event}|${o.eventStart}`, [...(m.get(`${o.event}|${o.eventStart}`) ?? []), o]);
    return m;
  }, [q.data]);
  const upcoming = (q.data?.upcoming ?? []).filter(e => e.kind !== "mayor_perk");
  return (
    <>
      <div className="pagehead">
        <div><span className="eyebrow">Market</span><h1>Outlook</h1><p className="lede">How prices moved during past runs of the events coming up, so you can buy before and sell into them. Built from measured history; overlapping events and trends are not removed.</p></div>
        <div className="seg" role="tablist" aria-label="Look ahead">{[1, 3, 7, 14].map(d => <button key={d} className={d === days ? "on" : ""} onClick={() => setDays(d)}>{d} days</button>)}</div>
      </div>
      {q.isLoading && <div className="card empty">Loading upcoming events…</div>}
      <div className="stack">
        {upcoming.map(e => {
          const list = byEvent.get(`${e.name}|${e.start}`) ?? [];
          return (
            <section className="card" key={e.name + e.start}>
              <div className="pad spread" style={{ borderBottom: list.length ? "1px solid var(--line)" : 0 }}>
                <div className="row"><b style={{ fontFamily: "var(--display)", fontSize: 15.5 }}>{e.name}</b><span className="pill">{e.kind.replace("_", " ")}</span>{e.confidence === "approximate" && <span className="pill warn"><Icon name="warn" size={12} />{e.detail?.startsWith("forecast") ? "forecast" : "approximate time"}</span>}</div>
                <span className="small muted">{utc(e.start)} · {ago(e.start)}</span>
              </div>
              {list.length === 0 ? <div className="pad small muted">No item moved consistently in past runs of this event yet. This fills in as history builds up.</div> : (
                <div style={{ overflowX: "auto" }}><table><thead><tr><th className="l">Item</th><th>Average move</th><th>Same direction</th><th>Times seen</th><th className="l">Confidence</th></tr></thead><tbody>
                  {list.slice(0, 12).map(o => (
                    <tr key={o.itemId}><td className="l"><Link className="itemname" to={`/item/${o.itemId}`}>{o.name}</Link></td><td className="n"><Signed v={o.expectedChange} /></td>
                      <td className="n">{pct(o.consistency, 0)}</td><td className="n">{o.samples}</td>
                      <td className="l"><span className={`pill ${o.confidence === "high" ? "good" : o.confidence === "medium" ? "" : "warn"}`}>{o.confidence}</span></td></tr>
                  ))}
                </tbody></table></div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Items
export function Items() {
  const [q, setQ] = useState("");
  const r = useQuery({ queryKey: ["items", q], queryFn: () => api<{ id: string; name: string; on_bazaar: boolean; category: string | null }[]>(`/api/v1/items?q=${encodeURIComponent(q)}&limit=100`), placeholderData: p => p });
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Market</span><h1>Items</h1><p className="lede">Every SkyBlock item: price history, order book, recipes, and how it behaved during past events.</p></div></div>
      <label className="field" htmlFor="itemq" style={{ maxWidth: 520, marginBottom: 14 }}><input id="itemq" placeholder="Search by name or id, e.g. enchanted diamond" value={q} onChange={e => setQ(e.target.value)} autoFocus /></label>
      <div className="tablewrap"><table><thead><tr><th className="l">Item</th><th className="l">Id</th><th className="l">Category</th><th className="l">Trades on</th></tr></thead><tbody>
        {(r.data ?? []).map(i => <tr key={i.id}><td className="l"><Link className="itemname" to={`/item/${i.id}`}>{i.name}</Link></td><td className="l mono small muted">{i.id}</td><td className="l">{i.category?.replace(/_/g, " ").toLowerCase() ?? "–"}</td>
          <td className="l">{i.on_bazaar ? <span className="pill good">bazaar</span> : <span className="pill">auction / other</span>}</td></tr>)}
      </tbody></table></div>
    </>
  );
}

interface ItemDetail {
  id: string; name: string; market: ItemMarket | null; book: { ts: number; bids: { price: number; amount: number; orders: number }[]; asks: { price: number; amount: number; orders: number }[] } | null;
  recipes: { kind: string; inputs: { id: string; qty: number }[]; output_count: number; duration_s: number | null; requirement_text: string | null }[];
  usedIn: { output_id: string; kind: string; name: string }[];
  stats: { spark: (number | null)[]; chg24: number | null; chg7: number | null; volDaily: number | null; eventImpact?: { name: string; n: number; mean: number; consistency: number }[] } | null;
  enchant: { name: string; level: number; combine_cap: number | null; combine_status: string; max_level: number | null; enchanting_req: number | null; apply_xp_cost: number[]; url: string } | null;
}
const RANGES: [string, number][] = [["1D", 1], ["7D", 7], ["14D", 14], ["30D", 30], ["90D", 90], ["1Y", 365]];

export function Item() {
  const { id = "" } = useParams();
  const [range, setRange] = useState(14);
  const d = useQuery({ queryKey: ["item", id], queryFn: () => api<ItemDetail>(`/api/v1/items/${id}`) });
  const to = useMemo(() => Date.now(), [range, id]);
  const h = useQuery({ queryKey: ["hist", id, range], queryFn: () => api<{ series: Record<string, (number | null)[]> & { t: number[] } }>(`/api/v1/bazaar/${id}/history?from=${to - range * 86400_000}&to=${to}`), placeholderData: p => p });
  const ev = useQuery({ queryKey: ["events", range], queryFn: () => api<GameEvent[]>(`/api/v1/events?from=${to - range * 86400_000}&to=${to}`) });
  const ah = useQuery({ queryKey: ["ah", id], queryFn: () => api<{ latest: { lowest_bin: number | null; sales_24h: number; median_sale_24h: number | null } | null }>(`/api/v1/auctions/${id}`) });
  const priceLines = useMemo(() => h.data ? [
    { label: "Best buy order", values: h.data.series.bid_top ?? [], color: cssVar("--bid") },
    { label: "Best sell offer", values: h.data.series.ask_top ?? [], color: cssVar("--ask") },
  ] : [], [h.data]);
  const orderLines = useMemo(() => h.data ? [
    { label: "Buy orders", values: h.data.series.bid_orders ?? [], color: cssVar("--bid") },
    { label: "Sell offers", values: h.data.series.ask_orders ?? [], color: cssVar("--ask") },
  ] : [], [h.data]);
  if (d.isLoading) return <div className="card empty">Loading {id}…</div>;
  if (d.error) return <div className="note"><Icon name="warn" />{(d.error as Error).message}</div>;
  const it = d.data!, m = it.market, st = it.stats;
  const maxAmt = Math.max(1, ...(it.book?.bids ?? []).map(l => l.amount), ...(it.book?.asks ?? []).map(l => l.amount));

  return (
    <>
      <div className="pagehead">
        <div><span className="eyebrow mono">{it.id}</span><h1>{it.name}</h1>
          {m && <div className="row" style={{ marginTop: 8 }}><span className="small muted">updated {ago(m.ts)}</span>{m.flags.filter(f => f !== "low_history").map(f => <span key={f} className={`pill ${f === "likely_manipulated" ? "crit" : "warn"}`} title={m.flagWhy[f]}><Icon name="warn" size={12} />{FLAG_TEXT[f] ?? f}</span>)}</div>}
        </div>
        {st?.spark && st.spark.filter(v => v != null).length > 1 && <div className="card pad row" style={{ gap: 14 }}><Spark values={st.spark} width={140} height={34} /><div className="small"><div>24 h <Signed v={st.chg24} /></div><div>7 d <Signed v={st.chg7} /></div></div></div>}
      </div>

      <div className="grid cols-4">
        <div className="card tile"><div className="label">Best buy order <span className="muted">(instant-sell price)</span></div><div className="value" style={{ color: "var(--bid)" }}>{coins(m?.bid, 1)}</div><div className="sub">{num(m?.bidOrders)} orders · {num(m?.bidVolume)} units</div></div>
        <div className="card tile"><div className="label">Best sell offer <span className="muted">(instant-buy price)</span></div><div className="value" style={{ color: "var(--ask)" }}>{coins(m?.ask, 1)}</div><div className="sub">{num(m?.askOrders)} offers · {num(m?.askVolume)} units</div></div>
        <div className="card tile"><div className="label">Spread</div><div className="value">{m?.ask && m?.bid ? pct((m.ask - m.bid) / m.bid) : "–"}</div><div className="sub">usual {pct(m?.ref?.spreadMed)} over {m?.ref?.days ?? 14} days</div></div>
        <div className="card tile"><div className="label">Traded per hour</div><div className="value">{num(m ? m.isellWeek / 168 : null)} <span className="muted small">sold</span></div><div className="sub">{num(m ? m.ibuyWeek / 168 : null)} bought · outbid {num(m?.undercutBuyH, 0)}/h</div></div>
      </div>

      <section className="card pad" style={{ marginTop: 14 }}>
        <div className="spread"><h2 style={{ margin: 0 }}>Price</h2><div className="seg" role="tablist" aria-label="Range">{RANGES.map(([l, v]) => <button key={l} className={v === range ? "on" : ""} onClick={() => setRange(v)}>{l}</button>)}</div></div>
        <p className="small muted" style={{ margin: "4px 0 10px" }}>The green strip marks mayor terms; shaded columns are short events like the Spooky Festival.</p>
        {h.data && <TimeChart t={h.data.series.t} events={ev.data ?? []} fmt={v => coins(v)} lines={priceLines} />}
        <h2>Orders on the book</h2>
        {h.data && <TimeChart t={h.data.series.t} height={170} fmt={v => num(v)} lines={orderLines} />}
      </section>

      {m?.flags.includes("likely_manipulated") && (
        <div className="note" style={{ marginTop: 14, borderColor: "var(--crit-mark)" }}><Icon name="warn" />
          <span><b>Likely manipulated.</b> {m.flagWhy.likely_manipulated}. Calculators price a sale at no more than 10% above the typical level, and the planner leaves this item out.</span></div>
      )}
      {m?.ask != null && m?.bid != null && <FillPanel id={it.id} />}

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <section className="card">
          <div className="pad spread" style={{ borderBottom: "1px solid var(--line)" }}><h2 style={{ margin: 0 }}>Order book</h2>{it.book && <span className="small muted">{ago(it.book.ts)}</span>}</div>
          {it.book ? <div style={{ maxHeight: 440, overflow: "auto" }}><table>
            <thead><tr><th>Orders</th><th>Units</th><th>Buy order</th><th className="l">Sell offer</th><th className="l">Units</th><th className="l">Offers</th></tr></thead>
            <tbody>{Array.from({ length: Math.max(it.book.bids.length, it.book.asks.length) }, (_, i) => { const b = it.book!.bids[i], a = it.book!.asks[i]; return (
              <tr key={i}>
                <td className="n muted">{b?.orders ?? ""}</td>
                <td className="n" style={b ? { background: `linear-gradient(to left, color-mix(in srgb, var(--bid) 13%, transparent) ${(b.amount / maxAmt) * 100}%, transparent 0)` } : undefined}>{b ? num(b.amount) : ""}</td>
                <td className="n">{b ? coins(b.price, 1) : ""}</td>
                <td className="l n">{a ? coins(a.price, 1) : ""}</td>
                <td className="l n" style={a ? { background: `linear-gradient(to right, color-mix(in srgb, var(--ask) 13%, transparent) ${(a.amount / maxAmt) * 100}%, transparent 0)` } : undefined}>{a ? num(a.amount) : ""}</td>
                <td className="l n muted">{a?.orders ?? ""}</td>
              </tr>); })}</tbody>
          </table></div> : <div className="empty">Not traded on the bazaar.</div>}
          {ah.data?.latest && <div className="pad small" style={{ borderTop: "1px solid var(--line)" }}>Auction house: lowest BIN <b className="coin">{coins(ah.data.latest.lowest_bin != null ? ah.data.latest.lowest_bin / 100 : null)}</b> · {ah.data.latest.sales_24h} sold in 24 h, median <b className="coin">{coins(ah.data.latest.median_sale_24h != null ? ah.data.latest.median_sale_24h / 100 : null)}</b></div>}
        </section>

        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Made from &amp; used in</h2>
          {it.enchant && <div className="note"><Icon name="book" /><span>Two level-N books combine into level N+1 up to <b>{it.enchant.combine_cap ? `level ${it.enchant.combine_cap}` : "an unknown level"}</b>{it.enchant.max_level && it.enchant.combine_cap && it.enchant.max_level > it.enchant.combine_cap ? `; levels above ${it.enchant.combine_cap} only come from other sources` : ""}.
            {it.enchant.enchanting_req ? ` Applying it needs Enchanting ${it.enchant.enchanting_req}.` : ""} <a href={it.enchant.url} target="_blank" rel="noreferrer">Wiki</a></span></div>}
          {it.recipes.length === 0 && !it.enchant && <p className="muted small" style={{ margin: 0 }}>No crafting or forge recipe.</p>}
          {it.recipes.map((r, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <div className="row"><span className="pill kind"><Icon name={r.kind === "forge" ? "flame" : "craft"} size={12} />{r.kind}</span>{r.output_count > 1 && <span className="small muted">makes {r.output_count}</span>}{r.duration_s ? <span className="small muted">{(r.duration_s / 3600).toFixed(2)} h base</span> : null}{r.requirement_text && <span className="pill">{r.requirement_text.replace(/^Requires:?\s*/, "needs ")}</span>}</div>
              <div className="pills">{r.inputs.map(x => <Link key={x.id} className="pill" to={`/item/${x.id}`}><b className="num">{num(x.qty, 2)}×</b>&nbsp;{x.id.replace(/_/g, " ").toLowerCase()}</Link>)}</div>
            </div>
          ))}
          {it.usedIn.length > 0 && <><span className="eyebrow">Used in</span><div className="pills">{it.usedIn.map(u => <Link key={u.output_id + u.kind} className="pill" to={`/item/${u.output_id}`}>{u.name}{u.kind === "forge" ? " · forge" : ""}</Link>)}</div></>}
          {st?.eventImpact && st.eventImpact.length > 0 && <>
            <span className="eyebrow">During past events</span>
            <table><tbody>{st.eventImpact.slice(0, 8).map(e => <tr key={e.name}><td className="l">{e.name}</td><td className="n"><Signed v={e.mean} /></td><td className="n muted small">{e.n}× · {pct(e.consistency, 0)} same way</td></tr>)}</tbody></table>
          </>}
        </section>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ Events & mayors
export function Events() {
  const now = useMemo(() => Date.now(), []);
  const ev = useQuery({ queryKey: ["events-now"], queryFn: () => api<GameEvent[]>(`/api/v1/events?from=${now - 86400_000}&to=${now + 7 * 86400_000}`) });
  const may = useQuery({ queryKey: ["mayors"], queryFn: () => api<{ terms: { electionYear: number; name: string; start: number; end: number; perks: string[]; minister: { name: string; perk: string | null } | null; votes: number | null }[]; election: { year: number; candidates: { name: string; votes?: number; perks: { name: string; minister?: boolean }[] }[] } | null }>("/api/v1/mayors") });
  const total = may.data?.election?.candidates.reduce((a, c) => a + (c.votes ?? 0), 0) ?? 0;
  const list = (ev.data ?? []).filter(e => e.kind !== "mayor_perk");
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Market</span><h1>Events &amp; mayors</h1><p className="lede">What is running now and in the next seven days, the live election, and every mayor term we have.</p></div></div>
      <div className="grid cols-2">
        <section className="card">
          <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}><h2 style={{ margin: 0 }}>Now and next 7 days</h2></div>
          <div style={{ overflowX: "auto" }}><table><tbody>{list.map(e => (
            <tr key={e.name + e.start}><td className="l"><b>{e.name}</b>{e.detail ? <div className="small muted">{e.detail}</div> : null}</td>
              <td className="l small">{e.start <= now && e.end > now ? <span className="pill good">running · ends {ago(e.end)}</span> : <span className="muted">{ago(e.start)}</span>}</td>
              <td className="n small muted">{utc(e.start)}</td>
              <td className="l">{e.confidence !== "exact" && <span className={`pill ${e.confidence === "approximate" ? "warn" : ""}`}>{e.confidence === "approximate" ? "approx." : "schedule"}</span>}</td></tr>
          ))}</tbody></table></div>
        </section>
        {may.data?.election && <section className="card">
          <div className="pad" style={{ borderBottom: "1px solid var(--line)" }}><h2 style={{ margin: 0 }}>Election for year {may.data.election.year}</h2></div>
          <div className="pad stack">
            {[...may.data.election.candidates].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0)).map(c => {
              const share = (c.votes ?? 0) / (total || 1);
              return (
                <div key={c.name} className="meter">
                  <div className="top"><span><b style={{ fontFamily: "var(--body)" }}>{c.name}</b> <span className="small muted">{c.perks.map(p => p.name + (p.minister ? " (minister)" : "")).join(" · ")}</span></span><span><b>{pct(share)}</b></span></div>
                  <div className="track"><div className="fill" style={{ width: `${share * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>}
      </div>
      <h2>Mayor history</h2>
      <div className="tablewrap"><table><thead><tr><th className="l">Year</th><th className="l">Mayor</th><th className="l">Perks</th><th className="l">Minister</th><th>Votes</th><th>Term start</th></tr></thead><tbody>
        {(may.data?.terms ?? []).map(t => <tr key={t.electionYear}><td className="l n">{t.electionYear}</td><td className="l"><b>{t.name}</b></td><td className="l"><div className="pills">{t.perks.map(p => <span key={p} className="pill">{p}</span>)}</div></td>
          <td className="l">{t.minister ? <>{t.minister.name} <span className="muted small">{t.minister.perk}</span></> : <span className="muted">–</span>}</td><td className="n">{num(t.votes)}</td><td className="n small">{utc(t.start)}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
