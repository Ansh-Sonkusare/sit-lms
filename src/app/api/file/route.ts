import { currentUser } from "@/lib/session.ts";

export async function GET(req: Request) {
  const s = await currentUser();
  if (!s) return new Response("Unauthorized", { status: 401 });

  let u: URL;
  try {
    u = new URL(new URL(req.url).searchParams.get("url") ?? "");
  } catch {
    return new Response("Bad url", { status: 400 });
  }
  // URL parsing normalises "..", so checking the parsed pathname is safe
  const site = new URL(s.site);
  const p = u.pathname.replace(/^\/pluginfile\.php\//, "/webservice/pluginfile.php/");
  if (u.origin !== site.origin || !p.startsWith("/webservice/pluginfile.php/"))
    return new Response("Bad url", { status: 400 });
  u.pathname = p;
  u.searchParams.delete("token");
  u.searchParams.set("token", s.token);

  const up = await fetch(u, { redirect: "manual", cache: "no-store" });
  if (!up.ok) return new Response("Upstream error", { status: 502 });
  const type = up.headers.get("content-type") ?? "application/octet-stream";

  if (type.includes("application/json")) {
    const text = await up.text();
    if (text.includes('"error"')) return new Response("Moodle rejected the request", { status: 502 });
    return new Response(text, { headers: { "content-type": type } });
  }

  const name = decodeURIComponent(u.pathname.split("/").pop() ?? "file");
  const headers = new Headers({
    "content-type": type,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    "cache-control": "private, max-age=3600",
    // uploaded HTML/SVG must not run scripts on our origin
    "content-security-policy": "sandbox",
  });
  const len = up.headers.get("content-length");
  if (len) headers.set("content-length", len);
  return new Response(up.body, { headers });
}
