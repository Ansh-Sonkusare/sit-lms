import "server-only";
import { cache } from "react";
import { z } from "zod";
import { cached, clearCache } from "./moodle.ts";
import { readJson, writeJson } from "./store.ts";
import { getTimetableChoice, setTimetableChoice } from "./prefs.ts";
import { getCourses, getSessions } from "./data.ts";
import { coursesOf, fieldErrors, RESERVED_IDS, SEED, slugify, TimetableSchema, type FieldError, type Schedule, type Timetable } from "./sit/timetable.ts";
import { rankSchedules, suggestion } from "./sit/suggest.ts";
import { todayIST } from "./format.ts";
import type { User } from "./session.ts";

// One document per college: every shared timetable plus the one students get until they choose.
export type CollegeTimetables = { defaultId: string; list: Timetable[] };
export type ScheduleInfo = { schedule: Schedule; chosen: boolean; personal: boolean };

const TTL = 30_000;
const sharedPath = (college: string) => `timetables/${college}.json`;
const memoKey = (path: string) => `store:${path}`;

// ADMINS="sit-nagpur:1809,other-college:12": college id and Moodle user id, since user ids are per site.
export const isAdmin = (u: User) =>
  !!u.college.sit && (process.env.ADMINS ?? "").split(",").map((s) => s.trim()).includes(`${u.college.id}:${u.userid}`);

function parseShared(college: string, raw: unknown): CollegeTimetables | null {
  if (raw === null) return college === SEED.college ? { defaultId: SEED.id, list: [SEED] } : null;
  const doc = z.object({ defaultId: z.string(), list: z.array(z.unknown()) }).safeParse(raw);
  if (!doc.success) {
    console.error(`${sharedPath(college)}: unreadable`, doc.error.message);
    return null;
  }
  const list = doc.data.list.flatMap((t) => {
    const r = TimetableSchema.safeParse(t);
    if (!r.success) console.error(`${sharedPath(college)}: dropped a timetable`, r.error.message);
    return r.success ? [r.data] : [];
  });
  return list.length ? { defaultId: list.some((t) => t.id === doc.data.defaultId) ? doc.data.defaultId : list[0].id, list } : null;
}

// Short-lived per process: other instances see a write within TTL. Callers must not mutate what they get.
export const loadShared = (college: string) =>
  cached(memoKey(sharedPath(college)), TTL, async () => parseShared(college, await readJson(sharedPath(college))));

