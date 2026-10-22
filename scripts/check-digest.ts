// Run: node scripts/check-digest.ts
import assert from "node:assert/strict";
import { memoryStore, type DocStore } from "../src/lib/doc.ts";
import { createDigest } from "../src/lib/digest-core.ts";
import type { Announcement } from "../src/lib/data.ts";
import type { User } from "../src/lib/session.ts";

const logs: string[] = [];
console.log = (...a) => void logs.push(a.join(" "));
console.error = () => {};

const MIN = 60_000;
const KEY = "gsk_test_key_one";
let t = Date.parse("2026-01-01T00:00:00Z");
const now = () => t;

type Reply = (ids: number[], call: number) => Response | Error;
let calls = 0;
let reply: Reply = () => new Response("{}", { status: 500 });
const idsIn = (body: string) => [...String(JSON.parse(body).messages[1].content).matchAll(/"id": (\d+)/g)].map((m) => Number(m[1]));
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  assert.match(url, /api\.(groq|anthropic)\.com/, "only the AI providers are called");
  calls++;
  const r = reply(url.includes("groq") ? idsIn(String(init?.body)) : [], calls);
  if (r instanceof Error) throw r;
  return r;
}) as typeof fetch;

const item = (id: number) => ({ id, title: `t${id}`, summary: "s", actions: [], dates: [], kind: "info", forMe: true });
const ok = (skip: number[] = []): Reply => (ids) =>
  Response.json({ choices: [{ message: { content: JSON.stringify({ items: ids.filter((i) => !skip.includes(i)).map(item) }) } }] });
const status = (n: number, headers: Record<string, string> = {}) => new Response("nope", { status: n, headers });

const user = (n: number) => ({ college: { name: "Test College" }, userid: n, site: "x" }) as unknown as User;
// each announcement is large enough to fill a batch of its own
const ann = (id: number) => ({ id, courseid: 1, name: `n${id}`, message: `<p>${"word ".repeat(1200)}</p>`, timemodified: 1_700_000_000, discussion: id, userfullname: "A" }) as unknown as Announcement;
const news = (...ids: number[]) => ids.map(ann);

function setup(store: DocStore = memoryStore()) {
  process.env.GROQ_API_KEY = KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t = Date.parse("2026-01-01T00:00:00Z");
  calls = 0;
  logs.length = 0;
  const d = createDigest({ store, now, userKey: (u) => String(u.userid) });
  const refresh = async (n: number, ids: number[]) => {
    const before = calls;
    await d.refresh(user(n), news(...ids), [], null);
    return calls - before;
  };
  return { d, store, refresh };
}

{
  const { d, store, refresh } = setup();
  reply = () => status(401);
  const first = await refresh(1, [1, 2, 3, 4]);
  assert.ok(first >= 1 && first <= 4, "a rejected key costs at most one call per batch");
  assert.equal(first, 1, "and the run stops at the first rejection");
  assert.equal(await refresh(2, [1, 2]), 0, "another user is gated");
  t += 11 * MIN;
  assert.equal(await refresh(1, [1, 2, 3, 4]), 0, "the same user is gated after the 10 minute gap");
  t += 5 * 60 * MIN;
  assert.equal(await refresh(3, [1]), 0, "still gated at 5h 11min");
  assert.ok(await d.paused(), "the pages are told summaries are paused");
  const stored = JSON.stringify([...(store as ReturnType<typeof memoryStore>).raw]);
  assert.ok(!stored.includes(KEY) && !logs.join("\n").includes(KEY), "the key is never stored or logged");
  assert.ok(logs.some((l) => l.includes("Groq rejected GROQ_API_KEY (401); pausing AI summaries for 6h. Replace the key to resume.")), "one clear log line");
  t += 61 * MIN;
  assert.equal(await refresh(3, [1]), 1, "the gate ends after 6h");
  process.env.GROQ_API_KEY = "gsk_test_key_two";
  const before = calls;
  assert.ok(!(await d.paused()), "a new key lifts the gate at once");
  assert.equal(await refresh(4, [1]), 1, "and is tried");
  assert.equal(calls - before, 1);
}

{
  const { refresh } = setup();
  reply = () => status(429, { "retry-after": "120" });
  assert.equal(await refresh(1, [1, 2, 3, 4]), 1, "a 429 stops the run with no retry");
  t += 119_000;
  assert.equal(await refresh(2, [1]), 0, "no calls before retry-after");
  t += 2_000;
  reply = ok();
  assert.ok((await refresh(2, [1])) > 0, "calls resume after retry-after");
}

