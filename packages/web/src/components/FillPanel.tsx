import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, coins, num, pct } from "../lib";
import { useApp } from "../state";
import { Icon } from "./Icon";

interface Point { qty: number; unitsH: number; ordersH: number; onTop: number; fullShare: number; perOrder: number; limitCoinsH: number }
interface Side {
  side: "buy" | "sell"; price: number; flowH: number; basis: "measured" | "estimated"; maxQty: number;
  stats: { n: number; censored: number; hours: number; p25: number | null; p50: number | null; p75: number | null; p90: number | null; meanS: number; beatenFast: number; outbid: number; gone: number; flowPerMin: number; unitsP50: number } | null;
  episodes: { n: number; outbid: number; gone: number; cut: number; calibration: number | null };
  survival: { t: number; s: number }[];
  curve: Point[];
  best: { max: Point; at95: Point };
  quota: { qty: number; p10: number; p50: number; p90: number; relists: number; postedUnits: number; unfinished: number; ordersAtOnce: number; limitCoins: number; basis: string } | null;
}
interface Fill { check: number; windowHours: number; buy: Side; sell: Side; method: string[] }

const mins = (s: number | null | undefined) => (s == null ? "–" : s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${(s / 60).toFixed(s < 600 ? 1 : 0)} min` : `${(s / 3600).toFixed(1)} h`);
const share = (v: number) => (v > 0 && v < 0.001 ? "<0.1%" : pct(v, 1));
const playTime = (m: number) => (m < 1 ? "<1 min" : m < 90 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`);

