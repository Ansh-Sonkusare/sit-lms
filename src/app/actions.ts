"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { refresh as refreshRoute } from "next/cache";
import { call, clearCache, login as moodleLogin, MoodleError } from "@/lib/moodle.ts";
import { getSession, requireUser } from "@/lib/session.ts";
import { findCollege } from "@/lib/colleges.ts";
import { cacheKey } from "@/lib/data.ts";
import { getLeaves, saveLeaves, setExtraCourse, setTimetableChoice, setUpdateDone } from "@/lib/prefs.ts";
import { deleteShared, discardPersonal, isAdmin, makePersonal, optionsFor, savePersonal, saveShared, setDefault } from "@/lib/timetables.ts";
import type { FieldError } from "@/lib/sit/timetable.ts";

export async function login(_: string | null, form: FormData) {
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const college = findCollege(String(form.get("college") ?? ""));
  if (!college) return "Pick your college.";
  try {
    const { token } = await moodleLogin(college.url, username, password);
    const info = await call(college.url, token, "core_webservice_get_site_info", {}, z.object({ userid: z.number(), fullname: z.string() }));
    const s = await getSession();
    Object.assign(s, { college: college.id, token, userid: info.userid, fullname: info.fullname });
    await s.save();
  } catch (e) {
    return e instanceof MoodleError ? e.message : "Could not reach the LMS";
  }
  redirect("/");
}

export async function logout() {
  (await getSession()).destroy();
  redirect("/login");
}

export async function refresh() {
  const u = await requireUser();
  clearCache(`${cacheKey(u)}:`);
  refreshRoute();
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function addLeave(_: string | null, form: FormData) {
  await requireUser();
  const from = String(form.get("from") ?? "");
  const to = String(form.get("to") || from);
  if (!ISO.test(from) || !ISO.test(to)) return "Pick a start date.";
  if (to < from) return "The end date is before the start date.";
  const leaves = await getLeaves();
  await saveLeaves([...leaves, { id: crypto.randomUUID(), from, to, note: String(form.get("note") ?? "").trim().slice(0, 80), accepted: false }]);
  refreshRoute();
  return null;
}

export async function setLeaveAccepted(id: string, accepted: boolean) {
  await requireUser();
  await saveLeaves((await getLeaves()).map((l) => (l.id === id ? { ...l, accepted } : l)));
  refreshRoute();
}

export async function removeLeave(id: string) {
  await requireUser();
  await saveLeaves((await getLeaves()).filter((l) => l.id !== id));
  refreshRoute();
}

export async function toggleCourse(id: number, on: boolean) {
  await requireUser();
  await setExtraCourse(id, on);
  refreshRoute();
}

export async function toggleUpdateDone(id: number, done: boolean) {
  await requireUser();
  await setUpdateDone(id, done);
  refreshRoute();
}

// form "choice": "<timetable id>|<batch>", the batch empty for a timetable without batches.
export async function chooseTimetable(form: FormData) {
  const u = await requireUser();
  const [id, batch = ""] = String(form.get("choice") ?? "").split("|");
  const option = (await optionsFor(u)).find((o) => o.timetable.id === id && (o.batch ?? "") === batch);
  if (!option) return;
  await setTimetableChoice(u.college.id, u.userid, { id, batch: option.batch });
  refreshRoute();
}

const parseJson = (form: FormData): unknown => {
  try {
    return JSON.parse(String(form.get("json") ?? ""));
  } catch {
    return null;
  }
};

// Every shared-timetable action checks the caller is an admin again: actions can be posted to directly.
async function requireAdmin() {
  const u = await requireUser();
  return isAdmin(u) ? u : null;
}

export async function saveSharedTimetable(_: FieldError[] | null, form: FormData): Promise<FieldError[] | null> {
  const u = await requireAdmin();
  if (!u) return [{ path: "", message: "Only admins can change shared timetables." }];
  const r = await saveShared(u, parseJson(form));
  if (!r.ok) return r.errors;
  redirect("/admin/timetables");
}

export async function deleteTimetable(id: string) {
  const u = await requireAdmin();
  if (!u) return;
  await deleteShared(u, id);
  refreshRoute();
}

export async function makeDefaultTimetable(id: string) {
  const u = await requireAdmin();
  if (!u) return;
  await setDefault(u, id);
  refreshRoute();
}

export async function makeMyTimetableCopy() {
  await makePersonal(await requireUser());
  redirect("/timetable/edit");
}

export async function discardMyTimetableCopy() {
  await discardPersonal(await requireUser());
  refreshRoute();
}

export async function savePersonalTimetable(_: FieldError[] | null, form: FormData): Promise<FieldError[] | null> {
  const u = await requireUser();
  const r = await savePersonal(u, parseJson(form));
  if (!r.ok) return r.errors;
  redirect("/timetable");
}
