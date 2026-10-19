// M1 spike: MOODLE_USERNAME=.. MOODLE_PASSWORD=.. node scripts/spike.ts
import { z } from "zod";
import { call, login } from "../src/lib/moodle.ts";

const { token } = await login(process.env.MOODLE_USERNAME!, process.env.MOODLE_PASSWORD!);
const info = await call(token, "core_webservice_get_site_info", {}, z.object({
  sitename: z.string(), release: z.string(), userid: z.number(), fullname: z.string(),
  functions: z.array(z.object({ name: z.string() })),
}));
console.log(`${info.sitename} — Moodle ${info.release} — ${info.fullname} (#${info.userid})`);
const fns = new Set(info.functions.map((f) => f.name));
const needed = [
  "core_course_get_enrolled_courses_by_timeline_classification", "core_course_get_contents",
  "core_calendar_get_action_events_by_timesort", "mod_assign_get_assignments", "mod_assign_get_submission_status",
  "gradereport_overview_get_course_grades", "gradereport_user_get_grade_items", "message_popup_get_popup_notifications",
  "mod_forum_get_forums_by_courses", "mod_forum_get_forum_discussions", "tool_mobile_get_autologin_key",
];
for (const n of needed) console.log(fns.has(n) ? "  ok     " : "  MISSING", n);
console.log("  attendance fns:", [...fns].filter((f) => f.startsWith("mod_attendance")).join(", ") || "none");
const now = Math.floor(Date.now() / 1000);
const ev = await call(token, "core_calendar_get_action_events_by_timesort",
  { timesortfrom: now, timesortto: now + 14 * 86400 }, z.object({ events: z.array(z.object({ name: z.string(), timesort: z.number() })) }));
console.log(`deadlines (14d): ${ev.events.length}`);
