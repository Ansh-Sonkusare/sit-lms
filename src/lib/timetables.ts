import "server-only";
import { cache } from "react";
import { z } from "zod";
import { cached, clearCache } from "./moodle.ts";
import { store } from "./store.ts";
import { update, type Change, type Doc, type Updated } from "./doc.ts";
import { getTimetableChoice, setTimetableChoice } from "./prefs.ts";
import { getCourses, getSessions } from "./data.ts";
import { coursesOf, fieldErrors, TimetableSchema, type Schedule, type Timetable } from "./sit/timetable.ts";
import { applyDefault, applyDelete, applySave, fail, NO_TIMETABLES, parseShared, savedAt, sharedPath, updateShared, type CollegeTimetables, type SaveResult } from "./sit/shared.ts";
import { rankSchedules, suggestion } from "./sit/suggest.ts";
import { todayIST } from "./format.ts";
import type { User } from "./session.ts";

export type { CollegeTimetables, SaveResult };
export type ScheduleInfo = { schedule: Schedule; chosen: boolean; personal: boolean };

const TTL = 30_000;
const memoKey = (path: string) => `store:${path}`;
const UNAVAILABLE = "Timetables couldn't be loaded. Nothing was changed; try again in a moment.";
const BUSY = "Someone else is changing timetables right now. Nothing was changed; try again.";

// ADMINS="sit-nagpur:1809,other-college:12": college id and Moodle user id, since user ids are per site.
export const isAdmin = (u: User) =>
  !!u.college.sit && (process.env.ADMINS ?? "").split(",").map((s) => s.trim()).includes(`${u.college.id}:${u.userid}`);

// Short-lived per process: other instances see a write within TTL. Callers must not mutate what they get.
// A read that fails twice throws and is not cached, so pages show an error instead of wrong attendance.
const readForPage = (path: string) => store.read(path).catch(() => store.read(path));

export const loadShared = (college: string) =>
  cached(memoKey(sharedPath(college)), TTL, async () => parseShared(college, await readForPage(sharedPath(college)).then((d) => (d ? d.value : undefined))));

async function changeShared<R>(college: string, none: R, apply: (doc: CollegeTimetables) => Change<R>) {
  const r = await updateShared(store, college, none, apply);
  clearCache(memoKey(sharedPath(college)));
  return r;
}

// Every way to follow a shared timetable: one per batch, or one for the whole section when it has no batches.
export const optionsOf = (list: Timetable[]): Schedule[] =>
  list.flatMap((t): Schedule[] => (t.batches.length ? t.batches.map((batch) => ({ timetable: t, batch })) : [{ timetable: t, batch: null }]));

// What this student can choose from: the shared timetables, then their own copy if they have one.
export async function optionsFor(u: User): Promise<Schedule[]> {
  if (!u.college.sit) return [];
  const [doc, personal] = await Promise.all([loadShared(u.college.id), loadPersonal(u.college.id, u.userid)]);
  return optionsOf([...(doc?.list ?? []), ...(personal ? [personal] : [])]);
}

const fits = (t: Timetable, batch: string | null) => (t.batches.length ? batch !== null && t.batches.includes(batch) : batch === null);

// A student's own copy: id "personal", owner set. It no longer follows changes to the one it was copied from.
// Discarding it stores null.
const personalPath = (college: string, userid: number) => `timetables/personal/${college}/${userid}.json`;

function parsePersonal(path: string, cur: Doc | null): Timetable | null {
  if (!cur || cur.value === null) return null;
  const r = TimetableSchema.safeParse(cur.value);
  if (!r.success) console.error(`${path}: unreadable`, r.error.message);
  return r.success ? r.data : null;
}

export const loadPersonal = (college: string, userid: number) => {
  const path = personalPath(college, userid);
  return cached(memoKey(path), TTL, async () => parsePersonal(path, await readForPage(path)));
};

async function updatePersonal<R>(college: string, userid: number, apply: (copy: Timetable | null) => Change<R>): Promise<Updated<R>> {
  const path = personalPath(college, userid);
  const r = await update(store, path, (cur) => apply(parsePersonal(path, cur)));
  clearCache(memoKey(path));
  return r;
}

// Keyed by primitives so every requireUser() in one request shares the result.
const scheduleOf = cache(async (college: string, userid: number): Promise<ScheduleInfo | null> => {
  const doc = await loadShared(college);
  if (!doc) return null;
  const choice = await getTimetableChoice(college, userid);
  const picked = choice?.id === "personal" ? await loadPersonal(college, userid) : doc.list.find((t) => t.id === choice?.id);
  if (choice && picked && fits(picked, choice.batch)) return { schedule: { timetable: picked, batch: choice.batch }, chosen: true, personal: choice.id === "personal" };
  const fallback = doc.list.find((t) => t.id === doc.defaultId)!;
  return { schedule: { timetable: fallback, batch: fallback.batches[0] ?? null }, chosen: false, personal: false };
});

// The timetable this student follows; null where the college has no timetables.
// A choice whose timetable or batch is gone falls back to the default, with chosen false.
export const getSchedule = async (u: User) => (u.college.sit ? scheduleOf(u.college.id, u.userid) : null);

