import { z } from "zod";

// Identify as the Moodle app, which some site plugins expect.
export const UA = { "User-Agent": "MoodleMobile" };

export class MoodleError extends Error {
  errorcode: string;
  constructor(errorcode: string, message: string) {
    super(message);
    this.errorcode = errorcode;
  }
}

// Moodle wants PHP-style form params: courseids[0]=1&options[0][name]=x
function flatten(obj: unknown, prefix = "", out = new URLSearchParams()) {
  if (obj === undefined || obj === null) return out;
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.append(prefix, typeof obj === "boolean" ? (obj ? "1" : "0") : String(obj));
  }
  return out;
}

export async function login(site: string, username: string, password: string) {
  const res = await fetch(`${site}/login/token.php`, {
    method: "POST",
    headers: UA,
    body: new URLSearchParams({ username, password, service: "moodle_mobile_app" }),
  });
  const data = await res.json();
  if (!data.token) throw new MoodleError(data.errorcode ?? "login", data.error ?? "Login failed");
  return { token: data.token as string };
}

export async function call<S extends z.ZodType>(
  site: string,
  token: string,
  wsfunction: string,
  params: Record<string, unknown>,
  schema: S,
): Promise<z.infer<S>> {
  const url = `${site}/webservice/rest/server.php?moodlewsrestformat=json&wsfunction=${wsfunction}`;
  const body = flatten(params);
  body.set("wstoken", token);
  const res = await fetch(url, { method: "POST", headers: UA, body, cache: "no-store" });
  if (!res.ok) throw new MoodleError("http", `${wsfunction}: HTTP ${res.status}`);
  const data = await res.json();
  // Moodle reports errors as HTTP 200 + {exception, errorcode, message}
  if (data && typeof data === "object" && "exception" in data) {
    throw new MoodleError(data.errorcode, `${wsfunction}: ${data.message}`);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new MoodleError("schema", `${wsfunction}: unexpected response — ${parsed.error.message}`);
  return parsed.data;
}

// ponytail: per-process memory cache, fine for a single-user server; swap for Redis/KV if multi-instance.
const store = new Map<string, { at: number; value: Promise<unknown> }>();

export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = fn();
  store.set(key, { at: Date.now(), value });
  value.catch(() => store.delete(key));
  return value;
}

export function clearCache(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
