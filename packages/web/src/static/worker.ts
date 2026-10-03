// Web Worker running the static website's backend (backend.ts), so the calculations never freeze the page. Answers API
// requests, takes the live-update mode from the page, and forwards backend events (new snapshot, new history).
import { HttpError, type LiveMode, handle, setEmitter, setLiveMode, setPaper } from "./backend";

setEmitter(ev => (self as unknown as Worker).postMessage({ type: "event", event: ev }));

type Control = { type: "live"; mode: LiveMode } | { type: "paper"; config: Parameters<typeof setPaper>[0] };
self.onmessage = async (e: MessageEvent<{ id: number; path: string; body: unknown } | Control>) => {
  if ("type" in e.data) { if (e.data.type === "live") setLiveMode(e.data.mode); else setPaper(e.data.config); return; }
  const { id, path, body } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, ok: true, value: await handle(path, body) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, status: err instanceof HttpError ? err.status : 500, error: (err as Error).message ?? String(err) });
  }
};
