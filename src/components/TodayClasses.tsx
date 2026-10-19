import {
  cleanCourse,
  countWord,
  nowIST,
  skipText,
  time12,
  TARGET,
} from "@/lib/format.ts";
import type { Attendance } from "@/lib/data.ts";
import {
  classesOn,
  nextClassDay,
  remainingByCourse,
  TIMETABLED,
} from "@/lib/timetable.ts";
import { holidayOn } from "@/lib/calendar.ts";

const dayName = (iso: string) =>
  new Date(`${iso}T12:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
  });

// Today's timetable (or the next day with classes), with "Now"/"Next" and, per class, what skipping it costs.
export default function TodayClasses({
  today,
  attendance,
}: {
  today: string;
  attendance: Attendance | null;
}) {
  const now = nowIST();
  const isToday = classesOn(today).some((c) => c.end > now);
  const day = isToday ? today : nextClassDay(nextDay(today));
  if (!day) return null;

  const classes = classesOn(day);
  const left = remainingByCourse(day);
  const rowOf = (id: number | null) =>
    attendance?.rows.find((r) => r.courseid === id);
  const current = isToday ? classes.findIndex((c) => c.end > now) : -1;
  const counted = classes.filter(
    (c, i) => i >= current && rowOf(c.courseid),
  ).length;
  const holiday = holidayOn(today);
  const heading = isToday
    ? "Today's classes"
    : `${day === nextDay(today) ? "Tomorrow" : dayName(day).split(",")[0]}'s classes`;
  const note = isToday
    ? null
    : holiday
      ? `No classes today (${holiday.name}).`
      : classesOn(today).length
        ? "Today's classes are over."
        : "No classes today.";

  return (
    <section className="mb-14">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="h2">{heading}</h2>
        <span className="text-[13px] text-muted">{note ?? dayName(day)}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        Tap a class to see what skipping it does to your attendance.
      </p>
      <div className="list mt-3">
        {classes.map((c, i) => {
          const r = rowOf(c.courseid);
          const past = isToday && i < current;
          const tag = i !== current ? null : c.start <= now ? "Now" : "Next";
          const head = (
            <>
              <span className="text-[13px] text-muted">{time12(c.start)}</span>
              <span className="min-w-0">
                <span className="course block text-[15px]">
                  {r ? cleanCourse(r.course) : c.subject}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {[r && c.subject, c.room, `until ${time12(c.end)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="flex items-baseline gap-2.5 text-[13px]">
                {tag && (
                  <span className="rounded-full bg-fg px-2 py-0.5 text-xs font-medium text-bg">
                    {tag}
                  </span>
                )}
                {r && (
                  <span
                    className={r.percent < TARGET ? "text-bad" : "text-muted"}
                  >
                    {r.percent.toFixed(1)}%
                  </span>
                )}
              </span>
            </>
          );
          const grid = `grid grid-cols-[64px_minmax(0,1fr)_auto] items-baseline gap-3 py-3.5 md:grid-cols-[76px_minmax(0,1fr)_auto] md:gap-4 ${past ? "opacity-50" : ""}`;
          if (!r)
            return (
              <div key={i} className={grid}>
                {head}
              </div>
            );
          const s = skipText(
            r.attended,
            r.marked,
            TIMETABLED.has(r.courseid)
              ? (left.get(r.courseid) ?? 0)
              : undefined,
          );
          return (
            <details key={i} className="group">
              <summary
                className={`${grid} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              >
                {head}
              </summary>
              <p className="mb-3.5 rounded-lg bg-subtle px-3.5 py-3 text-[13px] leading-relaxed md:ml-[92px]">
                <span className={`font-semibold ${s.safe ? "" : "text-bad"}`}>
                  {s.safe ? "Safe to skip." : "Skipping hurts."}
                </span>{" "}
                {cleanCourse(r.course)} goes from {r.percent.toFixed(1)}% to{" "}
                {s.after.toFixed(1)}%. After that:{" "}
                {s.then.charAt(0).toLowerCase() + s.then.slice(1)}.
              </p>
            </details>
          );
        })}
      </div>
      {attendance && counted > 1 && (
        <p className="mt-3 text-[13px] text-muted">
          {isToday && current > 0
            ? "Skip the rest of today"
            : "Skip the whole day"}
          : overall goes from {attendance.overall.toFixed(1)}% to{" "}
          <span className="font-medium text-fg">
            {(
              (attendance.attended / (attendance.marked + counted)) *
              100
            ).toFixed(1)}
            %
          </span>{" "}
          ({countWord(counted).toLowerCase()} classes).
        </p>
      )}
    </section>
  );
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
