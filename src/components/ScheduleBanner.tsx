import Link from "next/link";
import { scheduleLabel } from "@/lib/sit/timetable.ts";
import type { ScheduleInfo } from "@/lib/timetables.ts";

// Until a student picks a timetable they get the college default; say so.
export default function ScheduleBanner({ info, className = "" }: { info: ScheduleInfo | null; className?: string }) {
  if (!info || info.chosen) return null;
  return (
    <p className={`rounded-lg bg-subtle px-3.5 py-3 text-[13px] leading-relaxed ${className}`}>
      Using {scheduleLabel(info.schedule)}, the default. <Link href="/timetable#choose" className="link">Choose yours</Link>
    </p>
  );
}
