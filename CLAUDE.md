# CLAUDE.md

Notes for future sessions on The Learning Hub.

## Apps Script — pending redeploy

`auth/apps-script.gs` has uncommitted-on-Google changes from recent
commits that need to be pasted into the Apps Script project and
redeployed (Deploy → Manage deployments → New version). The URL in
`gate.js` stays the same. Until the redeploy happens, the new endpoints
fail silently and the dependent UIs stay empty:

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

  **Who can send is `NEWSLETTER_SENDERS` at the top of `apps-script.gs`**
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
  `SURVEY_SPECS` in `apps-script.gs`. That double check is the entire
  reason this stopped being a Google Form, so if you add a question that
  must be answered, add its key to `required` there too. Otherwise it is
  only a suggestion. The ten focus-area names are pinned in
  `SURVEY_SPECS.choices.focus_area` and must stay character-for-character
  identical to `FOCUS_AREAS` in `secondary-teacher-goal.js`, or
  submissions start bouncing with `missing_required`.

  **Two pieces of optional setup**, both safe to skip:
  1. `SURVEYS_SPREADSHEET_ID` at the top of `apps-script.gs` is empty,
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

`apps-script.gs` has a *Read cache* section. `CacheService.getScriptCache()`
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
node tests/apps-script-sim.js                         # after touching apps-script.gs
node tests/apps-script-sim.js --baseline <old.gs>     # to compare with an older backend
node tests/gate-smoke.js                              # after touching gate.js
```

The simulator runs the real `apps-script.gs` against a fake spreadsheet and
cache, each request in a fresh copy of the script (Apps Script keeps no
globals between requests; a test that did would hide the bugs worth
finding). It runs one long scenario with the cache working and with the
cache throwing on every call, and demands identical responses and an
identical final spreadsheet. `git show <commit>:auth/apps-script.gs >
old.gs` gives a baseline. Both files break loudly when a planted bug — a
missing `_bump`, an unchecked row hint — is put in.

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
`auth/gate.js?v=N` by **46 pages**, so **changing `gate.js` means bumping
`N` on every one of them** or returning visitors keep running the
cached copy. That change took it to `?v=19`; the September 18
newsletter took it to `?v=20`, the newsletter mail-out to `?v=21`, and
the request-transport rework to `?v=22`, the fix for the outage it
caused to `?v=23`, the AI Literacy Hub to `?v=24`, and the data-loading
audit (23 September 2026) to `?v=25`.

The same trap sits one level down. `gate.js` pulls its helpers with
their own pins — `certificate.js?v=7`, `search-index.js?v=10`,
`menu.js?v=16`, `dwell.js?v=2` — so **editing one of those helpers
means bumping its pin inside `gate.js`, which is itself a change to
`gate.js`, which means bumping `?v=N` on all 46 pages again.** Adding a
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
16 Sept 2026. `_isDate()` uses `Object.prototype.toString`, not
`instanceof` — `instanceof Date` is false for a Date from another realm.

The same class of bug hits the client: sort by `Date.parse(...)`, never
`localeCompare` on a timestamp.

`getCompletionsFor()` also matched emails with a case-sensitive `!==`
while `adminOverview()` lowercased them, so a teacher's own dashboard
and the admin tracker could disagree about the same completion. Both
lowercase now.

## Diagnosing "the dashboard doesn't match the spreadsheet"

Run **`auditHubData()`** from the Apps Script editor (Run →
auditHubData). Reads only, changes nothing, prints a report. It covers
the three things that cause a silent mismatch:

1. **Header drift.** Every reader in `apps-script.gs` addresses columns
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
is missing from the list reads 0% forever. `sustainability` is knowingly
in the first category — the module records completions but is not
released, so it is not on the tracker. Add it to `MODULES` in
`admin-dashboard.html`, `admin-charts.html` and `dashboard.html` when it
is released, or those completions stay uncounted.

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


## Next Digital Lion Newsletter — items to include

- **NotebookLM ⇄ Google Drive auto-sync.** Files uploaded to NotebookLM
  now auto-sync from Google Drive — no more re-uploading after edits.
  Worth a dedicated section (huge daily-use win for teachers building
  unit packs and study guides). Link to Drive and to the existing
  NotebookLM PD module. **Held back from Issue No. 5** on 18 Sept 2026 —
  that issue was entirely AI-literacy rollout and this did not fit.

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
  `safeguarding`. Before this it did not: Safeguarding was tagged
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
