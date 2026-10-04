// One route in detail: the buy / process / sell flow, unlock requirements, market warnings and the full working.
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { FLAG_TEXT, type Opportunity, type RankedOpportunity } from "@bc/shared";
import { favourites, toggleFavourite } from "../prefs";
import { trackRoute } from "../track";
import { coins, num, pct } from "../lib";
import { useApp } from "../state";
import { Icon } from "./Icon";
import { OrderPlan } from "./OrderPlan";

const STEP_ICON = { craft: "craft", combine: "anvil", forge: "flame", kat: "paw", fuse: "merge" } as const;

/** The route as a left-to-right flow: what you buy, what you make, what you sell, with the amounts to use. */
export function Flow({ o }: { o: Opportunity }) {
  const { settings } = useApp();
  const day = (perH: number) => perH * settings.hoursPerDay;
  const plan = new Map(o.orderPlan.map(l => [`${l.side}|${l.item}`, l]));
  const perOut = (q: number) => (Math.abs(q - 1) > 1e-9 ? <span className="v"> ({num(q, q < 10 ? 2 : 0)} per {o.sell.name})</span> : null);
  const nodes = [
    ...o.buys.map(b => {
      const l = b.mode === "order" ? plan.get(`buy|${b.item}`) : undefined;
      return (
        <div key={`b${b.item}${b.mode}`} className="node buy">
          <span className="ic"><Icon name={b.mode === "order" ? "order" : b.mode === "npc" ? "box" : b.mode === "ah" ? "trend" : b.mode === "fee" ? "paw" : "bolt"} /></span>
          <span>
            <span className="v">{b.mode === "order" ? "Buy order" : b.mode === "npc" ? "NPC shop" : b.mode === "ah" ? "Auction BIN" : b.mode === "fee" ? "Pay" : "Instant buy"}</span>{" "}
            <b>{l ? `${l.parallel > 1 ? `${l.parallel} orders of ` : ""}${num(l.qty)}×` : `${num(day(o.unitsH * b.qty))}/day`}</b> {b.mode === "fee" ? <span className="itemname">{b.name}</span> : <Link className="itemname" to={`/item/${b.item}`}>{b.name}</Link>} <span className="v">@</span> <span className="num">{coins(b.price)}</span>
            <span className="sub">{l ? <>per order · ~{num(l.ordersH, 1)} orders/h · {num(day(l.unitsH))}/day</> : b.mode === "npc" ? <>{b.source ?? "NPC"} · not the bazaar</> : b.mode === "ah" ? <>lowest BIN of that rarity, any level · {num(b.flowH * 24)} sold/day</> : b.mode === "fee" ? <>coins, at level 1</> : <>in batches of up to 2,240</>}{perOut(b.qty)}</span>
          </span>
        </div>
      );
    }),
    ...o.steps.map((st, i) => (
      <div key={`s${i}`} className="node make"><span className="ic"><Icon name={STEP_ICON[st.type]} /></span><span>{st.label}<span className="sub">{num(day(o.unitsH * st.opsPerUnit))} times/day</span></span></div>
    )),
    (() => {
      const l = o.sell.mode === "offer" ? plan.get(`sell|${o.sell.item}`) : undefined;
      return (
        <div key="sell" className="node sell">
          <span className="ic"><Icon name="sell" /></span>
          <span>
            <span className="v">{o.sell.mode === "offer" ? "Sell offer" : o.sell.mode === "instant" ? "Instant sell" : o.sell.mode === "npc" ? "Sell to NPC" : "Auction (reference)"}</span>{" "}
            <b>{l ? `${num(l.qty)}×` : `${num(day(o.unitsH))}/day`}</b> <Link className="itemname" to={`/item/${o.sell.item}`}>{o.sell.name}</Link> <span className="v">@</span> <span className="num">{coins(o.sell.grossPrice)}</span>
            <span className="sub">{l ? <>per offer · ~{num(l.ordersH, 1)} offers/h · {num(day(l.unitsH))}/day</> : <>{num(day(o.unitsH))} over your {settings.hoursPerDay} h</>}
              {o.sell.currentPrice != null && <> · <span className="down">now {coins(o.sell.currentPrice)}, priced at its typical level</span></>}</span>
          </span>
        </div>
      );
    })(),
  ];
  return <div className="flow">{nodes.map((n, i) => <Fragment key={i}>{i > 0 && <span className="chev"><Icon name="chevron" size={14} /></span>}{n}</Fragment>)}</div>;
}

export function Requirements({ o, compact = false }: { o: Opportunity; compact?: boolean }) {
  if (!o.requirements.length) return compact ? null : <span className="pill good"><Icon name="check" size={12} />no unlocks needed</span>;
  const missing = new Set(o.unmet.map(r => r.text));
  return (
    <span className="pills">
      {o.requirements.map(r => (
        <span key={r.text} className={`pill ${missing.has(r.text) ? "crit" : r.type === "unverified" ? "warn" : "good"}`} title={missing.has(r.text) ? "You have not unlocked this" : r.type}>
          <Icon name={missing.has(r.text) ? "x" : r.type === "unverified" ? "warn" : "check"} size={12} />{r.text}
        </span>
      ))}
    </span>
  );
}

