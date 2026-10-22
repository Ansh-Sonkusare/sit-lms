import "server-only";
import { after } from "next/server";
import { store } from "./store.ts";
import { createDigest, type Cached, type Digest } from "./digest-core.ts";
import { cacheKey, type Announcement, type Course } from "./data.ts";
import type { User } from "./session.ts";
import { getSchedule } from "./timetables.ts";
import { scheduleLabel } from "./sit/timetable.ts";

export type { Digest, DigestItem } from "./digest-core.ts";

const digest = createDigest({ store, now: Date.now, userKey: cacheKey });

// Pages call this: cached digest now, and a background refresh after the response if anything is missing.
export async function getDigest(u: User, news: Announcement[], courses: Course[]): Promise<Digest> {
  const none: Cached = { items: new Map(), pending: 0, updatedAt: null, needs: [] };
  const d = await digest.read(u, news).catch(() => none);
  const paused = await digest.paused();
  if (await digest.due(d)) {
    // read the timetable now: the background refresh runs after the response, without the request's cookies
    const info = await getSchedule(u).catch(() => null);
    after(() => digest.refresh(u, news, courses, info ? scheduleLabel(info.schedule) : null).catch((e) => console.error("[digest]", e)));
  }
  return { items: d.items, pending: d.needs.filter((a) => !d.items.has(a.id)).length, updatedAt: d.updatedAt, paused };
}
