import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export function loadEnvLocal() {
  const file = join(repoRoot, ".env.local");
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

export function credentials() {
  const file = loadEnvLocal();
  return {
    username: process.env.MOODLE_USERNAME || file.MOODLE_USERNAME || "",
    password: process.env.MOODLE_PASSWORD || file.MOODLE_PASSWORD || "",
  };
}

function runs(bin) {
  const r = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 15000 });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

export function findChrome() {
  const candidates = [];
  if (process.env.CHROME) candidates.push(process.env.CHROME);
  try {
    for (const d of readdirSync("/nix/store")) {
      if (/^[a-z0-9]{32}-chromium-\d/.test(d)) candidates.push(`/nix/store/${d}/bin/chromium`);
    }
  } catch {}
  candidates.push("chromium", "chromium-browser", "google-chrome");
  const failed = [];
  for (const bin of candidates) {
    const version = runs(bin);
    if (version) return { bin, version, failed };
    failed.push(bin);
  }
  return { bin: null, version: null, failed };
}

export const CHROME_HELP =
  "No Chromium runs here. Set CHROME=/path/to/chromium. Playwright's downloaded Chromium does not work on this machine (missing libglib). " +
  "Use a /nix/store/*-chromium-*/bin/chromium build that prints a version with --version.";
