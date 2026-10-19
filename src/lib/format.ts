const TZ = "Asia/Kolkata";
const STOP = new Set(["and", "of", "to", "the", "for", "in", "on", "a"]);

// "Computer Organization (Odd Semester-III) (Batch 2025-29)" → "Computer Organization"
export const cleanCourse = (name: string) =>
  name.replace(/\s*\((Odd|Even) Semester[^)]*\)|\s*\(Batch [^)]*\)|\s*(Odd|Even) Semester \d{4}-\d{2}/gi, "").trim();

// "Design and Analysis of Algorithms Lab" → "DAAL"
export const abbrev = (name: string) =>
  cleanCourse(name)
    .split(/[\s_\-]+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()))
    .map((w) => (/^[IVX]+$/.test(w) ? w : w[0].toUpperCase()))
    .join("")
    .slice(0, 6);

export const courseHue = (id: number) => (id * 47) % 360;

const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export function relDay(sec: number, now = Date.now()) {
  const d = new Date(sec * 1000);
  const diff = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(new Date(now)))) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
}

export const fmtTime = (sec: number) =>
  new Date(sec * 1000).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

export const fmtDate = (sec: number) =>
  new Date(sec * 1000).toLocaleString("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export const ago = (sec: number, now = Date.now()) => {
  const m = Math.round((now / 1000 - sec) / 60);
  if (m < 60) return `${Math.max(m, 1)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  if (m < 10080) return `${Math.round(m / 1440)}d ago`;
  return relDay(sec, now);
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'", apos: "'" };
export const stripHtml = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#?\w+);/g, (m, e) => ENTITIES[e] ?? (e.startsWith("#") ? String.fromCharCode(Number(e.slice(1))) : m))
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

export const fileSize = (b?: number | null) =>
  !b ? "" : b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(1)} MB`;

export const fileExt = (name: string) => (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "file").toLowerCase();

export const TARGET = 75;

// Classes you can miss and stay ≥75%, or (negative) consecutive classes needed to get back to 75%.
export function budget(attended: number, marked: number, target = TARGET / 100) {
  if (marked === 0) return 0;
  if (attended / marked >= target) return Math.floor(attended / target - marked + 1e-9);
  return -Math.ceil((target * marked - attended) / (1 - target) - 1e-9);
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
export const countWord = (n: number) => WORDS[n] ?? String(n);

// `left` = classes still scheduled this term, when known; caps what is actually possible.
export function budgetText(attended: number, marked: number, left?: number) {
  const b = budget(attended, marked);
  if (b < 0) {
    if (left !== undefined && -b > left) {
      const best = ((attended + left) / (marked + left)) * 100;
      return left === 0 ? "Can't reach 75% this term" : `Can't reach 75% (max ${best.toFixed(1)}%)`;
    }
    return left !== undefined ? `Attend ${-b} of the ${left} left` : `Attend the next ${-b}`;
  }
  if (b === 0) return marked && attended === marked ? "Don't miss the next one" : "Exactly at the line";
  return `Can miss ${left !== undefined ? Math.min(b, left) : b}`;
}

type Due = { id: number; name: string; timesort: number; course?: { id: number; fullname: string } | null };

// "Aptitude and Reasoning Skills III_Weekly Assisgnment-11 is due" → "Weekly Assisgnment-11"
export function dueTitle(e: Due) {
  let n = e.name.replace(/\s+is due$/i, "");
  const c = e.course && cleanCourse(e.course.fullname);
  if (c && n.toLowerCase().startsWith(c.toLowerCase())) n = n.slice(c.length).replace(/^[\s_:-]+/, "") || n;
  return n;
}

// Same-course, same-day items that differ only by a trailing number collapse into one "X 11 to 15" row.
export function collapseDue<T extends Due>(events: T[]) {
  const out: { first: T; title: string; count: number }[] = [];
  const seen = new Map<string, (typeof out)[number] & { nums: number[]; base: string }>();
  for (const e of events) {
    const t = dueTitle(e);
    const m = t.match(/^(.*?)[\s_-]*(\d+)$/);
    const key = m && `${e.course?.id}|${relDay(e.timesort)}|${m[1]}`;
    const hit = key ? seen.get(key) : undefined;
    if (hit && m) {
      hit.nums.push(Number(m[2]));
      hit.count++;
      hit.title = `${hit.base} ${Math.min(...hit.nums)} to ${Math.max(...hit.nums)}`;
      continue;
    }
    const row = { first: e, title: t, count: 1, nums: m ? [Number(m[2])] : [], base: m?.[1] ?? t };
    if (key) seen.set(key, row);
    out.push(row);
  }
  return out.map(({ first, title, count }) => ({ first, title, count }));
}

export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

// Teachers paste from Word: inline styles, <font>, <span> soup, empty paragraphs, &nbsp; runs.
export function cleanHtml(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?(font|span|o:p|u)\b[^>]*>/gi, "")
    .replace(/\s(style|class|align|face|size|color|lang|dir|id|width|height|border|cellpadding|cellspacing)="[^"]*"/gi, "")
    .replace(/(&nbsp;| )+/g, " ")
    .replace(/<p>(\s|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .trim();
}

// "📢 ANNOUNCEMENT – DMGT Assignment" → "DMGT Assignment"
export const cleanTitle = (t: string) =>
  t.replace(/^[\p{Extended_Pictographic}\uFE0F\s]+/u, "").replace(/^announcement\s*[–—:-]\s*/i, "").trim() || t;

// Cut on whole characters (never half an emoji) and at a word boundary.
export const truncate = (s: string, n: number) => {
  const chars = Array.from(s);
  if (chars.length <= n) return s;
  const cut = chars.slice(0, n).join("");
  return `${cut.slice(0, cut.lastIndexOf(" ") > n * 0.6 ? cut.lastIndexOf(" ") : cut.length).trimEnd()}…`;
};
