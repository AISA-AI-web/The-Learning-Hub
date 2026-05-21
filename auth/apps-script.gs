/**
 * AISA Learning Hub — Apps Script backend.
 *
 * Deploy this as a Web App from inside a Google Sheet:
 *   1. Open (or create) the Google Sheet that will hold the data.
 *   2. Extensions → Apps Script. Paste this file into Code.gs.
 *   3. Save, then Deploy → New deployment → type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone
 *      Click Deploy and authorize when prompted.
 *   4. Copy the resulting Web App URL.
 *   5. Open auth/gate.js in the Learning Hub repo and paste the URL
 *      into the API_URL constant near the top.
 *
 * Security model: anyone on the open internet can POST to this URL,
 * but every write/read requires a valid Google ID token issued to
 * our OAuth client AND a verified `hd` claim of aisa.sch.ae. Requests
 * without that are rejected before they touch the sheet.
 */

const OAUTH_CLIENT_ID = '719019551782-h9pdg57s6oq4jpo884a53o0d1pgel1u6.apps.googleusercontent.com';
const ALLOWED_DOMAIN  = 'aisa.sch.ae';
const EVENTS_SHEET    = 'events';

const EVENT_HEADERS = [
  'timestamp_iso', 'email', 'name', 'module_id', 'event',
  'progress_pct', 'version', 'user_agent'
];

// ---------- HTTP entry points ----------

function doGet(e) {
  return jsonOut({
    ok: true,
    service: 'aisa-learning-hub',
    hint: 'POST JSON to this URL with an action and id_token.'
  });
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const claims = verifyIdToken(body.id_token);
    if (!claims) return jsonOut({ ok: false, error: 'invalid_token' });

    switch (body.action) {
      case 'record_event':
        return jsonOut(recordEvent(claims, body));
      case 'get_completions':
        return jsonOut({ ok: true, completions: getCompletionsFor(claims.email) });
      case 'whoami':
        return jsonOut({
          ok: true,
          email: claims.email,
          name:  claims.name || '',
          hd:    claims.hd   || ''
        });
      default:
        return jsonOut({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// ---------- Token verification ----------

/**
 * Calls Google's tokeninfo endpoint to verify the ID token and check
 * audience + hosted domain + email_verified + expiry. Returns the
 * decoded claims object on success, or null on any failure.
 */
function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;

  const claims = JSON.parse(resp.getContentText());
  if (claims.aud !== OAUTH_CLIENT_ID) return null;
  if (claims.hd !== ALLOWED_DOMAIN) return null;
  // tokeninfo returns email_verified as the string "true"
  if (String(claims.email_verified) !== 'true') return null;
  if (Number(claims.exp) * 1000 < Date.now()) return null;
  if (!claims.email) return null;

  return claims;
}

// ---------- Storage ----------

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

/**
 * Returns one record per (module_id) for which this email has at least
 * one 'completed' event. Most-recent timestamp wins.
 */
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

/**
 * Apps Script Web Apps don't let us set custom CORS headers or HTTP
 * status codes — every response is 200 with the body indicating
 * success or failure. The frontend uses `text/plain` as the request
 * content type to avoid CORS preflight altogether.
 */
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
