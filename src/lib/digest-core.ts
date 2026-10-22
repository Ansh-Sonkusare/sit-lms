import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { createHash } from "node:crypto";
import { z } from "zod";
import { update, type DocStore } from "./doc.ts";
import { cached, clearCache } from "./moodle.ts";
import { cleanCourse, cleanHtml, todayIST } from "./format.ts";
import type { Announcement, Course } from "./data.ts";
import type { User } from "./session.ts";

// Plain text for the model, keeping link targets.
const toText = (html: string) =>
  cleanHtml(html)
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

const Item = z.strictObject({
  id: z.number(),
  title: z.string().describe("A clean 3-8 word title, e.g. 'CA3: poster and Red Hat certificate'. No emoji, no 'Announcement', no section tags."),
  summary: z.string().describe("One or two plain sentences on what this means for the student. No greeting, no sign-off."),
  actions: z.array(z.string()).describe("0-3 short things the student must do, imperative mood. Empty if purely informational."),
  dates: z
    .array(
      z.strictObject({
        label: z.string().describe("Short name, e.g. 'CA3 written test' or 'Unit 1-3 assignment hardcopy'"),
        date: z.string().describe("YYYY-MM-DD"),
        time: z.string().nullable().describe("HH:MM 24-hour, or null if not stated"),
        kind: z.enum(["due", "exam", "event", "other"]),
      }),
    )
    .describe("Every concrete dated item in the announcement."),
  kind: z.enum(["assignment", "exam", "result", "resource", "schedule", "info"]).describe("result = marks or grades released; resource = study material or links shared"),
  forMe: z.boolean().describe("False only if it clearly targets a different section or batch than the student's."),
});
export type DigestItem = z.infer<typeof Item>;

// `timetable`: the student's timetable label ("Semester III · Section B, batch B1"), when known.
const student = (u: User, timetable: string | null) =>
  timetable ? `${u.college.name}. ${timetable}.` : `${u.college.name}. Section and batch unknown, so treat every announcement as for them.`;

const system = (u: User, timetable: string | null) => `You turn college LMS announcements into a clean digest for one student.
Student: ${student(u, timetable)}
Announcements are often pasted from Word or WhatsApp: ignore greetings, signatures, emoji, repeated headings and formatting noise.
Resolve partial or relative dates ("by Friday", "22-24 Sept") against the posted date. Never invent a date that isn't stated.
In summaries and actions write dates like "23 Oct" or "Fri 23 Oct", never YYYY-MM-DD.
Return exactly one item for every announcement you are given, using its id. Do not skip any.`;

const Out = z.strictObject({ items: z.array(Item) });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the $schema key from the generated schema
const { $schema, ...OUT_SCHEMA } = z.toJSONSchema(Out);


type Reason = "bad-key" | "rate-limited" | "unavailable";
// Shared by every user and instance through the document store. It applies to one API key only (`key` is a
// fingerprint, never the key), so a replaced key lifts it at once.
type Gate = { until: number; reason: Reason; key: string };

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const PAUSE = { "bad-key": 6 * HOUR, unavailable: 2 * MINUTE } as const;
const GATE_PATH = "digest/_gate.json";
const GATE_CACHE = 30 * SECOND;
const TRY_GAP = 10 * MINUTE; // per user, whatever the last attempt's outcome
const CALLS_PER_HOUR = 60; // per instance, however many users ask

class Paused extends Error {
  reason: Reason;
  ms: number;
  status?: number;
  constructor(reason: Reason, ms: number, status?: number) {
    super(`paused: ${reason}`);
    this.reason = reason;
    this.ms = ms;
    this.status = status;
  }
}

// What a provider's HTTP status says about the key and the service, or null for an error that says nothing about either.
function pauseFor(status: number, retryAfter: string | null | undefined): Paused | null {
  if (status === 401 || status === 403) return new Paused("bad-key", PAUSE["bad-key"], status);
  if (status === 429) return new Paused("rate-limited", Math.min(Math.max((Number(retryAfter) || 60) * SECOND, 30 * SECOND), 15 * MINUTE), status);
  if (status >= 500) return new Paused("unavailable", PAUSE.unavailable, status);
  return null;
}

// Groq's free tier (OpenAI-compatible, strict JSON schema on gpt-oss). It is tokens-per-minute limited, so a 429 ends the run.
async function viaGroq(system: string, user: string) {
  let res: Response;
  try {
    res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
        reasoning_effort: "low",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "digest", strict: true, schema: OUT_SCHEMA } },
      }),
    });
  } catch {
    throw new Paused("unavailable", PAUSE.unavailable);
  }
  if (!res.ok) throw pauseFor(res.status, res.headers.get("retry-after")) ?? new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return Out.parse(JSON.parse(data.choices[0].message.content)).items;
}

