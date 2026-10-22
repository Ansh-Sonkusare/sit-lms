import Link from "next/link";
import { requireUser } from "@/lib/session.ts";
import { getMyCourses, type Course } from "@/lib/data.ts";
import { getSchedule } from "@/lib/timetables.ts";
import { cleanCourse } from "@/lib/format.ts";
import { toggleCourse } from "../actions.ts";

const byName = (cs: Course[]) => cs.map((c) => ({ ...c, name: cleanCourse(c.fullname) })).sort((a, b) => a.name.localeCompare(b.name));

export default async function Courses() {
  const u = await requireUser();
  const schedule = (await getSchedule(u))?.schedule ?? null;
  const { mine, other, extra } = await getMyCourses(u, schedule);
  return (
    <>
      {schedule && <p className="text-[13px] text-muted md:text-sm">{schedule.timetable.name}</p>}
      <h1 className="text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">Courses</h1>
      <p className="mt-2 mb-8 text-sm text-muted">{schedule ? "The courses in your timetable, plus any you add from the list below." : "The courses you're enrolled in this term."}</p>

      <div className="list">
        {byName(mine).map((c) => (
          <div key={c.id} className="flex items-baseline gap-4 py-3.5">
            <Link href={`/courses/${c.id}`} className="min-w-0 flex-1 text-[15px] hover:underline">{c.name}</Link>
            {extra.has(c.id) && (
              <form action={toggleCourse.bind(null, c.id, false)}>
                <button className="text-[13px] text-muted hover:text-fg">Remove</button>
              </form>
            )}
          </div>
        ))}
      </div>
      {!mine.length && <p className="text-[13px] text-muted">No courses in progress. Check back when the semester starts.</p>}

      {other.length > 0 && (
        <details className="group mt-12">
          <summary className="flex w-fit cursor-pointer list-none items-baseline gap-2 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            <svg viewBox="0 0 24 24" className="size-3.5 self-center text-muted transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden><path d="m9 6 6 6-6 6" /></svg>
            Other courses <span className="text-[13px] font-normal text-muted">{other.length}</span>
          </summary>
          <p className="mt-2 text-[13px] text-muted">You&apos;re enrolled in these but they aren&apos;t in your timetable. Add one to keep it in your list and search.</p>
          <div className="list mt-3">
            {byName(other).map((c) => (
              <div key={c.id} className="flex items-baseline gap-4 py-3.5">
                <Link href={`/courses/${c.id}`} className="min-w-0 flex-1 text-[15px] text-muted hover:text-fg hover:underline">{c.name}</Link>
                <form action={toggleCourse.bind(null, c.id, true)}>
                  <button className="text-[13px] text-accent hover:underline">Add to my courses</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
