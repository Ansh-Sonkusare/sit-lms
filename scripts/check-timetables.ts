// Run: node scripts/check-timetables.ts
import assert from "node:assert/strict";
import { SEED, TimetableSchema, type Block, type Timetable } from "../src/lib/sit/timetable.ts";

const errors = (t: Timetable) => {
  const r = TimetableSchema.safeParse(t);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};
const withBlocks = (...extra: Block[]) => ({ ...SEED, blocks: [...SEED.blocks, ...extra] });

assert.deepEqual(TimetableSchema.parse(SEED), SEED);
assert.deepEqual(TimetableSchema.parse(JSON.parse(JSON.stringify(SEED))), SEED);

// Tuesday slot 4 is B2's tutorial: B1 may have a class then, the whole section may not.
assert.deepEqual(errors(withBlocks({ day: 2, slots: [4], subject: "DAA Lab", batch: "B1", course: 504 })), []);
assert.match(errors(withBlocks({ day: 2, slots: [4], subject: "Extra", course: null }))[0], /^blocks\.33\.slots: Overlaps DMGT Tutorial/);
assert.match(errors(withBlocks({ day: 2, slots: [4], subject: "Extra", batch: "B2", course: null }))[0], /^blocks\.33\.slots: Overlaps/);
assert.match(errors(withBlocks({ day: 4, slots: [4, 5], subject: "Extra", batch: "B1", course: null }))[0], /Overlaps DAA Lab/);

assert.match(errors(withBlocks({ day: 6, slots: [10], subject: "Late", course: null }))[0], /^blocks\.33\.slots: There are only 9 slots/);
assert.match(errors(withBlocks({ day: 6, slots: [1, 3], subject: "Gap", course: null }))[0], /follow each other/);
assert.match(errors(withBlocks({ day: 6, slots: [1], subject: "Lab", batch: "B3", course: null }))[0], /^blocks\.33\.batch: There is no batch B3/);
assert.notEqual(errors({ ...SEED, from: "2026-02-30" }).length, 0);
assert.notEqual(errors({ ...SEED, id: "Section B!" }).length, 0);
assert.notEqual(errors({ ...SEED, slotTimes: [["10:00", "09:00"]], blocks: [] }).length, 0);
assert.notEqual(errors({ ...SEED, batches: ["B1", "B1"] }).length, 0);

console.log("timetables ok");