async function viaClaude(system: string, user: string) {
  let res;
  try {
    res = await new Anthropic({ maxRetries: 0 }).beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Out) },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIConnectionError) throw new Paused("unavailable", PAUSE.unavailable);
    if (e instanceof Anthropic.APIError && e.status) throw pauseFor(e.status, e.headers?.get("retry-after")) ?? e;
    throw e;
  }
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`digest failed: ${res.stop_reason}`);
  return res.parsed_output.items;
}

// Groq when GROQ_API_KEY is set, Claude otherwise. Read per call, so a redeploy with a new key is noticed.
const PROVIDERS = [
  { name: "Groq", env: "GROQ_API_KEY", ask: viaGroq },
  { name: "Claude", env: "ANTHROPIC_API_KEY", ask: viaClaude },
] as const;
function provider() {
  for (const p of PROVIDERS) {
    const key = process.env[p.env];
    if (key) return { ...p, fingerprint: createHash("sha256").update(key).digest("hex").slice(0, 12) };
  }
  return null;
}
type Provider = NonNullable<ReturnType<typeof provider>>;

// Groq's free tier allows ~8k tokens/minute, so batch by size (~1.5k input tokens) rather than count.
const BATCH_CHARS = 6000;
function batches<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const x of xs) {
    const n = JSON.stringify(x).length;
    if (cur.length && size + n > BATCH_CHARS) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(x);
    size += n;
  }
  if (cur.length) out.push(cur);
  return out;
}

type Entry = { at: number; d: DigestItem };
type Store = { items: Record<string, Entry>; triedAt?: number };
const STALE = 12 * 60 * 60_000; // re-read summaries this often even if unchanged
const KEEP = 60; // newest announcements kept in the cache

const entryKey = (a: Announcement) => `${a.id}:${a.timemodified}`;

export type Digest = { items: Map<number, DigestItem>; pending: number; updatedAt: number | null; paused: boolean };
export type Cached = Omit<Digest, "paused"> & { needs: Announcement[]; triedAt?: number };

const parseGate = (v: unknown): Gate | null => {
  const g = v as Partial<Gate> | null;
  return g && typeof g.until === "number" && typeof g.reason === "string" && typeof g.key === "string" ? (g as Gate) : null;
};

let instances = 0;

