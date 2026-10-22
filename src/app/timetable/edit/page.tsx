import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getCourses } from "@/lib/data.ts";
import { cleanCourse } from "@/lib/format.ts";
import { loadPersonal } from "@/lib/timetables.ts";
import TimetableEditor from "@/components/TimetableEditor.tsx";
import { savePersonalTimetable } from "../../actions.ts";

export default async function EditMyTimetable() {
  const u = await requireUser();
  const [copy, courses] = await Promise.all([u.college.sit ? loadPersonal(u.college.id, u.userid) : null, getCourses(u).catch(() => [])]);
  if (!copy) redirect("/timetable");

  return (
    <>
      <p className="text-[13px] text-muted">
        <Link href="/timetable" className="hover:underline">Your timetable</Link> / Edit
      </p>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">Edit your copy</h1>
      <p className="mt-2 mb-8 max-w-[640px] text-sm leading-relaxed text-muted">Only you see this copy. Changes here don&apos;t reach anyone else.</p>
      <TimetableEditor
        initial={copy}
        courses={courses.map((c) => ({ id: c.id, name: cleanCourse(c.fullname) }))}
        action={savePersonalTimetable}
        cancelHref="/timetable"
        submitLabel="Save my copy"
      />
    </>
  );
}
