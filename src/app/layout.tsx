import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import { getSession } from "@/lib/session.ts";
import { getNotifications } from "@/lib/data.ts";
import { logout, refresh } from "./actions.ts";
import CommandPalette from "@/components/CommandPalette.tsx";
import Nav from "@/components/Nav.tsx";
import "./globals.css";

const ui = IBM_Plex_Sans({ variable: "--font-ui", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = { title: "SIT LMS", description: "Deadlines, attendance and course notes in one place" };
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

const initials = (name: string) =>
  name.split(/\s+/).filter((w) => /^[a-z]/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const s = await getSession();
  const user = s.token && s.userid ? { token: s.token, userid: s.userid, fullname: s.fullname ?? "" } : null;
  const unread = user ? await getNotifications(user).then((n) => n.unreadcount).catch(() => 0) : 0;
  return (
    <html lang="en" className={`${ui.variable} antialiased`}>
      <body className="min-h-screen font-sans">
        {user && (
          <header className="sticky top-0 z-10 border-b border-line bg-bg">
            <div className="mx-auto flex h-14 max-w-[1080px] items-center gap-8 px-5 md:h-[60px] md:px-6">
              <Link href="/" className="text-[15px] font-semibold tracking-tight">SIT LMS</Link>
              <Nav unread={unread} />
              <span className="flex-1" />
              <CommandPalette />
              <details className="relative -ml-4">
                <summary aria-label="Account" className="grid size-11 cursor-pointer list-none place-items-center [&::-webkit-details-marker]:hidden">
                  <span className="grid size-8 place-items-center rounded-full bg-subtle text-xs font-semibold">{initials(user.fullname)}</span>
                </summary>
                <div className="absolute right-0 mt-1 w-56 rounded-lg border border-line bg-bg py-1 text-sm">
                  <p className="truncate px-3 py-2 text-[13px] text-muted">{user.fullname}</p>
                  <form action={refresh}><button className="w-full px-3 py-2 text-left hover:bg-subtle">Refresh from the LMS</button></form>
                  <form action={logout}><button className="w-full px-3 py-2 text-left hover:bg-subtle">Sign out</button></form>
                </div>
              </details>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-[1080px] px-5 pt-7 pb-28 md:px-6 md:pt-14 md:pb-24">{children}</main>
      </body>
    </html>
  );
}
