#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { CHROME_HELP, credentials, findChrome, loadEnvLocal, repoRoot } from "./lib.mjs";

const i = process.argv.indexOf("--base");
const base = (i > 0 ? process.argv[i + 1] : "").replace(/\/$/, "");
if (!base) {
  console.error("Usage: doctor.mjs --base <url>   (read-only; exit 1 when any check fails)");
  process.exit(2);
}

let bad = 0;
const line = (ok, name, detail = "") => {
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` - ${detail}` : ""}`);
};

try {
  const r = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  const html = await r.text();
  line(true, "port answers", base);
  line(r.status === 200, "/login returns 200", `got ${r.status}`);
  line(/name="college"/.test(html), "/login has the college select");
} catch (e) {
  line(false, "port answers", `${base} -> ${e.cause?.code ?? e.message}. Start it: npx next dev -p <port>`);
}

const git = (...a) => spawnSync("git", ["-C", repoRoot, ...a], { encoding: "utf8" }).stdout.trim();
const dirty = git("status", "--porcelain").split("\n").filter(Boolean).length;
line(true, "checkout", `${git("rev-parse", "--short", "HEAD")} on ${git("rev-parse", "--abbrev-ref", "HEAD")}, ${dirty} changed files, ${repoRoot}`);
line(existsSync(`${repoRoot}/node_modules/next`), "node_modules installed", "run npm install if missing");

const env = loadEnvLocal();
line(Boolean(process.env.SESSION_SECRET || env.SESSION_SECRET), "SESSION_SECRET present (.env.local or env)");
const c = credentials();
line(Boolean(c.username), "MOODLE_USERNAME present (needed for logged-in drives)");
line(Boolean(c.password), "MOODLE_PASSWORD present (needed for logged-in drives)");

const chrome = findChrome();
line(Boolean(chrome.bin), "chromium runs", chrome.bin ? `${chrome.bin} (${chrome.version})` : `${CHROME_HELP} Tried: ${chrome.failed.join(", ")}`);

process.exit(bad ? 1 : 0);
