import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getAssignment, getCourses } from "@/lib/data.ts";
import { SITE } from "@/lib/moodle.ts";
import { cleanCourse, fmtTime, relDay } from "@/lib/format.ts";

const LABEL: Record<string, string> = { new: "Not submitted", submitted: "Submitted", draft: "Draft" };

function inDays(sec: number, now: number) {
  const h = Math.abs(sec * 1000 - now) / 36e5;
  const t = h < 1 ? "less than an hour" : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`;
  return sec * 1000 > now ? `in ${t}` : `${t} ago`;
}

export default async function Assignment({ params }: PageProps<"/assign/[course]/[cmid]">) {
  const { course, cmid } = await params;
  const u = await requireUser();
  const [a, courses] = await Promise.all([getAssignment(u, Number(course), Number(cmid)), getCourses(u)]);
  if (!a) notFound();
  const courseName = cleanCourse(courses.find((c) => c.id === Number(course))?.fullname ?? "Course");
  const sub = a.status.lastattempt?.submission?.status;
  // eslint-disable-next-line react-hooks/purity -- server component, renders once per request
  const now = Date.now();
  const done = sub === "submitted";
  const overdue = a.duedate > 0 && a.duedate * 1000 < now && !done;
  const val = "mt-1 text-[20px] font-medium";
  return (
    <>
      <p className="text-[13px] md:text-sm">
        <Link href={`/courses/${course}?tab=tasks`} className="text-muted">{courseName}</Link> <span className="text-muted">/</span>
      </p>
      <h1 className="mb-8 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">{a.name}</h1>
      <dl className="grid gap-6 md:grid-cols-3">
        <div>
          <dt className="text-[13px] text-muted">Due</dt>
          <dd className={`${val} ${overdue ? "text-bad" : ""}`}>{a.duedate ? `${relDay(a.duedate)}, ${fmtTime(a.duedate)}` : "No due date"}</dd>
          {a.duedate > 0 && !done && <dd className={`mt-0.5 text-[13px] ${overdue ? "text-bad" : "text-muted"}`}>{overdue ? "Overdue" : inDays(a.duedate, now)}</dd>}
        </div>
        <div>
          <dt className="text-[13px] text-muted">Submission</dt>
          <dd className={val}>{done ? "Submitted" : (sub && LABEL[sub]) || "Not submitted"}</dd>
        </div>
      </dl>
      {a.intro && <div className="prose-moodle mt-8 max-w-[720px] border-t border-line pt-6" dangerouslySetInnerHTML={{ __html: a.intro }} />}
      <div className="mt-8 flex flex-wrap gap-2">
        <a href={`${SITE}/mod/assign/view.php?id=${cmid}&action=editsubmission`} target="_blank" className="inline-flex h-10 items-center rounded-lg bg-fg px-4 text-sm font-medium text-bg">Submit on the LMS</a>
        <a href={`${SITE}/mod/assign/view.php?id=${cmid}`} target="_blank" className="btn h-10">Open on the LMS</a>
      </div>
    </>
  );
}
