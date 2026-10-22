// Run: node scripts/check-timetable.ts
import assert from "node:assert/strict";
import { classesOn, daysBetween, missedByCourse, nextClassDay, remainingByCourse } from "../src/lib/sit/timetable.ts";
import { skipText } from "../src/lib/format.ts";

assert.equal(classesOn("2026-10-19")[0].subject, "CO"); // a Monday
assert.ok(!classesOn("2026-10-20").some((c) => c.start === "11:40")); // B2-only tutorial skipped
assert.equal(classesOn("2026-10-24").length, 0); // Saturday
assert.deepEqual(daysBetween("2026-10-30", "2026-11-02"), ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
const m = missedByCourse(daysBetween("2026-10-26", "2026-10-30")); // a full week, no holidays
assert.equal(m.get(486), 3); // CO: Mon, Wed, Thu
assert.equal(m.get(504), 3); // DAA Lab: Mon, Thu, Fri
assert.equal(m.get(487), 2); // DAA: Tue, Fri
assert.equal(classesOn("2026-10-20").length, 0); // Dussehra
assert.equal(classesOn("2026-11-09").length, 0); // Diwali break
assert.equal(classesOn("2026-11-06").length, 0); // after teaching ends (and Diwali)
const r = remainingByCourse("2026-11-04");
assert.equal(r.get(486), 1); // only Thu 5 Nov left: CO slot 2
assert.equal(remainingByCourse("2026-11-05").size, 0);
assert.equal(nextClassDay("2026-10-20"), "2026-10-21"); // Dussehra → Wednesday
assert.equal(nextClassDay("2026-10-24"), "2026-10-26"); // weekend → Monday
assert.equal(nextClassDay("2026-11-06"), null); // teaching over
assert.equal(skipText(8, 10, 5).safe, false); // 80% → 72.7%
assert.equal(skipText(9, 10, 5).safe, true); // 90% → 81.8%
assert.equal(skipText(3, 4, 0).then, "Can't reach 75% this term"); // 75% → 60%, nothing left
console.log("timetable ok");
