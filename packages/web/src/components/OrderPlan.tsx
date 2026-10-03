// "Order sizes & daily limit" for one route: batches, order sizes per leg, and how each counts toward the daily limit.
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import type { Opportunity, OrderPlanLeg } from "@bc/shared";
import { coins, num, pct } from "../lib";
import { useApp } from "../state";
import { Icon } from "./Icon";

const mins = (s: number | null | undefined) => (s == null ? "–" : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(s < 600 ? 1 : 0)} min`);

/** One line of evidence for a leg: where its time-on-top numbers come from. */
export function Evidence({ l }: { l: OrderPlanLeg }) {
  if (l.basis !== "measured" || !l.hold) return <span className="muted">Estimated: fewer than 8 measured top-of-book episodes for this side yet, so a standard model fills in.</span>;
  const h = l.hold;
  return (
    <span className="muted">
      Measured from <b>{num(h.n)}</b> freshly posted best prices over {num(h.hours, 1)} h of polls: median <b>{mins(h.p50)}</b> on top, 90% beaten within {mins(h.p90)}, {pct(h.beatenFast, 0)} beaten before the next poll.
    </span>
  );
}

/** Order sizes per leg and the daily-limit cost of running this route. */
export function OrderPlan({ o }: { o: Opportunity }) {
  const { settings: s } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const day = (v: number) => v * s.hoursPerDay;
  const orderLimitH = o.orderPlan.reduce((a, l) => a + l.limitCoinsH, 0);
  const freeH = o.orderPlan.reduce((a, l) => a + l.freeOrdersH, 0);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="grid cols-3 small">
        <div className="card tile"><div className="label">Daily limit used</div><div className="value">{coins(day(o.limitCoinsH))}</div><div className="sub">{pct(day(o.limitCoinsH) / s.dailyLimit, 1)} of {coins(s.dailyLimit)} over your {s.hoursPerDay} h</div></div>
        <div className="card tile"><div className="label">From orders</div><div className="value">{coins(orderLimitH)}<span className="muted small">/h</span></div><div className="sub">every new order counts its full value{freeH > 0 ? ` · ${num(freeH, 1)} flips/h free` : ""}</div></div>
        <div className="card tile"><div className="label">From instant trades</div><div className="value">{coins(o.instantLimitCoinsH)}<span className="muted small">/h</span></div><div className="sub">instant buys and sells count their value</div></div>
      </div>
      {o.orderPlan.length > 0 && (
        <p className="small" style={{ margin: 0 }}>
          Runs in batches of <b>{num(o.batch)}</b> {o.sell.name}: {o.orderPlan.map(l => `${l.side === "buy" ? "buy order" : "sell offer"} ${l.parallel > 1 ? `${l.parallel} × ` : ""}${num(l.qty)}× ${l.name}`).join(" → ")}.
          {o.oneAtATime && <b> One batch at a time: your coins cover one batch, so you buy it, sell it, then buy again.</b>}
          <span className="muted"> Every order in the route uses the same batch, so you only ever sell what you bought. This is the smallest batch that gets the best rate; bigger orders do not fill faster (the top order takes all incoming trades either way), they only tie up more coins and count more toward the daily limit on every relist.</span>
        </p>
      )}
      {o.orderPlan.length === 0 ? <p className="small muted" style={{ margin: 0 }}>This route uses instant trades only: no orders to size.</p> : (
        <div className="tablewrap">
          <table>
            <thead><tr><th className="l">Order</th><th>Per order</th><th>New orders / h</th><th>Filled per order</th><th>Fully filled</th><th>Time on top</th><th>Limit / h</th><th className="l">Basis</th></tr></thead>
            <tbody>
              {o.orderPlan.map(l => {
                const k = `${l.side}${l.item}`;
                return (
                  <Fragment key={k}>
                    <tr className="hover" onClick={() => setOpen(open === k ? null : k)} tabIndex={0} onKeyDown={e => e.key === "Enter" && setOpen(open === k ? null : k)} aria-expanded={open === k}>
                      <td className="l"><span className="pill" style={{ color: l.side === "buy" ? "var(--bid)" : "var(--ask)" }}>{l.side === "buy" ? "Buy order" : "Sell offer"}</span> <Link className="itemname" to={`/item/${l.item}`} onClick={e => e.stopPropagation()}>{l.name}</Link> <span className="muted small">@ {coins(l.price)}</span></td>
                      <td className="n"><b>{l.parallel > 1 ? `${l.parallel} × ` : ""}{num(l.qty)}</b><div className="muted small">{coins(l.qty * l.price)}{l.parallel > 1 ? " each" : ""}</div></td>
                      <td className="n">{num(l.ordersH, 1)}</td>
                      <td className="n">{num(l.perOrder, 1)}</td>
                      <td className="n">{pct(l.fullShare, 0)}</td>
                      <td className="n">{pct(l.onTop, 0)}</td>
                      <td className="n">{coins(l.limitCoinsH)}{l.freeOrdersH > 0 ? <div className="muted small">{num(l.freeOrdersH, 1)}/h via Flip Order</div> : null}</td>
                      <td className="l">{l.basis === "measured" ? <span className="pill good"><Icon name="check" size={12} />measured</span> : <span className="pill warn"><Icon name="warn" size={12} />estimated</span>}</td>
                    </tr>
                    {open === k && (
                      <tr className="open"><td colSpan={8} className="detail">
                        <p className="small" style={{ marginTop: 0 }}><Evidence l={l} /> <Link to={`/item/${l.item}#fill`}>Full evidence and quota calculator</Link></p>

                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {o.batchOptions.length > 1 && (
        <div className="tablewrap">
          <table>
            <thead><tr><th className="l">Batch</th><th>Units / h</th><th>Coins / h</th><th>Coins tied up</th><th>Limit / h</th><th>Clicking</th><th className="l">Limited by</th></tr></thead>
            <tbody>{o.batchOptions.map(x => (
              <tr key={x.batch} className={x.batch === o.batch ? "open" : ""}>
                <td className="l"><b>{num(x.batch)}</b>{x.batch === o.batch ? " · chosen" : ""}</td>
                <td className="n">{num(x.unitsH, 1)}</td><td className={`n ${x.coinsH > 0 ? "coin" : "down"}`}>{coins(x.coinsH)}</td>
                <td className="n">{coins(x.capital)}</td><td className="n">{coins(x.limitCoinsH)}</td><td className="n">{num(x.clickMinH, 1)} min/h</td><td className="l small">{x.limitedBy}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
