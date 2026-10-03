// Sends API requests to the static backend running in a Web Worker.
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function start(): Worker {
  const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string }>) => {
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
