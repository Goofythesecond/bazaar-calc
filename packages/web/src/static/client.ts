// Talks to the static backend running in a Web Worker: API requests, the live-update mode, and backend events.
import type { PaperState } from "@bc/shared";
import type { LiveMode, WorkerEvent } from "./backend";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
const listeners = new Set<(ev: WorkerEvent) => void>();
let lastMode: LiveMode | null = null;

function start(): Worker {
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string } | { type: "event"; event: WorkerEvent }>) => {
    if ("type" in e.data) { for (const l of listeners) l(e.data.event); return; }
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok) p.resolve(e.data.value); else p.reject(new Error(e.data.error ?? "request failed"));
  };
  w.onerror = e => {
    for (const p of pending.values()) p.reject(new Error(`calculator stopped: ${e.message}`));
    pending.clear();
    worker = null;
  };
  if (lastMode) w.postMessage({ type: "live", mode: lastMode });
  return w;
}

export function staticApi<T>(path: string, body?: unknown): Promise<T> {
  worker ??= start();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, path, body });
  });
}

/** Backend events (new snapshot, new history); returns the unsubscribe function. */
export function onWorkerEvent(fn: (ev: WorkerEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Paper trading in the worker: your settings and the saved record (null stops it). */
export function setPaper(config: { settings: unknown; profile: unknown; state: PaperState } | null) {
  worker ??= start();
  worker.postMessage({ type: "paper", config });
}

export function setLiveMode(mode: LiveMode) {
  lastMode = mode;
  worker ??= start();
  worker.postMessage({ type: "live", mode });
}
