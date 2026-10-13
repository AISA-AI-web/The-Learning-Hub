/**
 * 90_editor_tools.gs — things you run by hand from the Apps Script editor.
 *
 * Open this file, choose a function from the menu beside Run, press Run.
 * Nothing in the Hub calls these, and only checkHubInstall is needed for a
 * routine deploy.
 *
 *   checkHubInstall          after pasting files in, before deploying
 *   authorizeMail            once, so the Hub can send email
 *   auditHubData             when the dashboard and the spreadsheet disagree
 *   flushHubCache            after editing the spreadsheet by hand
 *   warmHubCache             optional, as a five-minute trigger
 *   migrateDwellToPerModule  once, only if `dwell` still has chapter rows
 */

/**
 * Run this after pasting files in, and BEFORE deploying (Run →
 * checkHubInstall). It changes nothing.
 *
 * It lists every file the backend needs and says which are missing. Two
 * mistakes it is here for, both easy to make when pasting files into the
 * editor by hand:
 *
 *   - a file never created, never saved, or cut short while pasting;
 *   - the old single-file Code.gs left in alongside the new files. That one
 *     never gets as far as running this: Apps Script refuses to load a
 *     project in which two files declare the same name, so pressing Run
 *     shows "SyntaxError: Identifier '…' has already been declared" instead.
 *     Delete the old file and run this again.
 */
function checkHubInstall() {
  const out = ['AISA Learning Hub — install check', ''];
  if (typeof _hubFiles !== 'function') {
    out.push('  MISSING  02_router.gs — it holds doPost and the list of files,');
    out.push('           so nothing else can be checked, and nothing can work.');
  } else {
    const files = _hubFiles();
    files.forEach(function (f) { out.push((f[1] ? '  ok       ' : '  MISSING  ') + f[0] + '.gs'); });
    const missing = files.filter(function (f) { return !f[1]; }).length;
    out.push('');
    if (missing) {
      out.push(missing + ' of ' + files.length + ' files missing or cut short. Do not deploy yet.');
      out.push('For each one: + (Add a file) → Script, type the name without .gs, replace');
      out.push('what the editor puts in it with the whole file from the repo, save, and');
      out.push('run this again.');
    } else {
      out.push('All ' + files.length + ' files are here. To go live: Deploy → Manage deployments →');
      out.push('✏️ (Edit) → Version: New version → Deploy. Never "New deployment": that');
      out.push('mints a new URL, and every page of the Hub would lose its backend.');
    }
  }
  try {
    out.push('');
    out.push('Bound to the spreadsheet: ' + SpreadsheetApp.getActiveSpreadsheet().getName());
  } catch (e) {
    out.push('Not bound to a spreadsheet: ' + e + ' — this project must be opened from');
    out.push('the Hub spreadsheet (Extensions → Apps Script).');
  }
  const report = out.join('\n');
  Logger.log(report);
  return report;
}

/* Run this ONCE from the Apps Script editor (Run -> authorizeMail) to
 * grant the send-mail permission and prove it works: it mails the
 * script owner. A web app never shows an authorisation prompt to the
 * person clicking a button in the Hub, so without this the first real
 * send just fails. */
function authorizeMail() {
  const me = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({
    to: me,
    subject: 'AISA Learning Hub \u2014 mail permission granted',
    body: 'If you are reading this, the Learning Hub can send email.\n\n'
        + 'Remaining quota today: ' + MailApp.getRemainingDailyQuota() + '\n'
  });
  Logger.log('Sent a test email to ' + me + '. Remaining quota: '
             + MailApp.getRemainingDailyQuota());
  return 'ok';
}

/**
 * DIAGNOSTIC — run from the Apps Script editor (Run → auditHubData) when
 * the dashboard and the spreadsheet seem to disagree.
 *
 * Reads only; changes nothing. Prints a report and also returns it as a
 * string, so it works from the editor or from a scratch function.
 *
 * It checks the three things that actually cause a silent mismatch:
 *
 *  1. HEADER DRIFT. Every reader in this backend addresses columns BY
 *     POSITION, using the *_HEADERS constants as the map. Insert, delete
 *     or reorder a column by hand in the spreadsheet and every read after
 *     it silently returns the wrong field — no error, just wrong numbers.
 *     This compares each sheet's real header row against its constant.
 *
 *  2. TIMESTAMP CELL TYPES. Sheets decides for itself whether an ISO
 *     string is text or a date. Date-formatted cells come back as Date
 *     objects, which used to break "latest wins" comparisons. Reads now
 *     cope with both, but a sheet that is half text and half date is
 *     worth knowing about.
 *
 *  3. WHAT THE DASHBOARD WOULD SHOW. Recomputes the headline numbers and
 *     the per-module completion counts from the raw rows, so they can be
 *     read side by side with the dashboard.
 */
