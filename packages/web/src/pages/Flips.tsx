// Flip tables (bazaar / craft / book / forge): filters, sorting, every route incl. losing ones, route details.
import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RankedOpportunity } from "@bc/shared";
import { Icon } from "../components/Icon";
import { ConfidencePill, Detail, FavouriteStar, Flags, Requirements } from "../components/RouteView";
import { type CalcResponse, api, coins, dataAge, historyAge, num, pct } from "../lib";
import { favourites } from "../prefs";
import { useApp } from "../state";

const INFO: Record<string, { title: string; text: string }> = {
  bazaar: { title: "Bazaar flips", text: "Buy with an order just above the best buy order, relist just below the best sell offer. Same item, no crafting." },
  craft: { title: "Craft flips", text: "Buy the ingredients (crafting cheaper parts yourself when that wins), craft, sell the result. Recipes from NotEnoughUpdates-REPO." },
  book: { title: "Book flips", text: "Buy low-level enchanted books, combine pairs in an anvil up to the highest level that can be combined, sell the high book. Levels that only come from other sources, such as Dedication IV, are never used." },
  forge: { title: "Forge flips", text: "Buy or craft the inputs, forge, sell. Times include your Quick Forge level and Cole's Molten Forge when it is active." },
  npc: { title: "NPC flips", text: "Buy on the bazaar and sell to an NPC shop (no bazaar tax; NPCs pay out at most 500M coins a day), or buy from an NPC shop (at most 640 a day per merchant, 6,400 under Diaz's Shopping Spree) and sell on the bazaar." },
};

interface Filters {
  q: string; minCoinsH: number; minMargin: number; maxCapital: number; maxOrders: number;
  requirementsMet: boolean; noFlags: boolean; buy: "any" | "instant" | "order"; sell: "any" | "instant" | "offer";
  sort: "coinsH" | "scoreH" | "profitPerUnit" | "marginPct" | "unitsH" | "capitalUsed"; includeAhForge: boolean; profitableOnly: boolean; favouritesOnly: boolean;
}
const DEFAULT: Filters = { q: "", minCoinsH: 0, minMargin: 0, maxCapital: 0, maxOrders: 28, requirementsMet: false, noFlags: false, buy: "any", sell: "any", sort: "coinsH", includeAhForge: false, profitableOnly: false, favouritesOnly: false };
const PAGE = 50;

/** The three best routes right now as plain instructions: buy order N x item @ price, then sell offer @ price. */
function TopPicks({ rows, onOpen }: { rows: RankedOpportunity[]; onOpen: (o: RankedOpportunity) => void }) {
  const step = (o: RankedOpportunity) => {
    const buy = o.orderPlan.find(l => l.side === "buy"), sell = o.orderPlan.find(l => l.side === "sell");
    const b = buy ? `buy order ${num(buy.qty)}× ${buy.name} @ ${num(buy.price, 1)}` : o.buys.map(x => `${x.mode === "npc" ? "NPC" : "instant buy"} ${x.name}`).join(", ");
    const s = sell ? `sell offer @ ${num(sell.price, 1)}` : o.sell.mode === "npc" ? `sell to an NPC @ ${num(o.sell.grossPrice, 1)}` : `instant sell @ ${num(o.sell.grossPrice, 1)}`;
    return `${b} → ${s}`;
  };
  return (
    <section className="card pad stack" style={{ marginBottom: 12 }} aria-label="Top picks">
      <span className="eyebrow">Top picks now (coins/h × confidence, no market warnings)</span>
      {rows.map((o, i) => (
        <div key={o.key} className="spread" style={{ gap: 10, flexWrap: "wrap" }}>
          <span><b>{i + 1}. {o.title}</b> <span className="small muted">{step(o)}</span></span>
          <span className="row" style={{ gap: 8 }}><span className="coin"><b>{coins(o.coinsH)}</b>/h</span><ConfidencePill c={o.confidence} /><button className="ghost" onClick={() => onOpen(o)}>Details</button></span>
        </div>
      ))}
    </section>
  );
}

