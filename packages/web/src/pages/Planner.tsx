import { useQuery } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import type { Plan } from "@bc/shared";
import { Icon } from "../components/Icon";
import { Detail, Flags, Flow, Requirements } from "../components/RouteView";
import { KIND_LABEL, api, coins, dataAge, historyAge, num, pct } from "../lib";
import { useApp } from "../state";

const KINDS = ["bazaar", "craft", "book", "forge"] as const;
const KIND_ICON = { bazaar: "swap", craft: "craft", book: "book", forge: "flame" } as const;

function Meter({ label, used, total, fmt }: { label: string; used: number; total: number; fmt: (v: number) => string }) {
  const share = total > 0 ? Math.min(1, used / total) : 0;
  return (
    <div className={`meter ${share > 0.9 ? "hot" : ""}`}>
      <div className="top"><span>{label}</span><span><b>{fmt(used)}</b> / {fmt(total)}</span></div>
      <div className="track" role="meter" aria-label={label} aria-valuenow={used} aria-valuemax={total}><div className="fill" style={{ width: `${share * 100}%` }} /></div>
    </div>
  );
}

export function Planner() {
  const { settings: s, profile, setDrawer } = useApp();
  const [kinds, setKinds] = useState<string[]>([...KINDS]);
  const [requireMet, setRequireMet] = useState(!profile.ignoreRequirements);
  const [open, setOpen] = useState<string | null>(null);
  const [limitView, setLimitView] = useState(false);
  const q = useQuery({
    queryKey: ["plan", s, profile, kinds, requireMet],
    queryFn: () => api<Plan & { marketAt: number; dataAt?: number; statsAt?: number; statsUsed?: boolean }>("/api/v1/calc/plan", { settings: s, profile, options: { kinds, requireMet } }),
    refetchInterval: 60_000, placeholderData: prev => prev,
  });
  const t = q.data?.totals;
  const toggle = (k: string) => setKinds(kinds.includes(k) ? kinds.filter(x => x !== k) : [...kinds, k]);

  return (
    <>
      <div className="pagehead">
        <div>
          <span className="eyebrow">Best route</span>
          <h1>What to run today</h1>
          <p className="lede">The mix of bazaar, craft, book and forge flips that earns the most per day with your coins, order and forge slots, the daily bazaar limit and the time you have to click.</p>
        </div>
      </div>

      {q.error && <div className="note"><Icon name="warn" />{(q.error as Error).message}</div>}
      {q.data && dataAge(q.data.dataAt, q.data.marketAt).stale && <div className="note"><Icon name="warn" />{dataAge(q.data.dataAt, q.data.marketAt).stale}</div>}
      {q.data && historyAge(q.data.statsAt, q.data.statsUsed) && <div className="note"><Icon name="info" />{historyAge(q.data.statsAt, q.data.statsUsed)}</div>}
      {!t && q.isLoading && <div className="card empty">Working out the best route from the current market…</div>}

      {t && <section className="card hero" style={{ opacity: q.isFetching ? 0.85 : 1 }}>
        <div className="hero-figure">
          <span className="eyebrow">Expected per day</span>
          <div className="big">{coins(t.coinsDay)}<small>coins</small></div>
          <div className="small muted">{coins(t.coinsH)} per hour over your {s.hoursPerDay} h · a forge run you start before logging off finishes while you are away · {dataAge(q.data!.dataAt, q.data!.marketAt).label}</div>
        </div>
        <div className="hero-meters">
          <Meter label="Order slots" used={t.ordersUsed} total={t.orderSlots} fmt={v => num(v)} />
          {t.forgeSlots > 0 ? <Meter label="Forge slots" used={t.forgeSlotsUsed} total={t.forgeSlots} fmt={v => num(v)} /> : <div className="meter"><div className="top"><span>Forge slots</span><span className="muted">set your HotM tier to use the forge</span></div><div className="track" /></div>}
          <Meter label="Daily bazaar limit" used={t.limitCoinsDay} total={t.dailyLimit} fmt={coins} />
          <button className={limitView ? "" : "ghost"} style={{ justifySelf: "start" }} aria-expanded={limitView} onClick={() => setLimitView(!limitView)}><Icon name="order" size={14} />{limitView ? "Hide limit breakdown" : "Daily limit breakdown"}</button>
          <Meter label="Coins in use" used={t.capitalUsed} total={s.coins} fmt={coins} />
          <Meter label="Clicking per hour" used={t.activeMinutesH} total={60 * s.attention} fmt={v => `${num(v)} min`} />
        </div>
      </section>}

      {t && limitView && <LimitBreakdown picks={q.data!.picks} hours={s.hoursPerDay} limit={t.dailyLimit} />}

      <div className="spread" style={{ margin: "18px 0 10px" }}>
        <div className="row" role="group" aria-label="Flip types">
          {KINDS.map(k => (
            <button key={k} className={`chip ${kinds.includes(k) ? "" : "muted"}`} aria-pressed={kinds.includes(k)} onClick={() => toggle(k)} style={kinds.includes(k) ? { borderColor: "var(--accent)" } : { opacity: 0.6 }}>
              <Icon name={KIND_ICON[k]} size={14} />{KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={requireMet} onChange={e => setRequireMet(e.target.checked)} /> Only routes I have unlocked</label>
      </div>

      {t && q.data!.picks.length === 0 && (
        <div className="card empty">Nothing fits right now. Add coins or hours, include markets with warnings, or turn off "only routes I have unlocked". <button className="ghost" onClick={() => setDrawer(true)}>Open settings</button></div>
      )}

      {t && q.data!.picks.length > 0 && <section className="card">
        {q.data!.picks.map((o, i) => (
          <article key={o.key} className="pick">
            <div className="rank">{i + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div className="head">
                <span className="pill kind"><Icon name={KIND_ICON[o.kind]} size={12} />{KIND_LABEL[o.kind]}</span>
                <Link className="title" to={`/item/${o.outputId}`}>{o.title}</Link>
                <Requirements o={o} compact /><Flags flags={o.flags} max={2} />
              </div>
              <Flow o={o} />
              {open === o.key && <Detail o={o} />}
            </div>
            <div className="figures">
              <div className="coin">{coins(o.coinsH)}<span className="muted small"> /h</span></div>
              <div className="sub">{num(o.unitsH, 1)} units/h · {pct(o.marginPct)} margin</div>
              <div className="sub">limited by <b>{o.limitedBy}</b></div>
              <button className="ghost small" onClick={() => setOpen(open === o.key ? null : o.key)} aria-expanded={open === o.key}>{open === o.key ? "Hide working" : "Show working"}</button>
            </div>
          </article>
        ))}
      </section>}

      {t && q.data!.skipped.length > 0 && (
        <details className="card pad" style={{ marginTop: 12 }}>
          <summary className="muted">Considered but left out ({q.data!.skipped.length})</summary>
          <div className="tablewrap" style={{ marginTop: 10 }}><table><tbody>{q.data!.skipped.slice(0, 40).map(x => <tr key={x.key}><td className="l">{x.title}</td><td className="l muted">{x.reason}</td></tr>)}</tbody></table></div>
        </details>
      )}
    </>
  );
}

/** Where the daily bazaar limit goes: every order of every pick, sized for the rate the plan runs it at. */
function LimitBreakdown({ picks, hours, limit }: { picks: Plan["picks"]; hours: number; limit: number }) {
  const used = picks.reduce((a, o) => a + o.limitCoinsH * hours, 0);
  return (
    <section className="card" style={{ marginTop: 12 }} aria-label="Daily limit breakdown">
      <div className="pad spread" style={{ borderBottom: "1px solid var(--line)" }}>
        <div><h2 style={{ margin: 0 }}>Daily limit breakdown</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>Hypixel counts every buy order and sell offer you create at its full value, every relist again, and every instant buy or sell. Fills, claims and "Flip Order" do not count. Order sizes are the smallest that still move what each route needs.</p></div>
        <div className="small" style={{ textAlign: "right" }}><b className="num">{coins(used)}</b> of {coins(limit)} per day<br /><span className="muted">{coins(Math.max(0, limit - used))} left</span></div>
      </div>
      <div className="tablewrap" style={{ border: 0 }}>
        <table>
          <thead><tr><th className="l">Route / order</th><th>Per order</th><th>Orders / day</th><th>Units / day</th><th>Limit / day</th><th>Share</th></tr></thead>
          <tbody>
            {picks.map(o => (
              <Fragment key={o.key}>
                <tr className="open"><td className="l"><Link className="itemname" to={`/item/${o.outputId}`}><b>{o.title}</b></Link> <span className="muted small">{KIND_LABEL[o.kind]}</span></td><td /><td />
                  <td className="n">{num(o.unitsH * hours, 0)}</td><td className="n"><b>{coins(o.limitCoinsH * hours)}</b></td><td className="n">{pct((o.limitCoinsH * hours) / limit, 1)}</td></tr>
                {o.orderPlan.map(l => (
                  <tr key={l.side + l.item}>
                    <td className="l" style={{ paddingLeft: 26 }}><span style={{ color: l.side === "buy" ? "var(--bid)" : "var(--ask)" }}>{l.side === "buy" ? "Buy order" : "Sell offer"}</span> {l.name} <span className="muted small">@ {coins(l.price)}</span></td>
                    <td className="n">{num(l.qty)}</td><td className="n">{num(l.ordersH * hours, 0)}{l.freeOrdersH > 0 ? <span className="muted small"> ({num(l.freeOrdersH * hours, 0)} free)</span> : null}</td>
                    <td className="n">{num(l.unitsH * hours, 0)}</td><td className="n">{coins(l.limitCoinsH * hours)}</td><td className="n muted">{pct((l.limitCoinsH * hours) / limit, 1)}</td>
                  </tr>
                ))}
                {o.instantLimitCoinsH > 0 && <tr><td className="l muted" style={{ paddingLeft: 26 }}>Instant buys / sells</td><td /><td /><td /><td className="n">{coins(o.instantLimitCoinsH * hours)}</td><td className="n muted">{pct((o.instantLimitCoinsH * hours) / limit, 1)}</td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
