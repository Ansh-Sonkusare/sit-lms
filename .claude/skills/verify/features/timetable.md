# Timetable

Status: being built. The routes below are the planned user journeys. Selectors and visible text are to be filled from the routes once they are merged. Until then, confirm each route exists before you drive it, and report a missing route as unreachable.

The timetable feature lets a student choose a timetable and see a weekly grid, keep a personal copy, and lets an admin edit the shared timetables.

## Sub-features

- `tt-choose` shows the student chooser at `/timetable`.
- `tt-grid` shows the weekly grid for the chosen timetable.
- `tt-edit` lets a student change a personal copy at `/timetable/edit`.
- `tt-admin-list` lists timetables for an admin at `/admin/timetables`.
- `tt-admin-edit` lets an admin edit one timetable at `/admin/timetables/<id>`.
- `tt-admin-gate` keeps non-admins out of `/admin/timetables`.

## How to get to it (user POV)

- A student opens `/timetable`, picks a timetable in the chooser, and reads the weekly grid.
- A student opens `/timetable/edit` to change their personal copy.
- An admin opens `/admin/timetables`, then one timetable at `/admin/timetables/<id>`.
- Admins come from the environment variable `ADMINS`, as `sit-nagpur:<moodleUserId>` entries. The account used for the run must be in that list for the admin pages.

## Driving it with drive.mjs

Preconditions:

- The dev server is up and `doctor.mjs` passes, including both Moodle credentials.
- For the admin journeys, `ADMINS` in `.env.local` holds the account's own `sit-nagpur:<moodleUserId>`. Restart the dev server after you change it.

- **Student journey.** Run `node .claude/skills/verify/scripts/drive.mjs --base http://localhost:<port> --width 375 --text 800 /timetable /timetable/edit`. Expect the chooser and then the weekly grid. Read the `.txt` to find the visible labels, and record them in this file.
- **Admin journey.** Run the same driver on `/admin/timetables`. Read a timetable id from the text or links, then load `/admin/timetables/<id>`.
- **Non-admin gate.** With an account that is not in `ADMINS`, load `/admin/timetables`. Expect a refusal or a redirect, not the editor.
- **Edit and persist.** Make one edit through the page, then load the page again with a second `drive.mjs` run. The edit must show. The store is in memory, so do not restart in between.
- **Proof.** Keep screenshots and text. Add the real handles to this file in the same session.

## Gotchas

- The routes may not exist in your checkout. A 404 means the feature is not merged. It is not a pass.
- The timetable decides today's classes and the slot counts on the other attendance pages. A change here can change `today.md` and `attendance-by-day.md` results.
- The in-memory store loses edits when the server restarts.
