import { TEACHING } from "./calendar.ts";
import { classesOn, coursesOf, daysBetween, type ClassBlock, type Leave, type Schedule } from "./timetable.ts";

// A session the LMS recorded. `leave`: an absence turned into present by accepted leave.
export type Rec = { date: string; mark: string; leave?: boolean };
// class: on a date the timetable has this course. moved: paired with an unrecorded class on classDate.
// extra: no class to pair with. untracked: before the timetable starts (or a course outside it), nothing to compare.
export type RecordMatch = "class" | "moved" | "extra" | "untracked";
export type MarkedSession = Rec & { match: RecordMatch; classDate?: string };
export type MissingClass = { date: string; count: number; pending: boolean }; // pending: date === today
export type CourseMarks = { sessions: MarkedSession[]; missing: MissingClass[] };

const PAIR_WITHIN_DAYS = 3;
const gap = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));
const isPresent = (r: Rec) => r.mark === "P";

// `leaves` must already be filtered to accepted leave.
export const applyLeave = (sessions: { date: string; mark: string }[], leaves: Leave[]): Rec[] =>
  sessions.map((s) => (s.mark === "A" && leaves.some((l) => l.from <= s.date && s.date <= l.to) ? { date: s.date, mark: "P", leave: true } : { date: s.date, mark: s.mark }));

// Compare what the LMS recorded for one course against the timetable, slot by slot.
// Records stay on their LMS date; pairing only labels them with the class they most likely belong to.
export function reconcile(schedule: Schedule, courseid: number, recs: Rec[], today: string): CourseMarks {
  const sorted = [...recs].sort((a, b) => a.date.localeCompare(b.date));
  const sessions: MarkedSession[] = [];
  const start = schedule.timetable.from;
  if (!coursesOf(schedule).has(courseid)) return { sessions: sorted.map((r) => ({ ...r, match: "untracked" })), missing: [] };

  const last = today < TEACHING.end ? today : TEACHING.end;
  const slotsOn = new Map<string, number>();
  if (last >= start)
    for (const d of daysBetween(start, last)) {
      const n = classesOn(schedule, d).reduce((s, c) => (c.courseid === courseid ? s + c.slots : s), 0);
      if (n) slotsOn.set(d, n);
    }

  const byDate = new Map<string, Rec[]>();
  for (const r of sorted) {
    if (r.date < start) sessions.push({ ...r, match: "untracked" });
    else if (r.date > last) sessions.push({ ...r, match: "extra" });
    else byDate.set(r.date, [...(byDate.get(r.date) ?? []), r]);
  }

  const leftRecs: Rec[] = [];
  for (const [date, rs] of byDate) {
    const n = slotsOn.get(date) ?? 0;
    rs.forEach((r, i) => (i < n ? sessions.push({ ...r, match: "class" }) : leftRecs.push(r)));
    if (n) slotsOn.set(date, Math.max(n - rs.length, 0));
  }
  const leftSlots = [...slotsOn].flatMap(([date, n]) => Array.from({ length: n }, () => date));

  const pairs = leftRecs.flatMap((r, ri) => leftSlots.map((d, si) => ({ ri, si, dist: gap(r.date, d) })).filter((p) => p.dist <= PAIR_WITHIN_DAYS));
  pairs.sort((a, b) => a.dist - b.dist || a.ri - b.ri || a.si - b.si);
  const recDone = new Set<number>();
  const slotDone = new Set<number>();
  for (const p of pairs) {
    if (recDone.has(p.ri) || slotDone.has(p.si)) continue;
    recDone.add(p.ri);
    slotDone.add(p.si);
    sessions.push({ ...leftRecs[p.ri], match: "moved", classDate: leftSlots[p.si] });
  }
  leftRecs.forEach((r, i) => recDone.has(i) || sessions.push({ ...r, match: "extra" }));

  const missingOn = new Map<string, number>();
  leftSlots.forEach((d, i) => slotDone.has(i) || missingOn.set(d, (missingOn.get(d) ?? 0) + 1));
  const missing = [...missingOn].map(([date, count]) => ({ date, count, pending: date === today }));
  return { sessions: sessions.sort((a, b) => a.date.localeCompare(b.date)), missing };
}

export type SlotStatus =
  | { kind: "marked"; mark: string; leave: boolean }
  | { kind: "moved"; mark: string; leave: boolean; recordedOn: string }
  | { kind: "missing"; pending: boolean }
  | { kind: "upcoming" };
export type DayClass = ClassBlock & { statuses: SlotStatus[] };
export type DayRecord = { courseid: number; mark: string; leave: boolean; match: RecordMatch; classDate?: string };
// `tracked` is false before the timetable's first day: no classes to compare, only what the LMS recorded.
export type DayView = { tracked: boolean; classes: DayClass[]; others: DayRecord[] };

