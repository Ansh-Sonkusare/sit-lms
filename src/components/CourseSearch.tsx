"use client";
import { useRef, useState } from "react";

// Filters rendered rows by their data-search text; section counts follow the matches.
export default function CourseSearch({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [none, setNone] = useState(false);

  function filter(value: string) {
    setQ(value);
    const needle = value.trim().toLowerCase();
    let total = 0;
    root.current?.querySelectorAll("details").forEach((d) => {
      let n = 0;
      d.querySelectorAll<HTMLElement>("[data-search]").forEach((el) => {
        const hit = !needle || el.dataset.search!.includes(needle);
        el.hidden = !hit;
        if (hit) n++;
      });
      const count = d.querySelector<HTMLElement>("[data-count]");
      if (count) {
        count.dataset.orig ??= count.textContent ?? "";
        count.textContent = needle ? `${n} ${n === 1 ? "match" : "matches"}` : count.dataset.orig;
      }
      d.hidden = !!needle && n === 0;
      if (needle) d.open = n > 0;
      total += n;
    });
    setNone(!!needle && total === 0);
  }

  return (
    <>
      <label className="field">
        <svg viewBox="0 0 24 24" className="size-[15px] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" value={q} placeholder="Find a file in this course" aria-label="Find a file in this course"
          onChange={(e) => filter(e.target.value)} onKeyDown={(e) => e.key === "Escape" && filter("")} />
        {q && <button type="button" onClick={() => filter("")} className="text-[13px] text-muted hover:text-fg">Clear</button>}
      </label>
      {none && <p className="mt-6 text-sm text-muted">No files match “{q.trim()}”.</p>}
      <div ref={root}>{children}</div>
    </>
  );
}