function auditHubData() {
  /* A diagnostic has to look at the sheets, not at what is cached. */
  _REQ_FRESH = true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = [];
  const say = (s) => { out.push(s); };

  say('AISA Learning Hub — data audit');
  say('Generated ' + nowIsoLocal());
  say('Spreadsheet: ' + ss.getName());
  say('Read cache: ' + (_cache() ? 'available (every number below is read from the sheets, not the cache)'
                                 : 'UNAVAILABLE — the Hub is reading the sheets on every request'));
  say('');

  // ---- 1. Header drift -------------------------------------------------
  say('=== 1. SHEET HEADERS ===');
  const expected = [
    [EVENTS_SHEET,           EVENT_HEADERS],
    [SESSIONS_SHEET,         SESSION_HEADERS],
    [PAGEVIEWS_SHEET,        PAGEVIEW_HEADERS],
    [CLICKS_SHEET,           CLICK_HEADERS],
    [ROSTER_SHEET,           ROSTER_HEADERS],
    [NOTIFS_SHEET,           NOTIF_HEADERS],
    [NOTIF_READS_SHEET,      NOTIF_READ_HEADERS],
    [DWELL_SHEET,            DWELL_HEADERS],
    [LINE_MANAGERS_SHEET,    LINE_MANAGER_HEADERS],
    [FORM_SUBMISSIONS_SHEET, FORM_SUBMISSION_HEADERS],
    [MODULE_RESPONSES_SHEET, MODULE_RESPONSE_HEADERS]
  ];
  let drift = 0;
  expected.forEach(function (pair) {
    const name = pair[0], want = pair[1];
    const sheet = ss.getSheetByName(name);
    if (!sheet) { say('  – ' + name + ': not created yet (fine if unused)'); return; }
    const rows = sheet.getLastRow();
    if (rows < 1) { say('  – ' + name + ': empty'); return; }
    const got = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), want.length))
                     .getValues()[0].map(function (v) { return String(v || '').trim(); });
    const same = want.every(function (h, i) { return got[i] === h; });
    if (same) {
      say('  OK ' + name + ' (' + (rows - 1) + ' rows)');
    } else {
      drift++;
      say('  ** MISMATCH ' + name + ' (' + (rows - 1) + ' rows)');
      say('     expected: ' + want.join(' | '));
      say('     actual:   ' + got.join(' | '));
      want.forEach(function (h, i) {
        if (got[i] !== h) say('       col ' + (i + 1) + ': expected "' + h + '", found "' + (got[i] || '') + '"');
      });
    }
  });
  // Surveys may live in their own spreadsheet.
  (function () {
    const surveySs = _surveysSpreadsheet();
    const sheet = surveySs.getSheetByName(SURVEYS_SHEET);
    const where = (surveySs.getId() === ss.getId()) ? 'this spreadsheet' : surveySs.getName();
    if (!sheet) { say('  – ' + SURVEYS_SHEET + ': not created yet, in ' + where); return; }
    const got = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), SURVEY_HEADERS.length))
                     .getValues()[0].map(function (v) { return String(v || '').trim(); });
    const same = SURVEY_HEADERS.every(function (h, i) { return got[i] === h; });
    say((same ? '  OK ' : '  ** MISMATCH ') + SURVEYS_SHEET +
        ' (' + Math.max(sheet.getLastRow() - 1, 0) + ' rows, in ' + where + ')');
    if (!same) { drift++; say('     expected: ' + SURVEY_HEADERS.join(' | ')); say('     actual:   ' + got.join(' | ')); }
  })();
  say(drift ? '  >> ' + drift + ' sheet(s) drifted. Every number read from those is suspect.'
            : '  >> No header drift.');
  say('');

  // ---- 2. Timestamp cell types ----------------------------------------
  say('=== 2. TIMESTAMP CELL TYPES ===');
  function typeScan(name, headers, colName) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const col = headers.indexOf(colName) + 1;
    if (col < 1) return;
    const vals = sheet.getRange(2, col, sheet.getLastRow() - 1, 1).getValues();
    let dates = 0, strings = 0, blank = 0, utc = 0, local = 0;
    vals.forEach(function (r) {
      const v = r[0];
      if (v === '' || v === null) { blank++; return; }
      if (_isDate(v)) { dates++; return; }
      strings++;
      const t = String(v);
      if (/Z$/.test(t)) utc++; else if (/[+\-]\d{2}:\d{2}$/.test(t)) local++;
    });
    const mixedType = (dates > 0 && strings > 0);
    const mixedZone = (utc > 0 && local > 0);
    say('  ' + name + '.' + colName + ': ' + strings + ' text, ' + dates + ' date-typed, ' + blank + ' blank' +
        (strings ? '  [' + utc + ' end "Z", ' + local + ' end "+04:00"]' : '') +
        (mixedType ? '   ** mixed types' : '') + (mixedZone ? '   ** mixed offsets' : ''));
  }
  typeScan(EVENTS_SHEET,   EVENT_HEADERS,   'timestamp_iso');
  typeScan(SESSIONS_SHEET, SESSION_HEADERS, 'last_used_iso');
  typeScan(DWELL_SHEET,    DWELL_HEADERS,   'updated_at_iso');
  say('  >> Both shapes are handled on read. Listed so you can see what is in there.');
  say('');

  // ---- 3. What the dashboard would show --------------------------------
  say('=== 3. RECOMPUTED FROM RAW ROWS ===');
  const ov = adminOverview();
  say('  Staff tracked (sessions + roster + event authors): ' + ov.people.length);
  say('  Distinct completions (person x module): ' + ov.completions.length);

  const byModule = {};
  ov.completions.forEach(function (c) {
    byModule[c.module_id] = (byModule[c.module_id] || 0) + 1;
  });
  say('  Completions per module_id, straight from the events sheet:');
  Object.keys(byModule).sort().forEach(function (id) {
    say('     ' + id + ': ' + byModule[id]);
  });
  say('  >> Any module_id here that the dashboard does not list is invisible');
  say('     on the tracker; anything the dashboard lists that is missing here');
  say('     will read 0%. Compare against MODULES in admin-dashboard.html.');
  say('');

  // Duplicate roster emails quietly double-count people.
  const roster = ss.getSheetByName(ROSTER_SHEET);
  if (roster && roster.getLastRow() > 1) {
    const seen = {}, dupes = [];
    roster.getRange(2, 1, roster.getLastRow() - 1, 1).getValues().forEach(function (r) {
      const e = String(r[0] || '').trim().toLowerCase();
      if (!e) return;
      if (seen[e]) { if (dupes.indexOf(e) === -1) dupes.push(e); }
      seen[e] = true;
    });
    say('  Roster: ' + Object.keys(seen).length + ' unique emails' +
        (dupes.length ? ', ** ' + dupes.length + ' duplicated: ' + dupes.join(', ') : ', no duplicates'));
  } else {
    say('  Roster: empty or missing — "outstanding" lists will only ever contain');
    say('  people who have signed in at least once.');
  }

  const report = out.join('\n');
  Logger.log(report);
  return report;
}

