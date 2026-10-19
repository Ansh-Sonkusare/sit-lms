"use client";
import { useActionState, useState } from "react";
import { addLeave } from "@/app/actions.ts";

const INPUT = "mt-1.5 h-11 w-full rounded-lg border border-line bg-transparent px-3 text-[15px] text-fg outline-none focus:border-fg";

export default function AddLeaveForm({ min, max, today }: { min: string; max: string; today: string }) {
  const [error, action, pending] = useActionState(addLeave, null);
  const [from, setFrom] = useState(today);
  return (
    <form action={action} className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
      <label className="block text-[13px] text-muted">
        From
        <input type="date" name="from" required min={min} max={max} value={from} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
      </label>
      <label className="block text-[13px] text-muted">
        To <span>(optional)</span>
        <input type="date" name="to" min={from} max={max} className={INPUT} />
      </label>
      <label className="col-span-2 block text-[13px] text-muted">
        Note <span>(optional)</span>
        <input name="note" maxLength={80} placeholder="e.g. medical certificate submitted" className={`${INPUT} placeholder:text-muted`} />
      </label>
      <button disabled={pending} className="col-span-2 h-11 rounded-lg bg-fg text-sm font-medium text-bg disabled:opacity-60">
        {pending ? "Adding…" : "Add leave"}
      </button>
      {error && <p className="col-span-2 text-[13px] text-bad">{error}</p>}
    </form>
  );
}
