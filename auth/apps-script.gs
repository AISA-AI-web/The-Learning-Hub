/**
 * AISA Learning Hub — Apps Script backend (v2: long-lived sessions).
 *
 * Deploy as a Web App from inside a Google Sheet. On first deploy:
 *   1. Extensions → Apps Script → paste this file into Code.gs.
 *   2. Save, then Deploy → New deployment → Web app.
 *        Execute as: Me
 *        Who has access: Anyone
 * On subsequent updates, redeploy via Deploy → Manage deployments
 * → pencil icon → Version: New version → Deploy. The URL stays the
 * same so the frontend doesn't need to change.
 *
 * Auth model
 * ----------
 * Anyone on the internet can POST to this URL, but every action that
 * touches the sheet requires either:
 *   - a valid Google ID token issued to our OAuth client with
 *     hd=aisa.sch.ae and email_verified, OR
 *   - a session_token that we previously minted in exchange for a
 *     valid Google ID token.
 *
 * Session tokens are random opaque strings stored in the `sessions`
 * tab, valid for SESSION_DURATION_DAYS days. After initial Google
 * sign-in, the frontend uses session_token for every request, so
 * teachers stay signed in across browser restarts and devices
 * without ever re-entering Google's hourly token cycle.
 */

const OAUTH_CLIENT_ID        = '719019551782-h9pdg57s6oq4jpo884a53o0d1pgel1u6.apps.googleusercontent.com';
const ALLOWED_DOMAIN         = 'aisa.sch.ae';
const TIMEZONE               = 'Asia/Dubai';  // Abu Dhabi (GST, UTC+04:00, no DST)
const EVENTS_SHEET           = 'events';
const SESSIONS_SHEET         = 'sessions';
const PAGEVIEWS_SHEET        = 'pageviews';
const CLICKS_SHEET           = 'clicks';
const ADMINS_SHEET           = 'admins';   // who can see the admin dashboard
const ROSTER_SHEET           = 'roster';   // optional: full expected staff list
const NOTIFS_SHEET           = 'notifications';
const NOTIF_READS_SHEET      = 'notification_reads';
const DWELL_SHEET            = 'dwell';   // per-person × module × chapter dwell totals
const LINE_MANAGERS_SHEET    = 'line_managers';   // dropdown for "send to" on eval forms
const FORM_SUBMISSIONS_SHEET = 'form_submissions'; // round-trip eval-form state
const SESSION_DURATION_DAYS  = 365;

const NOTIF_HEADERS = [
  'id', 'created_at_iso', 'author_email', 'author_name',
  'title', 'body',
  'target_tags',    // comma-separated; empty = no tag filter
  'target_emails',  // comma-separated; empty = no email filter
  'active'          // false to soft-delete
];
const NOTIF_READ_HEADERS = [
  'notification_id', 'email', 'read_at_iso'
];
const ROSTER_HEADERS = ['email', 'name', 'tags'];  // tags = comma-separated

const EVENT_HEADERS = [
  'timestamp_iso', 'email', 'name', 'module_id', 'event',
  'progress_pct', 'version', 'user_agent'
];

const SESSION_HEADERS = [
  'session_token', 'email', 'name', 'created_at_iso',
  'expires_at_iso', 'last_used_iso', 'user_agent'
];

const PAGEVIEW_HEADERS = [
  'timestamp_iso', 'email', 'name', 'page_path',
  'page_title', 'referrer', 'user_agent'
];

const CLICK_HEADERS = [
  'timestamp_iso', 'email', 'name', 'label',
  'page_path', 'user_agent'
];

/* Line managers — the "send to" dropdown on performance-review forms.
 * Managed manually by admins in the spreadsheet. Intentionally separate
 * from the `admins` sheet because a TA's line manager is usually their
 * classroom teacher, not Hub SLT. */
const LINE_MANAGER_HEADERS = ['email', 'name', 'division'];

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

