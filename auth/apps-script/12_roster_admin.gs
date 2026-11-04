/**
 * 12_roster_admin.gs — the Roster tab of the admin pages (4 Nov 2026).
 *
 * Admins add, change and remove people on the `roster` tab (their name and tags), upload a CSV of them, add and
 * remove the other admins on the `admins` tab, and record a module as finished for someone who cannot sign in (a
 * personal Gmail account is not a school account, so Google will not let her in). The rules are the same as the new
 * server's (supabase/functions/learning-hub/core.mjs, "12_roster_admin.gs"): a test compares the two.
 *
 *   admin_roster_list    both lists
 *   admin_roster_save    add a person, or change their name or tags
 *   admin_roster_remove  take a person off the roster
 *   admin_roster_import  a file of people (a blank name or tags cell keeps what the person has)
 *   admin_admin_save     add an admin, or change their name or role (school accounts only)
 *   admin_admin_remove   not yourself, and never the last one
 *   admin_mark_complete  a 'completed' event for someone on the roster, once
 *
 * Every write bumps the cache domain it changed, after the write (04_cache.gs).
 */

const ROSTER_MAX_ROWS = 3000;
const ROSTER_EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const ROSTER_MODULE_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

function _cleanEmail(v) {
  const e = String(v == null ? '' : v).trim().toLowerCase();
  return e.length <= 320 && ROSTER_EMAIL_RE.test(e) ? e : '';
}

function _isSchoolEmail(e) {
  const suffix = '@' + ALLOWED_DOMAIN;
  return e.length > suffix.length && e.slice(-suffix.length) === suffix;
}

/* Tags as the roster keeps them: lower case, each once, comma-separated; null when one is too long or all are. */
function _cleanTags(v) {
  const list = _parseList(Array.isArray(v) ? v.join(',') : v), seen = {}, out = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].length > 40) return null;
    if (!seen[list[i]]) { seen[list[i]] = true; out.push(list[i]); }
  }
  const joined = out.join(',');
  return joined.length > 2000 ? null : joined;
}

function _rosterSheetForWrite() { return _sheet(ROSTER_SHEET, ROSTER_HEADERS); }

/* A tab's rows as [col0, col1, col2] text, blank-address rows left out of the book but kept in `raw`. */
function _readTab3(sheet) {
  const last = sheet.getLastRow();
  const raw = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 3).getValues();
  return raw.map(function (r) { return [String(r[0] == null ? '' : r[0]), String(r[1] == null ? '' : r[1]), String(r[2] == null ? '' : r[2])]; });
}

/* The tab becomes `rows` (below its header row): rewrites what is there, adds what is new, deletes what is left over. */
function _writeTab3(sheet, rows) {
  const last = sheet.getLastRow(), have = last < 2 ? 0 : last - 1;
  const common = Math.min(have, rows.length);
  if (common) sheet.getRange(2, 1, common, 3).setValues(rows.slice(0, common));
  for (let i = common; i < rows.length; i++) sheet.appendRow(rows[i]);
  for (let r = last; r > common + 1; r--) sheet.deleteRow(r);
}

function _hasEmail3(row, e) { return String(row[0]).trim().toLowerCase() === e; }

/* A person (or admin) put in a list of rows: the first row with that address is rewritten, any others dropped. */
function _put3(rows, e, a, b) {
  let at = -1;
  const out = [];
  rows.forEach(function (r) {
    if (_hasEmail3(r, e)) { if (at === -1) { at = out.length; out.push([e, a, b]); } return; }
    out.push(r);
  });
  if (at === -1) out.push([e, a, b]);
  return out;
}

function _book3(rows, upper) {
  const byEmail = {}, order = [];
  rows.forEach(function (r) {
    const e = String(r[0]).trim().toLowerCase();
    if (!e) return;
    if (!(e in byEmail)) order.push(e);
    byEmail[e] = { email: e, name: String(r[1] || ''), x: String(r[2] || '') };
  });
  return { byEmail: byEmail, order: order };
}

function _rosterBook() {
  const people = _book3(_readTab3(_rosterSheetForWrite()));
  const admins = _book3(_readTab3(getAdminsSheet()));
  return { people: people, admins: admins };
}

function adminRosterList() {
  const b = _rosterBook(), tagSet = {};
  const roster = b.people.order.map(function (e) {
    const tags = _parseList(b.people.byEmail[e].x);
    tags.forEach(function (t) { tagSet[t] = true; });
    return { email: e, name: b.people.byEmail[e].name, tags: tags };
  });
  return {
    ok: true,
    roster: roster,
    admins: b.admins.order.map(function (e) { return { email: e, name: b.admins.byEmail[e].name, role: b.admins.byEmail[e].x }; }),
    tags: Object.keys(tagSet).sort(),
    generated_at: nowIsoLocal()
  };
}

/* Locks the script while a tab is rewritten, so two admins saving at once cannot lose each other's change. */
function _withRosterLock(fn) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { ok: false, error: 'busy_try_again' }; }
  try { return fn(); } finally { lock.releaseLock(); }
}

function adminRosterSave(body) {
  const email = _cleanEmail(body.email);
  if (!email) return { ok: false, error: 'invalid_email' };
  return _withRosterLock(function () {
    const sheet = _rosterSheetForWrite();
    const rows = _readTab3(sheet), cur = _book3(rows).byEmail[email];
    const name = body.name == null ? (cur ? cur.name : '') : String(body.name).trim().slice(0, 300);
    const tags = body.tags == null ? (cur ? cur.x : '') : _cleanTags(body.tags);
    if (tags === null) return { ok: false, error: 'invalid_tags' };
    _writeTab3(sheet, _put3(rows, email, name, tags));
    _bump('roster');
    return { ok: true, created: !cur };
  });
}

