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
const EVENTS_SHEET           = 'events';
const SESSIONS_SHEET         = 'sessions';
const SESSION_DURATION_DAYS  = 365;

const EVENT_HEADERS = [
  'timestamp_iso', 'email', 'name', 'module_id', 'event',
  'progress_pct', 'version', 'user_agent'
];

const SESSION_HEADERS = [
  'session_token', 'email', 'name', 'created_at_iso',
  'expires_at_iso', 'last_used_iso', 'user_agent'
];

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
      case 'whoami':
        return jsonOut({
          ok: true,
          email: claims.email,
          name:  claims.name || '',
          hd:    ALLOWED_DOMAIN
        });
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
  const nowIso = now.toISOString();
  const expIso = expiresAt.toISOString();

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

    try { sheet.getRange(i + 2, 6).setValue(new Date().toISOString()); } catch (_) {}

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
    new Date().toISOString(),
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

// ---------- Output ----------

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
