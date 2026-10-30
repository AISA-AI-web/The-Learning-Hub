/**
 * 91_bridge.gs — the Learning Hub's Google side, after its move to the school's Supabase project.
 *
 * The hub's backend now runs on Supabase (AISA-AI-web/AI-Lessons: learning-hub/ and the `learning-hub` edge
 * function). What only Google can do stays here, in this Apps Script project, run as the account that owns the Hub
 * spreadsheet:
 *
 *   bridgeRun        every minute (a trigger added by hand after the switch): asks the server for the emails the hub has
 *                    queued (PD reminders, the newsletter, a teacher's copy of their goal), sends them with MailApp
 *                    as before, from this account, and reports back what went and the day's mail quota.
 *
 * Run these once from the Apps Script editor (choose the function, then Run), as that account:
 *
 *   bridgeSetup      makes the bridge's key (kept in Script Properties as BRIDGE_KEY, never shown) and writes its
 *                    SHA-256 in the execution log: paste that into Supabase as the edge function's secret
 *                    LEARNING_HUB_BRIDGE_KEY_SHA256 (it is not a secret: the key cannot be worked out from it)
 *   bridgeCheck      checks that the server knows the key, and shows what it holds
 *   bridgeCopySheet  copies every tab of the Hub spreadsheet to the new database – until the switch, as often as
 *                    needed; each copy replaces the last. Session tokens are hashed here: they never leave Google.
 *   bridgeSwitch     the switch: holds the old backend still, copies the Sheet one last time, tells the server, then
 *                    sets MOVED_TO, from when the old web app's address passes every request on to the new server
 *                    (so pages that still call it keep working, and everyone stays signed in).
 *
 * It uses only services the backend already uses (UrlFetchApp, MailApp, LockService) and Script Properties, so it
 * needs no new permission: deploying it does not stop the web app.
 *
 * The source is AISA-AI-web/AI-Lessons: learning-hub/bridge/91_bridge.gs. 02_router.gs's doPost and doGet hand over
 * to bridgeForward_ once MOVED_TO is set (learning-hub/bridge/old-project.patch). Nothing at the top level of this
 * file reads a name from another file (the hub's rule): Bridge's functions only run when called.
 */
