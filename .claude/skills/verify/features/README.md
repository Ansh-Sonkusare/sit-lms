# Campus LMS verification map

This directory is the maintained source for verifying what a student or admin sees in Campus LMS. Read this index before you drive the app. Then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `bash .claude/skills/verify/scripts/launch.sh <port>`. Use a port no other instance holds.
- Run `node .claude/skills/verify/scripts/doctor.mjs --base http://localhost:<port>`. Require the expected commit and a running Chromium.
- Every page except `/login` needs a real SIT Nagpur LMS login. Set `MOODLE_USERNAME` and `MOODLE_PASSWORD` in the environment or in `.env.local`. Without them, only the `/login` page and the redirect from `/` can be verified. Report every other feature as unverified.
- The store is in memory. Anything a journey saves is gone after a server restart.
- Never drive an instance that this run did not start.

## Driving conventions

- Use `drive.mjs` for every page. Pass the route path as the argument. The driver logs in once per run.
- Use route paths and visible text as handles. Read the `.txt` dump for content and the `.png` for layout.
- Run every UI check at `--width 1280` and at `--width 375`.
- A `finalUrl` that ends in `/login` after login means the session failed. It does not mean the page works.
- Live LMS data and the day of the week change what a page shows. Write down the date of the run.

## Proof and skip reporting

- Keep the command, the JSON summary, the `.png`, and the `.txt` for each page.
- A mutation needs a second, fresh page load that shows the saved state.
- Report an unreachable path with the command you tried and the precondition that is missing.
- Do not report a path as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph of user-visible behavior. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.mjs`, `Gotchas`.

## Features

- [Today](./today.md) covers the home page: today's classes with marks, the due list, and the attendance summary.
- [Course attendance](./course-attendance.md) covers the attendance tab of one course: a month calendar and the dates that do not match the timetable.
- [Attendance by day](./attendance-by-day.md) covers one day: the calendar, each class's mark, and the other records for that day.
- [Attendance](./attendance.md) covers the attendance overview and the leave page.
- [Timetable](./timetable.md) covers the student timetable, a personal copy, and the admin editor. This feature is being built.
