// Alert toasts (bottom right): flip alerts and order events from runners.ts; each disappears after 12 s.
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { dismiss, useToasts } from "../notify";
import { Icon } from "./Icon";

export function Toasts() {
  const toasts = useToasts();
  useEffect(() => {
    const t = setInterval(() => { for (const x of toasts) if (Date.now() - x.at > 12_000) dismiss(x.id); }, 1000);
    return () => clearInterval(t);
  }, [toasts]);
  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.level}`}>
          <Icon name={t.level === "warn" ? "warn" : t.level === "good" ? "check" : "info"} size={14} />
          <div className="stack" style={{ gap: 2 }}><b>{t.title}</b><span className="small">{t.body}</span>{t.link && <Link className="small" to={t.link} onClick={() => dismiss(t.id)}>Open</Link>}</div>
          <button className="ghost" aria-label="Dismiss" onClick={() => dismiss(t.id)}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </div>
  );
}