var Bridge = (function () {
  'use strict';

  // forceFunctionRegion: the server runs in Frankfurt, next to the database (Google's servers would otherwise get the
  // region nearest them, in the US): quicker, and the hub's data stays in the EU.
  var DEFAULT_URL = 'https://kttgudordfvhdrkcancp.supabase.co/functions/v1/learning-hub?forceFunctionRegion=eu-central-1';
  // The origin the old web app's forwarded requests carry (one of the server's LEARNING_HUB_ORIGINS).
  var DEFAULT_ORIGIN = 'https://aisa-ai-web.github.io';
  var PART_ROWS = 2000;              // rows per request when copying the Sheet …
  var PART_CHARS = 300000;           // … and characters (a request stays well under the server's 2 MB)
  var MAIL_BUDGET = 45 * 1000;       // stop sending after 45 seconds: the next run (a minute later) carries on
  var MAIL_PER_RUN = 100;

  function props() { return PropertiesService.getScriptProperties(); }

  function url() { return String(props().getProperty('BRIDGE_URL') || DEFAULT_URL).trim(); }

  function origin() { return String(props().getProperty('BRIDGE_ORIGIN') || DEFAULT_ORIGIN).trim(); }

  function key() {
    var k = props().getProperty('BRIDGE_KEY');
    if (!k) throw new Error('The bridge has no key yet: run bridgeSetup first.');
    return k;
  }

  function sha256(s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(function (b) {
      var x = (b < 0 ? b + 256 : b).toString(16);
      return x.length < 2 ? '0' + x : x;
    }).join('');
  }

  /** One request to the server, as the bridge. Returns its answer, or throws with its error. */
  function call(action, payload) {
    var body = { action: action, key: key() };
    Object.keys(payload || {}).forEach(function (k) { body[k] = payload[k]; });
    var res = UrlFetchApp.fetch(url(), {
      method: 'post', contentType: 'text/plain; charset=utf-8', payload: JSON.stringify(body),
      muteHttpExceptions: true, followRedirects: false
    });
    var text = res.getContentText();
    var out;
    try { out = JSON.parse(text); } catch (e) { throw new Error('The server answered ' + res.getResponseCode() + ': ' + text.slice(0, 200)); }
    if (!out.ok) throw new Error((out.message || out.error || 'The server refused') + ' (' + res.getResponseCode() + ')');
    return out;
  }

  /* ------------------------------------------------------------------
     The copy: every tab, columns in the old order (01_sheets.gs)
     ------------------------------------------------------------------ */

  /** A cell as JSON can carry it: a date as the hub writes times (Abu Dhabi, "+04:00"). */
  function cell(v) {
    if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : isoLocal(v);
    return v === null || v === undefined ? '' : v;
  }

  /** The rows of a tab (header row left out), `width` columns, or [] when it has none or does not exist. */
  function rowsOf(sheet, width) {
    if (!sheet || sheet.getLastRow() < 2) return [];
    return _dataRows(sheet, width).map(function (r) { return r.map(cell); });
  }

  /** Every tab as { tab, rows }, rows as the old backend reads them. */
  function tabs() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var out = [];

    out.push({ tab: 'sessions', rows: rowsOf(ss.getSheetByName(SESSIONS_SHEET), SESSION_HEADERS.length)
      .filter(function (r) { return String(r[0]) !== ''; })
      .map(function (r) { return [sha256(String(r[0]))].concat(r.slice(1)); }) });

    out.push({ tab: 'admins', rows: rowsOf(ss.getSheetByName(ADMINS_SHEET), ADMIN_HEADERS.length) });

    // The roster may be narrower (older sheets have only email and name), as _rosterPart allows.
    var roster = ss.getSheetByName(ROSTER_SHEET);
    var rw = roster ? Math.min(roster.getLastColumn(), ROSTER_HEADERS.length) : 0;
    out.push({ tab: 'roster', rows: rw ? rowsOf(roster, rw).map(function (r) { while (r.length < ROSTER_HEADERS.length) r.push(''); return r; }) : [] });

    out.push({ tab: 'events', rows: rowsOf(ss.getSheetByName(EVENTS_SHEET), EVENT_HEADERS.length) });
    out.push({ tab: 'pageviews', rows: rowsOf(ss.getSheetByName(PAGEVIEWS_SHEET), PAGEVIEW_HEADERS.length) });
    out.push({ tab: 'clicks', rows: rowsOf(ss.getSheetByName(CLICKS_SHEET), CLICK_HEADERS.length) });

    var dwell = ss.getSheetByName(DWELL_SHEET);
    if (dwell && dwellSheetIsLegacy(dwell)) throw new Error('The dwell tab still has one row per chapter: run migrateDwellToPerModule first.');
    out.push({ tab: 'dwell', rows: rowsOf(dwell, DWELL_HEADERS.length) });

    // Notifications from before the targeting columns are narrower, and their `active` is their last cell
    // (_readActiveNotificationsFromSheet): each row is sent with all nine columns, read by that rule.
    var notifs = ss.getSheetByName(NOTIFS_SHEET);
    var nw = notifs ? Math.min(notifs.getLastColumn(), NOTIF_HEADERS.length) : 0;
    out.push({ tab: 'notifications', rows: nw ? rowsOf(notifs, nw).map(function (r) {
      var c = _colIndex(NOTIF_HEADERS);
      return NOTIF_HEADERS.map(function (h, i) {
        if (h === 'active') return c.active < nw ? r[c.active] : r[r.length - 1];
        return i < nw ? r[i] : '';
      });
    }) : [] });

    out.push({ tab: 'notification_reads', rows: rowsOf(ss.getSheetByName(NOTIF_READS_SHEET), NOTIF_READ_HEADERS.length) });
    out.push({ tab: 'module_responses', rows: rowsOf(ss.getSheetByName(MODULE_RESPONSES_SHEET), MODULE_RESPONSE_HEADERS.length) });
    out.push({ tab: 'survey_responses', rows: rowsOf(_surveysSpreadsheet().getSheetByName(SURVEYS_SHEET), SURVEY_HEADERS.length) });
    out.push({ tab: 'line_managers', rows: rowsOf(ss.getSheetByName(LINE_MANAGERS_SHEET), LINE_MANAGER_HEADERS.length) });
    out.push({ tab: 'form_submissions', rows: rowsOf(ss.getSheetByName(FORM_SUBMISSIONS_SHEET), FORM_SUBMISSION_HEADERS.length) });
    return out;
  }

  /** The copy as requests: [{ tab, rows, first }], each tab at least one (an empty tab empties its table). */
  function sheetParts() {
    var parts = [];
    tabs().forEach(function (t) {
      var rows = [], chars = 0, first = true;
      function flush() { parts.push({ tab: t.tab, rows: rows, first: first }); first = false; rows = []; chars = 0; }
      t.rows.forEach(function (r) {
        var n = JSON.stringify(r).length;
        if (rows.length && (rows.length >= PART_ROWS || chars + n > PART_CHARS)) flush();
        rows.push(r);
        chars += n;
      });
      if (rows.length || first) flush();
    });
    return parts;
  }

  /** Sends every part. Returns the server's totals afterwards. */
  function copy() {
    sheetParts().forEach(function (p) { call('bridge_copy', p); });
    return call('bridge_status').counts;
  }

  /* ------------------------------------------------------------------
     The emails (no network here: run() asks and reports)
     ------------------------------------------------------------------ */

  /** Sends the emails the server handed over ([{ id, payload }]) with MailApp, as the old _sendEach did, for at most
      budgetMs and within the day's quota. Returns { done: [{ id, error }], quota, mail_error }. */
  function sendMail(list, budgetMs) {
    var started = Date.now();
    var out = { done: [], quota: null, mail_error: '' };
    try { out.quota = MailApp.getRemainingDailyQuota(); }
    catch (e) { out.mail_error = String(e && e.message || e); return out; }   // never authorised to send: not "out of quota"
    for (var i = 0; i < list.length; i++) {
      if (Date.now() - started > budgetMs || out.quota <= 0) break;
      var p = list[i].payload || {};
      var opts = { to: p.to, subject: p.subject, body: p.body, htmlBody: p.htmlBody, name: p.name };
      if (p.replyTo) opts.replyTo = p.replyTo;
      try {
        MailApp.sendEmail(opts);
        out.done.push({ id: list[i].id });
        out.quota--;
      } catch (err) {
        out.done.push({ id: list[i].id, error: String(err && err.message || err) });
      }
    }
    return out;
  }

  /** One run: the waiting emails, sent; the report. */
  function run() {
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(1000)) return 'Another run is still sending.';
    try {
      var report;
      try {
        report = sendMail(call('bridge_poll', { limit: MAIL_PER_RUN }).mail, MAIL_BUDGET);
      } catch (e) {
        report = { done: [], quota: null, mail_error: '', error: String(e && e.message || e) };
      }
      call('bridge_report', report);
      return report;
    } finally {
      lock.releaseLock();
    }
  }

  /* ------------------------------------------------------------------
     After the switch: the old web app's address passes requests on
     ------------------------------------------------------------------ */

  /** A request to the old web app, answered by the new server (as a page of the hub would ask it). */
  function forward(text) {
    var res = UrlFetchApp.fetch(url(), {
      method: 'post', contentType: 'text/plain; charset=utf-8', payload: text || '{}',
      headers: { Origin: origin() }, muteHttpExceptions: true, followRedirects: false
    });
    return res.getContentText();
  }

  return { call: call, sha256: sha256, sheetParts: sheetParts, copy: copy, sendMail: sendMail, run: run, forward: forward, url: url };
})();

