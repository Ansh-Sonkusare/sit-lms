"use client";
import { useActionState } from "react";
import { login } from "@/app/actions.ts";
import type { College } from "@/lib/colleges.ts";

const input = "h-11 w-full rounded-lg border border-line bg-transparent px-3 text-[15px] outline-none focus:border-fg";

export default function LoginForm({ colleges }: { colleges: Pick<College, "id" | "name">[] }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mx-auto mt-[18vh] flex max-w-sm flex-col gap-4">
      <div>
        <p className="text-[15px] font-semibold">Campus LMS</p>
        <h1 className="mt-6 text-[28px] leading-tight font-medium tracking-[-0.025em]">Sign in</h1>
        <p className="mt-2 text-sm text-muted">Pick your college, then use the username and password of its LMS.</p>
      </div>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        College
        <select name="college" required defaultValue={colleges[0]?.id} className={input}>
          {colleges.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        Username
        <input name="username" autoComplete="username" required className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      <button disabled={pending} className="h-11 w-full rounded-lg bg-fg text-sm font-medium text-bg disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      {error && <p role="alert" className="text-[13px] text-bad">{error}</p>}
      <p className="text-xs text-muted">Your password is only sent to the LMS to get a sign-in token. It isn&apos;t stored.</p>
    </form>
  );
}