export function dayClasses(schedule: Schedule, date: string, marks: Map<number, CourseMarks>, today: string): DayView {
  const tracked = date >= schedule.timetable.from;
  const others = [...marks].flatMap(([courseid, m]) =>
    m.sessions.filter((s) => s.date === date && s.match !== "class").map((s) => ({ courseid, mark: s.mark, leave: !!s.leave, match: s.match, classDate: s.classDate })),
  );
  if (!tracked) return { tracked, classes: [], others };

  const pools = new Map<number, SlotStatus[]>();
  const poolOf = (id: number): SlotStatus[] => {
    const m = marks.get(id);
    if (!m) return [];
    const mine = m.sessions.flatMap((s): SlotStatus[] =>
      s.match === "class" && s.date === date
        ? [{ kind: "marked", mark: s.mark, leave: !!s.leave }]
        : s.match === "moved" && s.classDate === date
          ? [{ kind: "moved", mark: s.mark, leave: !!s.leave, recordedOn: s.date }]
          : [],
    );
    const miss = m.missing.find((x) => x.date === date);
    for (let i = 0; i < (miss?.count ?? 0); i++) mine.push({ kind: "missing", pending: miss!.pending });
    return mine;
  };
  const classes = classesOn(schedule, date).map((c): DayClass => {
    if (c.courseid === null) return { ...c, statuses: [] };
    if (date > today) return { ...c, statuses: Array.from({ length: c.slots }, (): SlotStatus => ({ kind: "upcoming" })) };
    if (!pools.has(c.courseid)) pools.set(c.courseid, poolOf(c.courseid));
    return { ...c, statuses: pools.get(c.courseid)!.splice(0, c.slots) };
  });
  return { tracked, classes, others };
}

export type Tone = "ok" | "bad" | "quiet";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Tue 15 Sep"
export const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
};

const word = (mark: string, leave: boolean) => (mark === "P" ? (leave ? "Present (leave)" : "Present") : "Absent");

// One line for a class block: "Present", "Present, recorded Wed 16 Sep", "2 of 2 present", "Not marked yet".
export function statusLine(statuses: SlotStatus[]): { text: string; tone: Tone } | null {
  const n = statuses.length;
  if (!n) return null;
  const marked = statuses.filter((s) => s.kind === "marked" || s.kind === "moved");
  const present = marked.filter((s) => s.mark === "P").length;
  const absent = marked.length - present;
  const missing = statuses.filter((s) => s.kind === "missing");
  const moved = statuses.find((s) => s.kind === "moved");
  const suffix = moved ? `, recorded ${dayLabel(moved.recordedOn)}` : "";
  const tone: Tone = absent ? "bad" : missing.length || !marked.length ? "quiet" : "ok";
  const pending = missing.some((s) => s.pending);
  if (n === 1) {
    const s = statuses[0];
    if (s.kind === "upcoming") return { text: "Upcoming", tone };
    if (s.kind === "missing") return { text: s.pending ? "Not marked yet" : "Not marked", tone };
    return { text: word(s.mark, s.leave) + suffix, tone };
  }
  if (statuses.every((s) => s.kind === "upcoming")) return { text: "Upcoming", tone };
  if (missing.length === n) return { text: pending ? "Not marked yet" : "Not marked", tone };
  if (present === n) return { text: `${n} of ${n} present${suffix}`, tone };
  if (absent === n) return { text: `${n} of ${n} absent${suffix}`, tone };
  const parts = [present && `${present} present`, absent && `${absent} absent`, missing.length && `${missing.length} ${pending ? "not marked yet" : "not marked"}`].filter(Boolean);
  return { text: parts.join(", ") + suffix, tone };
}

// Calendar marks: one per recorded session or missing class, placed on the LMS date.
export type Dot = { state: "present" | "absent" | "missing" | "pending"; flag?: "moved" | "extra"; text: string };

export function dotsByDay(all: Iterable<CourseMarks>): Map<string, Dot[]> {
  const out = new Map<string, Dot[]>();
  const add = (date: string, d: Dot) => out.set(date, [...(out.get(date) ?? []), d]);
  for (const m of all) {
    for (const s of m.sessions) {
      const text = (isPresent(s) ? (s.leave ? "present (leave)" : "present") : "absent") + (s.match === "moved" ? ` (for the ${dayLabel(s.classDate!)} class)` : s.match === "extra" ? " (no class that day in your timetable)" : "");
      add(s.date, { state: isPresent(s) ? "present" : "absent", flag: s.match === "moved" ? "moved" : s.match === "extra" ? "extra" : undefined, text });
    }
    for (const x of m.missing) for (let i = 0; i < x.count; i++) add(x.date, { state: x.pending ? "pending" : "missing", text: x.pending ? "not marked yet" : "not marked" });
  }
  return out;
}
