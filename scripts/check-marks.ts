// Run: node scripts/check-marks.ts
import assert from "node:assert/strict";
import { applyLeave, dayClasses, dotsByDay, reconcile, statusLine, type CourseMarks } from "../src/lib/sit/marks.ts";

const missingOn = (m: CourseMarks, date: string) => m.missing.find((x) => x.date === date);
const P = (date: string) => ({ date, mark: "P" });
const A = (date: string) => ({ date, mark: "A" });

// ICS (491): the Tuesday class is recorded on the Wednesday.
const ics = reconcile(491, [P("2026-09-16"), P("2026-09-17")], "2026-09-18");
assert.deepEqual(
  ics.sessions.map((s) => [s.date, s.match, s.classDate]),
  [["2026-09-16", "moved", "2026-09-15"], ["2026-09-17", "class", undefined]],
);
assert.equal(missingOn(ics, "2026-09-15"), undefined);

// Project Based Learning (565): one record per slot, two slots on Monday.
const pbl = reconcile(565, [P("2026-10-12"), A("2026-10-12")], "2026-10-12");
assert.deepEqual(pbl.sessions.map((s) => s.match), ["class", "class"]);
assert.equal(missingOn(pbl, "2026-10-12"), undefined);
assert.equal(missingOn(reconcile(565, [P("2026-10-12")], "2026-10-12"), "2026-10-12")?.count, 1);

// CO (486): a record on Sports Day is extra, one before the timetable is untracked.
const co = reconcile(486, [P("2026-07-08"), P("2026-10-05"), P("2026-10-07"), P("2026-10-08"), P("2026-10-09")], "2026-10-10");
const coOn = (date: string) => co.sessions.find((s) => s.date === date)!;
assert.equal(coOn("2026-10-09").match, "extra");
assert.equal(coOn("2026-07-08").match, "untracked");
assert.equal(coOn("2026-10-08").match, "class");
assert.equal(co.sessions.length, 5);

// Nothing recorded on Monday 2026-09-28: every class that day is missing, none pending.
const none = (id: number) => reconcile(id, [], "2026-10-22");
const monday = { 486: 1, 565: 2, 508: 2, 555: 1, 505: 1, 487: 1 };
for (const [id, count] of Object.entries(monday)) {
  assert.deepEqual(missingOn(none(Number(id)), "2026-09-28"), { date: "2026-09-28", count, pending: false }, `course ${id}`);
}

// Today's classes have no records yet: pending, not missing.
assert.deepEqual(missingOn(none(486), "2026-10-22"), { date: "2026-10-22", count: 1, pending: true });
assert.deepEqual(missingOn(none(491), "2026-10-22"), { date: "2026-10-22", count: 1, pending: true });
assert.deepEqual(missingOn(none(504), "2026-10-22"), { date: "2026-10-22", count: 2, pending: true });
assert.equal(missingOn(none(486), "2026-10-23"), undefined);

// A record on a holiday (Anant Chaturdashi) is extra. A course outside the timetable is untracked.
assert.equal(reconcile(487, [P("2026-09-22"), P("2026-09-25"), P("2026-09-28")], "2026-09-28").sessions[1].match, "extra");
assert.equal(reconcile(999, [P("2026-10-05")], "2026-10-22").sessions[0].match, "untracked");

// Leave turns an absence into presence, only on a leave day.
const leaves = [{ id: "1", from: "2026-10-05", to: "2026-10-06", note: "", accepted: true }];
assert.deepEqual(applyLeave([A("2026-10-05"), P("2026-10-05"), A("2026-10-07")], leaves), [
  { date: "2026-10-05", mark: "P", leave: true },
  { date: "2026-10-05", mark: "P" },
  { date: "2026-10-07", mark: "A" },
]);

// Day view.
const marks = new Map([[491, ics], [565, pbl]]);
const icsClass = dayClasses("2026-09-15", marks, "2026-09-18").classes.find((c) => c.courseid === 491)!;
assert.deepEqual(icsClass.statuses, [{ kind: "moved", mark: "P", leave: false, recordedOn: "2026-09-16" }]);
assert.equal(statusLine(icsClass.statuses)?.text, "Present, recorded Wed 16 Sep");
assert.deepEqual(dayClasses("2026-09-16", marks, "2026-09-18").others.map((o) => [o.courseid, o.match]), [[491, "moved"]]);
const pblClass = (m: CourseMarks) => dayClasses("2026-10-12", new Map([[565, m]]), "2026-10-12").classes.find((c) => c.courseid === 565)!;
assert.equal(statusLine(pblClass(pbl).statuses)?.text, "1 present, 1 absent");
assert.equal(statusLine(pblClass(reconcile(565, [P("2026-10-12"), P("2026-10-12")], "2026-10-12")).statuses)?.text, "2 of 2 present");
assert.equal(dayClasses("2026-09-10", marks, "2026-09-18").tracked, false);
assert.equal(statusLine(dayClasses("2026-10-22", new Map([[486, none(486)]]), "2026-10-22").classes.find((c) => c.courseid === 486)!.statuses)?.text, "Not marked yet");
assert.equal(statusLine(dayClasses("2026-10-23", new Map(), "2026-10-22").classes[0].statuses)?.text, "Upcoming");

// Calendar dots stay on the LMS date.
const dots = dotsByDay([ics]);
assert.deepEqual(dots.get("2026-09-16")?.map((d) => [d.state, d.flag]), [["present", "moved"]]);
assert.equal(dots.get("2026-09-15"), undefined);

console.log("marks ok");
