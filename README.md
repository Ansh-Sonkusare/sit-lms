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

Colleges marked `sit: true` in `src/lib/colleges.ts` also get these. They rely on SIT's custom attendance plugin and hand-entered data in `src/lib/sit/`.

- **Today's classes:** your timetable for today (or the next class day), with Now/Next. Tap a class to see what skipping it does to that course's attendance, and what skipping the whole day does overall.
- **Attendance:** percentage per course from `mod_attendance`, with a 75% marker, the classes left before teaching ends, the best percentage you can still reach and what it takes ("Attend 4 of the 4 left").
- **Leave record:** add leave days, then mark them accepted once the institute approves them. Accepted leave turns the LMS's absent marks on those days into presents in every number.
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

The SIT timetable, batch and academic calendar (semester 3, section B, batch B1) are hard-coded in `src/lib/sit/`.

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
| `COLLEGES` | no | Extra colleges for the login dropdown, e.g. `[{"id":"x","name":"X College","url":"https://lms.x.edu"}]` |

Without an AI key, announcements show as cleaned-up text.

### Checks

```bash
npx tsc --noEmit && npm run lint
node scripts/check-timetable.ts   # timetable, holidays, leave credit
node scripts/check-format.ts      # text cleanup and wording
```

`scripts/spike.ts` signs in to `MOODLE_URL` with `MOODLE_USERNAME` / `MOODLE_PASSWORD` from `.env.local` and lists which web-service functions your token can call.

## Deploying

```bash
npx vercel deploy --prod
```

Set the same environment variables in the Vercel project. `vercel.json` pins functions to Mumbai (`bom1`); move it near your colleges' LMS servers.

## Disclaimer

It only uses your own account through the official Moodle API. Attendance projections are estimates from the timetable; the LMS is always the source of truth.
