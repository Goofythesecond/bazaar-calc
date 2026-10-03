import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { FLAG_TEXT, type Opportunity } from "@bc/shared";
import { coins, num, pct } from "../lib";
import { useApp } from "../state";
import { Icon } from "./Icon";
import { OrderPlan } from "./OrderPlan";

const STEP_ICON = { craft: "craft", combine: "anvil", forge: "flame" } as const;

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
          <span className="ic"><Icon name={b.mode === "order" ? "order" : b.mode === "npc" ? "box" : "bolt"} /></span>
          <span>
            <span className="v">{b.mode === "order" ? "Buy order" : b.mode === "npc" ? "NPC shop" : "Instant buy"}</span>{" "}
            <b>{l ? `${l.parallel > 1 ? `${l.parallel} orders of ` : ""}${num(l.qty)}×` : `${num(day(o.unitsH * b.qty))}/day`}</b> <Link className="itemname" to={`/item/${b.item}`}>{b.name}</Link> <span className="v">@</span> <span className="num">{coins(b.price)}</span>
            <span className="sub">{l ? <>per order · ~{num(l.ordersH, 1)} orders/h · {num(day(l.unitsH))}/day</> : b.mode === "npc" ? <>{b.source ?? "NPC"} · not the bazaar</> : <>in batches of up to 2,240</>}{perOut(b.qty)}</span>
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
            <span className="v">{o.sell.mode === "offer" ? "Sell offer" : o.sell.mode === "instant" ? "Instant sell" : "Auction (reference)"}</span>{" "}
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

export function Detail({ o }: { o: Opportunity }) {
  const [sizes, setSizes] = useState(false);
  return (
    <>
    <div className="row" style={{ paddingTop: 12, gap: 8 }}>
      <button className={sizes ? "" : "ghost"} aria-expanded={sizes} onClick={() => setSizes(!sizes)}><Icon name="order" size={14} />{sizes ? "Hide order sizes" : "Order sizes & daily limit"}</button>
      <span className="small muted">how much to put in each order, how often you relist, and how much of your daily bazaar limit it uses</span>
    </div>
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
