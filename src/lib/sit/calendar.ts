// SIT Nagpur academic calendar, odd semester 2026-27 (semester III).
export type CalEvent = { name: string; kind: "Holiday" | "Assessment" | "Exam" | "Activity" | "Break"; start: string; end: string };

export const TEACHING = { start: "2026-07-01", end: "2026-11-05" };

const one = (name: string, kind: CalEvent["kind"], start: string, end = start): CalEvent => ({ name, kind, start, end });

export const HOLIDAYS: CalEvent[] = [
  one("Independence Day", "Holiday", "2026-08-15"),
  one("Eid-e-Milad", "Holiday", "2026-08-26"),
  one("Rakshabandhan", "Holiday", "2026-08-28"),
  one("Ganesh Chaturthi", "Holiday", "2026-09-14"),
  one("Anant Chaturdashi", "Holiday", "2026-09-25"),
  one("Gandhi Jayanti", "Holiday", "2026-10-02"),
  one("Dussehra", "Holiday", "2026-10-20"),
  one("Diwali", "Holiday", "2026-11-06", "2026-11-11"),
  one("Christmas", "Holiday", "2026-12-25"),
];

export const EVENTS: CalEvent[] = [
  ...HOLIDAYS,
  one("Orientation and start of semester", "Activity", "2026-07-01"),
  one("CA1", "Assessment", "2026-07-29", "2026-07-31"),
  one("Open House", "Activity", "2026-08-06"),
  one("CA1 / CA2 mid-semester exam", "Assessment", "2026-08-20", "2026-08-22"),
  one("Mid-semester feedback", "Activity", "2026-08-26", "2026-08-30"),
  one("CA2 / CA3", "Assessment", "2026-09-23", "2026-09-26"),
  one("Sports Day", "Activity", "2026-10-09", "2026-10-10"),
  one("CA4", "Assessment", "2026-10-22", "2026-10-24"),
  one("Last teaching day", "Activity", TEACHING.end),
  one("Practical end-semester exams and feedback", "Exam", "2026-11-12", "2026-11-17"),
  one("Preparation leave", "Break", "2026-11-18", "2026-11-24"),
  one("End-semester exams", "Exam", "2026-11-25", "2026-12-17"),
  one("Semester break", "Break", "2026-12-18", "2026-12-31"),
  one("Semester IV begins", "Activity", "2027-01-01"),
].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

export const holidayOn = (iso: string) => HOLIDAYS.find((h) => h.start <= iso && iso <= h.end);

// Regular timetable runs only inside the teaching period, minus holidays (Sundays have no timetable).
export const isTeachingDay = (iso: string) => TEACHING.start <= iso && iso <= TEACHING.end && !holidayOn(iso);

export const upcoming = (today: string, n = 5) => EVENTS.filter((e) => e.end >= today).slice(0, n);
