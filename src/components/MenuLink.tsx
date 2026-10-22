"use client";
import Link from "next/link";

// A link in the account menu. It closes the menu, because the layout around it stays mounted across navigations.
export default function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={(e) => e.currentTarget.closest("details")?.removeAttribute("open")} className="block px-3 py-2 hover:bg-subtle">
      {children}
    </Link>
  );
}
