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
const MODULE_RESPONSES_SHEET = 'module_responses';  // free-text answers inside a training module
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

/* Who may send a newsletter to the whole school. Deliberately NOT the
 * `admins` tab: every SLT admin can post notifications and read the
 * tracker, but a school-wide mail blast is a much bigger button and is
 * held to two named people. Edit this list to change who has it.
 * This is the only enforcement that matters — the Hub's sign-in gate is
 * client-side, so hiding the button in the page proves nothing. */
const NEWSLETTER_SENDERS = ['bbaki@aisa.sch.ae', 'hodai@aisa.sch.ae'];

function canSendNewsletter(email) {
  const e = String(email || '').trim().toLowerCase();
  return NEWSLETTER_SENDERS.indexOf(e) !== -1;
}

const EVENT_HEADERS = [
  'timestamp_iso', 'email', 'name', 'module_id', 'event',
  'progress_pct', 'version', 'user_agent'
];

const SESSION_HEADERS = [
  'session_token', 'email', 'name', 'created_at_iso',
  'expires_at_iso', 'last_used_iso', 'user_agent'
];

/* How stale `last_used_iso` has to be before verifySessionToken() writes
 * it again. Every action the Hub offers verifies a session first, so
 * writing on every call put a spreadsheet write in front of every read —
 * six of them on one admin-dashboard load, all queuing on the same
 * sheet. The column only ever drives "last seen", so five minutes of
 * granularity costs nothing and takes the write off the common path. */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

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

/* Surveys can live in their own spreadsheet rather than the analytics
 * one. Leave empty to use the spreadsheet this script is bound to
 * (nothing to set up, the tab is created on first write). To split them
 * out: create a spreadsheet, paste its ID here, redeploy. The ID is the
 * long string in its URL between /d/ and /edit. Nothing else changes —
 * every survey function goes through _surveysSpreadsheet().
 *
 * Worth splitting out when the goal responses should be shareable with
 * secondary SLT without handing over the whole analytics workbook. */
const SURVEYS_SPREADSHEET_ID = '';

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

/* What each survey is and what it refuses to accept as finished.
 *
 * `required` is enforced on the server as well as in the page, because
 * "required entries" was the whole reason this did not stay a Google
 * Form — a client-side-only check is a suggestion, not a requirement.
 * `choices` pins the fields whose values must come from a fixed list,
 * so a hand-crafted POST can't invent a focus area that no report
 * groups by.
 *
 * Adding a survey: add an entry here and build the page. No new sheet,
 * no new endpoint. */
const SURVEY_SPECS = {
  'secondary-teacher-goal-2026-27': {
    title: 'AISA Secondary Teacher Personal Goal, 2026-27',
    required: ['name', 'email', 'department', 'at_aisa_last_year',
               'focus_area', 'goal', 'if_then'],
    choices: {
      at_aisa_last_year: ['Yes', 'No'],
      focus_area: [
        'Planning & Preparation for Learning',
        'Curriculum & Lesson Design',
        'Questioning & Discussion',
        'Student Engagement & Learning Behaviors',
        'Differentiation & Inclusion',
        'Assessment for Learning',
        'Classroom Climate & Relationships',
        'Use of Resources & Technology',
        'UAE Culture, Heritage & National Identity',
        'Professionalism, Collaboration & Family Partnership'
      ]
    },
    /* Order and labels for the emailed copy and the admin CSV. Keeps
     * the two exports in step with each other and with the form. */
    fields: [
      { key: 'name',               label: 'Name' },
      { key: 'email',              label: 'Email' },
      { key: 'department',         label: 'Department / Subject' },
      { key: 'at_aisa_last_year',  label: 'At AISA last year?' },
      { key: 'focus_area',         label: 'Focus area' },
      { key: 'goal',               label: 'Goal' },
      { key: 'if_then',            label: 'If-then plan' },
      { key: 'pl_supports',        label: 'Professional learning wanted' },
      { key: 'pl_other',           label: 'Professional learning — other' },
      { key: 'pl_detail',          label: 'What would make that support most useful' },
      { key: 'beyond_classroom',   label: 'Beyond the classroom' }
    ],
    confirmation:
      'Save a copy of this response. We’ll revisit this goal at your ' +
      'mid-year and end-of-year check-ins, and in your appraisal conversation.'
  }
};

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

// ---------- Read cache ----------
//
// WHY. Every request used to rebuild its answer from whole-sheet reads, and
// the first of those was always the entire `sessions` tab, just to find out
// who was asking. The Hub sends three or four requests per page view for
// every member of staff (pageview, admin check, notification bell,
// completions) and every one of them runs as the script owner, so they all
// share one spreadsheet and one execution quota with the admin dashboard.
// That is why the dashboard was quick when the school was quiet and slow, or
// dead, when it was busy: its own six heavy reads queued behind everybody
// else's.
//
// WHAT. CacheService's script cache is shared by every execution, answers in
// milliseconds where a sheet read takes hundreds, and here it holds COPIES
// ONLY:
//   - nothing goes into it that is not already in a sheet;
//   - every read falls back to the sheet on a miss or on any cache error;
//   - every entry expires on its own, after six hours at the very most.
// Losing the whole cache costs speed and never data. The spreadsheet is still
// the single source of truth, and no write changed what it writes or where.
//
// FRESHNESS. Every write the Hub makes bumps a "generation" for the data it
// touched, and cached reads are keyed by generation, so the Hub's own writes
// show up on the very next read. A generation cannot see someone editing the
// spreadsheet BY HAND. Those edits show up when the entry's TTL runs out
// (CACHE_TTL below, minutes), when an admin presses Refresh on the dashboard,
// or at once after running flushHubCache() from the editor.

const CACHE_NS         = 'hub1';   // change to orphan every cached entry at once
const CACHE_CHUNK      = 30000;    // chars per entry: the cap is 100 KB, and one char can be 3 bytes
const CACHE_MAX_CHUNKS = 60;       // ~1.8M chars; anything bigger is re-read each time instead
const CACHE_MAX_TTL_S  = 21600;    // CacheService's own ceiling (6 h)

/* Seconds. The short ones are the data people edit by hand in the
 * spreadsheet, or that drifts on every request (last seen); the long ones
 * are invalidated precisely by the write that changes them. */
const CACHE_TTL = {
  session:     3600,  // one signed-in token; sign_out removes it at once
  admins:       600,  // the admins tab: hand-edited
  roster:       900,  // the roster tab: hand-edited
  people:       600,  // who has signed in, and last seen
  completions: 3600,  // events: bumped by record_event
  dwell:        600,  // written every 30 s per reader, so TTL, not generation
  responses:   3600,  // module_responses: bumped on save
  surveys:     3600,  // survey_responses: bumped on save
  notifs:      3600,  // notifications: bumped on post and delete
  reads:       1800,  // one person's read receipts: bumped on mark-read
  rowhint:    21600   // "this person's row is row N" hints, verified before use
};

/* Set per request, for an admin's Refresh: recompute from the sheets and
 * store the result, rather than serving what is cached. Apps Script starts
 * every execution with fresh globals, so this cannot leak between people. */
let _REQ_FRESH = false;
let _cacheHandle;          // undefined until first asked for; null if unavailable
const _MEMO = {};          // per-execution: one cache read per key per request

function _cache() {
  if (_cacheHandle === undefined) {
    try { _cacheHandle = CacheService.getScriptCache(); } catch (e) { _cacheHandle = null; }
  }
  return _cacheHandle;
}

/* Not Math.random: that feeds session tokens and notification ids, and the
 * cache has no business moving their sequence. Lower-case hex only, which
 * the chunk manifest in _cacheGet relies on. */
function _newStamp() {
  return Utilities.getUuid().replace(/[^0-9a-f]/gi, '').slice(0, 12).toLowerCase();
}

/* The epoch plus one generation per domain, as one string for a cache key.
 * A missing epoch or generation (never set, expired, evicted) is minted on
 * the spot, which reads as "everything under it is stale" — the safe way
 * round. Returns null when the cache is unavailable, which callers treat as
 * "don't cache". */
function _stamp(domains) {
  const c = _cache();
  if (!c) return null;
  try {
    const keys = [CACHE_NS + ':epoch'].concat((domains || []).map(function (d) {
      return CACHE_NS + ':gen:' + d;
    }));
    const got = c.getAll(keys) || {};
    const minted = {};
    let any = false;
    const vals = keys.map(function (k) {
      if (got[k]) return got[k];
      const v = _newStamp();
      minted[k] = v;
      any = true;
      return v;
    });
    if (any) c.putAll(minted, CACHE_MAX_TTL_S);
    return vals.join('.');
  } catch (e) {
    return null;
  }
}

/* Call AFTER the sheet write, never before: a reader that fetched the old
 * generation can then only ever file its result under the old one. */
