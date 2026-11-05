<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/wordmark-dark.svg">
    <img src="packages/brand/logo/wordmark.svg" alt="Compass Neo" height="48">
  </picture>
</p>

<p align="center">
  <b>A faster, friendlier way to use <a href="https://www.compass.education">Compass</a>.</b><br>
  Your timetable, grades, work, files, attendance and more, in one place that is actually nice to open.
</p>

<p align="center">
  <a href="https://compassneo.app"><b>compassneo.app</b></a>
</p>

> [!NOTE]
> Compass Neo is an unofficial client, built by a student. It is not made by, endorsed by or affiliated with Compass
> Education or the WA Department of Education.

## What it does

- **Today, at a glance.** The day's classes with rooms, teachers (with their photos), relief and room changes, the
  lesson plan, and what is due. Step between days; the week back and the fortnight ahead are already synced.
- **Every class in one panel.** Press a class for its lessons, grade, assessments, work, notices, files and classmates,
  pulled from Compass and (at WA public schools) Connect, side by side.
- **Grades that make sense.** Every assessment with its weighting, how your mark has moved, where you sit in the class,
  and *where you could finish*: "get 70% on the rest and you finish on 74%".
- **Hand work in.** Upload to a Compass learning task or a Connect submission without leaving the app.
- **Files that open.** PDFs, images, videos, YouTube and Loom open in place; grab a whole folder as one zip.
- **You, too.** Attendance by term, class and period, your events and excursions, and your Chronicle.
- **Stays signed in.** Compass signs everyone out daily. Compass Neo doesn't.
- **Pretty.** Dark (by default), light or auto, springy motion, and a colour for every class.

## Privacy and security

Compass Neo has to sign in to Compass as you, so here is exactly what it keeps:

- Your **username and password are encrypted** (AES-256-GCM) with a key only the server holds, and bound to your
  account, so they only ever decrypt for you. They are used for one thing: signing back in when Compass ends your
  session.
- Your **Compass and Connect sessions** are encrypted the same way under a second key, and never leave the server.
  Files are passed through short, signed links.
- Your **devices hold a random token**, and the server keeps only its hash.
- **Signing out of your last device deletes your account**, your login and everything synced for it.
- If Compass rejects your saved login (say you changed your password), it is forgotten and you are asked to sign in.
- Sign-in attempts are rate limited.

It reads from Compass and Connect and writes only when you hand in work, after asking you first.

## Stack

```
apps/web            React Router 8 (SPA mode), Glaze design system retuned for Compass Neo
packages/backend    Convex: school directory, sign-in, sessions, sync, caches
packages/compass    fetch-only Compass client, shared by every runtime (Convex, and later phone and watch)
packages/connect    fetch-only client for WA DET Connect (grades, content, submissions), same login as Compass
packages/brand      logo SVGs and brand colours for clients that cannot read CSS tokens
```

