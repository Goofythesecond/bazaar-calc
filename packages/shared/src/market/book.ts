// "sbbook-v1" order-book packing, shared with the old sbdb database:
// zstd( u16 count + count * (i64 price_centicoins, i64 amount, u32 orders) ), little-endian.
// Compression is done by the caller (node:zlib zstd on the server); this module only (de)serialises the raw bytes.
import type { BookLevel } from "./types.js";

const LEVEL = 8 + 8 + 4;

export function packLevels(levels: BookLevel[]): Uint8Array {
  const buf = new ArrayBuffer(2 + levels.length * LEVEL);
  const v = new DataView(buf);
  v.setUint16(0, levels.length, true);
  levels.forEach((l, i) => {
    const o = 2 + i * LEVEL;
    v.setBigInt64(o, BigInt(Math.round(l.price * 100)), true);
    v.setBigInt64(o + 8, BigInt(Math.round(l.amount)), true);
    v.setUint32(o + 16, l.orders, true);
  });
  return new Uint8Array(buf);
}

export function unpackLevels(raw: Uint8Array): BookLevel[] {
  const v = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = v.getUint16(0, true);
  const out: BookLevel[] = [];
  for (let i = 0; i < n; i++) {
    const o = 2 + i * LEVEL;
    out.push({ price: Number(v.getBigInt64(o, true)) / 100, amount: Number(v.getBigInt64(o + 8, true)), orders: v.getUint32(o + 16, true) });
  }
  return out;
}