async function writeShared(college: string, doc: CollegeTimetables) {
  await writeJson(sharedPath(college), doc);
  clearCache(memoKey(sharedPath(college)));
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

const fits =(t: Timetable, batch: string | null) => (t.batches.length ? batch !== null && t.batches.includes(batch) : batch === null);

// A student's own copy: id "personal", owner set. It no longer follows changes to the one it was copied from.
const personalPath = (college: string, userid: number) => `timetables/personal/${college}/${userid}.json`;

export const loadPersonal = (college: string, userid: number) =>
  cached(memoKey(personalPath(college, userid)), TTL, async () => {
    const raw = await readJson(personalPath(college, userid));
    const r = raw === null ? null : TimetableSchema.safeParse(raw);
    if (r && !r.success) console.error(`${personalPath(college, userid)}: unreadable`, r.error.message);
    return r?.success ? r.data : null;
  });

async function writePersonal(college: string, userid: number, t: Timetable | null) {
  await writeJson(personalPath(college, userid), t);
  clearCache(memoKey(personalPath(college, userid)));
}

// Keyed by primitives so every requireUser() in one request shares the result.
const scheduleOf = cache(async (college: string, userid: number): Promise<ScheduleInfo | null> => {
  const doc = await loadShared(college);
  if (!doc) return null;
  const choice = await getTimetableChoice();
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

export type SaveResult = { ok: true; id: string } | { ok: false; errors: FieldError[] };
const fail = (message: string): SaveResult => ({ ok: false, errors: [{ path: "", message }] });

const savedAt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Saves a shared timetable. `raw.updatedAt` must be the one the editor loaded, so a save never overwrites
// someone else's newer one. A new timetable (id "new") gets an id from its name.
export async function saveShared(u: User, raw: unknown): Promise<SaveResult> {
  const doc = parseShared(u.college.id, await readJson(sharedPath(u.college.id)));
  if (!doc) return fail("This college has no timetables.");
  const input = z.object({ id: z.string(), updatedAt: z.string() }).loose().safeParse(raw);
  if (!input.success) return fail("The timetable could not be read. Reload the page.");
  const isNew = input.data.id === "new";
  const stored = doc.list.find((t) => t.id === input.data.id);
  if (!isNew && !stored) return fail("This timetable was deleted. Copy your changes and create a new one.");
  if (stored && stored.updatedAt !== input.data.updatedAt)
    return fail(`${stored.updatedBy ?? "Someone"} saved this timetable at ${savedAt(stored.updatedAt)}, after you opened it. Reload to see their version; your changes are not saved.`);

  let id = input.data.id;
  if (isNew) {
    const base = slugify(String((raw as { name?: unknown }).name ?? ""));
    id = base;
    for (let n = 2; RESERVED_IDS.includes(id) || doc.list.some((t) => t.id === id); n++) id = `${base}-${n}`;
  }
  const parsed = TimetableSchema.safeParse({
    ...(raw as object),
    id,
    college: u.college.id,
    updatedAt: new Date().toISOString(),
    updatedBy: u.fullname || undefined,
    owner: undefined,
    basedOnAt: undefined,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const list = isNew ? [...doc.list, parsed.data] : doc.list.map((t) => (t.id === id ? parsed.data : t));
  await writeShared(u.college.id, { ...doc, list });
  return { ok: true, id };
}

export async function deleteShared(u: User, id: string): Promise<string | null> {
  const doc = parseShared(u.college.id, await readJson(sharedPath(u.college.id)));
  if (!doc) return "This college has no timetables.";
  if (doc.defaultId === id) return "This is the default. Make another timetable the default first.";
  await writeShared(u.college.id, { ...doc, list: doc.list.filter((t) => t.id !== id) });
  return null;
}

export async function setDefault(u: User, id: string) {
  const doc = parseShared(u.college.id, await readJson(sharedPath(u.college.id)));
  if (!doc || !doc.list.some((t) => t.id === id)) return;
  await writeShared(u.college.id, { ...doc, defaultId: id });
}

// Copies the timetable you follow now into your own copy and switches you to it.
// An existing copy is never overwritten: you are switched to it instead.
export async function makePersonal(u: User) {
  const info = await getSchedule(u);
  if (!info || info.personal) return;
  const existing = await loadPersonal(u.college.id, u.userid);
  if (existing) {
    const batch = fits(existing, info.schedule.batch) ? info.schedule.batch : (existing.batches[0] ?? null);
    return setTimetableChoice({ id: "personal", batch });
  }
  const t = info.schedule.timetable;
  const copy: Timetable = { ...t, id: "personal", owner: u.userid, basedOn: t.id, basedOnAt: t.updatedAt, updatedAt: new Date().toISOString(), updatedBy: u.fullname || undefined };
  await writePersonal(u.college.id, u.userid, copy);
  await setTimetableChoice({ id: "personal", batch: info.schedule.batch });
}

// Like saveShared, for the caller's own copy. Owner and origin are kept from the stored copy, never taken from the form.
export async function savePersonal(u: User, raw: unknown): Promise<SaveResult> {
  const stored = TimetableSchema.safeParse(await readJson(personalPath(u.college.id, u.userid)));
  if (!stored.success) return fail("You have no copy of your own. Make one from your timetable page.");
  const input = z.object({ updatedAt: z.string() }).loose().safeParse(raw);
  if (!input.success) return fail("The timetable could not be read. Reload the page.");
  if (stored.data.updatedAt !== input.data.updatedAt)
    return fail(`Your copy was saved at ${savedAt(stored.data.updatedAt)}, after you opened it (maybe in another tab). Reload to see that version; these changes are not saved.`);
  const parsed = TimetableSchema.safeParse({
    ...(raw as object),
    id: "personal",
    college: u.college.id,
    owner: u.userid,
    basedOn: stored.data.basedOn,
    basedOnAt: stored.data.basedOnAt,
    updatedAt: new Date().toISOString(),
    updatedBy: u.fullname || undefined,
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  await writePersonal(u.college.id, u.userid, parsed.data);
  const choice = await getTimetableChoice();
  if (choice?.id === "personal" && !fits(parsed.data, choice.batch)) await setTimetableChoice({ id: "personal", batch: parsed.data.batches[0] ?? null });
  return { ok: true, id: "personal" };
}

// Deletes your copy. If you were using it, you go back to the timetable it came from when that still exists.
export async function discardPersonal(u: User) {
  const copy = await loadPersonal(u.college.id, u.userid);
  await writePersonal(u.college.id, u.userid, null);
  const choice = await getTimetableChoice();
  if (choice?.id !== "personal") return;
  const source = (await loadShared(u.college.id))?.list.find((t) => t.id === copy?.basedOn);
  await setTimetableChoice(source && fits(source, choice.batch) ? { id: source.id, batch: choice.batch } : null);
}