[Bun](https://bun.sh) workspaces, [Convex](https://convex.dev) for the backend, [motion](https://motion.dev) for the
springs, [Solar](https://github.com/480-Design/Solar-Icon-Set) icons, and [Glaze](https://design.how) for the
design system. Hosted on Vercel.

## Run it

```sh
bun install
bun run dev:backend      # convex dev, in packages/backend (sign in to Convex the first time)
bun run dev              # web on http://localhost:5175
```

`apps/web/.env.local` needs `VITE_CONVEX_URL` (the `CONVEX_URL` from `packages/backend/.env.local`).

Convex env (`npx convex env set ...` in packages/backend):

| Variable | What |
|-|-|
| `SESSION_KEY` | 32 random bytes, base64. Seals Compass and Connect session cookies. Rotating it only costs a fresh sign-in per account (done automatically with the stored login). |
| `CREDENTIALS_KEY` | 32 random bytes, base64. Seals each account's username and password. Rotating it makes every device sign in again. Set it separately on every deployment (dev and prod). |

Make a key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## Deploy

- **Backend:** `bun run --filter @compassneo/backend deploy` (`convex deploy`), then set both keys with
  `npx convex env set --prod ...`.
- **Web:** Vercel builds the repo root with `vercel.json` (`bun run build`, serving `apps/web/build/client` with every
  path falling back to `index.html`). Set `VITE_CONVEX_URL` to the production Convex URL.

Other useful scripts: `bun run typecheck`, and `bun run lint` (Glaze's lint) before shipping a screen.

# How it works

## How it talks to Compass

- **No browser.** compass-education drives Chromium because Compass's web login waits on a Cloudflare Turnstile
  check. The endpoint Compass's own phone apps use, `POST /services/admin.svc/AuthenticateUserCredentials`, takes
  `{username, password}` as JSON and returns the same session cookies, so `packages/compass` signs in with fetch.
  Endpoint shapes for data (calendar, tasks, feed, attendance) are ported from compass-education and its extras.js.
- **Cloudflare fingerprints clients.** Node and Bun's fetch get challenged from a home connection; Convex's default
  runtime passes. Keep Compass calls in Convex actions without `"use node"`.
- **Schools.** Compass's school search (`schools.compass.education/api/v1/schoolsearch/search`) is open and returns
  names and organisation ids. The address lookup behind it needs a Turnstile token bound to Compass's site, so the
  slug is found by guessing (`thornlieshs-wa`, `mckinnonsc-vic`) and proving each guess against the login page's
  `<h1 class="schoolName">`. Proven schools are cached in Convex for everyone; misses are remembered for three days;
  a person can always paste their address instead.
- **Logins are kept, sealed.** Compass ends sessions daily, so each account (school + username) stores its login
  under `CREDENTIALS_KEY` (AES-256-GCM, bound to the account so a ciphertext only opens on its own row). Any Compass or
  Connect call that finds its session ended signs in again with it and retries once (`convex/lib/compass.ts`,
  `convex/lib/connect.ts`). If Compass rejects the stored login (password changed), the account is forgotten and its
  devices are asked to sign in. Signing out the last device deletes the account and its login. Devices hold only a
  random token; Convex keeps its SHA-256. Sign-in attempts are limited to six per account per ten minutes.

## Connect (WA)

WA public schools also have DET Connect, which holds assessment outlines and grades and signs in with the same DET
login. `packages/connect` signs in without a browser: `/login/student` redirects to the DET single sign-on (Oracle
Access Manager) form on login.det.wa.edu.au, which takes `ssousername`, `password`, `acceptterms` and its hidden
`request_id`, then redirects back with Connect's cookies. Data calls are `POST /connectapi/rest/api/v1/...` with
`X-XSRF-TOKEN` from the `CONNECT_XSRF` cookie, behind a read-only allow-list (ported from the connect-sdk, which
captured the portal's own calls). Grades are cached per account (`connectCache`) and shown at once; a refusal is shown in
place and retried after 6 hours.

Reading an assessment outline (`getGrades` in packages/connect) has traps, all seen on a real account:

- An outline can be split into parts (Science's "Chemical Sciences", HASS's "Term 3 - HIS"): tasks sit in
  `taskGroups[].groups[]` as well as `taskGroups[].tasks`. Every level is read; each task keeps its part's name.
- An outline shared with another course lists that course's tasks too, with no maximum and no weighting. Those are not
  assessed for the student and are left out.
- A subject's mark is Connect's own `groupResultsData.mark` ("67.92%") when it gives one (`percentOf`), else the
  weighted average of the marked tasks (`scoreOf`). Each task counts `mark / maximumMark * weightedMaximumMark`:
  Connect's `weightedMark` is rounded to a tenth and summing it drifts (50.3 for 50.7).
- Weightings need not total 100 (Maths' semester 2 totals 61), so a task's share of the grade is its weighting out of
  the outline's total.
- One learning area can hold two outlines the same semester (Health and General PE are both "Health and Physical
  Education"). Those are named for their outlines, so they never share a class or a history.

Everything else Connect holds for a class is read the same way, behind the same allow-list (`packages/connect/src/more.ts`):
Learning Content (`learningcontent/root/DomainSchoolClass/<id>/`, then each section's `contents?view=PUBLISHED`), the
submission board and the student's own entry on each, the class's learners, and My Connect attendance. Handing work in is
the one write, kept out of the allow-list on purpose: `handIn` uploads the file to the class
(`files/upload/DomainSchoolClass/<id>?uploadType=FILE&purpose=ATTACHMENT&context=SUBMISSION`) and attaches it to the
submission (`submission/<id>/saveStudentSubmission`), the same two calls Connect's own upload dialog makes.

## Sync

`convex/sync.ts` fetches everything for an account in one run, one step after another: Compass (profile and photo, the
timetable from a week back to a fortnight on, learning tasks in full, news, attendance, events, Chronicle, teachers' photos)
then Connect at a WA school (sign-in, classes, notices, grades, attendance). Each step is written to
a `syncs` row as it starts and ends; results land in `compassCache` and `connectCache`. A sign-in starts a run at once,
opening the app starts one if the last is over 20 minutes old, and "Sync now" always does.

The app shows a sync without naming what it fetches: after a sign-in the form wipes away and the compass becomes the
progress (the dial fills like a gauge, the needle sweeps across it and finds north when the run is done), then the app
opens. Home shows only the gauge, as an icon in the corner (press it to sync; its tooltip says when it last did), and
always shows the last synced data.

## Timetable

`convex/timetable.ts` keeps one `compassCache` row per school day (`day:YYYY-MM-DD`, empty on a day without classes) and
a `classes` row of every class seen lately. The `day` query joins each lesson to its teacher's name, its colour, its
Connect grade and its learning tasks (`convex/lib/match.ts`), so every client gets the same answer. A day outside the
synced window is fetched when someone opens it (`load`). Relief teachers and room changes come from Compass's covering
fields. Teacher codes ("jsmith") become names from Connect's teacher lists; a class is matched to its Connect subject by
shared teachers first, then by subject words. Teachers' photos come from a lesson's own page
(`Activity.svc/GetLessonsByInstanceIdQuick`, `ManagerPhotoPath`), because Compass refuses teachers' profiles to students;
the sync's people step copies Compass's square thumbnail into storage (`convex/teachers.ts`). Each class gets one of twelve hues, unique while a student has twelve
classes or fewer. Days are bucketed in the school's state time and shown in its IANA zone (`lib/days.ts` on both sides).

## Beyond the timetable

Found in Compass's own page scripts (`assets-cf-prod.compass.education/StaticAssetsN/PageScripts/*.js`, public) and
Connect's Angular bundle, and checked against a real account (`packages/compass/src/more.ts`, `packages/connect/src/more.ts`):

| What | Compass | Connect | Convex |
|-|-|-|-|
| Resources | `Wiki.svc/GetActivityAndSubjectResourcesNode` (the class's whole tree) | Learning Content | `resources.ts`, per class, on demand |
| Work | learning tasks in full (sync), hand-in: `FileUpload/FileUploadHandler` then `LearningTasks.svc/CreateTaskStudentSubmission` | submission board, hand-in (above) | `work.ts` |
| Classmates | refused to students | the class's learners | `learners.ts` |
| Attendance | rolls by class (`Attendance.svc/GetAttendanceSummary`), days by term | the year's absences, this term by period | `attendance.ts` (sync) |
| Events | calendar entries that are not classes (excursions, clubs, assemblies, exams) | | `events.ts` (sync) |
| Chronicle | `ChronicleV2.svc/GetUserChronicleFeedThin`, asked for every category in `GetRelevantCategories` (an empty list means none) | | `chronicle.ts` (sync) |

Files from either side need the account's session, which never leaves Convex, so the app links to Compass Neo's own
route instead: `GET /file/<link>/<name>` (`convex/http.ts`). Each link names one file of one account under an HMAC
(`convex/lib/links.ts`, keyed from `SESSION_KEY`), and dies with the account. A file over 19 MB is sent back to Compass.

Handing work in writes to Compass or Connect exactly as their own upload windows do: the file goes to Convex storage
first (`work.uploadUrl`), `work.submit` passes it on and deletes it, and the app asks before sending.

## Class panel

Pressing a class opens everything about it in a panel at the side (`apps/web/app/features/class/`), fed by one query,
`classes.detail` (`convex/classes.ts`): the class's lessons in the weeks around the day being looked at, its teachers,
both semesters of grades with every assessment, its learning tasks, and its notices from Connect (the Connect class is
found by code, then by name and the notices' authors). Labelled tabs, each its own scroll, shown only when they have
something: Overview (the lesson, its plan, the grade, what is due, notices, next lessons, a Classmates card from Connect),
Grades, Work (Compass's learning tasks and Connect's submissions together, each opening to its instructions,
attachments, what was handed in and a place to hand in, with a confirm step: `features/class/work.tsx`), Files (both
sides' resources as one library of folder rows that open in place, newest Connect items first, lesson plans folded at
the bottom, select or a folder's "Download all" to zip: `files.tsx`), Lessons. The panel widens for Files: beside the day
when the window has room (`dayRoom` in `features/panel/side-panel.tsx`), over it when not. The day prefetches every class
on it, so the panel usually opens full.

Sources show as the real logos (`components/brand/source-mark.tsx`: Compass's compass ring, Connect's knot), never as
words. Files and videos open in the viewer over the app (`features/viewer/`, `lib/neo/viewer.ts`): a file is fetched
with a spinner and shown in place when the browser can (PDF, image, video, audio, text), else saved without leaving the
page; YouTube and Loom play in it; many files download as one zip made in the browser (fflate). Any other web link
opens a new tab.

## The student's own pages

Under the day, three tiles open Attendance, Events and Chronicle in the same side panel as a class (one panel at a time;
going between them swaps in place). `features/student/`:

- Attendance: the year's share of rolls present, each class's rolls, days by term (Compass), and the current term
  period by period (Connect).
- Events: grouped by month, a weekly club as one row with its sessions, "You went" where Chronicle records it.
- Chronicle: a one-line tally (house points, commendations, events), then the entries by month in hairline rows; an
  entry opens to the teacher's note in place, never a list of Compass's field prompts.

Connect shows marks with no dates, so grade history is kept here: each grades fetch writes the change to a `history`
row in `connectCache` (`convex/lib/history.ts`), a point whenever a subject's score moves and the moment each mark first
appeared. Marks already there when an account's history began are its baseline and have no day.

## Design

Glaze from design.how, retuned in `apps/web/app/components/glaze/tokens.css`: Glaze's neutral surfaces and ink,
Neo blue as the only accent (primary glass, focus, a focused field, small glaze), Outfit for the wordmark and login titles,
rounder shells. Light, dark (default) and auto themes, chosen in the profile card or on the sign-in screen
(`lib/neo/theme.ts`, applied before first paint). The brand layer (`apps/web/app/components/brand/`) holds the logo
components, the compass motion and the view-transition morphs (`apps/web/app/lib/neo/morph.ts`); the timetable's pieces
are in `apps/web/app/features/timetable/timetable.css`. Follow `.claude/skills/glaze/SKILL.md` for UI work and run
`bun run lint` (Glaze's lint) before shipping a screen.

Motion runs on springs: `motion` (`lib/neo/motion.ts`) in React, and `--ease-spring` (a `linear()` spring) for view
transitions. The class panel floats in from the right while the day springs aside on the same spring (from 760px wide;
a phone gets it over the screen), the profile photo grows into its card, the mark flies between the login and the app,
and a new day slides in while the block's height springs to fit.

Icons are Solar (`@solar-icons/react`) in the filled Bold style, all through `components/glaze/icon.tsx`; the room switch
and the relief mark are the line style, so they sit lighter beside the word they qualify.

Deliberate departures from stock Glaze, all asked for: a brand accent, class colours (twelve OKLCH hues), springs with a
little overshoot, a sheen and lit top edge on the surfaces (still no shadows), gradients on the grade rings and bars, a
class-coloured wash and tab thumb in the class panel, filled icons, and the bezel drawing behind the login mark.
