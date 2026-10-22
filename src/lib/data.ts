import "server-only";
import { z } from "zod";
import { redirect } from "next/navigation";
import { call, cached, MoodleError } from "./moodle.ts";
import { getExtraCourses, getLeaves, type Leave } from "./prefs.ts";
import { TIMETABLED } from "./sit/timetable.ts";
import { applyLeave, reconcile, type CourseMarks } from "./sit/marks.ts";
import { todayIST } from "./format.ts";
import type { User } from "./session.ts";

const MIN = 60_000;

// Moodle user ids are per site, so every per-user key carries the site too.
export const cacheKey = (u: Pick<User, "site" | "userid">) => `${u.site}|${u.userid}`;

async function api<S extends z.ZodType>(u: User, fn: string, params: Record<string, unknown>, schema: S, ttl: number) {
  const key = `${cacheKey(u)}:${fn}:${JSON.stringify(params)}`;
  try {
    return await cached(key, ttl, () => call(u.site, u.token, fn, params, schema));
  } catch (e) {
    if (e instanceof MoodleError && e.errorcode === "invalidtoken") redirect("/login?expired=1");
    throw e;
  }
}

const Course = z.object({
  id: z.number(),
  fullname: z.string(),
  shortname: z.string(),
  courseimage: z.string().optional(),
  progress: z.number().nullish(),
});
export type Course = z.infer<typeof Course>;

export const getCourses = (u: User) =>
  api(
    u,
    "core_course_get_enrolled_courses_by_timeline_classification",
    { classification: "inprogress" },
    z.object({ courses: z.array(Course) }),
    60 * MIN,
  ).then((r) => r.courses);

const Event = z.object({
  id: z.number(),
  name: z.string(),
  timesort: z.number(),
  url: z.string(),
  modulename: z.string().nullish(),
  instance: z.number().nullish(),
  course: z.object({ id: z.number(), fullname: z.string(), shortname: z.string() }).nullish(),
  action: z.object({ name: z.string(), url: z.string(), actionable: z.boolean() }).nullish(),
  overdue: z.boolean().nullish(),
});
export type Deadline = z.infer<typeof Event>;

export const getDeadlines = (u: User, days = 14) => {
  // round to 5 min so the cache key is stable within the TTL window
  const now = Math.floor(Date.now() / (5 * MIN)) * 300;
  return api(
    u,
    "core_calendar_get_action_events_by_timesort",
    { timesortfrom: now - 86400, timesortto: now + days * 86400, limitnum: 50 },
    z.object({ events: z.array(Event) }),
    5 * MIN,
  ).then((r) => r.events);
};

const FileContent = z.object({
  type: z.string(),
  filename: z.string(),
  filepath: z.string().nullish(),
  fileurl: z.string().nullish(),
  filesize: z.number().nullish(),
  mimetype: z.string().nullish(),
});
const Module = z.object({
  id: z.number(),
  name: z.string(),
  modname: z.string(),
  instance: z.number().nullish(),
  url: z.string().nullish(),
  description: z.string().nullish(),
  uservisible: z.boolean().nullish(),
  contents: z.array(FileContent).nullish(),
  dates: z.array(z.object({ label: z.string(), timestamp: z.number() })).nullish(),
});
export type Module = z.infer<typeof Module>;
const Section = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string(),
  modules: z.array(Module),
});
export type Section = z.infer<typeof Section>;

export const getCourseContents = (u: User, courseid: number) =>
  api(u, "core_course_get_contents", { courseid }, z.array(Section), 60 * MIN);

const Notification = z.object({
  id: z.number(),
  subject: z.string(),
  smallmessage: z.string().nullish(),
  fullmessagehtml: z.string().nullish(),
  timecreated: z.number(),
  read: z.boolean(),
  contexturl: z.string().nullish(),
});
export type Notification = z.infer<typeof Notification>;
export const getNotifications = (u: User) =>
  api(
    u,
    "message_popup_get_popup_notifications",
    { useridto: u.userid, limit: 30 },
    z.object({ notifications: z.array(Notification), unreadcount: z.number() }),
    5 * MIN,
  );

const Forum = z.object({ id: z.number(), course: z.number(), type: z.string(), name: z.string() });
const Discussion = z.object({
  id: z.number(),
  discussion: z.number(),
  name: z.string(),
  message: z.string(),
  timemodified: z.number(),
  userfullname: z.string().nullish(),
});
export type Announcement = z.infer<typeof Discussion> & { courseid: number };

export async function getAnnouncements(u: User): Promise<Announcement[]> {
  const courses = await getCourses(u);
  const forums = await api(
    u,
    "mod_forum_get_forums_by_courses",
    { courseids: courses.map((c) => c.id) },
    z.array(Forum),
    60 * MIN,
  );
  const news = forums.filter((f) => f.type === "news");
  const lists = await Promise.all(
    news.map((f) =>
      api(
        u,
        "mod_forum_get_forum_discussions",
        { forumid: f.id, perpage: 20 },
        z.object({ discussions: z.array(Discussion) }),
        30 * MIN,
      ).then((r) => r.discussions.map((d) => ({ ...d, courseid: f.course }))),
    ),
  );
  return lists.flat().sort((a, b) => b.timemodified - a.timemodified);
}

const Assignment = z.object({
  id: z.number(),
  cmid: z.number(),
  name: z.string(),
  intro: z.string().nullish(),
  duedate: z.number(),
  cutoffdate: z.number().nullish(),
  introattachments: z.array(z.object({ filename: z.string(), fileurl: z.string(), filesize: z.number().nullish() })).nullish(),
});
export const getAssignments = (u: User, courseid: number) =>
  api(
    u,
    "mod_assign_get_assignments",
    { courseids: [courseid] },
    z.object({ courses: z.array(z.object({ id: z.number(), assignments: z.array(Assignment) })) }),
    60 * MIN,
  ).then((r) => r.courses[0]?.assignments ?? []);

