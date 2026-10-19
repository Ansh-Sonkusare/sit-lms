import Link from "next/link";
import { requireUser } from "@/lib/session.ts";
import { getAttendance, ATTENDANCE_URL } from "@/lib/data.ts";
import { budget, budgetText, cleanCourse, countWord, TARGET, todayIST } from "@/lib/format.ts";
import { remainingByCourse, TIMETABLED } from "@/lib/timetable.ts";
import { TEACHING } from "@/lib/calendar.ts";
import { Bar, sortRows } from "@/components/AttendanceRows.tsx";
import { refresh } from "../actions.ts";

export default async function AttendancePage() {
  const u = await requireUser();
  const data = await getAttendance(u).catch(() => null);
  const rows = data ? sortRows(data.rows) : [];
  const { marked = 0, attended = 0, overall = 0 } = data ?? {};
  const low = rows.filter((r) => r.percent < TARGET).length;
  const b = budget(attended, marked);
  const leftBy = remainingByCourse(todayIST());
  const left = rows.reduce((s, r) => s + (leftBy.get(r.courseid) ?? 0), 0);
  const endLabel = new Date(`${TEACHING.end}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const best = (a: number, m: number, l: number) => (m + l ? ((a + l) / (m + l)) * 100 : 0);
  const leftOf = (id: number) => (TIMETABLED.has(id) ? (leftBy.get(id) ?? 0) : undefined);
  const unreachable = rows.filter((r) => leftOf(r.courseid) !== undefined && -budget(r.attended, r.marked) > leftOf(r.courseid)!).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-muted">
            Attendance this semester
            {data && data.credited > 0 && (
              <>
                , including {data.credited} {data.credited === 1 ? "class" : "classes"} from{" "}
                <Link href="/attendance/leave" className="link">accepted leave</Link>
              </>
            )}
          </p>
          {data && (
            <h1 className="mt-2.5 max-w-[720px] text-[26px] leading-[1.2] font-medium tracking-[-0.02em] md:text-[40px] md:leading-[1.15] md:tracking-[-0.025em]">
              {overall.toFixed(1)}% overall.{" "}
              {low === 0 ? "Every course is above the 75% line." : `${countWord(low)} ${low === 1 ? "course is" : "courses are"} under the 75% line.`}
            </h1>
          )}
        </div>
        <div className="flex gap-2">
          <Link href="/attendance/leave" className="btn">Leave</Link>
          <form action={refresh}><button className="btn">Refresh</button></form>
          <a className="btn" href={ATTENDANCE_URL} target="_blank">Open on the LMS</a>
        </div>
      </div>

      {!data && <p className="mt-6 text-sm text-bad">Attendance couldn&apos;t be loaded from the LMS. Refresh, or open the report on the LMS.</p>}

      {data && (
        <>
          <div className="mt-10 grid grid-cols-2 gap-6 border-y border-line py-7 sm:grid-cols-4 sm:gap-10 md:mt-12">
            <div>
              <p className="text-[13px] text-muted">Classes attended</p>
              <p className="mt-1.5 text-[28px] font-medium tracking-[-0.02em]">{attended} <span className="text-[15px] font-normal text-muted">of {marked}</span></p>
            </div>
            <div>
              <p className="text-[13px] text-muted">{b < 0 ? "To get back to 75% overall" : "You can still miss"}</p>
              <p className={`mt-1.5 text-[28px] font-medium tracking-[-0.02em] ${b < 0 ? "text-bad" : ""}`}>
                {b < 0 && -b > left ? (
                  <>Out of reach <span className="text-[15px] font-normal text-muted">needs {-b}</span></>
                ) : (
                  <>
                    {Math.abs(b)} <span className="text-[15px] font-normal text-muted">{b < 0 ? `of ${left} left` : "classes overall"}</span>
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Best overall by {endLabel}</p>
              <p className={`mt-1.5 text-[28px] font-medium tracking-[-0.02em] ${best(attended, marked, left) < TARGET ? "text-bad" : ""}`}>
                {best(attended, marked, left).toFixed(1)}% <span className="text-[15px] font-normal text-muted">attending all {left} left</span>
              </p>
            </div>
            <div>
              <p className="text-[13px] text-muted">Courses under 75%</p>
              <p className="mt-1.5 text-[28px] font-medium tracking-[-0.02em]">{low} <span className="text-[15px] font-normal text-muted">of {rows.length}{unreachable ? `, ${unreachable} out of reach` : ""}</span></p>
            </div>
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  <th scope="col" className="pb-3 font-medium">Course, lowest first</th>
                  <th scope="col" className="w-28 pb-3 font-medium">Attended</th>
                  <th scope="col" className="hidden w-48 pb-3 font-medium md:table-cell">Against 75%</th>
                  <th scope="col" className="w-20 pb-3 text-right font-medium">Rate</th>
                  <th scope="col" className="w-16 pb-3 text-right font-medium">Left</th>
                  <th scope="col" className="w-20 pb-3 text-right font-medium" title={`If you attend every class left before ${endLabel}`}>Best</th>
                  <th scope="col" className="pb-3 pl-8 font-medium">What it takes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isLow = r.percent < TARGET;
                  return (
                    <tr key={r.courseid} className="border-y border-line">
                      <td className="py-4 pr-4"><Link href={`/courses/${r.courseid}`} className="hover:underline">{cleanCourse(r.course)}</Link></td>
                      <td className="text-muted">{r.attended} / {r.marked}</td>
                      <td className="hidden md:table-cell"><Bar percent={r.percent} className="w-40" /></td>
                      <td className={`text-right font-medium ${isLow ? "text-bad" : ""}`}>{r.percent.toFixed(1)}%</td>
                      <td className="text-right text-muted" title={leftOf(r.courseid) === undefined ? "Not in your timetable" : undefined}>{leftOf(r.courseid) ?? "–"}</td>
                      <td className="text-right">
                        {leftOf(r.courseid) === undefined ? (
                          <span className="text-muted">–</span>
                        ) : (
                          <span className={best(r.attended, r.marked, leftOf(r.courseid)!) < TARGET ? "text-bad" : ""}>
                            {best(r.attended, r.marked, leftOf(r.courseid)!).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className={`pl-8 md:whitespace-nowrap ${isLow ? "" : "text-muted"}`}>{budgetText(r.attended, r.marked, leftOf(r.courseid)).replace(/ \(max .*\)$/, "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[13px] text-muted">
            The tick on each bar marks 75%. Numbers come from the LMS attendance records. Classes left are counted from your B1 timetable up to the last teaching day, skipping holidays. Best is what you&apos;d reach by attending every class left. A dash means the course isn&apos;t in your timetable.
          </p>
        </>
      )}
    </>
  );
}
