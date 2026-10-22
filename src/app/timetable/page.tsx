import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getSchedule, isAdmin, loadShared, optionsFor, suggestedOption } from "@/lib/timetables.ts";
import { scheduleLabel, type Schedule } from "@/lib/sit/timetable.ts";
import { dayLabel } from "@/lib/sit/marks.ts";
import WeekGrid from "@/components/WeekGrid.tsx";
import ScheduleBanner from "@/components/ScheduleBanner.tsx";
import { chooseTimetable, discardMyTimetableCopy, makeMyTimetableCopy } from "../actions.ts";

const isCopy = (s: Schedule) => s.timetable.id === "personal";
const label = (s: Schedule) => (isCopy(s) ? `Your own copy of ${scheduleLabel(s)}` : scheduleLabel(s));
const date = (iso: string) => dayLabel(new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));

export default async function TimetablePage() {
  const u = await requireUser();
  const [info, doc, options] = await Promise.all([getSchedule(u), u.college.sit ? loadShared(u.college.id) : null, optionsFor(u)]);
  if (!info || !doc) notFound();
  const { schedule, chosen, personal } = info;
  const shared = options.filter((o) => !isCopy(o));
  const best = await suggestedOption(u, shared).catch(() => null);
  const suggested = best === null ? null : shared[best];
  const source = personal ? doc.list.find((t) => t.id === schedule.timetable.basedOn) : undefined;
  const sourceNewer = source && schedule.timetable.basedOnAt && source.updatedAt > schedule.timetable.basedOnAt;
  const isCurrent = (o: Schedule) => o.timetable.id === schedule.timetable.id && o.batch === schedule.batch;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] text-muted">Your timetable</p>
          <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">{scheduleLabel(schedule)}</h1>
          <p className="mt-2 text-sm text-muted">
            From {dayLabel(schedule.timetable.from)}
            {personal && ", your own copy"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.some(isCopy) ? (
            <>
              <Link href="/timetable/edit" className="btn">Edit my copy</Link>
              <form action={discardMyTimetableCopy}>
                <button className="btn text-muted hover:text-bad">Discard my copy</button>
              </form>
            </>
          ) : (
            <form action={makeMyTimetableCopy}>
              <button className="btn">Make my own copy</button>
            </form>
          )}
          {isAdmin(u) && <Link href="/admin/timetables" className="btn">Manage timetables</Link>}
        </div>
      </div>

      <ScheduleBanner info={info} className="mt-6 max-w-[640px]" />
      {personal && (
        <p className="mt-6 max-w-[640px] rounded-lg bg-subtle px-3.5 py-3 text-[13px] leading-relaxed">
          This is your own copy, so it no longer gets changes made to {source?.name ?? "the timetable it came from"}.
          {sourceNewer && ` ${source.name} was updated on ${date(source.updatedAt)}, after you made your copy.`} Discard your copy to go back to it.
        </p>
      )}

      <section className="mt-10">
        <WeekGrid schedule={schedule} />
      </section>

      <section id="choose" className="mt-14 max-w-[640px] scroll-mt-20">
        <h2 className="h2">Choose your timetable</h2>
        <p className="mt-1 text-[13px] text-muted">
          Attendance, classes left and today&apos;s classes all follow the timetable you pick.
          {suggested && " Suggested is the one that best matches the classes the LMS has recorded for you."}
        </p>
        <form action={chooseTimetable} className="mt-4">
          <div className="list">
            {options.map((o) => {
              const value = `${o.timetable.id}|${o.batch ?? ""}`;
              return (
                <label key={value} className="flex cursor-pointer items-baseline gap-3 py-3.5">
                  <input type="radio" name="choice" value={value} defaultChecked={isCurrent(o)} required className="translate-y-0.5 accent-fg" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{label(o)}</span>
                    <span className="mt-0.5 block text-[13px] text-muted">
                      From {dayLabel(o.timetable.from)}
                      {o.timetable.id === doc.defaultId && ", the default"}
                    </span>
                  </span>
                  {o === suggested && <span className="rounded-full bg-fg px-2 py-0.5 text-xs font-medium text-bg">Suggested</span>}
                  {chosen && isCurrent(o) && <span className="text-[13px] text-muted">Current</span>}
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
