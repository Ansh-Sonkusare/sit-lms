import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getAttendance, sessionsOnLeave } from "@/lib/data.ts";
import { getLeaves } from "@/lib/prefs.ts";
import { classesOn, daysBetween, scheduleLabel } from "@/lib/sit/timetable.ts";
import { getSchedule } from "@/lib/timetables.ts";
import { holidayOn, TEACHING } from "@/lib/sit/calendar.ts";
import { cleanCourse, todayIST, TARGET, when } from "@/lib/format.ts";
import { removeLeave, setLeaveAccepted } from "../../actions.ts";
import AddLeaveForm from "@/components/AddLeaveForm.tsx";

export default async function LeavePage() {
  const u = await requireUser();
  const schedule = (await getSchedule(u))?.schedule;
  if (!schedule) notFound();
  const today = todayIST();
  const leaves = await getLeaves();
  const [lms, now, all, sessions] = await Promise.all([
    getAttendance(u, []).catch(() => null),
    getAttendance(u).catch(() => null),
    getAttendance(u, leaves).catch(() => null),
    sessionsOnLeave(u, leaves).catch(() => []),
  ]);
  const rows = (all?.rows ?? [])
    .filter((r) => r.credited > 0)
    .map((r) => {
      const raw = lms?.rows.find((x) => x.courseid === r.courseid);
      const acc = now?.rows.find((x) => x.courseid === r.courseid);
      return { ...r, lmsPct: raw?.percent ?? r.percent, accepted: acc?.percent ?? r.percent, ifAll: r.percent };
    });
  const pending = leaves.filter((l) => !l.accepted).length;

  return (
    <>
      <p className="text-[13px] text-muted">
        <Link href="/attendance" className="hover:underline">Attendance</Link> / Leave
      </p>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">Leave</h1>
      <p className="mt-2 max-w-[640px] text-sm leading-relaxed text-muted">
        Add the days you were on leave. Once the institute officially accepts a leave, mark it accepted and its classes count as present across the app.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-[72px]">
        <section>
          <h2 className="h2">Add leave</h2>
          <AddLeaveForm min={TEACHING.start} max={TEACHING.end} today={today} />

          <h2 className="h2 mt-12">Your leave</h2>
          {leaves.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No leave added yet.</p>
          ) : (
            <div className="list mt-3">
              {leaves.map((l) => {
                const ds = daysBetween(l.from, l.to);
                // past days: the LMS's recorded sessions; days still ahead: the timetable
                const recorded = sessions.filter((x) => l.from <= x.date && x.date <= l.to);
                const absent = recorded.filter((x) => x.mark === "A").length;
                const ahead = ds.filter((d) => d >= today).flatMap((d) => classesOn(schedule, d).filter((c) => c.courseid).map((c) => ({ d, ...c })));
                const holidays = [...new Set(ds.map((d) => holidayOn(d)?.name).filter(Boolean))];
                const upcoming = l.from >= today;
                return (
                  <details key={l.id} className="group py-3.5">
                    <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-2 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px]">{when({ start: l.from, end: l.to })}</span>
                        <span className="mt-0.5 block text-[13px] text-muted">
                          {recorded.length > 0 && `${absent} of ${recorded.length} recorded ${recorded.length === 1 ? "class" : "classes"} marked absent`}
                          {recorded.length > 0 && ahead.length > 0 && ", "}
                          {ahead.length > 0 && `${ahead.length} ${ahead.length === 1 ? "class" : "classes"} still ahead`}
                          {recorded.length === 0 && ahead.length === 0 && (upcoming ? "No classes on these days" : "No classes recorded on these days")}
                          {holidays.length ? `, skips ${holidays.join(", ")}` : ""}
                          {l.note ? `. ${l.note}` : ""}
                        </span>
                      </span>
                      <span className={`text-[13px] ${l.accepted ? "font-medium" : "text-muted"}`}>{l.accepted ? "Accepted" : "Waiting for approval"}</span>
                    </summary>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={setLeaveAccepted.bind(null, l.id, !l.accepted)}>
                        <button className="btn">{l.accepted ? "Mark not accepted" : "Mark accepted"}</button>
                      </form>
                      <form action={removeLeave.bind(null, l.id)}>
                        <button className="btn text-muted hover:text-bad">Remove</button>
                      </form>
                    </div>
                    {(recorded.length > 0 || ahead.length > 0) && (
                      <ul className="mt-4 space-y-1.5 text-[13px]">
                        {recorded.map((x, i) => (
                          <li key={`r${i}`} className="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-3 text-muted">
                            <span>{when({ start: x.date, end: x.date }).replace(/ \w+$/, "")}</span>
                            <span className="truncate text-fg">{cleanCourse(x.course)}</span>
                            <span className={x.mark === "A" ? (l.accepted ? "" : "text-bad") : ""}>
                              {x.mark === "A" ? (l.accepted ? "Absent, counted present" : "Absent") : x.mark === "P" ? "Present" : x.mark}
                            </span>
                          </li>
                        ))}
                        {ahead.map((b, i) => (
                          <li key={`a${i}`} className="grid grid-cols-[88px_minmax(0,1fr)_auto] gap-3 text-muted">
                            <span>{when({ start: b.d, end: b.d }).replace(/ \w+$/, "")}</span>
                            <span className="truncate text-fg">{b.subject}</span>
                            <span>{b.start}, timetable</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="h2">Effect on attendance</h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Once the LMS has marked you absent on a leave day, the course shows up here.</p>
          ) : (
            <>
              <p className="mt-3 text-[15px] leading-relaxed">
                {now && lms && now.credited > 0
                  ? `Accepted leave turns ${now.credited} absent ${now.credited === 1 ? "class" : "classes"} into present: overall ${lms.overall.toFixed(1)}% on the LMS, ${now.overall.toFixed(1)}% with leave.`
                  : "No accepted leave yet, so the LMS numbers stand."}
                {pending > 0 && ` ${pending} ${pending === 1 ? "leave is" : "leaves are"} waiting for approval.`}
              </p>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[13px] text-muted">
                      <th scope="col" className="pb-3 font-medium">Course</th>
                      <th scope="col" className="w-20 pb-3 text-right font-medium">On LMS</th>
                      <th scope="col" className="w-24 pb-3 text-right font-medium">Accepted</th>
                      <th scope="col" className="w-28 pb-3 text-right font-medium">If all accepted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.courseid} className="border-y border-line">
                        <td className="py-3.5 pr-3">{cleanCourse(r.course)}</td>
                        <td className={`text-right ${r.lmsPct < TARGET ? "text-bad" : "text-muted"}`}>{r.lmsPct.toFixed(1)}%</td>
                        <td className={`text-right font-medium ${r.accepted < TARGET ? "text-bad" : ""}`}>{r.accepted.toFixed(1)}%</td>
                        <td className={`text-right ${r.ifAll < TARGET ? "text-bad" : "text-muted"}`}>{r.ifAll.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="mt-6 text-[13px] leading-relaxed text-muted">
            Credit comes from the LMS&apos;s own records: only sessions it marked absent on your leave days turn into present, so nothing is
            counted twice. Days still ahead are previewed from your timetable ({scheduleLabel(schedule)}). Your leave record is saved in this browser and stays after you sign out.
          </p>
        </section>
      </div>
    </>
  );
}
