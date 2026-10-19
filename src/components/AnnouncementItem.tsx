import { SITE } from "@/lib/moodle.ts";
import { ago, cleanHtml, cleanTitle, fmtDate, stripHtml } from "@/lib/format.ts";
import { when } from "@/lib/calendar.ts";
import type { DigestItem } from "@/lib/digest.ts";
import type { Announcement } from "@/lib/data.ts";

const time12 = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

// One announcement: the AI digest when there is one, the cleaned original behind "Show original" either way.
export default function AnnouncementItem({ a, d, course, today }: { a: Announcement; d?: DigestItem; course?: string; today: string }) {
  const html = cleanHtml(a.message);
  return (
    <article className={`py-5 ${d && !d.forMe ? "opacity-60" : ""}`}>
      <p className="text-[13px] text-muted" title={fmtDate(a.timemodified)}>
        {course && <><span className="course">{course}</span>, </>}
        {[a.userfullname, ago(a.timemodified)].filter(Boolean).join(", ")}
        {d && !d.forMe && <span className="ml-2">Not for your section</span>}
      </p>
      <h3 className="mt-1 text-[15px] font-medium">{cleanTitle(a.name)}</h3>

      {d ? (
        <>
          <p className="mt-1.5 text-[15px] leading-relaxed">{d.summary}</p>
          {d.actions.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
              {d.actions.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
          {d.dates.length > 0 && (
            <div className="mt-3 space-y-1">
              {d.dates.map((x, i) => (
                <p key={i} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 text-[13px]">
                  <span className={x.date < today ? "text-muted" : x.kind === "due" || x.kind === "exam" ? "font-medium" : ""}>
                    {when({ start: x.date, end: x.date })}{x.time ? `, ${time12(x.time)}` : ""}
                  </span>
                  <span className={x.date < today ? "text-muted" : ""}>{x.label}</span>
                </p>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted">{stripHtml(html)}</p>
      )}

      <details className="mt-3">
        <summary className="w-fit cursor-pointer text-[13px] text-accent">Show original</summary>
        <div className="prose-moodle mt-2 max-w-[680px] border-l-2 border-line pl-4 text-muted" dangerouslySetInnerHTML={{ __html: html }} />
        <a href={`${SITE}/mod/forum/discuss.php?d=${a.discussion}`} target="_blank" className="link mt-2 inline-block text-[13px]">Open on the LMS</a>
      </details>
    </article>
  );
}