// ---------- Time helpers ----------
//
// All sheet timestamps are stored as ISO 8601 strings in Abu Dhabi local
// time with the explicit "+04:00" offset (e.g. 2026-06-17T14:58:00+04:00).
// This is still valid ISO 8601 — `new Date(str)` parses it to the correct
// UTC instant — so existing session-expiry checks and any client-side
// sorting keep working. Existing rows already written in UTC ("...Z") are
// left untouched.
function isoLocal(date) {
  return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function nowIsoLocal() {
  return isoLocal(new Date());
}

// ---------- HTTP entry points ----------

function doGet(e) {
  return jsonOut({
    ok: true,
    service: 'aisa-learning-hub',
    version: 'v2',
    hint: 'POST JSON with an action plus either id_token or session_token.'
  });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action;

    // create_session is the only action that takes an ID token —
    // it exchanges Google identity for a long-lived session token.
    if (action === 'create_session') {
      const claims = verifyIdToken(body.id_token);
      if (!claims) return jsonOut({ ok: false, error: 'invalid_token' });
      const session = createSession(claims, body.user_agent);
      return jsonOut({
        ok: true,
        session_token: session.token,
        expires_at:    session.expiresAt,
        email:         claims.email,
        name:          claims.name || ''
      });
    }

    // All other actions require a session token.
    const claims = verifySessionToken(body.session_token);
    if (!claims) return jsonOut({ ok: false, error: 'invalid_session' });

    switch (action) {
      case 'record_event':
        return jsonOut(recordEvent(claims, body));
      case 'get_completions':
        return jsonOut({ ok: true, completions: getCompletionsFor(claims.email) });
      case 'record_pageview':
        return jsonOut(recordPageview(claims, body));
      case 'record_click':
        return jsonOut(recordClick(claims, body));
      case 'record_dwell':
        return jsonOut(recordDwell(claims, body));
      case 'admin_dwell':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        return jsonOut(adminDwell());

      // ----- Performance-review form workflow -----
      case 'get_line_managers':
        return jsonOut(getLineManagers());
      case 'submit_form':
        return jsonOut(submitForm(claims, body));
      case 'get_form_submission':
        return jsonOut(getFormSubmission(claims, body));
      case 'complete_form':
        return jsonOut(completeForm(claims, body));
      case 'list_my_submissions':
        return jsonOut(listMySubmissions(claims));
      case 'whoami':
        return jsonOut({
          ok: true,
          email:    claims.email,
          name:     claims.name || '',
          hd:       ALLOWED_DOMAIN,
          is_admin: isAdmin(claims.email)
        });
      case 'admin_overview':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        return jsonOut(adminOverview());

      // ----- Notifications -----
      case 'get_notifications':
        return jsonOut(listNotifications(claims.email));
      case 'mark_notification_read':
        return jsonOut(markNotificationRead(claims, body));
      case 'mark_all_notifications_read':
        return jsonOut(markAllNotificationsRead(claims));
      case 'post_notification':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        return jsonOut(postNotification(claims, body));
      case 'delete_notification':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        return jsonOut(deleteNotification(body));
      case 'admin_notification_stats':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        return jsonOut(adminNotificationStats());
      case 'admin_list_tags':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        return jsonOut(adminListTags());

      case 'sign_out':
        revokeSession(body.session_token);
        return jsonOut({ ok: true });
      default:
        return jsonOut({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// ---------- Google ID token verification ----------

function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;

  const claims = JSON.parse(resp.getContentText());
  if (claims.aud !== OAUTH_CLIENT_ID) return null;
  if (claims.hd !== ALLOWED_DOMAIN) return null;
  if (String(claims.email_verified) !== 'true') return null;
  if (Number(claims.exp) * 1000 < Date.now()) return null;
  if (!claims.email) return null;
  return claims;
}

// ---------- Session tokens ----------

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

/**
 * Generates a 256-bit random opaque token, base64url-encoded.
 * Apps Script's Math.random is good enough for non-crypto-critical
 * use — for a school portal of this scale, brute-forcing a 32-byte
 * token is infeasible.
 */
function generateSessionToken() {
  const bytes = [];
  for (let i = 0; i < 32; i++) bytes.push(Math.floor(Math.random() * 256));
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function createSession(claims, userAgent) {
  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);
  const nowIso = isoLocal(now);
  const expIso = isoLocal(expiresAt);

  getSessionsSheet().appendRow([
    token,
    claims.email,
    claims.name || '',
    nowIso,
    expIso,
    nowIso,
    String(userAgent || '').slice(0, 300)
  ]);

  return { token: token, expiresAt: expIso };
}

/**
 * Looks the token up in the sessions sheet, checks expiry, and
 * returns the associated claims (email + name). Best-effort updates
 * last_used_iso on each call.
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const sheet = getSessionsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return null;

  const values = sheet.getRange(2, 1, last - 1, SESSION_HEADERS.length).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row[0] !== token) continue;

    const expiresAtMs = new Date(row[4]).getTime();
    if (!expiresAtMs || Date.now() > expiresAtMs) return null;

    try { sheet.getRange(i + 2, 6).setValue(nowIsoLocal()); } catch (_) {}

    return { email: row[1], name: row[2] };
  }
  return null;
}

function revokeSession(token) {
  if (!token) return;
  const sheet = getSessionsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const tokens = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0] === token) {
      sheet.deleteRow(i + 2);
      return;
    }
  }
}

// ---------- Event recording ----------

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

function recordEvent(claims, body) {
  const moduleId    = String(body.module_id || '').slice(0, 80);
  const event       = String(body.event     || '').slice(0, 40);
  const progressPct = Math.max(0, Math.min(100, Number(body.progress_pct) || 0));
  const version     = String(body.version   || 'v1').slice(0, 20);
  const userAgent   = String(body.user_agent || '').slice(0, 300);

  if (!moduleId) return { ok: false, error: 'missing_module_id' };
  if (!event)    return { ok: false, error: 'missing_event' };

  getEventsSheet().appendRow([
    nowIsoLocal(),
    claims.email,
    claims.name || '',
    moduleId,
    event,
    progressPct,
    version,
    userAgent
  ]);
  return { ok: true };
}

// ---------- Page views & tagged clicks ----------

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

function recordPageview(claims, body) {
  const pagePath  = String(body.page_path  || '').slice(0, 300);
  const pageTitle = String(body.page_title || '').slice(0, 200);
  const referrer  = String(body.referrer   || '').slice(0, 300);
  const userAgent = String(body.user_agent || '').slice(0, 300);

  if (!pagePath) return { ok: false, error: 'missing_page_path' };

  getPageviewsSheet().appendRow([
    nowIsoLocal(),
    claims.email,
    claims.name || '',
    pagePath,
    pageTitle,
    referrer,
    userAgent
  ]);
  return { ok: true };
}

function recordClick(claims, body) {
  const label     = String(body.label     || '').slice(0, 200);
  const pagePath  = String(body.page_path || '').slice(0, 300);
  const userAgent = String(body.user_agent || '').slice(0, 300);

  if (!label) return { ok: false, error: 'missing_label' };

  getClicksSheet().appendRow([
    nowIsoLocal(),
    claims.email,
    claims.name || '',
    label,
    pagePath,
    userAgent
  ]);
  return { ok: true };
}

// ---------- Dwell (per-chapter time on task) ----------

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

/* True if the existing sheet still has the old per-chapter headers; we
 * refuse to read/write until migrateDwellToPerModule() runs once. */
function dwellSheetIsLegacy(sheet) {
  if (sheet.getLastRow() < 1) return false;
  const headers = sheet.getRange(1, 1, 1, Math.min(20, sheet.getLastColumn())).getValues()[0];
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').trim() === DWELL_LEGACY_MARKER) return true;
  }
  return false;
}

/* Upsert one row per (email × module). The client sends absolute
 * per-chapter totals; we sum them into total_seconds, count chapters
 * with >0s into chapters_seen, derive avg_secs_per_chapter. Sending
 * the full chapter snapshot every flush is what makes this idempotent
 * — last write wins and races don't inflate the numbers. */
function recordDwell(claims, body) {
  const moduleId  = String(body.module_id || '').slice(0, 80);
  const userAgent = String(body.user_agent || '').slice(0, 300);
  if (!moduleId) return { ok: false, error: 'missing_module_id' };

  let chapters = body.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) {
    return { ok: false, error: 'missing_chapters' };
  }
  /* Trim defensively, then aggregate to a single per-module summary. */
  let totalSeconds = 0;
  let chaptersSeen = 0;
  for (let i = 0; i < Math.min(chapters.length, 200); i++) {
    const c = chapters[i] || {};
    const secs = Math.max(0, Math.min(Number(c.seconds || 0) | 0, 24 * 60 * 60));
    if (secs > 0) { totalSeconds += secs; chaptersSeen++; }
  }
  if (chaptersSeen === 0) return { ok: true, written: 0 };

  const sheet = getDwellSheet();
  if (dwellSheetIsLegacy(sheet)) {
    return {
      ok: false,
      error: 'dwell_sheet_needs_migration',
      hint: 'Run migrateDwellToPerModule() once from the Apps Script editor.'
    };
  }
  const idx = {
    updated:    DWELL_HEADERS.indexOf('updated_at_iso'),
    first:      DWELL_HEADERS.indexOf('first_seen_iso'),
    email:      DWELL_HEADERS.indexOf('email'),
    name:       DWELL_HEADERS.indexOf('name'),
    module:     DWELL_HEADERS.indexOf('module_id'),
    seconds:    DWELL_HEADERS.indexOf('total_seconds'),
    seen:       DWELL_HEADERS.indexOf('chapters_seen'),
    avg:        DWELL_HEADERS.indexOf('avg_secs_per_chapter'),
    ua:         DWELL_HEADERS.indexOf('user_agent')
  };
  const emailLower = String(claims.email || '').toLowerCase();
  const name       = claims.name || '';
  const now        = nowIsoLocal();
  const avg        = Math.round((totalSeconds / chaptersSeen) * 10) / 10;

  /* Locate the existing (email × module) row, if any. Scanning the whole
   * sheet is cheap at this scale (steady-state ~1.4k rows). */
  const lastRow = sheet.getLastRow();
  let existing = [];
  if (lastRow >= 2) {
    existing = sheet.getRange(2, 1, lastRow - 1, DWELL_HEADERS.length).getValues();
  }
  let foundRow = 0, firstSeen = now;
  for (let i = 0; i < existing.length; i++) {
    const r = existing[i];
    if (String(r[idx.email] || '').toLowerCase() !== emailLower) continue;
    if (String(r[idx.module] || '') !== moduleId) continue;
    foundRow = i + 2;
    firstSeen = String(r[idx.first] || now);
    break;
  }

  const rowValues = [
    now, firstSeen, emailLower, name, moduleId,
    totalSeconds, chaptersSeen, avg, userAgent
  ];
  if (foundRow) {
    sheet.getRange(foundRow, 1, 1, DWELL_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
  return { ok: true, written: 1, total_seconds: totalSeconds, chapters_seen: chaptersSeen, avg_secs_per_chapter: avg };
}

/* Admin view: flat per-teacher × per-module rows. The dashboard renders
 * a sortable table directly from this — no client-side pivot needed. */
function adminDwell() {
  const sheet = getDwellSheet();
  if (dwellSheetIsLegacy(sheet)) {
    return {
      ok: false,
      error: 'dwell_sheet_needs_migration',
      hint: 'Run migrateDwellToPerModule() once from the Apps Script editor.'
    };
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, generated_at: nowIsoLocal(), rows: [] };
  }
  const values = sheet.getRange(2, 1, lastRow - 1, DWELL_HEADERS.length).getValues();
  const idx = {
    updated:    DWELL_HEADERS.indexOf('updated_at_iso'),
    first:      DWELL_HEADERS.indexOf('first_seen_iso'),
    email:      DWELL_HEADERS.indexOf('email'),
    name:       DWELL_HEADERS.indexOf('name'),
    module:     DWELL_HEADERS.indexOf('module_id'),
    seconds:    DWELL_HEADERS.indexOf('total_seconds'),
    seen:       DWELL_HEADERS.indexOf('chapters_seen'),
    avg:        DWELL_HEADERS.indexOf('avg_secs_per_chapter')
  };
  const rows = values.map(function (r) {
    return {
      email:                 String(r[idx.email] || '').toLowerCase(),
      name:                  String(r[idx.name] || ''),
      module_id:             String(r[idx.module] || ''),
      total_seconds:         Number(r[idx.seconds] || 0) | 0,
      chapters_seen:         Number(r[idx.seen] || 0) | 0,
      avg_secs_per_chapter:  Number(r[idx.avg] || 0),
      first_seen:            String(r[idx.first] || ''),
      last_seen:             String(r[idx.updated] || '')
    };
  });
  return { ok: true, generated_at: nowIsoLocal(), rows: rows };
}

/* ----- One-time migration: per-chapter rows → per-module rows. -----
 *
 * Run this ONCE from the Apps Script editor after deploying the new
 * record_dwell/admin_dwell code. It:
 *   1. Reads every existing per-chapter row from the dwell sheet.
 *   2. Groups by (email × module_id), summing seconds and counting
 *      chapters with >0s.
 *   3. Replaces the sheet contents with the new per-module headers
 *      and one aggregated row per group.
 *   4. Writes a backup snapshot to a `dwell_legacy_backup_YYYYMMDD`
 *      sheet so nothing is unrecoverable.
 *
 * Safe to re-run: if the sheet already has the new layout, it no-ops.
 */
function migrateDwellToPerModule() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DWELL_SHEET);
  if (!sheet) {
    Logger.log('No dwell sheet found — nothing to migrate.');
    return { ok: true, migrated: 0, note: 'no_sheet' };
  }
  if (!dwellSheetIsLegacy(sheet)) {
    Logger.log('Dwell sheet already on per-module layout — nothing to do.');
    return { ok: true, migrated: 0, note: 'already_migrated' };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const old = {
    updated:  headers.indexOf('updated_at_iso'),
    first:    headers.indexOf('first_seen_iso'),
    email:    headers.indexOf('email'),
    name:     headers.indexOf('name'),
    module:   headers.indexOf('module_id'),
    chapter:  headers.indexOf('chapter'),
    seconds:  headers.indexOf('total_seconds')
  };

  /* Snapshot the old contents to a backup tab before mutating anything. */
  const stamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyyMMdd_HHmmss');
  const backupName = 'dwell_legacy_backup_' + stamp;
  if (lastRow >= 1) {
    const backup = ss.insertSheet(backupName);
    sheet.getRange(1, 1, lastRow, lastCol).copyTo(backup.getRange(1, 1));
  }

  /* Aggregate. */
  const groups = {};   // emailLower|module -> aggregate
  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const emailLower = String(r[old.email] || '').toLowerCase();
      const moduleId   = String(r[old.module] || '');
      const seconds    = Number(r[old.seconds] || 0) | 0;
      if (!emailLower || !moduleId) continue;
      const key = emailLower + '|' + moduleId;
      if (!groups[key]) {
        groups[key] = {
          updated:  String(r[old.updated] || ''),
          first:    String(r[old.first] || ''),
          email:    emailLower,
          name:     String(r[old.name] || ''),
          module:   moduleId,
          seconds:  0,
          chapters: 0
        };
      }
      const g = groups[key];
      if (seconds > 0) { g.seconds += seconds; g.chapters++; }
      /* Earliest first_seen, latest updated_at. */
      const u = String(r[old.updated] || '');
      const f = String(r[old.first] || '');
      if (u && (!g.updated || u > g.updated)) g.updated = u;
      if (f && (!g.first || f < g.first))     g.first   = f;
      if (!g.name && r[old.name]) g.name = String(r[old.name] || '');
    }
  }

  /* Rewrite the sheet with the new layout. */
  sheet.clear();
  sheet.appendRow(DWELL_HEADERS);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, DWELL_HEADERS.length).setFontWeight('bold');

  let written = 0;
  Object.keys(groups).forEach(function (k) {
    const g = groups[k];
    if (g.chapters === 0) return;
    const avg = Math.round((g.seconds / g.chapters) * 10) / 10;
    sheet.appendRow([
      g.updated || nowIsoLocal(),
      g.first   || g.updated || nowIsoLocal(),
      g.email, g.name, g.module,
      g.seconds, g.chapters, avg,
      ''   /* user_agent not carried forward — only the latest write knows it */
    ]);
    written++;
  });

  Logger.log('Migrated ' + written + ' per-module row(s). Backup: ' + backupName);
  return { ok: true, migrated: written, backup_sheet: backupName };
}

