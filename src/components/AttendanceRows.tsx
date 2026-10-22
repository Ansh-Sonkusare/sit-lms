import Link from "next/link";
import { budgetText, cleanCourse, TARGET } from "@/lib/format.ts";
import type { AttendanceRow } from "@/lib/data.ts";

export function Bar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <span className={`relative block h-[3px] bg-track ${className}`} role="img" aria-label={`${percent.toFixed(1)}%, the mark is ${TARGET}%`}>
      <span className={`block h-full ${percent < TARGET ? "bg-bad" : "bg-fg"}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      <span className="absolute -top-[3px] h-[9px] w-px bg-fg" style={{ left: `${TARGET}%` }} />
    </span>
  );
}

export const sortRows = (rows: AttendanceRow[]) => [...rows].sort((a, b) => a.percent - b.percent);

// Compact list for the Today sidebar.
// `timetabled`: courses in your timetable; for others the classes left are unknown.
export default function AttendanceRows({ rows, left, timetabled, limit }: { rows: AttendanceRow[]; left: Map<number, number>; timetabled: Set<number>; limit?: number }) {
  return (
    <div className="list">
      {sortRows(rows).slice(0, limit).map((r) => {
        return (
          <Link key={r.courseid} href={`/courses/${r.courseid}`} className="block py-3.5">
            <span className="flex justify-between gap-3 text-sm">
              <span className="truncate">{cleanCourse(r.course)}</span>
              <span className={`font-medium ${r.percent < TARGET ? "text-bad" : ""}`}>{r.percent.toFixed(1)}%</span>
            </span>
            <Bar percent={r.percent} className="mt-2" />
            <span className="mt-1.5 block text-xs text-muted">{budgetText(r.attended, r.marked, timetabled.has(r.courseid) ? (left.get(r.courseid) ?? 0) : undefined)}</span>
          </Link>
        );
      })}
    </div>
  );
}
