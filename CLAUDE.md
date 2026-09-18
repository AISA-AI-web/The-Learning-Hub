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
  so the first run after redeploying prompts for the Gmail/send-mail
  authorisation scope — approve it once as the account that owns the
  script. One personalised message per recipient (first name pulled from
  the `sessions` and `roster` tabs), `replyTo` set to the admin who sent
  it, and sends stop short of both the daily mail quota and the 6-minute
  execution cap, reporting anything unsent as `skipped`.
  Unlike the items above this one does **not** fail silently: until the
  redeploy, the tracker posts the bell notification and then warns the
  admin in red that no emails went out.

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
`auth/gate.js?v=N` by 45 pages, so **changing `gate.js` means bumping
`N` on every one of them** or returning visitors keep running the
cached copy. That change took it to `?v=19`; the September 18
newsletter took it to `?v=20`.

The same trap sits one level down. `gate.js` pulls its helpers with
their own pins — `certificate.js?v=7`, `search-index.js?v=9`,
`menu.js?v=15`, `dwell.js?v=2` — so **editing one of those helpers
means bumping its pin inside `gate.js`, which is itself a change to
`gate.js`, which means bumping `?v=N` on all 45 pages again.** Adding a
page to the menu or the search index is enough to trigger the whole
cascade. Skip it and returning staff keep the cached helper and never
see the new entry.

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

Both panels stay in the DOM and every section's script runs and fetches
on page load whichever tab is open. That is deliberate: nothing is lazy,
so nothing can be left half-initialised, and switching tabs costs no
requests. It also means **no section may measure layout** (offsetWidth,
getBoundingClientRect) during setup — a closed panel has no dimensions.
Nothing on the page does this today.

The Survey Data tab carries an amber badge with the number of people
who still owe a goal. The goals section fires an `aisa:goal-counts`
CustomEvent on every render and the tab controller listens for it.

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

**A `guide` type was added to the `tools.html` filter bar** for this
card, and it lives in four places that must stay in sync: the
`.type-badge-guide` rule, the `.filter-chip[data-type-filter="guide"]`
rules, the chip markup in the filter bar, and `TYPE_LABELS` + `counts`
in the page script. Miss the last one and the chip renders but counts 0
and filters to nothing.

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
things have to be true before InstrucTwin goes back in: grade
assignments visible in staff accounts, and the URL confirmed — the
module uses `schools.instructwin.com`, the ADEK correspondence says
`www.adek.instructwin.com`, and nobody has established which is right.

**The module still names InstrucTwin, softened.** Segment 4 used to say
"open your lesson before Monday", which no one could do; on 18 Sept 2026
it was reworded to say that staff accounts are not yet showing assigned
grades, that chasing it is Brandon's job, and to read the lesson against
the plan *when it opens*. The "when you have access" steps and the
"could not get into InstrucTwin" checkbox are unchanged and still worth
keeping — the checkbox is the only signal of who tried. Put the
"before Monday" urgency back only once grades are actually visible.

One fact in it came from Brandon rather than the repo: the **secondary
delivery model** is one timetabled period a week for Grades 6–12 with
the remainder asynchronous.


## Next Digital Lion Newsletter — items to include

- **NotebookLM ⇄ Google Drive auto-sync.** Files uploaded to NotebookLM
  now auto-sync from Google Drive — no more re-uploading after edits.
  Worth a dedicated section (huge daily-use win for teachers building
  unit packs and study guides). Link to Drive and to the existing
  NotebookLM PD module. **Held back from Issue No. 5** on 18 Sept 2026 —
  that issue was entirely AI-literacy rollout and this did not fit.
