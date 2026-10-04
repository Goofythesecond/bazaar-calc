// Track record: how the calculator's predictions hold up.
//  - paper trading (fill/paper.ts): its own best bazaar flip run as virtual orders on the real market; realized vs
//    expected profit, win rate, time taken. In this browser on the static site; on the server around the clock when
//    self-hosted.
//  - your decision journal: routes you chose with "Track this route", what was predicted then, and what your tracked
//    orders actually did.
import { useQuery } from "@tanstack/react-query";
import { type PaperState, calibrate, paperSummary, taxRate } from "@bc/shared";
import { Icon } from "../components/Icon";
import { STATIC, api, ago, coins, dur, num, pct } from "../lib";
import { journal, paperRecord, trackedOrders } from "../prefs";
import { useApp } from "../state";

/** How far real (paper) trades are from the fill model, per side: the flip tables divide fill speeds by these. */
function Calibration({ st }: { st: PaperState }) {
  const c = calibrate(st.trades);
  if (!c.trades) return <p className="small muted">Fill-speed correction: none yet. Trades opened since 2026-10-04 record the model's buy and sell times; once they close, the flip numbers follow what they measured.</p>;
  const x = (f: number) => (f >= 1 ? `${f.toFixed(2)}x as long as the model` : `${(1 / f).toFixed(2)}x faster than the model`);
  return <p className="small" style={{ margin: "0 0 10px" }}><b>Fill-speed correction from {c.trades} closed trades:</b> buy orders take {x(c.buy.factor)}, sell offers {x(c.sell.factor)} (pulled toward the model while trades are few). Every flip's fill speed is divided by these, and by an item's own factor when it has trades.</p>;
}

