import { getSession } from "@/lib/session.ts";
import { getCourseContents, getMyCourses } from "@/lib/data.ts";
import { cleanCourse } from "@/lib/format.ts";

export type SearchItem = { title: string; subtitle: string; href: string; kind: "Course" | "File" | "Task" | "Quiz" | "Link" };

const file = (url: string) => `/api/file?url=${encodeURIComponent(url)}`;

// Courses, files, tasks and links only; feedback forms, forums and attendance activities are noise here.
export async function GET() {
  const s = await getSession();
  if (!s.token || !s.userid) return new Response("Unauthorized", { status: 401 });
  const u = { token: s.token, userid: s.userid, fullname: s.fullname ?? "" };
  const courses = (await getMyCourses(u)).mine;
  const per = await Promise.all(
    courses.map(async (c): Promise<SearchItem[]> => {
      const name = cleanCourse(c.fullname);
      const sections = await getCourseContents(u, c.id).catch(() => []);
      const items: SearchItem[] = [{ title: name, subtitle: "", href: `/courses/${c.id}`, kind: "Course" }];
      for (const sec of sections)
        for (const m of sec.modules) {
          if (m.uservisible === false) continue;
          const sub = `${name} — ${sec.name}`;
          const files = (m.contents ?? []).filter((f) => f.type === "file" && f.fileurl);
          if (m.modname === "resource" && files[0]) items.push({ title: m.name, subtitle: sub, href: file(files[0].fileurl!), kind: "File" });
          else if (m.modname === "folder") for (const f of files) items.push({ title: f.filename, subtitle: `${sub} — ${m.name}`, href: file(f.fileurl!), kind: "File" });
          else if (m.modname === "assign") items.push({ title: m.name, subtitle: name, href: `/assign/${c.id}/${m.id}`, kind: "Task" });
          else if (m.modname === "quiz" && m.url) items.push({ title: m.name, subtitle: name, href: m.url, kind: "Quiz" });
          else if (m.modname === "url") items.push({ title: m.name, subtitle: sub, href: m.contents?.[0]?.fileurl ?? m.url ?? `/courses/${c.id}`, kind: "Link" });
        }
      return items;
    }),
  );
  return Response.json(per.flat());
}