export async function getAssignment(u: User, courseid: number, cmid: number) {
  const a = (await getAssignments(u, courseid)).find((x) => x.cmid === cmid);
  if (!a) return null;
  const status = await api(
    u,
    "mod_assign_get_submission_status",
    { assignid: a.id },
    z.object({
      lastattempt: z
        .object({
          submission: z.object({ status: z.string(), timemodified: z.number() }).nullish(),
          gradingstatus: z.string().nullish(),
        })
        .nullish(),
    }),
    5 * MIN,
  );
  return { ...a, status };
}

const AttendanceResp = z.object({
  courses: z.array(
    z.object({ courseid: z.number(), coursename: z.string(), totalsessions: z.number(), attended: z.number(), percentage: z.number() }),
  ),
});
export type AttendanceRow = { courseid: number; course: string; marked: number; attended: number; percent: number; credited: number };
export type Attendance = { rows: AttendanceRow[]; marked: number; attended: number; overall: number; credited: number };

const SessionsResp = z.object({ sessions: z.array(z.object({ date: z.string(), mark: z.string() })) });

// Every attendance session the LMS has recorded for one course: date + mark ("P" present, "A" absent).
export const getSessions = (u: User, courseid: number) =>
  api(u, "mod_attendance_get_course_attendance_details", { courseid, userid: u.userid }, SessionsResp, 5 * MIN).then((r) => r.sessions);

export type LeaveSession = { courseid: number; course: string; date: string; mark: string };

// The LMS's own sessions that fall on any of these leave days.
export async function sessionsOnLeave(u: User, leaves: Leave[]): Promise<LeaveSession[]> {
  if (!leaves.length) return [];
  const onLeave = (d: string) => leaves.some((l) => l.from <= d && d <= l.to);
  const courses = await getCourses(u);
  const per = await Promise.all(
    courses.map((c) =>
      getSessions(u, c.id)
        .then((ss) => ss.filter((x) => onLeave(x.date)).map((x) => ({ courseid: c.id, course: c.fullname, date: x.date, mark: x.mark })))
        .catch(() => []),
    ),
  );
  return per.flat().sort((a, b) => a.date.localeCompare(b.date));
}

// SIT's custom attendance plugin (mod_attendance_get_attendance, not core mod_attendance) covers every course ever taken; keep this semester's.
// Leave credit: each session the LMS marked absent on a leave day counts as present.
// `leaves` defaults to your accepted leave; pass [] for the LMS's raw numbers.
export async function getAttendance(u: User, leaves?: Leave[]): Promise<Attendance> {
  leaves ??= (await getLeaves()).filter((l) => l.accepted);
  const [r, courses, onLeave] = await Promise.all([
    api(u, "mod_attendance_get_attendance", {}, AttendanceResp, 5 * MIN),
    getCourses(u),
    sessionsOnLeave(u, leaves),
  ]);
  const credit = new Map<number, number>();
  for (const x of onLeave) if (x.mark === "A") credit.set(x.courseid, (credit.get(x.courseid) ?? 0) + 1);
  const current = new Set(courses.map((c) => c.id));
  const rows = r.courses
    .filter((c) => current.has(c.courseid) && c.totalsessions > 0)
    .map((c) => {
      const credited = Math.min(credit.get(c.courseid) ?? 0, c.totalsessions - c.attended);
      const attended = c.attended + credited;
      return { courseid: c.courseid, course: c.coursename, marked: c.totalsessions, attended, percent: (attended / c.totalsessions) * 100, credited };
    });
  const sum = (k: "marked" | "attended" | "credited") => rows.reduce((s, x) => s + x[k], 0);
  const marked = sum("marked");
  return { rows, marked, attended: sum("attended"), credited: sum("credited"), overall: marked ? (sum("attended") / marked) * 100 : 0 };
}

// Per course: what the LMS recorded checked against the timetable, with accepted leave applied like getAttendance does.
export async function getCourseMarks(u: User, courseid: number): Promise<CourseMarks> {
  const [sessions, leaves] = await Promise.all([getSessions(u, courseid), getLeaves().then((l) => l.filter((x) => x.accepted))]);
  return reconcile(courseid, applyLeave(sessions, leaves), todayIST());
}

// Every timetabled course of this semester. A course whose records fail to load is left out, so it shows no status instead of "not marked".
export async function getAllMarks(u: User): Promise<Map<number, CourseMarks>> {
  const [courses, leaves] = await Promise.all([getCourses(u), getLeaves().then((l) => l.filter((x) => x.accepted))]);
  const today = todayIST();
  const per = await Promise.all(
    courses
      .filter((c) => TIMETABLED.has(c.id))
      .map((c) =>
        getSessions(u, c.id)
          .then((ss) => [c.id, reconcile(c.id, applyLeave(ss, leaves), today)] as const)
          .catch(() => null),
      ),
  );
  return new Map(per.filter((x) => x !== null));
}

// Your courses: at SIT the ones in your timetable plus any you added, everything else is "other"; elsewhere all of them.
export async function getMyCourses(u: User) {
  const [all, extra] = await Promise.all([getCourses(u), getExtraCourses()]);
  const mine = (c: Course) => !u.college.sit || TIMETABLED.has(c.id) || extra.includes(c.id);
  return { mine: all.filter(mine), other: all.filter((c) => !mine(c)), extra: new Set(extra) };
}
