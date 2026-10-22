"use client";

// In production a server error arrives here without its message, so the text can't name the cause.
export default function PageError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="max-w-[640px]">
      <h1 className="text-[28px] leading-tight font-medium tracking-[-0.025em] md:text-[36px]">Something couldn&apos;t be loaded</h1>
      <p className="mt-3 text-sm leading-relaxed text-bad">
        The timetables or the LMS didn&apos;t answer, so this page isn&apos;t shown with attendance that could be wrong. Try again in a moment.
      </p>
      <button onClick={() => retry()} className="btn mt-6">Try again</button>
    </div>
  );
}
