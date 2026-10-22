import { isTeachingDay, TEACHING } from "./calendar.ts";

// Section B, batch B1, semester III timetable (effective 2026-09-15).
export const TIMETABLE_FROM = "2026-09-15";
const BATCH = "B1";

export const SLOT_TIMES: Record<number, [string, string]> = {
  1: ["09:05", "09:55"], 2: ["09:55", "10:45"], 3: ["10:50", "11:40"], 4: ["11:40", "12:30"], 5: ["12:30", "13:20"],
  6: ["13:20", "14:10"], 7: ["14:10", "15:00"], 8: ["15:00", "15:50"], 9: ["15:55", "16:45"],
};

type Entry = { subject: string; slots: number[]; room?: string; batch?: string; applicable?: boolean; marksAs?: string };

const WEEK: Entry[][] = [
  [], // sunday
  [
    { subject: "CO", slots: [1], room: "CL-102" },
    { subject: "Project Based Learning", slots: [2, 3] },
    { subject: "AR-III Test", slots: [4], room: "LAB 2" },
    { subject: "Lunch", slots: [5] },
    { subject: "ML", slots: [6], room: "CL-102" },
    { subject: "Flexi Credit", slots: [7] },
    { subject: "AR-III", slots: [8], room: "LAB 2" },
    // The LMS never records this slot under DAA Lab (504). Every Monday has one record under DAA (487) instead.
    { subject: "DAA Lab", slots: [9], room: "LAB 2", marksAs: "DAA" },
  ],
  [
    { subject: "MAS", slots: [1], room: "CL-102" },
    { subject: "DMGT Tutorial", slots: [2], room: "CL-102" },
    { subject: "DAA", slots: [3], room: "CL-102" },
    { subject: "DMGT Tutorial", slots: [4], batch: "B2", applicable: false },
    { subject: "Lunch", slots: [5] },
    { subject: "Entrepreneurship Venture", slots: [6], room: "CL-102" },
    { subject: "GDJV", slots: [7], room: "S-01" },
    { subject: "ICS", slots: [8], room: "CL-102" },
    { subject: "SEC Technical Test", slots: [9], room: "LAB 5" },
  ],
  [
    { subject: "DMGT", slots: [1], room: "CL-102" },
    { subject: "Hack-O-Week", slots: [2, 3] },
    { subject: "MAS", slots: [4], room: "CL-102" },
    { subject: "Lunch", slots: [5] },
    { subject: "SEC Technical", slots: [6, 7], room: "LAB 5" },
    { subject: "CO", slots: [8], room: "CL-102" },
    { subject: "NPTEL FOE", slots: [9] },
  ],
  [
    { subject: "DMGT", slots: [1], room: "CL-102" },
    { subject: "CO", slots: [2], room: "CL-102" },
    { subject: "DAA Lab", slots: [3, 4], room: "LAB 1", batch: "B1" },
    { subject: "Lunch", slots: [5] },
    { subject: "Flexi Credit", slots: [6], room: "CL-102" },
    { subject: "ICS", slots: [7], room: "CL-102" },
    { subject: "Sports / SRC / EDC / Innovation / Library", slots: [8, 9] },
  ],
  [
    { subject: "DAA", slots: [1], room: "CL-102" },
    { subject: "ML", slots: [2], room: "CL-102" },
    { subject: "Flexi Credit", slots: [3], room: "CL-102" },
    { subject: "Mentor-Mentee Session", slots: [4] },
    { subject: "Lunch", slots: [5] },
    { subject: "DAA Lab", slots: [6, 7], room: "LAB 1", batch: "B1" },
    { subject: "Health & Wellness", slots: [8, 9] },
  ],
  [], // saturday
];

// Timetable subject → LMS course id. Subjects without attendance (lunch, sports, wellness) are absent.
export const SUBJECT_COURSE: Record<string, number> = {
  CO: 486,
  "Project Based Learning": 565,
  "Hack-O-Week": 560,
  "AR-III": 508,
  "AR-III Test": 508,
  ML: 555,
  "Flexi Credit": 505,
  "DAA Lab": 504,
  DAA: 487,
  MAS: 488,
  "DMGT Tutorial": 507,
  DMGT: 489,
  "Entrepreneurship Venture": 490,
  GDJV: 561,
  ICS: 491,
  "SEC Technical": 559,
  "SEC Technical Test": 559,
  "NPTEL FOE": 493,
  "Mentor-Mentee Session": 563,
};

export type ClassBlock = { subject: string; courseid: number | null; start: string; end: string; room?: string; slots: number };

const weekday = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

export function classesOn(iso: string): ClassBlock[] {
  if (!isTeachingDay(iso)) return [];
  return WEEK[weekday(iso)]
    .filter((e) => e.applicable !== false && (!e.batch || e.batch === BATCH) && e.subject !== "Lunch")
    .map((e) => ({
      subject: e.subject,
      courseid: SUBJECT_COURSE[e.marksAs ?? e.subject] ?? null,
      slots: e.slots.length,
      start: SLOT_TIMES[e.slots[0]][0],
      end: SLOT_TIMES[e.slots.at(-1)!][1],
      room: e.room,
    }));
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end && out.length < 120; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

// The LMS records one attendance session per timetable slot, so a two-slot block counts twice.
export function missedByCourse(days: string[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const day of days) for (const c of classesOn(day)) if (c.courseid) out.set(c.courseid, (out.get(c.courseid) ?? 0) + c.slots);
  return out;
}

// Courses that appear in the timetable at all; for others the number of classes left is unknown.
export const TIMETABLED = new Set(Object.values(SUBJECT_COURSE));

// Classes still to come per course, from the day after `today` to the last teaching day.
export function remainingByCourse(today: string): Map<number, number> {
  const next = new Date(`${today}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const from = next.toISOString().slice(0, 10);
  return from > TEACHING.end ? new Map() : missedByCourse(daysBetween(from, TEACHING.end));
}

export type Leave = { id: string; from: string; to: string; note: string; accepted: boolean };

// The first day from `today` (inclusive) with classes, within two weeks; null once teaching is over.
export function nextClassDay(today: string): string | null {
  return daysBetween(today, TEACHING.end).slice(0, 14).find((d) => classesOn(d).length > 0) ?? null;
}