function PaperTable({ st }: { st: PaperState }) {
  const s = paperSummary(st);
  return (
    <>
      <Calibration st={st} />
      {st.lastTs > 0 && <p className="small muted" style={{ marginTop: 0 }}>Last market snapshot processed {ago(st.lastTs)}: open trades fill only from real trades while their virtual order is the best price, and an outbid order is relisted at the next look (every check interval).</p>}
      <div className="grid cols-3">
        <div className="card tile"><div className="label">Realized / expected</div><div className="value">{s.capture != null ? pct(s.capture, 0) : "–"}</div><div className="sub">{coins(s.realized)} of {coins(s.expected)} over {s.closed} closed trades</div></div>
        <div className="card tile"><div className="label">Trades that made money</div><div className="value">{s.winRate != null ? pct(s.winRate, 0) : "–"}</div><div className="sub">{s.open} still running</div></div>
        <div className="card tile"><div className="label">Time per trade</div><div className="value">{s.avgHours != null ? dur(s.avgHours) : "–"}</div><div className="sub">predicted {s.avgExpectedHours != null ? dur(s.avgExpectedHours) : "–"}</div></div>
      </div>
      {st.trades.length === 0 ? <div className="card empty" style={{ marginTop: 12 }}>No paper trades yet: the first one opens within a few minutes.</div> : (
        <div className="tablewrap" style={{ marginTop: 12 }}><table>
          <thead><tr><th className="l">Flip</th><th className="l">State</th><th>Bought</th><th>Sold</th><th>Expected</th><th>Realized</th><th>Buy / sell time</th><th>Relists</th><th>Opened</th></tr></thead>
          <tbody>{[...st.trades].reverse().slice(0, 100).map(t => (
            <tr key={t.id}>
              <td className="l">{t.title}</td>
              <td className="l">{t.phase === "done" ? <span className="pill good">done</span> : t.phase === "expired" ? <span className="pill warn">expired after 6 h</span>
                : <><span className={`pill ${t.onTop ? "good" : "warn"}`}>{t.phase} @ {num(t.price, 1)}{t.onTop ? ", on top" : ", outbid"}</span>
                  {!t.onTop && st.lastTs > 0 && <span className="small muted"> relists {t.nextLook > st.lastTs ? `in ${dur((t.nextLook - st.lastTs) / 3.6e6)}` : "now"}</span>}</>}</td>
              <td className="n">{num(t.bought)} / {num(t.qty)}</td><td className="n">{num(t.sold)}</td>
              <td className="n">{coins(t.expected.profit)}</td><td className={`n ${t.realized != null && t.realized < 0 ? "down" : ""}`}>{t.realized != null ? coins(t.realized) : "–"}</td>
              <td className="n small">{t.boughtAt ? dur((t.boughtAt - t.openedAt) / 3.6e6) : "–"} / {t.boughtAt && t.closedAt ? dur((t.closedAt - t.boughtAt) / 3.6e6) : "–"}
                {t.expected.buyH != null && <div className="muted">model {dur(t.expected.buyH)} / {dur(t.expected.sellH ?? 0)}</div>}</td>
              <td className="n">{t.relists}</td><td className="n small muted">{ago(t.openedAt)}</td>
            </tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}

export function Record() {
  const local = paperRecord.use(), decisions = journal.use(), orders = trackedOrders.use();
  const { settings } = useApp();
  // self-hosted: the server's own record; static site: the project scanner's record, published with its data every 30 min
  const server = useQuery({ queryKey: ["paper"], retry: false, queryFn: () => api<{ state: PaperState; since: number | null; source: string; name?: string; updatedAt?: number }>("/api/v1/paper") });
  const tax = taxRate(settings.bazaarFlipperLevel);
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Trading</span><h1>Track record</h1>
        <p className="lede">How the predictions hold up against the real market. Paper trading runs the calculator's own best bazaar flip as virtual orders (filled only by real trades, relisted when beaten, sold the same way); the journal follows the routes you chose.</p></div></div>
      <h2>Paper trading</h2>
      <h3>Around the clock</h3>
      <p className="small muted">{STATIC
        ? <>The project's scanner trades on paper on every Hypixel snapshot, with the default settings{server.data?.updatedAt ? <> (record from {server.data.name}'s scanner, updated {ago(server.data.updatedAt)}; it is published with the data every 30 minutes)</> : null}.</>
        : "Runs on this server on every poll."}</p>
      {server.data ? <PaperTable st={server.data.state} /> : <div className="card empty">{server.error ? (server.error as Error).message : "Loading…"}</div>}
      {STATIC && <><h3>In this browser</h3>
        <p className="small muted">Runs while the site is open, with your settings; the record is saved here.</p>
        <PaperTable st={local} /></>}
      {STATIC && local.trades.length > 0 && <button className="ghost" style={{ marginTop: 10 }} onClick={() => paperRecord.set({ trades: [], lastPick: 0, counters: {}, lastTs: 0 })}>Start the paper record over</button>}

      <h2>Your decisions</h2>
      {decisions.length === 0 ? <div className="card empty">Open any flip and press "Track this route": its orders go to My orders and the prediction is saved here, to compare with what really happens.</div> : (
        <div className="tablewrap"><table>
          <thead><tr><th className="l">Route</th><th>Predicted profit</th><th>Realized so far</th><th>Predicted time</th><th>Taken</th><th className="l">Confidence then</th><th></th></tr></thead>
          <tbody>{[...decisions].reverse().map(d => {
            const os = orders.filter(o => d.orderIds.includes(o.id));
            const spent = os.filter(o => o.side === "buy").reduce((a, o) => a + o.filled * o.price, 0);
            const got = os.filter(o => o.side === "sell").reduce((a, o) => a + o.filled * o.price * (1 - tax), 0);
            const done = os.length > 0 && os.every(o => o.status === "filled");
            const last = Math.max(d.at, ...os.map(o => o.updatedAt));
            return (
              <tr key={d.id}>
                <td className="l"><b>{d.title}</b><div className="small muted">{ago(d.at)} · batch {num(d.predicted.batch)}</div></td>
                <td className="n">{coins(d.predicted.profitPerUnit * d.predicted.batch)}</td>
                <td className="n">{os.length ? coins(got - spent) : <span className="muted">no tracked orders</span>}</td>
                <td className="n">{d.predicted.hoursForBatch != null ? dur(d.predicted.hoursForBatch) : "–"}</td>
                <td className="n">{done ? dur((last - d.at) / 3.6e6) : <span className="muted">running</span>}</td>
                <td className="l"><span className={`pill ${d.predicted.confidence.level === "high" ? "good" : d.predicted.confidence.level === "low" ? "warn" : ""}`}>{d.predicted.confidence.level}</span></td>
                <td><button className="ghost" onClick={() => journal.set(all => all.filter(x => x.id !== d.id))} aria-label="Delete">Delete</button></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <p className="small muted"><Icon name="info" size={12} /> Realized = what your tracked sell offers filled at (after tax) minus what your tracked buy orders filled at; it only counts orders tracked through the route.</p>
    </>
  );
}
