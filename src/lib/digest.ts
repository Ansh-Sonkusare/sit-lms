import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { after } from "next/server";
import { readJson, writeJson } from "./store.ts";
import { cleanCourse, cleanHtml, todayIST } from "./format.ts";
import { cacheKey, type Announcement, type Course } from "./data.ts";
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

const student = (u: User) =>
  u.college.sit ? `${u.college.name}. Semester III, section B, batch B1, odd semester 2026-27.` : `${u.college.name}. Section and batch unknown, so treat every announcement as for them.`;

const system = (u: User) => `You turn college LMS announcements into a clean digest for one student.
Student: ${student(u)}
Announcements are often pasted from Word or WhatsApp: ignore greetings, signatures, emoji, repeated headings and formatting noise.
Resolve partial or relative dates ("by Friday", "22-24 Sept") against the posted date. Never invent a date that isn't stated.
In summaries and actions write dates like "23 Oct" or "Fri 23 Oct", never YYYY-MM-DD.
Return exactly one item for every announcement you are given, using its id. Do not skip any.`;

const Out = z.strictObject({ items: z.array(Item) });
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the $schema key from the generated schema
const { $schema, ...OUT_SCHEMA } = z.toJSONSchema(Out);

// Groq's free tier (OpenAI-compatible, strict JSON schema on gpt-oss) when GROQ_API_KEY is set; Claude otherwise.
async function viaGroq(system: string, user: string) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
    // free tier is tokens-per-minute limited: wait it out a few times
    if (res.status === 429 && attempt < 8) {
      await new Promise((r) => setTimeout(r, Math.min(Number(res.headers.get("retry-after")) || 15, 60) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return Out.parse(JSON.parse(data.choices[0].message.content)).items;
  }
}

async function viaClaude(system: string, user: string) {
  const res = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(Out) },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error(`digest failed: ${res.stop_reason}`);
  return res.parsed_output.items;
}

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
type Store = { items: Record<string, Entry> };
const STALE = 12 * 60 * 60_000; // re-read summaries this often even if unchanged
const KEEP = 60; // newest announcements kept in the cache

const entryKey = (a: Announcement) => `${a.id}:${a.timemodified}`;
const pathOf = (u: User) => `digest/${encodeURIComponent(cacheKey(u))}.json`;
const running = new Map<string, Promise<void>>();

export type Digest = { items: Map<number, DigestItem>; pending: number; updatedAt: number | null };

// What's cached right now, without calling the AI. Stale entries are still shown until refreshed.
export async function readDigest(u: User, news: Announcement[]): Promise<Digest & { needs: Announcement[] }> {
  const store = (await readJson<Store>(pathOf(u)).catch(() => null)) ?? { items: {} };
  const items = new Map<number, DigestItem>();
  const needs: Announcement[] = [];
  let updatedAt: number | null = null;
  for (const a of news.slice(0, KEEP)) {
    const e = store.items[entryKey(a)];
    if (e) {
      items.set(a.id, e.d);
      updatedAt = Math.max(updatedAt ?? 0, e.at);
    }
    if (!e || Date.now() - e.at > STALE) needs.push(a);
  }
  return { items, pending: needs.length, updatedAt, needs };
}

// Summarize only what's new, changed or stale, then save. One run per user at a time.
export function refreshDigest(u: User, news: Announcement[], courses: Course[]): Promise<void> {
  const ask = process.env.GROQ_API_KEY ? viaGroq : process.env.ANTHROPIC_API_KEY ? viaClaude : null;
  if (!ask) return Promise.resolve();
  const key = cacheKey(u);
  const live = running.get(key);
  if (live) return live;
  const job = (async () => {
    const { needs } = await readDigest(u, news);
    if (!needs.length) return;
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
      const store = (await readJson<Store>(pathOf(u)).catch(() => null)) ?? { items: {} };
      for (const a of needs) {
        const d = got.get(a.id);
        if (d) store.items[entryKey(a)] = { at: Date.now(), d };
      }
      const keep = new Set(news.slice(0, KEEP).map(entryKey));
      for (const k of Object.keys(store.items)) if (!keep.has(k)) delete store.items[k];
      await writeJson(pathOf(u), store);
    };
    const got = new Map<number, DigestItem>();
    const run = async (part: typeof input) => {
      const items = await ask(system(u), `Today is ${todayIST()}.\n\nAnnouncements:\n${JSON.stringify(part, null, 1)}`);
      const fresh = new Map<number, DigestItem>();
      for (const it of items) if (part.some((p) => p.id === it.id)) fresh.set(it.id, it);
      fresh.forEach((v, k) => got.set(k, v));
      if (fresh.size) await save(fresh);
    };
    for (const part of batches(input)) await run(part).catch((e) => console.error("[digest]", e.message));
    // models occasionally skip an item; give the stragglers one more go
    for (const part of batches(input.filter((p) => !got.has(p.id)))) await run(part).catch(() => {});
    console.log(`[digest] saved ${got.size} of ${needs.length}`);
  })().finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

// Pages call this: cached digest now, and a background refresh after the response if anything is missing.
export async function getDigest(u: User, news: Announcement[], courses: Course[]): Promise<Digest> {
  const d = await readDigest(u, news).catch(() => ({ items: new Map(), pending: 0, updatedAt: null, needs: [] }));
  if (d.needs.length) after(() => refreshDigest(u, news, courses).catch((e) => console.error("[digest]", e)));
  return { items: d.items, pending: d.needs.filter((a) => !d.items.has(a.id)).length, updatedAt: d.updatedAt };
}
