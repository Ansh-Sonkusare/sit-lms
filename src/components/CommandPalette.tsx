"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchItem } from "@/app/api/search/route.ts";

const SEARCH = (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);

// Lower is better: title prefix, then a word in the title starting with it, then anywhere in the title, then the course/section.
function rank(i: SearchItem, q: string) {
  const t = i.title.toLowerCase().replace(/[_-]+/g, " ");
  const kind = i.kind === "Course" ? 0 : 0.5;
  if (t.startsWith(q)) return 0 + kind;
  if (t.split(/\s+/).some((w) => w.startsWith(q))) return 1 + kind;
  if (t.includes(q)) return 2 + kind;
  if (i.subtitle.toLowerCase().includes(q)) return 3 + kind;
  return Infinity;
}

let index: Promise<SearchItem[]> | null = null;
const loadIndex = () => (index ??= fetch("/api/search").then((r) => (r.ok ? r.json() : [])).catch(() => ((index = null), [])));

export default function CommandPalette() {
  const dlg = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  function toggle() {
    const d = dlg.current;
    if (!d) return;
    if (d.open) return d.close();
    d.showModal();
    setQ("");
    setSel(0);
    loadIndex().then(setItems);
  }

  // warm the index shortly after load so the palette opens with results
  useEffect(() => {
    const t = setTimeout(loadIndex, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const needle = q.trim().toLowerCase();
  const shown = !items
    ? []
    : !needle
      ? items.filter((i) => i.kind === "Course")
      : items
          .map((i) => ({ i, r: rank(i, needle) }))
          .filter((x) => x.r !== Infinity)
          .sort((a, b) => a.r - b.r)
          .slice(0, 40)
          .map((x) => x.i);

  function go(i?: SearchItem) {
    if (!i) return;
    dlg.current?.close();
    if (i.href.startsWith("/api/") || i.href.startsWith("http")) window.open(i.href, "_blank");
    else router.push(i.href);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") setSel((s) => Math.min(s + 1, shown.length - 1));
    else if (e.key === "ArrowUp") setSel((s) => Math.max(s - 1, 0));
    else if (e.key === "Enter") go(shown[sel]);
    else return;
    e.preventDefault();
  }

  return (
    <>
      <button onClick={toggle} onPointerEnter={loadIndex} title="Search (⌘K)" aria-label="Search"
        className="grid size-11 place-items-center rounded-lg text-muted hover:bg-subtle md:flex md:h-9 md:w-[260px] md:items-center md:gap-2 md:border md:border-line md:px-3 md:text-[13px] md:hover:bg-transparent md:hover:border-fg/40">
        {SEARCH}
        <span className="hidden flex-1 text-left md:inline">Search courses and files</span>
        <kbd className="hidden font-sans text-xs text-muted md:inline">⌘K</kbd>
      </button>
      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current.close()} aria-label="Search"
        className="mx-auto mt-3 w-[calc(100vw-24px)] max-w-xl rounded-xl border border-line bg-bg p-0 text-fg backdrop:bg-black/50 md:mt-[12vh]">
        <label className="flex h-13 items-center gap-3 border-b border-line px-4 text-muted">
          {SEARCH}
          <input autoFocus value={q} placeholder="Search courses, files and tasks" onKeyDown={onKey}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            role="combobox" aria-expanded="true" aria-controls="search-results"
            className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-muted" />
          <kbd className="hidden font-sans text-xs md:inline">Esc</kbd>
        </label>
        <ul id="search-results" role="listbox" className="max-h-[min(60vh,480px)] overflow-y-auto py-1">
          {items === null && <li className="px-4 py-3 text-sm text-muted">Loading your courses…</li>}
          {items && needle && !shown.length && <li className="px-4 py-3 text-sm text-muted">Nothing matches “{q.trim()}”.</li>}
          {items && !needle && <li className="px-4 pt-2 pb-1 text-xs text-muted">Courses</li>}
          {shown.map((i, n) => (
            <li key={i.href + n} role="option" aria-selected={n === sel} onMouseMove={() => setSel(n)} onClick={() => go(i)}
              ref={(el) => { if (n === sel) el?.scrollIntoView({ block: "nearest" }); }}
              className={`mx-1 flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2 ${n === sel ? "bg-subtle" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{i.title}</span>
                {i.subtitle && <span className="block truncate text-xs text-muted">{i.subtitle}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{i.kind}</span>
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
