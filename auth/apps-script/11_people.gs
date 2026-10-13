/**
 * 11_people.gs — who's who.
 *
 * Who is an admin (the `admins` tab), who may mail the whole school
 * (NEWSLETTER_SENDERS in 00_settings.gs), each person's roster tags, who has
 * ever signed in, and what to call people in an email.
 */

// ---------- Admin allowlist ----------

/* Cached for CACHE_TTL.admins. The tab is only ever edited by hand, so a
 * change takes up to that long to land — or run flushHubCache(). */
function getAdminEmailSet() {
  return _adminSetPart(false).set;
}

function _adminSetPart(force) {
  return _cachedRead(_dataKey('admins', ['admins']), CACHE_TTL.admins, function () {
    return { at: nowIsoLocal(), set: _readAdminEmailSet() };
  }, force);
}

function _readAdminEmailSet() {
  const emails = _dataRows(getAdminsSheet(), 1);   // the email column only
  const set = {};
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

// ---------- Newsletter senders ----------

function canSendNewsletter(email) {
  const e = String(email || '').trim().toLowerCase();
  return NEWSLETTER_SENDERS.indexOf(e) !== -1;
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
function getRosterIndex() {
  // Returns { byEmail: { emailLower: { email, name, tags:[...] } }, allTags: [sorted unique], at }
  const part = _rosterPart(false);
  const result = { byEmail: {}, allTags: [], at: part.at };
  const tagSet = {};
  part.rows.forEach(function (r) {
    result.byEmail[r[0]] = { email: r[0], name: r[1], tags: r[2] };
    for (let j = 0; j < r[2].length; j++) tagSet[r[2][j]] = true;
  });
  result.allTags = Object.keys(tagSet).sort();
  return result;
}

/* The roster as rows, in sheet order, duplicates and all: [emailLower,
 * name, tags[]]. Kept as rows rather than a map because its two readers
 * disagree on duplicates — getRosterIndex keeps the last, the tracker the
 * first non-empty name — and both keep working as they always have. The
 * tab is hand-edited, so this lives for CACHE_TTL.roster; the dashboard's
 * Refresh button, or flushHubCache(), gets an edit in sooner. */
function _rosterPart(force) {
  return _cachedRead(_dataKey('roster', ['roster']), CACHE_TTL.roster, function () {
    const out = { at: nowIsoLocal(), rows: [] };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROSTER_SHEET);
    if (!sheet) return out;
    // Read at most ROSTER_HEADERS.length columns; tolerate older sheets
    // with only [email, name].
    const width = Math.min(sheet.getLastColumn(), ROSTER_HEADERS.length);
    const rows = _dataRows(sheet, width);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email = String(row[0] || '').trim().toLowerCase();
      if (!email) continue;
      out.rows.push([email, String(row[1] || ''), _parseList(row[2])]);
    }
    return out;
  }, force);
}

function getTagsForEmail(email) {
  const idx = getRosterIndex();
  const entry = idx.byEmail[String(email || '').trim().toLowerCase()];
  return entry ? entry.tags : [];
}

// ---------- Everyone who has signed in ----------

/* One entry per person who has ever signed in: [emailLower, name,
 * last_seen_iso], name being the first non-empty one in sheet order and
 * last_seen the latest last_used (or created) by instant. Bumped when a
 * session is created or revoked; last seen itself drifts on every request,
 * so the TTL is what keeps it honest. */
function _sessionPeople(force) {
  return _cachedRead(_dataKey('people', ['sessions']), CACHE_TTL.people, function () {
    const byEmail = {}, order = [];
    // Columns 2-6: email, name, created, expires, last_used. Not the token,
    // not user_agent.
    const rows = _dataRows(getSessionsSheet(), 5, 2);
    for (let i = 0; i < rows.length; i++) {
      const key = String(rows[i][0] || '').trim().toLowerCase();
      if (!key) continue;
      const name = rows[i][1] ? String(rows[i][1]) : '';
      const ts = _isoOut(rows[i][4] || rows[i][2] || '');
      const p = byEmail[key];
      if (!p) { byEmail[key] = { name: name, ts: ts }; order.push(key); continue; }
      if (name && !p.name) p.name = name;
      if (ts && _tsMs(ts) > _tsMs(p.ts)) p.ts = ts;
    }
    return {
      at: nowIsoLocal(),
      people: order.map(function (k) { return [k, byEmail[k].name, byEmail[k].ts]; })
    };
  }, force);
}

// ---------- Names and addresses for email ----------

/* Display names for a set of addresses, from the sessions tab (everyone
 * who has signed in) plus the optional roster tab. Lets a reminder open
 * with "Hi Sara," rather than an email address. */
function _namesForEmails(emails) {
  const want = {};
  emails.forEach(function (e) { want[e] = ''; });

  _sessionPeople(false).people.forEach(function (p) {
    if (p[0] in want && !want[p[0]] && p[1]) want[p[0]] = String(p[1]).trim();
  });
  _rosterPart(false).rows.forEach(function (r) {
    if (r[0] in want && !want[r[0]] && r[1]) want[r[0]] = String(r[1]).trim();
  });
  return want;
}

/* Everyone we could reasonably call "AISA staff": the roster if there is
 * one, plus anyone who has ever signed in to the Hub. Restricted to the
 * school domain so a stray row can never mail an outsider. */
function _allStaffEmails() {
  const seen = {};
  const push = function (raw) {
    const e = String(raw || '').trim().toLowerCase();
    const suffix = '@' + ALLOWED_DOMAIN;
    if (e.length > suffix.length && e.slice(-suffix.length) === suffix) seen[e] = true;
  };

  const roster = getRosterIndex();
  Object.keys(roster.byEmail).forEach(push);
  _sessionPeople(false).people.forEach(function (p) { push(p[0]); });
  return Object.keys(seen).sort();
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_11_people_() {}