function adminRosterRemove(body) {
  const email = _cleanEmail(body.email);
  if (!email) return { ok: false, error: 'invalid_email' };
  return _withRosterLock(function () {
    const sheet = _rosterSheetForWrite();
    const rows = _readTab3(sheet);
    if (!(email in _book3(rows).byEmail)) return { ok: false, error: 'not_found' };
    _writeTab3(sheet, rows.filter(function (r) { return !_hasEmail3(r, email); }));
    _bump('roster');
    return { ok: true };
  });
}

/* A file of people: each row {email, name, tags}. A blank name or tags cell keeps what the person has. Rows that cannot be
 * used are skipped and listed; nothing is removed unless remove_missing is true (then everyone not in the file goes). */
function adminRosterImport(body) {
  const given = body.rows;
  if (!Array.isArray(given) || !given.length) return { ok: false, error: 'missing_rows' };
  if (given.length > ROSTER_MAX_ROWS) return { ok: false, error: 'too_many_rows' };
  return _withRosterLock(function () {
    const sheet = _rosterSheetForWrite();
    let rows = _readTab3(sheet);
    const cur = _book3(rows).byEmail;
    const seen = {}, skipped = [], keep = [];
    let added = 0, updated = 0;
    given.forEach(function (r, i) {
      r = r && typeof r === 'object' ? r : {};
      const email = _cleanEmail(r.email), line = i + 1;
      if (!email) { skipped.push({ line: line, email: String(r.email == null ? '' : r.email).trim().slice(0, 100), reason: 'invalid_email' }); return; }
      if (seen[email]) { skipped.push({ line: line, email: email, reason: 'duplicate_in_file' }); return; }
      const tags = _cleanTags(r.tags);
      if (tags === null) { skipped.push({ line: line, email: email, reason: 'invalid_tags' }); return; }
      seen[email] = true; keep.push(email);
      const name = String(r.name == null ? '' : r.name).trim().slice(0, 300);
      const had = _book3(rows).byEmail[email];
      rows = _put3(rows, email, name || (had ? had.name : ''), tags || (had ? had.x : ''));
      if (cur[email]) updated++; else added++;
    });
    if (!keep.length) return { ok: false, error: 'nothing_to_import', skipped: skipped };
    let removed = 0;
    if (body.remove_missing === true || body.remove_missing === 'true') {
      const inFile = {};
      keep.forEach(function (e) { inFile[e] = true; });
      const kept = rows.filter(function (r) { return inFile[String(r[0]).trim().toLowerCase()]; });
      removed = rows.length - kept.length;
      rows = kept;
    }
    _writeTab3(sheet, rows);
    _bump('roster');
    return { ok: true, added: added, updated: updated, removed: removed, skipped: skipped };
  });
}

function adminAdminSave(body) {
  const email = _cleanEmail(body.email);
  if (!email) return { ok: false, error: 'invalid_email' };
  if (!_isSchoolEmail(email)) return { ok: false, error: 'not_school_email' };
  return _withRosterLock(function () {
    const sheet = getAdminsSheet();
    const rows = _readTab3(sheet), cur = _book3(rows).byEmail[email];
    const name = body.name == null ? (cur ? cur.name : '') : String(body.name).trim().slice(0, 300);
    const role = body.role == null ? (cur ? cur.x : '') : String(body.role).trim().slice(0, 100);
    _writeTab3(sheet, _put3(rows, email, name, role));
    _bump('admins');
    return { ok: true, created: !cur };
  });
}

function adminAdminRemove(claims, body) {
  const email = _cleanEmail(body.email);
  if (!email) return { ok: false, error: 'invalid_email' };
  if (email === String(claims.email || '').trim().toLowerCase()) return { ok: false, error: 'cannot_remove_self' };
  return _withRosterLock(function () {
    const sheet = getAdminsSheet();
    const rows = _readTab3(sheet), book = _book3(rows);
    if (!(email in book.byEmail)) return { ok: false, error: 'not_found' };
    if (book.order.length < 2) return { ok: false, error: 'last_admin' };
    _writeTab3(sheet, rows.filter(function (r) { return !_hasEmail3(r, email); }));
    _bump('admins');
    return { ok: true };
  });
}

/* Records that someone finished a module, for a person who cannot sign in. Only for people on the roster, and once: a
 * second time answers already. The event says who marked it (user_agent) and has version 'admin'. */
function adminMarkComplete(claims, body) {
  const email = _cleanEmail(body.email), moduleId = String(body.module_id == null ? '' : body.module_id).trim();
  if (!email) return { ok: false, error: 'invalid_email' };
  if (!ROSTER_MODULE_RE.test(moduleId)) return { ok: false, error: 'invalid_module_id' };
  return _withRosterLock(function () {
    const person = _book3(_readTab3(_rosterSheetForWrite())).byEmail[email];
    if (!person) return { ok: false, error: 'not_on_roster' };
    const have = _completionsIndex(true).list;
    for (let i = 0; i < have.length; i++) {
      if (have[i][0] === email && have[i][1] === moduleId) return { ok: true, already: true };
    }
    getEventsSheet().appendRow(_rowFrom(EVENT_HEADERS, {
      timestamp_iso: nowIsoLocal(),
      email:         email,
      name:          person.name,
      module_id:     moduleId,
      event:         'completed',
      progress_pct:  100,
      version:       'admin',
      user_agent:    ('marked by ' + String(claims.email || '')).slice(0, 300)
    }));
    _bump('events');
    return { ok: true, already: false };
  });
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_12_roster_admin_() {}
