// Pages of the static website (GitHub Pages) that differ from the self-hosted server: contributing data through
// GitHub, data status from the published manifest, and the published data files instead of an HTTP API.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { CollectStatus } from "../static/collect-worker";
import type { Manifest } from "../static/backend";
import { Icon } from "../components/Icon";
import { REPO, api, ago, num, utc } from "../lib";

const BASE = import.meta.env.BASE_URL;
const repoUrl = REPO ? `https://github.com/${REPO}` : null;
const uploadUrl = REPO ? `https://github.com/${REPO}/upload/main/data/inbox` : null;
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

// one collector for the whole visit: navigating to another page keeps it running
let worker: Worker | null = null;
const listeners = new Set<(s: CollectStatus) => void>();
let lastStatus: CollectStatus | null = null;
function collector(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../static/collect-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ type: "status"; status: CollectStatus } | { type: "file"; name: string; gz: Uint8Array }>) => {
    if (e.data.type === "status") { lastStatus = e.data.status; listeners.forEach(l => l(e.data.type === "status" ? e.data.status : lastStatus!)); }
    else {
      const url = URL.createObjectURL(new Blob([e.data.gz as BlobPart], { type: "application/gzip" }));
      const a = document.createElement("a"); a.href = url; a.download = e.data.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
  };
  return worker;
}

function useCollector() {
  const [s, setS] = useState<CollectStatus | null>(lastStatus);
  useEffect(() => { const w = collector(); listeners.add(setS); w.postMessage({ type: "status" }); return () => { listeners.delete(setS); }; }, []);
  return s;
}

const mb = (b: number) => `${(b / 1e6).toFixed(b < 1e6 ? 2 : 1)} MB`;
const Code = ({ children }: { children: string }) => <pre className="mono small" style={{ margin: 0, overflowX: "auto", background: "var(--sunken)", padding: 12, borderRadius: 8 }}>{children}</pre>;

function BrowserCollector() {
  const s = useCollector();
  const [name, setName] = useState(() => { try { return localStorage.getItem("bazaar-calc.login") ?? ""; } catch { return ""; } });
  const [ah, setAh] = useState(false);
  const ok = LOGIN_RE.test(name);
  const start = () => { try { localStorage.setItem("bazaar-calc.login", name); } catch { /* private mode */ } collector().postMessage({ type: "start", name, auctions: ah }); };
  return (
    <section className="card pad stack">
      <div className="spread"><h2 style={{ margin: 0 }}>Collect in this tab</h2>{s?.running ? <span className="pill good"><Icon name="pulse" size={12} />recording</span> : <span className="pill">stopped</span>}</div>
      <p className="small" style={{ margin: 0 }}>Polls Hypixel's public bazaar every 20 s (plus auction sales every 30 s) and records hourly prices, order-book flow and time-on-top, nothing about players. Keep this tab open; a hidden tab may be slowed down by the browser (the file records the real timing, and only polls at most 150 s apart count toward fill times). New file every day at 00:00 UTC.</p>
      {!s?.running ? <>
        <label className="stack" style={{ gap: 4 }}><span className="small">Your GitHub username (files are named after it, so your pull request can be matched)</span>
          <input value={name} onChange={e => setName(e.target.value.trim())} placeholder="your-github-login" style={{ maxWidth: 280 }} aria-invalid={!!name && !ok} /></label>
        <label className="row small"><input type="checkbox" checked={ah} onChange={e => setAh(e.target.checked)} />Also scan auction lowest-BIN prices every 30 min (about 60 MB download per scan)</label>
        <button className="primary" disabled={!ok} onClick={start} style={{ alignSelf: "flex-start" }}>Start collecting</button>
      </> : <>
        <div className="grid cols-3">
          <div className="card tile"><div className="label">Polls</div><div className="value">{num(s.polls)}</div><div className="sub">{s.lastPoll ? `last ${ago(s.lastPoll)}` : "waiting for Hypixel"}</div></div>
          <div className="card tile"><div className="label">Hours recorded</div><div className="value">{num(s.hours, 1)}</div><div className="sub">{s.medianGapS != null ? `polls every ~${Math.round(s.medianGapS)} s` : "–"}</div></div>
          <div className="card tile"><div className="label">Auction sales</div><div className="value">{num(s.sales)}</div><div className="sub">{s.binScans} BIN scans</div></div>
        </div>
        {s.medianGapS != null && s.medianGapS > 60 && <div className="note"><Icon name="warn" />Polls are {Math.round(s.medianGapS)} s apart: the browser is slowing this tab down. Keep it visible, or use the Node collector below.</div>}
        <button onClick={() => collector().postMessage({ type: "stop" })} style={{ alignSelf: "flex-start" }}>Stop and finish the file</button>
      </>}
      {(s?.errors.length ?? 0) > 0 && <div className="small muted">{s!.errors.slice(0, 3).map(e => <div key={e}>{e}</div>)}</div>}
      {(s?.rejected.length ?? 0) > 0 && <div className="small muted">Responses skipped: {s!.rejected.map(r => r.reason).join("; ")}</div>}
      <h3 style={{ margin: "6px 0 0" }}>Finished files</h3>
      {!s?.files.length ? <p className="small muted" style={{ margin: 0 }}>None yet. A file is finished at 00:00 UTC or when you stop.</p> :
        <table className="small"><tbody>{s.files.map(f => (
          <tr key={f.key}><td className="l mono">{f.name}</td><td className="n">{num(f.hours, 1)} h</td><td className="n">{mb(f.bytes)}</td>
            <td><button onClick={() => collector().postMessage({ type: "file", key: f.key })}>Download</button> <button className="ghost" onClick={() => collector().postMessage({ type: "delete", key: f.key })}>Delete</button></td></tr>
        ))}</tbody></table>}
    </section>
  );
}

