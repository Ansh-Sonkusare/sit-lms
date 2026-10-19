"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Today", icon: "M3 11l9-7 9 7v9h-6v-6H9v6H3z" },
  { href: "/courses", label: "Courses", icon: "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM5 18a2 2 0 0 1 2-2h12" },
  { href: "/attendance", label: "Attendance", icon: "M4 5h16v15H4zM8 3v4M16 3v4M4 10h16M9 15l2 2 4-4" },
  { href: "/notifications", label: "Updates", icon: "M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4" },
];

export default function Nav({ unread }: { unread: number }) {
  const path = usePathname();
  const active = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href) || (href === "/courses" && path.startsWith("/assign"));
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] md:static md:flex md:gap-6 md:self-stretch md:border-0 md:pb-0"
    >
      {ITEMS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={active(i.href) ? "page" : undefined}
          className="flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] text-muted aria-[current=page]:font-medium aria-[current=page]:text-fg md:-mb-px md:flex-row md:gap-1.5 md:border-b-2 md:border-transparent md:py-0 md:text-sm md:hover:text-fg md:aria-[current=page]:border-fg"
        >
          <svg viewBox="0 0 24 24" className="size-5 md:hidden" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={i.icon} />
          </svg>
          {i.label}
          {i.href === "/notifications" && unread > 0 && <span className="hidden text-xs font-semibold text-accent md:inline">{unread}</span>}
        </Link>
      ))}
    </nav>
  );
}
