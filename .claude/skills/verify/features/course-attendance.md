# Course attendance

The attendance tab of one course, at `/courses/<id>?tab=attendance`, shows a month calendar of the marks for that course. Below it, the section "Dates that don't match your timetable" lists LMS records that the timetable does not explain.

## Sub-features

- `course-att-calendar` shows the month calendar with a mark on each class day.
- `course-att-mismatch` lists "Dates that don't match your timetable".
- `course-att-month` moves between months.
- `course-att-phone` fits the calendar marks on a 375px screen.

## How to get to it (user POV)

- Open a course from the home page or the course list at `/courses`, then choose its attendance tab.
- Open `/courses/<id>?tab=attendance` directly. Course id `491` is a known example for the SIT Nagpur account used so far.

## Driving it with drive.mjs

Preconditions:

- The dev server is up and `doctor.mjs` passes, including both Moodle credentials.
- The account is enrolled in the course. Course ids differ per account. Read them from `/courses` if `491` is not yours.

- **Course tab at phone width.** Run `node .claude/skills/verify/scripts/drive.mjs --base http://localhost:<port> --width 375 --text 800 "/courses/491?tab=attendance"`. `finalUrl` keeps `tab=attendance`. The text has a month name once, not twice, and the screenshot shows the calendar with marks that fit inside the screen.
- **Same at desktop width.** Repeat with `--width 1280`.
- **Mismatch list.** Read the `.txt` for `Dates that don't match your timetable`. When the section is present, each row names a date. Compare one date with `attendance-by-day.md`.
- **Proof.** Keep the screenshots and text. Write down the course id and the date of the run.

## Gotchas

- The query string needs quotes in a shell, because `?` can be a glob.
- The mismatch section can be absent when everything matches. Absent is a valid result for such an account. Do not call it a failure, and do not call it verified for the case that has mismatches.
- The calendar depends on the month shown. Note which month the screenshot is of.
