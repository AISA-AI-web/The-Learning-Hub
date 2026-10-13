/**
 * 10_sessions.gs — signing in.
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

/* How stale `last_used_iso` has to be before verifySessionToken() writes
 * it again. Every action the Hub offers verifies a session first, so
 * writing on every call put a spreadsheet write in front of every read —
 * six of them on one admin-dashboard load, all queuing on the same
 * sheet. The column only ever drives "last seen", so five minutes of
 * granularity costs nothing and takes the write off the common path. */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

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
  sheet.appendRow(_rowFrom(SESSION_HEADERS, {
    session_token:  token,
    email:          claims.email,
    name:           claims.name || '',
    created_at_iso: nowIso,
    expires_at_iso: expIso,
    last_used_iso:  nowIso,
    user_agent:     String(userAgent || '').slice(0, 300)
  }));
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
  const col = _colIndex(SESSION_HEADERS);
  const values = _dataRows(sheet, col.user_agent);   // every column before user_agent
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (row[col.session_token] !== token) continue;

    const expiresAtMs = new Date(row[col.expires_at_iso]).getTime();   // unchanged from before the cache
    if (!expiresAtMs || Date.now() > expiresAtMs) return null;

    let wroteMs = _tsMs(row[col.last_used_iso]);
    if (!wroteMs || (Date.now() - wroteMs) > LAST_USED_WRITE_INTERVAL_MS) {
      try { sheet.getRange(i + 2, col.last_used_iso + 1).setValue(nowIsoLocal()); wroteMs = Date.now(); } catch (_) {}
    }

    _cacheSession(token, { e: row[col.email], n: row[col.name], x: expiresAtMs, r: i + 2, w: wroteMs });
    return { email: row[col.email], name: row[col.name] };
  }
  return null;
}

/* Write last_used on the remembered row — but only if that row still holds
 * this token. False means "don't trust the hint, go and look". */
function _touchSessionRow(row, token) {
  if (!row || row < 2) return false;
  const col = _colIndex(SESSION_HEADERS);
  let sheet;
  try {
    sheet = getSessionsSheet();
    if (sheet.getRange(row, col.session_token + 1).getValue() !== token) return false;
  } catch (e) {
    return false;
  }
  try { sheet.getRange(row, col.last_used_iso + 1).setValue(nowIsoLocal()); } catch (_) {}
  return true;
}

function revokeSession(token) {
  if (!token) return;
  _cacheDel(_sessionKey(token));   // first, so it stops working even if the sheet write fails
  const sheet = getSessionsSheet();
  const tokens = _dataRows(sheet, 1);   // session_token is column A
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0] === token) {
      sheet.deleteRow(i + 2);
      _bump('sessions');
      return;
    }
  }
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_10_sessions_() {}