// ---------- Line managers ----------

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

/* Read-only listing for the form "Send to line manager" dropdown.
 * Empty list is fine; the UI degrades to a free-text email field. */
function getLineManagers() {
  const sheet = getLineManagersSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, managers: [] };
  const rows = sheet.getRange(2, 1, lastRow - 1, LINE_MANAGER_HEADERS.length).getValues();
  const managers = rows.map(function (r) {
    return {
      email:    String(r[0] || '').trim().toLowerCase(),
      name:     String(r[1] || '').trim(),
      division: String(r[2] || '').trim()
    };
  }).filter(function (m) { return m.email; });
  managers.sort(function (a, b) {
    if (a.division !== b.division) return a.division < b.division ? -1 : 1;
    return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
  });
  return { ok: true, managers: managers };
}

// ---------- Form submissions (round-trip eval workflow) ----------

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

/* System-fired notification — used when the form workflow needs to
 * notify the manager (form submitted) or the staff member (form
 * returned). The existing user-driven postNotification is admin-only;
 * this internal helper bypasses that gate but is only called from
 * controlled code paths (submitForm / completeForm). */
function _fireSystemNotification(authorEmail, authorName, title, body, targetEmails) {
  if (!title && !body) return null;
  const id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const row = new Array(NOTIF_HEADERS.length).fill('');
  row[NOTIF_HEADERS.indexOf('id')]             = id;
  row[NOTIF_HEADERS.indexOf('created_at_iso')] = nowIsoLocal();
  row[NOTIF_HEADERS.indexOf('author_email')]   = authorEmail || '';
  row[NOTIF_HEADERS.indexOf('author_name')]    = authorName || '';
  row[NOTIF_HEADERS.indexOf('title')]          = String(title || '').slice(0, 200);
  row[NOTIF_HEADERS.indexOf('body')]           = String(body  || '').slice(0, 4000);
  row[NOTIF_HEADERS.indexOf('target_tags')]    = '';
  row[NOTIF_HEADERS.indexOf('target_emails')]  = (targetEmails || []).join(',');
  row[NOTIF_HEADERS.indexOf('active')]         = true;
  getNotifsSheet().appendRow(row);
  return id;
}

