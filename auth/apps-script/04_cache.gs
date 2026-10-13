/**
 * 04_cache.gs — the read cache in front of the spreadsheet.
 *
 * Copies only: losing the whole cache costs speed, never data. The two
 * functions you run by hand, flushHubCache() and warmHubCache(), are in
 * 90_editor_tools.gs.
 */

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

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_04_cache_() {}
