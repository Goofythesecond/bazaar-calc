// Minimal reader for Minecraft NBT (big-endian, already gunzipped), enough to identify the item in an auction's
// item_bytes. Runs in Node and in browsers (no Buffer). Only aggregates per item are kept: no player data is read.
import type { Auction } from "./hypixel.js";

type Nbt = number | bigint | string | Nbt[] | { [k: string]: Nbt } | Int8Array | Int32Array | BigInt64Array;

class Reader {
  private v: DataView;
  private o = 0;
  private static td = new TextDecoder("utf-8");
  constructor(private b: Uint8Array) { this.v = new DataView(b.buffer, b.byteOffset, b.byteLength); }
  u8() { return this.v.getUint8(this.o++); }
  i8() { return this.v.getInt8(this.o++); }
  i16() { const x = this.v.getInt16(this.o); this.o += 2; return x; }
  u16() { const x = this.v.getUint16(this.o); this.o += 2; return x; }
  i32() { const x = this.v.getInt32(this.o); this.o += 4; return x; }
  i64() { const x = this.v.getBigInt64(this.o); this.o += 8; return x; }
  f32() { const x = this.v.getFloat32(this.o); this.o += 4; return x; }
  f64() { const x = this.v.getFloat64(this.o); this.o += 8; return x; }
  str() { const n = this.u16(); const s = Reader.td.decode(this.b.subarray(this.o, this.o + n)); this.o += n; return s; }
  payload(t: number, depth: number): Nbt {
    if (depth > 64) throw new Error("NBT nested too deep");
    switch (t) {
      case 1: return this.i8();
      case 2: return this.i16();
      case 3: return this.i32();
      case 4: return this.i64();
      case 5: return this.f32();
      case 6: return this.f64();
      case 7: { const n = this.i32(); const a = new Int8Array(this.b.buffer.slice(this.b.byteOffset + this.o, this.b.byteOffset + this.o + n)); this.o += n; return a; }
      case 8: return this.str();
      case 9: { const et = this.u8(), n = this.i32(), out: Nbt[] = []; for (let i = 0; i < n; i++) out.push(this.payload(et, depth + 1)); return out; }
      case 10: {
        const out: { [k: string]: Nbt } = {};
        for (;;) { const ct = this.u8(); if (ct === 0) break; const name = this.str(); out[name] = this.payload(ct, depth + 1); }
        return out;
      }
      case 11: { const n = this.i32(), a = new Int32Array(n); for (let i = 0; i < n; i++) a[i] = this.i32(); return a; }
      case 12: { const n = this.i32(), a = new BigInt64Array(n); for (let i = 0; i < n; i++) a[i] = this.i64(); return a; }
      default: throw new Error(`unknown NBT tag ${t}`);
    }
  }
}

/** Parse an uncompressed NBT document: the root compound's content (names of nested tags kept, root name dropped). */
export function parseNbt(bytes: Uint8Array): { [k: string]: Nbt } {
  const r = new Reader(bytes);
  const t = r.u8();
  if (t !== 10) throw new Error("NBT root is not a compound");
  r.str();
  return r.payload(10, 0) as { [k: string]: Nbt };
}

const TIERS = ["COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC"];

/** Item key + stack size from an auction's item NBT (gunzipped item_bytes).
 *  key: Hypixel id; single-enchant books -> ENCHANTMENT_<NAME>_<LEVEL>; pets -> PET_<TYPE>_<TIER>. Prices are per item. */
export function auctionItemKey(nbtBytes: Uint8Array): { key: string; count: number } | null {
  try {
    const root = parseNbt(nbtBytes) as { i?: { Count?: number; tag?: { ExtraAttributes?: Record<string, unknown> } }[] };
    const item = root.i?.[0];
    const ea = item?.tag?.ExtraAttributes;
    const id = ea?.id as string | undefined;
    const count = Math.max(1, Number(item?.Count ?? 1));
    if (!id) return null;
    if (id === "ENCHANTED_BOOK") {
      const ench = ea?.enchantments as Record<string, number> | undefined;
      const keys = ench ? Object.keys(ench) : [];
      if (keys.length === 1) return { key: `ENCHANTMENT_${keys[0]!.toUpperCase()}_${ench![keys[0]!]}`, count };
      return null; // multi-enchant books are not a single product
    }
    if (id === "PET" && typeof ea?.petInfo === "string") {
      const info = JSON.parse(ea.petInfo) as { type?: string; tier?: string };
      if (info.type && info.tier && TIERS.includes(info.tier)) return { key: `PET_${info.type}_${info.tier}`, count };
      return null;
    }
    return { key: id, count };
  } catch {
    return null;
  }
}

/** Lowest / second-lowest BIN per item key over a set of active auctions. */
export interface BinAgg { lowest: number; second: number | null; bins: number; total: number }

/** `key(item_bytes)` decodes one auction's item (gunzip + auctionItemKey); platform specific, so it is passed in. */
export async function aggregateBins(auctions: Auction[], key: (itemBytes: string) => Promise<{ key: string; count: number } | null> | { key: string; count: number } | null,
  into = new Map<string, BinAgg>()): Promise<Map<string, BinAgg>> {
  for (const a of auctions) {
    if (a.claimed) continue;
    const info = await key(a.item_bytes);
    if (!info) continue;
    const agg = into.get(info.key) ?? { lowest: Infinity, second: null, bins: 0, total: 0 };
    agg.total++;
    if (a.bin) {
      agg.bins++;
      const price = a.starting_bid / info.count;
      if (price < agg.lowest) { agg.second = Number.isFinite(agg.lowest) ? agg.lowest : null; agg.lowest = price; }
      else if (agg.second == null || price < agg.second) agg.second = price;
    }
    into.set(info.key, agg);
  }
  return into;
}
