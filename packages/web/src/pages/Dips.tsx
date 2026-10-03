// Dips: items whose cheapest sell offer is far below its typical price (GET /api/v1/dips, market/dips.ts), with what
// buying the cheap units and selling back at the typical level would earn after tax. Every row keeps its warnings: a
// dip can also be the start of a lasting fall, so each row says whether the price was still normal an hour ago.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Dip } from "@bc/shared";
import { Icon } from "../components/Icon";
import { Flags } from "../components/RouteView";
import { api, coins, num, pct } from "../lib";
import { useApp } from "../state";

export function Dips() {
  const { settings } = useApp();
  const [minDrop, setMinDrop] = useState(10), [onlyNew, setOnlyNew] = useState(false);
  const q = useQuery({ queryKey: ["dips", minDrop, settings.bazaarFlipperLevel], placeholderData: p => p,
    queryFn: () => api<{ total: number; rows: Dip[] }>(`/api/v1/dips?minDrop=${minDrop / 100}&flipperLevel=${settings.bazaarFlipperLevel}&limit=200`) });
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Market</span><h1>Dips</h1>
        <p className="lede">Items whose cheapest sell offer sits well below its typical price from history. Buy the cheap units, relist near the usual price: the profit shown is after tax. Check the history behind the typical price and the warnings: some dips keep falling. "New" means the cheapest offer was still at the typical level about an hour ago; "already low" ones are slides or a new level the market settled at.</p></div>
        <label className="field" htmlFor="dd"><span>At least below typical</span><select id="dd" value={minDrop} onChange={e => setMinDrop(Number(e.target.value))}>{[5, 10, 15, 20, 30, 50].map(v => <option key={v} value={v}>{v}%</option>)}</select></label>
        <label className="check"><input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)} /> New dips only</label>
      </div>
      {q.error && <div className="note"><Icon name="warn" />{(q.error as Error).message}</div>}
      {q.data && (() => { const rows = q.data.rows.filter(d => !onlyNew || d.since === "new"); return (<>
        <p className="small muted">{num(rows.length)} shown of {num(q.data.total)} ({num(q.data.rows.filter(d => d.since === "new").length)} new, {num(q.data.rows.filter(d => d.since === "lasting").length)} already low an hour ago{q.data.rows.some(d => d.since === "unknown") ? `, ${num(q.data.rows.filter(d => d.since === "unknown").length)} without an hour-old price` : ""})</p>
        <div className="tablewrap"><table>
          <thead><tr><th className="l">Item</th><th>Cheapest offer</th><th>Typical</th><th>Below by</th><th>Cheap units</th><th>Profit / unit (relist)</th><th>Profit / unit (instant)</th><th>Potential</th><th className="l">Since</th><th className="l">History</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="empty">Nothing is that far below its usual price right now.</td></tr>}
            {rows.map(d => (
              <tr key={d.id}>
                <td className="l"><div className="row" style={{ gap: 6 }}><Link className="itemname" to={`/item/${d.id}`}>{d.name}</Link><Flags flags={d.flags} max={2} /></div></td>
                <td className="n">{coins(d.ask)}</td><td className="n">{coins(d.typicalAsk)}</td><td className="n down">{pct(d.drop, 0)}</td><td className="n">{num(d.cheapUnits)}</td>
                <td className={`n ${d.profitOffer > 0 ? "coin" : "down"}`}>{coins(d.profitOffer)}</td><td className={`n ${(d.profitInstant ?? 0) > 0 ? "" : "down"}`}>{d.profitInstant != null ? coins(d.profitInstant) : "–"}</td>
                <td className="n"><b>{coins(d.potential)}</b></td>
                <td className="l small">{d.since === "new" ? <span className="pill good" title={d.askHourAgo != null ? `${coins(d.askHourAgo)} an hour ago` : undefined}>new</span>
                  : d.since === "lasting" ? <span className="pill warn" title={d.askHourAgo != null ? `${coins(d.askHourAgo)} an hour ago` : undefined}>already low{d.askHourAgo != null ? ` (${coins(d.askHourAgo)} 1 h ago)` : ""}</span> : <span className="muted">unknown</span>}</td>
                <td className="l small muted">{d.basis}, {d.hours} h</td>
              </tr>
            ))}
          </tbody>
        </table></div></>); })()}
    </>
  );
}
