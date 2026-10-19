"use client";
import { useState } from "react";

type Tab = { key: string; label: string; count: number };

// All panels are server-rendered up front; switching is instant and only rewrites ?tab= in the URL.
export default function CourseTabs({ tabs, initial, panels }: { tabs: Tab[]; initial: string; panels: Record<string, React.ReactNode> }) {
  const [active, setActive] = useState(initial);
  function pick(key: string) {
    setActive(key);
    history.replaceState(history.state, "", `?tab=${key}`);
  }
  function onKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const next = tabs[(i + d + tabs.length) % tabs.length];
    pick(next.key);
    document.getElementById(`tab-${next.key}`)?.focus();
  }
  return (
    <>
      <div role="tablist" aria-label="Course sections" className="flex gap-7 overflow-x-auto overflow-y-hidden border-b border-line text-sm [scrollbar-width:none]">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => pick(t.key)}
            onKeyDown={(e) => onKey(e, i)}
            className="-mb-px shrink-0 border-b-2 border-transparent py-2.5 text-muted outline-none hover:text-fg focus-visible:text-fg aria-selected:border-fg aria-selected:font-medium aria-selected:text-fg"
          >
            {t.label} <span className="font-normal text-muted">{t.count}</span>
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