function _bump(domain) {
  const c = _cache();
  if (!c) return;
  const k = CACHE_NS + ':gen:' + domain;
  try { c.put(k, _newStamp(), CACHE_MAX_TTL_S); }
  catch (e) { try { c.remove(k); } catch (e2) {} }
}

function _dataKey(name, domains) {
  const st = _stamp(domains);
  return st ? CACHE_NS + ':' + name + ':' + st : null;
}

function _cacheGet(key) {
  const c = _cache();
  if (!c || !key) return null;
  try {
    const head = c.get(key);
    if (head == null) return null;
    if (head.charAt(0) !== '#') return JSON.parse(head);
    /* '#<nonce>:<n>' — too big for one entry, stored in n chunks. */
    const m = /^#([a-z0-9]+):(\d+)$/.exec(head);
    if (!m) return null;
    const n = Number(m[2]);
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '#' + m[1] + '#' + i);
    const parts = c.getAll(keys) || {};
    let s = '';
    for (let i = 0; i < n; i++) {
      const p = parts[keys[i]];
      if (p == null) return null;   // a chunk was evicted: a miss, not an error
      s += p;
    }
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

function _cachePut(key, value, ttlS) {
  const c = _cache();
  if (!c || !key || key.length > 200) return;
  try {
    const s = JSON.stringify(value);
    const ttl = Math.max(1, Math.min(CACHE_MAX_TTL_S, Math.floor(ttlS) || 1));
    if (s.length <= CACHE_CHUNK) { c.put(key, s, ttl); return; }
    const nonce = _newStamp();
    const parts = {};
    let n = 0, i = 0;
    while (i < s.length) {
      let end = Math.min(i + CACHE_CHUNK, s.length);
      /* Never split a surrogate pair: each half is an invalid string on
       * its own and would not survive the round trip. */
      const code = s.charCodeAt(end - 1);
      if (end < s.length && code >= 0xD800 && code <= 0xDBFF) end--;
      parts[key + '#' + nonce + '#' + n] = s.slice(i, end);
      n++;
      i = end;
      if (n > CACHE_MAX_CHUNKS) return;
    }
    /* Chunks first, and outliving the manifest, so a live manifest never
     * points at chunks that are not there yet or already gone. The nonce
     * keeps two concurrent writers from interleaving each other's chunks. */
    c.putAll(parts, Math.min(CACHE_MAX_TTL_S, ttl + 60));
    c.put(key, '#' + nonce + ':' + n, ttl);
  } catch (e) {
    /* Too big, over quota, service hiccup: the next read recomputes. */
  }
}

function _cacheDel(key) {
  const c = _cache();
  if (!c || !key) return;
  try { c.remove(key); } catch (e) {}
  delete _MEMO[key];
}

/* The one way data is read through the cache. `compute` must read the
 * sheet and return plain JSON-able data; it runs on a miss, on a cache
 * error, when the cache is unavailable (key null), or when forced. */
function _cachedRead(key, ttlS, compute, force) {
  const fresh = !!(force || _REQ_FRESH);
  if (key && !fresh) {
    if (Object.prototype.hasOwnProperty.call(_MEMO, key)) return _MEMO[key];
    const hit = _cacheGet(key);
    if (hit !== null) { _MEMO[key] = hit; return hit; }
  }
  const v = compute();
  if (key) { _cachePut(key, v, ttlS); _MEMO[key] = v; }
  return v;
}

/* Row hints: "this person's row in that sheet is row N". Only ever a hint —
 * whoever uses one reads that row back and checks it really is the right
 * person before touching it, so a stale hint (rows deleted or sorted by
 * hand) costs one extra read and never a write to the wrong row. */
function _rowHint(key) {
  const v = _cacheGet(key);
  return (typeof v === 'number' && v >= 2) ? v : 0;
}
function _setRowHint(key, row) {
  if (row >= 2) _cachePut(key, row, CACHE_TTL.rowhint);
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
        _REQ_FRESH = _wantsFresh(body);
        return jsonOut(adminDwell());

      // Everything the admin dashboard shows, in one execution: one session
      // check, one admin check, one cold start, instead of six of each.
      case 'admin_dashboard':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        _REQ_FRESH = _wantsFresh(body);
        return jsonOut(adminDashboard(body));

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

      // ----- Free-text capture inside training modules -----
      case 'save_module_response':
        return jsonOut(saveModuleResponse(claims, body));
      case 'get_module_response':
        return jsonOut(getModuleResponse(claims, body));
      case 'admin_module_responses':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        _REQ_FRESH = _wantsFresh(body);
        return jsonOut(adminModuleResponses(body));

      // ----- Surveys (required-entry forms filled in on the Hub) -----
      case 'save_survey_response':
        return jsonOut(saveSurveyResponse(claims, body));
      case 'get_survey_response':
        return jsonOut(getSurveyResponse(claims, body));
      case 'admin_survey_responses':
        if (!isAdmin(claims.email)) return jsonOut({ ok: false, error: 'not_admin' });
        _REQ_FRESH = _wantsFresh(body);
        return jsonOut(adminSurveyResponses(body));
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
        _REQ_FRESH = _wantsFresh(body);
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

      // ----- Newsletter mail-out -----
      case 'newsletter_status':
        return jsonOut(newsletterStatus(claims));
      case 'send_newsletter':
        if (!canSendNewsletter(claims.email)) {
          return jsonOut({ ok: false, error: 'not_newsletter_sender' });
        }
        return jsonOut(sendNewsletter(claims, body));
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
    /* A code the pages can switch on, with the exception alongside. The
     * raw exception text used to be the code, and the admin dashboard —
     * which reads anything that isn't lower_snake_case as its OWN crash —
     * then blamed itself for a spreadsheet timeout on Google's side. */
    return jsonOut({ ok: false, error: 'server_error', message: String(err && err.message || err) });
  }
}

/* An admin's Refresh button. Honoured only on the admin reads, after the
 * admin check, so nobody else can make the backend skip its cache. */
function _wantsFresh(body) {
  const f = body && body.fresh;
  return f === true || String(f || '') === '1';
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

  const sheet = getSessionsSheet();
  sheet.appendRow([
    token,
    claims.email,
    claims.name || '',
    nowIso,
    expIso,
    nowIso,
    String(userAgent || '').slice(0, 300)
  ]);
  _bump('sessions');   // a new person may have just appeared on the tracker

  /* Prime the session cache so the first request after sign-in doesn't
   * scan the sheet. The row number is a guess under concurrent sign-ins,
   * which is fine: it is checked before anything is written to it. */
  _cacheSession(token, {
    e: claims.email, n: claims.name || '', x: expiresAt.getTime(),
    r: sheet.getLastRow(), w: now.getTime()
  });

  return { token: token, expiresAt: expIso };
}

function _sessionKey(token) { return CACHE_NS + ':s:' + token; }

/* Cached per token: { e: email, n: name, x: expires ms, r: sheet row,
 * w: when last_used was last written, ep: epoch }. `ep` ties the entry to
 * the current epoch, so flushHubCache() re-verifies every session at once. */
function _cacheSession(token, v) {
  const ep = _stamp([]);
  if (!ep || !v || !v.x) return;
  v.ep = ep;
  const ttl = Math.min(CACHE_TTL.session, Math.floor((v.x - Date.now()) / 1000));
  if (ttl > 0) _cachePut(_sessionKey(token), v, ttl);
}

/**
 * Who is this token? The answer is cached for up to CACHE_TTL.session, so
 * the common case reads no sheet at all — this runs before every single
 * action the Hub offers, and it used to read the whole `sessions` tab each
 * time.
 *
 * last_used_iso is still written at most every LAST_USED_WRITE_INTERVAL_MS,
 * exactly as before, but only after reading that one row back and seeing
 * this token in it: rows move when a session is signed out (deleteRow), so a
 * remembered row number is a hint, never an address to write to blindly.
 */
function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || token.length > 200) return null;
  const skey = _sessionKey(token);
  const c = _cache();
  let hit = null;
  if (c) {
    try {
      const ekey = CACHE_NS + ':epoch';
      const got = c.getAll([ekey, skey]) || {};
      if (got[ekey] && got[skey]) {
        const v = JSON.parse(got[skey]);
        if (v && v.ep === got[ekey] && v.e) hit = v;
      }
    } catch (e) { hit = null; }
  }
  if (!hit) return _verifySessionFromSheet(token);

  const now = Date.now();
  if (!hit.x || now > hit.x) { _cacheDel(skey); return null; }
  if (!hit.w || now - hit.w > LAST_USED_WRITE_INTERVAL_MS) {
    if (!_touchSessionRow(hit.r, token)) {
      /* The row moved or is gone. Ask the sheet, which is the authority:
       * a session deleted by hand stops working here. */
      _cacheDel(skey);
      return _verifySessionFromSheet(token);
    }
    hit.w = now;
    _cacheSession(token, hit);
  }
  return { email: hit.e, name: hit.n };
}

