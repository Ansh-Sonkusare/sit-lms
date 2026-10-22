"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { fieldErrors, TimetableSchema, WEEKDAYS, type Block, type Day, type FieldError, type Timetable } from "@/lib/sit/timetable.ts";

type Row = Block & { key: number };
type Course = { id: number; name: string };
export type EditorAction = (prev: FieldError[] | null, form: FormData) => Promise<FieldError[] | null>;

const INPUT = "h-10 w-full min-w-0 rounded-lg border border-line bg-transparent px-2.5 text-sm text-fg outline-none focus:border-fg";
const LABEL = "block text-[12px] text-muted";
const range = (a: number, b: number) => Array.from({ length: Math.max(b - a + 1, 1) }, (_, i) => a + i);
const addMinutes = (t: string, n: number) => {
  const m = Math.min(Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + n, 23 * 60 + 59);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

const toBlock = (r: Row): Block => ({ day: r.day, slots: r.slots, subject: r.subject, room: r.room, batch: r.batch, course: r.course });

function Errors({ list }: { list: FieldError[] }) {
  if (!list.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-[13px] text-bad">
      {[...new Set(list.map((e) => e.message))].map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

// The whole timetable is edited in the browser and posted as JSON; the server parses it with TimetableSchema again.
export default function TimetableEditor({ initial, courses, action, cancelHref, submitLabel }: { initial: Timetable; courses: Course[]; action: EditorAction; cancelHref: string; submitLabel: string }) {
  const [serverErrors, formAction, pending] = useActionState(action, null);
  const [localErrors, setLocalErrors] = useState<FieldError[] | null>(null);
  const [name, setName] = useState(initial.name);
  const [from, setFrom] = useState(initial.from);
  const [batchText, setBatchText] = useState(initial.batches.join(", "));
  const [slotTimes, setSlotTimes] = useState(initial.slotTimes);
  const [rows, setRows] = useState<Row[]>(() => initial.blocks.map((b, key) => ({ ...b, key })));
  const [typedCourse, setTypedCourse] = useState<Set<number>>(new Set());

  const batches = batchText.split(/[\s,]+/).filter(Boolean);
  const draft: Timetable = { ...initial, name, from, batches, slotTimes, blocks: rows.map(toBlock) };
  const errors = localErrors ?? serverErrors ?? [];
  const at = (prefix: string) => errors.filter((e) => e.path === prefix || e.path.startsWith(`${prefix}.`));
  const shown = ["name", "from", "batches", "slotTimes", "blocks"];
  const general = errors.filter((e) => !shown.some((p) => e.path === p || e.path.startsWith(`${p}.`)));
  const known = new Map(courses.map((c) => [c.id, c.name]));
  for (const r of rows) if (r.course !== null && !known.has(r.course)) known.set(r.course, `Course ${r.course}`);
  const subjects = [...new Set(rows.map((r) => r.subject.trim()).filter(Boolean))].sort();

  const update = (key: number, patch: Partial<Block>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setSubject = (row: Row, subject: string) => {
    const same = rows.find((r) => r.key !== row.key && r.subject.trim() === subject.trim() && subject.trim());
    update(row.key, same ? { subject, course: same.course } : { subject });
  };
  const setSlots = (row: Row, first: number, last: number) => update(row.key, { slots: range(first, Math.max(first, last)) });

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const r = TimetableSchema.safeParse(draft);
        setLocalErrors(r.success ? null : fieldErrors(r.error));
        if (!r.success) e.preventDefault();
      }}
      className="max-w-[1000px]"
    >
      <input type="hidden" name="json" value={JSON.stringify(draft)} />

      {errors.length > 0 && (
        <div className="mb-8 rounded-lg bg-subtle px-3.5 py-3 text-[13px]">
          <p className="font-semibold text-bad">{errors.length === 1 ? "One thing to fix" : `${errors.length} things to fix`} before saving.</p>
          <Errors list={general} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
        <label className={LABEL}>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Semester III · Section A" className={`${INPUT} mt-1.5 placeholder:text-muted`} />
          <Errors list={at("name")} />
        </label>
        <label className={LABEL}>
          Starts on
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${INPUT} mt-1.5`} />
          <Errors list={at("from")} />
        </label>
        <label className={LABEL}>
          Batches
          <input value={batchText} onChange={(e) => setBatchText(e.target.value)} placeholder="B1, B2" className={`${INPUT} mt-1.5 placeholder:text-muted`} />
          <Errors list={at("batches")} />
        </label>
      </div>
      <p className="mt-2 text-[12px] text-muted">Leave Batches empty if the whole section always has the same classes.</p>

      <details className="mt-8" open={at("slotTimes").length > 0 || undefined}>
        <summary className="h2 cursor-pointer">Slot times <span className="text-[13px] font-normal text-muted">{slotTimes.length} slots</span></summary>
        <div className="mt-3 max-w-[420px] space-y-2">
          {slotTimes.map(([start, end], i) => (
            <div key={i}>
              <div className="grid grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-[13px] text-muted">Slot {i + 1}</span>
                <input type="time" aria-label={`Slot ${i + 1} starts`} value={start} onChange={(e) => setSlotTimes((ts) => ts.map((t, j) => (j === i ? [e.target.value, t[1]] : t)))} className={INPUT} />
                <input type="time" aria-label={`Slot ${i + 1} ends`} value={end} onChange={(e) => setSlotTimes((ts) => ts.map((t, j) => (j === i ? [t[0], e.target.value] : t)))} className={INPUT} />
                <button type="button" disabled={i !== slotTimes.length - 1 || slotTimes.length === 1} onClick={() => setSlotTimes((ts) => ts.slice(0, -1))} className="px-2 text-[13px] text-muted hover:text-bad disabled:invisible">
                  Remove
                </button>
              </div>
              <Errors list={at(`slotTimes.${i}`)} />
            </div>
          ))}
          <button type="button" onClick={() => setSlotTimes((ts) => { const end = ts.at(-1)?.[1] ?? "09:00"; return [...ts, [end, addMinutes(end, 50)]]; })} className="btn mt-1">
            Add a slot
          </button>
        </div>
      </details>

      {WEEKDAYS.map((dayName, d) => {
        const day = (d + 1) as Day;
        const dayRows = rows.map((r, index) => ({ r, index })).filter((x) => x.r.day === day);
        return (
          <section key={day} className="mt-10">
            <h2 className="h2">{dayName}</h2>
            <div className="mt-2 hidden grid-cols-[72px_72px_minmax(0,1.3fr)_96px_148px_minmax(0,1fr)_64px] gap-2 text-[12px] text-muted lg:grid">
              <span>From slot</span><span>To slot</span><span>Subject</span><span>Room</span><span>Who</span><span>LMS course</span><span />
            </div>
            <div className="list mt-2">
              {dayRows.map(({ r, index }) => {
                const courseValue = typedCourse.has(r.key) ? "other" : r.course === null ? "" : String(r.course);
                return (
                  <div key={r.key} className="py-3">
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-[72px_72px_minmax(0,1.3fr)_96px_148px_minmax(0,1fr)_64px] lg:items-start">
                      <label className={LABEL}>
                        <span className="lg:sr-only">From slot</span>
                        <select value={r.slots[0]} onChange={(e) => setSlots(r, Number(e.target.value), r.slots.at(-1)!)} className={`${INPUT} mt-1 lg:mt-0`}>
                          {range(1, slotTimes.length).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <label className={LABEL}>
                        <span className="lg:sr-only">To slot</span>
                        <select value={r.slots.at(-1)} onChange={(e) => setSlots(r, r.slots[0], Number(e.target.value))} className={`${INPUT} mt-1 lg:mt-0`}>
                          {range(r.slots[0], slotTimes.length).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </label>
                      <label className={`${LABEL} col-span-2 lg:col-span-1`}>
                        <span className="lg:sr-only">Subject</span>
                        <input value={r.subject} onChange={(e) => setSubject(r, e.target.value)} list="tt-subjects" maxLength={80} className={`${INPUT} mt-1 lg:mt-0`} />
                      </label>
                      <label className={LABEL}>
                        <span className="lg:sr-only">Room</span>
                        <input value={r.room ?? ""} onChange={(e) => update(r.key, { room: e.target.value })} maxLength={40} className={`${INPUT} mt-1 lg:mt-0`} />
                      </label>
                      <label className={LABEL}>
                        <span className="lg:sr-only">Who</span>
                        <select value={r.batch ?? ""} onChange={(e) => update(r.key, { batch: e.target.value || undefined })} className={`${INPUT} mt-1 lg:mt-0`}>
                          <option value="">Whole section</option>
                          {[...new Set([...batches, ...(r.batch ? [r.batch] : [])])].map((b) => <option key={b} value={b}>Batch {b}</option>)}
                        </select>
                      </label>
                      <div className={`${LABEL} col-span-2 lg:col-span-1`}>
                        <label>
                          <span className="lg:sr-only">LMS course</span>
                          <select
                            value={courseValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setTypedCourse((s) => { const n = new Set(s); if (v === "other") n.add(r.key); else n.delete(r.key); return n; });
                              if (v !== "other") update(r.key, { course: v ? Number(v) : null });
                            }}
                            className={`${INPUT} mt-1 lg:mt-0`}
                          >
                            <option value="">No attendance</option>
                            {[...known].sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                            <option value="other">Another course, by id…</option>
                          </select>
                        </label>
                        {typedCourse.has(r.key) && (
                          <input type="number" min={1} inputMode="numeric" aria-label="LMS course id" placeholder="Course id from the LMS address" value={r.course ?? ""} onChange={(e) => update(r.key, { course: e.target.value ? Number(e.target.value) : null })} className={`${INPUT} mt-1.5 placeholder:text-muted`} />
                        )}
                      </div>
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="col-span-2 h-10 justify-self-end px-2 text-[13px] text-muted hover:text-bad lg:col-span-1">
                        Remove
                      </button>
                    </div>
                    <Errors list={at(`blocks.${index}`)} />
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setRows((rs) => [...rs, { key: Math.max(-1, ...rs.map((x) => x.key)) + 1, day, slots: [1], subject: "", course: null }])} className="btn mt-3">
              Add a class on {dayName}
            </button>
          </section>
        );
      })}

      <datalist id="tt-subjects">
        {subjects.map((s) => <option key={s} value={s} />)}
      </datalist>

      <div className="sticky bottom-16 mt-12 flex flex-wrap items-center gap-3 border-t border-line bg-bg py-4 md:bottom-0">
        <button disabled={pending} className="h-11 rounded-lg bg-fg px-6 text-sm font-medium text-bg disabled:opacity-60">{pending ? "Saving…" : submitLabel}</button>
        <Link href={cancelHref} className="btn h-11">Cancel</Link>
        {errors.length > 0 && <span className="text-[13px] text-bad">Fix the problems marked in red.</span>}
      </div>
    </form>
  );
}