{
  const { refresh } = setup();
  reply = () => status(429, { "retry-after": "1" });
  await refresh(1, [1]);
  t += 29_000;
  assert.equal(await refresh(2, [1]), 0, "retry-after is raised to 30 s");
  t += 2_000;
  reply = ok();
  assert.ok((await refresh(2, [1])) > 0);
}

{
  const { refresh } = setup();
  reply = () => status(429);
  await refresh(1, [1]);
  t += 59_000;
  assert.equal(await refresh(2, [1]), 0, "a 429 with no header waits 60 s");
}

{
  const { refresh } = setup();
  reply = () => status(429, { "retry-after": "99999" });
  await refresh(1, [1]);
  t += 15 * MIN + 1000;
  reply = ok();
  assert.ok((await refresh(2, [1])) > 0, "retry-after is capped at 15 min");
}

for (const [name, fail] of [["a 503", () => status(503)], ["a network error", () => new TypeError("fetch failed")]] as const) {
  const { refresh } = setup();
  reply = fail;
  assert.equal(await refresh(1, [1, 2]), 1, `${name} stops the run`);
  t += 119_000;
  assert.equal(await refresh(2, [1]), 0, `${name} pauses for 2 min`);
  t += 2_000;
  reply = ok();
  assert.ok((await refresh(2, [1])) > 0, `and then calls resume after ${name}`);
}

{
  const { refresh } = setup();
  reply = ok();
  assert.equal(await refresh(1, [1, 2]), 2, "one call per batch");
  assert.equal(await refresh(1, [1, 2]), 0, "everything is summarized");
  assert.equal(await refresh(1, [1, 2, 3]), 0, "a new announcement waits for the 10 minute gap");
  t += 9 * MIN;
  assert.equal(await refresh(1, [1, 2, 3]), 0, "still waiting at 9 min");
  t += 2 * MIN;
  assert.equal(await refresh(1, [1, 2, 3]), 1, "summarizes only the new one after 10 min");
  t += 13 * 60 * MIN;
  assert.equal(await refresh(1, [1, 2, 3]), 3, "stale summaries are redone");
}

{
  const { d, refresh } = setup();
  reply = (ids) => (ids.includes(2) ? status(400) : ok()(ids, 0));
  assert.equal(await refresh(1, [1, 2, 3, 4]), 4, "a failed batch does not stop the other batches");
  assert.equal(calls, 4, "and no stragglers pass runs after it");
  assert.equal((await d.read(user(1), news(1, 2, 3, 4))).items.size, 3);
}

{
  const { refresh } = setup();
  reply = ok([3]);
  assert.equal(await refresh(1, [1, 2, 3, 4]), 5, "after a clean pass the stragglers get one more call");
}

{
  const { refresh } = setup();
  reply = ok();
  let served = 0;
  for (let n = 1; n <= 61; n++) served += await refresh(n, [1]);
  assert.equal(served, 60, "an instance makes at most 60 model calls an hour");
  assert.equal(logs.filter((l) => l.includes("model calls in the last hour")).length, 1, "and says so once");
  t += 61 * MIN;
  assert.equal(await refresh(61, [1]), 1, "calls resume when the hour has passed");
}

{
  const base = memoryStore();
  let broken = true;
  const flaky: DocStore = {
    read: (p) => (broken && p === "digest/_gate.json" ? Promise.reject(new Error("store down")) : base.read(p)),
    write: (p, v, e) => base.write(p, v, e),
  };
  const { refresh } = setup(flaky);
  reply = ok();
  assert.equal(await refresh(1, [1]), 0, "an unreadable gate means no calls");
  broken = false;
  t += 3 * MIN;
  assert.equal(await refresh(1, [1]), 1, "calls resume 2 min after");
}

{
  const { refresh } = setup();
  delete process.env.GROQ_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  reply = () => Response.json({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, { status: 401 });
  assert.equal(await refresh(1, [1, 2]), 1, "Claude: a rejected key stops the run");
  assert.equal(await refresh(2, [1]), 0, "Claude: and gates other users");
  assert.ok(logs.some((l) => l.includes("Claude rejected ANTHROPIC_API_KEY (401)")));
  process.env.GROQ_API_KEY = KEY;
  reply = ok();
  assert.ok((await refresh(3, [1])) > 0, "Groq is not held back by a Claude gate");
}

process.stdout.write("digest ok\n");