/* The full check against the `sessions` tab — what every request used to
 * do. Reads six columns, not seven: user_agent is the widest and nothing
 * here needs it. */
function _verifySessionFromSheet(token) {
  const sheet = getSessionsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return null;

  const values = sheet.getRange(2, 1, last - 1, 6).getValues();
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row[0] !== token) continue;

    const expiresAtMs = new Date(row[4]).getTime();   // unchanged from before the cache
    if (!expiresAtMs || Date.now() > expiresAtMs) return null;

    let wroteMs = _tsMs(row[5]);
    if (!wroteMs || (Date.now() - wroteMs) > LAST_USED_WRITE_INTERVAL_MS) {
      try { sheet.getRange(i + 2, 6).setValue(nowIsoLocal()); wroteMs = Date.now(); } catch (_) {}
    }

    _cacheSession(token, { e: row[1], n: row[2], x: expiresAtMs, r: i + 2, w: wroteMs });
    return { email: row[1], name: row[2] };
  }
  return null;
}

/* Write last_used on the remembered row — but only if that row still holds
 * this token. False means "don't trust the hint, go and look". */
function _touchSessionRow(row, token) {
  if (!row || row < 2) return false;
  let sheet;
  try {
    sheet = getSessionsSheet();
    if (sheet.getRange(row, 1).getValue() !== token) return false;
  } catch (e) {
    return false;
  }
  try { sheet.getRange(row, 6).setValue(nowIsoLocal()); } catch (_) {}
  return true;
}

function revokeSession(token) {
  if (!token) return;
  _cacheDel(_sessionKey(token));   // first, so it stops working even if the sheet write fails
  const sheet = getSessionsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return;
  const tokens = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0] === token) {
      sheet.deleteRow(i + 2);
      _bump('sessions');
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
  _bump('events');   // the teacher's own dashboard and the tracker see it on the next read
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
  /* The layout check reads the header row; once it has passed, remember
   * that for an hour rather than re-reading it every 30 seconds per reader.
   * Only the "already migrated" answer is remembered, never the other. */
  const layoutKey = CACHE_NS + ':dwell_layout_ok';
  if (_cacheGet(layoutKey) !== 1) {
    if (dwellSheetIsLegacy(sheet)) {
      return {
        ok: false,
        error: 'dwell_sheet_needs_migration',
        hint: 'Run migrateDwellToPerModule() once from the Apps Script editor.'
      };
    }
    _cachePut(layoutKey, 1, 3600);
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

  /* Locate the existing (email × module) row, if any. This runs every 30
   * seconds for everyone reading a module, so try the remembered row first
   * — one row read, checked for the right person and module — and only
   * scan the sheet when that hint is missing or wrong. */
  const hintKey = CACHE_NS + ':dwrow:' + emailLower + '|' + moduleId;
  let foundRow = 0, firstSeen = now;
  const hinted = _rowHint(hintKey);
  if (hinted) {
    try {
      const r = sheet.getRange(hinted, 1, 1, DWELL_HEADERS.length).getValues()[0];
      if (String(r[idx.email] || '').toLowerCase() === emailLower &&
          String(r[idx.module] || '') === moduleId) {
        foundRow = hinted;
        /* _isoOut, not String(): a date-typed cell used to come back as
         * "Mon Mar 02 2026 …" and be written back into the sheet so. */
        firstSeen = _isoOut(r[idx.first]) || now;
      }
    } catch (e) { /* past the end of the sheet — fall through to the scan */ }
  }
  if (!foundRow) {
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const existing = sheet.getRange(2, 1, lastRow - 1, DWELL_HEADERS.length).getValues();
      for (let i = 0; i < existing.length; i++) {
        const r = existing[i];
        if (String(r[idx.email] || '').toLowerCase() !== emailLower) continue;
        if (String(r[idx.module] || '') !== moduleId) continue;
        foundRow = i + 2;
        firstSeen = _isoOut(r[idx.first]) || now;
        break;
      }
    }
  }

  const rowValues = [
    now, firstSeen, emailLower, name, moduleId,
    totalSeconds, chaptersSeen, avg, userAgent
  ];
  if (foundRow) {
    sheet.getRange(foundRow, 1, 1, DWELL_HEADERS.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
    /* Probably our row; if a concurrent append beat us to it, the check
     * above rejects the hint next time and the scan finds the real one. */
    foundRow = sheet.getLastRow();
  }
  _setRowHint(hintKey, foundRow);
  return { ok: true, written: 1, total_seconds: totalSeconds, chapters_seen: chaptersSeen, avg_secs_per_chapter: avg };
}

/* Admin view: flat per-teacher × per-module rows. The dashboard renders
 * a sortable table directly from this — no client-side pivot needed. */
function adminDwell() {
  const part = _dwellPart(false);
  if (part.legacy) {
    return {
      ok: false,
      error: 'dwell_sheet_needs_migration',
      hint: 'Run migrateDwellToPerModule() once from the Apps Script editor.'
    };
  }
  return { ok: true, generated_at: part.at, rows: part.rows };
}

/* The dwell rows as the admin views read them. Cached by TTL rather than by
 * generation: every reader of a module writes to this sheet every 30
 * seconds, so a generation would be bumped faster than anyone could read
 * it. Engagement ten minutes old is still engagement; Refresh gets it live. */
function _dwellPart(force) {
  return _cachedRead(_dataKey('dwell', ['dwell']), CACHE_TTL.dwell, _readDwellRows, force);
}

function _readDwellRows() {
  const sheet = getDwellSheet();
  if (dwellSheetIsLegacy(sheet)) return { at: nowIsoLocal(), legacy: true, rows: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { at: nowIsoLocal(), rows: [] };
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
      first_seen:            _isoOut(r[idx.first]),
      last_seen:             _isoOut(r[idx.updated])
    };
  });
  return { at: nowIsoLocal(), rows: rows };
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

  _bump('dwell');
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

// ---------- Module free-text responses ----------

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

/* Find the row index (1-based, including the header row) for this
 * person's row in this module, or 0 if they have never saved. */
function _findModuleResponseRow(sheet, email, moduleId) {
  return _findRowByPair(sheet, MODULE_RESPONSE_HEADERS, 'email', 'module_id', email, moduleId);
}

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

function _moduleRowHintKey(email, moduleId) {
  return CACHE_NS + ':mrrow:' + email + '|' + moduleId;
}

/**
 * Merge one segment's answers into this person's row for this module.
 * Called as the teacher types (debounced client-side), so it must be
 * cheap and must never lose a segment that isn't in this payload.
 */
