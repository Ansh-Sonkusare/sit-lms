import { z } from "zod";
import { StoreError, update, type Change, type DocStore, type Updated } from "../doc.ts";
import { fieldErrors, RESERVED_IDS, SEED, slugify, TimetableSchema, type FieldError, type Timetable } from "./timetable.ts";

// One document per college: every shared timetable plus the one students get until they choose.
export type CollegeTimetables = { defaultId: string; list: Timetable[] };
export type SaveResult = { ok: true; id: string } | { ok: false; errors: FieldError[] };

export const sharedPath = (college: string) => `timetables/${college}.json`;
export const fail = (message: string): SaveResult => ({ ok: false, errors: [{ path: "", message }] });

// stored: the document as read, or undefined when there is none. Only a college with no document gets the seed.
// null: the college has no timetables. A document that isn't one throws, so nothing is written over it.
export function parseShared(college: string, stored: unknown): CollegeTimetables | null {
  if (stored === undefined) return college === SEED.college ? { defaultId: SEED.id, list: [SEED] } : null;
  const doc = z.object({ defaultId: z.string(), list: z.array(z.unknown()) }).safeParse(stored);
  if (!doc.success) throw new StoreError(`${sharedPath(college)}: unreadable: ${doc.error.message}`);
  const list = doc.data.list.flatMap((t) => {
    const r = TimetableSchema.safeParse(t);
    if (!r.success) console.error(`${sharedPath(college)}: dropped a timetable`, r.error.message);
    return r.success ? [r.data] : [];
  });
  return list.length ? { defaultId: list.some((t) => t.id === doc.data.defaultId) ? doc.data.defaultId : list[0].id, list } : null;
}

// Applies one admin change to a fresh read of the college's document. null: the college has no timetables.
export const updateShared = <R>(store: DocStore, college: string, apply: (doc: CollegeTimetables) => Change<R>): Promise<Updated<R | null>> =>
  update(store, sharedPath(college), (cur): Change<R | null> => {
    const doc = parseShared(college, cur ? cur.value : undefined);
    return doc ? apply(doc) : { result: null };
  });

export const savedAt = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export type Editor = { college: string; name: string | undefined; now: string };

// `raw.updatedAt` must be the one the editor loaded, so a save never overwrites someone else's newer one.
// A new timetable (id "new") gets an id from its name.
export function applySave(doc: CollegeTimetables, raw: unknown, by: Editor): Change<SaveResult> {
  const input = z.object({ id: z.string(), updatedAt: z.string() }).loose().safeParse(raw);
  if (!input.success) return { result: fail("The timetable could not be read. Reload the page.") };
  const isNew = input.data.id === "new";
  const stored = doc.list.find((t) => t.id === input.data.id);
  if (!isNew && !stored) return { result: fail("This timetable was deleted. Copy your changes and create a new one.") };
  if (stored && stored.updatedAt !== input.data.updatedAt)
    return {
      result: fail(`${stored.updatedBy ?? "Someone"} saved this timetable at ${savedAt(stored.updatedAt)}, after you opened it. Reload to see their version; your changes are not saved.`),
    };

  let id = input.data.id;
  if (isNew) {
    const base = slugify(String((raw as { name?: unknown }).name ?? ""));
    id = base;
    for (let n = 2; RESERVED_IDS.includes(id) || doc.list.some((t) => t.id === id); n++) id = `${base}-${n}`;
  }
  const parsed = TimetableSchema.safeParse({
    ...(raw as object),
    id,
    college: by.college,
    updatedAt: by.now,
    updatedBy: by.name,
    owner: undefined,
    basedOnAt: undefined,
  });
  if (!parsed.success) return { result: { ok: false, errors: fieldErrors(parsed.error) } };
  const list = isNew ? [...doc.list, parsed.data] : doc.list.map((t) => (t.id === id ? parsed.data : t));
  return { write: { ...doc, list }, result: { ok: true, id } };
}

// result: null when done, else why not.
export function applyDelete(doc: CollegeTimetables, id: string): Change<string | null> {
  if (doc.defaultId === id) return { result: "This is the default. Make another timetable the default first." };
  if (!doc.list.some((t) => t.id === id)) return { result: null };
  return { write: { ...doc, list: doc.list.filter((t) => t.id !== id) }, result: null };
}

export function applyDefault(doc: CollegeTimetables, id: string): Change<string | null> {
  if (!doc.list.some((t) => t.id === id)) return { result: "This timetable was deleted." };
  return doc.defaultId === id ? { result: null } : { write: { ...doc, defaultId: id }, result: null };
}