export function ContributeStatic() {
  const st = useQuery({ queryKey: ["status"], queryFn: () => api<{ manifest: Manifest }>("/api/v1/status") });
  const m = st.data?.manifest;
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Community</span><h1>Contribute data</h1>
        <p className="lede">This site has no server: live prices come from Hypixel in your browser, and everything that needs history (fill times, competition, typical prices, manipulation checks, auction prices) comes from data that players record and send in through GitHub. Every file is checked automatically and approved by hand.</p></div></div>
      <div className="grid cols-2">
        <BrowserCollector />
        <section className="card pad stack">
          <h2 style={{ margin: 0 }}>Or run the Node collector</h2>
          <p className="small" style={{ margin: 0 }}>Better for long runs (keeps polling with the screen locked). Needs Node 18 or newer, nothing else.</p>
          <a className="btn" href={`${BASE}collector/bazaar-calc-collector.mjs`} download style={{ alignSelf: "flex-start" }}><Icon name="upload" />Download bazaar-calc-collector.mjs</a>
          <Code>{"node bazaar-calc-collector.mjs --name your-github-login"}</Code>
          <p className="small muted" style={{ margin: 0 }}>Writes one file per UTC day into ./bazaar-data (updated every 5 minutes). It also scans auction lowest-BIN prices every 30 min (~60 MB each, about 3 GB a day); add <code className="mono">--no-bins</code> to skip that.</p>
          <h3 style={{ margin: "6px 0 0" }}>Send your files</h3>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Open {uploadUrl ? <a href={uploadUrl} target="_blank" rel="noreferrer">the upload page</a> : "the project's GitHub repository, folder data/inbox, Add file > Upload files"} and drop in your <code className="mono">.json.gz</code> files (up to 25 MB each).</li>
            <li>Choose <b>Create a new branch and start a pull request</b>. GitHub makes a copy of the project for you if needed.</li>
            <li>An automatic check opens each file, verifies it and compares it with data other people recorded at the same time (everybody sees the same Hypixel snapshots, so overlaps must match exactly).</li>
            <li>The maintainer approves it; the site rebuilds with your data within minutes.</li>
          </ol>
          {repoUrl && <a className="small" href={repoUrl} target="_blank" rel="noreferrer">Source code and data on GitHub</a>}
        </section>
      </div>
      <h2>Contributors</h2>
      {!m ? <div className="card empty">Loading…</div> : m.contributors.length === 0 ? <div className="card empty">No data yet.</div> :
        <div className="tablewrap"><table><thead><tr><th className="l">GitHub</th><th>Files</th><th>Hours used</th><th>Polls</th><th>Latest data</th></tr></thead><tbody>
          {m.contributors.map(c => <tr key={c.name}><td className="l"><b>{c.name}</b></td><td className="n">{num(c.files)}</td><td className="n">{num(c.hours, 1)}</td><td className="n">{num(c.polls)}</td><td className="n">{utc(c.last)}</td></tr>)}
        </tbody></table></div>}
    </>
  );
}

