# AISA Learning Hub — Apps Script backend

These fifteen `.gs` files are the Hub's backend. They live in the Apps Script
project bound to the Hub spreadsheet (open the spreadsheet, then
Extensions → Apps Script). Until 13 October 2026 they were one file,
`auth/apps-script.gs`. That is gone; git history keeps it.

**Your data is in the spreadsheet, not in this code.** Pasting, splitting,
deploying or rolling back the code never changes a tab. The tab names and
columns are exactly what they were, so the new code reads and writes the
same cells the old code did.

| File | What is in it |
|---|---|
| `00_settings.gs` | The values you might change: who may send the newsletter, where survey answers are stored, the sign-in client |
| `01_sheets.gs` | Every tab: its name, its columns in order, how it is opened |
| `02_router.gs` | `doPost` and `doGet`: every action the Hub can call, and who may call it |
| `03_helpers.gs` | Timestamps and small shared helpers |
| `04_cache.gs` | The read cache in front of the spreadsheet |
| `10_sessions.gs` | Signing in: Google ID tokens and session tokens |
| `11_people.gs` | Admins, newsletter senders, roster tags, who has signed in |
| `20_tracking.gs` | Module events and completions, page views, clicks, time in modules |
| `21_admin_dashboard.gs` | What the admin dashboard loads |
| `30_notifications.gs` | The notification bell |
| `31_email.gs` | Reminder emails and the newsletter mail-out |
| `40_module_responses.gs` | What teachers type inside modules (AI Literacy readiness) |
| `41_surveys.gs` | The goal form, and its list of required questions |
| `42_performance_reviews.gs` | Line managers and the performance-review round trip |
| `90_editor_tools.gs` | Everything you run by hand from the editor |

The numbers only keep the files in a sensible order. Apps Script loads every
file into one shared space, so the order they sit in the editor makes no
difference to how they run.

## Switching from one file to fifteen (once)

Until you deploy, the Hub keeps running the old code, so nobody notices you
doing this. Allow about fifteen minutes.

**Before you start.** These three steps make everything after them undoable.

1. In the spreadsheet: File → Version history → Name current version, and
   call it something like *Before the backend split*. Nothing below should
   touch the data; this is a backstop.
2. In the Apps Script editor, with the old `Code.gs` still in place, choose
   `auditHubData` in the function menu beside **Run**, and press Run. Copy the
   section headed `=== 1. SHEET HEADERS ===` somewhere. It lists every tab
   with its row count; you will compare against it at the end.
3. Deploy → Manage deployments. Note the version number of the active
   deployment (for example *Version 31*). That is your way back.

**The switch.**

4. Open `Code.gs` (the one big file). Select everything in it, delete it,
   and paste in the whole of `00_settings.gs` from this folder. Then rename
   the file to `00_settings` (⋮ next to its name → Rename). Replacing the old
   file, rather than adding new ones beside it, means the old and new code
   are never in the project together.
5. For each of the other fourteen files, in the order in the table: click
   **+** next to Files → Script, type the name without `.gs` (for example
   `01_sheets`), select everything the editor put in the new file, and paste
   the whole file from this folder over it. Save with Ctrl+S (⌘S on a Mac).

   To copy a file from GitHub, open it and use the copy button above the
   code ("Copy raw file"), so nothing at the end is missed.
6. Open `90_editor_tools`, choose `checkHubInstall` in the function menu, and
   press **Run**. Every file must say `ok`.
   - `MISSING` means that file was not created, not saved, or was cut short
     while pasting. Paste it again and re-run.
   - If pressing Run shows *SyntaxError: Identifier '…' has already been
     declared*, a copy of the old code is still in the project. Find the file
     it is in, delete it, and re-run.
7. Deploy → Manage deployments → ✏️ (Edit) on the active deployment →
   Version: **New version** → Deploy.

   Never use **Deploy → New deployment**. That creates a new web address,
   and every page of the Hub would lose its backend. (The address the Hub
   uses is in `auth/gate.js`, and it stays the same through a new version.)

**Check it worked.**

8. Open the web app address (ending `/exec`) in a browser. It should say
   `"files":"all 15 present"`.
9. Open the admin dashboard. It should load as it did before.
10. Run `auditHubData` again and compare its row counts with step 2. They
    should be the same, or higher where staff have used the Hub since.

**If anything is wrong:** Deploy → Manage deployments → ✏️ → Version: choose
the number you noted in step 3 → Deploy. The Hub is back on the old code
within a minute, with nothing in the spreadsheet changed.

If you set up the optional `warmHubCache` trigger, it runs whatever is in the
editor rather than the deployed version. So it may log a failure or two
while you are partway through pasting. That is harmless; it only reads.

## Updating it after that

A change to the backend now touches one or two files, not one huge one.

1. Look at which files in `auth/apps-script/` the change touched (on GitHub,
   the commit's list of files). For each one, open it in the editor, select
   everything, and paste the new version over it. If the change added a file,
   create it with **+** → Script. If it removed one, delete it in the editor.
   When in doubt, paste all fifteen: it takes five minutes and cannot hurt.
2. Run `checkHubInstall` (in `90_editor_tools`).
3. Deploy → Manage deployments → ✏️ → Version: New version → Deploy.

## Things you run by hand

All of these are in `90_editor_tools.gs`. Open that file and they are the only
functions in the menu beside **Run**.

| Function | When |
|---|---|
| `checkHubInstall` | After pasting files in, before deploying. Changes nothing. |
| `authorizeMail` | Once, signed in as the script's owner, so the Hub can send email. |
| `auditHubData` | When the dashboard and the spreadsheet seem to disagree. Reads only. |
| `flushHubCache` | After editing the spreadsheet by hand, to make the Hub re-read it now. |
| `warmHubCache` | Optional, as a time-driven trigger every five minutes. Reads only. |
| `migrateDwellToPerModule` | Once, and only if the `dwell` tab still has one row per chapter. Keeps a backup tab first. |

## For whoever edits the code

- **Top-level code may not read a name from another file.** Apps Script
  loads the files in whatever order they sit in the editor, and someone
  pasting by hand decides that order. So at the top level of a file there are
  only literal constants and function declarations. `ACTIONS` in
  `02_router.gs` is fine, because its handlers only run when a request
  arrives. The simulator loads each file on its own, then all of them in
  reverse and shuffled order, and fails if anything changes.
- **No two files may declare the same name.** Apps Script then refuses to
  load the project at all.
- **Every file ends with `function endOf_<file>_() {}`** and has a line in
  `_hubFiles()` in `02_router.gs`. That is how `checkHubInstall` and `doGet`
  know a file is missing or was cut short. The simulator fails until a new
  file has both. Add the file to the tables above and to the list at the top
  of `00_settings.gs` too.
- **Columns are addressed by position**, using the `*_HEADERS` lists in
  `01_sheets.gs`. Write rows with `_rowFrom(HEADERS, { column: value })`,
  which throws on a misspelt column name, and read them with `_dataRows()`
  and `_colIndex()`. A new column goes at the end of its tab and the end of
  its list.
- **Test before you push:**

  ```
  node tests/apps-script-sim.js
  ```

  For a change meant to alter nothing, such as a rename or a tidy-up, also
  compare with the version before it, strictly:

  ```
  mkdir /tmp/old && git archive HEAD auth/apps-script | tar -x -C /tmp/old
  node tests/apps-script-sim.js --baseline /tmp/old/auth/apps-script --strict
  ```

  That compares every response byte for byte, every cell, every email, the
  cache contents, and every sheet read and write.
