# SIT LMS

A faster, calmer front end for the [SIT Nagpur Moodle LMS](https://lms.sitnagpur.edu.in). One screen tells you what's due, where your attendance stands, and what your teachers announced.

Built with Next.js 16 and TypeScript, on top of the official Moodle mobile web-service API (the same one the Moodle app uses). You sign in with your own LMS account. Nothing is scraped.

## Features

- **Today:** deadlines for the next 14 days grouped by day, overall attendance, upcoming calendar events and the latest announcements.
- **Today's classes:** your timetable for today (or the next class day), with Now/Next. Tap a class to see what skipping it does to that course's attendance, and what skipping the whole day does overall.
- **Attendance:** percentage per course from `mod_attendance`, with a 75% marker, the classes left before teaching ends, the best percentage you can still reach and what it takes ("Attend 4 of the 4 left").
- **Leave record:** add leave days, then mark them accepted once the institute approves them. Accepted leave turns the LMS's absent marks on those days into presents in every number.
- **Courses:** sections, notes, tasks and announcements in separate tabs, with search inside a course. PDFs open in the browser through a server-side proxy.
- **Updates:** an AI digest of announcements (via Groq): a summary, steps to take, dates found in the text, and whether it applies to your section. To-do items can be ticked off.
- **Academic calendar:** holidays, assessments and exams for the semester.
- **⌘K search** across courses and files.
- Light and dark themes, plus a phone layout with a bottom tab bar.

## How it works

The browser never talks to Moodle. Pages render on the server, which calls `webservice/rest/server.php` with your token. The token sits in an encrypted httpOnly cookie ([iron-session](https://github.com/vvo/iron-session)). Your password is sent once to `login/token.php` and never stored.

```
Browser ──> Next.js server (token in encrypted cookie) ──> Moodle mobile API
                     │
                     ├─> Groq (announcement digest, optional)
                     └─> Vercel Blob (digest cache, optional)
```

The timetable, batch and academic calendar for semester 3, section B, batch B1 are hard-coded in `src/lib/timetable.ts` and `src/lib/calendar.ts`. Edit those for another batch.

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
| `BLOB_READ_WRITE_TOKEN` | no | Caches digests in Vercel Blob across restarts; without it they're cached in memory |
| `MOODLE_URL` | no | Defaults to `https://lms.sitnagpur.edu.in` |

Without an AI key, announcements show as cleaned-up text.

### Checks

```bash
npx tsc --noEmit && npm run lint
node scripts/check-timetable.ts   # timetable, holidays, leave credit
node scripts/check-format.ts      # text cleanup and wording
```

`scripts/spike.ts` signs in with `MOODLE_USERNAME` / `MOODLE_PASSWORD` from `.env.local` and lists which web-service functions your token can call.

## Deploying

```bash
npx vercel deploy --prod
```

Set the same environment variables in the Vercel project. `vercel.json` pins functions to Mumbai (`bom1`), close to the LMS.

## Disclaimer

An unofficial personal project, not affiliated with Symbiosis Institute of Technology. It only uses your own account through the official API. Attendance projections are estimates from the timetable; the LMS is always the source of truth.
