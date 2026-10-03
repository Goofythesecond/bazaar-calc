// Light / dark / system theme, saved in the browser.
import { useEffect, useState } from "react";

export type Theme = "system" | "light" | "dark";
const KEY = "bazaar-calc.theme";

function initial(): Theme {
  const fromUrl = new URLSearchParams(location.search).get("theme");
  if (fromUrl === "light" || fromUrl === "dark" || fromUrl === "system") return fromUrl;
  try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") return v; } catch { /* storage blocked */ }
  return "system";
}

/** System / light / dark. "system" leaves data-theme unset so prefers-color-scheme decides. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initial);
  useEffect(() => {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem(KEY, theme); } catch { /* storage blocked */ }
  }, [theme]);
  return [theme, setTheme];
}