/* Read a submission row by id and return an indexed dict. Returns null
 * if not found. Doesn't enforce access — callers must check that the
 * signed-in user is staff or manager on the submission. */
function _findSubmissionRow(submissionId) {
  if (!submissionId) return null;
  const sheet = getFormSubmissionsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, FORM_SUBMISSION_HEADERS.length).getValues();
  const idIdx = FORM_SUBMISSION_HEADERS.indexOf('submission_id');
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][idIdx]) === submissionId) {
      return { rowIndex: i + 2, values: values[i] };
    }
  }
  return null;
}

function _submissionToObject(row) {
  const o = {};
  FORM_SUBMISSION_HEADERS.forEach(function (h, i) { o[h] = row[i]; });
  /* Parse the JSON blobs so callers don't have to. */
  try { o.data = o.data_json ? JSON.parse(o.data_json) : {}; } catch (e) { o.data = {}; }
  try { o.staff_snapshot = o.staff_snapshot_json ? JSON.parse(o.staff_snapshot_json) : {}; }
  catch (e) { o.staff_snapshot = {}; }
  /* Don't ship the raw JSON strings to the client. */
  delete o.data_json;
  delete o.staff_snapshot_json;
  return o;
}

/* Stage 1: staff submits the form to a chosen line manager. Creates a
 * new submission, snapshots the staff's data, fires a notification to
 * the manager. Returns { ok, submission_id }. */
