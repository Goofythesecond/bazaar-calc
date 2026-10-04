// Settings & unlocks drawer: coins, Bazaar Flipper, play time, timing, and the collections / HotM / slayer
// unlocks the recipes need. Saved in the browser.
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, actionSeconds, forgeSlots, orderSlots, quickForgeReduction, taxRate, type Profile, type Settings } from "@bc/shared";
import { api, coins, num } from "../lib";
import { useApp } from "../state";
import { Icon } from "./Icon";

interface ReqCatalogRow { type: string; name: string | null; max: number; recipes: number }

const ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

function Num({ id, label, value, onChange, step = 1, min = 0, max, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; hint?: string }) {
  return (
    <label className="field" htmlFor={id}><span>{label}</span>
      {/* clamp to what the API accepts: one out-of-range value would otherwise make every calculation fail */}
      <input id={id} type="number" value={value} step={step} min={min} max={max}
        onChange={e => { const v = Number(e.target.value); if (e.target.value === "" || !Number.isFinite(v)) return; onChange(Math.min(max ?? Infinity, Math.max(min, v))); }} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, v)));
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="decrease" onClick={() => set(value - 1)}>−</button>
      <input type="number" value={value} min={0} max={max} aria-label={label} onChange={e => set(Number(e.target.value))} />
      <button type="button" aria-label="increase" onClick={() => set(value + 1)}>+</button>
    </span>
  );
}

type Tab = "money" | "speed" | "unlocks";

