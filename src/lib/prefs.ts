import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

import type { Leave } from "./sit/timetable.ts";
export type { Leave };

// timetable: the one you picked; id "personal" is your own copy. Absent: the college default.
// owner "<college id>:<user id>": the cookie outlives sign-out, so another account on this browser must not inherit the pick.
export type TimetableChoice = { id: string; batch: string | null };
type Prefs = { leaves?: Leave[]; extraCourses?: number[]; doneUpdates?: number[]; timetable?: TimetableChoice & { owner?: string } };

// Its own long-lived cookie (name kept from when it only held leaves), so signing out doesn't wipe it.
// ponytail: cookie-sized (~40 leaves); move to a server store if it outgrows that.
async function store() {
  return getIronSession<Prefs>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "sitlms_leaves",
    ttl: 60 * 60 * 24 * 365,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  });
}

export async function getLeaves(): Promise<Leave[]> {
  return (await store()).leaves ?? [];
}

export async function saveLeaves(leaves: Leave[]) {
  const s = await store();
  s.leaves = leaves.slice(-40).sort((a, b) => a.from.localeCompare(b.from));
  await s.save();
}

// Courses outside the timetable that you chose to keep in your list.
export async function getExtraCourses(): Promise<number[]> {
  return (await store()).extraCourses ?? [];
}

export async function setExtraCourse(id: number, on: boolean) {
  const s = await store();
  const set = new Set(s.extraCourses ?? []);
  if (on) set.add(id);
  else set.delete(id);
  s.extraCourses = [...set].slice(-50);
  await s.save();
}

// Announcements you've ticked off on the Updates dashboard.
export async function getDoneUpdates(): Promise<number[]> {
  return (await store()).doneUpdates ?? [];
}

export async function setUpdateDone(id: number, done: boolean) {
  const s = await store();
  const set = new Set(s.doneUpdates ?? []);
  if (done) set.add(id);
  else set.delete(id);
  s.doneUpdates = [...set].slice(-150);
  await s.save();
}

const ownerOf = (college: string, userid: number) => `${college}:${userid}`;

export async function getTimetableChoice(college: string, userid: number): Promise<TimetableChoice | null> {
  const t = (await store()).timetable;
  return t && t.owner === ownerOf(college, userid) ? { id: t.id, batch: t.batch } : null;
}

export async function setTimetableChoice(college: string, userid: number, choice: TimetableChoice | null) {
  const s = await store();
  if (choice) s.timetable = { ...choice, owner: ownerOf(college, userid) };
  else delete s.timetable;
  await s.save();
}