function saveModuleResponse(claims, body) {
  const moduleId  = String(body.module_id  || '').slice(0, 80).trim();
  const segmentId = String(body.segment_id || '').slice(0, 80).trim();
  if (!moduleId)  return { ok: false, error: 'missing_module_id' };
  if (!segmentId) return { ok: false, error: 'missing_segment_id' };

  const email = String(claims.email || '').trim().toLowerCase();
  const data  = (body.data && typeof body.data === 'object') ? body.data : {};
  const now   = nowIsoLocal();

  const sheet = getModuleResponsesSheet();
  const lock  = LockService.getScriptLock();
  /* Two tabs open, or a debounced save racing a Next click, would
   * otherwise read-modify-write the same blob and drop a segment. */
  try { lock.waitLock(10000); } catch (e) { return { ok: false, error: 'busy_try_again' }; }

  try {
    /* The lock is global, so everything done while holding it holds up
     * every other teacher's save. The row hint turns "scan two columns,
     * then read the row" into "read the row". */
    const hintKey = _moduleRowHintKey(email, moduleId);
    const found  = _findOwnRow(sheet, MODULE_RESPONSE_HEADERS, 'email', 'module_id',
                               email, moduleId, hintKey);
    const rowIdx = found.row;
    let blob = {};
    let firstSaved = now;
    let completedAt = '';

    if (rowIdx) {
      const existing = found.values;
      const rawJson  = String(existing[MODULE_RESPONSE_HEADERS.indexOf('data_json')] || '');
      try { blob = rawJson ? JSON.parse(rawJson) : {}; } catch (e) { blob = {}; }
      firstSaved  = existing[MODULE_RESPONSE_HEADERS.indexOf('first_saved_iso')] || now;
      completedAt = existing[MODULE_RESPONSE_HEADERS.indexOf('completed_at_iso')] || '';
    }

    data._saved_at = now;
    blob[segmentId] = data;

    if (body.completed) completedAt = completedAt || now;

    const segmentsDone = Object.keys(blob).join(',');
    const dataJson = JSON.stringify(blob).slice(0, 90000);
    const flagged = _moduleResponseIsFlagged(blob);

    const row = new Array(MODULE_RESPONSE_HEADERS.length).fill('');
    function set(h, v) { row[MODULE_RESPONSE_HEADERS.indexOf(h)] = v; }
    set('first_saved_iso',  firstSaved);
    set('updated_at_iso',   now);
    set('email',            email);
    set('name',             claims.name || '');
    set('module_id',        moduleId);
    set('segments_done',    segmentsDone);
    set('data_json',        dataJson);
    set('flagged',          flagged);
    set('completed_at_iso', completedAt);
    set('user_agent',       String(body.user_agent || '').slice(0, 300));

    if (rowIdx) {
      sheet.getRange(rowIdx, 1, 1, MODULE_RESPONSE_HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      /* Only this function appends here, always under the script lock,
       * so the last row is ours. */
      _setRowHint(hintKey, sheet.getLastRow());
    }
    _bump('responses');

    /* "What do you need before go-live?" is the one answer that is
     * useless if it sits unread until after the deadline — push it at
     * the admins the moment it lands, once per person per module. */
    if (body.notify_admins && data.needs_before && String(data.needs_before).trim()) {
      _notifyAdminsOfModuleRequest(claims, moduleId, String(data.needs_before).trim());
    }

    return { ok: true, segments_done: segmentsDone.split(','), updated_at: now };
  } finally {
    lock.releaseLock();
  }
}

/* True when any saved segment carries an unresolved ask or blocker. */
function _moduleResponseIsFlagged(blob) {
  for (const k in blob) {
    if (!Object.prototype.hasOwnProperty.call(blob, k)) continue;
    const seg = blob[k];
    if (!seg || typeof seg !== 'object') continue;
    if (seg.needs_before && String(seg.needs_before).trim()) return true;
    if (seg.blocked === true) return true;
  }
  return false;
}

function _notifyAdminsOfModuleRequest(claims, moduleId, text) {
  const admins = Object.keys(getAdminEmailSet());
  if (!admins.length) return;
  _fireSystemNotification(
    claims.email,
    claims.name || '',
    'Module request — ' + moduleId,
    (claims.name || claims.email) + ' needs something before they can teach:\n\n' + text.slice(0, 1500),
    admins
  );
}

/** A teacher reading back their own answers, for resume. Own row only. */
function getModuleResponse(claims, body) {
  const moduleId = String(body.module_id || '').slice(0, 80).trim();
  if (!moduleId) return { ok: false, error: 'missing_module_id' };

  const email  = String(claims.email || '').trim().toLowerCase();
  const sheet  = getModuleResponsesSheet();
  const found  = _findOwnRow(sheet, MODULE_RESPONSE_HEADERS, 'email', 'module_id',
                             email, moduleId, _moduleRowHintKey(email, moduleId));
  if (!found.row) return { ok: true, found: false, data: {} };

  const r = found.values;
  let blob = {};
  try { blob = JSON.parse(String(r[MODULE_RESPONSE_HEADERS.indexOf('data_json')] || '') || '{}'); }
  catch (e) { blob = {}; }

  return {
    ok: true,
    found: true,
    data: blob,
    updated_at:   _isoOut(r[MODULE_RESPONSE_HEADERS.indexOf('updated_at_iso')]),
    completed_at: _isoOut(r[MODULE_RESPONSE_HEADERS.indexOf('completed_at_iso')])
  };
}

/**
 * Every response for one module — the ADEK evidence export and the
 * pre-session read. Admin-gated by the router.
 */
function adminModuleResponses(body) {
  const moduleId = String((body && body.module_id) || '').slice(0, 80).trim();
  const part = _moduleResponsesPart(false);
  const responses = moduleId
    ? part.rows.filter(function (r) { return String(r.module_id).trim() === moduleId; })
    : part.rows;
  return { ok: true, module_id: moduleId, responses: responses, generated_at: part.at };
}

/* Every module's responses, parsed. Cached by generation: saveModuleResponse
 * bumps it, so a teacher's latest answer is on the dashboard at its next
 * read. Personal data — it lives in this script's own cache and nowhere
 * else, for an hour at most, and only admins' requests ever read it. */
function _moduleResponsesPart(force) {
  return _cachedRead(_dataKey('responses', ['responses']), CACHE_TTL.responses,
                     _readModuleResponseRows, force);
}

function _readModuleResponseRows() {
  const sheet = getModuleResponsesSheet();
  const last  = sheet.getLastRow();
  if (last < 2) return { at: nowIsoLocal(), rows: [] };

  const rows = sheet.getRange(2, 1, last - 1, MODULE_RESPONSE_HEADERS.length).getValues();
  const idx = {};
  MODULE_RESPONSE_HEADERS.forEach(function (h, i) { idx[h] = i; });

  const out = [];
  rows.forEach(function (r) {
    let blob = {};
    try { blob = JSON.parse(String(r[idx.data_json] || '') || '{}'); } catch (e) { blob = {}; }
    out.push({
      email:        String(r[idx.email] || ''),
      name:         String(r[idx.name]  || ''),
      module_id:    String(r[idx.module_id] || ''),
      first_saved:  _isoOut(r[idx.first_saved_iso]),
      updated_at:   _isoOut(r[idx.updated_at_iso]),
      completed_at: _isoOut(r[idx.completed_at_iso]),
      segments_done: String(r[idx.segments_done] || '').split(',').filter(Boolean),
      flagged:      r[idx.flagged] === true || String(r[idx.flagged]).toUpperCase() === 'TRUE',
      data:         blob
    });
  });

  return { at: nowIsoLocal(), rows: out };
}

// ---------- Surveys (required-entry forms filled in on the Hub) ----------

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

/* Row index (1-based, header included) for this person's response to
 * this survey, or 0 if they have never saved one. */
function _findSurveyRow(sheet, email, surveyId) {
  return _findRowByPair(sheet, SURVEY_HEADERS, 'email', 'survey_id', email, surveyId);
}

/* The surveys sheet can live in its own spreadsheet, so the hint key says
 * which one — a row number from one workbook is meaningless in another. */
function _surveyRowHintKey(email, surveyId) {
  return CACHE_NS + ':svrow:' + String(SURVEYS_SPREADSHEET_ID || 'bound').slice(0, 12) +
         ':' + email + '|' + surveyId;
}

/* Normalise one submitted value. Arrays (checkbox groups) come back as
 * arrays; everything else as a trimmed string. Length caps are generous
 * enough for a paragraph answer and mean a pasted essay can't blow the
 * 50k-character cell limit. */
function _surveyValue(v) {
  if (Array.isArray(v)) {
    return v.map(function (x) { return String(x == null ? '' : x).slice(0, 300).trim(); })
            .filter(function (x) { return !!x; })
            .slice(0, 40);
  }
  if (v === true || v === false) return v;
  return String(v == null ? '' : v).slice(0, 8000).trim();
}

function _surveyIsEmpty(v) {
  if (Array.isArray(v)) return v.length === 0;
  if (v === true) return false;
  if (v === false) return true;
  return !String(v == null ? '' : v).trim();
}

/* Which required fields are missing, and which pinned fields hold a
 * value that isn't on their list. Returns [] when the response is
 * complete and internally consistent. */
function _validateSurvey(spec, data) {
  const missing = [];
  (spec.required || []).forEach(function (key) {
    if (_surveyIsEmpty(data[key])) missing.push(key);
  });

  const invalid = [];
  const choices = spec.choices || {};
  Object.keys(choices).forEach(function (key) {
    const v = data[key];
    if (_surveyIsEmpty(v)) return;   // already covered by `required`
    if (choices[key].indexOf(String(v)) === -1) invalid.push(key);
  });

  return { missing: missing, invalid: invalid };
}

/**
 * Save one survey response — draft or final.
 *
 * Called on a debounce as the teacher types (`submit` false) and again
 * when they press Submit (`submit` true). Only the submit path is
 * validated: a draft is allowed to be half-empty, that is what a draft
 * is. A validated submission stamps submitted_at and emails the teacher
 * their copy, replacing what the Google Form used to do.
 *
 * Re-submitting an already-submitted response is an edit: revision goes
 * up, submitted_at stays at the first commitment.
 */
function saveSurveyResponse(claims, body) {
  const surveyId = String(body.survey_id || '').slice(0, 80).trim();
  if (!surveyId) return { ok: false, error: 'missing_survey_id' };

  const spec = SURVEY_SPECS[surveyId];
  if (!spec) return { ok: false, error: 'unknown_survey' };

  const email = String(claims.email || '').trim().toLowerCase();
  const raw   = (body.data && typeof body.data === 'object') ? body.data : {};
  const submit = body.submit === true;

  /* Only fields the spec knows about are stored. Keeps the blob in step
   * with the CSV columns and stops an old tab from a previous version of
   * the form writing keys nothing reads. */
  const data = {};
  (spec.fields || []).forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(raw, f.key)) {
      data[f.key] = _surveyValue(raw[f.key]);
    }
  });

  if (submit) {
    const bad = _validateSurvey(spec, data);
    if (bad.missing.length || bad.invalid.length) {
      /* The client checks the same rules first, so landing here means a
       * stale tab or a hand-made request — say which fields, so the page
       * can point at them rather than showing a shrug. */
      return {
        ok: false, error: 'missing_required',
        missing: bad.missing, invalid: bad.invalid
      };
    }
  }

  const now   = nowIsoLocal();
  const sheet = getSurveysSheet();
  const lock  = LockService.getScriptLock();
  /* A debounced autosave racing the Submit click would otherwise let the
   * draft write land last and un-submit a finished goal. */
  try { lock.waitLock(10000); } catch (e) { return { ok: false, error: 'busy_try_again' }; }

  try {
    const hintKey = _surveyRowHintKey(email, surveyId);
    const found   = _findOwnRow(sheet, SURVEY_HEADERS, 'email', 'survey_id',
                                email, surveyId, hintKey);
    const rowIdx  = found.row;
    let firstSaved  = now;
    let submittedAt = '';
    let revision    = 0;
    let existingData = {};

    if (rowIdx) {
      const existing = found.values;
      firstSaved  = existing[SURVEY_HEADERS.indexOf('first_saved_iso')] || now;
      submittedAt = existing[SURVEY_HEADERS.indexOf('submitted_at_iso')] || '';
      revision    = Number(existing[SURVEY_HEADERS.indexOf('revision')] || 0) || 0;
      try {
        existingData = JSON.parse(String(existing[SURVEY_HEADERS.indexOf('data_json')] || '') || '{}');
      } catch (e) { existingData = {}; }
    }

    /* Merge over what is already stored so a page that posts a partial
     * payload (one step of the wizard) never blanks the other steps. */
    const merged = {};
    Object.keys(existingData).forEach(function (k) { merged[k] = existingData[k]; });
    Object.keys(data).forEach(function (k) { merged[k] = data[k]; });

    if (submit) {
      /* Validate the merged result too: a client that posts only the
       * last step must not be able to submit past an empty step one. */
      const bad = _validateSurvey(spec, merged);
      if (bad.missing.length || bad.invalid.length) {
        return {
          ok: false, error: 'missing_required',
          missing: bad.missing, invalid: bad.invalid
        };
      }
      submittedAt = submittedAt || now;
      revision   += 1;
    }

    const status = submit ? 'submitted' : (submittedAt ? 'submitted' : 'draft');

    const row = new Array(SURVEY_HEADERS.length).fill('');
    function set(h, v) { row[SURVEY_HEADERS.indexOf(h)] = v; }
    set('first_saved_iso',  firstSaved);
    set('updated_at_iso',   now);
    set('submitted_at_iso', submittedAt);
    set('email',            email);
    set('name',             claims.name || '');
    set('survey_id',        surveyId);
    set('status',           status);
    set('revision',         revision);
    set('data_json',        JSON.stringify(merged).slice(0, 45000));
    set('user_agent',       String(body.user_agent || '').slice(0, 300));

    if (rowIdx) {
      sheet.getRange(rowIdx, 1, 1, SURVEY_HEADERS.length).setValues([row]);
    } else {
      sheet.appendRow(row);
      _setRowHint(hintKey, sheet.getLastRow());   // sole writer, under the lock
    }
    _bump('surveys');

    const out = {
      ok: true, status: status, revision: revision,
      updated_at: now, submitted_at: submittedAt
    };

    /* "A copy of your response will be emailed to you" — the one thing
     * the Google Form did that people will miss. Sent only on a real
     * submission, never on an autosave, and never allowed to fail the
     * save: the row is already written by this point. */
    if (submit && body.email_copy !== false) {
      out.email = _sendSurveyCopy(claims, spec, merged, revision);
    }

    return out;
  } finally {
    lock.releaseLock();
  }
}

