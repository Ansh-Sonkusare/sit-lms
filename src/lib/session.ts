import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type Session = {
  token?: string;
  userid?: number;
  fullname?: string;
};

export async function getSession() {
  return getIronSession<Session>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "sitlms",
    ttl: 60 * 60 * 24 * 30,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  });
}

export type User = Required<Session>;

export async function requireUser(): Promise<User> {
  const s = await getSession();
  if (!s.token || !s.userid) redirect("/login");
  return { token: s.token, userid: s.userid, fullname: s.fullname ?? "" };
}
