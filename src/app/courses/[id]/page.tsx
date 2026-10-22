import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import {
  getCourses,
  getCourseContents,
  getAnnouncements,
  getAssignments,
  getDeadlines,
  getAttendance,
  getCourseMarks,
  type Module,
} from "@/lib/data.ts";
import {
  ago,
  budgetText,
  cleanCourse,
  fileExt,
  fileSize,
  fmtDate,
  fmtTime,
  relDay,
  stripHtml,
  TARGET,
  todayIST,
} from "@/lib/format.ts";
import CourseSearch from "@/components/CourseSearch.tsx";
import CourseTabs from "@/components/CourseTabs.tsx";
import AnnouncementItem from "@/components/AnnouncementItem.tsx";
import { getDigest } from "@/lib/digest.ts";
import MarksCalendar from "@/components/MarksCalendar.tsx";
import { coursesOf, remainingByCourse } from "@/lib/sit/timetable.ts";
import { getSchedule } from "@/lib/timetables.ts";
import { dayLabel, dotsByDay, type CourseMarks } from "@/lib/sit/marks.ts";

const file = (url: string) => `/api/file?url=${encodeURIComponent(url)}`;
const TASKS = new Set(["assign", "quiz"]);
const NOTES = new Set(["resource", "folder", "url", "page", "label", "book"]);
const ROW =
  "grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-3 py-3";
const KIND = "text-[11px] font-semibold text-muted";

const tidy = (name: string) =>
  name
    .replace(/[-_]+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\s+/g, " ")
    .trim();

const countLabel = (notes: { kind: string }[]) => {
  const f = notes.filter((n) => n.kind === "file").length;
  const o = notes.length - f;
  return f
    ? `${f} ${f === 1 ? "file" : "files"}`
    : o
      ? `${o} ${o === 1 ? "item" : "items"}`
      : "";
};

type Note =
  | {
      kind: "file";
      key: string;
      name: string;
      url: string;
      size?: number | null;
    }
  | { kind: "link"; key: string; name: string; href: string; label: string }
  | { kind: "text"; key: string; html: string };

// One flat list per section: a resource is its main file, a folder is every file in it, links open the LMS.
function notesOf(mods: Module[]): Note[] {
  return mods.flatMap((m): Note[] => {
    const files = (m.contents ?? []).filter(
      (f) => f.type === "file" && f.fileurl,
    );
    if (m.modname === "label")
      return stripHtml(m.description ?? "")
        ? [{ kind: "text", key: `m${m.id}`, html: m.description! }]
        : [];
    if (m.modname === "resource") {
      const f = files[0]; // later files are assets of the main one (e.g. images in an HTML file)
      if (!f) return [];
      const ext = fileExt(f.filename);
      return [
        {
          kind: "file",
          key: `m${m.id}`,
          name: ext === "file" ? m.name : `${m.name}.${ext}`,
          url: f.fileurl!,
          size: f.filesize,
        },
      ];
    }
    if (m.modname === "folder")
      return files.map((f) => {
        const ext = fileExt(f.filename);
        const path = `${(f.filepath ?? "/").slice(1)}${f.filename}`;
        // a one-file folder is just that file under the folder's name
        const name =
          files.length === 1 && ext !== "file"
            ? `${m.name}.${ext}`
            : `${m.name} / ${path}`;
        return {
          kind: "file",
          key: f.fileurl!,
          name,
          url: f.fileurl!,
          size: f.filesize,
        };
      });
    const href =
      m.modname === "url" ? (m.contents?.[0]?.fileurl ?? m.url) : m.url;
    return href
      ? [
          {
            kind: "link",
            key: `m${m.id}`,
            name: m.name,
            href,
            label: m.modname === "url" ? "LINK" : "PAGE",
          },
        ]
      : [];
  });
}

