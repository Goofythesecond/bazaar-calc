import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Profile, Settings } from "@bc/shared";
import { loadSaved, save } from "./lib";

interface Ctx {
  settings: Settings; profile: Profile;
  setSettings: (s: Partial<Settings>) => void; setProfile: (p: Partial<Profile>) => void;
  drawer: boolean; setDrawer: (v: boolean) => void;
}
const C = createContext<Ctx | null>(null);

export function AppState({ children }: { children: ReactNode }) {
  const [v, setV] = useState(loadSaved);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => save(v), [v]);
  return (
    <C.Provider value={{
      settings: v.settings, profile: v.profile, drawer, setDrawer,
      setSettings: s => setV(o => ({ ...o, settings: { ...o.settings, ...s } })),
      setProfile: p => setV(o => ({ ...o, profile: { ...o.profile, ...p } })),
    }}>{children}</C.Provider>
  );
}

export function useApp(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error("AppState missing");
  return c;
}
