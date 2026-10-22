import "server-only";
import { SEED, type Schedule } from "./sit/timetable.ts";
import type { User } from "./session.ts";

export type ScheduleInfo = { schedule: Schedule; chosen: boolean; personal: boolean };

// The timetable this student follows; null where the college has no timetables.
export async function getSchedule(u: User): Promise<ScheduleInfo | null> {
  if (!u.college.sit) return null;
  return { schedule: { timetable: SEED, batch: "B1" }, chosen: false, personal: false };
}