function NoteRow({ n }: { n: Note }) {
  if (n.kind === "text")
    return (
      <div
        data-search={stripHtml(n.html).toLowerCase()}
        className="prose-moodle py-3 text-muted"
        dangerouslySetInnerHTML={{ __html: n.html }}
      />
    );
  if (n.kind === "link")
    return (
      <a
        href={n.href}
        target="_blank"
        data-search={n.name.toLowerCase()}
        className={ROW}
      >
        <span className={KIND}>{n.label}</span>
        <span className="text-sm hover:underline">{n.name}</span>
        <span className="text-[13px] text-muted">Opens the LMS</span>
      </a>
    );
  const ext = fileExt(n.name);
  return (
    <a
      href={file(n.url)}
      target="_blank"
      data-search={n.name.toLowerCase()}
      className={ROW}
    >
      <span className={KIND}>
        {ext === "file" ? "FILE" : ext.toUpperCase()}
      </span>
      <span className="text-sm hover:underline">
        {tidy(n.name.replace(/\.[a-z0-9]{2,5}$/i, ""))}
      </span>
      <span className="text-[13px] text-muted">{fileSize(n.size)}</span>
    </a>
  );
}

// The records and missing classes that don't line up with the timetable, newest first.
function oddDates(m: CourseMarks) {
  const markText = (s: { mark: string; leave?: boolean }) => (s.mark === "P" ? (s.leave ? "present (leave)" : "present") : "absent");
  const items = [
    ...m.sessions.flatMap((s) =>
      s.match === "moved"
        ? [{ at: s.classDate!, text: `${dayLabel(s.classDate!)} class, recorded ${dayLabel(s.date)}: ${markText(s)}` }]
        : s.match === "extra"
          ? [{ at: s.date, text: `${dayLabel(s.date)}: ${markText(s)}, no class that day in your timetable` }]
          : [],
    ),
    ...m.missing.map((x) => ({
      at: x.date,
      text: `${dayLabel(x.date)}: ${x.count > 1 ? `${x.count} classes ` : ""}not marked${x.pending ? " yet" : ""}`,
    })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export default async function Course({
  params,
  searchParams,
}: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const requested = (await searchParams).tab;
  const u = await requireUser();
  const cid = Number(id);
  const schedule = (await getSchedule(u))?.schedule ?? null;
  const timetabled = schedule ? coursesOf(schedule) : new Set<number>();
  const now = new Date().getTime();
  const [courses, sections, allNews, assigns, deadlines, att, marks] = await Promise.all([
    getCourses(u),
    getCourseContents(u, cid).catch(() => notFound()),
    getAnnouncements(u).catch(() => []),
    getAssignments(u, cid).catch(() => []),
    getDeadlines(u).catch(() => []),
    u.college.sit ? getAttendance(u).catch(() => null) : null,
    schedule ? getCourseMarks(u, schedule, cid).catch(() => null) : null,
  ]);
  const news = allNews.filter((x) => x.courseid === cid);
  // digest the full set so it shares the Updates page's cached result
  const digest = (await getDigest(u, allNews, courses)).items;
  const course = courses.find((c) => c.id === cid);
  const title = course ? cleanCourse(course.fullname) : `Course ${id}`;
  const attRow = att?.rows.find((r) => r.courseid === cid);
  const nextDue = deadlines.find((e) => e.course?.id === cid && !e.overdue);

  const dueByCm = new Map(assigns.map((a) => [a.cmid, a.duedate]));
  const dueOf = (m: Module) =>
    dueByCm.get(m.id) ||
    m.dates?.find((d) => /due|close/i.test(d.label))?.timestamp ||
    0;
  const visible = sections.map((s) => ({
    ...s,
    modules: s.modules.filter((m) => m.uservisible !== false),
  }));
  // sections with nothing to read (empty "New section" placeholders, file-less folders) are dropped
  const noteSections = visible
    .map((s) => ({
      ...s,
      summary: stripHtml(s.summary) ? s.summary : "",
      notes: notesOf(s.modules.filter((m) => NOTES.has(m.modname))),
    }))
    .filter((s) => s.notes.length || s.summary);
  const fileTotal = noteSections.reduce(
    (n, s) => n + s.notes.filter((x) => x.kind === "file").length,
    0,
  );
  // upcoming first (soonest), then past (newest)
  const tasks = visible
    .flatMap((s) => s.modules.filter((m) => TASKS.has(m.modname)))
    .sort((a, b) => {
      const [da, db] = [dueOf(a), dueOf(b)];
      const [fa, fb] = [da * 1000 >= now, db * 1000 >= now];
      return fa !== fb ? (fa ? -1 : 1) : fa ? da - db : db - da;
    });

  const tabs = [
    { key: "notes", label: "Notes", count: fileTotal },
    { key: "tasks", label: "Tasks", count: tasks.length },
    { key: "announcements", label: "Announcements", count: news.length },
  ];

  // open on the first tab that has something in it; Attendance is added after, so it is never the default
  const tab =
    typeof requested === "string"
      ? requested
      : (tabs.find((t) => t.count > 0)?.key ?? "notes");
  const showMarks = schedule && marks && (timetabled.has(cid) || marks.sessions.length > 0);
  if (showMarks) tabs.push({ key: "attendance", label: "Attendance", count: marks.sessions.length });
  const odd = marks ? oddDates(marks) : [];

  return (
    <>
      <p className="text-[13px] text-muted">
        <Link href="/courses" className="hover:underline">
          Courses
        </Link>{" "}
        {schedule && ` / ${schedule.timetable.name}`}
      </p>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">
        {title}
      </h1>

      <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-[72px]">
        <div className="min-w-0">
          <CourseTabs
            key={tab}
            tabs={tabs}
            initial={tab}
            panels={{
              notes:
                noteSections.length === 0 ? (
                  <p className="mt-6 text-sm text-muted">
                    No notes or files have been posted in this course yet.
                  </p>
                ) : (
                  <div className="mt-5">
                    <CourseSearch>
                      {noteSections.map((s, i) => (
                        <details key={s.id} open={i < 2} className="group mt-8">
                          <summary className="flex cursor-pointer list-none items-baseline justify-between text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
                            <span className="flex items-baseline gap-2">
                              <svg
                                viewBox="0 0 24 24"
                                className="size-3.5 self-center text-muted transition-transform group-open:rotate-90"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2.4}
                                aria-hidden
                              >
                                <path d="m9 6 6 6-6 6" />
                              </svg>
                              {s.name}
                            </span>
                            <span
                              data-count
                              className="text-[13px] font-normal text-muted"
                            >
                              {countLabel(s.notes)}
                            </span>
                          </summary>
                          {s.summary && (
                            <div
                              className="prose-moodle mt-2 text-muted"
                              dangerouslySetInnerHTML={{ __html: s.summary }}
                            />
                          )}
                          {s.notes.length > 0 && (
                            <div className="list mt-2.5">
                              {s.notes.map((n) => (
                                <NoteRow key={n.key} n={n} />
                              ))}
                            </div>
                          )}
                        </details>
                      ))}
                    </CourseSearch>
                  </div>
                ),
              tasks:
                tasks.length === 0 ? (
                  <p className="mt-6 text-sm text-muted">
                    No assignments or quizzes in this course.
                  </p>
                ) : (
                  <div className="list border-t-0">
                    {tasks.map((m) => {
                      const due = dueOf(m);
                      const past = due * 1000 < now;
                      return (
                        <a
                          key={m.id}
                          id={`m${m.id}`}
                          href={
                            m.modname === "assign"
                              ? `/assign/${id}/${m.id}`
                              : (m.url ?? "#")
                          }
                          target={m.modname === "assign" ? undefined : "_blank"}
                          className={ROW}
                        >
                          <span className={KIND}>
                            {m.modname === "quiz" ? "QUIZ" : "TASK"}
                          </span>
                          <span
                            className={`text-[15px] hover:underline ${past ? "text-muted" : ""}`}
                          >
                            {m.name}
                          </span>
                          <span
                            className={`text-[13px] ${past ? "text-muted" : "font-medium"}`}
                            title={due ? fmtDate(due) : undefined}
                          >
                            {due
                              ? past
                                ? `Closed ${relDay(due)}`
                                : `${relDay(due)}, ${fmtTime(due)}`
                              : ""}
                          </span>
                        </a>
                      );
                    })}
                  </div>
                ),
              announcements:
                news.length === 0 ? (
                  <p className="mt-6 text-sm text-muted">
                    Your teachers haven&apos;t posted any announcements here.
                  </p>
                ) : (
                  <div className="list max-w-[720px] border-t-0">
                    {news.map((a) => (
                      <AnnouncementItem key={a.id} site={u.site} a={a} d={digest.get(a.id)} today={todayIST()} />
                    ))}
                  </div>
                ),
              attendance: showMarks ? (
                <div className="mt-6 max-w-[760px]">
                  <p className="text-sm">
                    {attRow
                      ? `${attRow.attended} of ${attRow.marked} marked classes attended.`
                      : `${marks.sessions.filter((s) => s.mark === "P").length} of ${marks.sessions.length} marked classes attended.`}{" "}
                    <span className="text-muted">Tap a day to see every class that day.</span>
                  </p>
                  <div className="mt-6">
                    <MarksCalendar dots={dotsByDay([marks])} today={todayIST()} href={(d) => `/attendance/day?date=${d}`} />
                  </div>
                  {odd.length > 0 && (
                    <>
                      <h2 className="h2 mt-10">Dates that don&apos;t match your timetable</h2>
                      <ul className="list mt-3 text-sm">
                        {odd.map((o, i) => (
                          <li key={i} className="py-2.5">
                            {o.text}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="mt-6 text-[13px] text-muted">
                    The comparison with your timetable starts on {dayLabel(schedule.timetable.from)}. Earlier records are shown as the LMS has them.
                  </p>
                </div>
              ) : null,
            }}
          />
        </div>

        <aside className="text-sm">
          {attRow && (
            <>
              <h2 className="h3 text-muted">Your attendance</h2>
              <p
                className={`mt-2 text-[32px] font-medium tracking-[-0.03em] ${attRow.percent < TARGET ? "text-bad" : ""}`}
              >
                {attRow.percent.toFixed(1)}%
              </p>
              <p className="mt-1 text-[13px] leading-normal text-muted">
                {attRow.attended} of {attRow.marked} classes.{" "}
                {(() => {
                  const t = budgetText(attRow.attended, attRow.marked, schedule && timetabled.has(cid) ? (remainingByCourse(schedule, todayIST()).get(cid) ?? 0) : undefined);
                  return t.startsWith("Attend") ? `${t} to reach 75%.` : `${t}.`;
                })()}
              </p>
            </>
          )}
          {nextDue && (
            <>
              <h2 className="h3 mt-9 text-muted first:mt-0">Next due</h2>
              <Link href="?tab=tasks" replace className="mt-2 block">
                <span className="block font-medium">
                  {nextDue.name.replace(/\s+is due$/i, "")}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {relDay(nextDue.timesort)}, {fmtTime(nextDue.timesort)}
                </span>
              </Link>
            </>
          )}
          {news[0] && (
            <>
              <h2 className="h3 mt-9 text-muted first:mt-0">
                Latest announcement
              </h2>
              <Link href="?tab=announcements" replace className="mt-2 block">
                <span className="block font-medium">{news[0].name}</span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {news[0].userfullname ? `${news[0].userfullname}, ` : ""}
                  {ago(news[0].timemodified)}
                </span>
              </Link>
            </>
          )}
          <a
            href={`${u.site}/course/view.php?id=${id}`}
            target="_blank"
            className="link mt-9 inline-block text-[13px]"
          >
            Open this course on the LMS
          </a>
        </aside>
      </div>
    </>
  );
}
