// Run: node scripts/check-store.ts
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici";
import { memoryStore, update, type Change, type DocStore } from "../src/lib/doc.ts";
import { applyDefault, applyDelete, applySave, parseShared, sharedPath, updateShared, type CollegeTimetables } from "../src/lib/sit/shared.ts";
import { SEED } from "../src/lib/sit/timetable.ts";

// The failures below are on purpose; update() logs each one.
console.error = () => {};

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_teststore_secret";
const { blobStore } = await import("../src/lib/blob-store.ts");

// The blob adapter against canned HTTP replies: only a 404 is "missing".
const agent = new MockAgent();
agent.disableNetConnect();
setGlobalDispatcher(agent);
const blobHost = agent.get("https://teststore.private.blob.vercel-storage.com");
const api = agent.get("https://vercel.com");
const getOf = (path: string) => ({ path: `/${path}?cache=0`, method: "GET" });
const json = { headers: { "content-type": "application/json", etag: '"e1"' } };

blobHost.intercept(getOf("a.json")).reply(404, "");
assert.equal(await blobStore.read("a.json"), null, "404 reads as missing");
blobHost.intercept(getOf("a.json")).reply(503, "busy");
await assert.rejects(blobStore.read("a.json"), "503 is a failure, not missing");
blobHost.intercept(getOf("a.json")).reply(200, "{not json", json);
await assert.rejects(blobStore.read("a.json"), /not valid JSON/);
blobHost.intercept(getOf("a.json")).reply(200, '{"x":1}', json);
assert.deepEqual(await blobStore.read("a.json"), { value: { x: 1 }, etag: '"e1"' });

const putPath = (p: string) => p.startsWith("/api/blob/?pathname=a.json");
api.intercept({ path: putPath, method: "PUT" }).reply(412, { error: { code: "precondition_failed", message: "etag mismatch" } });
assert.equal(await blobStore.write("a.json", { x: 2 }, '"e0"'), "conflict", "412 is a conflict");
api.intercept({ path: putPath, method: "PUT" }).reply(400, { error: { code: "bad_request", message: "This blob already exists" } });
blobHost.intercept(getOf("a.json")).reply(200, '{"x":1}', json);
assert.equal(await blobStore.write("a.json", { x: 2 }, null), "conflict", "a create that finds the blob there is a conflict");
api.intercept({ path: putPath, method: "PUT" }).reply(400, { error: { code: "bad_request", message: "Bad request" } });
blobHost.intercept(getOf("a.json")).reply(404, "");
await assert.rejects(blobStore.write("a.json", { x: 2 }, null), "a create that fails for another reason throws");
api.intercept({ path: putPath, method: "PUT" }).reply(200, { url: "u", downloadUrl: "u", pathname: "a.json", contentType: "application/json", contentDisposition: "", etag: '"e2"' });
assert.equal(await blobStore.write("a.json", { x: 2 }, '"e1"'), "ok");

// The memory store behaves like the blob store.
const mem = memoryStore();
assert.equal(await mem.write("m", { n: 1 }, null), "ok");
assert.equal(await mem.write("m", { n: 2 }, null), "conflict", "create refuses an existing document");
const m1 = (await mem.read("m"))!;
assert.equal(await mem.write("m", { n: 2 }, "stale"), "conflict");
assert.equal(await mem.write("m", { n: 2 }, m1.etag), "ok");
assert.equal(await mem.write("m", { n: 3 }, m1.etag), "conflict", "each write gets a new etag");
(m1.value as { n: number }).n = 99;
assert.deepEqual((await mem.read("m"))!.value, { n: 2 }, "mutating a read value doesn't change the store");
mem.raw.set("bad", { text: "{", etag: "x" });
await assert.rejects(mem.read("bad"), /not valid JSON/);

// update(): read fresh, change, compare-and-swap, start over on a conflict.
const add = (item: string) => (cur: { value: unknown } | null) => {
  const list = (cur?.value as string[] | undefined) ?? ["seed"];
  return { write: [...list, item], result: item };
};
const faulty = (inner: DocStore, faults: { read?: number; conflicts?: number; onWrite?: () => Promise<void> }) => {
  let writes = 0;
  return {
    get writes() {
      return writes;
    },
    async read(path: string) {
      if (faults.read && faults.read-- > 0) throw new Error("blob store down");
      return inner.read(path);
    },
    async write(path: string, value: unknown, expect: string | null) {
      writes++;
      if (faults.conflicts && faults.conflicts-- > 0) return "conflict" as const;
      await faults.onWrite?.();
      return inner.write(path, value, expect);
    },
  };
};