function submitForm(claims, body) {
  const formId      = String(body.form_id || '').slice(0, 80).trim();
  const formUrl     = String(body.form_url || '').slice(0, 300).trim();
  const formTitle   = String(body.form_title || '').slice(0, 200).trim();
  const managerEmail = String(body.manager_email || '').trim().toLowerCase();
  const managerName  = String(body.manager_name || '').slice(0, 200).trim();
  if (!formId)        return { ok: false, error: 'missing_form_id' };
  if (!managerEmail)  return { ok: false, error: 'missing_manager_email' };
  /* Force the manager to share the school domain — same gate the auth
   * uses, so we never notify a random outside address. */
  if (managerEmail.indexOf('@' + ALLOWED_DOMAIN) === -1) {
    return { ok: false, error: 'manager_not_in_domain' };
  }
  const data = (body.data && typeof body.data === 'object') ? body.data : {};
  const dataJson = JSON.stringify(data).slice(0, 90000);

  const id  = 's_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const now = nowIsoLocal();
  const row = new Array(FORM_SUBMISSION_HEADERS.length).fill('');
  function set(h, v) { row[FORM_SUBMISSION_HEADERS.indexOf(h)] = v; }
  set('submission_id',        id);
  set('created_at_iso',       now);
  set('updated_at_iso',       now);
  set('status',               'pending_manager');
  set('form_id',              formId);
  set('form_url',             formUrl);
  set('form_title',           formTitle);
  set('staff_email',          String(claims.email || '').toLowerCase());
  set('staff_name',           claims.name || '');
  set('manager_email',        managerEmail);
  set('manager_name',         managerName);
  set('data_json',            dataJson);
  set('staff_snapshot_json',  dataJson);   // preserve original
  getFormSubmissionsSheet().appendRow(row);

  /* Notify the manager. Including the deep-link as plain text — the
   * existing notification renderer linkifies URLs. */
  const deepLink = formUrl ? (formUrl + (formUrl.indexOf('?') === -1 ? '?' : '&') + 'submission=' + id) : '';
  _fireSystemNotification(
    claims.email,
    claims.name || '',
    'Performance review to complete — ' + (formTitle || 'evaluation form'),
    'You have a performance review to complete for ' + (claims.name || claims.email) + '.\n\n' +
      'Open the form (their answers will be pre-filled), add your evaluation, then click "Send back to staff" at the bottom.\n\n' +
      (deepLink ? 'Form: ' + deepLink : ''),
    [managerEmail]
  );

  return { ok: true, submission_id: id, status: 'pending_manager' };
}

/* Read access: staff OR manager (case-insensitive on email). Anyone
 * else gets not_authorized so submission IDs can be shared freely as
 * links without leaking content. */
function getFormSubmission(claims, body) {
  const submissionId = String(body.submission_id || '').trim();
  if (!submissionId) return { ok: false, error: 'missing_submission_id' };
  const found = _findSubmissionRow(submissionId);
  if (!found) return { ok: false, error: 'not_found' };
  const o = _submissionToObject(found.values);
  const me = String(claims.email || '').toLowerCase();
  if (me !== String(o.staff_email || '').toLowerCase() &&
      me !== String(o.manager_email || '').toLowerCase()) {
    return { ok: false, error: 'not_authorized' };
  }
  return { ok: true, submission: o };
}

/* Stage 2: manager completes the form and sends it back to staff.
 * Updates the row, marks status complete, fires a notification to
 * the original staff member. */
function completeForm(claims, body) {
  const submissionId = String(body.submission_id || '').trim();
  if (!submissionId) return { ok: false, error: 'missing_submission_id' };
  const found = _findSubmissionRow(submissionId);
  if (!found) return { ok: false, error: 'not_found' };

  const sheet = getFormSubmissionsSheet();
  const idx = {};
  FORM_SUBMISSION_HEADERS.forEach(function (h, i) { idx[h] = i; });
  const row = found.values.slice();
  const me = String(claims.email || '').toLowerCase();
  if (me !== String(row[idx.manager_email] || '').toLowerCase()) {
    return { ok: false, error: 'not_manager' };
  }

  const data = (body.data && typeof body.data === 'object') ? body.data : {};
  const dataJson = JSON.stringify(data).slice(0, 90000);
  const now = nowIsoLocal();
  row[idx.updated_at_iso]   = now;
  row[idx.completed_at_iso] = now;
  row[idx.status]           = 'complete';
  row[idx.data_json]        = dataJson;
  /* Refresh manager_name in case it was empty at creation. */
  if (claims.name && !row[idx.manager_name]) row[idx.manager_name] = claims.name;
  sheet.getRange(found.rowIndex, 1, 1, FORM_SUBMISSION_HEADERS.length).setValues([row]);

  /* Notify staff that the manager's portion is done. */
  const formUrl = String(row[idx.form_url] || '');
  const formTitle = String(row[idx.form_title] || 'evaluation form');
  const staffEmail = String(row[idx.staff_email] || '').toLowerCase();
  const deepLink = formUrl ? (formUrl + (formUrl.indexOf('?') === -1 ? '?' : '&') + 'submission=' + submissionId) : '';
  _fireSystemNotification(
    claims.email,
    claims.name || '',
    'Performance review completed — ' + formTitle,
    (claims.name || claims.email) + ' has completed your performance review.\n\n' +
      'Open the form to view the manager\'s evaluation and download a final PDF for your records.\n\n' +
      (deepLink ? 'Form: ' + deepLink : ''),
    [staffEmail]
  );

  return { ok: true, status: 'complete' };
}

