# Campus LMS

A faster, calmer front end for any college's Moodle LMS. Pick your college at sign-in. One screen tells you what's due, where your attendance stands, and what your teachers announced.

Built with Next.js 16 and TypeScript, on top of the official Moodle mobile web-service API (the same one the Moodle app uses). You sign in with your own LMS account. Nothing is scraped.

## Features

- **Today:** deadlines for the next 14 days grouped by day and the latest announcements.
- **Courses:** sections, notes, tasks and announcements in separate tabs, with search inside a course. PDFs open in the browser through a server-side proxy.
- **Updates:** an AI digest of announcements (via Groq): a summary, steps to take, dates found in the text, and whether it applies to you. To-do items can be ticked off.
- **⌘K search** across courses and files.
- Light and dark themes, plus a phone layout with a bottom tab bar.

### SIT Nagpur extras

Colleges marked `sit: true` in `src/lib/colleges.ts` also get these. They rely on SIT's custom attendance plugin, the academic calendar in `src/lib/sit/calendar.ts`, and the timetables that admins keep in the app.

- **Today's classes:** your timetable for today (or the next class day), with Now/Next. Each class shows whether the LMS has marked it yet. Tap a class to see what skipping it does to that course's attendance, and what skipping the whole day does overall.
- **Attendance:** percentage per course from `mod_attendance`, with a 75% marker, the classes left before teaching ends, the best percentage you can still reach and what it takes ("Attend 4 of the 4 left"). Classes are counted per timetable slot, because the LMS records one session per slot.
- **Attendance by day:** pick a date on a calendar and see that day's classes with Present, Absent or Not marked, across all courses. Each course also has an Attendance tab with a month calendar and a list of dates that don't match your timetable: a class recorded on another day, a record on a day with no class, a class the LMS never marked. The comparison starts on your timetable's first day.
- **Leave record:** add leave days, then mark them accepted once the institute approves them. Accepted leave turns the LMS's absent marks on those days into presents in every number.
- **Timetables:** each section and batch can have its own timetable. Students pick theirs on the Timetable page (account menu, then "Your timetable"). The option that best matches the attendance the LMS recorded for them is marked Suggested, once they have at least 10 records. Until they pick, they get the college default, and a note says so.
- **Your own copy:** a student can copy their timetable and change it with the same editor admins use. The copy no longer gets admin changes; the page says when the original was updated after the copy was made. "Discard my copy" goes back to the original.
- **Academic calendar** and portal links.

## How it works

The browser never talks to Moodle. Pages render on the server, which calls `webservice/rest/server.php` with your token. The token sits in an encrypted httpOnly cookie ([iron-session](https://github.com/vvo/iron-session)). Your password is sent once to `login/token.php` and never stored.

```
Browser ──> Next.js server (token in encrypted cookie) ──> Moodle mobile API
                     │
                     ├─> Groq (announcement digest, optional)
                     └─> Vercel Blob (digest cache, optional)
```

Each college is one entry in `src/lib/colleges.ts`: an id, a name and its Moodle URL. The session remembers which college you signed into, and every API call, link and file proxy uses that site. To add colleges without a code change, set `COLLEGES` to a JSON array of the same shape. The site needs Moodle's mobile web services enabled, which is the default for any site the Moodle app works with.

### Timetables

A timetable is data, not code. `src/lib/sit/timetable.ts` defines its shape (name, start date, batches, slot times, and one block per class with its slots, subject, room, batch and LMS course) and `TimetableSchema`, which checks it every time one is read or saved. Two classes for the same students cannot share a slot.

Admins are named in `ADMINS` as `<college id>:<Moodle user id>`, for example `sit-nagpur:1809`. An admin gets "Manage timetables" in the account menu. There they can create a timetable (blank, or a copy of another section's), edit it with one form per weekday, delete it, and pick the college default. The server checks admin rights again on every change. If two admins edit the same timetable, the second save fails with a message instead of overwriting the first.

Shared timetables are stored as `timetables/<college>.json` in the Blob store. Personal copies are stored as `timetables/personal/<college>/<user id>.json`. The student's choice is in their preferences cookie, with the account it belongs to; another account on the same browser starts with the default. Until an admin saves a timetable, SIT Nagpur gets the built-in Semester III, Section B timetable (`SEED`). That happens only when the Blob store says there is no document: if the store can't be read, pages show an error and admin changes are refused. Admin changes are compare-and-swap writes, so two admins saving at the same time both keep their changes. Without `BLOB_READ_WRITE_TOKEN`, all of this is kept in memory and is lost on restart.

## Running it

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32+ characters; encrypts the session cookie. `openssl rand -hex 32` |
| `GROQ_API_KEY` | no | Turns on the announcement digest. Free tier at [console.groq.com](https://console.groq.com) |
| `GROQ_MODEL` | no | Defaults to `openai/gpt-oss-120b` |
| `ANTHROPIC_API_KEY` | no | Uses Claude for the digest when no Groq key is set |
| `BLOB_READ_WRITE_TOKEN` | no | Keeps timetables and digests in Vercel Blob across restarts; without it they're kept in memory |
| `ADMINS` | no | Who can manage timetables: `<college id>:<Moodle user id>`, comma-separated, e.g. `sit-nagpur:1809` |
| `COLLEGES` | no | Extra colleges for the login dropdown, e.g. `[{"id":"x","name":"X College","url":"https://lms.x.edu"}]` |

Without an AI key, announcements show as cleaned-up text. If the provider rejects the key, rate-limits us or is down, summaries pause for a while (6 h for a bad key, until the retry-after time for a rate limit, 2 min otherwise) and resume by themselves. A new key lifts the pause at once.

### Checks

```bash
npx tsc --noEmit && npm run lint
node scripts/check-timetable.ts   # timetable, holidays, leave credit
node scripts/check-format.ts      # text cleanup and wording
node scripts/check-marks.ts       # LMS records compared with the timetable
node scripts/check-timetables.ts  # timetable validation and the Suggested pick
node scripts/check-store.ts       # stored documents: missing vs failed reads, write conflicts, admin edits
node scripts/check-digest.ts      # AI summaries: provider gate, retry-after, per-user and hourly limits
```

`scripts/spike.ts` signs in to `MOODLE_URL` with `MOODLE_USERNAME` / `MOODLE_PASSWORD` from `.env.local` and lists which web-service functions your token can call.

## Deploying

```bash
npx vercel deploy --prod
```

Set the same environment variables in the Vercel project. `vercel.json` pins functions to Mumbai (`bom1`); move it near your colleges' LMS servers.

## Disclaimer

It only uses your own account through the official Moodle API. Attendance projections are estimates from the timetable; the LMS is always the source of truth.