{
  const s = memoryStore();
  assert.deepEqual(await update(s, "d", add("a")), { ok: true, result: "a" });
  assert.deepEqual((await s.read("d"))!.value, ["seed", "a"], "a missing document starts from the seed");
}
{
  const s = memoryStore();
  await s.write("d", ["seed", "kept"], null);
  const f = faulty(s, { read: 1 });
  assert.deepEqual(await update(f, "d", add("b")), { ok: false, reason: "unavailable" });
  assert.equal(f.writes, 0, "a read failure writes nothing");
  assert.deepEqual((await s.read("d"))!.value, ["seed", "kept"], "a read failure never replaces the stored document with the seed");
}
{
  // Admin B writes between admin A's read and write: A's write conflicts, A re-reads and both changes are kept.
  const s = memoryStore();
  await s.write("d", ["seed"], null);
  let raced = false;
  const f = faulty(s, {
    onWrite: async () => {
      if (raced) return;
      raced = true;
      assert.equal((await update(s, "d", add("from B"))).ok, true);
    },
  });
  assert.deepEqual(await update(f, "d", add("from A")), { ok: true, result: "from A" });
  assert.deepEqual((await s.read("d"))!.value, ["seed", "from B", "from A"]);
}
{
  const s = memoryStore();
  await s.write("d", ["seed"], null);
  const f = faulty(s, { conflicts: 99 });
  assert.deepEqual(await update(f, "d", add("x")), { ok: false, reason: "conflict" });
  assert.equal(f.writes, 3, "gives up after three tries");
  assert.deepEqual((await s.read("d"))!.value, ["seed"]);
}
{
  const s = memoryStore();
  s.raw.set("d", { text: "{", etag: "x" });
  assert.deepEqual(await update(s, "d", add("x")), { ok: false, reason: "unavailable" }, "a malformed document is a failure");
  assert.equal(s.raw.get("d")!.text, "{");
  assert.deepEqual(await update(s, "e", () => ({ result: 1 })), { ok: true, result: 1 }, "no write without `write`");
  assert.equal(await s.read("e"), null);
}

// Admin changes to a college's timetables, through the same update() the app uses.
const path = sharedPath(SEED.college);
const shared = <R>(s: DocStore, apply: (doc: CollegeTimetables) => Change<R>) => updateShared(s, SEED.college, apply);
const stored = async (s: DocStore) => parseShared(SEED.college, (await s.read(path))!.value)!;
const by = (name: string) => ({ college: SEED.college, name, now: new Date().toISOString() });
const create = (name: string) => (doc: CollegeTimetables) => applySave(doc, { ...SEED, id: "new", name, updatedAt: "" }, by(name));
{
  const s = memoryStore();
  const r = await shared(s, create("Section A"));
  assert.ok(r.ok && r.result?.ok && /^section-a-[0-9a-f]{6}$/.test(r.result.id), "a new timetable's id is its name and a random suffix");
  assert.deepEqual((await stored(s)).list.map((t) => t.name), [SEED.name, "Section A"], "a college with no document starts from the seed");
  const first = r.ok && r.result?.ok ? r.result.id : "";
  await shared(s, (doc) => applyDelete(doc, first));
  const again = await shared(s, create("Section A"));
  assert.ok(again.ok && again.result?.ok && again.result.id !== first, "a re-created timetable gets a new id");
}
{
  const s = memoryStore();
  await shared(s, create("Section A"));
  await shared(s, create("Section C"));
  const before = s.raw.get(path)!.text;
  assert.deepEqual(await shared(faulty(s, { read: 1 }), create("Section D")), { ok: false, reason: "unavailable" });
  assert.equal(s.raw.get(path)!.text, before, "a read failure never writes the seed over admins' timetables");

  // Admin A edits the seed while admin B creates a timetable: both survive.
  const seed = (await stored(s)).list.find((t) => t.id === SEED.id)!;
  let raced = false;
  const racing = faulty(s, {
    onWrite: async () => {
      if (raced) return;
      raced = true;
      await shared(s, create("Section E"));
    },
  });
  const edit = (doc: CollegeTimetables) => applySave(doc, { ...seed, name: "Renamed" }, by("A"));
  assert.deepEqual(await shared(racing, edit), { ok: true, result: { ok: true, id: SEED.id } });
  const after = await stored(s);
  assert.deepEqual(after.list.map((t) => t.name), ["Renamed", "Section A", "Section C", "Section E"]);
  assert.equal(after.list[0].name, "Renamed");

  // The stale-editor check runs again on the re-read document: B saved the seed in between, so A's save is refused.
  const loaded = after.list[0];
  raced = false;
  const second = faulty(s, {
    onWrite: async () => {
      if (raced) return;
      raced = true;
      await shared(s, (doc) => applySave(doc, { ...loaded, name: "B's name" }, by("B")));
    },
  });
  const r = await shared(second, (doc) => applySave(doc, { ...loaded, name: "A's name" }, by("A")));
  assert.equal(r.ok && (r.result as { ok: boolean }).ok, false, "a save based on an older version is refused after the re-read");
  assert.equal((await stored(s)).list[0].name, "B's name");

  assert.deepEqual(await shared(s, (doc) => applyDelete(doc, SEED.id)), { ok: true, result: "This is the default. Make another timetable the default first." });
  assert.deepEqual(await shared(s, (doc) => applyDefault(doc, after.list[1].id)), { ok: true, result: null });
  assert.deepEqual(await shared(s, (doc) => applyDelete(doc, SEED.id)), { ok: true, result: null });
  assert.deepEqual((await stored(s)).list.map((t) => t.name), ["Section A", "Section C", "Section E"]);
}
{
  const s = memoryStore();
  await s.write(path, { not: "timetables" }, null);
  assert.deepEqual(await shared(s, create("X")), { ok: false, reason: "unavailable" }, "an unreadable document is never replaced");
  assert.deepEqual((await s.read(path))!.value, { not: "timetables" });
}

console.log("store ok");