/* "Pending / in-flight" view for both dashboards. Returns every
 * submission where the signed-in user is either staff or manager. */
function listMySubmissions(claims) {
  const me = String(claims.email || '').toLowerCase();
  const sheet = getFormSubmissionsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, submissions: [] };
  const values = sheet.getRange(2, 1, lastRow - 1, FORM_SUBMISSION_HEADERS.length).getValues();
  const idx = {};
  FORM_SUBMISSION_HEADERS.forEach(function (h, i) { idx[h] = i; });
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const staffE = String(r[idx.staff_email] || '').toLowerCase();
    const mgrE   = String(r[idx.manager_email] || '').toLowerCase();
    if (me !== staffE && me !== mgrE) continue;
    out.push({
      submission_id:    String(r[idx.submission_id] || ''),
      created_at_iso:   String(r[idx.created_at_iso] || ''),
      updated_at_iso:   String(r[idx.updated_at_iso] || ''),
      status:           String(r[idx.status] || ''),
      form_id:          String(r[idx.form_id] || ''),
      form_url:         String(r[idx.form_url] || ''),
      form_title:       String(r[idx.form_title] || ''),
      staff_email:      staffE,
      staff_name:       String(r[idx.staff_name] || ''),
      manager_email:    mgrE,
      manager_name:     String(r[idx.manager_name] || ''),
      completed_at_iso: String(r[idx.completed_at_iso] || ''),
      role:             (me === staffE) ? 'staff' : 'manager'
    });
  }
  out.sort(function (a, b) { return a.updated_at_iso < b.updated_at_iso ? 1 : -1; });
  return { ok: true, submissions: out };
}

// ---------- Completions ----------

function getCompletionsFor(email) {
  const sheet = getEventsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2, 1, last - 1, EVENT_HEADERS.length).getValues();

  const idx = {
    ts:      EVENT_HEADERS.indexOf('timestamp_iso'),
    email:   EVENT_HEADERS.indexOf('email'),
    module:  EVENT_HEADERS.indexOf('module_id'),
    event:   EVENT_HEADERS.indexOf('event'),
    version: EVENT_HEADERS.indexOf('version')
  };

  const seen = {};
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row[idx.email] !== email) continue;
    if (row[idx.event] !== 'completed') continue;
    const moduleId = String(row[idx.module]);
    const ts = String(row[idx.ts]);
    if (!seen[moduleId] || ts > seen[moduleId].completed_at) {
      seen[moduleId] = {
        module_id:    moduleId,
        completed_at: ts,
        version:      String(row[idx.version] || '')
      };
    }
  }
  return Object.keys(seen).map(function (k) { return seen[k]; });
}

// ---------- Admin allowlist ----------

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

function getAdminEmailSet() {
  const sheet = getAdminsSheet();
  const last = sheet.getLastRow();
  const set = {};
  if (last < 2) return set;
  const emails = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) {
    const e = String(emails[i][0] || '').trim().toLowerCase();
    if (e) set[e] = true;
  }
  return set;
}

function isAdmin(email) {
  if (!email) return false;
  return !!getAdminEmailSet()[String(email).trim().toLowerCase()];
}

// ---------- Admin overview (compliance) ----------

/**
 * Aggregates everything the admin dashboard needs in one payload:
 *   - people: every known staff member (union of the optional `roster`
 *     tab and everyone who has ever signed in), with their latest
 *     activity timestamp.
 *   - completions: the latest 'completed' event per person × module.
 * The frontend cross-references these against its own module registry.
 */
function adminOverview() {
  const people = {};  // emailLower -> { email, name, last_seen }

  function touch(email, name, ts) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return;
    if (!people[key]) people[key] = { email: key, name: name || '', last_seen: ts || '' };
    else {
      if (name && !people[key].name) people[key].name = name;
      if (ts && ts > people[key].last_seen) people[key].last_seen = ts;
    }
  }

  // Everyone who has signed in (sessions tab).
  const sess = getSessionsSheet();
  const sLast = sess.getLastRow();
  if (sLast >= 2) {
    const rows = sess.getRange(2, 1, sLast - 1, SESSION_HEADERS.length).getValues();
    // SESSION_HEADERS: token, email, name, created, expires, last_used, ua
    for (let i = 0; i < rows.length; i++) {
      touch(rows[i][1], rows[i][2], String(rows[i][5] || rows[i][3] || ''));
    }
  }

  // Optional roster tab (email, name) so staff who never signed in
  // still show up as outstanding.
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = ss.getSheetByName(ROSTER_SHEET);
  if (roster) {
    const rLast = roster.getLastRow();
    if (rLast >= 2) {
      const rows = roster.getRange(2, 1, rLast - 1, 2).getValues();
      for (let i = 0; i < rows.length; i++) touch(rows[i][0], rows[i][1], '');
    }
  }

  // Latest 'completed' per person × module.
  const ev = getEventsSheet();
  const eLast = ev.getLastRow();
  const completions = [];
  if (eLast >= 2) {
    const rows = ev.getRange(2, 1, eLast - 1, EVENT_HEADERS.length).getValues();
    const idx = {
      ts:     EVENT_HEADERS.indexOf('timestamp_iso'),
      email:  EVENT_HEADERS.indexOf('email'),
      name:   EVENT_HEADERS.indexOf('name'),
      module: EVENT_HEADERS.indexOf('module_id'),
      event:  EVENT_HEADERS.indexOf('event')
    };
    const seen = {};  // emailLower|module -> { email, module_id, completed_at }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row[idx.event] !== 'completed') continue;
      const email = String(row[idx.email] || '').trim().toLowerCase();
      const moduleId = String(row[idx.module] || '');
      const ts = String(row[idx.ts] || '');
      touch(email, row[idx.name], ts);  // ensure the person exists
      const key = email + '|' + moduleId;
      if (!seen[key] || ts > seen[key].completed_at) {
        seen[key] = { email: email, module_id: moduleId, completed_at: ts };
      }
    }
    Object.keys(seen).forEach(function (k) { completions.push(seen[k]); });
  }

  return {
    ok: true,
    generated_at: nowIsoLocal(),
    people: Object.keys(people).map(function (k) { return people[k]; }),
    completions: completions
  };
}

