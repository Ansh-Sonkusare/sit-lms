# Attendance by day

The page `/attendance/day?date=YYYY-MM-DD` shows one day. It has a calendar, each class of that day with its mark (Present, Absent, or Not marked), and a section "Also recorded this day" for LMS records that do not match a class.

## Sub-features

- `day-calendar` shows the calendar and the chosen date.
- `day-classes` lists the classes of that day, each with Present, Absent, or Not marked.
- `day-also-recorded` lists "Also recorded this day".
- `day-skip` lets the student skip a class or the whole day, and the counts change by slots.

## How to get to it (user POV)

- Choose a day in a calendar on the attendance pages or the course attendance tab.
- Open `/attendance/day?date=YYYY-MM-DD` directly.

## Driving it with drive.mjs

Preconditions:

- The dev server is up and `doctor.mjs` passes, including both Moodle credentials.
- Pick a date with classes. Use a past weekday of the current term. Read the date format from the link on the course attendance tab if unsure.

- **Day view at phone width.** Run `node .claude/skills/verify/scripts/drive.mjs --base http://localhost:<port> --width 375 --text 800 "/attendance/day?date=<YYYY-MM-DD>"`. `finalUrl` keeps the date. The text lists each class with one of `Present`, `Absent`, `Not marked`.
- **Same at desktop width.** Repeat with `--width 1280`.
- **Also recorded.** When the text has `Also recorded this day`, each row is an LMS record. Compare the count of class marks with the home page for the same date if the date is today.
- **Skip flow.** The skip actions change data. Use `--click <css>` only after you read the page's buttons in the `.txt` and the screenshot, then load the page again with a second `drive.mjs` run to show the counts. Skipping is held in memory only.
- **Proof.** Keep screenshots and text. Write down the date.

## Gotchas

- A date with no classes shows an empty list. Choose another date before you call the feature broken.
- Counts are slots, not blocks. A double lab counts as two slots.
- The skip state is lost when the server restarts. A skip proof needs a second load without a restart.
