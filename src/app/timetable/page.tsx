import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getSchedule, isAdmin, loadShared, optionsOf, suggestedOption } from "@/lib/timetables.ts";
import { scheduleLabel } from "@/lib/sit/timetable.ts";
import { dayLabel } from "@/lib/sit/marks.ts";
import WeekGrid from "@/components/WeekGrid.tsx";
import ScheduleBanner from "@/components/ScheduleBanner.tsx";
import { chooseTimetable } from "../actions.ts";

export default async function TimetablePage() {
  const u = await requireUser();
  const info = await getSchedule(u);
  const doc = u.college.sit ? await loadShared(u.college.id) : null;
  if (!info || !doc) notFound();
  const { schedule, chosen } = info;
  const options = optionsOf(doc.list);
  const suggested = await suggestedOption(u, options).catch(() => null);
  const current = (o: (typeof options)[number]) => chosen && o.timetable.id === schedule.timetable.id && o.batch === schedule.batch;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">Your timetable</p>
          <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">{scheduleLabel(schedule)}</h1>
          <p className="mt-2 text-sm text-muted">From {dayLabel(schedule.timetable.from)}</p>
        </div>
        {isAdmin(u) && <Link href="/admin/timetables" className="btn">Manage timetables</Link>}
      </div>

      <ScheduleBanner info={info} className="mt-6 max-w-[640px]" />

      <section className="mt-10">
        <WeekGrid schedule={schedule} />
      </section>

      <section id="choose" className="mt-14 max-w-[640px] scroll-mt-20">
        <h2 className="h2">Choose your timetable</h2>
        <p className="mt-1 text-[13px] text-muted">
          Attendance, classes left and today&apos;s classes all follow the timetable you pick.
          {suggested !== null && " Suggested is the one that best matches the classes the LMS has recorded for you."}
        </p>
        <form action={chooseTimetable} className="mt-4">
          <div className="list">
            {options.map((o, i) => {
              const value = `${o.timetable.id}|${o.batch ?? ""}`;
              return (
                <label key={value} className="flex cursor-pointer items-baseline gap-3 py-3.5">
                  <input type="radio" name="choice" value={value} defaultChecked={o.timetable.id === schedule.timetable.id && o.batch === schedule.batch} required className="translate-y-0.5 accent-fg" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{scheduleLabel(o)}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      From {dayLabel(o.timetable.from)}
                      {o.timetable.id === doc.defaultId && ", the default"}
                    </span>
                  </span>
                  {suggested === i && <span className="rounded-full bg-fg px-2 py-0.5 text-xs font-medium text-bg">Suggested</span>}
                  {current(o) && <span className="text-[13px] text-muted">Current</span>}
                </label>
              );
            })}
          </div>
          <button className="mt-4 h-11 w-full rounded-lg bg-fg text-sm font-medium text-bg sm:w-auto sm:px-6">Use this timetable</button>
        </form>
      </section>
    </>
  );
}
