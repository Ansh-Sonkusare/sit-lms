import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { getCourses } from "@/lib/data.ts";
import { cleanCourse, todayIST } from "@/lib/format.ts";
import { isAdmin, loadShared } from "@/lib/timetables.ts";
import type { Timetable } from "@/lib/sit/timetable.ts";
import TimetableEditor from "@/components/TimetableEditor.tsx";
import { saveSharedTimetable } from "../../../actions.ts";

export default async function EditTimetable({ params, searchParams }: PageProps<"/admin/timetables/[id]">) {
  const u = await requireUser();
  if (!isAdmin(u)) notFound();
  const [{ id }, q, doc, courses] = await Promise.all([params, searchParams, loadShared(u.college.id), getCourses(u).catch(() => [])]);
  if (!doc) notFound();

  let initial: Timetable | undefined;
  if (id === "new") {
    const source = doc.list.find((t) => t.id === q.copy);
    const base = doc.list.find((t) => t.id === doc.defaultId)!;
    initial = source
      ? { ...source, id: "new", name: `${source.name} (copy)`, basedOn: source.id, updatedAt: "", updatedBy: undefined }
      : { id: "new", college: u.college.id, name: "", from: todayIST(), batches: [], slotTimes: base.slotTimes, blocks: [], updatedAt: "" };
  } else initial = doc.list.find((t) => t.id === id);
  if (!initial) notFound();

  return (
    <>
      <p className="text-[13px] text-muted">
        <Link href="/admin/timetables" className="hover:underline">Timetables</Link> / {id === "new" ? "New" : initial.name}
      </p>
      <h1 className="mt-2 mb-8 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">{id === "new" ? "New timetable" : `Edit ${initial.name}`}</h1>
      <TimetableEditor
        initial={initial}
        courses={courses.map((c) => ({ id: c.id, name: cleanCourse(c.fullname) }))}
        action={saveSharedTimetable}
        cancelHref="/admin/timetables"
        submitLabel={id === "new" ? "Create timetable" : "Save for everyone"}
      />
    </>
  );
}
