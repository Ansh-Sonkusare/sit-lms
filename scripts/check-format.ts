// Run: node scripts/check-format.ts
import assert from "node:assert/strict";
import { abbrev, budget, cleanCourse } from "../src/lib/format.ts";

assert.equal(cleanCourse("Computer Organization (Odd Semester-III) (Batch 2025-29)"), "Computer Organization");
assert.equal(cleanCourse("Mentor Mentee Odd Semester 2026-27"), "Mentor Mentee");
assert.equal(abbrev("Design and Analysis of Algorithms Lab (Odd Semester-III) (Batch 2025-29)"), "DAAL");
assert.equal(abbrev("Aptitude and Reasoning Skills III"), "ARSIII");
assert.equal(budget(26, 42), -22); // (0.75*42-26)/0.25 = 22 → 48/64 = 75%
assert.equal(budget(30, 40), 0);   // exactly 75%, can't skip
assert.equal(budget(11, 13), 1);   // 11/14 = 78.6% ok, 11/15 = 73% not
assert.equal(budget(0, 0), 0);
console.log("format ok");
import { stripHtml } from "../src/lib/format.ts";
assert.equal(stripHtml("<p>Q&amp;A, notes</p><p>Hi&#39;s <b>x</b> .</p>"), "Q&A, notes Hi's x.");
console.log("stripHtml ok");
import { collapseDue, budgetText } from "../src/lib/format.ts";
const course = { id: 1, fullname: "Aptitude and Reasoning Skills III (Odd Semester-III) (Batch 2025-29)" };
const ev = [11, 12, 13].map((n, i) => ({ id: i, name: `Aptitude and Reasoning Skills III_Weekly Assisgnment-${n} is due`, timesort: 1793000000, course }));
const c = collapseDue([...ev, { id: 9, name: "DMGT Assignment for Unit-01 to 03 is due", timesort: 1793000000, course: null }]);
assert.equal(c.length, 2);
assert.equal(c[0].title, "Weekly Assisgnment 11 to 13");
assert.equal(c[0].count, 3);
assert.equal(c[1].title, "DMGT Assignment for Unit-01 to 03");
assert.equal(budgetText(26, 42), "Attend the next 22");
assert.equal(budgetText(1, 1), "Don't miss the next one");
assert.equal(budgetText(26, 42, 30), "Attend 22 of the 30 left");
assert.equal(budgetText(16, 30, 8), "Can't reach 75% (max 63.2%)");
assert.equal(budgetText(11, 12, 1), "Can miss 1");
console.log("collapse ok");
import { cleanHtml, cleanTitle } from "../src/lib/format.ts";
assert.equal(
  cleanHtml('<p style="color:red"><span lang="EN">Hi&nbsp;&nbsp;all</span></p><p>&nbsp;</p><p><font face="x"><b>Due</b></font></p><br><br><br><br>x'),
  "<p>Hi all</p><p><b>Due</b></p><br><br>x",
);
assert.equal(cleanTitle("📢 ANNOUNCEMENT – DMGT Assignment"), "DMGT Assignment");
assert.equal(cleanTitle("CA 3 Announcement"), "CA 3 Announcement");
console.log("clean ok");
import { truncate } from "../src/lib/format.ts";
assert.equal(truncate("📢 hello world again", 9), "📢 hello…");
assert.ok(!truncate("a".repeat(5) + "📢📢", 6).includes("�"));
console.log("truncate ok");
