import Link from "next/link";
import { requireUser } from "@/lib/session.ts";
import { getAnnouncements, getCourses, getNotifications, type Announcement } from "@/lib/data.ts";
import { getDigest, type DigestItem } from "@/lib/digest.ts";
import { getDoneUpdates } from "@/lib/prefs.ts";
import { EVENTS } from "@/lib/sit/calendar.ts";
import { ago, cleanCourse, cleanHtml, cleanTitle, countWord, stripHtml, time12, todayIST, truncate } from "@/lib/format.ts";
import { toggleUpdateDone } from "../actions.ts";

const TZ = "Asia/Kolkata";
const d8 = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: TZ, ...o });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysUntil = (iso: string, today: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
type Row = { a: Announcement; d?: DigestItem; course: string };
type Dated = { label: string; date: string; time: string | null; kind: string; row: Row };

// Links teachers shared, named by where they go.
function linksIn(html: string, site: string) {
  const urls = [...new Set([...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0].replace(/[.,;]+$/, "")))];
  return urls.map((url) => {
    const host = new URL(url).hostname;
    const label = host.includes("notebook.google") ? "NotebookLM" : host.includes("forms.gle") || host.includes("docs.google.com/forms") ? "Form" : host === new URL(site).hostname ? "File" : host.replace(/^www\./, "");
    return { url, label };
  });
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "todo", label: "To do" },
  { key: "tests", label: "Tests" },
  { key: "links", label: "Study links" },
  { key: "results", label: "Results" },
] as const;

