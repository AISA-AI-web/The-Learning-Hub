/**
 * 20_tracking.gs — what staff do on the Hub.
 *
 *   record_event      a module started or completed        → events
 *   get_completions   a teacher's own completions           ← events
 *   record_pageview   every page view                       → pageviews
 *   record_click      tagged buttons and links              → clicks
 *   record_dwell      time spent in a module                → dwell
 *   admin_dwell       everyone's time per module, admins    ← dwell
 */

// ---------- Event recording ----------

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

// ---------- Page views & tagged clicks ----------

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

// End of 20_tracking.gs. checkHubInstall() looks for the function below to
// confirm this whole file was pasted in: keep it the last thing here.
function endOf_20_tracking_() {}
