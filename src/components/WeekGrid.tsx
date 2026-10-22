import { time12 } from "@/lib/format.ts";
import { blocksFor, WEEKDAYS, type Block, type Schedule } from "@/lib/sit/timetable.ts";

// Blocks on one day whose slots overlap share a cell (parallel batch classes when no batch is picked).
function cells(blocks: Block[]) {
  const out: { first: number; last: number; blocks: Block[] }[] = [];
  for (const b of blocks) {
    const cur = out.at(-1);
    if (cur && b.slots[0] <= cur.last) {
      cur.blocks.push(b);
      cur.last = Math.max(cur.last, b.slots.at(-1)!);
    } else out.push({ first: b.slots[0], last: b.slots.at(-1)!, blocks: [b] });
  }
  return out;
}

const detail = (b: Block, s: Schedule) => [b.room, b.batch && !s.batch && `batch ${b.batch}`, b.course === null && "no attendance"].filter(Boolean).join(" · ");

// The week as days × slots on wide screens, one list per day on phones.
export default function WeekGrid({ schedule }: { schedule: Schedule }) {
  const times = schedule.timetable.slotTimes;
  const all = blocksFor(schedule);
  const days = WEEKDAYS.map((name, i) => ({ name, day: i + 1, blocks: all.filter((b) => b.day === i + 1) })).filter((d) => d.day < 6 || d.blocks.length);

  return (
    <>
      <div className="hidden md:grid" style={{ gridTemplateColumns: `76px repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, col) => (
          <span key={d.day} className="border-b border-line pb-2 text-[13px] font-semibold" style={{ gridColumn: col + 2, gridRow: 1 }}>{d.name}</span>
        ))}
        {times.map(([start, end], i) => (
          <span key={i} className="border-b border-line py-2 pr-3 text-[12px] leading-snug text-muted" style={{ gridColumn: 1, gridRow: i + 2 }}>
            {time12(start)}
            <span className="block">{time12(end)}</span>
          </span>
        ))}
        {days.flatMap((d, col) =>
          cells(d.blocks).map((c) => (
            <div key={`${d.day}-${c.first}`} className="m-0.5 flex flex-col gap-2 rounded-md bg-subtle px-2 py-1.5" style={{ gridColumn: col + 2, gridRow: `${c.first + 1} / ${c.last + 2}` }}>
              {c.blocks.map((b, j) => (
                <span key={j} className="block min-w-0 break-words">
                  <span className="block text-[13px] leading-snug font-medium">{b.subject}</span>
                  {detail(b, schedule) && <span className="block text-[12px] text-muted">{detail(b, schedule)}</span>}
                </span>
              ))}
            </div>
          )),
        )}
      </div>

      <div className="space-y-8 md:hidden">
        {days.map((d) => (
          <section key={d.day}>
            <h3 className="h3">{d.name}</h3>
            {d.blocks.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted">No classes.</p>
            ) : (
              <div className="list mt-2">
                {d.blocks.map((b, j) => (
                  <div key={j} className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3 py-3">
                    <span className="text-[13px] text-muted">{time12(times[b.slots[0] - 1][0])}</span>
                    <span className="min-w-0">
                      <span className="block text-[15px] break-words">{b.subject}</span>
                      <span className="mt-0.5 block text-[13px] text-muted">
                        {[detail(b, schedule), `until ${time12(times[b.slots.at(-1)! - 1][1])}`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
