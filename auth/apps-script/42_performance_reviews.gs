/**
 * 42_performance_reviews.gs — the performance-review round trip.
 *
 * A member of staff fills in their part of a review form and sends it to a
 * line manager, picked from the `line_managers` tab; the manager completes
 * it and sends it back. Each move posts a notification to the other person.
 * One row per review, in `form_submissions`.
 */

// ---------- Line managers ----------

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

// End of 42_performance_reviews.gs. checkHubInstall() looks for the function below to
// confirm this whole file was pasted in: keep it the last thing here.
function endOf_42_performance_reviews_() {}
