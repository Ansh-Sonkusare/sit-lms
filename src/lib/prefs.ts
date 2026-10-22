import { getIronSession } from "iron-session";
import { cookies } from "next/headers";

import type { Leave } from "./sit/timetable.ts";
export type { Leave };

type Prefs = { leaves?: Leave[]; extraCourses?: number[]; doneUpdates?: number[] };

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
