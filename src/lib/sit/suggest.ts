import { TEACHING } from "./calendar.ts";
import { classesOn, daysBetween, type Schedule } from "./timetable.ts";

// Fewer records than this say too little about which timetable you follow.
export const MIN_SESSIONS = 10;

export type Ranked = { index: number; score: number; precision: number };

// How well each option explains the attendance the LMS recorded for you, best first.
// Score: the share of your recorded sessions that land on a class of the option (per course per day).
// Unrecorded classes only break ties: teachers often skip marking, so an option that plans fewer classes must not win for that.
// Only days before `today` count, since today's classes may not be marked yet. Options with too few records in range are left out.
export function rankSchedules(options: Schedule[], sessions: Map<number, { date: string; mark: string }[]>, today: string): Ranked[] {
  const end = today <= TEACHING.end ? today : nextDay(TEACHING.end);
  const ranked = options.flatMap((s, index): Ranked[] => {
    const from = s.timetable.from;
    const recorded = new Map<string, number>();
    let total = 0;
    for (const [course, list] of sessions)
      for (const r of list)
        if (r.date >= from && r.date < end) {
          const key = `${course}|${r.date}`;
          recorded.set(key, (recorded.get(key) ?? 0) + 1);
          total++;
        }
    if (total < MIN_SESSIONS) return [];

    const expected = new Map<string, number>();
    let planned = 0;
    for (const d of daysBetween(from, end).filter((d) => d < end))
      for (const c of classesOn(s, d))
        if (c.courseid) {
          const key = `${c.courseid}|${d}`;
          expected.set(key, (expected.get(key) ?? 0) + c.slots);
          planned += c.slots;
        }
    let matched = 0;
    for (const [key, n] of expected) matched += Math.min(n, recorded.get(key) ?? 0);
    return [{ index, score: matched / total, precision: planned ? matched / planned : 0 }];
  });
  return ranked.sort((a, b) => b.score - a.score || b.precision - a.precision || a.index - b.index);
}

// The option to badge "Suggested": a clear best with some agreement, or none.
export function suggestion(ranked: Ranked[]): number | null {
  const [best, next] = ranked;
  return best && best.score > 0 && (!next || best.score > next.score || best.precision > next.precision) ? best.index : null;
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