// `userKey` names a user's digest document. `now` is injectable so tests can move time.
export function createDigest({ store, now, userKey }: { store: DocStore; now: () => number; userKey: (u: User) => string }) {
  const cacheId = `digest-gate:${++instances}`;
  const pathOf = (u: User) => `digest/${encodeURIComponent(userKey(u))}.json`;
  const running = new Map<string, Promise<void>>();
  const calls: number[] = [];
  let overBudgetLoggedAt = 0;
  let unreadableUntil = 0;
  let local: Gate | null = null; // a gate this instance set, in case the store won't take the write

  // The gate that applies to this key right now, if any. When the store can't be read we don't call the model blind.
  async function activeGate(p: Provider): Promise<Gate | null> {
    const mine = (g: Gate | null) => (g && g.key === p.fingerprint && now() < g.until ? g : null);
    if (now() < unreadableUntil) return { until: unreadableUntil, reason: "unavailable", key: p.fingerprint };
    const here = mine(local);
    if (here) return here;
    try {
      return mine(parseGate((await cached(cacheId, GATE_CACHE, () => store.read(GATE_PATH)))?.value));
    } catch (e) {
      console.error("[digest] gate unreadable, pausing AI summaries for 2 min", e);
      unreadableUntil = now() + PAUSE.unavailable;
      return { until: unreadableUntil, reason: "unavailable", key: p.fingerprint };
    }
  }

  async function closeGate(p: Provider, e: Paused) {
    const gate: Gate = { until: now() + e.ms, reason: e.reason, key: p.fingerprint };
    local = gate;
    const mins = Math.round(e.ms / MINUTE);
    const span = e.ms >= HOUR ? `${e.ms / HOUR}h` : mins >= 1 ? `${mins} min` : `${Math.round(e.ms / SECOND)}s`;
    console.log(
      e.reason === "bad-key"
        ? `[digest] ${p.name} rejected ${p.env} (${e.status}); pausing AI summaries for ${span}. Replace the key to resume.`
        : `[digest] ${p.name} ${e.reason} (${e.status ?? "no response"}); pausing AI summaries for ${span}.`,
    );
    await update(store, GATE_PATH, (cur) => {
      const old = parseGate(cur?.value);
      return old && old.key === gate.key && old.until >= gate.until ? { result: null } : { write: gate, result: null };
    });
    clearCache(cacheId);
  }

  // At most CALLS_PER_HOUR model calls an hour from this instance.
  function takeCall() {
    while (calls.length && now() - calls[0] >= HOUR) calls.shift();
    if (calls.length >= CALLS_PER_HOUR) {
      if (now() - overBudgetLoggedAt >= HOUR) {
        overBudgetLoggedAt = now();
        console.log(`[digest] ${CALLS_PER_HOUR} model calls in the last hour; skipping AI summaries until it drops.`);
      }
      return false;
    }
    calls.push(now());
    return true;
  }

  // Cached digest, without calling the AI. Stale entries are still shown until refreshed.
  async function read(u: User, news: Announcement[]): Promise<Cached> {
    const stored = ((await store.read(pathOf(u)).catch(() => null))?.value as Store | undefined) ?? { items: {} };
    const items = new Map<number, DigestItem>();
    const needs: Announcement[] = [];
    let updatedAt: number | null = null;
    for (const a of news.slice(0, KEEP)) {
      const e = stored.items[entryKey(a)];
      if (e) {
        items.set(a.id, e.d);
        updatedAt = Math.max(updatedAt ?? 0, e.at);
      }
      if (!e || now() - e.at > STALE) needs.push(a);
    }
    return { items, pending: needs.length, updatedAt, needs, triedAt: stored.triedAt };
  }

  // True when AI summaries are switched off for now by a gate. False with no API key, which is a different message.
  async function paused() {
    const p = provider();
    return !!p && !!(await activeGate(p));
  }

  // Whether a refresh may call the model: something is missing, we didn't just try, and the provider isn't gated.
  async function due(d: Pick<Cached, "needs" | "triedAt">) {
    const p = provider();
    if (!p || !d.needs.length) return false;
    if (d.triedAt !== undefined && now() - d.triedAt < TRY_GAP) return false;
    return !(await activeGate(p));
  }

  // Summarize only what's new, changed or stale, then save. One run per user at a time.
  function refresh(u: User, news: Announcement[], courses: Course[], timetable: string | null): Promise<void> {
    const p = provider();
    if (!p) return Promise.resolve();
    const key = userKey(u);
    const live = running.get(key);
    if (live) return live;
    const job = (async () => {
      const d = await read(u, news);
      if (!(await due(d))) return;
      const marked = await update(store, pathOf(u), (cur) => {
        const stored = (cur?.value as Store | undefined) ?? { items: {} };
        return { write: { ...stored, triedAt: now() }, result: null };
      });
      if (!marked.ok) return;
      const { needs } = d;
      const name = (id: number) => cleanCourse(courses.find((c) => c.id === id)?.fullname ?? "");
      const input = needs.map((a) => ({
        id: a.id,
        course: name(a.courseid),
        author: a.userfullname ?? "",
        posted: new Date(a.timemodified * 1000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
        subject: a.name,
        text: toText(a.message),
      }));
      // save after every batch so progress survives a cut-off background run
      const save = async (got: Map<number, DigestItem>) => {
        await update(store, pathOf(u), (cur) => {
          const stored = (cur?.value as Store | undefined) ?? { items: {} };
          for (const a of needs) {
            const d = got.get(a.id);
            if (d) stored.items[entryKey(a)] = { at: now(), d };
          }
          const keep = new Set(news.slice(0, KEEP).map(entryKey));
          for (const k of Object.keys(stored.items)) if (!keep.has(k)) delete stored.items[k];
          return { write: stored, result: null };
        });
      };
      const got = new Map<number, DigestItem>();
      // "ok", "failed" (try the next batch) or "stop" (a gate or the call budget ended the run).
      const run = async (part: typeof input): Promise<"ok" | "failed" | "stop"> => {
        if (!takeCall()) return "stop";
        try {
          const items = await p.ask(system(u, timetable), `Today is ${todayIST()}.\n\nAnnouncements:\n${JSON.stringify(part, null, 1)}`);
          const fresh = new Map<number, DigestItem>();
          for (const it of items) if (part.some((x) => x.id === it.id)) fresh.set(it.id, it);
          fresh.forEach((v, k) => got.set(k, v));
          if (fresh.size) await save(fresh);
          return "ok";
        } catch (e) {
          if (e instanceof Paused) {
            await closeGate(p, e);
            return "stop";
          }
          console.error("[digest]", e instanceof Error ? e.message : e);
          return "failed";
        }
      };
      let clean = true;
      for (const part of batches(input)) {
        const r = await run(part);
        if (r !== "ok") clean = false;
        if (r === "stop") break;
      }
      // models occasionally skip an item; give the stragglers one more go, but only after a clean first pass
      if (clean) for (const part of batches(input.filter((x) => !got.has(x.id)))) if ((await run(part)) === "stop") break;
      console.log(`[digest] saved ${got.size} of ${needs.length}`);
    })().finally(() => running.delete(key));
    running.set(key, job);
    return job;
  }

  return { read, refresh, due, paused };
}
