// Display names: Hypixel's item names where present; readable fallbacks for books and tags.
import { enchantRules, parseBookId } from "../rules/index.js";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function prettyName(id: string, name?: string | null): string {
  if (name) {
    const n = name.replace(/%%\w+%%|§./g, "").trim();
    // Hypixel names every bundle "Enchanted Book Bundle" (13 of them, 2026-10-04): say which enchant it holds
    const bundle = /^ENCHANTED_BOOK_BUNDLE_(\w+)$/.exec(id);
    if (bundle && n === "Enchanted Book Bundle") {
      const r = enchantRules();
      return `${n} (${r[`ENCHANTMENT_${bundle[1]}`]?.name ?? r[`ENCHANTMENT_ULTIMATE_${bundle[1]}`]?.name ?? titleCase(bundle[1]!)})`;
    }
    return n;
  }
  const b = parseBookId(id);
  if (b) {
    const rule = enchantRules()[b.enchant];
    const base = rule?.name ?? b.enchant.replace(/^ENCHANTMENT_(ULTIMATE_)?/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return `${base} ${ROMAN[b.level] ?? b.level}`;
  }
  return titleCase(id);
}
const titleCase = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
