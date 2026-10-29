# CLAUDE.md

Notes for future sessions on The Learning Hub.

## Apps Script backend — fifteen files since 13 October 2026

`auth/apps-script.gs`, one 3,339-line file, is now **`auth/apps-script/`**:
fifteen `.gs` files grouped by job, and a `README.md` that is the deploy
guide and the map of what is where. Apps Script loads every file of a
project into one shared scope, so nothing calls anything differently.
Done at Brandon's request: "it shouldn't just be one page".

**The first deploy after the split is a one-time switch.** From a terminal it
is one command, `node auth/apps-script/deploy.mjs` (see below). By hand it
is written out step by step in that README: replace `Code.gs` in the editor
with `00_settings.gs`, add the other fourteen, Run → `checkHubInstall`, then
a new version of the existing deployment. Until Brandon does it, the live
backend is whatever was last deployed from the old single file. That is
fine: the fifteen files behave exactly as that file's final version did,
bar the dwell-migration fix below. Point Brandon at the README rather than
re-explaining it, and never suggest "New deployment".

**Behaviour did not change, and that was proved, not assumed.** The code
moved verbatim: a script cut the old file into its 189 declarations and
placed each exactly once. The tidy-up after it (`_sheet()`, `_rowFrom()`,
the `ACTIONS` table, a shared mail loop) was checked with the simulator's
`--strict` comparison against the old file: every response byte for byte,
every cell, every email, the cache contents, and every sheet read and
write, across all scenarios. Tab names, column lists and cache keys are
untouched, so the new code reads and writes exactly the cells the old one
did, and even the live cache stays valid across the switch.

The one deliberate behaviour change is a bug fix: `migrateDwellToPerModule()`
compared timestamps as text and could write `"Sun Sep 20 2026 …"` into the
dwell tab. It now goes through `_tsMs`/`_isoOut` like every other reader.

**Rules for the files** (`node tests/apps-script-sim.js` fails on each):

- **No top-level code reads a name from another file.** The editor decides
  the load order, and a person pasting by hand decides the editor's order.
  Top level is literal constants and function declarations; `ACTIONS` in
  `02_router.gs` is allowed because its handlers only run on a request.
  The simulator loads each file alone, then all of them reversed and
  shuffled, and demands identical results.
- **No name declared twice across files.** Apps Script then refuses to load
  the project. This is also why the old `Code.gs` must be replaced, not
  kept beside the new files: the simulator checks that combination fails
  to load at all, rather than running half-old, half-new.
- **Every file ends with `function endOf_<file>_() {}`** (trailing
  underscore keeps it out of the Run menu) and has a line in `_hubFiles()`
  in `02_router.gs`. `checkHubInstall()` and `doGet()` use them to name a
  file that is missing or was cut short while pasting; opening the `/exec`
  URL shows `"files":"all 15 present"`. A new file needs both, plus a line
  in the tables in the README and at the top of `00_settings.gs`.
- **Rows by column name.** Write with `_rowFrom(HEADERS, {...})`, which
  throws on a misspelt column rather than writing a blank cell. Read with
  `_dataRows()` and `_colIndex()`. Never `row[5]`.
- **Who may call what is the `ACTIONS` table** in `02_router.gs`: `admin`,
  `newsletter` and `fresh` flags per action. A new endpoint is one line
  there; the simulator's permissions section checks a teacher is refused
  every admin-only action, so add new ones to `ADMIN_ONLY` in the test.
- **Editor-run functions all live in `90_editor_tools.gs`** —
  `checkHubInstall`, `authorizeMail`, `auditHubData`, `flushHubCache`,
  `warmHubCache`, `migrateDwellToPerModule` — so opening that one file
  gives a clean Run menu.

`auth/gate.js` still says `auth/apps-script.gs` in two comments. Left
alone on purpose: any edit to `gate.js` means the `?v=N` cascade across
every page. Fix them the next time `gate.js` changes anyway.

### Deploying from a terminal: `node auth/apps-script/deploy.mjs`