/** Confidence of a route's numbers and the reasons it is not higher (calc/confidence.ts). */
export function ConfidenceNote({ c }: { c: RankedOpportunity["confidence"] }) {
  return (
    <div className="small" style={{ paddingTop: 8 }}>
      <ConfidencePill c={c} /> {c.reasons.length ? <span className="muted">{c.reasons.join(" · ")}</span> : <span className="muted">measured fill times, enough history, no warnings</span>}
    </div>
  );
}
export const ConfidencePill = ({ c }: { c: RankedOpportunity["confidence"] }) => (
  <span className={`pill ${c.level === "high" ? "good" : c.level === "low" ? "warn" : ""}`} title={c.reasons.join("\n") || "complete evidence"}>{c.level} confidence</span>
);

/** Star to keep an item in your favourites (filters and alerts can use them). */
export function FavouriteStar({ id }: { id: string }) {
  const fav = favourites.use().includes(id);
  return <button className="ghost" aria-pressed={fav} onClick={e => { e.stopPropagation(); toggleFavourite(id); }} title={fav ? "Remove from favourites" : "Add to favourites"}>{fav ? "★" : "☆"}</button>;
}

export function Flags({ flags, max = 3 }: { flags: string[]; max?: number }) {
  if (!flags.length) return null;
  const ordered = [...flags].sort((a, b) => Number(b.endsWith("likely_manipulated")) - Number(a.endsWith("likely_manipulated")));
  const shown = ordered.slice(0, max);
  return (
    <span className="pills">
      {shown.map(f => <span key={f} className={`pill ${f.endsWith("likely_manipulated") ? "crit" : "warn"}`} title={FLAG_TEXT[f.split(": ").at(-1) ?? f] ?? f}><Icon name="warn" size={12} />{f.replace(/_/g, " ")}</span>)}
      {flags.length > max && <span className="pill">+{flags.length - max}</span>}
    </span>
  );
}

export function Detail({ o }: { o: Opportunity & Partial<Pick<RankedOpportunity, "confidence">> }) {
  const [sizes, setSizes] = useState(false);
  const [tracked, setTracked] = useState<string | null>(null);
  const track = async () => {
    try { const r = await trackRoute(o); setTracked(r.orders ? `Saved to Track record; ${r.orders} buy order${r.orders > 1 ? "s" : ""} added to My orders.` : "Saved to Track record (this route has no orders to follow)."); }
    catch (e) { setTracked(`Could not track: ${(e as Error).message}`); }
  };
  return (
    <>
    <div className="row" style={{ paddingTop: 12, gap: 8 }}>
      <button className={sizes ? "" : "ghost"} aria-expanded={sizes} onClick={() => setSizes(!sizes)}><Icon name="order" size={14} />{sizes ? "Hide order sizes" : "Order sizes & daily limit"}</button>
      <button className="ghost" onClick={() => void track()}><Icon name="check" size={14} />Track this route</button>
      <FavouriteStar id={o.outputId} />
      <span className="small muted">order sizes and daily limit · tracking saves the prediction and follows your orders</span>
    </div>
    {tracked && <div className="note"><Icon name="info" />{tracked} <Link to="/orders">My orders</Link> · <Link to="/record">Track record</Link></div>}
    {o.confidence && <ConfidenceNote c={o.confidence} />}
    {sizes && <div style={{ paddingTop: 10 }}><OrderPlan o={o} /></div>}
    <div className="detail-grid">
      <div>
        <h4>Route</h4>
        <Flow o={o} />
        <h4>How the number is built</h4>
        <ol className="calc">{o.explain.map((x, i) => <li key={i}>{x}</li>)}</ol>
        {o.notes.length > 0 && <p className="small muted">{o.notes.join(" · ")}</p>}
      </div>
      <div>
        <h4>What limits it (units per hour played)</h4>
        <table className="caps"><tbody>{o.caps.slice(0, 8).map(c => (
          <tr key={c.name} className={c.name === o.limitedBy ? "limit" : ""}><td className="l">{c.name}</td><td className="n">{num(c.unitsH, 1)}</td><td className="l why">{c.why}</td></tr>
        ))}</tbody></table>
        <h4>Unlocks</h4><Requirements o={o} />
        <h4>What it costs you</h4>
        <div className="grid cols-2 small">
          <div><span className="muted">Capital tied up</span><br /><b className="coin">{coins(o.capitalUsed)}</b></div>
          <div><span className="muted">Order slots</span><br /><b className="num">{o.ordersUsed}</b>{o.forgeSlotsUsed ? <span className="muted"> + {o.forgeSlotsUsed} forge</span> : null}</div>
          <div><span className="muted">Clicking per hour</span><br /><b className="num">{num(o.activeSecondsH / 60, 1)} min</b></div>
          <div><span className="muted">Daily-limit use</span><br /><b className="num">{coins(o.limitCoinsH)}/h</b>{Number.isFinite(o.limitHoursLeft) ? <span className="muted"> · {num(o.limitHoursLeft, 1)} h to use the whole daily limit</span> : null}</div>
          <div><span className="muted">Profit per unit</span><br /><b className="coin">{coins(o.profitPerUnit)}</b> <span className="muted">({pct(o.marginPct)})</span></div>
        </div>
        {o.flags.length > 0 && <><h4>Market warnings</h4><Flags flags={o.flags} max={8} /></>}
      </div>
    </div>
    </>
  );
}