export function SettingsDrawer() {
  const { drawer, setDrawer, settings: s, profile: p, setSettings, setProfile } = useApp();
  const [tab, setTab] = useState<Tab>("money");
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [backup, setBackup] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const catalog = useQuery({ queryKey: ["req-catalog"], queryFn: () => api<ReqCatalogRow[]>("/api/v1/rules/requirements"), enabled: drawer, staleTime: Infinity });
  const collections = useMemo(() => (catalog.data ?? []).filter(r => r.type === "collection" && r.name), [catalog.data]);
  const slayers = useMemo(() => (catalog.data ?? []).filter(r => r.type === "slayer" && r.name), [catalog.data]);
  const reps = useMemo(() => (catalog.data ?? []).filter(r => r.type === "reputation" && r.name), [catalog.data]);
  const hotmMax = (catalog.data ?? []).find(r => r.type === "hotm")?.max ?? 10;
  if (!drawer) return null;

  const S = (k: keyof Settings) => (v: number) => setSettings({ [k]: v } as Partial<Settings>);
  const P = (k: keyof Profile) => (v: number) => setProfile({ [k]: v } as Partial<Profile>);
  const shown = collections.filter(c => c.name!.toLowerCase().includes(q.toLowerCase()) && (!onlyMissing || (p.collections[c.name!] ?? 0) < c.max));
  const setColl = (name: string, v: number) => setProfile({ collections: { ...p.collections, [name]: v } });
  const allMax = () => setProfile({ collections: Object.fromEntries(collections.map(c => [c.name!, c.max])) });

  const exportProfile = async () => {
    const text = JSON.stringify({ settings: s, profile: p });
    setBackup(text);
    try { await navigator.clipboard.writeText(text); setMsg("Copied your settings and unlocks to the clipboard."); } catch { setMsg("Copy the text below to keep a backup."); }
  };
  const importProfile = () => {
    try {
      const d = JSON.parse(backup) as { settings?: Partial<Settings>; profile?: Partial<Profile> };
      if (d.settings) setSettings(d.settings);
      if (d.profile) setProfile(d.profile);
      setMsg("Loaded settings and unlocks from the pasted text.");
    } catch { setMsg("That text is not a settings backup. Paste the exact text you copied earlier."); }
  };

  return (
    <>
      <div className="scrim" onClick={() => setDrawer(false)} />
      <aside className="drawer" aria-label="Settings and unlocks">
        <header>
          <div className="spread"><h2 style={{ margin: 0 }}>Settings &amp; unlocks</h2><button className="ghost" onClick={() => setDrawer(false)} aria-label="Close"><Icon name="x" /></button></div>
          <div className="seg" role="tablist">
            {([["money", "Coins & bazaar"], ["speed", "Your speed"], ["unlocks", "Unlocks"]] as [Tab, string][]).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
        </header>
        <div className="body">
          {tab === "money" && <>
            <div className="grid cols-2">
              <Num id="coins" label="Coins to use" value={s.coins} step={1_000_000} max={1e13} onChange={S("coins")} hint={coins(s.coins)} />
              <label className="field" htmlFor="flipper"><span>Bazaar Flipper perk</span>
                <select id="flipper" value={s.bazaarFlipperLevel} onChange={e => S("bazaarFlipperLevel")(Number(e.target.value))}>
                  {[0, 1, 2].map(l => <option key={l} value={l}>Level {l}: {orderSlots(l)} orders, {(taxRate(l) * 100).toFixed(3).replace(/0+$/, "")}% tax</option>)}
                </select>
              </label>
              <Num id="check" label="Check orders every (minutes)" value={s.checkIntervalMin} step={0.5} min={0.5} max={240} onChange={S("checkIntervalMin")} hint="How often you relist when outbid" />
              <Num id="hours" label="Hours you flip per day" value={s.hoursPerDay} step={0.5} min={0.1} max={24} onChange={S("hoursPerDay")} />
              <label className="field" htmlFor="playfrom" title="Orders fill faster at busy times of day. Your local time (stored as UTC). Uses the hour-by-hour trading the scanner measures once every hour of the day is covered on two days; until then the daily average is used."><span>I usually start playing at</span>
                <select id="playfrom" value={s.playFromUtc ?? -1} onChange={e => S("playFromUtc")(Number(e.target.value))}>
                  <option value={-1}>Any time (daily average)</option>
                  {Array.from({ length: 24 }, (_, local) => {
                    // the select shows your local hours; the calculator works in UTC (hour offsets only, rounded)
                    const utc = (((local + Math.round(new Date().getTimezoneOffset() / 60)) % 24) + 24) % 24;
                    return <option key={local} value={utc}>{String(local).padStart(2, "0")}:00 your time ({String(utc).padStart(2, "0")}:00 UTC)</option>;
                  })}
                </select>
              </label>
              <Num id="limit" label="Daily bazaar limit (coins)" value={s.dailyLimit} step={1e9} max={1e12} onChange={S("dailyLimit")} hint={`${coins(s.dailyLimit)} · community value 15B`} />
              <Num id="minunits" label="Ignore routes under (units / hour)" value={s.minUnitsPerHour} step={0.1} max={1e9} onChange={S("minUnitsPerHour")} />
            </div>
            <label className="check"><input type="checkbox" checked={s.includeFlagged} onChange={e => setSettings({ includeFlagged: e.target.checked })} /> Include markets with warnings (thin, walled, jumping)</label>
            <label className="check" title="Off: a flip buys its batch, then sells it (how one trade really runs). On: you place the next buy order while the last batch is still on sale, which needs coins for both."><input type="checkbox" checked={!!s.overlapOrders} onChange={e => setSettings({ overlapOrders: e.target.checked })} /> I keep buying while my sell offer is up</label>
            <Num id="unknown" label="Assumed time on top when competition is unknown (0–1)" value={s.unknownCompetitionShare} step={0.05} min={0.05} max={1} onChange={S("unknownCompetitionShare")} />
          </>}

          {tab === "speed" && <>
            <p className="small muted" style={{ margin: 0 }}>Used to estimate how long listing, relisting and claiming take, and how much clicking a route needs.</p>
            <div className="grid cols-3">
              <Num id="ping" label="Ping (ms)" value={s.pingMs} step={10} max={5000} onChange={S("pingMs")} />
              <Num id="click" label="Click delay (ms)" value={s.clickDelayMs} step={25} max={10000} onChange={S("clickDelayMs")} />
              <Num id="typing" label="Typing time (ms)" value={s.typingMs} step={100} max={30000} onChange={S("typingMs")} />
            </div>
            <div className="card pad small">
              With these: a buy order takes <b className="num">{actionSeconds("create_buy_order", s).toFixed(1)} s</b>, a relist <b className="num">{actionSeconds("relist_buy_order", s).toFixed(1)} s</b>,
              claiming <b className="num">{actionSeconds("claim_order", s).toFixed(1)} s</b>, an anvil combine <b className="num">{actionSeconds("anvil_combine", s).toFixed(1)} s</b>.
            </div>
            <div className="grid cols-2">
              <Num id="attention" label="Share of each hour you can click (0–1)" value={s.attention} step={0.05} min={0.05} max={1} onChange={S("attention")} />
              <Num id="crafts" label="Most crafts you do per hour" value={s.craftsPerHourMax} step={50} max={1e6} onChange={S("craftsPerHourMax")} />
            </div>
          </>}

          {tab === "unlocks" && <>
            <label className="check"><input type="checkbox" checked={p.ignoreRequirements} onChange={e => setProfile({ ignoreRequirements: e.target.checked })} /> Show every route and ignore my unlocks</label>
            <div className="grid cols-2">
              <label className="field" htmlFor="hotm"><span>Heart of the Mountain tier</span>
                <select id="hotm" value={p.hotmTier} onChange={e => P("hotmTier")(Number(e.target.value))}>{Array.from({ length: hotmMax + 1 }, (_, i) => <option key={i} value={i}>{i === 0 ? "Not unlocked" : `Tier ${i} · ${forgeSlots(i)} forge slots`}</option>)}</select>
              </label>
              <label className="field" htmlFor="qf"><span>Quick Forge level · −{(quickForgeReduction(p.quickForgeLevel) * 100).toFixed(1)}% forge time</span>
                <input id="qf" type="range" min={0} max={20} value={p.quickForgeLevel} onChange={e => P("quickForgeLevel")(Number(e.target.value))} />
              </label>
              <Num id="ench" label="Enchanting skill level" value={p.enchantingLevel} max={60} onChange={P("enchantingLevel")} />
              <Num id="xp" label="XP levels you can spend" value={p.xpLevels} max={10000} onChange={P("xpLevels")} hint="For books that cost XP to combine" />
            </div>
            <label className="check"><input type="checkbox" checked={p.coleMoltenForge} onChange={e => setProfile({ coleMoltenForge: e.target.checked })} /> Count Cole's Molten Forge (−25%) even when he is not mayor</label>

            <div>
              <div className="spread"><span className="eyebrow">Slayers</span></div>
              <div className="grid cols-3" style={{ marginTop: 8 }}>
                {(slayers.length ? slayers : [{ name: "Zombie", max: 9 }, { name: "Spider", max: 9 }, { name: "Wolf", max: 9 }, { name: "Enderman", max: 9 }, { name: "Blaze", max: 9 }, { name: "Vampire", max: 5 }] as ReqCatalogRow[]).map(r => (
                  <div key={r.name} className="field"><span>{r.name}</span><Stepper label={`${r.name} slayer level`} value={p.slayers[r.name!] ?? 0} max={r.max} onChange={v => setProfile({ slayers: { ...p.slayers, [r.name!]: v } })} /></div>
                ))}
              </div>
            </div>
            <div>
              <div className="spread"><span className="eyebrow">Skills</span></div>
              <div className="grid cols-3" style={{ marginTop: 8 }}>
                {([["Taming", "Kat upgrades: Taming 1 / 5 / 10 / 20 / 25 for Uncommon to Mythic"], ["Foraging", "Shard fusion: Galatea opens at Foraging 12"]] as const).map(([name, hint]) => (
                  <div key={name} className="field" title={hint}><span>{name}</span><Stepper label={`${name} skill level`} value={p.skills?.[name] ?? 0} max={60} onChange={v => setProfile({ skills: { ...p.skills, [name]: v } })} /></div>
                ))}
              </div>
            </div>
            {reps.length > 0 && <div className="grid cols-2">{reps.map(r => (
              <Num key={r.name} id={`rep-${r.name}`} label={`${r.name} reputation`} value={p.reputation[r.name!] ?? 0} step={500} max={1e6} onChange={v => setProfile({ reputation: { ...p.reputation, [r.name!]: v } })} hint={`Recipes need up to ${num(r.max)}`} />
            ))}</div>}

            <div className="stack" style={{ gap: 8 }}>
              <div className="spread"><span className="eyebrow">Collections ({collections.length} used by recipes)</span>
                <span className="row"><button className="ghost small" onClick={allMax}>Set all to max</button><button className="ghost small" onClick={() => setProfile({ collections: {} })}>Clear</button></span></div>
              <div className="row">
                <label className="field grow" htmlFor="collq" style={{ flex: 1 }}><input id="collq" placeholder="Find a collection" value={q} onChange={e => setQ(e.target.value)} /></label>
                <label className="check"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> below max only</label>
              </div>
              <div className="reqlist">
                {catalog.isLoading && <div className="empty">Loading the list of collections…</div>}
                {shown.map(c => {
                  const have = p.collections[c.name!] ?? 0;
                  return (
                    <div key={c.name} className="reqrow">
                      <span className="nm">{c.name}<small>{c.recipes} recipe{c.recipes === 1 ? "" : "s"} need up to {ROMAN[c.max] ?? c.max}</small></span>
                      <span className={`pill ${have >= c.max ? "good" : have > 0 ? "" : "warn"}`}>{have >= c.max ? "all" : `tier ${ROMAN[have] ?? have}`}</span>
                      <Stepper label={`${c.name} collection tier`} value={have} max={Math.max(c.max, have)} onChange={v => setColl(c.name!, v)} />
                    </div>
                  );
                })}
                {!catalog.isLoading && shown.length === 0 && <div className="empty">No collections match.</div>}
              </div>
            </div>
          </>}

          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">Backup</span>
            <p className="small muted" style={{ margin: 0 }}>Everything here is saved in this browser only. Copy it to move to another browser.</p>
            <div className="row"><button onClick={exportProfile}>Copy backup</button><button onClick={importProfile} disabled={!backup}>Load pasted backup</button></div>
            <textarea id="backup" rows={3} value={backup} placeholder="Paste a backup here" onChange={e => setBackup(e.target.value)} />
            {msg && <div className="note"><Icon name="info" />{msg}</div>}
          </div>
        </div>
        <footer>
          <button className="ghost" onClick={() => { setSettings(DEFAULT_SETTINGS); setProfile(DEFAULT_PROFILE); setMsg("Reset to defaults."); }}>Reset everything</button>
          <button className="primary" onClick={() => setDrawer(false)}>Done</button>
        </footer>
      </aside>
    </>
  );
}
