// Alerts to you: an in-page toast, a short sound, a browser notification and, if you set a webhook, a Discord message
// (Discord accepts requests from this site; checked 2026-10-03). Discord messages are spaced at least 2 s apart.
import { useSyncExternalStore } from "react";
import { alertSettings } from "./prefs";

export interface Toast { id: number; title: string; body: string; level: "good" | "warn" | "info"; at: number; link?: string }
export type Channel = "flips" | "orders" | "test";

let toasts: Toast[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
export const useToasts = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => toasts);
export const dismiss = (id: number) => { toasts = toasts.filter(t => t.id !== id); emit(); };

let audio: AudioContext | null = null;
function beep(level: Toast["level"]) {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = level === "warn" ? 520 : 880;
    g.gain.setValueAtTime(0.08, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.25);
    o.connect(g).connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.25);
  } catch { /* no audio */ }
}

const discordQueue: string[] = [];
let sending = false;
async function pumpDiscord() {
  if (sending) return;
  sending = true;
  while (discordQueue.length) {
    const content = discordQueue.shift()!;
    const url = alertSettings.get().discordWebhook.trim();
    if (!/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url)) break;
    try {
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: content.slice(0, 1900), allowed_mentions: { parse: [] } }) });
    } catch { /* offline: dropped */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  sending = false;
}

export function notify(n: { title: string; body: string; level?: Toast["level"]; link?: string; channel: Channel }) {
  const s = alertSettings.get(), level = n.level ?? "info";
  toasts = [{ id: ++seq, title: n.title, body: n.body, level, at: Date.now(), link: n.link }, ...toasts].slice(0, 6);
  emit();
  if (s.sound) beep(level);
  if (s.browser && typeof Notification !== "undefined" && Notification.permission === "granted") {
    try { new Notification(n.title, { body: n.body, tag: `${n.channel}-${n.title}` }); } catch { /* not allowed here */ }
  }
  const toDiscord = n.channel === "test" || (n.channel === "flips" ? s.discordFlips : s.discordOrders);
  if (s.discordWebhook && toDiscord) { discordQueue.push(`**${n.title}**\n${n.body}`); void pumpDiscord(); }
}