/** A teacher reading back their own response, to resume or to edit. */
function getSurveyResponse(claims, body) {
  const surveyId = String(body.survey_id || '').slice(0, 80).trim();
  if (!surveyId) return { ok: false, error: 'missing_survey_id' };
  if (!SURVEY_SPECS[surveyId]) return { ok: false, error: 'unknown_survey' };

  const email  = String(claims.email || '').trim().toLowerCase();
  const sheet  = getSurveysSheet();
  const found  = _findOwnRow(sheet, SURVEY_HEADERS, 'email', 'survey_id',
                             email, surveyId, _surveyRowHintKey(email, surveyId));
  if (!found.row) return { ok: true, found: false, data: {}, status: 'none' };

  const r = found.values;
  let blob = {};
  try { blob = JSON.parse(String(r[SURVEY_HEADERS.indexOf('data_json')] || '') || '{}'); }
  catch (e) { blob = {}; }

  return {
    ok: true,
    found: true,
    data:         blob,
    status:       String(r[SURVEY_HEADERS.indexOf('status')] || 'draft'),
    revision:     Number(r[SURVEY_HEADERS.indexOf('revision')] || 0) || 0,
    updated_at:   _isoOut(r[SURVEY_HEADERS.indexOf('updated_at_iso')]),
    submitted_at: _isoOut(r[SURVEY_HEADERS.indexOf('submitted_at_iso')])
  };
}

/**
 * Every response to one survey, plus who hasn't answered.
 *
 * Admin-gated by the router. `outstanding` is the roster minus the
 * people who have submitted, optionally narrowed to a roster tag
 * (e.g. 'secondary'), which is what makes the admin view a tracker
 * rather than a pile of answers. Staff who aren't on the roster tab
 * simply don't appear in it.
 */
function adminSurveyResponses(body) {
  const surveyId = String(body.survey_id || '').slice(0, 80).trim();
  if (!surveyId) return { ok: false, error: 'missing_survey_id' };

  const spec  = SURVEY_SPECS[surveyId] || null;
  const part  = _surveysPart(false);

  const out = [];
  const answered = {};
  part.rows.forEach(function (r) {
    if (r.sid !== surveyId) return;
    if (r.status === 'submitted') answered[String(r.email).toLowerCase()] = true;
    out.push({
      email:        r.email,
      name:         r.name,
      survey_id:    surveyId,
      status:       r.status,
      revision:     r.revision,
      first_saved:  r.first_saved,
      updated_at:   r.updated_at,
      submitted_at: r.submitted_at,
      data:         r.data
    });
  });

  /* Who still owes one. Tag defaults to nothing = the whole roster.
   * Each entry carries its roster tags, so the dashboard can switch
   * cohort without asking again. */
  const wantTag = String(body.roster_tag || '').trim().toLowerCase();
  const roster  = getRosterIndex();
  const outstanding = [];
  Object.keys(roster.byEmail).forEach(function (email) {
    if (answered[email]) return;
    const person = roster.byEmail[email];
    if (wantTag && (person.tags || []).indexOf(wantTag) === -1) return;
    outstanding.push({ email: person.email, name: person.name, tags: person.tags || [] });
  });

  return {
    ok: true,
    survey_id:    surveyId,
    title:        spec ? spec.title : surveyId,
    fields:       spec ? spec.fields : [],
    responses:    out,
    outstanding:  outstanding,
    roster_tags:  roster.allTags,
    /* The roster is the part that can be stale (hand-edited, TTL-cached);
     * the responses are bumped by every save, so they are current. */
    generated_at: roster.at || nowIsoLocal()
  };
}

/* Every survey row, parsed. Bumped by saveSurveyResponse. Personal data,
 * same handling as _moduleResponsesPart. */
function _surveysPart(force) {
  return _cachedRead(_dataKey('surveys', ['surveys']), CACHE_TTL.surveys, _readSurveyRows, force);
}

function _readSurveyRows() {
  const sheet = getSurveysSheet();
  const last  = sheet.getLastRow();
  const idx = {};
  SURVEY_HEADERS.forEach(function (h, i) { idx[h] = i; });
  const rows = [];
  if (last >= 2) {
    sheet.getRange(2, 1, last - 1, SURVEY_HEADERS.length).getValues().forEach(function (r) {
      let blob = {};
      try { blob = JSON.parse(String(r[idx.data_json] || '') || '{}'); } catch (e) { blob = {}; }
      rows.push({
        sid:          String(r[idx.survey_id]).trim(),
        email:        String(r[idx.email] || ''),
        name:         String(r[idx.name] || ''),
        status:       String(r[idx.status] || 'draft'),
        revision:     Number(r[idx.revision] || 0) || 0,
        first_saved:  _isoOut(r[idx.first_saved_iso]),
        updated_at:   _isoOut(r[idx.updated_at_iso]),
        submitted_at: _isoOut(r[idx.submitted_at_iso]),
        data:         blob
      });
    });
  }
  return { at: nowIsoLocal(), rows: rows };
}