// Which option best matches the attendance the LMS recorded for you; null without enough records.
export async function suggestedOption(u: User, options: Schedule[]): Promise<number | null> {
  if (options.length < 2) return null;
  const enrolled = new Set((await getCourses(u)).map((c) => c.id));
  const ids = [...new Set(options.flatMap((s) => [...coursesOf(s)]))].filter((id) => enrolled.has(id));
  const lists = await Promise.all(ids.map((id) => getSessions(u, id).then((ss) => [id, ss] as const).catch(() => null)));
  return suggestion(rankSchedules(options, new Map(lists.filter((x) => x !== null)), todayIST()));
}

const failure = (r: { reason: "conflict" | "unavailable" }) => (r.reason === "conflict" ? BUSY : UNAVAILABLE);

export async function saveShared(u: User, raw: unknown): Promise<SaveResult> {
  const by = { college: u.college.id, name: u.fullname || undefined, now: new Date().toISOString() };
  const r = await changeShared(u.college.id, fail(NO_TIMETABLES), (doc) => applySave(doc, raw, by));
  return r.ok ? r.result : fail(failure(r));
}

// null when done, else a message for the admin.
export async function deleteShared(u: User, id: string): Promise<string | null> {
  const r = await changeShared<string | null>(u.college.id, NO_TIMETABLES, (doc) => applyDelete(doc, id));
  return r.ok ? r.result : failure(r);
}

export async function setDefault(u: User, id: string): Promise<string | null> {
  const r = await changeShared<string | null>(u.college.id, NO_TIMETABLES, (doc) => applyDefault(doc, id));
  return r.ok ? r.result : failure(r);
}

// Copies the timetable you follow now into your own copy and switches you to it.
// An existing copy is never overwritten: you are switched to it instead.
export async function makePersonal(u: User) {
  const info = await getSchedule(u);
  if (!info || info.personal) return;
  const t = info.schedule.timetable;
  const r = await updatePersonal(u.college.id, u.userid, (existing) => {
    if (existing) return { result: existing };
    const copy: Timetable = { ...t, id: "personal", owner: u.userid, basedOn: t.id, basedOnAt: t.updatedAt, updatedAt: new Date().toISOString(), updatedBy: u.fullname || undefined };
    return { write: copy, result: copy };
  });
  if (!r.ok) throw new Error(`Your copy couldn't be made: ${r.reason}`);
  const batch = fits(r.result, info.schedule.batch) ? info.schedule.batch : (r.result.batches[0] ?? null);
  await setTimetableChoice(u.college.id, u.userid, { id: "personal", batch });
}

// Like saveShared, for the caller's own copy. Owner and origin are kept from the stored copy, never taken from the form.
export async function savePersonal(u: User, raw: unknown): Promise<SaveResult> {
  const input = z.object({ updatedAt: z.string() }).loose().safeParse(raw);
  if (!input.success) return fail("The timetable could not be read. Reload the page.");
  const now = new Date().toISOString();
  const r = await updatePersonal(u.college.id, u.userid, (stored): Change<SaveResult | Timetable> => {
    if (!stored) return { result: fail("You have no copy of your own. Make one from your timetable page.") };
    if (stored.updatedAt !== input.data.updatedAt)
      return { result: fail(`Your copy was saved at ${savedAt(stored.updatedAt)}, after you opened it (maybe in another tab). Reload to see that version; these changes are not saved.`) };
    const parsed = TimetableSchema.safeParse({
      ...(raw as object),
      id: "personal",
      college: u.college.id,
      owner: u.userid,
      basedOn: stored.basedOn,
      basedOnAt: stored.basedOnAt,
      updatedAt: now,
      updatedBy: u.fullname || undefined,
    });
    if (!parsed.success) return { result: { ok: false, errors: fieldErrors(parsed.error) } };
    return { write: parsed.data, result: parsed.data };
  });
  if (!r.ok) return fail(r.reason === "conflict" ? "Your copy is being saved somewhere else right now. Nothing was changed; try again." : UNAVAILABLE);
  if ("ok" in r.result) return r.result;
  const saved = r.result;
  const choice = await getTimetableChoice(u.college.id, u.userid);
  if (choice?.id === "personal" && !fits(saved, choice.batch)) await setTimetableChoice(u.college.id, u.userid, { id: "personal", batch: saved.batches[0] ?? null });
  return { ok: true, id: "personal" };
}

// Deletes your copy. If you were using it, you go back to the timetable it came from when that still exists.
export async function discardPersonal(u: User) {
  const r = await updatePersonal(u.college.id, u.userid, (copy) => (copy ? { write: null, result: copy } : { result: null }));
  if (!r.ok) throw new Error(`Your copy couldn't be deleted: ${r.reason}`);
  const choice = await getTimetableChoice(u.college.id, u.userid);
  if (choice?.id !== "personal") return;
  const source = (await loadShared(u.college.id))?.list.find((t) => t.id === r.result?.basedOn);
  await setTimetableChoice(u.college.id, u.userid, source && fits(source, choice.batch) ? { id: source.id, batch: choice.batch } : null);
}