// ---------- Roster (email → tags lookup) ----------

/**
 * The `roster` tab is the source of truth for staff tags. Columns:
 *   email | name | tags
 * Where `tags` is a comma-separated list (e.g. "elementary,grade-4,math").
 * Admins manage tags directly in the Sheet — no code change needed.
 *
 * Note: the same tab is also consumed by adminOverview() to surface
 * staff who haven't signed in yet. Both readers must tolerate the tab
 * being absent.
 */
function _parseList(v) {
  return String(v == null ? '' : v)
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return !!s; });
}

function getRosterIndex() {
  // Returns { byEmail: { emailLower: { email, name, tags:[...] } }, allTags: [sorted unique] }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ROSTER_SHEET);
  const result = { byEmail: {}, allTags: [] };
  if (!sheet) return result;
  const last = sheet.getLastRow();
  if (last < 2) return result;
  // Read at most ROSTER_HEADERS.length columns; tolerate older sheets
  // with only [email, name].
  const width = Math.min(sheet.getLastColumn(), ROSTER_HEADERS.length);
  const rows = sheet.getRange(2, 1, last - 1, width).getValues();
  const tagSet = {};
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const email = String(row[0] || '').trim().toLowerCase();
    if (!email) continue;
    const tags = _parseList(row[2]);
    result.byEmail[email] = {
      email: email,
      name:  String(row[1] || ''),
      tags:  tags
    };
    for (let j = 0; j < tags.length; j++) tagSet[tags[j]] = true;
  }
  result.allTags = Object.keys(tagSet).sort();
  return result;
}

function getTagsForEmail(email) {
  const idx = getRosterIndex();
  const entry = idx.byEmail[String(email || '').trim().toLowerCase()];
  return entry ? entry.tags : [];
}

// ---------- Notifications ----------

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

function isActiveFlag(v) {
  // Default to active unless explicitly set to a falsey marker.
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === 'no' || s === '0');
}

/** All active notifications, newest first. Tolerant of older row widths
 *  (pre-targeting). Each notification carries its target_tags and
 *  target_emails arrays so callers can decide who receives it. */
function readActiveNotifications() {
  const sheet = getNotifsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  // Read whatever the sheet has — never wider than NOTIF_HEADERS, but it
  // may be narrower if the sheet predates the targeting columns.
  const width = Math.min(sheet.getLastColumn(), NOTIF_HEADERS.length);
  const rows = sheet.getRange(2, 1, last - 1, width).getValues();
  const i_id    = NOTIF_HEADERS.indexOf('id');
  const i_ts    = NOTIF_HEADERS.indexOf('created_at_iso');
  const i_name  = NOTIF_HEADERS.indexOf('author_name');
  const i_title = NOTIF_HEADERS.indexOf('title');
  const i_body  = NOTIF_HEADERS.indexOf('body');
  const i_tags  = NOTIF_HEADERS.indexOf('target_tags');
  const i_em    = NOTIF_HEADERS.indexOf('target_emails');
  const i_act   = NOTIF_HEADERS.indexOf('active');
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Active flag lives at the rightmost present column on legacy rows;
    // fall back to it if we read fewer columns than NOTIF_HEADERS.
    const activeVal = (i_act < width) ? r[i_act] : r[r.length - 1];
    if (!isActiveFlag(activeVal)) continue;
    out.push({
      id:            String(r[i_id]),
      created_at:    String(r[i_ts]),
      author_name:   String(r[i_name] || ''),
      title:         String(r[i_title] || ''),
      body:          String(r[i_body] || ''),
      target_tags:   _parseList(i_tags < width ? r[i_tags] : ''),
      target_emails: _parseList(i_em   < width ? r[i_em]   : '')
    });
  }
  out.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
  return out;
}

/** True if `email` should see notification `n` given its targeting. */
function userReceivesNotification(email, n, userTags) {
  // Broadcast: no targeting set → everyone gets it.
  if (!n.target_tags.length && !n.target_emails.length) return true;
  const e = String(email || '').trim().toLowerCase();
  if (n.target_emails.indexOf(e) !== -1) return true;
  if (n.target_tags.length) {
    const tags = userTags || getTagsForEmail(email);
    for (let i = 0; i < tags.length; i++) {
      if (n.target_tags.indexOf(tags[i]) !== -1) return true;
    }
  }
  return false;
}

