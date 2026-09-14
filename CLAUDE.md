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

`PD Modules/ai-curriculum-readiness-module.html` is **not on `main`
yet** — it sits on `claude/admiring-bardeen-fr6hnp`, pending
[PR #100](https://github.com/AISA-AI-web/The-Learning-Hub/pull/100).
Merging that PR publishes it to the live site.

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

Outstanding before it can be announced to staff:

1. **The escalation route is written.** Segment 6 carries a dashed gold
   `.needs-content` block where AISA's real DSL name, channel and
   timescale go. ADEK explicitly forbids inventing a reporting route
   ("notice–record–report–act–review is a memory aid, not an official
   school reporting route"), so it was left blank rather than filled
   with something plausible. Search `data-editor-block="escalation-route"`.
2. **The Apps Script redeploy happens**, or teachers hit the red banner.
3. **Videos, if wanted.** Three `.video-slot` elements (segments 1, 3, 4)
   render a "to follow" note until given a `data-src`. The written
   content stands alone, so shipping without them is fine.

Content sourced verbatim from ADEK's Train-the-Trainer Day 1 deck and
Participant Worksheet Packet — the Ms Hana case in segment 3 is
Worksheet 3 unaltered, including its Grade 7 setting.

## Next Digital Lion Newsletter — items to include

- **NotebookLM ⇄ Google Drive auto-sync.** Files uploaded to NotebookLM
  now auto-sync from Google Drive — no more re-uploading after edits.
  Worth a dedicated section (huge daily-use win for teachers building
  unit packs and study guides). Link to Drive and to the existing
  NotebookLM PD module.
