import Link from "next/link";
import { holidayOn, TEACHING } from "@/lib/sit/calendar.ts";
import { dayLabel, type Dot } from "@/lib/sit/marks.ts";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

const DOT: Record<Dot["state"], string> = {
  present: "bg-fg",
  absent: "bg-bad",
  missing: "border-[1.5px] border-fg",
  pending: "border-[1.5px] border-muted",
};

// "2 present, not marked" from the dots on one day.
function summary(dots: Dot[]) {
  const counts = new Map<string, number>();
  for (const d of dots) counts.set(d.text, (counts.get(d.text) ?? 0) + 1);
  return [...counts].map(([text, n]) => (n > 1 ? `${n} ${text}` : text)).join(", ");
}

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from}-01T00:00:00Z`);
  for (; d.toISOString().slice(0, 7) <= to; d.setUTCMonth(d.getUTCMonth() + 1)) out.push(d.toISOString().slice(0, 7));
  return out;
}

// Month grids (Monday first) from the start of teaching to today, newest month first.
// Marks sit on the date the LMS recorded them. `month` shows a single month ("YYYY-MM").
export default function MarksCalendar({
  dots,
  today,
  href,
  selected,
  month,
}: {
  dots: Map<string, Dot[]>;
  today: string;
  href?: (date: string) => string;
  selected?: string;
  month?: string;
}) {
  const last = today < TEACHING.end ? today : TEACHING.end;
  const months = month ? [month] : monthsBetween(TEACHING.start.slice(0, 7), last.slice(0, 7)).reverse();

  return (
    <div>
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {months.map((ym) => {
          const [y, m] = ym.split("-").map(Number);
          const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
          const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
          return (
            <section key={ym} aria-label={`${MONTH_NAMES[m - 1]} ${y}`}>
              <h3 className="h3">
                {MONTH_NAMES[m - 1]} {y}
              </h3>
              <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted" aria-hidden>
                {WEEK.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-0.5">
                {Array.from({ length: lead }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length }, (_, i) => {
                  const date = `${ym}-${String(i + 1).padStart(2, "0")}`;
                  const dayDots = dots.get(date) ?? [];
                  const holiday = holidayOn(date);
                  const inRange = date >= TEACHING.start && date <= last;
                  const note = dayDots.length ? summary(dayDots) : holiday ? holiday.name : inRange ? "nothing recorded" : "outside teaching";
                  const label = `${dayLabel(date)}: ${note}`;
                  const cls = `flex min-h-11 flex-col items-center gap-1 rounded-md border px-0.5 py-1 sm:min-h-14 ${
                    date === selected ? "border-fg" : date === today ? "border-line bg-subtle" : "border-transparent"
                  } ${inRange && !holiday ? "" : "text-muted"}`;
                  const body = (
                    <>
                      <span className="text-[11px] leading-none sm:text-[13px]">{i + 1}</span>
                      <span className="flex flex-wrap justify-center gap-0.5" aria-hidden>
                        {dayDots.map((d, j) => (
                          <span key={j} className={`size-1.5 sm:size-2 ${d.flag ? "rotate-45 rounded-[1px]" : "rounded-full"} ${DOT[d.state]}`} />
                        ))}
                      </span>
                    </>
                  );
                  return href && inRange ? (
                    <Link key={date} href={href(date)} aria-label={label} title={label} aria-current={date === selected ? "date" : undefined} className={`${cls} hover:bg-subtle`}>
                      {body}
                    </Link>
                  ) : (
                    <div key={date} role="img" aria-label={label} title={label} className={cls}>
                      {body}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px] text-muted">
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-fg" aria-hidden /> Present</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-bad" aria-hidden /> Absent</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full border-[1.5px] border-fg" aria-hidden /> Not marked</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rounded-full border-[1.5px] border-muted" aria-hidden /> Not marked yet</li>
        <li className="flex items-center gap-1.5"><span className="size-2 rotate-45 rounded-[1px] bg-fg" aria-hidden /> Recorded on another day than the class</li>
      </ul>
    </div>
  );
}