/* The earlier of two ISO timestamps — "as of" for an answer assembled from
 * parts cached at different moments. */
function _olderIso(a, b) {
  if (!a) return b || nowIsoLocal();
  if (!b) return a;
  return _tsMs(a) <= _tsMs(b) ? a : b;
}

/* The teacher's own copy of what they submitted, in the Hub's email
 * styling. Never throws — the response is already saved, and a mail
 * problem must not read back as a failed submission. */
function _sendSurveyCopy(claims, spec, data, revision) {
  const to = String(claims.email || '').trim();
  if (!to) return { sent: 0, skipped: 1, reason: 'no_address' };
  try {
    if (MailApp.getRemainingDailyQuota() <= 0) {
      return { sent: 0, skipped: 1, reason: 'quota_exhausted' };
    }
  } catch (e) { /* fall through and let sendEmail report the real problem */ }

  const first  = _firstName(claims.name || data.name || '');
  const greet  = first ? ('Hi ' + first + ',') : 'Hi,';
  const intro  = (revision > 1)
    ? 'You’ve updated your personal goal for 2026-27. Here it is as it now stands.'
    : 'Here’s the personal goal you just set for 2026-27. Keep this — it’s what we’ll come back to at your mid-year and end-of-year check-ins, and in your appraisal conversation.';

  /* Plain-text twin of the HTML, for clients that won't render it. */
  const lines = [];
  const htmlRows = [];
  (spec.fields || []).forEach(function (f) {
    const v = data[f.key];
    if (_surveyIsEmpty(v)) return;
    const text = Array.isArray(v) ? v.join(', ') : String(v);
    lines.push(f.label + ':\n' + text);
    htmlRows.push(
      '<tr><td style="padding:0 0 14px;">' +
        '<p style="margin:0 0 3px;font-size:11px;font-weight:700;letter-spacing:.07em;' +
           'text-transform:uppercase;color:#8B7BB8;">' + _escHtml(f.label) + '</p>' +
        '<p style="margin:0;font-size:14px;line-height:1.6;color:#334155;white-space:pre-wrap;">' +
          _escHtml(text).replace(/\n/g, '<br>') + '</p>' +
      '</td></tr>'
    );
  });

  const html = _aisaEmailShell(
    'Your 2026-27 Personal Goal',
    '<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#21076C;">' + _escHtml(greet) + '</p>' +
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">' + _escHtml(intro) + '</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      htmlRows.join('') +
    '</table>',
    'You submitted this through the AISA Learning Hub. You can reopen and ' +
    'edit your goal there at any time — we’ll always look at the latest version.'
  );

  try {
    MailApp.sendEmail({
      to:       to,
      subject:  'Your copy — ' + spec.title,
      body:     greet + '\n\n' + intro + '\n\n' + lines.join('\n\n'),
      htmlBody: html,
      name:     'AISA Learning Hub'
    });
    return { sent: 1, failed: 0, skipped: 0 };
  } catch (err) {
    return { sent: 0, failed: 1, skipped: 0, error: String(err) };
  }
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
  _bump('notifs');
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
      created_at_iso:   _isoOut(r[idx.created_at_iso]),
      updated_at_iso:   _isoOut(r[idx.updated_at_iso]),
      status:           String(r[idx.status] || ''),
      form_id:          String(r[idx.form_id] || ''),
      form_url:         String(r[idx.form_url] || ''),
      form_title:       String(r[idx.form_title] || ''),
      staff_email:      staffE,
      staff_name:       String(r[idx.staff_name] || ''),
      manager_email:    mgrE,
      manager_name:     String(r[idx.manager_name] || ''),
      completed_at_iso: _isoOut(r[idx.completed_at_iso]),
      role:             (me === staffE) ? 'staff' : 'manager'
    });
  }
  /* Newest first, by instant — see "Reading timestamps out of the sheets"
   * in CLAUDE.md for why this is never a string compare. */
  out.sort(function (a, b) { return _tsMs(b.updated_at_iso) - _tsMs(a.updated_at_iso); });
  return { ok: true, submissions: out };
}

// ---------- Completions ----------

function getCompletionsFor(email) {
  email = String(email || '').trim().toLowerCase();
  const idx = _completionsIndex(false);
  const out = [];
  for (let i = 0; i < idx.list.length; i++) {
    const e = idx.list[i];
    if (e[0] !== email) continue;
    out.push({ module_id: e[1], completed_at: e[2], version: e[3] });
  }
  return out;
}

/* The latest 'completed' event per person x module, for everybody — what
 * both get_completions (a teacher's own dashboard, every module page) and
 * admin_overview used to work out by reading the entire events sheet on
 * every call. Now read once and cached until record_event bumps it.
 *
 *   list : [[emailLower, module_id, completed_at_iso, version], ...] in the
 *          order each person x module first appears in the sheet
 *   names: { emailLower: first non-empty name on a completed row }
 *
 * The rules are exactly the ones both callers used: emails trimmed and
 * lower-cased, "latest" by instant through _tsMs (never a string compare),
 * and on a tie the earlier row wins. */
function _completionsIndex(force) {
  return _cachedRead(_dataKey('completions', ['events']), CACHE_TTL.completions,
                     _readCompletionsIndex, force);
}

function _readCompletionsIndex() {
  const sheet = getEventsSheet();
  const last = sheet.getLastRow();
  const list = [], pos = {}, names = {};
  if (last >= 2) {
    /* Up to `version` (column 7). user_agent is the widest column and
     * nothing here reads it. */
    const width = EVENT_HEADERS.indexOf('version') + 1;
    const values = sheet.getRange(2, 1, last - 1, width).getValues();
    const idx = {
      ts:      EVENT_HEADERS.indexOf('timestamp_iso'),
      email:   EVENT_HEADERS.indexOf('email'),
      name:    EVENT_HEADERS.indexOf('name'),
      module:  EVENT_HEADERS.indexOf('module_id'),
      event:   EVENT_HEADERS.indexOf('event'),
      version: EVENT_HEADERS.indexOf('version')
    };
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (row[idx.event] !== 'completed') continue;
      const email    = String(row[idx.email] || '').trim().toLowerCase();
      const moduleId = String(row[idx.module] || '');
      const ts       = _isoOut(row[idx.ts] || '');
      const version  = String(row[idx.version] || '');
      if (email && row[idx.name] && !names[email]) names[email] = String(row[idx.name]);
      const key = email + '|' + moduleId;
      const at = pos[key];
      if (at === undefined) {
        pos[key] = list.length;
        list.push([email, moduleId, ts, version]);
      } else if (_tsMs(ts) > _tsMs(list[at][2])) {
        list[at][2] = ts;
        list[at][3] = version;
      }
    }
  }
  return { at: nowIsoLocal(), list: list, names: names };
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
      if (ts && _tsMs(ts) > _tsMs(people[key].last_seen)) people[key].last_seen = ts;
    }
  }

  /* Assembled from three cached parts, in the same order and by the same
   * rules as when this read all three sheets itself on every call. */

  // Everyone who has signed in (sessions tab).
  const signedIn = _sessionPeople(false);
  signedIn.people.forEach(function (p) { touch(p[0], p[1], p[2]); });

  // Optional roster tab (email, name) so staff who never signed in
  // still show up as outstanding.
  const roster = _rosterPart(false);
  roster.rows.forEach(function (r) { touch(r[0], r[1], ''); });

  // Latest 'completed' per person × module.
  const ci = _completionsIndex(false);
  const completions = [];
  ci.list.forEach(function (e) {
    touch(e[0], ci.names[e[0]] || '', e[2]);  // ensure the person exists
    completions.push({ email: e[0], module_id: e[1], completed_at: e[2] });
  });

  return {
    ok: true,
    /* As of the oldest part that can drift. Completions are bumped by
     * every record_event, so they are current whenever they were read. */
    generated_at: _olderIso(signedIn.at, roster.at),
    people: Object.keys(people).map(function (k) { return people[k]; }),
    completions: completions
  };
}

/**
 * Everything admin-dashboard.html shows, in one request.
 *
 * The page used to fire admin_overview, admin_dwell, admin_module_responses
 * and admin_survey_responses (twice, when the roster had a `secondary` tag)
 * one after another, and each paid its own cold start, session check,
 * admin check and full-sheet reads. Here they share one of each.
 *
 * Every part is independent: one that throws comes back as
 * { ok: false, error, message } and the rest still arrive, so a problem in
 * the survey sheet can't blank the compliance tracker. The individual
 * endpoints are unchanged, and the page falls back to them if this one is
 * missing (a backend that hasn't been redeployed yet).
 *
 *   parts      comma list, default all four: overview,dwell,module_responses,survey
 *   module_id  for module_responses
 *   survey_id  for survey; its `outstanding` is the whole roster with tags,
 *              and the page narrows it by tag itself
 *   fresh      '1' = the Refresh button: re-read the sheets
 */
