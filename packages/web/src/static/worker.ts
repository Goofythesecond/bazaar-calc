// Web Worker running the static website's backend (backend.ts), so the calculations never freeze the page.
import { HttpError, handle } from "./backend";

self.onmessage = async (e: MessageEvent<{ id: number; path: string; body: unknown }>) => {
  const { id, path, body } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, ok: true, value: await handle(path, body) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, status: err instanceof HttpError ? err.status : 500, error: (err as Error).message ?? String(err) });
  }
};
