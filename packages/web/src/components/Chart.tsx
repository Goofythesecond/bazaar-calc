import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import type { GameEvent } from "@bc/shared";

const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export interface Line { label: string; values: (number | null)[]; color: string }

/** Time series: 2px lines, hairline grid, crosshair tooltip listing every series, mayor terms as a top strip and
 *  short events as shaded columns, a legend for 2+ series, and a table view of the same numbers. */
export function TimeChart({ t, lines, height = 280, events = [], fmt = (v: number) => String(v) }: { t: number[]; lines: Line[]; height?: number; events?: GameEvent[]; fmt?: (v: number) => string }) {
  const el = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    if (!el.current || !t.length || table) return;
    const bands: uPlot.Plugin = {
      hooks: {
        drawClear: u => {
          const { ctx } = u, { left, top, width, height: h } = u.bbox, px = devicePixelRatio;
          ctx.save(); ctx.beginPath(); ctx.rect(left, top, width, h); ctx.clip();
          for (const e of events) {
            const x0 = Math.max(left, u.valToPos(e.start / 1000, "x", true)), x1 = Math.min(left + width, u.valToPos(e.end / 1000, "x", true));
            if (x1 <= x0) continue;
            if (e.kind === "mayor_term") {
              ctx.fillStyle = css("--accent-soft"); ctx.fillRect(x0, top, x1 - x0 - 2 * px, 16 * px);
              ctx.fillStyle = css("--ink-2"); ctx.font = `500 ${10.5 * px}px ${css("--body")}`;
              const label = e.name.replace("Mayor ", "");
              if (x1 - x0 > ctx.measureText(label).width + 8 * px) ctx.fillText(label, x0 + 4 * px, top + 11.5 * px);
            } else if (e.kind !== "mayor_perk" && e.end - e.start < 12 * 3600_000) {
              ctx.fillStyle = css("--coin-soft"); ctx.fillRect(x0, top + 18 * px, Math.max(2 * px, x1 - x0), h - 18 * px);
            }
          }
          ctx.restore();
        },
      },
    };
    const tooltip: uPlot.Plugin = {
      hooks: {
        setCursor: u => {
          const i = u.cursor.idx, box = tip.current;
          if (!box) return;
          if (i == null || u.cursor.left == null || u.cursor.left < 0) { box.hidden = true; return; }
          box.hidden = false;
          box.replaceChildren();
          const head = document.createElement("div"); head.className = "t";
          head.textContent = new Date((u.data[0][i] ?? 0) * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
          box.appendChild(head);
          lines.forEach((l, k) => {
            const v = u.data[k + 1]?.[i];
            const r = document.createElement("div"); r.className = "r";
            const name = document.createElement("span"); const key = document.createElement("i"); key.style.background = l.color;
            name.append(key, document.createTextNode(l.label));
            const val = document.createElement("b"); val.textContent = v == null ? "–" : fmt(v);
            r.append(name, val); box.appendChild(r);
          });
          const left = (u.cursor.left ?? 0) + u.bbox.left / devicePixelRatio;
          box.style.left = `${Math.min(left + 14, (el.current?.clientWidth ?? 0) - 180)}px`;
          box.style.top = `${(u.cursor.top ?? 0) + 8}px`;
        },
      },
    };
    const grid = { stroke: css("--grid"), width: 1 };
    const u = new uPlot({
      width: el.current.clientWidth, height, plugins: [bands, tooltip], legend: { show: false },
      cursor: { points: { size: 8, width: 2, fill: css("--panel") }, y: false },
      scales: { x: { time: true } },
      axes: [
        { stroke: css("--muted"), grid, ticks: { show: false }, font: `11px ${css("--body")}` },
        { stroke: css("--muted"), grid, ticks: { show: false }, size: 64, font: `11px ${css("--mono")}`, values: (_u, v) => v.map(fmt) },
      ],
      series: [{}, ...lines.map(l => ({ label: l.label, stroke: l.color, width: 2, spanGaps: false, points: { show: false } }))],
    }, [t.map(x => x / 1000), ...lines.map(l => l.values)] as uPlot.AlignedData, el.current);
    const ro = new ResizeObserver(() => el.current && u.setSize({ width: el.current.clientWidth, height }));
    ro.observe(el.current);
    return () => { ro.disconnect(); u.destroy(); };
  }, [t, lines, height, events, fmt, table]);
  if (!t.length) return <div className="empty">No data stored for this range yet.</div>;
  return (
    <div>
      <div className="spread">
        <div className="legend">{lines.length > 1 && lines.map(l => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>
        <button className="ghost small" onClick={() => setTable(!table)}>{table ? "Show chart" : "Show table"}</button>
      </div>
      {table ? (
        <div className="tablewrap" style={{ maxHeight: height + 40, overflow: "auto" }}>
          <table><thead><tr><th className="l">Time</th>{lines.map(l => <th key={l.label}>{l.label}</th>)}</tr></thead>
            <tbody>{t.map((x, i) => i).reverse().slice(0, 500).map(i => (
              <tr key={i}><td className="l n">{new Date(t[i]!).toISOString().slice(0, 16).replace("T", " ")}</td>{lines.map(l => <td key={l.label} className="n">{l.values[i] == null ? "–" : fmt(l.values[i]!)}</td>)}</tr>
            ))}</tbody></table>
        </div>
      ) : <div className="chart" ref={el}><div className="tip" ref={tip} hidden /></div>}
    </div>
  );
}

/** 42-point sparkline for tables (one series, no legend, endpoint dot). */
export function Spark({ values, width = 96, height = 24 }: { values: (number | null)[]; width?: number; height?: number }) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2) return <span className="muted small">–</span>;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts: string[] = [];
  values.forEach((x, i) => { if (x != null) pts.push(`${(i / (values.length - 1)) * (width - 4) + 2},${height - 3 - ((x - lo) / span) * (height - 6)}`); });
  const last = pts.at(-1)!.split(",");
  const color = v.at(-1)! >= v[0]! ? "var(--good-mark)" : "var(--crit-mark)";
  return (
    <svg className="spark" width={width} height={height} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} stroke="var(--panel)" strokeWidth="1.5" />
    </svg>
  );
}
