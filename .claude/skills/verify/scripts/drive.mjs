#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHROME_HELP, credentials, findChrome } from "./lib.mjs";

const USAGE = `Usage: drive.mjs --base <url> [--width 375] [--height 900] [--out <dir>] [--click <css>] [--text <n>] [--no-login] <path>...
  Logs in once (MOODLE_USERNAME / MOODLE_PASSWORD from env or the repo's .env.local) unless --no-login,
  then screenshots each path full height (cap 4000px) to <out>/<n>-<slug>.png and writes page text to .txt.
  --click <css>  click the first match after each page loads, then screenshot again as <n>-<slug>-clicked.png
  --text <n>     include the first n characters of each page's text in the summary
  --out          default /tmp/campus-lms-verify/<timestamp>
  Prints a JSON summary on stdout.`;

function fail(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

const args = process.argv.slice(2);
const opt = { base: "", width: 1280, height: 900, out: "", click: "", text: 0, login: true };
const paths = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--base") opt.base = args[++i];
  else if (a === "--width") opt.width = Number(args[++i]);
  else if (a === "--height") opt.height = Number(args[++i]);
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--click") opt.click = args[++i];
  else if (a === "--text") opt.text = Number(args[++i]);
  else if (a === "--no-login") opt.login = false;
  else if (a === "-h" || a === "--help") fail(USAGE, 0);
  else if (a.startsWith("--")) fail(`Unknown option ${a}\n${USAGE}`);
  else paths.push(a);
}
if (!opt.base || !paths.length) fail(USAGE);
opt.base = opt.base.replace(/\/$/, "");
if (!Number.isFinite(opt.width) || !Number.isFinite(opt.height)) fail("--width and --height must be numbers.");

const creds = credentials();
if (opt.login && (!creds.username || !creds.password)) {
  fail(
    "MISSING CREDENTIALS: set MOODLE_USERNAME and MOODLE_PASSWORD in the environment or in the repo's .env.local " +
      "(a real SIT Nagpur LMS login). Every page except /login needs one. " +
      "To drive only public pages such as /login, pass --no-login.",
  );
}

const chrome = findChrome();
if (!chrome.bin) fail(`${CHROME_HELP}\nTried: ${chrome.failed.join(", ")}`);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = opt.out || join("/tmp/campus-lms-verify", stamp);
mkdirSync(outDir, { recursive: true });

const freePort = () =>
  new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
    s.on("error", rej);
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), "campus-lms-chrome-"));
const port = await freePort();
const proc = spawn(
  chrome.bin,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-sandbox",
    `--window-size=${opt.width},${opt.height}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
const exited = new Promise((res) => proc.once("exit", res));
async function cleanup() {
  try { ws?.close(); } catch {}
  proc.kill("SIGTERM");
  const timer = setTimeout(() => proc.kill("SIGKILL"), 5000);
  await exited;
  clearTimeout(timer);
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
process.on("SIGINT", async () => { await cleanup(); process.exit(130); });

async function main() {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch {}
    if (!target) await sleep(150);
  }
  if (!target) throw new Error(`Chrome (${chrome.bin}) never exposed a page on debug port ${port}.`);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP websocket failed")); });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
    } else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const waitEvent = async (method, timeout = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const i = events.findIndex((e) => e.method === method);
      if (i >= 0) return events.splice(i, 1)[0];
      if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${method}`);
      await sleep(50);
    }
  };
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
    return r.result.value;
  };
  const setViewport = (height) =>
    send("Emulation.setDeviceMetricsOverride", {
      width: opt.width, height, deviceScaleFactor: 1, mobile: opt.width < 500,
    });

  const goto = async (url) => {
    events.length = 0;
    await send("Page.navigate", { url });
    await waitEvent("Page.loadEventFired");
    await sleep(800);
    const doc = events.find((e) => e.method === "Network.responseReceived" && e.params.type === "Document");
    return doc?.params.response.status ?? null;
  };
  const consoleErrors = () =>
    events
      .filter((e) => e.method === "Runtime.exceptionThrown" || (e.method === "Runtime.consoleAPICalled" && e.params.type === "error") || (e.method === "Log.entryAdded" && e.params.entry.level === "error"))
      .map((e) => e.params.exceptionDetails?.text ?? e.params.entry?.text ?? e.params.args?.map((a) => a.value ?? a.description).join(" "));
  const shoot = async (file) => {
    await setViewport(opt.height);
    const h = await evaluate("Math.ceil(document.documentElement.scrollHeight)");
    const height = Math.min(Math.max(h, opt.height), 4000);
    await setViewport(height);
    await sleep(150);
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(data, "base64"));
    return { file, pageHeight: h, capped: h > 4000 };
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Log.enable");
  await setViewport(opt.height);

  if (opt.login) {
    await goto(`${opt.base}/login`);
    const filled = await evaluate(`(() => {
      const set = (sel, v) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
        return true;
      };
      return set('select[name=college]', 'sit-nagpur') && set('input[name=username]', ${JSON.stringify(creds.username)}) && set('input[name=password]', ${JSON.stringify(creds.password)});
    })()`);
    if (!filled) throw new Error("Login form not found at /login (select[name=college], input[name=username], input[name=password]). Run doctor.mjs.");
    await evaluate("document.querySelector('form button').click()");
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) {
      await sleep(250);
      try { ok = (await evaluate("location.pathname")) !== "/login"; } catch {}
    }
    if (!ok) {
      const msg = await evaluate("document.body.innerText.slice(0, 300)").catch(() => "");
      throw new Error(`LOGIN FAILED: still on /login after 30s. Page says: ${JSON.stringify(msg)}`);
    }
  }

  const slug = (p) => p.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "") || "home";
  const results = [];
  for (const [i, p] of paths.entries()) {
    const n = String(i + 1).padStart(2, "0");
    const base = join(outDir, `${n}-${slug(p)}`);
    const status = await goto(opt.base + p);
    const finalUrl = await evaluate("location.href");
    const text = await evaluate("document.body.innerText");
    writeFileSync(`${base}.txt`, text);
    const errors = consoleErrors();
    const shot = await shoot(`${base}.png`);
    const r = {
      path: p, finalUrl, status, png: shot.file, txt: `${base}.txt`,
      pageHeight: shot.pageHeight, capped: shot.capped, consoleErrors: errors,
    };
    if (opt.text) r.textPreview = text.slice(0, opt.text);
    if (opt.click) {
      const clicked = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(opt.click)}); if (!el) return false; el.click(); return true; })()`);
      r.clicked = clicked;
      if (clicked) {
        await sleep(1000);
        r.afterClickUrl = await evaluate("location.href");
        writeFileSync(`${base}-clicked.txt`, await evaluate("document.body.innerText"));
        r.clickedPng = (await shoot(`${base}-clicked.png`)).file;
      }
    }
    results.push(r);
  }
  return results;
}

try {
  const results = await main();
  console.log(JSON.stringify({ out: outDir, width: opt.width, chrome: chrome.version, loggedIn: opt.login, results }, null, 2));
} catch (e) {
  console.error(`DRIVE FAILED: ${e.message}`);
  await cleanup();
  process.exit(1);
}
await cleanup();
