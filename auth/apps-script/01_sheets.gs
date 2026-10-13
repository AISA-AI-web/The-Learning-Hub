/**
 * 01_sheets.gs — every tab the Hub reads or writes.
 *
 * For each tab: its name, its columns in order, and the function that
 * opens it (creating it, with a bold frozen header row, the first time
 * anything asks for it). At the end, two helpers for finding one person's
 * row.
 *
 * The *_HEADERS lists are the map every reader and writer uses: columns are
 * addressed BY POSITION. Insert, delete or reorder a column by hand in the
 * spreadsheet and every read after it silently returns the wrong field, no
 * error, just wrong numbers. A new column goes on the END of a tab and the
 * END of its list. auditHubData() in 90_editor_tools.gs compares each tab's
 * real header row with its list.
 *
 * Renaming a tab here does not rename it in the spreadsheet: the Hub would
 * create a fresh, empty tab under the new name and carry on without the old
 * rows. Rename both, or neither.
 */

// ---------- sessions ----------

const SESSIONS_SHEET         = 'sessions';

const SESSION_HEADERS = [
  'session_token', 'email', 'name', 'created_at_iso',
  'expires_at_iso', 'last_used_iso', 'user_agent'
];

function getSessionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SESSIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SESSIONS_SHEET);
    sheet.appendRow(SESSION_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SESSION_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- admins ----------

const ADMINS_SHEET           = 'admins';   // who can see the admin dashboard

/**
 * The `admins` tab lists who may view the admin dashboard. Column A is
 * the email; add/remove rows to manage access without touching code.
 */
function getAdminsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ADMINS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(ADMINS_SHEET);
    sheet.appendRow(['email', 'name', 'role']);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }
  return sheet;
}

// ---------- roster ----------

const ROSTER_SHEET           = 'roster';   // optional: full expected staff list

const ROSTER_HEADERS = ['email', 'name', 'tags'];  // tags = comma-separated

/* There is no getRosterSheet(): the Hub never creates this tab. Without it,
 * staff who have never signed in simply don't appear as outstanding. */

// ---------- events ----------

const EVENTS_SHEET           = 'events';

const EVENT_HEADERS = [
  'timestamp_iso', 'email', 'name', 'module_id', 'event',
  'progress_pct', 'version', 'user_agent'
];

function getEventsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(EVENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(EVENTS_SHEET);
    sheet.appendRow(EVENT_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, EVENT_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- pageviews and clicks ----------

const PAGEVIEWS_SHEET        = 'pageviews';

const PAGEVIEW_HEADERS = [
  'timestamp_iso', 'email', 'name', 'page_path',
  'page_title', 'referrer', 'user_agent'
];

function getPageviewsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PAGEVIEWS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PAGEVIEWS_SHEET);
    sheet.appendRow(PAGEVIEW_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, PAGEVIEW_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

const CLICKS_SHEET           = 'clicks';

const CLICK_HEADERS = [
  'timestamp_iso', 'email', 'name', 'label',
  'page_path', 'user_agent'
];

function getClicksSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CLICKS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CLICKS_SHEET);
    sheet.appendRow(CLICK_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, CLICK_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- dwell ----------

const DWELL_SHEET            = 'dwell';   // per-person × module × chapter dwell totals

/* Dwell rows hold per-module engagement summaries — one row per person
 * per module — rather than one row per chapter. The client sends the
 * full per-chapter snapshot each flush; we aggregate to total_seconds
 * (sum) + chapters_seen (count of chapters with >0s) + avg_secs_per_
 * chapter (stored so it's readable directly in the sheet). Upsert by
 * (email × module_id) so the row count is bounded at staff × modules
 * (~1.4k school-wide steady-state, vs. ~11k for per-chapter). */
const DWELL_HEADERS = [
  'updated_at_iso', 'first_seen_iso', 'email', 'name', 'module_id',
  'total_seconds', 'chapters_seen', 'avg_secs_per_chapter', 'user_agent'
];
/* Marker present only in the old per-chapter layout. Used to detect an
 * un-migrated sheet so we can refuse writes/reads with a clear hint. */
const DWELL_LEGACY_MARKER = 'chapter_title';

function getDwellSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DWELL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(DWELL_SHEET);
    sheet.appendRow(DWELL_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, DWELL_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- notifications and notification_reads ----------

const NOTIFS_SHEET           = 'notifications';

const NOTIF_HEADERS = [
  'id', 'created_at_iso', 'author_email', 'author_name',
  'title', 'body',
  'target_tags',    // comma-separated; empty = no tag filter
  'target_emails',  // comma-separated; empty = no email filter
  'active'          // false to soft-delete
];

function getNotifsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NOTIFS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOTIFS_SHEET);
    sheet.appendRow(NOTIF_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, NOTIF_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

const NOTIF_READS_SHEET      = 'notification_reads';

const NOTIF_READ_HEADERS = [
  'notification_id', 'email', 'read_at_iso'
];

function getNotifReadsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(NOTIF_READS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(NOTIF_READS_SHEET);
    sheet.appendRow(NOTIF_READ_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, NOTIF_READ_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- module_responses ----------

const MODULE_RESPONSES_SHEET = 'module_responses';  // free-text answers inside a training module

/* Free-text answers captured inside a training module.
 *
 * One row per (email × module_id) — the whole module's answers live in a
 * single JSON blob, merged segment by segment as the teacher types. That
 * keeps the row count bounded at staff × modules and makes resume a
 * single read.
 *
 * This is PERSONAL DATA under UAE Federal Decree-Law No. 45 of 2021 —
 * named staff writing about their own uncertainty. Reads are admin-only
 * (`admin_module_responses`); a teacher can only ever read back their own
 * row. Do not widen that without a reason.
 *
 *   segments_done : comma-separated segment ids that have been saved
 *   data_json     : { <segment_id>: { ...answers, _saved_at } }
 *   flagged       : TRUE once the teacher asks for something they need
 *                   before go-live, so the admin sheet can be filtered
 */
const MODULE_RESPONSE_HEADERS = [
  'first_saved_iso', 'updated_at_iso', 'email', 'name', 'module_id',
  'segments_done', 'data_json', 'flagged', 'completed_at_iso', 'user_agent'
];

function getModuleResponsesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(MODULE_RESPONSES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MODULE_RESPONSES_SHEET);
    sheet.appendRow(MODULE_RESPONSE_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, MODULE_RESPONSE_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- survey_responses ----------

/* ---------------------------------------------------------------------
 * Surveys — structured, required-entry forms filled in on the Hub.
 *
 * Built for the Secondary Teacher Personal Goal form, which replaced a
 * Google Form that could not enforce what the principal needed. Kept
 * generic (survey_id + a JSON blob + a spec) so the next form is a spec
 * entry and a page, not another backend.
 *
 * One row per (email x survey_id) — a person has ONE goal for the year
 * and can come back and edit it, so the row is upserted rather than
 * appended. Drafts and submissions live in the same row, told apart by
 * `status`; that way a half-finished form survives a closed tab without
 * showing up in the principal's list as if it were finished.
 *
 * PERSONAL DATA under UAE Federal Decree-Law No. 45 of 2021 — named
 * staff writing about what they want to get better at, which feeds an
 * appraisal conversation. Reads are admin-gated; a teacher can only
 * ever read back their own row. Same rule as module_responses: don't
 * widen it, and never mirror this sheet into the repo — the repo is
 * public and the sign-in gate is client-side only.
 * ------------------------------------------------------------------- */
const SURVEYS_SHEET = 'survey_responses';

/*   status        : 'draft' | 'submitted'
 *   data_json     : { <field_key>: value } — flat, one level, so the
 *                   admin CSV export is a straight column-per-question
 *   submitted_at  : set the first time it passes validation; kept on
 *                   later edits so "when did they first commit to this"
 *                   survives a reword
 *   revision      : how many times they have submitted it */
const SURVEY_HEADERS = [
  'first_saved_iso', 'updated_at_iso', 'submitted_at_iso',
  'email', 'name', 'survey_id', 'status', 'revision',
  'data_json', 'user_agent'
];

/* The surveys workbook: a separate spreadsheet when SURVEYS_SPREADSHEET_ID
 * is set, otherwise the one this script is bound to. Falls back to the
 * bound spreadsheet if the ID is wrong rather than throwing, so a typo
 * loses the separation but never loses a teacher's goal. */
function _surveysSpreadsheet() {
  const id = String(SURVEYS_SPREADSHEET_ID || '').trim();
  if (!id) return SpreadsheetApp.getActiveSpreadsheet();
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function getSurveysSheet() {
  const ss = _surveysSpreadsheet();
  let sheet = ss.getSheetByName(SURVEYS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SURVEYS_SHEET);
    sheet.appendRow(SURVEY_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, SURVEY_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- line_managers ----------

const LINE_MANAGERS_SHEET    = 'line_managers';   // dropdown for "send to" on eval forms

/* Line managers — the "send to" dropdown on performance-review forms.
 * Managed manually by admins in the spreadsheet. Intentionally separate
 * from the `admins` sheet because a TA's line manager is usually their
 * classroom teacher, not Hub SLT. */
const LINE_MANAGER_HEADERS = ['email', 'name', 'division'];

function getLineManagersSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LINE_MANAGERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(LINE_MANAGERS_SHEET);
    sheet.appendRow(LINE_MANAGER_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, LINE_MANAGER_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- form_submissions ----------

const FORM_SUBMISSIONS_SHEET = 'form_submissions'; // round-trip eval-form state

/* Performance-review form submissions — the round-trip state.
 *
 *   created_at  : when staff first sent it
 *   updated_at  : last write (either side)
 *   status      : 'pending_manager' | 'complete'
 *   form_id     : e.g. 'teacher-assistant-2025-26' (from the form config)
 *   form_url    : page the form lives on (so notifications can deep-link)
 *   form_title  : human-readable title for notifications
 *   staff_*     : who initiated it
 *   manager_*   : who they sent it to
 *   data_json   : full form state {fields...}; both sides edit the same blob
 *                 (trust-based, no field-level ACLs). Updated by whoever
 *                 saves; original staff submission preserved in
 *                 staff_snapshot_json for recovery if a manager wipes a field.
 *   completed_at: when the manager hit "send back to staff"
 */
const FORM_SUBMISSION_HEADERS = [
  'submission_id', 'created_at_iso', 'updated_at_iso', 'status',
  'form_id', 'form_url', 'form_title',
  'staff_email', 'staff_name',
  'manager_email', 'manager_name',
  'data_json', 'staff_snapshot_json',
  'completed_at_iso'
];

function getFormSubmissionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(FORM_SUBMISSIONS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(FORM_SUBMISSIONS_SHEET);
    sheet.appendRow(FORM_SUBMISSION_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, FORM_SUBMISSION_HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

// ---------- Finding one person's row ----------

/* Row (1-based, header included) whose `keyA` column is `a` (compared
 * trimmed and lower-cased — it is an email) and whose `keyB` column is `b`
 * (trimmed), or 0. One read across both columns rather than one each. */
function _findRowByPair(sheet, headers, keyA, keyB, a, b) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const colA = headers.indexOf(keyA), colB = headers.indexOf(keyB);
  const from = Math.min(colA, colB);
  const width = Math.abs(colA - colB) + 1;
  const vals = sheet.getRange(2, from + 1, last - 1, width).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][colA - from]).trim().toLowerCase() === a &&
        String(vals[i][colB - from]).trim() === b) {
      return i + 2;
    }
  }
  return 0;
}

/* This person's whole row, via the remembered row number when it still
 * checks out, else by scanning. Returns { row, values } or { row: 0 }. */
function _findOwnRow(sheet, headers, keyA, keyB, a, b, hintKey) {
  const hinted = _rowHint(hintKey);
  if (hinted) {
    try {
      const v = sheet.getRange(hinted, 1, 1, headers.length).getValues()[0];
      if (String(v[headers.indexOf(keyA)]).trim().toLowerCase() === a &&
          String(v[headers.indexOf(keyB)]).trim() === b) {
        return { row: hinted, values: v };
      }
    } catch (e) { /* past the end of the sheet: scan */ }
  }
  const row = _findRowByPair(sheet, headers, keyA, keyB, a, b);
  if (!row) return { row: 0 };
  _setRowHint(hintKey, row);
  return { row: row, values: sheet.getRange(row, 1, 1, headers.length).getValues()[0] };
}

// End of 01_sheets.gs. checkHubInstall() looks for the function below to
// confirm this whole file was pasted in: keep it the last thing here.
function endOf_01_sheets_() {}