/* ---------------- run from the editor ---------------- */

function bridgeSetup() {
  var p = PropertiesService.getScriptProperties();
  var k = p.getProperty('BRIDGE_KEY');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    p.setProperty('BRIDGE_KEY', k);
  }
  Logger.log('The bridge key\'s SHA-256 (paste it into Supabase → Edge Functions → Secrets as LEARNING_HUB_BRIDGE_KEY_SHA256):\n' + Bridge.sha256(k));
  Logger.log('Server: ' + Bridge.url());
}

function bridgeCheck() {
  var s = Bridge.call('bridge_status');
  Logger.log('The server knows the bridge.\nState: ' + JSON.stringify(s.state) + '\nWhat it holds: ' + JSON.stringify(s.counts));
  return s;
}

function bridgeCopySheet() {
  if (bridgeMovedTo_()) throw new Error('The Learning Hub has already moved: the Sheet is no longer copied.');
  var counts = Bridge.copy();
  Logger.log('Copied. The server now holds: ' + JSON.stringify(counts));
  return counts;
}

/** The switch. Then add the trigger by hand (Triggers → Add Trigger → bridgeRun, time-driven, every minute): the bridge
    uses no service the project does not use already, so it needs no new permission. Undo (before anything is written
    in the new database): delete MOVED_TO in Project Settings → Script Properties, and the bridgeRun trigger; the old
    backend answers again from the Sheet. */
function bridgeSwitch() {
  var p = PropertiesService.getScriptProperties();
  if (bridgeMovedTo_()) throw new Error('Already switched (MOVED_TO is set).');
  p.setProperty('SWITCHING', '1');          // the old backend answers "busy, try again" while the last copy runs
  var counts;
  try {
    counts = Bridge.copy();
    Bridge.call('bridge_switch');
    p.setProperty('MOVED_TO', Bridge.url());
  } finally {
    p.deleteProperty('SWITCHING');
  }
  Logger.log('Switched. The new server holds: ' + JSON.stringify(counts) + '\nThe old web app now passes every request on to ' + Bridge.url() +
             '\nNow add the trigger: Triggers → Add Trigger → bridgeRun, time-driven, minutes timer, every minute.');
  return counts;
}

function bridgeRun() {
  return Bridge.run();
}

/** Where the hub has moved to (its server's address), or '' before the switch. */
function bridgeMovedTo_() {
  try { return PropertiesService.getScriptProperties().getProperty('MOVED_TO') || ''; } catch (e) { return ''; }
}

/** doPost and doGet after the switch, and while it runs (02_router.gs, with old-project.patch). Null: answer as before. */
function bridgeForward_(e) {
  var p;
  try { p = PropertiesService.getScriptProperties(); } catch (x) { return null; }
  if (p.getProperty('SWITCHING')) return jsonOut({ ok: false, error: 'busy_try_again' });
  if (!p.getProperty('MOVED_TO')) return null;
  var text = (e && e.postData && e.postData.contents) || '';
  if (!text) return jsonOut({ ok: true, service: 'aisa-learning-hub', moved_to: p.getProperty('MOVED_TO') });
  try {
    return ContentService.createTextOutput(Bridge.forward(text)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonOut({ ok: false, error: 'server_error', message: 'The Learning Hub\'s new server could not be reached: ' + String(err && err.message || err) });
  }
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_91_bridge_() {}
