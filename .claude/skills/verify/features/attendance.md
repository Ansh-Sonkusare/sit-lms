# Attendance

The attendance pages show a student's attendance across courses at `/attendance`, and let the student handle leave at `/attendance/leave`.

## Sub-features

- `att-overview` shows attendance per course at `/attendance`.
- `att-leave` shows the leave page at `/attendance/leave`.
- `att-links` links into the course attendance tab and the day view.

## How to get to it (user POV)

- Choose attendance in the app navigation.
- Open `/attendance` or `/attendance/leave` directly.

## Driving it with drive.mjs

Preconditions:

- The dev server is up and `doctor.mjs` passes, including both Moodle credentials.

- **Overview.** Run `node .claude/skills/verify/scripts/drive.mjs --base http://localhost:<port> --width 375 --text 800 /attendance /attendance/leave`. Both `finalUrl` values keep their paths. The text of `/attendance` names each course with its attendance figures.
- **Desktop.** Repeat with `--width 1280`.
- **Follow a link.** Read a course link from the `.txt`, then load it with a second `drive.mjs` run and check that it matches `course-attendance.md`.
- **Proof.** Keep screenshots and text. Write down the date.

## Gotchas

- Figures come from the live LMS and change as teachers mark attendance.
- Check the leave page's exact wording from the first run. This map does not copy its text.
- A leave action may write data. Read the page before you click, and prefer reading over submitting.