/**
 * Run from the Apps Script editor (Run → flushHubCache) after editing the
 * spreadsheet by hand, to make the Hub read everything fresh right away
 * instead of when the cache would have expired anyway. Also re-verifies
 * every session against the `sessions` tab, so a session row deleted by
 * hand stops working immediately. Changes no data.
 */
function flushHubCache() {
  const c = _cache();
  if (!c) { Logger.log('CacheService is unavailable — nothing to flush.'); return 'unavailable'; }
  c.put(CACHE_NS + ':epoch', _newStamp(), CACHE_MAX_TTL_S);
  Logger.log('Hub cache flushed. The next request for each thing reads it from the sheets.');
  return 'ok';
}

/**
 * OPTIONAL. Point a time-driven trigger at this (Triggers → Add Trigger →
 * warmHubCache → Time-driven → Minutes timer → Every 5 minutes) and the
 * admin dashboard is fast on its first load of the day as well as its
 * second. Without it the Hub still works; the first admin load after a
 * quiet spell just pays for the sheet reads, as every load used to.
 *
 * Refreshes the parts that expire by time (last seen, roster, admins,
 * engagement) and fills in anything else that has fallen out. Reads only.
 * Does nothing outside school hours so it isn't spending quota overnight.
 */
function warmHubCache() {
  const hour = Number(Utilities.formatDate(new Date(), TIMEZONE, 'H'));
  if (hour < 6 || hour >= 20) return 'outside_hours';
  const started = Date.now();
  _adminSetPart(true);
  _rosterPart(true);
  _sessionPeople(true);
  _dwellPart(true);
  _completionsIndex(false);
  _moduleResponsesPart(false);
  _surveysPart(false);
  readActiveNotifications();
  Logger.log('Hub cache warmed in ' + (Date.now() - started) + ' ms.');
  return 'ok';
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
    sheet.appendRow(_rowFrom(DWELL_HEADERS, {
      updated_at_iso:       g.updated || nowIsoLocal(),
      first_seen_iso:       g.first   || g.updated || nowIsoLocal(),
      email:                g.email,
      name:                 g.name,
      module_id:            g.module,
      total_seconds:        g.seconds,
      chapters_seen:        g.chapters,
      avg_secs_per_chapter: avg,
      user_agent:           ''   /* not carried forward — only the latest write knows it */
    }));
    written++;
  });

  _bump('dwell');
  Logger.log('Migrated ' + written + ' per-module row(s). Backup: ' + backupName);
  return { ok: true, migrated: written, backup_sheet: backupName };
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_90_editor_tools_() {}
