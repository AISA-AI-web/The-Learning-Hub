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

## AI Literacy module — admin preview, not released

`PD Modules/ai-curriculum-readiness-module.html` is on `main` and live
(PR #100, merged 14 Sept 2026), but **not released to staff**.

It is gated to admins exactly the way the Sustainability module is: an
`#admin-gate` overlay on the page (fails closed), `data-admin-only` on
the pd.html card, `adminOnly: true` in search-index.js, and no listing
at all in dashboard.html, menu.js, admin-dashboard.html or
admin-charts.html. Access is whoever is on the `admins` tab — it is not
per-person.

**That gate hides the module; it does not protect it.** The GitHub repo
is public with Pages enabled, so the HTML is readable by anyone with the
URL whatever the client-side gate renders. Don't put anything in a
module page that would be a problem to publish.

To release: see the checklist in the pd.html card comment.

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
falls back to `data-src` when there is no Arabic cut. Segment 1 has both.

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
3. **Videos** — segment 1 is done, in English and Arabic. Segments 3 and
   4 are still optional and unrecorded. Self-wiring: each slot names the file it
   expects under `PD Modules/assets/ai-literacy/`, probes for it, and
   keeps its "to follow" note until the file actually loads. Dropping a
   file in is the only step — no code change. `data-embed` on a slot
   renders an iframe instead, for anything hosted outside the repo.
   See that folder's README, which also covers why a screencast of
   InstrucTwin may not belong in a public repo. The written content
   stands alone, so shipping without videos is fine.
4. **Confirm the cohort** — who has to complete it, per the ADEK
   Implementation Form. That list drives the tracker's "outstanding".

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

## Next Digital Lion Newsletter — items to include

- **NotebookLM ⇄ Google Drive auto-sync.** Files uploaded to NotebookLM
  now auto-sync from Google Drive — no more re-uploading after edits.
  Worth a dedicated section (huge daily-use win for teachers building
  unit packs and study guides). Link to Drive and to the existing
  NotebookLM PD module.
