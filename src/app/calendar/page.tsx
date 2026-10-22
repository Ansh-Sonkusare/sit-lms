import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { EVENTS, TEACHING } from "@/lib/sit/calendar.ts";
import { todayIST, when } from "@/lib/format.ts";

const d = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", ...o });

export default async function CalendarPage() {
  if (!(await requireUser()).college.sit) notFound();
  const today = todayIST();
  const months = Map.groupBy(EVENTS, (e) => d(e.start, { month: "long", year: "numeric" }));
  return (
    <>
      <p className="text-sm text-muted">Odd semester 2026-27, semester III</p>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">Academic calendar</h1>
      <p className="mt-2 text-sm text-muted">
        Teaching runs {when(TEACHING)}. Sundays are off and aren&apos;t listed.
      </p>
      <div className="mt-10 max-w-[720px]">
        {[...months].map(([month, list]) => (
          <section key={month} className="mt-10 first:mt-0">
            <h2 className="h2">{month}</h2>
            <div className="list mt-3">
              {list.map((e) => {
                const past = e.end < today;
                const now = e.start <= today && today <= e.end;
                return (
                  <div key={e.name + e.start} className={`grid grid-cols-[150px_minmax(0,1fr)_auto] items-baseline gap-4 py-3.5 ${past ? "text-muted" : ""}`}>
                    <span className="text-[13px] text-muted">{when(e)}</span>
                    <span className="text-[15px]">{e.name}{now && <span className="ml-2 text-[13px] text-accent">Now</span>}</span>
                    <span className={`text-[13px] ${e.kind === "Holiday" ? "" : "text-muted"}`}>{e.kind}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
