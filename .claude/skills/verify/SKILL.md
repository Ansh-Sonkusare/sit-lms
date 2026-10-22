---
name: verify
description: Launch and drive Campus LMS (the Next.js 16 front end for Moodle, SIT Nagpur) in headless Chromium to prove a UI change works. Use it after any change under src/ that a student or admin can see, to take real-login screenshots and page text at desktop and phone widths, and to check the attendance, timetable, and home pages.
---

# Verify Campus LMS

The app is a web UI over a real Moodle site. Every page except `/login` needs a real LMS login. You prove a change by launching the dev server, logging in once with a real account, loading the pages the change touches, and reading screenshots and page text. Read `features/README.md` first, then the feature file that matches your change.

## Launch

```
bash .claude/skills/verify/scripts/launch.sh 3123
```

- It needs `npm install` done once and `.env.local` at the repo root with `SESSION_SECRET=<64 hex chars>` (`openssl rand -hex 32`). Without `BLOB_READ_WRITE_TOKEN` the store is in memory, so every launch starts empty.
- It starts `npx next dev -p <port>` in its own process group, waits for the log line `Ready in`, then requests `/login` once so the first compile is done. Ready means `/login` answered 200.
- It refuses when the port is taken. Two instances run side by side on different ports, so pick a free port. Never drive an instance this run did not start.
- State is in `/tmp/campus-lms-verify/`: `dev-<port>.pid` and `dev-<port>.log`.

Teardown:

```
bash .claude/skills/verify/scripts/stop.sh 3123
```

## Doctor

Run this first, and again whenever anything looks off. It is read-only.

```
node .claude/skills/verify/scripts/doctor.mjs --base http://localhost:3123
```

It checks that the port answers, that `/login` returns 200 with the college select, which git commit the checkout is at, that `node_modules` exists, that `.env.local` or the environment has `SESSION_SECRET`, `MOODLE_USERNAME` and `MOODLE_PASSWORD` (presence only, values are never printed), and that a Chromium runs. Exit code 1 means a check failed. Missing Moodle credentials fail the doctor. They do not stop you from driving `/login`.

## Drive

Credentials come from the environment variables `MOODLE_USERNAME` and `MOODLE_PASSWORD`, or from the same names in the repo's `.env.local`. They are never in this skill and the scripts never print them. The account is a real SIT Nagpur LMS account (college id `sit-nagpur`, site https://lms.sitnagpur.edu.in). If you have none, you cannot verify logged-in pages. Say so. Do not fake it.

```
node .claude/skills/verify/scripts/drive.mjs --base http://localhost:3123 --width 375 --text 400 / /attendance /courses/491?tab=attendance
```

Options:

- `--base <url>` is required. Positional arguments are the paths to load.
- `--width <px>` sets the viewport width (default 1280). Widths under 500 use mobile emulation. Run every UI change at 1280 and at 375.
- `--height <px>` sets the minimum viewport height (default 900).
- `--out <dir>` sets the evidence directory (default `/tmp/campus-lms-verify/<timestamp>`).
- `--click <css>` clicks the first match on each page, then captures the page again as `<n>-<slug>-clicked.png` and `.txt`. The summary shows `afterClickUrl`.
- `--text <n>` adds the first n characters of page text to the JSON summary.
- `--no-login` skips login. Use it for `/login` and for the redirect check.

What it does: it starts its own Chromium with a fresh temp profile and a random free debugging port, drives it over the Chrome DevTools Protocol, logs in once at `/login` (`select[name=college]`, `input[name=username]`, `input[name=password]`, then `form button`), loads each path, and writes `<out>/<n>-<slug>.png` (full height, capped at 4000px) and `<n>-<slug>.txt` (page `innerText`). It prints a JSON summary with `path`, `finalUrl`, `status` (of the final page after redirects), the file paths, and `consoleErrors`. It kills only the Chromium it started and deletes the temp profile.

Failure messages are plain. `MISSING CREDENTIALS` exits 2 before any browser starts. `LOGIN FAILED` exits 1 and quotes the first 300 characters of the page. A missing Chromium exits 2 and says how to fix it.

Chromium: the driver uses `CHROME` if set, else the first `/nix/store/*-chromium-*/bin/chromium` whose `--version` runs, else `chromium` on PATH. Playwright's downloaded Chromium does not work on this machine (missing libglib), and the driver does not use Playwright. A known good build is `/nix/store/50ayz35y5c2ham6qsfwn1yaxznhijykl-chromium-151.0.7922.108/bin/chromium`.

To check that an unauthenticated visitor is redirected: `drive.mjs --no-login --base ... /`. `finalUrl` must end in `/login`.

## Evidence

A proof has these parts, for each page the change touches:

- The screenshot at 1280 and at 375, and the `.txt` text dump. Read both. The text proves content. The screenshot proves layout.
- The `finalUrl` for each path. A path that lands on `/login` while logged in means the session failed. It is not a pass.
- An empty `consoleErrors`, or each error explained.
- For a mutation (marking attendance, editing a timetable), a second read-only load of the page after a fresh navigation, to show the change persisted. The in-memory store is lost when the server restarts.
- The exact command lines you ran, kept in your report.

Use the real login and the real user path. Do not call internal actions or set cookies by hand. The LMS data is the real account's data, so compare what the page shows with what the LMS shows, not with what you expect. Do not copy the account's personal data (names, marks, ids) into reports beyond what the proof needs.

Evidence lives in `/tmp/campus-lms-verify/<timestamp>/` or the `--out` you chose. Cleanup never removes it.

## Cleanup

```
bash .claude/skills/verify/scripts/stop.sh 3123
```

This stops the dev server from `launch.sh` by its process group and checks the port is free. The driver already removed its own Chromium and temp profile when it exited. If a drive was killed, its leftovers are `/tmp/campus-lms-chrome-*` profile directories and a headless chromium: find your own by the `--remote-debugging-port` and `--user-data-dir` in `ps`, and kill by PID. Never `pkill chromium` or `pkill next`. Leave `/tmp/campus-lms-verify/*/` evidence directories alone.

## Helpers

- `scripts/launch.sh [port]` starts the dev server and waits until usable.
- `scripts/stop.sh [port]` stops the server that `launch.sh` started on that port.
- `scripts/doctor.mjs --base <url>` is the read-only health check.
- `scripts/drive.mjs --base <url> [options] <path>...` is the login, screenshot, and text driver.
- `scripts/lib.mjs` holds the shared Chromium search and `.env.local` reader.

All of them are executable. Run `drive.mjs --help` for usage.

## Not covered

- The logged-in journeys need a real LMS login. The skill drives them, but the scripts were proven only up to `/login` and the redirect from `/`.
- Pages that read the LMS depend on live LMS data and on the day of the week. Note the date you ran.
- Only page loads and one optional click are scripted. For longer flows, run `drive.mjs` once per step, or extend `drive.mjs` and keep the new option in this file.
