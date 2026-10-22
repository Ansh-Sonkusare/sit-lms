import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findCollege, type College } from "./colleges.ts";

export type Session = {
  college?: string;
  token?: string;
  userid?: number;
  fullname?: string;
};

export async function getSession() {
  return getIronSession<Session>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "lms",
    ttl: 60 * 60 * 24 * 30,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  });
}

export type User = { token: string; userid: number; fullname: string; college: College; site: string };

export async function currentUser(): Promise<User | null> {
  const s = await getSession();
  const college = findCollege(s.college);
  if (!s.token || !s.userid || !college) return null;
  return { token: s.token, userid: s.userid, fullname: s.fullname ?? "", college, site: college.url };
}

export async function requireUser(): Promise<User> {
  return (await currentUser()) ?? redirect("/login");
}
