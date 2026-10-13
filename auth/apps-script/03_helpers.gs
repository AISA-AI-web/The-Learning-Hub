/**
 * 03_helpers.gs — timestamps, and small utilities every other file uses.
 */

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

/* Epoch milliseconds for a timestamp cell, whatever shape it arrives in.
 *
 * Two things make a raw cell value untrustworthy to compare directly:
 *
 *  1. Google Sheets decides for itself whether an ISO string we wrote is
 *     text or a date. Date-formatted cells come back as Date OBJECTS, and
 *     String(date) is "Mon Mar 02 2026 ...", so a `a > b` string compare
 *     between two of them sorts by the English weekday name — Fri, Mon,
 *     Sat, Sun, Thu, Tue, Wed. "Latest wins" then picks at random.
 *  2. Rows written before the Abu Dhabi timezone change end in "Z" while
 *     newer ones end in "+04:00". Those are not lexicographically
 *     comparable either: 2026-06-18T02:00:00+04:00 sorts after
 *     2026-06-17T23:00:00Z but is an hour EARLIER.
 *
 * So never compare timestamp cells as strings — put both through here. */
function _isDate(v) {
  return Object.prototype.toString.call(v) === '[object Date]';
}

function _tsMs(v) {
  if (!v) return 0;
  if (_isDate(v)) { const t = v.getTime(); return isNaN(t) ? 0 : t; }
  const t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}

/* The same value as an ISO string the client can parse, so the browser
 * never receives "Mon Mar 02 2026 ..." from a date-formatted cell. */
function _isoOut(v) {
  if (!v) return '';
  if (_isDate(v)) return isNaN(v.getTime()) ? '' : isoLocal(v);
  return String(v);
}

/* The earlier of two ISO timestamps — "as of" for an answer assembled from
 * parts cached at different moments. */
function _olderIso(a, b) {
  if (!a) return b || nowIsoLocal();
  if (!b) return a;
  return _tsMs(a) <= _tsMs(b) ? a : b;
}

// ---------- Lists ----------

function _parseList(v) {
  return String(v == null ? '' : v)
    .split(',')
    .map(function (s) { return s.trim().toLowerCase(); })
    .filter(function (s) { return !!s; });
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_03_helpers_() {}
