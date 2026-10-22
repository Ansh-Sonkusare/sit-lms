import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session.ts";
import { isAdmin, loadShared } from "@/lib/timetables.ts";
import { dayLabel } from "@/lib/sit/marks.ts";
import { deleteTimetable, makeDefaultTimetable } from "../../actions.ts";
import ActionForm from "@/components/ActionForm.tsx";

const updated = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

export default async function AdminTimetables() {
  const u = await requireUser();
  if (!isAdmin(u)) notFound();
  const doc = await loadShared(u.college.id);
  if (!doc) notFound();

  return (
    <>
      <p className="text-[13px] text-muted">
        <Link href="/timetable" className="hover:underline">Your timetable</Link> / Manage
      </p>
      <h1 className="mt-2 text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">Timetables</h1>
      <p className="mt-2 max-w-[640px] text-sm leading-relaxed text-muted">
        Every student at {u.college.name} picks one of these and a batch. Students who haven&apos;t picked get the default.
      </p>

      <div className="list mt-8 max-w-[760px]">
        {doc.list.map((t) => {
          const isDefault = t.id === doc.defaultId;
          return (
            <div key={t.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-2 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">
                  {t.name}
                  {isDefault && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-muted">Default</span>}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {[`From ${dayLabel(t.from)}`, t.batches.length ? `batches ${t.batches.join(", ")}` : "no batches", `updated ${updated(t.updatedAt)}${t.updatedBy ? ` by ${t.updatedBy}` : ""}`].join(" · ")}
                </span>
              </span>
              <span className="flex flex-wrap gap-2">
                <Link href={`/admin/timetables/${t.id}`} className="btn">Edit</Link>
                {!isDefault && (
                  <ActionForm action={makeDefaultTimetable.bind(null, t.id)}>
                    <button className="btn">Make default</button>
                  </ActionForm>
                )}
                {!isDefault && (
                  <details className="relative">
                    <summary className="btn cursor-pointer list-none text-muted [&::-webkit-details-marker]:hidden">Delete</summary>
                    <ActionForm action={deleteTimetable.bind(null, t.id)} className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-line bg-bg p-3 text-[13px]">
                      <p className="text-muted">Students using it go back to the default. Their own copies stay.</p>
                      <button className="btn mt-3 text-bad">Delete {t.name}</button>
                    </ActionForm>
                  </details>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <section className="mt-12 max-w-[760px]">
        <h2 className="h2">New timetable</h2>
        <form action="/admin/timetables/new" className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block min-w-0 flex-1 text-[13px] text-muted">
            Start from
            <select name="copy" className="mt-1.5 h-10 w-full rounded-lg border border-line bg-transparent px-2.5 text-sm text-fg">
              <option value="">A blank timetable</option>
              {doc.list.map((t) => (
                <option key={t.id} value={t.id}>Copy from {t.name}</option>
              ))}
            </select>
          </label>
          <button className="h-10 rounded-lg bg-fg px-5 text-sm font-medium text-bg">Create</button>
        </form>
      </section>
    </>
  );
}
