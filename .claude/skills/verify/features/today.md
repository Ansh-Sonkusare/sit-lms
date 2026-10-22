# Today

The home page `/` shows the student what matters today. It lists today's classes with a mark for each, a list of work that is due, and a summary of attendance.

## Sub-features

- `today-classes` lists today's classes from the timetable, each with its own mark.
- `today-marks` shows the per-class mark (Present, Absent, or Not marked) beside each class.
- `today-due` lists work that is due.
- `today-summary` shows the attendance summary.
- `today-auth` sends a visitor without a session to `/login`.

## How to get to it (user POV)

- Sign in at `/login`. The app opens `/`.
- Open `/` directly in the browser.

## Driving it with drive.mjs

Preconditions:

- The dev server is up and `doctor.mjs` passes, including both Moodle credentials.
- The account has a timetable for today. On a day with no classes the class list is empty, and that is not a failure of the feature.

- **Redirect without a session.** Run `node .claude/skills/verify/scripts/drive.mjs --no-login --base http://localhost:<port> /`. `finalUrl` ends in `/login` and the text contains `Sign in`.
- **Logged-in home at phone width.** Run `node .claude/skills/verify/scripts/drive.mjs --base http://localhost:<port> --width 375 --text 600 /`. `finalUrl` is `<base>/`. The text names today's classes with a mark each, then the due list, then the attendance summary. In the screenshot nothing is cut off at the right edge.
- **Same at desktop width.** Repeat with `--width 1280`.
- **Proof.** Keep both screenshots and both text dumps. Compare each class's mark with `attendance-by-day.md` for the same date.

## Gotchas

- The page depends on the current date. A weekend or holiday shows no classes. Run on a weekday, or report the date.
- Marks come from the live LMS. Two runs minutes apart can differ if the LMS changed.
- The redirect check passes without credentials. It does not show that the logged-in page works.