function adminDashboard(body) {
  body = body || {};
  const want = _parseList(body.parts || 'overview,dwell,module_responses,survey');
  const out = { ok: true, generated_at: nowIsoLocal() };
  function part(name, fn) {
    if (want.indexOf(name) === -1) return;
    try { out[name] = fn(); }
    catch (e) { out[name] = { ok: false, error: 'server_error', message: String(e && e.message || e) }; }
  }
  part('overview', adminOverview);
  part('dwell', adminDwell);
  part('module_responses', function () { return adminModuleResponses({ module_id: body.module_id }); });
  part('survey', function () { return adminSurveyResponses({ survey_id: body.survey_id, roster_tag: '' }); });
  return out;
}

/* One entry per person who has ever signed in: [emailLower, name,
 * last_seen_iso], name being the first non-empty one in sheet order and
 * last_seen the latest last_used (or created) by instant. Bumped when a
 * session is created or revoked; last seen itself drifts on every request,
 * so the TTL is what keeps it honest. */
function _sessionPeople(force) {
  return _cachedRead(_dataKey('people', ['sessions']), CACHE_TTL.people, function () {
    const sess = getSessionsSheet();
    const sLast = sess.getLastRow();
    const byEmail = {}, order = [];
    if (sLast >= 2) {
      // Columns 2-6: email, name, created, expires, last_used. Not the token,
      // not user_agent.
      const rows = sess.getRange(2, 2, sLast - 1, 5).getValues();
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
    }
    return {
      at: nowIsoLocal(),
      people: order.map(function (k) { return [k, byEmail[k].name, byEmail[k].ts]; })
    };
  }, force);
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
    const last = sheet.getLastRow();
    if (last < 2) return out;
    // Read at most ROSTER_HEADERS.length columns; tolerate older sheets
    // with only [email, name].
    const width = Math.min(sheet.getLastColumn(), ROSTER_HEADERS.length);
    const rows = sheet.getRange(2, 1, last - 1, width).getValues();
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
  /* Every page load reads this for the notification bell, for everyone.
   * Posting or deleting a notification bumps it. */
  return _cachedRead(_dataKey('notifs', ['notifs']), CACHE_TTL.notifs, _readActiveNotificationsFromSheet);
}

function _readActiveNotificationsFromSheet() {
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
      created_at:    _isoOut(r[i_ts]),
      author_name:   String(r[i_name] || ''),
      title:         String(r[i_title] || ''),
      body:          String(r[i_body] || ''),
      target_tags:   _parseList(i_tags < width ? r[i_tags] : ''),
      target_emails: _parseList(i_em   < width ? r[i_em]   : '')
    });
  }
  /* Newest first by instant. A string compare put "Z" rows and "+04:00"
   * rows in the wrong order, and a date-typed cell sorted by weekday name. */
  out.sort(function (a, b) { return _tsMs(b.created_at) - _tsMs(a.created_at); });
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

/** Set of notification ids this email has already read. Cached per person,
 *  and bumped per person when they mark something read — the reads tab is
 *  the one that grows with every notification times every reader. */
function readIdsFor(email) {
  const target = String(email || '').trim().toLowerCase();
  const key = target ? _dataKey('reads:' + target, ['reads:' + target]) : null;
  return _cachedRead(key, CACHE_TTL.reads, function () { return _readIdsFromSheet(target); });
}

function _readIdsFromSheet(target) {
  const sheet = getNotifReadsSheet();
  const last = sheet.getLastRow();
  const set = {};
  if (last < 2) return set;
  const rows = sheet.getRange(2, 1, last - 1, 2).getValues();   // id, email
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
  _bump('notifs');

  const out = {
    ok: true, id: id,
    target_tags: target_tags, target_emails: target_emails
  };

  // Optional second delivery: real email on top of the in-app bell.
  // Only ever to an explicit recipient list, so an "everyone" audience
  // can never turn into a school-wide blast by accident.
  const wantEmail = body.send_email === true ||
                    String(body.send_email || '') === '1' ||
                    String(body.send_email || '').toLowerCase() === 'true';
  if (wantEmail) {
    out.email = target_emails.length
      ? _sendReminderEmails(claims, target_emails, title, text,
                            String(body.email_link || '').trim(),
                            String(body.email_link_label || '').trim())
      : { sent: 0, failed: 0, skipped: 0, reason: 'no_explicit_recipients' };
  }
  return out;
}

// ---------- Reminder emails ----------
//
// Reminders post to the in-app bell first (that write always happens);
// email is an optional second delivery on top, so a mail failure can
// never lose the notification itself.

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