export function StatusStatic() {
  const q = useQuery({ queryKey: ["status"], queryFn: () => api<{ manifest: Manifest; dataAt: number | null; statsAt: number; statsUsed: boolean | null }>("/api/v1/status"), refetchInterval: 60_000 });
  const m = q.data?.manifest;
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Reference</span><h1>Data status</h1><p className="lede">Live prices come from Hypixel in your browser. History comes from contributed data, rebuilt each time a contribution is approved.</p></div></div>
      {q.error && <div className="note"><Icon name="warn" />{(q.error as Error).message}</div>}
      {m && q.data && <>
        <div className="grid cols-3">
          <div className="card tile"><div className="label">Live prices</div><div className="value">{q.data.dataAt ? new Date(q.data.dataAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "–"}</div><div className="sub">straight from Hypixel; updates every minute while a page is open</div></div>
          <div className="card tile"><div className="label">History up to (newest contributed data)</div><div className="value">{ago(m.asOf)}</div><div className="sub">{utc(m.asOf)}{q.data.statsUsed === false ? " · too old, not used" : ""}</div></div>
          <div className="card tile"><div className="label">Site built</div><div className="value">{ago(m.builtAt)}</div><div className="sub">rebuilt on every approved contribution and daily · recipes: NEU {m.recipesVersion?.slice(0, 7) ?? "–"}</div></div>
        </div>
        <h2>Coverage by day (polls from contributors)</h2>
        <div className="tablewrap"><table><thead><tr><th className="l">Day (UTC)</th><th>Polls</th><th className="l" style={{ width: "50%" }}>Share of the day</th></tr></thead><tbody>
          {m.daily.slice(-30).reverse().map(d => <tr key={d.day}><td className="l">{d.day}</td><td className="n">{num(d.polls)}</td>
            <td className="l"><div className="meter"><div className="track"><div className="fill" style={{ width: `${Math.min(100, (d.polls / 4320) * 100)}%` }} /></div></div></td></tr>)}
        </tbody></table></div>
        <h2>Files</h2>
        <div className="tablewrap"><table><thead><tr><th className="l">File</th><th>From</th><th>To</th><th>Hours used</th><th className="l">Notes</th></tr></thead><tbody>
          {[...m.files].reverse().slice(0, 200).map(f => <tr key={f.label}><td className="l mono small">{f.label}</td><td className="n">{utc(f.from)}</td><td className="n">{utc(f.to)}</td><td className="n">{f.picked}/{f.hours}</td>
            <td className="l small muted" style={{ whiteSpace: "normal" }}>{f.source === "wayback" ? "Internet Archive copy" : f.kind}{f.warnings.length ? ` · ${f.warnings.join("; ")}` : ""}</td></tr>)}
          {m.rejected.map(r => <tr key={r.label}><td className="l mono small">{r.label}</td><td colSpan={3} className="l"><span className="pill crit">skipped</span></td><td className="l small" style={{ whiteSpace: "normal" }}>{r.error}</td></tr>)}
        </tbody></table></div>
      </>}
    </>
  );
}

export function ApiDocsStatic() {
  const files: [string, string][] = [
    ["manifest.json", "what the data covers: newest poll, contributors, every file used or skipped, polls per day"],
    ["market.json", "per bazaar item: 24 h / 7-day / 14-day medians, competition and flow, mass-delist evidence, event impact; time-on-top summaries per side; auction lowest BINs and sales"],
    ["items.json", "every SkyBlock item (Hypixel), with whether it is on the bazaar"],
    ["recipes.json", "crafting, forge and NPC-shop recipes with unlock requirements (NotEnoughUpdates-REPO, MIT)"],
    ["mayors.json", "mayor terms and the current election"],
    ["item/<ID>.json", "hourly price history (older than 30 days: every 6 h) and the last day of time-on-top episodes; characters other than letters, digits, _ and - are written as ~hex"],
    ["ah/<KEY>.json", "hourly lowest BIN (90 days) and the last week's anonymous sale prices"],
  ];
  return (
    <>
      <div className="pagehead"><div><span className="eyebrow">Reference</span><h1>Data files</h1><p className="lede">This copy of the site has no server, so there is no HTTP API. Everything it uses is published as JSON next to the page, free to use with the attribution in Sources. Live prices come straight from Hypixel's public API.</p></div></div>
      <div className="tablewrap"><table><thead><tr><th className="l">File</th><th className="l">Contents</th></tr></thead><tbody>
        {files.map(([f, d]) => <tr key={f}><td className="l mono small"><a href={`${BASE}data/${f.includes("<") ? "" : f}`}>{`${BASE}data/${f}`}</a></td><td className="l" style={{ whiteSpace: "normal" }}>{d}</td></tr>)}
      </tbody></table></div>
      <section className="card pad stack" style={{ marginTop: 14 }}>
        <h2 style={{ margin: 0 }}>Want the full API?</h2>
        <p className="small" style={{ margin: 0 }}>The same code runs as a server with a JSON API (POST /api/v1/calc/..., fill reports, history) and its own 20-second scanner. {repoUrl ? <>See <a href={repoUrl}>the repository</a> for how to run it.</> : "See the repository README for how to run it."}</p>
      </section>
    </>
  );
}
