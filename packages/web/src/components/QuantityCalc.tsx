// Item page calculator: for a quantity you choose, what buying and reselling costs and earns right now: buy order (0.1
// above the best) or instant buy (walking the sell offers), sell offer (0.1 below the best) or instant sell (walking the
// buy orders), tax at your Bazaar Flipper level, and what it adds to your daily bazaar limit.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { type ItemMarket, buyFlowH, limitContribution, sellFlowH, taxRate } from "@bc/shared";
import { api, coins, dur, num, pct } from "../lib";
import { useApp } from "../state";

/** Average price per unit to take `units` from `levels` (best first); null if the book is too thin. */
function walk(levels: { price: number; amount: number }[], units: number): number | null {
  let left = units, cost = 0;
  for (const l of levels) { const take = Math.min(left, l.amount); cost += take * l.price; left -= take; if (left <= 0) break; }
  return left > 0 ? null : cost / units;
}

export function QuantityCalc({ m }: { m: ItemMarket }) {
  const { settings } = useApp();
  const rules = useQuery({ queryKey: ["rules-bazaar"], queryFn: () => api<{ taxByFlipperLevel?: number[] }>("/api/v1/rules/bazaar"), staleTime: 600_000 });
  const tax = rules.data?.taxByFlipperLevel?.[settings.bazaarFlipperLevel] ?? taxRate(settings.bazaarFlipperLevel);
  const [qty, setQty] = useState(640), [buy, setBuy] = useState<"order" | "instant">("order"), [sell, setSell] = useState<"offer" | "instant">("offer");
  if (m.ask == null || m.bid == null) return null;
  const n = Math.max(1, Math.round(qty));
  const buyPrice = buy === "order" ? m.bid + 0.1 : walk(m.topAsk ?? [], n);
  const sellPrice = sell === "offer" ? m.ask - 0.1 : walk(m.topBid ?? [], n);
  const cost = buyPrice != null ? buyPrice * n : null, gross = sellPrice != null ? sellPrice * n : null;
  const net = gross != null ? gross * (1 - tax) : null, profit = cost != null && net != null ? net - cost : null;
  const limit = (cost != null ? limitContribution(cost) : 0) + (gross != null ? limitContribution(gross) : 0);
  const buyH = buy === "order" ? buyFlowH(m) : sellFlowH(m), sellH = sell === "offer" ? sellFlowH(m) : buyFlowH(m);
  return (
    <section className="card pad stack" style={{ marginTop: 14 }} aria-label="Quantity calculator">
      <h2 style={{ margin: 0 }}>Calculator</h2>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="field" htmlFor="qn"><span>Quantity</span><input id="qn" type="number" min={1} step={64} value={qty} onChange={e => setQty(Number(e.target.value))} /></label>
        <label className="field" htmlFor="qb"><span>Buy with</span><select id="qb" value={buy} onChange={e => setBuy(e.target.value as "order" | "instant")}><option value="order">Buy order @ {num(m.bid + 0.1, 1)}</option><option value="instant">Instant buy (walk the offers)</option></select></label>
        <label className="field" htmlFor="qs"><span>Sell with</span><select id="qs" value={sell} onChange={e => setSell(e.target.value as "offer" | "instant")}><option value="offer">Sell offer @ {num(m.ask - 0.1, 1)}</option><option value="instant">Instant sell (walk the orders)</option></select></label>
      </div>
      <div className="tablewrap"><table className="small"><tbody>
        <tr><td className="l">Buy {num(n)}</td><td className="n">{cost != null ? coins(cost) : "not enough on offer"}</td><td className="l muted">{buyPrice != null ? `${num(buyPrice, 1)} each` : ""}</td></tr>
        <tr><td className="l">Sell {num(n)}</td><td className="n">{gross != null ? coins(gross) : "not enough buy orders"}</td><td className="l muted">{sellPrice != null ? `${num(sellPrice, 1)} each` : ""}</td></tr>
        <tr><td className="l">Tax ({pct(tax, 3)})</td><td className="n">{gross != null ? coins(gross * tax) : "–"}</td><td /></tr>
        <tr><td className="l"><b>Profit</b></td><td className={`n ${profit != null && profit < 0 ? "down" : "coin"}`}><b>{profit != null ? coins(profit) : "–"}</b></td><td className="l muted">{profit != null && cost ? `${pct(profit / cost)} margin` : ""}</td></tr>
        <tr><td className="l">Daily bazaar limit used</td><td className="n">{coins(limit)}</td><td /></tr>
        <tr><td className="l">Rough time</td><td className="n">{buyH > 0 && sellH > 0 ? dur(n / buyH + n / sellH) : "–"}</td><td /></tr>
      </tbody></table></div>
      <p className="small muted" style={{ margin: 0 }}>Orders count their full value toward the daily limit when created. The rough time assumes every trade at the market's rate came to you; "How long to fill an order" above has the measured estimate.</p>
    </section>
  );
}