export default async function Updates({ searchParams }: PageProps<"/notifications">) {
  const u = await requireUser();
  const f = String((await searchParams).f ?? "all");
  const [news, courses, { notifications }, done] = await Promise.all([
    getAnnouncements(u),
    getCourses(u),
    getNotifications(u).catch(() => ({ notifications: [], unreadcount: 0 })),
    getDoneUpdates(),
  ]);
  const digest = await getDigest(u, news, courses);
  const today = todayIST();
  const doneSet = new Set(done);
  const nameOf = new Map(courses.map((c) => [c.id, cleanCourse(c.fullname)]));
  const rows: Row[] = news.slice(0, 60).map((a) => ({ a, d: digest.items.get(a.id), course: nameOf.get(a.courseid) ?? "" }));
  const recent = (r: Row) => daysUntil(today, new Date(r.a.timemodified * 1000).toLocaleDateString("en-CA", { timeZone: TZ })) <= 30;

  const mine = rows.filter((r) => r.d?.forMe !== false);
  const notMine = rows.filter((r) => r.d?.forMe === false);
  const upcoming = (r: Row) => (r.d?.dates ?? []).filter((x) => x.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0];
  const isTodo = (r: Row) =>
    !!r.d &&
    recent(r) &&
    r.d.kind !== "resource" &&
    r.d.kind !== "result" &&
    // real tasks: assignments and tests, or anything else that asks for something by a date
    (r.d.kind === "assignment" || r.d.kind === "exam" || (r.d.actions.length > 0 && r.d.dates.length > 0)) &&
    (r.d.dates.length === 0 || !!upcoming(r));
  const todo = mine.filter(isTodo).sort((x, y) => (upcoming(x)?.date ?? "9999").localeCompare(upcoming(y)?.date ?? "9999"));
  const open = todo.filter((r) => !doneSet.has(r.a.id));
  const closed = todo.filter((r) => doneSet.has(r.a.id));
  const results = mine.filter((r) => r.d?.kind === "result" && recent(r));
  const links = mine
    .filter((r) => r.d?.kind === "resource")
    .flatMap((r) => linksIn(r.a.message, u.site).map((l) => ({ ...l, course: r.course, title: r.d!.title })));
  const linkGroups = Map.groupBy(links, (l) => l.course);
  const shown = new Set([...todo, ...results].map((r) => r.a.id).concat(mine.filter((r) => r.d?.kind === "resource").map((r) => r.a.id)));
  const rest = mine.filter((r) => !shown.has(r.a.id) && recent(r));

  const dated: Dated[] = mine.flatMap((r) => (doneSet.has(r.a.id) ? [] : (r.d?.dates ?? []).map((x) => ({ ...x, row: r }))));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const isTest = (x: { kind: string }) => x.kind === "exam";
  const tests = dated.filter((x) => isTest(x) && x.date >= today && x.date <= week[6]).length;
  const nextWeek = dated.filter((x) => x.date > week[6] && x.date <= addDays(today, 14));
  const counts: Record<string, number> = { todo: open.length, tests, links: links.length, results: results.length };

  const headline = digest.items.size
    ? `${open.length === 0 ? "Nothing" : countWord(open.length)} to do${tests ? `, ${countWord(tests).toLowerCase()} ${tests === 1 ? "test" : "tests"} this week` : ""}.`
    : "Updates";
  const show = (k: string) => f === "all" || f === k;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-muted">
            {digest.updatedAt ? `AI digest of your latest announcements, updated ${ago(digest.updatedAt / 1000)}` : "Announcements from your courses"}
            {digest.pending > 0 && (digest.paused ? ". AI summaries are paused" : `. Summarizing ${digest.pending} more, refresh in a minute`)}
          </p>
          <h1 className="mt-2.5 text-[26px] leading-[1.2] font-medium tracking-[-0.02em] md:text-[40px] md:leading-[1.15] md:tracking-[-0.025em]">{headline}</h1>
        </div>
        <nav aria-label="Filter updates" className="flex max-w-full gap-1 overflow-x-auto rounded-[10px] border border-line p-[3px] text-[13px] [scrollbar-width:none]">
          {FILTERS.map((x) => (
            <Link
              key={x.key}
              href={x.key === "all" ? "/notifications" : `/notifications?f=${x.key}`}
              aria-current={f === x.key ? "page" : undefined}
              className="shrink-0 rounded-[7px] px-3 py-1.5 text-muted hover:text-fg aria-[current=page]:bg-subtle aria-[current=page]:font-medium aria-[current=page]:text-fg"
            >
              {x.label}
              {x.key !== "all" && counts[x.key] > 0 && <span className="ml-1">{counts[x.key]}</span>}
            </Link>
          ))}
        </nav>
      </div>

      {f === "all" && digest.items.size > 0 && (
        <section aria-label="This week" className="mt-10">
          <div className="grid auto-cols-[minmax(124px,1fr)] grid-flow-col overflow-x-auto rounded-xl border border-line [scrollbar-width:none]">
            {week.map((day, i) => {
              const items = dated.filter((x) => x.date === day);
              const cal = !u.college.sit ? [] : EVENTS.filter((e) => (e.kind === "Holiday" ? e.start <= day && day <= e.end : e.start === day));
              const sunday = new Date(`${day}T00:00:00Z`).getUTCDay() === 0;
              return (
                <div key={day} className={`min-h-[150px] p-3 ${i < 6 ? "border-r border-line" : ""} ${i === 0 ? "bg-subtle/50" : ""}`}>
                  <p className={`text-xs ${i === 0 ? "font-semibold" : "text-muted"}`}>{i === 0 ? "Today" : d8(day, { weekday: "short" })}</p>
                  <p className={`mt-0.5 mb-2.5 text-[22px] font-medium ${sunday && !items.length ? "text-muted/60" : ""}`}>{d8(day, { day: "numeric" })}</p>
                  <div className="flex flex-col gap-1.5">
                    {cal.map((e) => (
                      <div key={e.name} className={`rounded-md px-2 py-1.5 text-xs leading-snug ${e.kind === "Holiday" ? "bg-subtle text-muted" : "border border-dashed border-line text-muted"}`}>
                        {e.name}
                      </div>
                    ))}
                    {items.map((x, j) => (
                      <a
                        key={j}
                        href={`#u${x.row.a.id}`}
                        className={`rounded-md px-2 py-1.5 text-xs leading-snug ${isTest(x) ? "bg-test-bg text-test-fg" : i === 0 ? "bg-urgent-bg text-urgent-fg" : "bg-subtle"}`}
                      >
                        {x.time ? `${time12(x.time)}, ` : ""}
                        {x.label}
                        <span className="mt-1 block font-semibold">{x.row.course}</span>
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {nextWeek.length > 0 && (
            <p className="mt-2.5 text-xs text-muted">
              Next week: {nextWeek.map((x) => `${x.label} (${d8(x.date, { weekday: "short", day: "numeric", month: "short" })})`).join("; ")}.
            </p>
          )}
        </section>
      )}

      <div className={`mt-12 grid grid-cols-1 gap-14 ${f === "all" ? "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-16" : ""}`}>
        {(show("todo") || show("tests")) && (
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="h2">{f === "tests" ? "Tests" : "To do"}</h2>
              {f !== "tests" && <span className="text-[13px] text-muted">Tick when done</span>}
            </div>
            {!digest.items.size ? (
              <p className="mt-3 text-sm text-muted">{digest.paused ? "AI summaries are paused for now." : digest.pending ? "Summarizing your announcements. This page fills in within a minute or two." : "Add an AI key to get a to-do list from your announcements."}</p>
            ) : (
              <div className="list mt-3">
                {(f === "tests" ? open.filter((r) => r.d!.kind === "exam" || r.d!.dates.some(isTest)) : open).map((r) => (
                  <TodoRow key={r.a.id} site={u.site} r={r} done={false} today={today} />
                ))}
                {f !== "tests" && closed.map((r) => <TodoRow key={r.a.id} site={u.site} r={r} done today={today} />)}
                {open.length === 0 && f !== "tests" && closed.length === 0 && <p className="py-4 text-sm text-muted">Nothing to do right now.</p>}
              </div>
            )}
          </section>
        )}

        {(f === "all" || f === "links" || f === "results") && (
          <aside className="space-y-10">
            {show("links") && (
              <section>
                <h2 className="h2">Study links</h2>
                <p className="mt-1 text-[13px] text-muted">NotebookLM and other resources teachers shared</p>
                <div className="list mt-3 text-sm">
                  {[...linkGroups].map(([course, ls]) => (
                    <div key={course} className="flex items-baseline justify-between gap-3 py-3">
                      <span className="course min-w-0 text-sm">{course}</span>
                      <span className="flex max-w-[55%] flex-wrap justify-end gap-x-3 gap-y-1">
                        {ls.slice(0, 3).map((l, i) => (
                          <a key={i} href={l.url} target="_blank" title={l.title} className="link">{ls.length > 1 && ls.filter((x) => x.label === l.label).length > 1 ? `${l.label} ${i + 1}` : l.label}</a>
                        ))}
                      </span>
                    </div>
                  ))}
                  {!links.length && <p className="py-3 text-muted">No links shared yet.</p>}
                </div>
              </section>
            )}
            {show("results") && (
              <section>
                <h2 className="h2">Results</h2>
                <div className="list mt-3 text-sm">
                  {results.map((r) => (
                    <a key={r.a.id} href={`${u.site}/mod/forum/discuss.php?d=${r.a.discussion}`} target="_blank" className="flex items-baseline justify-between gap-3 py-3">
                      <span className="min-w-0"><span className="course block">{r.course}</span>{r.d!.title}</span>
                      <span className="shrink-0 text-[13px] text-muted">{ago(r.a.timemodified)}</span>
                    </a>
                  ))}
                  {!results.length && <p className="py-3 text-muted">No results announced recently.</p>}
                </div>
              </section>
            )}
            {f === "all" && notifications.some((n) => !n.read) && (
              <section>
                <h2 className="h2">Notifications</h2>
                <div className="list mt-3 text-sm">
                  {notifications.filter((n) => !n.read).slice(0, 5).map((n) => (
                    <a key={n.id} href={n.contexturl ?? "#"} target="_blank" className="block py-3">
                      {n.subject}
                      <span className="block text-[13px] text-muted">{ago(n.timecreated)}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}
            {f === "all" && notMine.length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm text-muted">Not for your section, {notMine.length} hidden</summary>
                <div className="list mt-3 text-sm text-muted">
                  {notMine.map((r) => (
                    <a key={r.a.id} href={`${u.site}/mod/forum/discuss.php?d=${r.a.discussion}`} target="_blank" className="block py-2.5">
                      {r.d!.title}
                      <span className="block text-xs">{r.course}</span>
                    </a>
                  ))}
                </div>
              </details>
            )}
          </aside>
        )}
      </div>

      {f === "all" && rest.length > 0 && (
        <section className="mt-16">
          <h2 className="h2">Everything else</h2>
          <div className="list mt-3">
            {rest.map((r) => (
              <details key={r.a.id} id={`u${r.a.id}`} className="group py-3.5">
                <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 text-sm md:grid-cols-[150px_minmax(0,1fr)_80px] [&::-webkit-details-marker]:hidden">
                  <span className="course order-2 md:order-none">{r.course}</span>
                  <span className="order-1 md:order-none">
                    <span className="font-medium">{r.d?.title ?? cleanTitle(r.a.name)}.</span>{" "}
                    <span className="text-muted">{r.d?.summary ?? truncate(stripHtml(cleanHtml(r.a.message)), 160)}</span>
                  </span>
                  <span className="order-3 text-right text-[13px] text-muted">{ago(r.a.timemodified)}</span>
                </summary>
                <Original site={u.site} a={r.a} />
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TodoRow({ site, r, done, today }: { site: string; r: Row; done: boolean; today: string }) {
  const d = r.d!;
  const next = d.dates.filter((x) => x.date >= today).sort((x, y) => x.date.localeCompare(y.date))[0];
  const n = next ? daysUntil(next.date, today) : null;
  return (
    <div id={`u${r.a.id}`} className={`grid scroll-mt-20 grid-cols-[24px_minmax(0,1fr)] gap-3.5 py-[18px] md:grid-cols-[24px_minmax(0,1fr)_auto] ${done ? "opacity-55" : ""}`}>
      <form action={toggleUpdateDone.bind(null, r.a.id, !done)}>
        <button
          aria-label={done ? "Mark not done" : "Mark done"}
          className={`mt-[3px] grid size-[18px] place-items-center rounded-[5px] text-[11px] font-bold ${done ? "bg-fg text-bg" : "border-[1.5px] border-muted/70 hover:border-fg"}`}
        >
          {done ? "✓" : ""}
        </button>
      </form>
      <div className="min-w-0">
        <p className="flex items-baseline justify-between gap-3 text-xs text-muted">
          <span className="course">{r.course}</span>
          {next && <span className={`shrink-0 font-medium md:hidden ${next.kind === "exam" ? "text-test-fg" : "text-fg"}`}>{d8(next.date, { weekday: "short", day: "numeric" })}</span>}
        </p>
        <p className={`mt-0.5 text-[15px] font-medium ${done ? "line-through" : ""}`}>{d.title}</p>
        {!done && <p className="mt-1.5 text-sm leading-relaxed text-fg/80">{d.summary}</p>}
        {!done && d.actions.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {d.actions.map((x, i) => (
              <span key={i} className="rounded-full border border-line px-2 py-0.5 text-fg/80">{x}</span>
            ))}
          </div>
        )}
        {!done && (
          <details className="mt-2">
            <summary className="w-fit cursor-pointer text-[13px] text-accent">Show original</summary>
            <Original site={site} a={r.a} />
          </details>
        )}
      </div>
      <div className="hidden text-right md:block">
        {next ? (
          <>
            <p className={`text-[13px] font-medium ${next.kind === "exam" ? "text-test-fg" : ""}`}>
              {d8(next.date, { weekday: "short", day: "numeric" })}
              {next.time ? `, ${time12(next.time)}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted">{next.kind === "exam" ? "Test" : n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`}</p>
          </>
        ) : (
          <p className="text-[13px] text-muted">{done ? "Done" : "No date given"}</p>
        )}
      </div>
    </div>
  );
}

function Original({ site, a }: { site: string; a: Announcement }) {
  return (
    <div className="mt-2">
      <div className="prose-moodle max-w-[680px] border-l-2 border-line pl-4 text-muted" dangerouslySetInnerHTML={{ __html: cleanHtml(a.message) }} />
      <a href={`${site}/mod/forum/discuss.php?d=${a.discussion}`} target="_blank" className="link mt-2 inline-block text-[13px]">Open on the LMS</a>
    </div>
  );
}
