// My orders: bazaar orders you placed in game, typed in here and followed on every snapshot (fill/order-tracker.ts):
// on top or behind, units ahead of you, filled so far, when to relist and at what price. Kept in this browser only.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { type ItemMarket, buyFlowH, claimOrder, expiresAt, sellFlowH, trackOrder } from "@bc/shared";
import { Icon } from "../components/Icon";
import { api, ago, coins, dur, num } from "../lib";
import { trackedOrders } from "../prefs";
import { trackSellAfterBuy } from "../track";

type Book = Parameters<typeof trackOrder>[1] & { name: string };

export function Orders() {
  const orders = trackedOrders.use();
  const [item, setItem] = useState(""), [side, setSide] = useState<"buy" | "sell">("buy"), [price, setPrice] = useState(""), [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const search = useQuery({ queryKey: ["items", item], queryFn: () => api<{ id: string; name: string; on_bazaar: boolean }[]>(`/api/v1/items?q=${encodeURIComponent(item)}&bazaar=1&limit=8`), enabled: item.length >= 2 && !/^[A-Z0-9_:;]+$/.test(item) });
  const ids = [...new Set(orders.map(o => o.item))].join(",");
  const markets = useQuery({ queryKey: ["orders-book", ids], enabled: !!ids,
    queryFn: () => api<{ items: Record<string, { ts: number; bid: number | null; ask: number | null } & Partial<ItemMarket>> }>(`/api/v1/market?ids=${encodeURIComponent(ids)}`) });

  const add = async () => {
    setErr(null);
    const id = item.trim().toUpperCase().replace(/ /g, "_"), p = Number(price), n = Math.round(Number(amount));
    if (!id || !(p > 0) || !(n > 0)) { setErr("Enter the item id, your price and the amount."); return; }
    try {
      const r = await api<{ items: Record<string, Book> }>(`/api/v1/books?ids=${encodeURIComponent(id)}`);
      const b = r.items[id];
      if (!b) { setErr(`${id} is not on the bazaar right now.`); return; }
      trackedOrders.set(all => [...all, trackOrder({ id: `${Date.now()}-${id}`, item: id, name: b.name, side, price: p, amount: n }, b)]);
      setItem(""); setPrice(""); setAmount("");
    } catch (e) { setErr((e as Error).message); }
  };
  const remove = (id: string) => trackedOrders.set(all => all.filter(o => o.id !== id));

  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Trading</span><h1>My orders</h1>
        <p className="lede">Type in the buy orders and sell offers you placed in game. Every new snapshot checks them against the order book: on top or not, how many units are ahead of you, how much has filled, and the price to relist at. Estimates until the best price moves past yours (then the fill is certain). Orders expire 7 days after they are placed (counted from when you add them here). Saved in this browser only.</p></div></div>
      <section className="card filters" aria-label="Add an order">
        <label className="field grow" htmlFor="oi"><span>Item (name or id)</span><input id="oi" list="oi-list" value={item} onChange={e => setItem(e.target.value)} placeholder="ENCHANTED_DIAMOND" />
          <datalist id="oi-list">{(search.data ?? []).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</datalist></label>
        <label className="field" htmlFor="os"><span>Side</span><select id="os" value={side} onChange={e => setSide(e.target.value as "buy" | "sell")}><option value="buy">Buy order</option><option value="sell">Sell offer</option></select></label>
        <label className="field" htmlFor="op"><span>Your price</span><input id="op" type="number" step={0.1} value={price} onChange={e => setPrice(e.target.value)} /></label>
        <label className="field" htmlFor="oa"><span>Amount</span><input id="oa" type="number" step={1} value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <button className="primary" onClick={() => void add()}>Track order</button>
      </section>
      {err && <div className="note"><Icon name="warn" />{err}</div>}
      {orders.length === 0 ? <div className="card empty">No orders yet. Add one above, or use "Track this route" on any flip.</div> : (
        <div className="tablewrap"><table>
          <thead><tr><th className="l">Order</th><th className="l">Status</th><th>Filled</th><th>Ahead of you</th><th>Best now</th><th className="l">Next</th><th>Updated</th><th></th></tr></thead>
          <tbody>{[...orders].reverse().map(o => {
            const m = markets.data?.items[o.item];
            const flowH = m && m.ibuyWeek != null ? (o.side === "buy" ? buyFlowH(m as ItemMarket) : sellFlowH(m as ItemMarket)) : null;
            const eta = o.status === "top" && flowH ? (o.ahead + o.amount - o.filled) / flowH : null;
            const relist = o.best != null ? Math.round((o.side === "buy" ? o.best + 0.1 : o.best - 0.1) * 10) / 10 : null;
            return (
              <tr key={o.id}>
                <td className="l"><b>{o.side === "buy" ? "Buy order" : "Sell offer"}</b> {num(o.amount)} × <Link className="itemname" to={`/item/${o.item}`}>{o.name}</Link> @ {num(o.price, 1)}</td>
                <td className="l">{o.expired ? <span className="pill warn" title="Bazaar orders expire after 7 days: claim what filled, the rest comes back">expired</span>
                  : o.status === "filled" ? <span className="pill good"><Icon name="check" size={12} />filled{o.confirmed ? "" : " (estimate)"}</span>
                  : !o.seen ? <span className="pill">not in the book yet</span>
                  : o.status === "top" ? <span className="pill good">on top</span> : <span className="pill warn"><Icon name="warn" size={12} />{o.side === "buy" ? "outbid" : "undercut"}</span>}</td>
                <td className="n">{num(o.filled)} / {num(o.amount)}{(o.claimed ?? 0) > 0 && <div className="small muted">{num(o.claimed!)} claimed</div>}</td>
                <td className="n">{o.seen ? num(o.ahead) : "–"}</td>
                <td className="n">{o.best != null ? coins(o.best) : "–"}</td>
                <td className="l small">{o.expired ? "claim it in the bazaar" : o.status === "filled" ? "claim it in the bazaar" : o.status === "behind" && relist != null ? <>relist at <b>{num(relist, 1)}</b></> : eta != null ? <>~{dur(eta)} to fill at the current rate</> : "waiting"}
                  {!o.expired && o.status !== "filled" && <div className="muted">expires in {dur(Math.max(0, expiresAt(o) - Date.now()) / 3.6e6)}</div>}</td>
                <td className="n small muted">{ago(o.updatedAt)}</td>
                <td><div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 150 }}>
                  {o.filled > (o.claimed ?? 0) && <button className="ghost" title="You collected the filled units in game" onClick={() => trackedOrders.set(all => all.map(x => (x.id === o.id ? claimOrder(x) : x)))}>Claimed {num(o.filled - (o.claimed ?? 0))}</button>}
                  {o.side === "buy" && (o.status === "filled" || o.expired) && o.filled > 0 && !orders.some(x => x.id === `${o.id}-sell`) &&
                    <button className="ghost" onClick={() => void trackSellAfterBuy(o).catch(e => setErr((e as Error).message))}>Track the sell offer</button>}
                  <button className="ghost" onClick={() => remove(o.id)} aria-label="Stop tracking">Remove</button></div></td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {orders.some(o => o.status === "filled" || o.expired) && <button className="ghost" style={{ marginTop: 10 }} onClick={() => trackedOrders.set(all => all.filter(o => o.status !== "filled" && !o.expired))}>Clear filled and expired orders</button>}
    </>
  );
}