function _firstName(name) {
  const n = String(name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* AISA-branded HTML reminder: deep royal purple header, mustard-gold
 * call-to-action, white body. Table-based and inline-styled because
 * that is what mail clients reliably render. */
function _reminderHtml(greeting, bodyText, linkUrl, linkLabel) {
  // The in-app body carries the link inline; in email the button covers
  // it, so drop the line that would just repeat the URL.
  let text = String(bodyText || '');
  if (linkUrl) {
    text = text.split('\n')
      .filter(function (line) { return line.indexOf(linkUrl) === -1; })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const paras = text.split(/\n{2,}/).filter(function (p) { return p.trim(); })
    .map(function (p) {
      return '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">' +
        _escHtml(p).replace(/\n/g, '<br>') + '</p>';
    }).join('');

  const button = linkUrl
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">' +
        '<tr><td style="background:#D8B664;border-radius:8px;">' +
          '<a href="' + _escHtml(linkUrl) + '" ' +
             'style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;' +
             'color:#21076C;text-decoration:none;">' +
            _escHtml(linkLabel || 'Open the training') +
          '</a>' +
        '</td></tr></table>'
    : '';

  return _aisaEmailShell(
    'Professional Development',
    (greeting ? '<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#21076C;">' +
       _escHtml(greeting) + '</p>' : '') + paras + button,
    'Sent from the AISA Learning Hub. This reminder is also waiting ' +
    'in your notifications the next time you sign in.'
  );
}

/* The AISA-branded email frame every Hub email sits in: deep royal
 * purple header, mustard-gold kicker, white body, grey footnote.
 * Table-based and inline-styled because that is what mail clients
 * reliably render. `inner` and `footer` are already-escaped HTML. */
function _aisaEmailShell(kicker, inner, footer) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
           'style="background:#f8fafc;padding:24px 12px;"><tr><td align="center">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;' +
             'font-family:\'DM Sans\',\'Segoe UI\',Arial,sans-serif;">' +
        '<tr><td style="background:#21076C;padding:20px 28px;">' +
          '<p style="margin:0;color:#ffffff;font-size:17px;font-weight:700;">AISA Learning Hub</p>' +
          '<p style="margin:3px 0 0;color:#D8B664;font-size:11px;font-weight:700;' +
             'letter-spacing:.09em;text-transform:uppercase;">' + _escHtml(kicker) + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' + inner + '</td></tr>' +
        '<tr><td style="padding:16px 28px 24px;border-top:1px solid #eef2f7;">' +
          '<p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">' +
            _escHtml(footer) +
          '</p>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

/* One personalised email per recipient. Never throws: a mail problem is
 * reported back as counts so the caller can tell the admin exactly what
 * happened, while the in-app notification stands regardless. */
function _sendReminderEmails(claims, emails, title, bodyText, linkUrl, linkLabel) {
  const out = { sent: 0, failed: 0, skipped: 0, quota_left: 0, errors: [] };
  if (!emails.length) return out;

  const q = _mailQuota();
  const quota = q.quota;
  out.quota_left = quota;
  if (q.error) {
    // Same trap as the newsletter: a thrown quota read means the script
    // was never authorised to send, which is not "out of quota".
    out.error = 'mail_not_authorized';
    out.message = q.error;
    out.skipped = emails.length;
    return out;
  }
  if (quota <= 0) { out.skipped = emails.length; out.reason = 'daily_quota_exhausted'; return out; }

  const names   = _namesForEmails(emails);
  const subject = title || 'A reminder from the AISA Learning Hub';
  const replyTo = String(claims && claims.email || '').trim();
  const started = Date.now();

  for (let i = 0; i < emails.length; i++) {
    // Stop short of the web app's 6-minute execution cap and of the daily
    // mail quota; whatever is left is reported as skipped, not lost.
    if (Date.now() - started > 240000 || out.sent >= quota) {
      out.skipped += emails.length - i;
      break;
    }
    const to    = emails[i];
    const first = _firstName(names[to]);
    const greet = first ? ('Hi ' + first + ',') : 'Hi,';
    const opts  = {
      to:       to,
      subject:  subject,
      body:     greet + '\n\n' + bodyText + (linkUrl ? '\n\n' + linkUrl : ''),
      htmlBody: _reminderHtml(greet, bodyText, linkUrl, linkLabel),
      name:     'AISA Learning Hub'
    };
    if (replyTo) opts.replyTo = replyTo;

    try {
      MailApp.sendEmail(opts);
      out.sent++;
    } catch (err) {
      out.failed++;
      if (out.errors.length < 5) out.errors.push(String(err));
    }
  }
  return out;
}

// ---------- Newsletter mail-out ----------
//
// One button, two people, the whole school in the "to" line. Kept apart
// from post_notification on purpose: that one refuses to email a tag
// audience precisely so nobody blasts the school by accident, and this
// one exists to do exactly that, deliberately, from a short allowlist.

/* Reading the mail quota needs the send-mail scope, so this throws --
 * not returns zero -- when the script has never been authorised to send.
 * Those two cases need completely different advice ("wait until
 * tomorrow" vs "grant the permission"), so keep them apart and never
 * collapse a thrown error into a quota of 0. */
function _mailQuota() {
  try {
    return { quota: MailApp.getRemainingDailyQuota(), error: '' };
  } catch (e) {
    return { quota: 0, error: String(e && e.message || e) };
  }
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

/* Newsletter bullets arrive either as a JSON array or as one string per
 * line. Not _parseList: that lowercases and splits on commas, which is
 * right for tags and wrong for a sentence like "Level 1, due Sept 30". */
function _newsletterItems(v) {
  const raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/);
  return raw.map(function (t) { return String(t == null ? '' : t).trim(); })
            .filter(function (t) { return !!t; });
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

/* What the page needs to decide whether to show the send bar at all, and
 * to tell the sender how many people are about to hear from them. */
function newsletterStatus(claims) {
  const may = canSendNewsletter(claims.email);
  const out = { ok: true, may_send: may };
  if (!may) return out;
  out.recipients = _allStaffEmails().length;
  const q = _mailQuota();
  out.quota_left = q.quota;
  if (q.error) { out.mail_authorized = false; out.mail_error = q.error; }
  else         { out.mail_authorized = true; }
  return out;
}

function sendNewsletter(claims, body) {
  // Run bare from the editor this would throw on body.url. Say what to do
  // instead, because "TypeError: cannot read properties of undefined" is
  // not a useful thing to meet when you are trying to debug a send.
  if (!claims || !body) {
    return { ok: false, error: 'not_callable_from_editor',
             message: 'sendNewsletter is called by the Hub with a signed-in user. '
                    + 'To grant the mail permission, run authorizeMail() instead.' };
  }
  const url = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'missing_url' };

  const testOnly = String(body.test_only || '') === '1' ||
                   String(body.test_only || '').toLowerCase() === 'true';
  // A real send has to say so. Nothing goes school-wide on a stray click.
  if (!testOnly && String(body.confirm || '') !== '1') {
    return { ok: false, error: 'not_confirmed' };
  }

  const subject  = String(body.subject  || 'The Digital Lion — AISA Learning Hub').trim();
  const issue    = String(body.issue    || '').trim();
  const headline = String(body.headline || '').trim();
  const intro    = String(body.intro    || '').trim();
  const label    = String(body.link_label || 'Read the newsletter').trim();
  const items    = _newsletterItems(body.items).slice(0, 8);

  const emails = testOnly ? [String(claims.email || '').trim().toLowerCase()]
                          : _allStaffEmails();
  const out = {
    ok: true, test_only: testOnly, recipients: emails.length,
    sent: 0, failed: 0, skipped: 0, quota_left: 0, errors: []
  };
  if (!emails.length) { out.ok = false; out.error = 'no_recipients'; return out; }

  const q = _mailQuota();
  const quota = q.quota;
  out.quota_left = quota;
  if (q.error) {
    // Not a quota problem: the script has never been allowed to send mail.
    out.ok = false;
    out.error = 'mail_not_authorized';
    out.message = q.error;
    return out;
  }
  if (quota <= 0) { out.skipped = emails.length; out.reason = 'daily_quota_exhausted'; return out; }

  const names   = _namesForEmails(emails);
  const replyTo = String(claims && claims.email || '').trim();
  const started = Date.now();

  for (let i = 0; i < emails.length; i++) {
    // Same caps as the reminder mailer: stop short of the 6-minute
    // execution limit and the daily quota, and report the rest as
    // skipped so the sender knows to run it again rather than assuming
    // everyone got it.
    if (Date.now() - started > 240000 || out.sent >= quota) {
      out.skipped += emails.length - i;
      break;
    }
    const to    = emails[i];
    const first = _firstName(names[to]);
    const greet = first ? ('Hi ' + first + ',') : 'Hi,';
    const opts  = {
      to:       to,
      subject:  subject,
      body:     greet + '\n\n' + (headline ? headline + '\n\n' : '') +
                (intro ? intro + '\n\n' : '') +
                (items.length ? items.map(function (t) { return '• ' + t; }).join('\n') + '\n\n' : '') +
                url,
      htmlBody: _newsletterHtml(greet, issue, headline, intro, items, url, label),
      name:     'AISA Learning Hub'
    };
    if (replyTo) opts.replyTo = replyTo;

    try {
      MailApp.sendEmail(opts);
      out.sent++;
    } catch (err) {
      out.failed++;
      if (out.errors.length < 5) out.errors.push(String(err));
    }
  }
  return out;
}

/* The newsletter email: the same AISA frame as the PD reminders, with a
 * gold issue kicker, the headline, a short intro, up to eight
 * what's-inside lines and one big button through to the real thing.
 * The body stays short on purpose — the email is the trailer, the Hub
 * page is the newsletter. */
function _newsletterHtml(greeting, issue, headline, intro, items, url, linkLabel) {
  const para = function (t) {
    return '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">' +
      _escHtml(t).replace(/\n/g, '<br>') + '</p>';
  };

  const list = items && items.length
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
             'style="margin:0 0 20px;background:#F2EFFA;border-radius:10px;">' +
        '<tr><td style="padding:16px 18px;">' +
          items.map(function (t, i) {
            const gap = (i === items.length - 1) ? '0' : '0 0 8px';
            return '<p style="margin:' + gap + ';font-size:14px;line-height:1.55;color:#21076C;">' +
              '<span style="color:#D8B664;font-weight:700;">•</span>&nbsp;' + _escHtml(t) + '</p>';
          }).join('') +
        '</td></tr></table>'
    : '';

  const button =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">' +
      '<tr><td style="background:#D8B664;border-radius:8px;">' +
        '<a href="' + _escHtml(url) + '" ' +
           'style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;' +
           'color:#21076C;text-decoration:none;">' + _escHtml(linkLabel) + '</a>' +
      '</td></tr></table>';

  return _aisaEmailShell(
    issue || 'The Digital Lion',
    (greeting ? '<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#21076C;">' +
       _escHtml(greeting) + '</p>' : '') +
    (headline ? '<p style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;' +
       'color:#21076C;">' + _escHtml(headline) + '</p>' : '') +
    (intro ? para(intro) : '') + list + button,
    'Sent from the AISA Learning Hub. You can read this and every past ' +
    'issue any time from the Media Hub.'
  );
}

function markNotificationRead(claims, body) {
  const id = String(body.notification_id || '').trim();
  if (!id) return { ok: false, error: 'missing_notification_id' };
  // Avoid duplicate read rows for the same person + notification.
  if (readIdsFor(claims.email)[id]) return { ok: true, already: true };
  getNotifReadsSheet().appendRow([id, claims.email, nowIsoLocal()]);
  _bump('reads:' + String(claims.email || '').trim().toLowerCase());
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
    _bump('reads:' + String(claims.email || '').trim().toLowerCase());
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
      _bump('notifs');
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

  /* Copies, not the notifications themselves: those are the cached list
   * other callers in this request may still be reading. */
  const items = notifs.map(function (n) {
    const o = {};
    Object.keys(n).forEach(function (k) { o[k] = n[k]; });
    o.read_count      = counts[n.id] || 0;
    o.recipient_count = resolveAudience(n);
    return o;
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

/**
 * DIAGNOSTIC — run from the Apps Script editor (Run → auditHubData) when
 * the dashboard and the spreadsheet seem to disagree.
 *
 * Reads only; changes nothing. Prints a report and also returns it as a
 * string, so it works from the editor or from a scratch function.
 *
 * It checks the three things that actually cause a silent mismatch:
 *
 *  1. HEADER DRIFT. Every reader in this file addresses columns BY
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

// ---------- Output ----------

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
