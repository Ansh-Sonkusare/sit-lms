import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getAllMarks, getCourses } from "@/lib/data.ts";
import { cleanCourse, time12, todayIST } from "@/lib/format.ts";
import { holidayOn, TEACHING } from "@/lib/sit/calendar.ts";
import { classesOn, daysBetween } from "@/lib/sit/timetable.ts";
import { getSchedule } from "@/lib/timetables.ts";
import { dayClasses, dayLabel, dotsByDay, statusLine, type DayRecord } from "@/lib/sit/marks.ts";
import MarksCalendar from "@/components/MarksCalendar.tsx";

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);
const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

const shiftMonth = (ym: string, by: number) => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
};

const TONE = { ok: "", bad: "text-bad", quiet: "text-muted" };

function otherText(o: DayRecord) {
  const what = o.mark === "P" ? (o.leave ? "present (leave)" : "present") : "absent";
  if (o.match === "moved") return `${what}, for the ${dayLabel(o.classDate!)} class`;
  if (o.match === "extra") return `${what}, no class that day in your timetable`;
  return what;
}

export default async function AttendanceDay({ searchParams }: PageProps<"/attendance/day">) {
  const u = await requireUser();
  const schedule = (await getSchedule(u))?.schedule;
  if (!schedule) notFound();
  const start = schedule.timetable.from;
  const q = await searchParams;
  const today = todayIST();
  const date = isDate(q.date) ? q.date : today;
  const last = today < TEACHING.end ? today : TEACHING.end;
  const month = isMonth(q.month) ? q.month : date.slice(0, 7);
  const first = TEACHING.start.slice(0, 7);

  const [marks, courses] = await Promise.all([getAllMarks(u, schedule).catch(() => null), getCourses(u).catch(() => [])]);
  const name = (id: number | null) => {
    const c = courses.find((x) => x.id === id);
    return c ? cleanCourse(c.fullname) : null;
  };
  const view = marks ? dayClasses(schedule, date, marks, today) : null;

  const classDays = daysBetween(start, TEACHING.end).filter((d) => classesOn(schedule, d).length > 0);
  const prev = classDays.findLast((d) => d < date);
  const next = classDays.find((d) => d > date);
  const holiday = holidayOn(date);
  const href = (d: string) => `/attendance/day?date=${d}`;

  return (
    <>
      <p className="text-[13px] text-muted">
        <Link href="/attendance" className="hover:underline">Attendance</Link> / By day
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">
          {new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })}
          {date === today && <span className="text-muted"> (today)</span>}
        </h1>
        <div className="flex gap-2">
          {prev ? <Link href={href(prev)} className="btn">Previous class day</Link> : <span className="btn pointer-events-none opacity-40" aria-disabled>Previous class day</span>}
          {next ? <Link href={href(next)} className="btn">Next class day</Link> : <span className="btn pointer-events-none opacity-40" aria-disabled>Next class day</span>}
        </div>
      </div>

      {!marks && <p className="mt-6 text-sm text-bad">Attendance couldn&apos;t be loaded from the LMS. Try again in a moment.</p>}

      <div className="mt-8 max-w-[760px]">
        <div className="flex items-center justify-end text-sm">
          <span className="flex gap-4">
            {month > first ? <Link href={`${href(date)}&month=${shiftMonth(month, -1)}`} className="link">Earlier</Link> : null}
            {month < last.slice(0, 7) ? <Link href={`${href(date)}&month=${shiftMonth(month, 1)}`} className="link">Later</Link> : null}
          </span>
        </div>
        <div className="mt-3">
          <MarksCalendar dots={dotsByDay(marks?.values() ?? [])} today={today} href={href} selected={date} month={month} />
        </div>
      </div>

      {view && (
        <section className="mt-12 max-w-[760px]">
          <h2 className="h2">Classes</h2>
          {!view.tracked ? (
            <p className="mt-3 text-sm text-muted">
              The timetable for this date isn&apos;t known. Your timetable starts on {dayLabel(start)}, so there is nothing to compare with.
            </p>
          ) : view.classes.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{holiday ? `No classes (${holiday.name}).` : "No classes this day."}</p>
          ) : (
            <div className="list mt-3">
              {view.classes.map((c, i) => {
                const line = statusLine(c.statuses);
                const course = name(c.courseid);
                return (
                  <div key={i} className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 py-3.5 md:grid-cols-[76px_minmax(0,1fr)_auto] md:gap-4">
                    <span className="text-[13px] text-muted">{time12(c.start)}</span>
                    <span className="min-w-0">
                      <span className="course block text-[15px]">{course ?? c.subject}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {[course && c.subject !== course && c.subject, c.room, `until ${time12(c.end)}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {line && <span className={`text-right text-[13px] ${TONE[line.tone]}`}>{line.text}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {view.others.length > 0 && (
            <>
              <h2 className="h2 mt-10">{view.tracked ? "Also recorded this day" : "Recorded this day"}</h2>
              <ul className="list mt-3 text-sm">
                {view.others.map((o, i) => (
                  <li key={i} className="py-2.5">
                    <Link href={`/courses/${o.courseid}?tab=attendance`} className="hover:underline">{name(o.courseid) ?? `Course ${o.courseid}`}</Link>
                    <span className={o.mark === "P" ? "text-muted" : "text-bad"}>: {otherText(o)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </>
  );
}
