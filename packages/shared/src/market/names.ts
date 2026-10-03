// Display names: Hypixel's item names where present; readable fallbacks for books and tags.
import { enchantRules, parseBookId } from "../rules/index.js";

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function prettyName(id: string, name?: string | null): string {
  if (name) return name.replace(/%%\w+%%|§./g, "").trim();
  const b = parseBookId(id);
  if (b) {
    const rule = enchantRules()[b.enchant];
    const base = rule?.name ?? b.enchant.replace(/^ENCHANTMENT_(ULTIMATE_)?/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    return `${base} ${ROMAN[b.level] ?? b.level}`;
  }
  return id.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
