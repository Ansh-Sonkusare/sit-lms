import { z } from "zod";
import { isTeachingDay, TEACHING } from "./calendar.ts";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export type Day = 1 | 2 | 3 | 4 | 5 | 6;

// slots: 1-based and consecutive. batch undefined = the whole section.
// course: the LMS course the LMS records this class's attendance under; null = no attendance (sports, wellness).
export type Block = { day: Day; slots: number[]; subject: string; room?: string; batch?: string; course: number | null };

// owner: set on a student's personal copy. basedOn / basedOnAt: the timetable it was copied from, and that one's updatedAt then.
export type Timetable = {
  id: string;
  college: string;
  name: string;
  from: string;
  batches: string[];
  slotTimes: [string, string][];
  blocks: Block[];
  updatedAt: string;
  updatedBy?: string;
  owner?: number;
  basedOn?: string;
  basedOnAt?: string;
};

// batch null: only whole-section classes (a timetable without batches).
export type Schedule = { timetable: Timetable; batch: string | null };

// "personal" names the student's own copy in the choice cookie; "new" is the create route.
export const RESERVED_IDS = ["personal", "new"];
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:05.");
const text = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`);

const BlockSchema = z.object({
  day: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  slots: z.array(z.number().int()).min(1, "Pick the slots."),
  subject: text(80).min(1, "Enter a subject."),
  room: text(40).optional().transform((r) => r || undefined),
  batch: z.string().optional().transform((b) => b || undefined),
  course: z.number().int().positive().nullable(),
});

const overlaps = (a: Block, b: Block) => a.day === b.day && a.slots.some((s) => b.slots.includes(s)) && (!a.batch || !b.batch || a.batch === b.batch);

export const TimetableSchema = z
  .object({
    id: z.string().regex(SLUG, "Use lowercase letters, digits and dashes."),
    college: z.string().regex(SLUG),
    name: text(80).min(1, "Enter a name."),
    from: z.string().refine(isDate, "Pick the date this timetable starts."),
    batches: z.array(z.string().trim().regex(/^[A-Za-z0-9-]{1,12}$/, "A batch name is letters and digits, like B1.")).max(12),
    slotTimes: z.array(z.tuple([HHMM, HHMM])).min(1, "Add at least one slot.").max(14),
    blocks: z.array(BlockSchema).max(300),
    updatedAt: z.string(),
    updatedBy: z.string().optional(),
    owner: z.number().int().optional(),
    basedOn: z.string().optional(),
    basedOnAt: z.string().optional(),
  })
  .superRefine((t, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (new Set(t.batches).size !== t.batches.length) issue(["batches"], "Each batch name must be different.");
    t.slotTimes.forEach(([a, b], i) => {
      if (a >= b) issue(["slotTimes", i], `Slot ${i + 1} ends before it starts.`);
      else if (i > 0 && a < t.slotTimes[i - 1][1]) issue(["slotTimes", i], `Slot ${i + 1} starts before slot ${i} ends.`);
    });
    t.blocks.forEach((b, i) => {
      if (b.slots.some((s) => s < 1 || s > t.slotTimes.length)) issue(["blocks", i, "slots"], `There are only ${t.slotTimes.length} slots.`);
      else if (b.slots.some((s, j) => j > 0 && s !== b.slots[j - 1] + 1)) issue(["blocks", i, "slots"], "The slots must follow each other.");
      if (b.batch && !t.batches.includes(b.batch)) issue(["blocks", i, "batch"], `There is no batch ${b.batch}.`);
      const clash = t.blocks.findIndex((o, j) => j < i && overlaps(o, b));
      if (clash >= 0) issue(["blocks", i, "slots"], `Overlaps ${t.blocks[clash].subject} for ${b.batch && t.blocks[clash].batch ? `batch ${b.batch}` : "the same students"}.`);
    });
  }) satisfies z.ZodType<Timetable, unknown>;

// A validation message for the editor; path like "blocks.3.slots" or "" for the whole timetable.
export type FieldError = { path: string; message: string };
export const fieldErrors = (e: z.ZodError): FieldError[] => e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "") || "timetable";

// "Semester III · Section B, batch B1"
export const scheduleLabel = (s: Schedule) => (s.batch ? `${s.timetable.name}, batch ${s.batch}` : s.timetable.name);

// Semester III, Section B (effective 2026-09-15), converted from the timetable this app first shipped with.
export const SEED: Timetable = {
  id: "sem3-sec-b",
  college: "sit-nagpur",
  name: "Semester III · Section B",
  from: "2026-09-15",
  batches: ["B1", "B2"],
  slotTimes: [
    ["09:05", "09:55"], ["09:55", "10:45"], ["10:50", "11:40"], ["11:40", "12:30"], ["12:30", "13:20"],
    ["13:20", "14:10"], ["14:10", "15:00"], ["15:00", "15:50"], ["15:55", "16:45"],
  ],
  updatedAt: "2026-09-15T00:00:00.000Z",
  blocks: [
    { day: 1, slots: [1], subject: "CO", room: "CL-102", course: 486 },
    { day: 1, slots: [2, 3], subject: "Project Based Learning", course: 565 },
    { day: 1, slots: [4], subject: "AR-III Test", room: "LAB 2", course: 508 },
    { day: 1, slots: [6], subject: "ML", room: "CL-102", course: 555 },
    { day: 1, slots: [7], subject: "Flexi Credit", course: 505 },
    { day: 1, slots: [8], subject: "AR-III", room: "LAB 2", course: 508 },
    // The LMS never records this slot under DAA Lab (504). Every Monday has one record under DAA (487) instead.
    { day: 1, slots: [9], subject: "DAA Lab", room: "LAB 2", course: 487 },
    { day: 2, slots: [1], subject: "MAS", room: "CL-102", course: 488 },
    { day: 2, slots: [2], subject: "DMGT Tutorial", room: "CL-102", course: 507 },
    { day: 2, slots: [3], subject: "DAA", room: "CL-102", course: 487 },
    { day: 2, slots: [4], subject: "DMGT Tutorial", batch: "B2", course: 507 },
    { day: 2, slots: [6], subject: "Entrepreneurship Venture", room: "CL-102", course: 490 },
    { day: 2, slots: [7], subject: "GDJV", room: "S-01", course: 561 },
    { day: 2, slots: [8], subject: "ICS", room: "CL-102", course: 491 },
    { day: 2, slots: [9], subject: "SEC Technical Test", room: "LAB 5", course: 559 },
    { day: 3, slots: [1], subject: "DMGT", room: "CL-102", course: 489 },
    { day: 3, slots: [2, 3], subject: "Hack-O-Week", course: 560 },
    { day: 3, slots: [4], subject: "MAS", room: "CL-102", course: 488 },
    { day: 3, slots: [6, 7], subject: "SEC Technical", room: "LAB 5", course: 559 },
    { day: 3, slots: [8], subject: "CO", room: "CL-102", course: 486 },
    { day: 3, slots: [9], subject: "NPTEL FOE", course: 493 },
    { day: 4, slots: [1], subject: "DMGT", room: "CL-102", course: 489 },
    { day: 4, slots: [2], subject: "CO", room: "CL-102", course: 486 },
    { day: 4, slots: [3, 4], subject: "DAA Lab", room: "LAB 1", batch: "B1", course: 504 },
    { day: 4, slots: [6], subject: "Flexi Credit", room: "CL-102", course: 505 },
    { day: 4, slots: [7], subject: "ICS", room: "CL-102", course: 491 },
    { day: 4, slots: [8, 9], subject: "Sports / SRC / EDC / Innovation / Library", course: null },
    { day: 5, slots: [1], subject: "DAA", room: "CL-102", course: 487 },
    { day: 5, slots: [2], subject: "ML", room: "CL-102", course: 555 },
    { day: 5, slots: [3], subject: "Flexi Credit", room: "CL-102", course: 505 },
    { day: 5, slots: [4], subject: "Mentor-Mentee Session", course: 563 },
    { day: 5, slots: [6, 7], subject: "DAA Lab", room: "LAB 1", batch: "B1", course: 504 },
    { day: 5, slots: [8, 9], subject: "Health & Wellness", course: null },
  ],
};

export type ClassBlock = { subject: string; courseid: number | null; start: string; end: string; room?: string; slots: number };

const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

// The blocks this schedule's batch attends, in slot order.
export const blocksFor = (s: Schedule, day?: number) =>
  s.timetable.blocks.filter((b) => (day === undefined || b.day === day) && (!b.batch || b.batch === s.batch)).sort((a, b) => a.day - b.day || a.slots[0] - b.slots[0]);

export function classesOn(s: Schedule, iso: string): ClassBlock[] {
  if (!isTeachingDay(iso)) return [];
  const times = s.timetable.slotTimes;
  return blocksFor(s, weekday(iso)).map((b) => ({
    subject: b.subject,
    courseid: b.course,
    slots: b.slots.length,
    start: times[b.slots[0] - 1][0],
    end: times[b.slots.at(-1)! - 1][1],
    room: b.room,
  }));
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end && out.length < 400; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// The LMS records one attendance session per timetable slot, so a two-slot block counts twice.
export function missedByCourse(s: Schedule, days: string[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const day of days) for (const c of classesOn(s, day)) if (c.courseid) out.set(c.courseid, (out.get(c.courseid) ?? 0) + c.slots);
  return out;
}

// Courses that appear in the schedule at all; for others the number of classes left is unknown.
export const coursesOf = (s: Schedule) => new Set(blocksFor(s).flatMap((b) => (b.course ? [b.course] : [])));

// Classes still to come per course, from the day after `today` to the last teaching day.
export function remainingByCourse(s: Schedule, today: string): Map<number, number> {
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const from = next.toISOString().slice(0, 10);
  return from > TEACHING.end ? new Map() : missedByCourse(s, daysBetween(from, TEACHING.end));
}

export type Leave = { id: string; from: string; to: string; note: string; accepted: boolean };

// The first day from `today` (inclusive) with classes, within two weeks; null once teaching is over.
export function nextClassDay(s: Schedule, today: string): string | null {
  return daysBetween(today, TEACHING.end).slice(0, 14).find((d) => classesOn(s, d).length > 0) ?? null;
}
