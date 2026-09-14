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

## Next Digital Lion Newsletter — items to include

- **NotebookLM ⇄ Google Drive auto-sync.** Files uploaded to NotebookLM
  now auto-sync from Google Drive — no more re-uploading after edits.
  Worth a dedicated section (huge daily-use win for teachers building
  unit packs and study guides). Link to Drive and to the existing
  NotebookLM PD module.