Added the same day, when Brandon asked for a terminal command instead of
pasting fifteen files. It drives clasp (Google's Apps Script CLI) at a
pinned version through npx, so nothing is installed globally. It is the
recommended route in the README, with the editor route kept as the fallback,
for example if the school's Workspace admin ever blocks clasp's sign-in.
What it must never stop doing, all held by `node tests/deploy-sim.js`:

- **Never create a deployment.** It runs `update-deployment` on the ID taken
  from `API_URL` in `auth/gate.js`, which makes a new version and keeps the
  URL. `create-deployment`/`deploy` would mint a new URL: the `http_404`
  whole-Hub outage described below.
- **Refuse a project that does not own that deployment.** That is how a
  wrong Script ID is caught before anything is uploaded.
- **Upload the live project's own `appsscript.json`, unchanged.** It holds
  the web app's `executeAs`/`access`. A guessed manifest could quietly turn
  "Anyone" into something the Hub cannot call.
- **Run `tests/apps-script-sim.js` first; back up first; verify after.** The
  backup in `~/aisa-hub-backend-backups/` is a complete clasp project that
  can be pushed back. After the push it downloads the project again and
  compares it file by file before deploying anything.
- **`--rollback N`** points the deployment back at version N. HEAD (what the
  editor shows) keeps the new files, and the next deploy moves forward again.

clasp's `push` uploads every file in one `projects.updateContent` call,
which replaces the project. So the old `Code.gs` vanishes in the same
instant the new files land, which is why there is no half-pasted state on
this route. One quirk: it only uploads when some local file is new or
changed, so it cannot remove a stray file on its own; the script says so
and stops.

The Script ID is remembered per computer in `auth/apps-script/.deploy.json`
(gitignored). Bumping `CLASP_VERSION` means re-reading the new clasp's
`--help`: version 3 renamed half its commands. `tests/fake-clasp.js` imitates
3.4.1 and will not notice a rename. Each command form was checked against
the real 3.4.1 binary, signed out, to make sure it parses.

## Apps Script — pending redeploy

The backend in `auth/apps-script/` (see above) has uncommitted-on-Google
changes from recent commits that need to be pasted into the Apps Script
project and redeployed (Deploy → Manage deployments → New version). The
URL in `gate.js` stays the same. Until the redeploy happens, the new
endpoints fail silently and the dependent UIs stay empty:

- **Abu Dhabi timezone:** `nowIsoLocal()` writes `+04:00` instead of
  UTC `Z` for all new rows. Existing rows untouched.
- **Per-module dwell tracking** (per-chapter version collapsed for sheet
  size): `dwell` sheet now stores one row per (email × module) with
  total_seconds, chapters_seen, avg_secs_per_chapter. After redeploying
  the new code, run `migrateDwellToPerModule()` **once** from the Apps
  Script editor (Run → migrateDwellToPerModule). It snapshots the
  existing per-chapter rows into a `dwell_legacy_backup_<timestamp>`
  sheet, then rewrites `dwell` with the new headers. Until you run it,
  the admin engagement section shows a yellow "needs migration" banner
  and refuses writes so no data ever lands in the wrong shape.

- **Performance-review round-trip workflow** — two new sheets, four new
  endpoints. Backend creates them lazily on first access; one piece of
  manual setup is needed:
  1. After redeploy, open the spreadsheet and find the new
     `line_managers` tab (or create it if it didn't auto-spawn). Headers:
     `email | name | division`. Add the line managers staff can pick
     from the "Send to line manager" dropdown on each eval form.
     **Intentionally separate from the `admins` tab** — a TA's line
     manager isn't usually SLT.
  2. The `form_submissions` tab will auto-fill as staff submit forms.
     No setup required.
  3. Endpoints added: `get_line_managers`, `submit_form`,
     `get_form_submission`, `complete_form`, `list_my_submissions`.
     Notifications fire automatically via the existing `notifications`
     sheet when forms move between stages.

- **Reminder emails from the training tracker** — the admin dashboard's
  "Remind outstanding" button can now send a real, AISA-branded email as
  well as the in-app bell. This rides on the existing `post_notification`
  action (no new endpoint, no new sheet): it accepts optional
  `send_email`, `email_link` and `email_link_label`, and replies with an
  `email: { sent, failed, skipped }` summary. `MailApp.sendEmail` is used,
  so the send-mail scope has to be granted once by running
  `authorizeMail()` from the editor as the account that owns the script
  — clicking the button in the Hub will never prompt for it. One
  personalised message per recipient (first name pulled from
  the `sessions` and `roster` tabs), `replyTo` set to the admin who sent
  it, and sends stop short of both the daily mail quota and the 6-minute
  execution cap, reporting anything unsent as `skipped`.
  Unlike the items above this one does **not** fail silently: until the
  redeploy, the tracker posts the bell notification and then warns the
  admin in red that no emails went out.

- **Newsletter mail-out** — two new endpoints, `newsletter_status` and
  `send_newsletter`. No new sheet: recipients are the `roster` tab plus
  everyone in `sessions`, filtered to `@aisa.sch.ae`.

  **Run `authorizeMail()` once from the Apps Script editor** (Run →
  authorizeMail), signed in as the account that owns the script. It
  mails that account and logs the remaining quota. This is not optional
  and it is easy to miss: **a web app never shows an authorisation
  prompt to the person clicking a button in the Hub**, so until the
  owner grants the send-mail scope from the editor, every `MailApp`
  call fails — including `getRemainingDailyQuota()`. The same grant
  covers the reminder emails and the goal-form copies.

  Note that `sendNewsletter` cannot usefully be run from the editor:
  it takes the signed-in user and the page's payload, so run
  `authorizeMail()` instead. It returns `not_callable_from_editor`
  rather than throwing, to say so.

  **Who can send is `NEWSLETTER_SENDERS` in `auth/apps-script/00_settings.gs`**
  — currently `bbaki@` and `hodai@`. Deliberately **not** the `admins`
  tab: every SLT admin can post a bell notification, but mailing the
  whole school is a bigger button. Edit that array to change it. The
  send bar on the newsletter page hides itself for everyone else, but
  that is cosmetic — `send_newsletter` re-checks server-side, which is
  the check that matters, because the sign-in gate is client-side and
  this repo is public.

  Guard rails: a real send needs `confirm: '1'`, `test_only: '1'` mails
  only the sender, and the loop stops short of the daily mail quota and
  the 6-minute execution cap, reporting the remainder as `skipped` so
  the sender knows to run it again rather than assuming everyone got it.
  The email link is whatever `url` the page passes, and the page passes
  its own `location.origin + location.pathname` — **so no production
  host is hardcoded anywhere.** Keep it that way.

  Until the redeploy this does **not** fail silently: `gate.js` maps
  `unknown_action` through, and the bar reports "the Apps Script backend
  has not been redeployed yet" in red. It names the other failures too —
  missing mail permission, exhausted daily quota, hitting the 6-minute
  cap — and each says what to do next.

  **Never collapse a thrown quota read into a quota of zero.** Both
  mailers read the quota through `_mailQuota()`, which keeps "the script
  may not send mail" apart from "no sends left today", because the two
  need opposite advice and the first one shipped once disguised as the
  second: a test send to one person came back "0 sent, 1 skipped (quota
  or time limit)" when the real problem was that the scope had never
  been granted.

- **Module free-text capture** — three new endpoints
  (`save_module_response`, `get_module_response`,
  `admin_module_responses`) and one new sheet, `module_responses`,
  created lazily on first write. No manual setup needed. Backs the
  AI Literacy Teacher Readiness module, which is the first thing on the
  Hub to store a teacher's typed answers server-side.

  Unlike the other pending items this one does **not** fail silently:
  `gate.js` maps `unknown_action` to a visible red banner telling the
  teacher the backend hasn't been updated and to report it. That was
  deliberate — a silently-dropped delivery plan is worse than an error.

  **Privacy:** `module_responses` rows are personal data under UAE
  Federal Decree-Law No. 45 of 2021 — named staff writing about what
  they're unsure of. Reads are admin-gated; a teacher can only ever
  read back their own row. Don't widen that, and don't mirror this
  sheet anywhere public — **the GitHub repo is public**, and the
  sign-in gate is client-side only, so anything committed is
  world-readable regardless of what `gate.js` renders.

- **Surveys — the Secondary Teacher Personal Goal form.** Three new
  endpoints (`save_survey_response`, `get_survey_response`,
  `admin_survey_responses`) and one new sheet, `survey_responses`,
  created lazily on first write. No manual setup needed.

  The form is `Tools and Resources/secondary-teacher-goal.html`
  (+ `-goal.js`); the admin view is the *Personal goals · secondary
  2026–27* section on the admin dashboard, under the **Survey Data**
  tab (`admin-dashboard.html#goals`).

  Like the module capture above this one does **not** fail silently:
  until the redeploy the form shows the teacher a red banner saying the
  backend isn't switched on, and the admin section shows its own red
  banner instead of rendering empty.

  **Required entries are enforced twice** — in the page, and again in
  `SURVEY_SPECS` in `auth/apps-script/41_surveys.gs`. That double check is the entire
  reason this stopped being a Google Form, so if you add a question that
  must be answered, add its key to `required` there too. Otherwise it is
  only a suggestion. The ten focus-area names are pinned in
  `SURVEY_SPECS.choices.focus_area` and must stay character-for-character
  identical to `FOCUS_AREAS` in `secondary-teacher-goal.js`, or
  submissions start bouncing with `missing_required`.

  **Two pieces of optional setup**, both safe to skip:
  1. `SURVEYS_SPREADSHEET_ID` in `auth/apps-script/00_settings.gs` is empty,
     so survey rows land in the spreadsheet the script is bound to.
     Paste a spreadsheet ID there to move **only** the survey data into
     its own workbook — worth doing if secondary SLT should see the goal
     responses without being handed the whole analytics sheet. A bad ID
     silently falls back to the bound spreadsheet rather than throwing,
     so check the rows actually moved.
  2. Tag secondary staff `secondary` in the `roster` tab. The admin
     section's "still to submit" list is the roster minus whoever has
     submitted, narrowed by tag, and it auto-selects `secondary` when
     that tag exists. Without tags it falls back to the whole roster;
     staff not on the roster at all never appear as outstanding.

  The form is six steps. A seventh — a returning-teacher look-back page
  shown only to staff who were here last year — was removed on 16 Sept
  2026 as pointless: it asked nothing and only told people to go and
  re-read last year's appraisal. Nothing in the form is conditional any
  more; the `when` predicate that made a step optional went with it.
  **"Were you at AISA last year?" stays** even though it no longer
  branches to anything — it is still required, and it drives the "New to
  AISA" badge on the admin cards and a column in the CSV. Don't tidy it
  away as unused.

  One row per (email × survey), upserted — a teacher reopening the form
  edits their goal rather than filing a second one, and `revision`
  counts the edits while `submitted_at` stays at the first commitment.
  Submitting emails them a copy (`MailApp`, same authorisation scope as
  the reminder emails — approve it once).

  **Privacy:** `survey_responses` rows are personal data under UAE
  Federal Decree-Law No. 45 of 2021 — named staff writing about what
  they want to get better at, feeding an appraisal conversation. Same
  rule as `module_responses`: reads are admin-gated, a teacher can only
  ever read back their own row, and nothing from this sheet goes in the
  repo, which is public.

- **Session `last_used` is no longer written on every request.**
  `verifySessionToken()` runs before every action and used to
  `setValue()` the `last_used_iso` cell each time, so every read the Hub
  does carried a spreadsheet *write* in front of it. It now only writes
  when the stored value is older than `LAST_USED_WRITE_INTERVAL_MS`
  (5 minutes). `last_seen` on the admin tracker loses nothing but
  five minutes of precision. This is the one change here that actually
  makes the backend faster; until it is redeployed the admin dashboard
  stays slow, and the client-side work described below only stops it
  *lying* about why.

- **The bilingual newsletter email (29 October 2026).** `send_newsletter`
  now takes optional Arabic copy (`issue_ar`, `headline_ar`, `intro_ar`,
  `items_ar`, `link_label_ar`, `signoff_ar`), a `signoff` and a
  `logo_url`, and with them sends the AISA bilingual design instead of the
  English-only one. See *The email* under Issue No. 6 below. No new
  endpoint, sheet or permission. Until the redeploy the old backend
  ignores the Arabic and sends English only, and the issue's mail bar
  says so in red after the test send rather than failing silently.

- **Read cache + one-request admin dashboard (23 September 2026).** The
  backend now answers most reads from `CacheService` and has a new
  `admin_dashboard` endpoint — see *Data loading — audited 23 September
  2026* below. Redeploy the usual way (**Manage deployments → ✏️ →
  Version: New version**, never *New deployment*, which changes the URL).
  No new sheet, no data migration, and **no new permission**:
  `CacheService` needs no authorisation, so the redeploy asks for nothing.

  Until the redeploy it does **not** fail: `admin_dashboard` answers
  `unknown_action`, and the dashboard and charts fall back to the
  separate endpoints they always used — same data, same speed as before.
  The browser-side half (analytics no longer blocking the page, the admin
  check and the bell no longer asked on every page view, the saved copy
  that draws the dashboard instantly) works from the moment it is pushed.

  Two optional extras, both safe to skip:
  1. **Keep it warm.** Triggers (clock icon) → Add Trigger → function
     `warmHubCache` → Time-driven → Minutes timer → **Every 5 minutes**.
     Then the first admin load of the day is as quick as the second. It
     reads only, and does nothing outside 06:00–20:00 Abu Dhabi.
  2. **After editing the spreadsheet by hand**, either press **Refresh**
     on the dashboard, or run `flushHubCache()` from the editor to make the
     whole Hub re-read everything at once (it also re-checks every
     session, so a session row you deleted stops working immediately).
     Otherwise a hand edit shows up when its cache entry expires — see
     the TTL table below.

## Admin dashboard — "takes forever, then says I'm not an admin"

Reported and fixed 18 September 2026. The message was a lie: the boot
code did

```js
auth.adminOverview().then(render).catch(function () { showState('state-denied'); });
```

so **every** failure — a timeout, a 500, an Apps Script quota trip, a
network blink, an HTML error page that `r.json()` choked on — rendered
*Admin access required*. Only the backend's own `not_admin` actually
means that. There is now a separate `state-error` panel that names what
went wrong and offers a retry, and `state-denied` is reserved for a real
`not_admin`. **Don't collapse those two states back together.**

The slowness behind it had three parts:

1. **Six requests fired at once on page load** — `record_pageview`
   (gate.js), `whoami` (menu.js's `isAdmin()`), then `admin_overview`,
   `admin_dwell`, `admin_module_responses` and `admin_survey_responses`.
   Apps Script gives one script very little parallelism, so they queued
   on Google's side where the browser could neither see nor time them
   out.
2. **Every one of them wrote to the spreadsheet before doing any work**,
   via `verifySessionToken()` — see the redeploy note above.
3. **`fetch()` had no timeout**, so a request the backend never answered
   left the page spinning indefinitely.

`apiCall()` in `gate.js` now wraps all of that:

- **A concurrency limit** (`MAX_INFLIGHT`, currently 2) queues calls in
  the browser instead. Above 1 on purpose — `record_pageview` and
  `whoami` are quick and shouldn't sit behind a 30-second
  `admin_overview`.
- **A 60-second timeout** via `AbortController`, surfaced as
  `request_timeout`. Generous deliberately: a full-sheet admin read is
  genuinely slow and a tight timeout would make things worse.
- **Non-JSON responses** are read as text and reported as `bad_response`
  or `http_<status>` instead of a bare `SyntaxError`, because an
  over-quota or crashed Apps Script answers with an HTML page.
- **One retry** on the failures a second attempt can fix.
  `busy_try_again` is always retried (the backend never took the lock, so
  it wrote nothing); the unknown-outcome failures are retried **only for
  the read-only actions in `IDEMPOTENT_ACTIONS`**. Keep that list
  read-only — `post_notification` sends real email, and a retry there
  would send it twice.

**Run `node tests/gate-smoke.js` after touching `gate.js`.** No
dependencies, no runner, exits non-zero on failure. It loads the real
file in a stubbed browser as a returning signed-in visitor and checks
that a request actually reaches `fetch`. `node --check` would not have
caught the outage below — that file was valid syntax throughout. Only
running it did.

**The transport block has to stay above `var existing = readSession()`
in `gate.js`.** It shipped below it on 18 Sept 2026 and took the whole
Hub's backend down for every signed-in visitor: a returning visitor
takes the early return a few lines after that call, so every `var`
declared further down the file is hoisted but never assigned.
`MAX_INFLIGHT`, `queued` and `IDEMPOTENT_ACTIONS` were all `undefined`
by the time `wireAutoTracking()` fired the first request, and every API
call on every page died with *Cannot read properties of undefined
(reading 'push')*. The admin dashboard then reported that as the backend
refusing to answer, which is what made it look like a server problem.
Function declarations hoist and were fine; only the values were not.
There is a comment to this effect above the block — keep new transport
state there, not beside whatever uses it.

`state-error` now separates a page crash from a backend failure: a
backend error is a `lower_snake_case` code, anything else is this page
throwing, and it says so rather than blaming Apps Script.

### `http_404` means the deployment is gone, not that the backend is busy

Reported again 22 September 2026, this time as a hard failure rather than
slowness. `http_404` had no entry in the message map, so it fell through
to *“The backend refused the request. Trying again may help.”* — which is
wrong twice over: nothing refused anything, and retrying is the one thing
that cannot work.

**Tell these two apart.** `unknown_action` is a live script answering in
JSON: the deployed *version* is old. An `http_*` code is the deployment
answering *before any of our code ran*, so the version is not the
question. A 404 on the `/exec` URL means `API_URL` in `gate.js` no longer
names a live deployment at all.

The usual cause is a redeploy made as **Deploy → New deployment**, which
mints a fresh `/exec` URL, instead of **Manage deployments → ✏️ → Version:
New version**, which keeps it. That is why the redeploy note at the top of
this file says the URL stays the same — it is an instruction, not an
observation. Fix it by restoring that deployment or by pasting the new URL
into `gate.js` (which is a `gate.js` change, so it triggers the `?v=N`
cascade across every page).

**A 404 is a whole-Hub outage, and everywhere except this dashboard it is
silent.** Every other caller — `record_pageview`, `get_completions`, the
teacher dashboard, the AI Literacy status strip — handles a failure with a
bare `console.warn`. While the URL is dead, staff can finish a module and
have the completion dropped with nothing on screen to say so. The admin
dashboard is the only page that admits anything is wrong, which is why
this looked like an admin-only problem for as long as it did.

The dashboard's two free-text sections (`#responses`, `#goals`) no longer
fetch at all: since 23 September 2026 they take their part of the page's
one `admin_dashboard` answer through `window.aisaAdminData.on(fn)`, first
load and every Refresh (see *Data loading* below). `window.aisaAdminGate`
now resolves `'bundle'`, `'legacy'` or `false`, and the sections fetch
for themselves only on `'legacy'` — a backend that hasn't been redeployed.
**This is not the lazy-loading that the three-tabs note forbids** — the
data still arrives on page load, whichever tab is open.

## Data loading — audited 23 September 2026

Reported as: the admin dashboard "sometimes loads quickly and other times
loads extremely slowly or not at all". The Apps Script was up to date.
**The cause was the whole Hub, not the dashboard.**

- **Every request re-read the entire `sessions` tab** just to learn who was
  asking (`verifySessionToken`). That tab grows by a row per sign-in per
  device and is never pruned, so everything got slower as the year went on.
- **Every page view cost 3–4 executions per member of staff**:
  `record_pageview`, `whoami` (the menu's admin check, asked on every page
  even when already known), `get_notifications` (notifications + the
  whole `notification_reads` tab + roster) and, on module and hub pages,
  `get_completions` (the whole `events` tab). pd.html and menu.js each
  asked `whoami`, so twice.
- **All of them run as the script owner**, so they share one execution
  quota and one spreadsheet with the admin dashboard, and Apps Script
  queues them where the browser can't see. The dashboard's own five or six
  full-sheet reads waited behind everybody else's — quick when school was
  quiet, slow or timing out when it was busy (a PD session in the gym is
  the worst case). That is the variability.

### The backend: a read cache that only ever holds copies

`auth/apps-script/04_cache.gs` is the read cache. `CacheService.getScriptCache()`
is shared by every execution and answers in milliseconds. The rules, which
`tests/apps-script-sim.js` enforces:

1. **Copies only.** Nothing goes in that isn't already in a sheet; every
   read falls back to the sheet on a miss or any cache error; every entry
   expires (6 h at most). Losing the cache costs speed, never data. **No
   write path changed what it writes or where.**
2. **Every new sheet read goes through `_cachedRead(key, ttl, compute)`**,
   keyed by `_dataKey(name, [domains])`.
3. **Every write bumps its domain with `_bump(domain)` — after the sheet
   write, never before.** Readers key their entries by generation, so the
   Hub's own writes show on the very next read, and a reader that raced
   the write can only file its result under the old generation.
4. **Row hints are hints.** Remembered row numbers (session, dwell,
   module-response and survey rows) are always read back and checked —
   right token, right email and module — before anything is written there.
   Rows move: `sign_out` deletes one, and people sort sheets by hand.
5. **Hand edits** are invisible to generations. They show when the TTL
   runs out, on the dashboard's **Refresh** (`fresh: '1'`, honoured only on
   admin reads, after the admin check), or after `flushHubCache()`.

| Cached | Invalidated by | TTL |
|---|---|---|
| a session, per token | `sign_out`; `flushHubCache()` | 1 h |
| `admins` tab | hand edits only → TTL | 10 min |
| `roster` tab | hand edits only → TTL | 15 min |
| who has signed in + last seen | new session / sign-out | 10 min |
| completions index (`events`) | `record_event` | 1 h |
| dwell rows | TTL only (written every 30 s) | 10 min |
| `module_responses` | `save_module_response` | 1 h |
| `survey_responses` | `save_survey_response` | 1 h |
| notifications | post / delete / system notifications | 1 h |
| one person's read receipts | that person marking read | 30 min |

`last_seen` on the tracker can therefore lag by up to ~15 minutes (it
already lagged 5, and the tracker shows a date). `generated_at` on the
overview is the *as-of* time of the oldest part that can drift, so the
dashboard's "Updated 10:32" is honest.

**Personal data:** module and survey responses sit in the script's own
cache for at most an hour — private to this script, inside the same Google
account as the spreadsheet — and only admin requests read them. They are
**never** put in browser storage.

`admin_dashboard` returns `overview`, `dwell`, `module_responses` and
`survey` in one execution (`parts=` narrows it; charts ask for two). Each
part fails on its own as `{ ok:false, error }`. The survey's `outstanding`
is the whole roster minus submitters **with each person's tags**, so the
cohort dropdown filters in the page — it used to cost a second request on
every load just to switch to `secondary`.

A thrown exception is now `{ error: 'server_error', message }`. It used to
be the exception text itself, which the dashboard (rightly) reads as its
own crash because it isn't `lower_snake_case`.

Measured in the simulator: the same scenario does 62 sheet reads instead
of 184, and a warm dashboard load reads **no sheet at all**.

### The browser: `gate.js`

- **Two lanes.** `record_pageview`, `record_click`, `record_dwell` and
  `whoami` are background and get one of the two slots at most, so
  whatever the page is waiting on never queues behind analytics.
- **Shared reads.** Identical read-only calls in flight share one request.
  Re-auth retries call `sendApiCall`, not `apiCall` — going back through
  `apiCall` would find the call in `inflightReads` and wait on itself.
- **Fewer questions.** The admin flag is re-checked every 30 minutes, not
  every page view; the bell's list is reused for 90 seconds per tab and
  cleared by anything that changes it.
- **The dashboard's saved copy.** `aisa_admin_snapshot_v1` holds the last
  good overview + dwell (never free text), for 7 days, cleared on sign-out.
  The dashboard and charts draw it instantly, say it is a saved copy, then
  replace it with the live read. If the live read fails, the data stays
  and an amber line says why and offers *Try again* — the error page is
  only for when there is nothing to show.

**Two latent bugs of the 18 September kind were in `gate.js` all along:**
`COMPLETIONS_CACHE_KEY` and `pendingReAuthResolvers` were declared below
`var existing = readSession()`. For every returning visitor the completions
cache has lived at `localStorage["undefined"]` (now `aisa_completions_v2`;
the stray key is removed on load), and a session the server revoked threw
*Cannot read properties of undefined (reading 'push')* instead of showing
the sign-in screen. Both declarations now sit with the transport state.
**All state in `gate.js` goes above that line.**

### Tests

```
node tests/apps-script-sim.js                                # after touching auth/apps-script/
node tests/apps-script-sim.js --baseline <old> --strict      # a change meant to alter nothing
node tests/apps-script-sim.js --baseline <old>               # lenient: a backend from before the cache
node tests/gate-smoke.js                                     # after touching gate.js
node tests/deploy-sim.js                                     # after touching auth/apps-script/deploy.mjs
```

The simulator runs the real backend files against a fake spreadsheet,
cache and MailApp, each request in a fresh copy of the script (Apps Script
keeps no globals between requests; a test that did would hide the bugs
worth finding). Four scenarios — main, edge cases (every validation error,
every refusal, every way mail fails), an empty spreadsheet, and the editor
tools — run with the cache working and with it throwing on every call, and
must give identical responses and an identical final spreadsheet. It also
checks the file rules above, the permissions, and the dwell migration.

`<old>` is a file or a folder. For the folder at the last commit:
`mkdir /tmp/old && git archive HEAD auth/apps-script | tar -x -C /tmp/old`,
then `--baseline /tmp/old/auth/apps-script`. For the backend before the
split, `git show 2419114:auth/apps-script.gs > /tmp/old.gs`. `--strict`
forgives nothing (responses byte for byte, cells, emails, cache contents,
sheet reads and writes); it caught each of four planted one-character
changes. Without a baseline, both test files still break loudly when a
planted bug — a missing `_bump`, an unchecked row hint — is put in.

## First-login popups — removed 17 September 2026

`auth/onboarding.js` is gone. It was two full-screen overlays shown on
every page load until you cleared them: a four-slide "welcome tour"
about the Hub, and a **blocking** gate demanding the AI & Innovation
Survey be self-attested before the rest of the site would open. Both
were annoying and the survey gate in particular held the whole Hub
hostage to a Google Form. Removed at Brandon's request.

What went with it: the file itself, its entry in the helper-script list
in `gate.js` (`loadOnboarding()` is now `loadAuxScripts()`), and the
*Onboarding* card pair on `dashboard.html` — with nothing left to write
those events, they could only ever have read "Outstanding" in amber
with no way to clear them.

**Deliberately left in place:** the `survey` and `tutorial` columns in
`EXTRA` on `admin-dashboard.html`. Those are the historical record of
who attested before the removal, and nothing new will ever land in
them. They are outside `MODULES`, so they never counted toward the
headline numbers and dropping them later changes nothing but the
tracker's column count.

The `aisa_onboarding_v1` localStorage key is orphaned on staff devices.
Harmless — nothing reads it.

Note the cache-busting convention: `gate.js` is included as
`auth/gate.js?v=N` by **51 pages**, so **changing `gate.js` means bumping
`N` on every one of them** or returning visitors keep running the
cached copy. That change took it to `?v=19`; the September 18
newsletter took it to `?v=20`, the newsletter mail-out to `?v=21`, and
the request-transport rework to `?v=22`, the fix for the outage it
caused to `?v=23`, the AI Literacy Hub to `?v=24`, and the data-loading
audit (23 September 2026) to `?v=25`, and the Sustainability release
(7 October 2026) to `?v=26`, the PD Day page (19 October 2026) to
`?v=27`, its per-session search entries (the same day) to `?v=28`,
the Data to Action session's entry to `?v=29`, and the station-guide
download with MagicSchool and Chalkie leaving Tools & Resources
(20 October 2026) to `?v=30`, and the Flint Master Guide (29 October
2026) to `?v=31`, which also made it 50 pages. Issue No. 6 of the
Digital Lion made it 51, and its bilingual email (29 October 2026) took
it to `?v=32`.

The same trap sits one level down. `gate.js` pulls its helpers with
their own pins — `certificate.js?v=7`, `search-index.js?v=16`,
`menu.js?v=20`, `dwell.js?v=2` — so **editing one of those helpers
means bumping its pin inside `gate.js`, which is itself a change to
`gate.js`, which means bumping `?v=N` on all 51 pages again.** Adding a
page to the menu or the search index is enough to trigger the whole
cascade. Skip it and returning staff keep the cached helper and never
see the new entry.

The count is easy to get wrong by hand. From the repo root:

```
grep -rl 'gate\.js?v=' --include='*.html' . | wc -l
grep -rn 'gate\.js?v=' --include='*.html' . | grep -o 'v=[0-9]*' | sort -u
```

The second command should print exactly one version. Two means a page
was missed.

## Logo — sharpened 26 September 2026

`AISA_logo.png` was a 224 px navy seal on an opaque white square: soft on
high-DPI screens, and a white box in every dark footer. It is now a 256 px
navy seal on transparent, generated from the originals Brandon supplied,
which live in `assets/brand/` with a README saying which file goes where.
Same filename, so the top bar, drawer, certificates, forms and PD cards
picked it up with no markup change and **no `?v=` cascade**.

The 20 dark footers (`h-8 w-8 opacity-90`) now point at
`assets/brand/aisa-seal-white.png`. **A white logo must never have
`AISA_logo` in its filename** — `certificate.js` takes the first
`img[src*="AISA_logo"]` on the page, and white on the cream certificate is
invisible.

## Reading timestamps out of the sheets

**Never compare a timestamp cell as a string.** Put it through `_tsMs()`
and compare numbers; return it through `_isoOut()`. Two separate things
make raw cells untrustworthy:

1. Google Sheets decides for itself whether an ISO string we wrote is
   text or a date. Date-formatted cells come back as **Date objects**,
   and `String(date)` is `"Mon Mar 02 2026 ..."` — so `a > b` between two
   of them sorts by the English **weekday name** (Fri, Mon, Sat, Sun,
   Thu, Tue, Wed). "Latest wins" then picks essentially at random.
2. Rows written before the Abu Dhabi timezone change end in `Z`, newer
   ones in `+04:00`. Those do not sort lexicographically either:
   `2026-06-18T02:00:00+04:00` sorts after `2026-06-17T23:00:00Z` but is
   an hour earlier.

This bit `getCompletionsFor()` and `adminOverview()` (both the
"latest completion per person x module" pick and `last_seen`), so the
tracker could show a stale completion date and a wrong last-seen. Fixed
16 Sept 2026. `migrateDwellToPerModule()` had the same bug and kept it
until 13 Oct 2026; the simulator now feeds it a `Z` row, a `+04:00` row
and a date-typed cell. `_isDate()` uses `Object.prototype.toString`, not
`instanceof` — `instanceof Date` is false for a Date from another realm.

The same class of bug hits the client: sort by `Date.parse(...)`, never
`localeCompare` on a timestamp.

`getCompletionsFor()` also matched emails with a case-sensitive `!==`
while `adminOverview()` lowercased them, so a teacher's own dashboard
and the admin tracker could disagree about the same completion. Both
lowercase now.

## Diagnosing "the dashboard doesn't match the spreadsheet"

Run **`auditHubData()`** from the Apps Script editor (open
`90_editor_tools`, then Run → auditHubData). Reads only, changes nothing,
prints a report. It covers the three things that cause a silent mismatch:

1. **Header drift.** Every reader in the backend addresses columns
   **by position**, using the `*_HEADERS` constants as the map. Insert,
   delete or reorder a column by hand in the spreadsheet and every read
   after it silently returns the wrong field — no error, just wrong
   numbers. The audit compares each sheet's real header row against its
   constant and names the offending columns.
2. **Timestamp cell types** — how many cells per sheet are text vs
   date-typed, and how many end `Z` vs `+04:00`.
3. **Recomputed totals** — staff tracked, and completions per
   `module_id` straight from the events sheet, to read side by side with
   the tracker. Also flags duplicate roster emails.

A `module_id` in that list which the dashboard's `MODULES` array does
not name is **invisible** on the tracker; anything `MODULES` names that
is missing from the list reads 0% forever. `sustainability` used to be
knowingly in the first category; it was released on 7 October 2026 and
is now in all three `MODULES` arrays.

Remember that **adding a module to `MODULES` moves the headline
numbers**: "fully complete" needs every listed module, "required done"
needs every `required: true` one, and the avg-modules denominator and PD
hours both change. Releasing AI Literacy as required on 16 Sept 2026 did
exactly that, which looks like a regression and is not one.

## Admin dashboard — three tabs

`admin-dashboard.html` splits into **PD Data**, **Survey Data** and
**Admin Actions**.

- **PD Data** — the compliance tracker, per-module bars, engagement, and
  the AI Literacy readiness free-text. That last one is a PD module's own
  capture, so it sits with the training data rather than with the surveys.
- **Survey Data** — the standalone forms staff fill in. Right now just
  the personal goals.
- **Admin Actions** — every other admin destination: charts,
  notifications, the three performance-review forms, and the goal form as
  staff see it. This replaced a card grid that used to sit above the
  tabs and pushed the actual data below the fold.

**Export CSV lives in the PD tracker's filter bar, not on Admin
Actions.** It exports the tracker exactly as filtered, so it has to be
next to the filters — from another tab you could not see what you were
exporting.

Adding a section: drop the markup inside the right panel. Nothing else
needs wiring — the tab controller resolves a `#hash` to whichever panel
contains that id, so deep links like `admin-dashboard.html#goals` from
`menu.js` and `search-index.js` open the right tab on their own. Adding
an Admin Actions destination also wants an entry in `search-index.js`
with `adminOnly: true`.

**Don't nest anchors in the action cards.** The Performance Review card
has three destinations, so it is a `<div>` with three sibling `<a>`s. It
used to be one `<a>` wrapping the card with two more `<a>`s inside;
nested anchors are invalid, the browser closed the outer one early, and
the card rendered split with its icon floating next to an empty box.

Both panels stay in the DOM and every section's data arrives on page load
whichever tab is open — all of it in one `admin_dashboard` request, which
the sections share through `window.aisaAdminData`. That is deliberate:
nothing is lazy, so nothing can be left half-initialised, and switching
tabs costs no requests. It also means **no section may measure layout** (offsetWidth,
getBoundingClientRect) during setup — a closed panel has no dimensions.
Nothing on the page does this today.

The Survey Data tab carries an amber badge with the number of people
who still owe a goal. The goals section fires an `aisa:goal-counts`
CustomEvent on every render and the tab controller listens for it.

## Anti-Bullying Policy: Teacher Awareness — PREVIEW, built 7 October 2026

`PD Modules/anti-bullying-module.html`, module id `anti-bullying`. Built
from two documents **Joel Hunter** supplied: the AISA Anti-Bullying
Policy (revised May 2026) and a one-page training outline. Joel asked for
it, and the module thanks him in section 1, in the footer, and in the
launch email. Keep those credits.

**It is not released. Only three people can see it:** `bbaki@`,
`jhunter@` and `aturabi@aisa.sch.ae`. That allowlist lives in **two
places, and they must match**:

- `PREVIEW_EMAILS` in the page's script. Anyone else gets a "Coming soon"
  overlay, and the chapters are hidden too, not just covered: `dwell.js`
  counts time on whichever chapter is visible, overlay or not.
- `data-preview-for` on the card in `pd.html`. This is a new per-person
  version of `data-admin-only`, handled in `runSync()`. The card stays
  `display:none` and out of the pill counts for everyone else.

Both checks run in the browser only, and the repo is public. They hide
the module; they do not protect it.

On purpose, it is **in no `MODULES` array, `menu.js` or
`search-index.js`** yet. Adding it to `MODULES` now would show every
member of staff as behind on required training they cannot open.
Leaving it out of menu and search also means **no `?v=` cascade** for
this commit.

**Structure:** nine topic sections, one per outline row. Each has a
scenario, the key points, a "📘 In the policy" line naming the policy
heading, and a one-question quick check. Then a scored ten-question
**Final check (8/10 to pass)**, then the "What I do next" job aid (it
prints on its own) and the policy acknowledgement. Certificate: 1.25 h,
the outline's 75 minutes.

**The 80% pass mark is built in the page, not in `training.js`.** A
`.aisa-quiz` accepts retries until you get it right, so it cannot carry a
pass mark. The final check is ordinary radio buttons, scored by the page.
On a pass, the page clicks a hidden one-option `.aisa-quiz`
(`#quiz-final-gate`). That opens Next, and `training.js` saves the pass,
so a reload does not demand a re-sit. In `QUESTIONS`, **option 0 is
always the right answer**; the page shuffles them on screen.

**The policy PDF is not in the repo, and must not be.** Every page of it
is marked *Confidential*. The module paraphrases it. `POLICY_URL` at the
top of the page script is empty. Set it to a Drive copy shared with
`@aisa.sch.ae` only, with any `ouid=` stripped, and every "In the policy"
line becomes a link.

**Cross-file facts.** The cyberbullying section points to
`safeguarding-module.html` rather than copying the Safeguarding Leads'
names, so there is no third copy to drift. The 24-hour escalation
(ADEK CPU + MoI-CPC, Wadeema's Law) is quoted from the policy.

**The launch email** is the same mail bar as Sustainability's. It shows
for `NEWSLETTER_SENDERS` only, so Joel and aturabi@ never see it. **"Email
all staff" is locked while `PREVIEW_ONLY` is true**, because a launch
email would send the whole school to "Coming soon". "Send me a test"
works now. The copy is `COPY` in the page's last script.

### Releasing it

1. In the page, set `PREVIEW_ONLY = false`, and move `SENT_LOCK_AFTER`
   to about three weeks after release. It is a placeholder,
   30 November 2026.
2. In `pd.html`, remove `data-preview-for` and `style="display:none;"`
   from the card, and drop its amber *Preview* pill.
3. Add it to `MODULES` in `admin-dashboard.html`, `dashboard.html` and
   `admin-charts.html`: `required: true`, `hours: 1.25`. No `cohort`
   means it applies to all staff. This **moves the headline numbers**,
   as Sustainability did.
4. Add it to `menu.js` and `search-index.js`. That bumps their pins in
   `gate.js`, which means bumping `gate.js?v=N` on every page (the
   cascade).
5. Send yourself a test, then email all staff.

### Open questions, not yet answered

- **Audience.** The outline says *Teacher* Awareness, and the email
  currently says "required for every member of staff". The Hub cannot
  tell teachers from other staff without a cohort list. If it should be
  teachers only, it needs one (see AI Literacy's `cohort`), and the email
  copy must change too.
- **Joel's job title.** The credits name him but give no role.
- **The Anonymous Online Reporting Form** is named but not linked. No URL
  was supplied.
- **"Repeated annually."** A Hub completion is permanent. To re-run it
  next year, the module needs a new id (e.g. `anti-bullying-2027`) and a
  new `MODULES` entry. Otherwise last year's completion counts for ever.

## PD Day material — October 2026, added 19 October 2026

`PD Day/october-2026.html` holds the material from the PD days of 19–20
October 2026. Brandon asked for "a section of the hub" for it. Four
sessions so far, in page order:

| id | session | presenter | material |
|---|---|---|---|
| `ai-adventure` | Choose your own AI adventure | Brandon Baki | slides (.pptx + PDF), the PD Arcade, 7 station guides (online, and a .zip of PDFs) |
| `oracy` | Getting the Room to Think (Aloud!) | Amira El Turabi | slides (PDF only), Mon 19 Oct |
| `differentiation` | Small Changes, Big Reach: Proactive Differentiation | Amira El Turabi | slides (PDF only), Mon 19 + Tue 20 Oct |
| `data-to-action` | Data to Action (data literacy) | Quitney Price | slides (PDF only), tracker to copy, Mon 19 Oct |

**More sessions are coming.** Brandon said on 19 October 2026 that
several PDs will be placed here, so the page is built for many sessions:
one page per PD day, a **Sessions** index of cards under the hero, then
one `<section class="session">` per session, each ending with *↑ All
sessions*. A grey rule separates consecutive sessions.

**Adding a session:**

1. **Deck, if any.** Read it first, speaker notes too: once committed
   it is public (see *The deck is public now* below). Then run
   `python3 "PD Day/render-deck.py" deck.pptx "PD Day/assets/october-2026/<id>" --name <id>-slides`
   (a `.pdf` works too, e.g. a Google Slides export). It writes
   `slides/`, `thumbs/` and the downloads, and prints a `DECKS` entry
   whose captions and alt text come from the slides' own words. Read
   them, fix the order, and add the Arabic session name. It stops if
   the deck uses a font that isn't installed (see DM Sans below);
   `SOFFICE` names the LibreOffice command if `soffice` alone hangs, as
   it does in Claude's sandbox.
2. **`DECKS` in the page script** gets that entry, keyed by `<id>`.
3. **A section** after the last one, copied from the existing session:
   `id="<id>"`, the header, whatever links it needs, and
   `<div class="mt-4" data-sv="<id>"></div>` where the viewer goes. The
   script builds a viewer into every `[data-sv]`; each one runs on its
   own, so keys only move the one that has focus. An unknown key warns
   in the console and leaves the placeholder empty.
4. **A card** in `#sessions`, in the same order, with `href="#<id>"`.
5. **Analytics:** name every `data-track` in the section
   `pd-day:<id>:<thing>`, and the card `pd-day:index:<id>`.
6. **Search:** every session has a `search-index.js` entry, type
   `"PD Session"`, `url: "PD%20Day/october-2026.html#<id>"`, so staff
   can search "oracy" and land on it. A new one is a change to
   `search-index.js`, so it means the full `?v=` cascade; batch
   several sessions into one cascade when you can. The page's own
   entry and the `menu.js` palette line are generic now, so they only
   need the new title added to the page entry's description.

The page's tests are not in the repo (they need Chromium and a local
Tailwind build). What they checked is worth repeating after a change:
every card points at a session and every session has a card, two
viewers on one page don't interfere, no sideways scroll at 390 px, and
the Arabic view shows no English spans.

**It is linked from three places, and they move together:**

- The **home page**, as a gold banner beside the survey banner. The two
  share one row on `sm+` so the fit-to-screen grid keeps its height (the
  checks at 1024×880, 1280×900 and 1536×960 all still fit). Repoint it at
  the next PD day, or remove it once this stops being news. With it gone,
  the survey banner needs nothing back: the row's `sm:mr-20` is what
  reserves Leo's corner now.
- `menu.js`: the drawer (*PD Day · Oct 2026*) and the fallback palette.
- `search-index.js`: the page, one entry per session, and the arcade
  itself as an external entry.

Those last two set off the cascade to `gate.js?v=27`. Amira's
sessions (with the per-session search entries) took it to `?v=28`, and
Quitney's search entry to `?v=29`.

**The station guides as PDFs, added 20 October 2026.**
`assets/october-2026/ai-adventure/AISA-AI-PD-Station-Guides.zip` holds
every station guide on paper, in an `English` and an `Arabic` folder
(14 PDFs, 31 MB): the arcade repo's printouts, made there with
`node print/build.js zip`. When a guide changes, rebuild it there and
replace this file; nothing here needs editing unless the size changes,
which both links mention. It is offered in two places: the button under
*The seven stations* in the session, and a card in Tools & Resources
(*AI Teaching Assistants*, format *Guide*) with a search entry pointing
there. The same day Brandon took **MagicSchool** (not renewed after
20 October) and **Chalkie** off Tools & Resources and out of the search
index. The Chalkie PD module stays (pd.html, the menu, the dashboards),
"in case anyone decides to buy it for themselves". Those search changes
took the cascade to `?v=30`.

**The slides** are a viewer on the page (arrows, arrow keys, swipe,
thumbnails, *Present* for full screen), plus the original `.pptx` and a
PDF to download. The viewer is pinned `dir="ltr"`, because the slides are
English and run left to right in either language. The images are
rendered from the `.pptx`, so **edit the deck, then re-run
`render-deck.py`** into the same folder (it clears the old slides first,
so a shorter deck leaves none behind) and update that deck's entry in
`DECKS`. Two renders of the same deck differ by a pixel here and there,
so don't re-render just to "refresh".

**Install the decks' fonts first.** `render-deck.py` stops on a
missing one. So far:

- **DM Sans** (Brandon's deck): static Regular, Bold and Italic from
  Google Fonts. The variable font only gave LibreOffice the regular
  weight. Without it LibreOffice substitutes a wider font, and slide 3's
  title runs into its paragraph.
- **Material Icons** (Amira's decks): `font/MaterialIcons-Regular.ttf`
  from the `google/material-design-icons` repo. It is an icon font
  driven by ligatures, so without it every icon renders as its name:
  "psychology", "record_voice_over". Those names also leak into the
  script's draft alt text, so take them out by hand.
- **Montserrat** (Quitney's deck): static Regular, Bold and Italic from
  Google Fonts, the same way as DM Sans.

A 16:9 deck gets `is-169` on its viewer and fills the frame with
`object-fit: cover`; with `contain`, a white slide showed a sub-pixel
seam of the dark frame along its edge. Other shapes keep `contain` and
letterbox.

**Hidden slides are left out**, as LibreOffice does by default, which
matches what was presented. `render-deck.py` names them. Amira hid one
in each deck: oracy's "What does good oracy sound/look like?" (deck
slide 5) and differentiation's "Plan something you will actually teach"
(deck slide 10).

Two things in the deck are as Brandon supplied it and were left alone:
slide 5 is titled *Six stations* but lists seven, and the seventh card
runs off the bottom edge of the slide.

**The arcade is a separate repo, `AISA-AI-web/arcade`** (GitHub Pages at
`aisa-ai-web.github.io/arcade`): the *pD-Day 2026* game with Leo, and
`stations.html`, the plain list of guides. Both read `?lang=en|ar`, so
every arcade link on the page carries `data-lang-href` and the page
appends the Hub's current language, again on `aisa:lang-change`. Station
6 is the Data Anonymizer (another repo) and station 7 is this Hub's own
`ai-and-assessment.html`.

**The station list is a copy** of `stations.html` in that repo, English
and Arabic both. If a station is renamed, added or moved there, change it
here too.

**The exit ticket and the meeting log** are the Google Forms the QR codes
on slides 12 and 13 open (decoded from the deck). Neither URL carries an
`ouid`. If either is replaced, strip it again: this repo is public.

**The MagicSchool notice** (from slide 3) carries `data-show-until` and
hides itself once 20 October has passed. Nothing else on the page is
dated.

**The deck is public now**, speaker notes included, like everything in
this repo: the survey figures, the MagicSchool decision, Brandon's
address. None of it is personal data. Check that again before putting any
later session's deck here.

**Amira El Turabi's two workshops, added 19 October 2026.** Credited
on the cards and in each section as *Amira El Turabi · Curriculum,
Teaching & Learning*. The department comes from her decks' footer; no job
title was given. Things that are deliberate:

- **PDF only, no .pptx** (`render-deck.py --no-pptx`). The originals are
  12 MB and 20 MB, almost all animated GIFs. The oracy deck's speaker
  notes are facilitator notes, and the first one cites an inspection
  finding about oracy, which should not be published from a public repo.
  If an editable copy is wanted, link a Drive copy shared with
  `@aisa.sch.ae` only, as `POLICY_URL` does for anti-bullying.
- **The "Take it to your planning" boxes quote her slides word for
  word**: oracy's five questions, and differentiation's four prompts plus
  the line from its six-habits slide. If she revises a deck, re-check
  them.
- **Both use the same Professional Meeting Log form** as Brandon's
  session (her QR codes open `tinyurl.com/ycycht85`, which leads to the
  same form). The meeting names carry the day, so the card prints them
  exactly as on her slides. Differentiation ran on both days, so it
  lists two names.
- **Ahmed, Zayed and Sultan** on differentiation slide 7 are cartoon
  personas, not pupils. The classroom pictures on oracy slide 6 are
  illustrations. Both were checked before committing.
- **Differentiation's exit ticket** was a FlexiQuiz live quiz that only
  worked during the session, so the page doesn't link it.

**Quitney Price's *Data to Action*, added 19 October 2026.** The
meeting log calls it **Data Literacy (Monday Oct. 19)**, which is what
Brandon called it too, so the session is titled as the deck is and
labelled "Data literacy", and the meeting name is printed as on her
slide. No job title was given, so she is credited by name only.

- **The tracker is the main thing on it.** It is her Google Sheet, linked
  as `…/spreadsheets/d/<id>/copy`, which makes every teacher their own
  copy (Brandon asked for exactly that link). `/copy` needs the sheet to
  be viewable by whoever clicks, and it is shared "anyone with the
  link". So it works for staff, and because the link is in this public
  repo, for anyone. If she narrows the sharing to `@aisa.sch.ae`, staff
  can still copy it.
- **Its sample rows use made-up names** (*Friends* characters in the
  Class Tracker tab), checked before linking. The page tells teachers to
  clear them, and quotes her slide 8 guardrails: use student names only
  when needed and keep student information secure.
- **The slides went in a day later, on 20 October 2026,** from a .pptx
  Brandon attached: 20 slides, PDF only (`--no-pptx`). In Drive her deck
  (`AISA_Data_to_Action_PD`) is shared with Brandon and Amira alone, so
  the editable file stays out of the repo. The speaker notes are
  ordinary facilitator notes, and the PDF carries none of them. Until
  then the section had a "slides to follow" box, because this container
  can't fetch Google's slide images and the connector's export is base64
  too large to pass through. **For a private Google Slides deck, ask
  for a file** rather than trying the connector.
- **Two things in the deck are as she made it.** Slide 3's title sits
  hard against the top-left corner, and four slides carry Pear Deck's
  "Students, write your response!" bar. The PDF keeps her two links:
  slide 14 to the Common Core standard, and slide 16's title to the
  tracker's `/copy` link. Slide 7's class grid uses the same made-up
  *Friends* first names as the tracker.

**Arabic.** The station names and descriptions are the arcade's own
Arabic. The rest of the page's Arabic was written fresh for it and has
not been checked by an Arabic speaker yet. That includes Amira's name
(أميرة الترابي), Quitney's (كويتني برايس), and the Arabic titles of
their sessions.

## Sustainability at AISA — RELEASED to all staff, 7 October 2026

`PD Modules/sustainability-module.html` is live and **required of every
member of staff** (no `cohort`, so it applies to everybody). It was built
on 3 September 2026 behind an admin-only gate from the Sustainability
Team's outline; the gate, the "Admin preview" ribbon, the pd.html
`data-admin-only` flag and the `adminOnly` search entry are all gone.

It was **requested and resourced by Ms Nastassia van Jaarsveldt**, Chair
of the Sustainability Committee, and the module credits her twice — a
"With thanks" card in section 1 and the footer. Keep that credit.

Making it required **moved the headline numbers** on release day: every
member of staff dropped out of "required done" and "fully complete" until
they finish it, and the PD-hours denominator rose by 0.5 (`hours: 0.5`,
matching the certificate's `data-cert-hours`). That is expected, not a
regression. It is in `MODULES` in `admin-dashboard.html`, `dashboard.html`
and `admin-charts.html`, carries `data-required="true"` on pd.html, and
is listed in `menu.js` and `search-index.js` (pins `?v=17` / `?v=11`).

**The launch email** is a mail bar at the bottom of the module page,
the same component as the AI Literacy Hub's: hidden for everyone but
`NEWSLETTER_SENDERS`, rides `send_newsletter` (no backend change), links
to the module's own URL, and thanks Ms van Jaarsveldt by name. The copy
is `COPY` in the page's last script. It locks itself after
`SENT_LOCK_AFTER` (31 October 2026) so a stray click later cannot
re-announce a launch; to send a reminder, rewrite `COPY` first.

## AI & Assessment Design — Arabic added 18 October 2026

`PD Modules/ai-and-assessment.html` is now fully bilingual, done at
Brandon's request. It uses the same engine as the other Arabic modules
(`onboarding-i18n.js`), with every string in
**`ai-and-assessment-ar.js`**, which is the only file to edit for
wording. Like the readiness module's dictionary, it has two halves:
`AR_DICT` for whole text nodes, and `AR_BLOCKS` for sentences broken up
by `<strong>`/`<em>`/`<a>`. **Edit an English string and its key must
change too**, or that string silently stays English in Arabic (block
misses warn in the console by name). Bump `ai-and-assessment-ar.js?v=N`
in the page after any edit.

**The only language switch is the Hub menu bar's**, at Brandon's request
(18 October 2026): there is no button on the page itself. The engine
normally adds a floating one to any page without its own, so the page's
`<body>` carries `data-lang-toggle="menu"`, an opt-out added to
`onboarding-i18n.js` for this. The engine still follows the menu bar's
`aisa:lang-change` event and the shared `aisa-newsletter-lang` key, so
the menu button translates the page and a saved choice applies on load.

Things that are deliberate:

- **The APA and MLA example citations stay English** (`data-no-translate`).
  A translated citation would no longer be a correct APA or MLA
  reference. Product and researcher names stay in Latin script.
- **The page's own script still writes English** (quiz feedback, planner
  status, Next/Finish, the progress and module counters). The engine's
  observer translates it as it lands, so those strings are keys in
  `AR_DICT`. `Module n of m` and `n% Done` are patterns added to
  `onboarding-i18n.js`. They are inert on pages without that text, which
  is why only this page's engine pin moved (now `?v=5`, with the
  toggle opt-out above).
- **Textarea placeholders and the tab title are swapped by the page**,
  not the engine. The engine skips everything on a `<textarea>` and only
  walks `<body>`.
- **Planner `<option value>`s stay English**, so a draft saved in one
  language reloads in the other.
- Answer badges read أ/ب/ج. The shuffle finds them by `.quiz-letter`,
  not by their text.

The same commit fixed a phone-width bug that predated the Arabic: the
mobile grid was `1fr`, so the nowrap module-tab row made every module
about 1,080px wide and cut off its text. It is `minmax(0, 1fr)` now,
the same trap as the AI Growth Test guide's jump strip.

No change to `gate.js`, `menu.js` or `search-index.js`, so **no `?v=`
cascade**.

## AI Literacy Hub — added 20 September 2026

`AI Literacy Hub/ai-literacy-hub.html` is the front door for everything
AI Literacy. It is **linked from the home page card grid, in the cell
the paused Wired Wednesdays card used to hold** — that card is gone from
`index.html` and recoverable from git history if those sessions ever come
back. The Wired Wednesdays page and logo are untouched and still
delisted from the nav and search.

It is a **hub page, not a module**: no chapters, no quiz, no completion
event, no certificate, and it is in no `MODULES` array, so it moves no
compliance numbers. Everything on it links out.

What it carries, in order: a training-status strip, the three Start-here
cards (training / Scope & Sequence / assessment tracker), InstrucTwin,
the delivery model, the AI Growth Test, Level 1 AI Foundations,
responsible use and safeguarding, and who to ask.

**The assessment tracker is `TRACKER_URL`**, the one constant at the top
of the page's own script. Set, the third Start-here card is a live link,
loses its dashed border and flips its badge from *Link coming* to
*Open*, and an "opens in Google Sheets" note appears; emptied, it goes
back to saying the link is coming. Nothing else changes either way, and
that fallback is the honest state — never substitute a guessed URL.

It was wired on 20 September 2026 to the Google Sheet Brandon shared.
**The `ouid` parameter was stripped** — Google appends the owner's
account id to a share URL, and **this repo is public**, so anything in
that file is world-readable whatever the sign-in gate renders. Strip it
again if the link is ever replaced. For the same reason the page is not
what keeps the sheet private: anyone who views source has the link, so
the sheet's own Google sharing setting has to be restricted to
`@aisa.sch.ae` — that is the control that matters, and it lives in
Drive, not here.

**The status strip reads the teacher's own completion record** for
`ai-curriculum-readiness` through `getCompletionsCached()` then
`getCompletions()`, and settles on one of four states: complete (with
the date), nothing recorded, not available (backend unconfigured), or
could-not-check. A cached "complete" is never overwritten by a failed
refresh. There is also a 20-second fallback, because `aisaReady` polls
for a minute and then gives up *silently* — without it a visitor whose
session never materialises would watch "Checking…" for ever. Timestamps
go through `Date.parse`, never string comparison, for the reason in
*Reading timestamps out of the sheets*.

**Two facts on the page are copies and will drift if edited alone:**

- The **InstrucTwin caveat** (staff accounts not showing assigned
  grades, chasing it is the AI Lead's job) is the same statement as
  segment 4 of `ai-curriculum-readiness-module.html` and the training
  section of `Media Hub/sep18.html`. When grades become visible, all
  three change together. Note the wording now differs on purpose — see
  *The page names the role, not the person* below — so compare the
  substance, not the sentence.
- The **safeguarding contacts and the 24-hour timescale** come from
  `safeguarding-module.html` by way of the readiness module's segment 6.
  Three files now, not two.

**The InstrucTwin address is settled: `adek.instructwin.com`.** ADEK
confirmed on 21 September 2026 that this is where the curriculum is
released, so the page names it outright and the old hedge is gone. Until
then two were in circulation — the module used `schools.instructwin.com`
and ADEK's correspondence said `www.adek.instructwin.com` — and the page
offered both rather than presenting a guess as fact.

The **href keeps ADEK's own `www.` form** while the label drops it,
because that is what a teacher types. If `www.` ever turns out to matter,
the label is the thing to change, not the link.

`schools.instructwin.com` is gone from the module, from its Arabic
dictionary and from the hub, bar one line telling anyone who bookmarked
it to replace it — the 62 were pointed at it for several days.

**Changing that URL means changing four places, not one.** The module's
English, the matching **key** in `ai-curriculum-readiness-ar.js` (the key
*is* the English string — change one without the other and the console
warns and that paragraph silently stays English), the Arabic value, and
the hub. And **bump `ai-curriculum-readiness-ar.js?v=N` in the module**,
or returning staff keep the cached dictionary and the old address with
it. That pin went to `?v=2` here; it is per-page and separate from the
`gate.js` helper pins.

The AI Growth Test portal (`instructwin.com/aigt`) is a third, genuinely
separate sign-in and is listed as such — it did not change.

**The face-to-face session** is the first section on the page
(`#session`), added 21 September 2026 when the audience changed. It runs
**3:10–4:25 pm in the Secondary Gym**, and who has to attend is **all
secondary teaching staff, plus KG and Elementary homeroom teachers** —
wider than the original "anyone who received the email", and the block
says so in as many words, because staff who read the first email were
told something narrower. Teaching staff, note, not all secondary staff.

**The Secondary Gym and the Big Gym are the same room.** Issue No. 5 went
out naming the Big Gym and the reminder names the Secondary Gym, so both
pages now say "aka the Big Gym" once, rather than leaving
staff to work out whether there are two venues.

Date, time and venue are static text so they stay true in print and after
the day. Only the small pill beside the badge is computed, and it carries
`.no-print`, which `build-pdf.mjs` strips — otherwise every PDF would
freeze a "today" that stops being today.

`SESSION` and `COPY` at the top of the page's session script are the two
things to change when the session moves.

**The session's audience is deliberately wider than the module's, and
they are not the same list.** The readiness module is still required only
of the teachers on the ADEK Implementation Form — the 62 in
`AI_LITERACY_COHORT`. The face-to-face went school-wide across secondary
so the whole division could pick the curriculum up if timetabling or
staffing shifts later in the year; it is contingency, not a new teaching
assignment, and the page says as much so nobody reads attendance as
being added to the roster.

**So do not "fix" the mismatch by widening the cohort.** Changing
`AI_LITERACY_COHORT` moves the compliance tracker, the "required done"
and "fully complete" headline numbers, and the newsletter's
*Do you have to do the training?* card — it would start telling several
dozen secondary teachers they are behind on required training they were
never assigned. The hub's "Before you come" step is written to match:
finish the module if you are teaching AI Literacy, and if you are not it
is not required of you, though the session builds on it.

**The mail bar on this page sends the reminder** through the same
`send_newsletter` endpoint the newsletter uses, held to
`NEWSLETTER_SENDERS` server-side. Two things about it:

- **It mails everyone on the roster**, not just the people who have to
  attend — the Hub has no way to mail a subset. The subject and the
  first line therefore say who the session is for, and the confirm
  dialog says so too before anything goes out.
- **It locks itself once `SESSION.end` has passed** and says to update
  `SESSION` and `COPY` first. Without that, a click months later mails
  the whole school a reminder for a meeting that already happened —
  which is exactly the trap the newsletter note describes, made worse by
  the fact that this page is not obviously an "issue".

Everything the bar can fail with is named on screen with the fix: no
redeploy (`unknown_action`), no mail scope (`mail_not_authorized`, the
one that bites first), not a sender, no recipients, quota.

**The page names the role, not the person.** Every reference that was
*Brandon*, *me* or *I* reads **the AI Lead** (Arabic: *قائد الذكاء
الاصطناعي*), changed 21 September 2026 at Brandon's request so the page
survives a change of postholder. The contact card is the post — *The AI
Lead · Head of AI & Innovation, AISA* — with `bbaki@aisa.sch.ae` as the
route; **that mailbox is the one thing to change if the role changes
hands**, and nothing else on the page names anyone.

The two **Safeguarding Leads are still named** and must stay named: you
report a concern to a person, not to a job title.

`ai-curriculum-readiness-module.html` and `Media Hub/sep18.html` still
say *Brandon* and still speak in the first person — they were not part
of that request. That is a knowing divergence, not drift. If the same
treatment is wanted there, the module's segment 4 and the newsletter's
training section are where it lives.

**The PDFs.** `build-pdf.mjs` renders **three** documents, all into
`AI Literacy Hub/` beside the script:

| target | output | what it is |
|---|---|---|
| `hub` | `ai-literacy-hub-en.pdf`, `-ar.pdf` | the hub, both languages |
| `aigt` | `ai-growth-test-guide.pdf` | the AI Growth Test guide, every role |
| `module` | `ai-teacher-readiness-training.pdf` | the readiness training, all 8 segments |

```
NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs"
NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs" --only module --png
```

The last two were built for **ADEK evidence folders**, which is why they
are rendered *unfiltered and ungated*: a guide showing one role's steps,
or a module showing whichever segment you happen to be on, evidences
nothing. `aigt` drops the role filter so every step prints; `module`
loads with `?preview=1` and forces all eight chapters visible.

**Neither carries anybody's answers.** The build stubs `aisaAuth` so no
saved response is ever fetched, and `prepare()` additionally blanks every
textarea, text input and select before rendering. Keep both: the stub is
the guarantee, the blanking is the belt. An evidence PDF must show the
instrument, never a named teacher's writing — those rows are personal
data under UAE Federal Decree-Law No. 45 of 2021.

**Two print stylesheets fight back, and both had to be beaten:**

- The module's own `@media print` is built for the teacher's one-pager:
  `body > *:not(#onepager) { display: none !important }`. That hides the
  chapters' *ancestor*, so no rule on `[data-chapter]` can undo it — the
  override has to work at the same level, and must exclude `script`,
  `style` and `link` or forcing them to `block` prints their source.
- The guide's own print rules already hide its sidebar and buttons,
  which is wanted; only the role filter needed removing on top.

It **renders the real page** rather than carrying its own copy of the
words, which is the whole point: edit the page, re-run it, and the PDF
follows. Nothing in it needs editing when the content changes. It loads
`ai-literacy-hub.html` from disk, drops the other language's spans, the
status strip (personal and dynamic) and the jump strip, restyles what is
left for print, and appends an index of every link. `--png` also writes
a full-height layout proof, which is how you check it without a PDF
viewer — the container this was built in had none.

The print CSS hooks onto the **Tailwind class names in the markup**
(`[class*="rounded-2xl"]`) rather than on Tailwind itself, which is a
CDN script the build deliberately does not load. Those class names are
in the source file, so they hold whether or not the CDN answers. Rename
a utility on a card and the print styling of that card goes with it.

**`SITE_BASE` in that script is the only production host in the repo,
and it has to be.** Every link on the page is relative so the Hub works
wherever it is served from; a PDF in Google Drive has no origin, so its
links must be absolute. Same exception the newsletter note records for
an emailed issue. It defaults to the GitHub Pages URL and takes
`--base`. Re-run the build if the Hub ever moves.

Fonts come from Google Fonts on first run and are cached in
`.fontcache/` (gitignored) — that is what gives the Arabic PDF real
Cairo shaping instead of the boxes a system fallback produces. The
`--png` proofs are gitignored too; the PDFs are committed.

**Bilingual**, using the site-wide `.lang-en` / `.lang-ar` span pattern
and the global toggle in `menu.js` — there is no page-local toggle, only
the small inline script that applies the saved choice before `menu.js`
arrives, so Arabic readers get no flash of English. Every English string
has an Arabic sibling; if you add one, add both or the sentence vanishes
for half the staff. (Unlike the module, there is no `-ar.js` dictionary:
the translations are inline, because this page is links and short prose
rather than curriculum content.)

Two layout rules the page depends on, both scars from elsewhere in this
repo: `[hidden] { display: none !important; }` is declared because a
class beats the `hidden` attribute's UA `display:none` — the tracker
link is `inline-flex`, so without that rule it would show while still
marked hidden. And the status strip's "complete" tint is a declared
`.is-done` class rather than a Tailwind utility swapped in from script,
since a utility that appears nowhere in the served HTML is not something
to make the CDN's JIT responsible for.

Listed in `auth/menu.js` (drawer nav + fallback palette, which also
gained the Scope & Sequence) and `auth/search-index.js`. That is what
triggered the `?v=` cascade to `?v=24`.

## AI Literacy module — RELEASED to staff, 16 September 2026

`PD Modules/ai-curriculum-readiness-module.html` is live and visible to
every signed-in member of staff. The admin gate, the `data-admin-only`
card flag and the `adminOnly` search entry are all gone, and it is
listed in pd.html, dashboard.html, menu.js, admin-dashboard.html and
admin-charts.html.

Bear in mind the repo is public with Pages enabled, so the HTML is
readable by anyone with the URL regardless of the sign-in gate. Don't
put anything in a module page that would be a problem to publish.

**Answers are required.** Twelve fields carry `data-required`, and
`training.js` now gates Next on them the same way it gates on
`.aisa-quiz` — the nav hint says how many are outstanding. The Finish
button re-checks and lists what is missing by label, for anyone who
resumed part-way. `?preview=1` lifts the gate for review.

Deliberately optional: **line 6** ("what you need from Brandon"),
because most teachers need nothing and a forced box fills the one
answer that should mean something with "n/a"; and the InstrucTwin
**blocked** checkbox, which reports a problem rather than answering a
question.

`data-required` is opt-in, so the modules that predate it are
unaffected.

**The cohort is per-module, and it cuts both ways.** A module carrying a
`cohort` only counts for people in it:

- Nobody outside the 62 is expected to complete AI Literacy, so it is
  skipped in their "required done" and "fully complete". Without that
  guard every other member of staff would read as permanently behind on
  required training the moment this module was marked required.
- Everyone inside the 62 is chased **even if they have never signed in**.
  Scope the tracker to AI Literacy and it shows all 62 rows, stubbing in
  anyone the Hub has never seen — that is precisely the person you need
  to find before a deadline, and a plain roster filter would hide them.
- The module bar reads "*n* of 62 assigned teachers", not "*n* of all
  staff", and the readiness section counts started/not-started against 62.

Other modules are untouched: no cohort means it applies to everybody.

**Reading what teachers wrote:** admin dashboard → *AI Literacy
readiness · what teachers wrote* (`#responses`). One card per teacher,
people who asked for something or are blocked on InstrucTwin sorted to
the top, filters, and a CSV export that doubles as the ADEK evidence
file. Backed by `admin_module_responses`; if the endpoint is missing the
section says so in red rather than rendering empty.

**Arabic:** the module is bilingual. `ai-curriculum-readiness-ar.js`
holds every translation and is the only file to edit for wording.
It has two halves — `AR_DICT` for whole text nodes, and `AR_BLOCKS` for
sentences broken up by inline `<strong>`/`<em>`/`<a>`, which are stamped
onto elements as `data-ar` and swapped whole so Arabic word order
survives. If an English string is edited and its AR_BLOCKS key stops
matching, the console warns by name — it does not silently stay English.

Videos follow the language: a slot's `data-src-ar` is used in Arabic and
falls back to `data-src` when there is no Arabic cut. Segments 1 and 3
have both cuts; segment 4 has neither.

**⚠ The ADEK framework terminology in the Arabic is not official.** Phase
names, strand names and the proficiency tiers are faithful translations,
not ADEK's published Arabic. ADEK issues this curriculum in Arabic too —
check these before releasing to Arabic-reading staff. The header of the
`-ar.js` file repeats this warning.

Two additions were made to the shared `onboarding-i18n.js` for this, both
opt-in and inert for the modules that predate them: `data-ar` block
translation, and a whitespace-normalised dictionary fallback so keys can
be written on one line.

**Reviewing the content:** add `?preview=1` to the module URL. Every
chapter unlocks and the knowledge-check answers and feedback are
revealed, so the whole module reads end to end without working through
it. Without the flag it behaves normally.

**Scope & Sequence reference.**
`PD Modules/ai-literacy-scope-and-sequence.html` is the full KG–Grade 12
curriculum map (Brandon's own build: 43 tables, progression map,
end-of-phase expectations, vertical strand progression). It is a
**standalone page, deliberately not inlined** into the module — it
carries its own design system (Atkinson Hyperlegible, a teal palette,
dark mode) and its CSS styles bare `body`, `table`, `p` and `a`, so
pasting it into the module would wreck the module's styling.

The module reaches it three ways: a floating button present on every
chapter, a callout beside the grade focus in segment 4, and a line in
segment 2. The button is anchored **under the Hub topbar**, not above
the chapter nav — that nav is sticky at `bottom:1rem`, so it slides
between its stuck and natural positions as you scroll and no fixed
bottom offset clears it at both ends. It flips to the left edge in
Arabic.

**Segment 2's time-allocation card carries both numbers.** ADEK's
entitlement (one period a week for KG–5, two for Grades 6–12) and, below
it, how AISA actually delivers that: Grades 6–12 get **one timetabled
period a week with the remainder asynchronous**, elementary is unchanged.
Added 18 Sept 2026, when the secondary model was decided — before that
the card showed ADEK's two periods alone, which would have told every
secondary teacher something their timetable contradicts. Keep both: the
entitlement is what ADEK audits against, the delivery is what teachers
plan around. Each paragraph is a separate `AR_BLOCKS` key, so editing
either English string means editing its key in
`ai-curriculum-readiness-ar.js` to match, or that paragraph silently
falls back to English in the Arabic view.

**Segment 4 does not depend on InstrucTwin.** A teacher picks their
grade and sees that grade's Conceptual / Technical / Creation / Ethics
focus — ADEK's own Scope and Sequence, held bilingually in the `GRADES`
object in the module script — then writes the six-line plan against it.
InstrucTwin comes after, framed as "when you have access", because
platform access has already proved unreliable and the plan is the part
that has to survive that. The grade is captured as `lesson.grade`; it
replaced a free-text band question in segment 2, so the admin dashboard
and the CSV read `lesson.grade`, not `architecture.band`.

**Gotcha worth remembering:** `training.js` inserts the Previous/Next
bar immediately before `#completion-banner`, so that banner has to live
*outside* every `[data-chapter]` section. Nested inside one, the nav
inherits `display:none` on every other chapter and the module cannot be
advanced at all. This module shipped with exactly that bug once.

Outstanding before it can be announced to staff:

1. ~~The escalation route~~ — written 15 Sept 2026. Segment 6 names both
   Safeguarding Leads (Alia Nejdawi / elementary, Savvas Largatzis /
   secondary) with their emails, the 24-hour reporting timescale, and a
   first-ten-minutes worked example built on ADEK's "Unexpected Response"
   scenario. **Wording and contacts are copied from
   `safeguarding-module.html` rather than written fresh** — if the DSLs
   or the timescale change, update both files together or they will
   drift.
2. ~~The Apps Script redeploy~~ — done 14 Sept 2026. If the readiness
   section in the admin dashboard ever shows its red "no endpoints"
   banner, the deployed version has been rolled back.
3. **Videos** — segments 1 and 3 are done, in English and Arabic. Only
   segment 4 (the InstrucTwin screencast) is still unrecorded, and it
   stays optional. Self-wiring: each slot names the file it
   expects under `PD Modules/assets/ai-literacy/`, probes for it, and
   keeps its "to follow" note until the file actually loads. Dropping a
   file in is the only step — no code change. `data-embed` on a slot
   renders an iframe instead, for anything hosted outside the repo.
   See that folder's README, which also covers why a screencast of
   InstrucTwin may not belong in a public repo. The written content
   stands alone, so shipping without videos is fine.
4. ~~Confirm the cohort~~ — done 18 Sept 2026. The 62 teachers named on
   AISA's ADEK Implementation Form are in `AI_LITERACY_COHORT` at the top
   of the `MODULES` block in `admin-dashboard.html`. **Edit that list to
   change the cohort**; matching is by lower-cased email, the names are
   only for display.

**Resolved 15 Sept 2026:** `safeguarding-module.html` had the wrong
elementary nurse — it listed Jothi Vinod, who is secondary. Corrected to
**Dinesh Muragan · Kaviya Sasikumar** for elementary; secondary stays
**Jothi Vinod · Kaviya Sasikumar**. Both teams previously shared one
Arabic dictionary key because the English strings were identical;
`safeguarding-ar.js` now has a separate key for each, so changing one
team's nurses again means adding its key there too or the Arabic view
silently falls back to English.

Content sourced verbatim from ADEK's Train-the-Trainer Day 1 deck and
Participant Worksheet Packet — the Ms Hana case in segment 3 is
Worksheet 3 unaltered, including its Grade 7 setting.

## Flint Master Guide — pilot, added 29 October 2026

`Tools and Resources/flint-guide.html` is Brandon's *Flint Master Guide*
for Flint (`app.flintk12.com`), the AI platform AISA started piloting in
October 2026. Brandon asked for it on the Hub "for teachers to access".
He supplied one self-contained HTML file (DM Sans, AISA purple and gold,
its own dark mode) with 19 screenshots inlined as base64. Those are now
18 files in `Tools and Resources/assets/flint/` (760 KB), because
`activities-page.jpg` appears twice. **The words are his and unchanged.**

It is reached from:

- a card, first in *AI Teaching Assistants* on `tools.html`. The card
  opens the guide, and its *Pilot · Open Flint* strip opens Flint;
- `search-index.js` (type *Guide*);
- the fallback palette in `menu.js`.

The last two set off the cascade to `?v=31`. Like the AI Growth Test
guide, it is **not a PD module**: it is in no `MODULES` array and has no
completion or certificate.

**What was changed to fit it into the Hub.** Re-apply all of this if
Brandon sends a new version:

- the `gate.js` include, and a back link to Tools & Resources in the
  cover;
- `--topbar` (menu.js's 60px bar) in the sticky index's `top` and in
  every `scroll-margin-top`;
- `dir="ltr"` on the cover, the shell and the footer, because it is
  English only and the menu's Arabic toggle sets `rtl` on `<html>`;
- its bare element rules (`a`, `p`, `h1`–`h4`, the focus ring), scoped
  to its own blocks with `:where()`, which keeps their specificity;
- `.open` (the *Open in Flint* pills) and `.tag`, scoped to `.tool`.
  **menu.js puts a bare `open` class on its search overlay, drawer and
  menu button**, and the guide's pill style turned the whole search
  overlay into a bordered ellipse. Before using a generic class name
  unscoped in a self-contained page, grep `classList.add(` in
  `auth/*.js`;
- the Claude-artifact meta tag, `viewport-fit=cover` and a `body::before`
  safe-area strip, all removed (the Hub's topbar owns the top edge);
- a short script that tags every link into Flint as
  `flint-guide:open:<what>` and every Copy button as
  `flint-guide:copy:<tool or template>-<prompt>`. The clicks sheet then
  shows which tools and prompts the pilot teachers actually use.

The screenshots were pulled out in order with a few lines of Python,
which decode each `data:image/jpeg;base64` URI and name it by what it
shows. Do the same for a new version, then diff its text against this
page.

**All 18 screenshots were checked before committing.** They show
demonstration content only: a Grade 7 photosynthesis activity and a
simulated preview student. The only name in any of them is Brandon's
own, from his Flint account: the Home greeting, the sidebar, *Brandon
Baki created*, and the preview session greeting him. His name is
already public throughout this repo. No student or other member of staff
appears. **Check any replacement screenshot the same way**, because the
repo is public.

The `?tool=<uuid>` links open Flint's own tool templates, which are the
same for every school. They carry no AISA or personal identifier.

What was tested (the scripts need Chromium and are not in the repo):

- no sideways scroll at 390 px;
- the section index sticks under the topbar;
- every anchor lands clear of the bars;
- the Arabic Hub setting leaves it LTR;
- Hub search finds it;
- the menu's search and drawer have the same computed styles here as on
  the AI Growth Test guide.

**The pilot is open to all teachers** (Brandon, 29 October 2026), so
the guide needs no line saying who it is for. **Student rostering was
still in progress** that day. The *Classes* and *Share & see results*
sections assume students are in Flint, so check rostering has finished
before pointing teachers at them in a newsletter or email.

## AI Growth Test guide — added 18 September 2026

`Tools and Resources/ai-growth-test-guide.html` is ADEK's *AI Growth Test
— AI Lead & Proctor User Guide* (v1.0, 12 Sept 2026) rebuilt as a
screen-first reference. Reached from the **Assessment & Test Prep**
category on `tools.html`, from `menu.js`, and from `search-index.js`.

**It is deliberately not a PD module.** It is an operational runbook for
a live assessment window, with no chapters, no quiz, no completion event
and no certificate. It is *not* in any `MODULES` array, so it does not
move the headline compliance numbers — keep it that way unless someone
decides proctor training is itself PD.

**The window dates are in the page, not in a sheet.** `OPEN` and `CLOSE`
in the page script (`2026-09-14` / `2026-10-04`, Abu Dhabi offset) drive
the banner, which recomputes on every load and flips through
*opens in N days* → *window open, N days left* → *window closed*. When
ADEK moves the window, change those two dates and the prose in the hero
strip and the key-dates line; nothing else reads them.

**Step numbers track section numbers** — Phase 1 is section 2, so its
steps are 2.1–2.6. Cross-references ("see 2.4", "read section 4.3") are
written out by hand. Reorder the sections and every one of them is
wrong, so renumber both together.

**Screenshots.** The 16 figures in `Tools and Resources/assets/aigt/`
were extracted from ADEK's PDF (~940 KB total). Every one shows
demonstration data only — "Test Student One", `test9900101@example.com`,
`ailead@instructwin.com` — and was checked individually before being
committed; no real student or staff name appears in any of them. They
are still **ADEK's screenshots in a public repo**, so if ADEK would
rather they weren't republished, deleting the folder and the
`<figure class="shot">` blocks leaves the guide complete — the written
steps stand alone.

**English only.** There is no `-ar.js` and no `data-ar` markup. The
global language toggle in `menu.js` sets `html[dir="rtl"]` on *every*
page, which would mirror this one, so the content wrapper pins
`dir="ltr"`. That is scoped to `.layout`, not `<body>`, so the Hub
topbar still flips normally.

**A `guide` type was added to `tools.html`** for this card. Since the
browse-bar rebuild (below) the type chips are gone, so it now lives in
just two places: the `.type-badge-guide` rule and the `<option
value="guide">` in the Format select. Counts are derived from the DOM,
so there is no third list to forget.

Interactive bits, all client-side and all optional: a role filter
(Everyone / AI Lead / Proctor / Student) that hides the steps that
aren't yours, tick-off checklists, a copyable student briefing script,
and click-to-enlarge figures. State lives in one localStorage key,
`aisa_aigt_v1` (chosen role + ticked boxes) — per device, never sent
anywhere, and carrying no names, which is what keeps this page outside
the personal-data rules that govern `module_responses` and
`survey_responses`.

**Grid gotcha worth remembering:** the mobile jump strip is two
`overflow-x:auto` rows, and the layout's mobile rule was
`grid-template-columns:1fr`. A `1fr` track floors at its content's
*min-content* width, and a `nowrap` flex row's min-content width is the
entire row — so the page laid out 1578px wide and scrolled sideways on
every phone. It is `minmax(0,1fr)` now. Any future scrolling strip in a
grid column needs the same treatment.

## Digital Lion — Issue No. 5, 18 September 2026

`Media Hub/sep18.html`, the AI Literacy rollout issue. Bilingual like
may18 and jun17, same house style (Poppins/Inter/Cairo, navy `#0b2545`,
cyan, amber) — **deliberately not the AISA purple-and-gold brand**, so
that the newsletter series stays internally consistent. Listed as the
latest issue on `media.html`, and in `menu.js` and `search-index.js`.

Nine sections, each labelled with who it is for: the AI Specialists
thank-you, Monday's building meeting, the readiness module (the big
one), how often the curriculum is taught, the AI Growth Test, Level 1
for new staff, Level 1 certificates, the secondary goal form, and the
student-data reminder.

It is the **latest-newsletter card on `index.html`** as well as the
Media Hub listing — that card already existed and pointed at jun17; it
is pointed at each new issue rather than duplicated. Updating an issue
means four places: `media.html` (promote, and archive the previous
one), `index.html` (href, badge, date, summary, CTA), `menu.js` and
`search-index.js`.

It opens with a **"Do you have to do the training?" card** that checks the
signed-in address against the AI Literacy cohort, shows a spinner, then
settles on *Required*, *Not required*, or *Couldn't check*. It sits above
everything else because that is the first question every reader has.

**The cohort is duplicated there and must be kept in step.** The card
holds the 62 addresses as **truncated SHA-256 hashes**, not as addresses:
this is the most forwardable page on the Hub and it should not carry a
copy-pasteable list of who is on ADEK's Implementation Form. Change
`AI_LITERACY_COHORT` in `admin-dashboard.html` and the hashes have to be
regenerated, or the newsletter tells someone the opposite of what the
tracker does. The regeneration recipe is in the comment above `COHORT`
in the page's own script.

Treat the hashing as tidiness, not security: the addresses are
first-initial-plus-surname, so anyone determined could hash their way
through them. **It is not a permission gate and must never be used as
one** — it decides what a card says, nothing more.

Two things that bit while building it. The checking row is `display:flex`,
and a class beats the `hidden` attribute's UA `display:none`, so the
spinner stayed on screen underneath the verdict until
`#status-card [hidden] { display:none }` was added. And the verdict is
held back to a 650ms floor (`MIN_SPIN`) because hashing is instant and an
unannounced flip reads as a glitch rather than a check.

It carries a **mail-out bar** for the addresses in `NEWSLETTER_SENDERS`
(see the pending-redeploy section). The copy the email sends is the
`ISSUE`/`HEADLINE`/`INTRO`/`ITEMS` block in the page's own script, not
scraped from the article — the email is the trailer, the page is the
newsletter, and the trailer should stay blunter and shorter. A new issue
needs that block rewritten or it will mail the previous issue's summary.

**Every link out of it is relative** (`../PD%20Modules/…`), so the page
does not hardcode a production host and keeps working wherever the Hub
is served from. If this is ever re-cut as an email, those links have to
become absolute — that is the one thing an email version needs that the
page does not.

**There is no page-local language toggle**, and there should not be:
`menu.js` injects the canonical Hub-wide toggle into the topbar and owns
the shared `aisa-newsletter-lang` key. The small inline script at the
bottom only applies the saved choice on load, before `menu.js` arrives,
so Arabic readers never get a flash of English. jun17 and may18 do the
same thing — their `.lang-toggle` CSS and `#lang-toggle` lookup are
leftovers from before the global toggle existed and match no element.

**InstrucTwin is deliberately absent from this issue**, and that is not
an oversight to be tidied up. As of 18 Sept 2026 staff accounts do not
show the grades a teacher is assigned to, so sending anyone to the
platform to open "their" Monday lesson would send the whole cohort to a
dead end. The training section instead says the materials are coming and
that chasing them is Brandon's job, and the Level 1 section names the
course and the 30 September deadline without naming the platform. Two
things had to be true before InstrucTwin went back in: grade
assignments visible in staff accounts, and the URL confirmed. **The URL
is now confirmed** — ADEK settled it as `adek.instructwin.com` on 21
September 2026 — but grades are still not showing, so InstrucTwin stays
out of this issue. One condition down, one to go.

**The module still names InstrucTwin, softened.** Segment 4 used to say
"open your lesson before Monday", which no one could do; on 18 Sept 2026
it was reworded to say that staff accounts are not yet showing assigned
grades, that chasing it is Brandon's job, and to read the lesson against
the plan *when it opens*. The "when you have access" steps and the
"could not get into InstrucTwin" checkbox are unchanged and still worth
keeping — the checkbox is the only signal of who tried. Put the
"before Monday" urgency back only once grades are actually visible.

**Corrected on the day, 21 September 2026.** The Monday session section
and the key-dates row said *anyone who received the email*, which was
wrong by the morning of the session. They now read **all secondary
teaching staff · KG & Elementary homeroom teachers**, give the full
**3:10–4:25 pm**, carry "bring your device, charged", and the line
telling people without the email to ignore it is gone. The issue's own
`ITEMS` mail-out summary was updated to match, or a re-send would have
mailed the old audience.

The room is named **Secondary Gym** here and on the hub, with "the same
room as the Big Gym" alongside it — the venue did not move, it is the
same hall under two names, and the issue had already gone out using the
other one.

This is the exception to "the next issue, not an edit to this one":
that rule is about *new* material. A published fact that has since
changed, about something happening today, on the most forwarded page on
the Hub, is a correction — leave it and the newsletter actively
misdirects people. New material still waits for the next issue.

Two facts in it came from Brandon rather than the repo. The **secondary
delivery model** is one timetabled period a week for Grades 6–12 with
the remainder asynchronous. And on the **AI Growth Test**, the only
proctoring that is settled is **Grades 4 and 5, by the class’s own
homeroom teacher** — Grades 6–12 are still open, and K–3 do not sit the
test at all. That section links the AI Lead & Proctor guide but still
carries **no AISA test dates**, deliberately: Brandon announces those
himself, and the guide’s own banner is driven by ADEK’s window
(`OPEN`/`CLOSE` in its page script), not by AISA’s. When the secondary
arrangement and the dates land, both belong in the next issue rather
than as an edit to this one.


## Digital Lion — Issue No. 6, held for release (written 29 October 2026)

`Media Hub/oct30.html`, dated Friday 30 October 2026. Brandon asked for an
issue he could release the next day, visible only to `bbaki@` and `hodai@`
until he pressed a release button. Sources: this repo, Brandon's own task
list and weekly agenda, his sent mail, and the other AISA-AI-web repos
(`AI-Lessons` holds the launcher, the Activity Hub, AI Lessons and the
Assessment Calendar; `data-anonymizer`; `map-data-tool`).

In it: MagicSchool ended and the Flint pilot (lead), AISA Tools
(`aisa-tools.pages.dev`), the Activity Hub, the Data Anonymizer, AI Lessons'
new address and home-language lessons, the Assessment Calendar, the MAP
Dashboard (added the same day at Brandon's request), the PD Day material,
a Sustainability reminder, NotebookLM ⇄ Drive sync, and six smaller
items. Deliberately left out: anything not aimed at AISA staff,
the Anti-Bullying module (still preview), and internal planning that
staff have not been told about.

### How the release works: the bell notification is the switch

`Media Hub/issue-release.js` is shared by the issue, `media.html` and
`index.html`. An issue counts as released when **any active bell
notification links to its page** (`Media%20Hub/oct30.html`). Until then:

- the issue shows a "not out yet" panel to everyone but the senders, who
  see it with a *Preview* ribbon and a tools bar at the bottom;
- `media.html` and the home page keep Issue No. 5 as the latest, and show
  Issue No. 6 (with a *Preview* badge) only to the senders.

**Release** in the tools bar posts a broadcast notification whose body
links to the page. Within about 90 seconds (the bell's cache) the issue,
the Media Hub card and the home-page card switch for everyone. **Email
all staff** stays locked until then, so nobody is mailed a link they
cannot open. **Undo release** deletes the notification and switches it
all back.

So **deleting that notification from Send Notifications un-releases the
issue.** Don't tidy it away.

Why the bell rather than a flag of its own: it needs no backend change,
no redeploy and no `gate.js` cascade, so it works on the backend that is
live today; the menu already fetches the bell on every page; and staff
should be told when an issue is out anyway.

Two details that matter:

- Releasing is `post_notification`, which the backend allows to the
  `admins` tab, not to `NEWSLETTER_SENDERS`. If `hodai@` is not an admin,
  it can preview and email but not release; the bar says so.
- `SENDERS` in `issue-release.js` mirrors `NEWSLETTER_SENDERS` in
  `00_settings.gs`. It only decides what the page shows. The page itself
  is public on GitHub either way, so nothing unpublishable goes in an
  unreleased issue.

A failed bell read never hides an issue this browser has already seen
released (`aisa_dl_released_v1` in localStorage); otherwise the page says
it could not check and offers *Try again*.

The next issue can reuse all of this: give its page the same gate, bar
and `ISSUE_KEY`, and add its key to the `data-dl-*` attributes on
`media.html` and `index.html`.

### The email: bilingual, in the AISA design

Brandon's first test send came back English-only and plain, and he asked
for it bilingual "with the AISA logo and all". The newsletter email is
built by the backend (`31_email.gs`), so:

- **`send_newsletter` takes Arabic copy.** With any of `headline_ar`,
  `intro_ar` or `items_ar`, it sends `_newsletterHtmlBilingual()`: a purple
  header with the white AISA seal and the issue in both languages, the
  headline in both, then English on the left and Arabic on the right, each
  with a gold *In this issue* card, its own button and the sign-off. The
  plain-text part is English, a rule, then Arabic. It is the design of
  Brandon's other bilingual emails (the `aisa-bilingual-email` skill):
  `background-color` plus `bgcolor`, never the `background:` shorthand,
  which Gmail strips. On a phone the columns stack, English first.
- **The seal comes from the issue's own site.** The page passes
  `logo_url`, and the backend uses it only when it is https on the same
  host as the issue's `url`, so no page can put another site's image in a
  school-wide email. Served over plain http (a local test), the seal is
  left out.
- **Without Arabic, nothing changed.** The English-only email the other
  mail bars send (Sustainability, the AI Literacy Hub, Anti-Bullying) is
  byte for byte what it was: checked with the simulator's `--strict`
  comparison against the previous backend.
- **The reply says `bilingual: true`.** The issue's bar needs a test send
  before *Email all staff* unlocks, and if the test comes back without
  that flag it says in red that the backend has not been redeployed, and
  the confirm dialog repeats it.
- `gate.js` passes the new fields through (`ar`, `signoff`, `logoUrl` on
  `sendNewsletter`), which took the cascade to `?v=32`.

The Arabic in the email uses Western digits, as Brandon's bilingual emails
do; the page itself keeps the Eastern digits of the newsletter series.
`issue-template.html` carries the same `AR` block, so the next issue's
email is bilingual too.

### After Issue No. 6 is released

1. Add it to `menu.js` (fallback palette) and `search-index.js`, which
   means bumping their pins in `gate.js` and the `?v=` cascade. That was
   left out on purpose: either file would have shown it to everyone
   before the release.
2. Run `build-past-issues.py`, then update the harvester's
   `reference-pack.md` (ledger, *Shipped since*, *Open threads*). Not
   before: the pack would describe an issue staff haven't seen.
3. Once it has been out a while, the gate can stay. It costs nothing,
   and the bell notification keeps it open.

### Facts to recheck before reusing them

- The Sustainability credit says **Ms Nastassia van Jaarsveldt**, as the
  module does. Her email signature reads *Nastassia Enslin*,
  *Sustainability Coordinator*. Worth confirming which name
  she wants.
- Flint: students were not rostered on 29 October, so the issue tells
  teachers to use Preview, not to share with classes. When rostering is
  done, that is news for the next issue.
- The Arabic was written for this issue and has not been checked by an
  Arabic speaker.

`check-issue.py` now fails only on links to the Hub's own production host
(`github.io/The-Learning-Hub`). The Data Anonymizer, the MAP Dashboard and
the arcade live on `github.io` too, and an absolute link is the only way
to reach them.

## Newsletter harvester — added 13 October 2026

`Media Hub/newsletter-harvester/` holds a weekly Claude Code routine that
**writes the next issue**. It gathers from the commit log, Gmail, Calendar,
Drive and the web, and fills `issue-template.html` (built from
`sep18.html`). It runs `check-issue.py`, then leaves the page as an
**attachment on a Gmail draft** to Brandon, with editor's notes in the
body. It never sends, publishes, commits or pushes. The folder's README
covers setup and how to publish a draft.

**The Google connectors are on `bbaki@aisa.sch.ae`.** Brandon switched
them from his personal account on 13 October 2026. The prompt still
checks each connector's account before using it and skips any that
isn't the school one. Google Chat has no connector, so it is not a
source.

**The draft page stays out of the repo until Brandon publishes it.** An
unreviewed issue pushed to any branch is world-readable on GitHub.

- `system-prompt.md` is the task's prompt.
- `reference-pack.md` is its sense of what matters: tiers, what to leave
  out, open threads, and what has shipped since the last issue.
- `issue-template.html` and `check-issue.py`: if an issue changes the
  house style, rebuild the template from it. The checker fails on
  missing Arabic, leftover placeholders, dead links, links to preview or
  admin-only modules, a stale `gate.js` pin, and a mail-out block that
  disagrees with the page. Run it on a published issue to sanity-check
  it. `sep18.html` passes.
- `past-issues/` is generated by `build-past-issues.py` from the issue
  pages. Don't edit it by hand.

**When an issue goes out, the pack has to move with it,** on top of the
four places listed under Issue No. 5:

1. Re-run `build-past-issues.py`.
2. Add the issue to the pack's ledger.
3. Clear the pack's *Shipped since* table.
4. Update its *Open threads*.

Skip this and the harvester re-suggests what the last issue already said.

**The list below is the harvester's top-priority input.** It ranks every
item here above anything it finds by itself.

The editor's notes summarise internal and ADEK email, so they must never
be committed here. The prompt forbids that, and nothing in the folder
needs them.

## Next Digital Lion Newsletter — items to include

Nothing at the moment. NotebookLM ⇄ Google Drive auto-sync, held back
from Issue No. 5, went into Issue No. 6.

## Browse bar — pd.html + tools.html, 18 September 2026

`PD Modules/pd.html` and `Tools and Resources/tools.html` were the two
"index" pages staff use to find anything, and both had grown a stack of
controls with no page title above them. `tools.html` was the worst: a
*filter command bar* (search + seven type chips + an active-filter
strip) sitting directly on top of a separate sticky *"Jump to"* nav
whose pills looked identical but **scrolled** instead of filtering. Two
rows of pills, two taxonomies, two behaviours, no labels.

Both pages now share one component, **the browse bar** — teal on tools,
indigo on PD, otherwise identical:

```
page header (eyebrow · H1 · one-line lede [· progress strip on PD])
browse bar   (sticky, top:3.75rem)
  row 1: search  ·  secondary control  ·  "n of N"  ·  Reset
  row 2: ONE row of pills
content
```

**The one rule: one row of pills.** Anything that is not the page's
primary taxonomy goes in row 1 as a *differently shaped* control, never
as a second pill row. On tools that secondary axis is the **Format**
`<select>` (gem / web / module / guide / form / login); on PD it is the
**"Hide completed"** checkbox. Add a second pill row and you have
rebuilt exactly the thing this replaced.

The bar sticks at `top: 3.75rem` because the `menu.js` topbar is
`BAR_HEIGHT = 3.75rem` (60px). The old quick-jump bar used
`top-[68px] md:top-[76px]`, which matched nothing.

`.browse-pills` and `.browse-inner` both carry **`min-width: 0`**, and
`.browse-bar input, select, button` carry **`box-sizing: border-box`**.
Both are load-bearing: a `nowrap` flex row's min-content width is the
whole row, and the padded pill-shaped input is 128px wider than its
parent without border-box. Either one missing and the whole page
scrolls sideways on a phone. Same trap as the AI Growth Test guide's
jump strip.

### tools.html specifics

- The pill row **is** the six `<section class="tool-category">`
  headings, so the control and the content share one taxonomy. Pills
  filter in place: `All` shows every section, one category shows just
  that section (headings kept — they give context), and search or a
  Format choice flattens matches into `#tools-search-grid`.
- Cards cross-listed into a second category carry
  `data-canonical="false"`. They are dropped from the count and from
  results **only when the category is `All`**, where they would repeat.
  Inside a single category the cross-listed copy is that category's only
  copy of the tool — dropping it there made *Assessment & Test Prep +
  Gems* return nothing even though the IB Exam Format Generator sits in
  that very section.
- So "21 cards on screen, 18 tools" is correct and intended: three Gems
  appear twice.
- `#cat-*` in the URL now **selects that pill**, not just scrolls —
  `Media Hub/may11.html` links to `tools.html#cat-gems`. The router
  hashes (`#module-map`, `#module-twinkl`, …) are untouched and still
  open their detail sections.
- The "Request a Tool or Resource" CTA moved to **bottom**-right. At
  `top-24` it sat inside the sticky bar and covered the result count.

### pd.html specifics

- `data-category` is now a pure **topic** (`ai-digital`, `teaching`,
  `safety`, `essentials`) and **`data-required="true"`** is a separate
  flag. They used to be one attribute, so "Required" swallowed the
  topic: AI Literacy was `required` and therefore absent from `AI
  Tools`. The `Required` pill is amber and divided off from the four
  subject pills because it is a status, not a subject.
- **The required list must match `MODULES` in `admin-dashboard.html`** —
  currently `ai-curriculum-readiness`, `ai-ethics`, `return-to-school`,
  `safeguarding`, `sustainability`. Before this it did not: Safeguarding was tagged
  `orientation` so it never appeared under Required, while Sustainability
  (unreleased, not in `MODULES` at all) did. Change one, change both.
- The old topic name `orientation` is gone. It collided with the
  separate Orientation Hub in the main nav and had become a grab-bag of
  five unrelated modules.
- **Completed modules stay visible.** The old filter hid them from every
  chip except a `Completed` one that was itself hidden until you had
  finished something — so a module you had just passed silently vanished
  from "All modules". Progress belongs in the header strip; the grid
  shows what exists. "Hide completed" is opt-in.
- **Pill counts are totals, not remainders.** They used to subtract
  completed modules, so the numbers shrank as you worked and disagreed
  with the grid.
- Counts and the progress strip are computed **from the DOM on load**,
  before any network call — they only ran inside the completion sync
  before, so a signed-out or offline visitor saw every pill reading `0`.
  The progress strip itself stays hidden until `applyCompletions()` has
  run (`window.__pdCompletionsKnown`), so nobody is told "0 of 13" while
  the request is still in flight.

### Not touched

No change to `gate.js`, `menu.js` or `search-index.js`, so **no `?v=N`
cascade** — at the time, the pages kept `auth/gate.js?v=21`. (They are
on `?v=24` now; the AI Literacy Hub triggered the cascade in September.)
Keep out of the shared helpers where you can: this was a two-file change
precisely because it did.

`Committees/committees.html` still has its own older `.filter-chip`
styling and was left alone. If the browse bar is rolled out further,
that page and the Library / Media / Orientation hubs are the candidates.
