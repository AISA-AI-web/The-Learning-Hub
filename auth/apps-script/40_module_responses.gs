/**
 * 40_module_responses.gs — what teachers type inside a training module.
 *
 * Backs the AI Literacy Teacher Readiness module: answers are saved segment
 * by segment as the teacher types, read back so they can carry on where they
 * left off, and read by admins on the dashboard and in the ADEK evidence CSV.
 *
 * PERSONAL DATA under UAE Federal Decree-Law No. 45 of 2021. Only admins
 * read other people's answers; a teacher only ever reads back their own.
 * See the note on the `module_responses` tab in 01_sheets.gs.
 */

/* Find the row index (1-based, including the header row) for this
 * person's row in this module, or 0 if they have never saved. */
function _findModuleResponseRow(sheet, email, moduleId) {
  return _findRowByPair(sheet, MODULE_RESPONSE_HEADERS, 'email', 'module_id', email, moduleId);
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

// End of 40_module_responses.gs. checkHubInstall() looks for the function below to
// confirm this whole file was pasted in: keep it the last thing here.
function endOf_40_module_responses_() {}
