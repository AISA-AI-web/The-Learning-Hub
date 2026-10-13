/**
 * 41_surveys.gs — structured forms filled in on the Hub.
 *
 * Today that is the Secondary Teacher Personal Goal form
 * (Tools and Resources/secondary-teacher-goal.html). Another survey is an
 * entry in SURVEY_SPECS below and a page: no new tab, no new endpoint.
 *
 * PERSONAL DATA under UAE Federal Decree-Law No. 45 of 2021: see the note
 * on the `survey_responses` tab in 01_sheets.gs.
 */

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
 * value that isn't on their list. Both lists are empty when the response
 * is complete and internally consistent. */
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

/* The answer to send back when `data` cannot be submitted as it stands,
 * naming the fields so the page can point at them; null when it can. */
function _surveyRefusal(spec, data) {
  const bad = _validateSurvey(spec, data);
  if (!bad.missing.length && !bad.invalid.length) return null;
  return {
    ok: false, error: 'missing_required',
    missing: bad.missing, invalid: bad.invalid
  };
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
    /* The client checks the same rules first, so landing here means a
     * stale tab or a hand-made request — say which fields, so the page
     * can point at them rather than showing a shrug. */
    const refusal = _surveyRefusal(spec, data);
    if (refusal) return refusal;
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
    const col     = _colIndex(SURVEY_HEADERS);
    let firstSaved  = now;
    let submittedAt = '';
    let revision    = 0;
    let existingData = {};

    if (rowIdx) {
      const existing = found.values;
      firstSaved  = existing[col.first_saved_iso] || now;
      submittedAt = existing[col.submitted_at_iso] || '';
      revision    = Number(existing[col.revision] || 0) || 0;
      try {
        existingData = JSON.parse(String(existing[col.data_json] || '') || '{}');
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
      const refusal = _surveyRefusal(spec, merged);
      if (refusal) return refusal;
      submittedAt = submittedAt || now;
      revision   += 1;
    }

    const status = submit ? 'submitted' : (submittedAt ? 'submitted' : 'draft');

    const row = _rowFrom(SURVEY_HEADERS, {
      first_saved_iso:  firstSaved,
      updated_at_iso:   now,
      submitted_at_iso: submittedAt,
      email:            email,
      name:             claims.name || '',
      survey_id:        surveyId,
      status:           status,
      revision:         revision,
      data_json:        JSON.stringify(merged).slice(0, 45000),
      user_agent:       String(body.user_agent || '').slice(0, 300)
    });

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
  const col = _colIndex(SURVEY_HEADERS);
  let blob = {};
  try { blob = JSON.parse(String(r[col.data_json] || '') || '{}'); }
  catch (e) { blob = {}; }

  return {
    ok: true,
    found: true,
    data:         blob,
    status:       String(r[col.status] || 'draft'),
    revision:     Number(r[col.revision] || 0) || 0,
    updated_at:   _isoOut(r[col.updated_at_iso]),
    submitted_at: _isoOut(r[col.submitted_at_iso])
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
  const col = _colIndex(SURVEY_HEADERS);
  const rows = [];
  _dataRows(getSurveysSheet(), SURVEY_HEADERS.length).forEach(function (r) {
    let blob = {};
    try { blob = JSON.parse(String(r[col.data_json] || '') || '{}'); } catch (e) { blob = {}; }
    rows.push({
      sid:          String(r[col.survey_id]).trim(),
      email:        String(r[col.email] || ''),
      name:         String(r[col.name] || ''),
      status:       String(r[col.status] || 'draft'),
      revision:     Number(r[col.revision] || 0) || 0,
      first_saved:  _isoOut(r[col.first_saved_iso]),
      updated_at:   _isoOut(r[col.updated_at_iso]),
      submitted_at: _isoOut(r[col.submitted_at_iso]),
      data:         blob
    });
  });
  return { at: nowIsoLocal(), rows: rows };
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

  const greet  = _greeting(claims.name || data.name || '');
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
    _emailGreetingHtml(greet) +
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

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_41_surveys_() {}
