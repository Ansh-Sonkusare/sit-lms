"use client";
import { useActionState, type ReactNode } from "react";

// A form for a server action that returns a message to show, or null when it worked.
export default function ActionForm({ action, className, children }: { action: () => Promise<string | null>; className?: string; children: ReactNode }) {
  const [error, run] = useActionState(action, null);
  return (
    <form action={run} className={className}>
      {children}
      {error && <p role="alert" className="mt-2 max-w-64 text-[13px] text-bad">{error}</p>}
    </form>
  );
}