/** Share of freshly posted best prices still on top after t (Kaplan-Meier), as a step line. */
function SurvivalChart({ pts, color, label }: { pts: { t: number; s: number }[]; color: string; label: string }) {
  const W = 320, H = 120, P = { l: 34, r: 22, t: 8, b: 22 };
  const maxT = Math.max(120, Math.min(3600, (pts.find(p => p.s <= 0.05)?.t ?? pts.at(-1)?.t ?? 600) * 1.1));
  const x = (t: number) => P.l + (Math.min(t, maxT) / maxT) * (W - P.l - P.r), y = (s: number) => P.t + (1 - s) * (H - P.t - P.b);
  let d = `M${x(0)},${y(1)}`;
  for (const p of pts) { if (p.t > maxT) break; d += ` H${x(p.t)} V${y(p.s)}`; }
  d += ` H${x(maxT)}`;
  const ticks = [0, maxT / 4, maxT / 2, (3 * maxT) / 4, maxT];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} style={{ display: "block" }}>
      {[0, 0.5, 1].map(s => <g key={s}><line x1={P.l} x2={W - P.r} y1={y(s)} y2={y(s)} stroke="var(--grid)" /><text x={P.l - 6} y={y(s) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{s * 100}%</text></g>)}
      {ticks.map(t => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{mins(t)}</text>)}
      <path d={d} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function SideCard({ d, check }: { d: Side; check: number }) {
  const buy = d.side === "buy", color = buy ? "var(--bid)" : "var(--ask)", st = d.stats;
  return (
    <div className="card pad stack" style={{ gap: 10 }}>
      <div className="spread"><h3 style={{ margin: 0, color }}>{buy ? "Buy orders" : "Sell offers"}</h3>
        {d.basis === "measured" ? <span className="pill good"><Icon name="check" size={12} />measured</span> : <span className="pill warn"><Icon name="warn" size={12} />not enough data yet</span>}</div>
      {st ? <>
        <p style={{ margin: 0 }}>A new best {buy ? "buy order" : "sell offer"} stays on top for <b>{mins(st.p50)}</b> (median); 90% are beaten within <b>{mins(st.p90)}</b>. <span className="muted">{pct(st.beatenFast, 0)} are beaten before our next poll.</span></p>
        <SurvivalChart pts={d.survival} color={color} label={`Share of new best ${buy ? "buy orders" : "sell offers"} still on top over time`} />
        <div className="grid cols-2 small">
          <div><span className="muted">While on top it gets</span><br /><b className="num">{num(d.flowH / 60, 1)}</b> units/min</div>
          <div><span className="muted">Episodes measured</span><br /><b className="num">{num(d.episodes.n)}</b> in {num(st.hours, 1)} h</div>
          <div><span className="muted">How they ended</span><br />{pct(st.outbid, 0)} {buy ? "outbid" : "undercut"} · {pct(st.gone, 0)} filled or cancelled</div>
          <div><span className="muted">Best order size</span><br /><b className="num">{num(d.best.at95.qty)}</b> <span className="muted">gets 95% of the max {num(d.best.max.unitsH, 0)}/h</span></div>
        </div>
      </> : <p className="muted small" style={{ margin: 0 }}>No freshly posted best prices measured for this side yet. Figures use a standard model until about 8 episodes are recorded.</p>}
      <details>
        <summary className="small muted">Order size table (you look every {check} min)</summary>
        <div className="tablewrap" style={{ marginTop: 8 }}><table className="caps">
          <thead><tr><th>Per order</th><th>Units / h</th><th>Orders / h</th><th>On top</th><th>Limit / h</th></tr></thead>
          <tbody>{d.curve.filter((_, i) => i % 2 === 0 || i === d.curve.length - 1).map(p => (
            <tr key={p.qty} className={p.qty === d.best.at95.qty ? "limit" : ""}><td className="n">{num(p.qty)}</td><td className="n">{num(p.unitsH, 1)}</td><td className="n">{num(p.ordersH, 1)}</td><td className="n">{pct(p.onTop, 0)}</td><td className="n">{coins(p.limitCoinsH)}</td></tr>
          ))}</tbody>
        </table></div>
      </details>
    </div>
  );
}

/** Time on top, order sizes and "how long for my quota" for one item, with the evidence behind every number. */
export function FillPanel({ id }: { id: string }) {
  const { settings: s } = useApp();
  const [qty, setQty] = useState(1000);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const q = useQuery({
    queryKey: ["fill", id, s.checkIntervalMin, qty, s.unknownCompetitionShare],
    queryFn: () => api<Fill>(`/api/v1/bazaar/${id}/fill?check=${s.checkIntervalMin}&qty=${qty}&unknownShare=${s.unknownCompetitionShare}`),
    placeholderData: p => p, refetchInterval: 120_000, retry: false,
  });
  const loaded = !!q.data;
  useEffect(() => { if (loaded && location.hash === "#fill") document.getElementById("fill")?.scrollIntoView({ behavior: "smooth" }); }, [loaded]);
  if (q.error) return null;
  const d = q.data, quota = d?.[side].quota;
  return (
    <section id="fill" className="stack" style={{ marginTop: 14, gap: 12 }} aria-label="Time on top and order sizes">
      <div className="card pad stack" style={{ gap: 10 }}>
        <div className="spread"><div><h2 style={{ margin: 0 }}>How long to fill an order</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>You post one tick better than the best price, relist when you see you were beaten, and look every {s.checkIntervalMin} min (change it in Settings).</p></div></div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <div className="seg" role="radiogroup" aria-label="Side">
            <button role="radio" aria-checked={side === "buy"} className={side === "buy" ? "on" : ""} onClick={() => setSide("buy")}>Buy</button>
            <button role="radio" aria-checked={side === "sell"} className={side === "sell" ? "on" : ""} onClick={() => setSide("sell")}>Sell</button>
          </div>
          <label className="field" htmlFor="quota" style={{ width: 160 }}><input id="quota" type="number" min={1} step={64} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value) || 1))} aria-label="Units" /></label>
          <span className="muted">units at {d ? coins(d[side].price) : "…"} each</span>
        </div>
        {quota ? (
          <div className="grid cols-4">
            <div className="card tile"><div className="label">Typical time</div><div className="value">{playTime(quota.p50)}</div><div className="sub">fast {playTime(quota.p10)} · slow {playTime(quota.p90)}</div></div>
            <div className="card tile"><div className="label">Relists</div><div className="value">{num(quota.relists)}</div><div className="sub">cancel and post the rest again{quota.ordersAtOnce > 1 ? ` · needs ${quota.ordersAtOnce} orders at once` : ""}</div></div>
            <div className="card tile"><div className="label">Daily limit used</div><div className="value">{coins(quota.limitCoins)}</div><div className="sub">{share(quota.limitCoins / s.dailyLimit)} of your {coins(s.dailyLimit)}</div></div>
            <div className="card tile"><div className="label">Coins</div><div className="value">{coins(qty * d![side].price)}</div><div className="sub">{quota.unfinished > 0.05 ? `${pct(quota.unfinished, 0)} of runs did not finish in 24 h` : `from ${num(d![side].episodes.n)} real episodes, 2,000 runs`}</div></div>
          </div>
        ) : d ? <p className="muted small" style={{ margin: 0 }}>Not enough measured episodes on this side yet to simulate a quota.</p> : <p className="muted small" style={{ margin: 0 }}>Loading…</p>}
      </div>
      {d && <div className="grid cols-2"><SideCard d={d.buy} check={d.check} /><SideCard d={d.sell} check={d.check} /></div>}
      {d && (
        <details className="card pad">
          <summary className="muted">How this is measured</summary>
          <ol className="small" style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>{d.method.map((m, i) => <li key={i}>{m}</li>)}</ol>
          <p className="small muted" style={{ marginBottom: 0 }}>Window: last {d.windowHours} h. Flow is scaled by {d.buy.episodes.calibration != null ? `${num(d.buy.episodes.calibration, 2)}× (buy) / ` : ""}{d.sell.episodes.calibration != null ? `${num(d.sell.episodes.calibration, 2)}× (sell)` : "–"} so it matches the item's measured trade rate. Polls are 20 s apart (about as often as Hypixel refreshes the bazaar), so holds are known to within ~20 s.</p>
        </details>
      )}
    </section>
  );
}
