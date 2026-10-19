import Link from "next/link";
import { requireUser } from "@/lib/session.ts";
import { getDeadlines, getCourses, getAnnouncements, getAttendance, type Deadline } from "@/lib/data.ts";
import { ago, budgetText, cleanTitle, cleanCourse, collapseDue, countWord, fmtTime, relDay, stripHtml, TARGET, todayIST } from "@/lib/format.ts";
import { remainingByCourse } from "@/lib/timetable.ts";
import { upcoming, when } from "@/lib/calendar.ts";
import { LINKS } from "@/lib/links.ts";
import { getDigest } from "@/lib/digest.ts";
import AttendanceRows from "@/components/AttendanceRows.tsx";

const TZ = "Asia/Kolkata";

function href(e: Deadline) {
  const cmid = e.url.match(/[?&]id=(\d+)/)?.[1];
  return e.modulename === "assign" && e.course && cmid ? `/assign/${e.course.id}/${cmid}` : e.url;
}

function dayLabel(e: Deadline) {
  if (e.overdue) return "Overdue";
  const r = relDay(e.timesort);
  if (r === "Today" || r === "Tomorrow") return r;
  return new Date(e.timesort * 1000).toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });
}

export default async function Today() {
  const u = await requireUser();
  const [lmsEvents, att, courses, news] = await Promise.all([
    getDeadlines(u),
    getAttendance(u).catch((e: Error) => e),
    getCourses(u),
    getAnnouncements(u).catch(() => []),
  ]);
  const attendance = att instanceof Error ? null : att;
  const now = new Date().getTime();
  // Dated items the AI digest found in announcements join the LMS's own deadlines (unless the LMS already has one that day).
  const digest = (await getDigest(u.userid, news, courses)).items;
  const today = todayIST();
  const horizon = new Date(now + 14 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fromNews: Deadline[] = news.flatMap((a) => {
    const d = digest.get(a.id);
    const c = courses.find((x) => x.id === a.courseid);
    if (!d?.forMe) return [];
    return d.dates
      .filter((x) => (x.kind === "due" || x.kind === "exam") && x.date >= today && x.date <= horizon)
      .map((x, i) => ({
        id: -(a.id * 100 + i),
        name: x.label,
        timesort: Date.parse(`${x.date}T${x.time ?? "23:59"}:00+05:30`) / 1000,
        url: `/courses/${a.courseid}?tab=announcements`,
        course: c ? { id: c.id, fullname: c.fullname, shortname: c.shortname } : null,
        hasTime: !!x.time,
      }))
      .filter((x) => !lmsEvents.some((e) => e.course?.id === a.courseid && relDay(e.timesort) === relDay(x.timesort)));
  });
  const events = [...lmsEvents, ...fromNews].sort((a, b) => a.timesort - b.timesort);
  const groups = Map.groupBy(events, dayLabel);
  const dueWeek = events.filter((e) => !e.overdue && e.timesort * 1000 - now < 7 * 86_400_000).length;
  const low = attendance?.rows.filter((r) => r.percent < TARGET).length;
  const { marked = 0, attended = 0, overall = null } = attendance ?? {};
  const left = remainingByCourse(todayIST());
  const totalLeft = attendance?.rows.reduce((s, r) => s + (left.get(r.courseid) ?? 0), 0) ?? 0;

  const duePart = dueWeek === 0 ? "Nothing is due this week" : `${countWord(dueWeek)} ${dueWeek === 1 ? "thing is" : "things are"} due this week`;
  const attPart =
    low === undefined ? "." : low === 0 ? ", and every course is above 75% attendance." : `, and ${countWord(low).toLowerCase()} ${low === 1 ? "course is" : "courses are"} under 75% attendance.`;

  return (
    <>
      <p className="text-sm text-muted">
        {new Date().toLocaleDateString("en-IN", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })}
      </p>
      <h1 className="mt-2.5 max-w-[760px] text-[26px] leading-[1.2] font-medium tracking-[-0.02em] md:text-[40px] md:leading-[1.15] md:tracking-[-0.025em]">
        {duePart}
        {attPart}
      </h1>

      <div className="mt-10 grid grid-cols-1 gap-14 md:mt-14 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-[72px]">
        <section>
          <h2 className="h2">Due</h2>
          {events.length === 0 && <p className="mt-4 text-sm text-muted">Nothing due in the next two weeks.</p>}
          {[...groups].map(([label, list]) => (
            <div key={label}>
              <h3 className={`h3 mt-6 ${label === "Overdue" ? "text-bad" : ""}`}>{label}</h3>
              <div className="list mt-2">
                {collapseDue(list).map(({ first: e, title, count }) => (
                  <a
                    key={e.id}
                    href={count > 1 && e.course ? `/courses/${e.course.id}?tab=tasks` : href(e)}
                    target={href(e).startsWith("/") || count > 1 ? undefined : "_blank"}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5 md:grid-cols-[76px_minmax(0,1fr)_auto]"
                  >
                    <span className={`order-2 text-[13px] md:order-none ${e.overdue ? "text-bad" : "text-muted"}`}>
                      {e.overdue ? ago(e.timesort) : e.id < 0 && !(e as { hasTime?: boolean }).hasTime ? "" : fmtTime(e.timesort)}
                    </span>
                    <span className="order-1 md:order-none">
                      <span className="block text-[15px]">{title}</span>
                      {e.course && (
                        <span className="mt-1 block text-[13px] text-muted">
                          <span className="course">{cleanCourse(e.course.fullname)}</span>
                          {e.id < 0 && ", from an announcement"}
                        </span>
                      )}
                    </span>
                    {count > 1 && (
                      <span className="order-3 hidden rounded-full border border-line px-2 py-0.5 text-xs text-muted md:inline">{count} items</span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </section>

        <aside>
          <div className="flex items-baseline justify-between">
            <h2 className="h2">Attendance</h2>
            <Link href="/attendance" className="link text-[13px]">All {attendance?.rows.length ?? ""} courses</Link>
          </div>
          {attendance && overall !== null ? (
            <>
              <div className="mt-5 flex items-baseline gap-3">
                <span className={`text-[56px] leading-none font-medium tracking-[-0.04em] ${overall < TARGET ? "text-bad" : ""}`}>{overall.toFixed(1)}%</span>
                <span className="text-[13px] text-muted">{attended} of {marked} classes</span>
              </div>
              <p className="mt-2.5 text-[13px] leading-normal text-muted">
                {(() => {
                  const t = budgetText(attended, marked, totalLeft);
                  if (overall >= TARGET) return `${t} overall and stay above 75%.`;
                  return t.startsWith("Attend") ? `${t} to get back to 75% overall.` : `${t} overall before teaching ends.`;
                })()}
              </p>
              <div className="mt-7">
                <AttendanceRows rows={attendance.rows} left={left} limit={5} />
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Attendance couldn&apos;t be loaded from the LMS. <Link href="/attendance" className="link">Try again</Link>
            </p>
          )}
        </aside>
      </div>

      <section className="mt-16 md:mt-[72px]">
        <div className="flex items-baseline justify-between">
          <h2 className="h2">Coming up</h2>
          <Link href="/calendar" className="link text-[13px]">Academic calendar</Link>
        </div>
        <div className="list mt-4">
          {upcoming(todayIST(), 5).map((e) => (
            <div key={e.name + e.start} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-3.5 md:grid-cols-[150px_minmax(0,1fr)_auto]">
              <span className="order-2 text-[13px] text-muted md:order-none">{when(e)}</span>
              <span className="order-1 text-[15px] md:order-none">{e.name}</span>
              <span className="order-3 hidden text-[13px] text-muted md:inline">{e.kind}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 md:mt-[72px]">
        <div className="flex items-baseline justify-between">
          <h2 className="h2">Announcements</h2>
          <Link href="/notifications" className="link text-[13px]">All updates</Link>
        </div>
        {news.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No announcements yet.</p>
        ) : (
          <div className="mt-4 grid gap-8 border-t border-line pt-5 md:grid-cols-3 md:gap-10">
            {news.slice(0, 3).map((a) => {
              const c = courses.find((x) => x.id === a.courseid);
              return (
                <Link key={a.id} href={`/courses/${a.courseid}?tab=announcements`} className="block">
                  <span className="block text-[13px] text-muted"><span className="course">{c ? cleanCourse(c.fullname) : "Course"}</span>, {ago(a.timemodified)}</span>
                  <span className="mt-1.5 block text-[15px] font-medium">{cleanTitle(a.name)}</span>
                  <span className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{digest.get(a.id)?.summary ?? stripHtml(a.message)}</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <footer className="mt-16 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-5 text-[13px] md:mt-[72px]">
        <span className="text-muted">Portals</span>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} target="_blank" className="link">{l.label}</a>
        ))}
      </footer>
    </>
  );
}