export function Flips() {
  const { kind = "bazaar" } = useParams();
  const { settings, profile } = useApp();
  const favs = favourites.use();
  const [f, setF] = useState<Filters>(DEFAULT);
  const [open, setOpen] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const filters = {
    q: f.q || undefined, minCoinsH: f.minCoinsH || undefined, minMargin: f.minMargin ? f.minMargin / 100 : undefined,
    maxCapital: f.maxCapital || undefined, maxOrders: f.maxOrders, requirementsMet: f.requirementsMet || undefined, noFlags: f.noFlags || undefined,
    buyModes: f.buy === "any" ? undefined : [f.buy], sellModes: f.sell === "any" ? undefined : [f.sell], sort: f.sort, limit: PAGE, offset: page * PAGE,
    includeAhForge: f.includeAhForge || undefined, profitableOnly: f.profitableOnly || undefined, items: f.favouritesOnly ? favs : undefined,
  };
  const q = useQuery({
    queryKey: ["calc", kind, settings, profile, filters],
    queryFn: () => api<CalcResponse>(`/api/v1/calc/${kind}`, { settings, profile, filters }),
    placeholderData: prev => prev, // refreshed on every new snapshot (live.ts)
  });
  // top picks: the best routes by coins/h x confidence, without market warnings
  const picks = useQuery({ queryKey: ["calc", kind, "picks", settings, profile], placeholderData: prev => prev,
    queryFn: () => api<CalcResponse>(`/api/v1/calc/${kind}`, { settings, profile, filters: { sort: "scoreH", limit: 3, profitableOnly: true, noFlags: true } }) });
  const info = INFO[kind] ?? INFO.bazaar!;
  const set = (p: Partial<Filters>) => { setF({ ...f, ...p }); setPage(0); };
  const Th = ({ k, children }: { k: Filters["sort"]; children: string }) => (
    <th className={`sortable ${f.sort === k ? "sorted" : ""}`} onClick={() => set({ sort: k })} aria-sort={f.sort === k ? "descending" : "none"}>{children}{f.sort === k ? " ↓" : ""}</th>
  );

  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Flips</span><h1>{info.title}</h1><p className="lede">{info.text}</p></div></div>

      <section className="card filters" aria-label="Filters">
        <label className="field grow" htmlFor="fq"><span>Search</span><input id="fq" value={f.q} placeholder="Item name or id" onChange={e => set({ q: e.target.value })} /></label>
        <label className="field" htmlFor="fmin"><span>Min coins / h</span><input id="fmin" type="number" step={100000} value={f.minCoinsH} onChange={e => set({ minCoinsH: Number(e.target.value) })} /></label>
        <label className="field" htmlFor="fmargin"><span>Min margin %</span><input id="fmargin" type="number" value={f.minMargin} onChange={e => set({ minMargin: Number(e.target.value) })} /></label>
        <label className="field" htmlFor="fcap"><span>Max capital</span><input id="fcap" type="number" step={1e6} value={f.maxCapital} onChange={e => set({ maxCapital: Number(e.target.value) })} /></label>
        <label className="field" htmlFor="fslots"><span>Max order slots</span><input id="fslots" type="number" min={0} max={28} value={f.maxOrders} onChange={e => set({ maxOrders: Number(e.target.value) })} /></label>
        <label className="field" htmlFor="fbuy"><span>Buy with</span><select id="fbuy" value={f.buy} onChange={e => set({ buy: e.target.value as Filters["buy"] })}><option value="any">Either</option><option value="instant">Instant buy</option><option value="order">Buy orders</option></select></label>
        <label className="field" htmlFor="fsell"><span>Sell with</span><select id="fsell" value={f.sell} onChange={e => set({ sell: e.target.value as Filters["sell"] })}><option value="any">Either</option><option value="instant">Instant sell</option><option value="offer">Sell offers</option></select></label>
        <div className="stack" style={{ gap: 6 }}>
          <label className="check"><input type="checkbox" checked={f.requirementsMet} onChange={e => set({ requirementsMet: e.target.checked })} /> Unlocked by me</label>
          <label className="check"><input type="checkbox" checked={f.noFlags} onChange={e => set({ noFlags: e.target.checked })} /> No market warnings</label>
          <label className="check"><input type="checkbox" checked={f.profitableOnly} onChange={e => set({ profitableOnly: e.target.checked })} /> Profitable only</label>
          <label className="check"><input type="checkbox" checked={f.favouritesOnly} onChange={e => set({ favouritesOnly: e.target.checked })} /> My favourites ({favs.length})</label>
          {(kind === "forge" || kind === "craft") && <label className="check"><input type="checkbox" checked={f.includeAhForge} onChange={e => set({ includeAhForge: e.target.checked })} /> Auction-house outputs</label>}
        </div>
        <button className="ghost" onClick={() => { setF(DEFAULT); setPage(0); }}>Reset</button>
      </section>

      {q.error && <div className="note"><Icon name="warn" />{(q.error as Error).message}</div>}
      {q.isLoading && !q.data && <div className="card empty">Calculating from the current market…</div>}
      {q.data && dataAge(q.data.dataAt, q.data.marketAt).stale && <div className="note"><Icon name="warn" />{dataAge(q.data.dataAt, q.data.marketAt).stale}</div>}
      {q.data && historyAge(q.data.statsAt, q.data.statsUsed) && <div className="note"><Icon name="info" />{historyAge(q.data.statsAt, q.data.statsUsed)}</div>}
      {picks.data && picks.data.rows.length > 0 && <TopPicks rows={picks.data.rows} onOpen={o => { setF({ ...DEFAULT, sort: f.sort, q: o.title }); setPage(0); setOpen(o.key); }} />}
      {q.data && <>
        <div className="spread small muted" style={{ marginBottom: 8 }}>
          <span>{num(q.data.total)} routes, <b>{num(q.data.profitable)}</b> make money at your settings · routes with market warnings come last · {dataAge(q.data.dataAt, q.data.marketAt).label} · select a row for the full working and order sizes</span>
          <span className="row">
            <button className="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
            <span>{page + 1} / {Math.max(1, Math.ceil(q.data.total / PAGE))}</span>
            <button className="ghost" disabled={(page + 1) * PAGE >= q.data.total} onClick={() => setPage(page + 1)}>Next</button>
          </span>
        </div>
        <div className="tablewrap" style={{ opacity: q.isFetching ? 0.8 : 1 }}>
          <table>
            <thead><tr>
              <th></th><th className="l">Item</th><Th k="coinsH">Coins / h</Th><Th k="scoreH">× confidence</Th><Th k="profitPerUnit">Profit / unit</Th><Th k="marginPct">Margin</Th><Th k="unitsH">Units / h</Th>
              <th className="l">Limited by</th><th className="l">Buy → sell</th><Th k="capitalUsed">Capital</Th><th>Slots</th><th className="l">Unlocks</th>
            </tr></thead>
            <tbody>
              {q.data.rows.length === 0 && <tr><td colSpan={12} className="empty">No routes match these filters.</td></tr>}
              {q.data.rows.map(o => (
                <Fragment key={o.key}>
                  <tr className={`hover ${open === o.key ? "open" : ""}`} onClick={() => setOpen(open === o.key ? null : o.key)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setOpen(open === o.key ? null : o.key)}>
                    <td><FavouriteStar id={o.outputId} /></td>
                    <td className="l"><div className="row" style={{ gap: 6 }}><Link className="itemname" to={`/item/${o.outputId}`} onClick={e => e.stopPropagation()}>{o.title}</Link>{o.key.endsWith(":instant") && <span className="pill">no slots</span>}<Flags flags={o.flags} max={1} /></div></td>
                    <td className={`n ${o.coinsH > 0 ? "coin" : "down"}`}><b>{coins(o.coinsH)}</b></td>
                    <td className="n"><ConfidencePill c={o.confidence} /></td><td className={`n ${o.profitPerUnit > 0 ? "" : "down"}`}>{coins(o.profitPerUnit)}</td><td className={`n ${o.marginPct > 0 ? "" : "down"}`}>{pct(o.marginPct)}</td>
                    <td className="n">{num(o.unitsH, 1)}</td><td className="l">{o.limitedBy}</td>
                    <td className="l small">{[...new Set(o.buys.map(b => (b.mode === "order" ? "order" : b.mode === "npc" ? "NPC" : "instant")))].join(" + ")} → {o.sell.mode === "offer" ? "offer" : o.sell.mode === "npc" ? "NPC" : o.sell.mode}</td>
                    <td className="n">{coins(o.capitalUsed)}</td><td className="n">{o.ordersUsed}</td>
                    <td className="l"><Requirements o={o} compact /></td>
                  </tr>
                  {open === o.key && <tr className="open"><td colSpan={12} className="detail"><div className="detail-inner"><Detail o={o} /></div></td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {q.data.skipped.filter(x => x.kind === kind).length > 0 && (
          <details className="card pad" style={{ marginTop: 12 }}>
            <summary className="muted">{num(q.data.skipped.filter(x => x.kind === kind).length)} more {kind === "book" ? "enchants" : "recipes"} could not be priced: see why</summary>
            <div className="tablewrap" style={{ marginTop: 10 }}><table><tbody>{q.data.skipped.filter(x => x.kind === kind).slice(0, 400).map(x => (
              <tr key={x.key}><td className="l">{x.key.includes(":") && kind !== "book" ? <Link className="itemname" to={`/item/${x.key.split(":")[1]}`}>{x.title}</Link> : x.title}</td><td className="l muted small">{x.reason}</td></tr>
            ))}</tbody></table></div>
          </details>
        )}
      </>}
    </>
  );
}