/** Set of notification ids this email has already read. */
function readIdsFor(email) {
  const sheet = getNotifReadsSheet();
  const last = sheet.getLastRow();
  const set = {};
  if (last < 2) return set;
  const rows = sheet.getRange(2, 1, last - 1, NOTIF_READ_HEADERS.length).getValues();
  const target = String(email || '').trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === target) {
      set[String(rows[i][0])] = true;
    }
  }
  return set;
}

function listNotifications(email) {
  const notifs = readActiveNotifications();
  const readSet = readIdsFor(email);
  const userTags = getTagsForEmail(email);
  let unread = 0;
  const items = [];
  for (let i = 0; i < notifs.length; i++) {
    const n = notifs[i];
    if (!userReceivesNotification(email, n, userTags)) continue;
    const read = !!readSet[n.id];
    if (!read) unread++;
    items.push({
      id: n.id, created_at: n.created_at, author_name: n.author_name,
      title: n.title, body: n.body, read: read
    });
  }
  return { ok: true, notifications: items, unread: unread };
}

function postNotification(claims, body) {
  const title         = String(body.title || '').slice(0, 200).trim();
  const text          = String(body.body  || '').slice(0, 4000).trim();
  const target_tags   = _parseList(body.target_tags).slice(0, 50);
  const target_emails = _parseList(body.target_emails).slice(0, 200);
  if (!title && !text) return { ok: false, error: 'empty_notification' };

  const id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const row = new Array(NOTIF_HEADERS.length).fill('');
  row[NOTIF_HEADERS.indexOf('id')]             = id;
  row[NOTIF_HEADERS.indexOf('created_at_iso')] = nowIsoLocal();
  row[NOTIF_HEADERS.indexOf('author_email')]   = claims.email;
  row[NOTIF_HEADERS.indexOf('author_name')]    = claims.name || '';
  row[NOTIF_HEADERS.indexOf('title')]          = title;
  row[NOTIF_HEADERS.indexOf('body')]           = text;
  row[NOTIF_HEADERS.indexOf('target_tags')]    = target_tags.join(',');
  row[NOTIF_HEADERS.indexOf('target_emails')]  = target_emails.join(',');
  row[NOTIF_HEADERS.indexOf('active')]         = true;
  getNotifsSheet().appendRow(row);
  return {
    ok: true, id: id,
    target_tags: target_tags, target_emails: target_emails
  };
}

function markNotificationRead(claims, body) {
  const id = String(body.notification_id || '').trim();
  if (!id) return { ok: false, error: 'missing_notification_id' };
  // Avoid duplicate read rows for the same person + notification.
  if (readIdsFor(claims.email)[id]) return { ok: true, already: true };
  getNotifReadsSheet().appendRow([id, claims.email, nowIsoLocal()]);
  return { ok: true };
}

function markAllNotificationsRead(claims) {
  // Only auto-mark the ones the user is actually a recipient of, so the
  // user's read history doesn't get polluted with notifications they
  // never had access to.
  const notifs = readActiveNotifications();
  const readSet = readIdsFor(claims.email);
  const userTags = getTagsForEmail(claims.email);
  const sheet = getNotifReadsSheet();
  const now = nowIsoLocal();
  const toAdd = [];
  for (let i = 0; i < notifs.length; i++) {
    const n = notifs[i];
    if (!userReceivesNotification(claims.email, n, userTags)) continue;
    if (!readSet[n.id]) toAdd.push([n.id, claims.email, now]);
  }
  if (toAdd.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, NOTIF_READ_HEADERS.length).setValues(toAdd);
  }
  return { ok: true, marked: toAdd.length };
}

function deleteNotification(body) {
  const id = String(body.notification_id || '').trim();
  if (!id) return { ok: false, error: 'missing_notification_id' };
  const sheet = getNotifsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      // Soft delete: flip the active column to FALSE.
      sheet.getRange(i + 2, NOTIF_HEADERS.indexOf('active') + 1).setValue(false);
      return { ok: true };
    }
  }
  return { ok: true };
}

/** Admin view: each active notification with targeting info, the number
 *  of people the targeting resolves to, and how many have read it. */
function adminNotificationStats() {
  const notifs = readActiveNotifications();
  const roster = getRosterIndex();

  // Count reads per notification id in one pass.
  const reads = getNotifReadsSheet();
  const last = reads.getLastRow();
  const counts = {};
  if (last >= 2) {
    const rows = reads.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i][0]);
      counts[id] = (counts[id] || 0) + 1;
    }
  }

  // Total "audience" for a broadcast (no targeting). We use the
  // adminOverview people list — every signed-in user union the roster.
  // Computing it on every call is fine at this scale.
  const overviewPeople = adminOverview().people || [];
  const totalAudience = overviewPeople.length;

  function resolveAudience(n) {
    if (!n.target_tags.length && !n.target_emails.length) return totalAudience;
    const matched = {};
    // Match by email
    for (let i = 0; i < n.target_emails.length; i++) matched[n.target_emails[i]] = true;
    // Match by tag (against roster)
    if (n.target_tags.length) {
      const tagSet = {};
      n.target_tags.forEach(function (t) { tagSet[t] = true; });
      const byEmail = roster.byEmail;
      Object.keys(byEmail).forEach(function (email) {
        if (matched[email]) return;
        const tags = byEmail[email].tags || [];
        for (let j = 0; j < tags.length; j++) {
          if (tagSet[tags[j]]) { matched[email] = true; return; }
        }
      });
    }
    return Object.keys(matched).length;
  }

  const items = notifs.map(function (n) {
    n.read_count     = counts[n.id] || 0;
    n.recipient_count = resolveAudience(n);
    return n;
  });
  return {
    ok: true,
    notifications: items,
    generated_at: nowIsoLocal()
  };
}

/** Admin view: the union of tags currently in the roster, so the
 *  compose UI can show pickable chips. */
function adminListTags() {
  const roster = getRosterIndex();
  return { ok: true, tags: roster.allTags };
}

// ---------- Output ----------

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
