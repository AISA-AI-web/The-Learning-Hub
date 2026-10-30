/**
 * 02_router.gs — the front door.
 *
 * Every request from the Hub is a POST to this web app's /exec URL with a
 * JSON body: { action, session_token, ...fields }. doPost() works out who
 * is asking, checks they may ask, and hands the request to the function
 * that does the work, in whichever file that lives. Opening the URL in a
 * browser runs doGet(), which says whether every file is installed.
 *
 * Every answer is JSON: { ok: true, ... } or { ok: false, error: '<code>' }.
 * The pages switch on those codes (auth/gate.js, admin-dashboard.html), so
 * they are part of the contract with the browser: keep them as they are.
 */

function doGet(e) {
  // The hub has moved to Supabase (91_bridge.gs); typeof, so a missing file is still reported by name.
  const moved = typeof bridgeForward_ === 'function' ? bridgeForward_(e) : null;
  if (moved) return moved;
  const missing = _missingHubFiles();
  return jsonOut({
    ok: true,
    service: 'aisa-learning-hub',
    version: 'v2',
    files: missing.length ? 'MISSING: ' + missing.join(', ')
                          : 'all ' + _hubFiles().length + ' present',
    hint: 'POST JSON with an action plus either id_token or session_token.'
  });
}

/* Every action the Hub can ask for: who may ask, and what does the work.
 * A session token is checked before any of these runs.
 *
 *   admin       only people on the `admins` tab; anyone else gets not_admin
 *   newsletter  only NEWSLETTER_SENDERS (00_settings.gs); anyone else gets
 *               not_newsletter_sender
 *   fresh       honours the dashboard's Refresh button (`fresh: '1'`): read
 *               the sheets, not the cache. Admin reads only, and only after
 *               the admin check, so nobody else can make the backend skip
 *               its cache.
 *
 * The handlers name functions that live in other files. That is safe at
 * the top level because nothing here runs until a request arrives, by
 * which time Apps Script has loaded every file.
 *
 * create_session is not in the table: it is the one action that takes a
 * Google ID token rather than a session, and doPost handles it first. */
const ACTIONS = {
  // ----- Who am I (10_sessions.gs, 11_people.gs) -----
  whoami: { run: (claims) => ({
    ok: true,
    email:    claims.email,
    name:     claims.name || '',
    hd:       ALLOWED_DOMAIN,
    is_admin: isAdmin(claims.email)
  }) },
  sign_out: { run: (claims, body) => { revokeSession(body.session_token); return { ok: true }; } },

  // ----- What staff do (20_tracking.gs) -----
  record_event:    { run: (claims, body) => recordEvent(claims, body) },
  get_completions: { run: (claims) => ({ ok: true, completions: getCompletionsFor(claims.email) }) },
  record_pageview: { run: (claims, body) => recordPageview(claims, body) },
  record_click:    { run: (claims, body) => recordClick(claims, body) },
  record_dwell:    { run: (claims, body) => recordDwell(claims, body) },
  admin_dwell:     { admin: true, fresh: true, run: () => adminDwell() },

  // ----- The admin dashboard (21_admin_dashboard.gs) -----
  admin_overview:  { admin: true, fresh: true, run: () => adminOverview() },
  // Everything the admin dashboard shows, in one execution: one session
  // check, one admin check, one cold start, instead of six of each.
  admin_dashboard: { admin: true, fresh: true, run: (claims, body) => adminDashboard(body) },

  // ----- The notification bell (30_notifications.gs) -----
  get_notifications:           { run: (claims) => listNotifications(claims.email) },
  mark_notification_read:      { run: (claims, body) => markNotificationRead(claims, body) },
  mark_all_notifications_read: { run: (claims) => markAllNotificationsRead(claims) },
  post_notification:           { admin: true, run: (claims, body) => postNotification(claims, body) },
  delete_notification:         { admin: true, run: (claims, body) => deleteNotification(body) },
  admin_notification_stats:    { admin: true, run: () => adminNotificationStats() },
  admin_list_tags:             { admin: true, run: () => adminListTags() },

  // ----- Newsletter mail-out (31_email.gs) -----
  newsletter_status: { run: (claims) => newsletterStatus(claims) },
  send_newsletter:   { newsletter: true, run: (claims, body) => sendNewsletter(claims, body) },

  // ----- Free-text capture inside training modules (40_module_responses.gs) -----
  save_module_response:   { run: (claims, body) => saveModuleResponse(claims, body) },
  get_module_response:    { run: (claims, body) => getModuleResponse(claims, body) },
  admin_module_responses: { admin: true, fresh: true, run: (claims, body) => adminModuleResponses(body) },

  // ----- Surveys: required-entry forms filled in on the Hub (41_surveys.gs) -----
  save_survey_response:   { run: (claims, body) => saveSurveyResponse(claims, body) },
  get_survey_response:    { run: (claims, body) => getSurveyResponse(claims, body) },
  admin_survey_responses: { admin: true, fresh: true, run: (claims, body) => adminSurveyResponses(body) },

  // ----- Performance-review round trip (42_performance_reviews.gs) -----
  get_line_managers:   { run: () => getLineManagers() },
  submit_form:         { run: (claims, body) => submitForm(claims, body) },
  get_form_submission: { run: (claims, body) => getFormSubmission(claims, body) },
  complete_form:       { run: (claims, body) => completeForm(claims, body) },
  list_my_submissions: { run: (claims) => listMySubmissions(claims) }
};

function doPost(e) {
  /* After the switch to Supabase every request is passed on to the new
   * server, and while the switch runs the answer is busy_try_again
   * (91_bridge.gs). Before it, this is null and nothing changes. */
  const moved = typeof bridgeForward_ === 'function' ? bridgeForward_(e) : null;
  if (moved) return moved;
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

    /* Own properties only: "toString" or "__proto__" sent as an action must
     * be unknown, not something inherited from Object. */
    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
      return jsonOut({ ok: false, error: 'unknown_action' });
    }
    const route = ACTIONS[action];
    if (route.admin && !isAdmin(claims.email)) {
      return jsonOut({ ok: false, error: 'not_admin' });
    }
    if (route.newsletter && !canSendNewsletter(claims.email)) {
      return jsonOut({ ok: false, error: 'not_newsletter_sender' });
    }
    if (route.fresh) _REQ_FRESH = _wantsFresh(body);
    return jsonOut(route.run(claims, body));
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

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* The files this backend is made of. Apps Script cannot list a project's
 * files from the inside, so each file ends with an empty function named
 * after it: a missing one means that file, or the end of it, never made it
 * into the editor. checkHubInstall() reports this in the editor, and doGet()
 * to anyone who opens the web app's URL. A new file needs a line here and a
 * marker at its end; tests/apps-script-sim.js fails until it has both.
 *
 * A function, not a constant: it has to look when it is called, after every
 * file has loaded, rather than when this file happens to load. */
function _hubFiles() {
  return [
    ['00_settings',            typeof endOf_00_settings_ === 'function'],
    ['01_sheets',              typeof endOf_01_sheets_ === 'function'],
    ['02_router',              typeof endOf_02_router_ === 'function'],
    ['03_helpers',             typeof endOf_03_helpers_ === 'function'],
    ['04_cache',               typeof endOf_04_cache_ === 'function'],
    ['10_sessions',            typeof endOf_10_sessions_ === 'function'],
    ['11_people',              typeof endOf_11_people_ === 'function'],
    ['20_tracking',            typeof endOf_20_tracking_ === 'function'],
    ['21_admin_dashboard',     typeof endOf_21_admin_dashboard_ === 'function'],
    ['30_notifications',       typeof endOf_30_notifications_ === 'function'],
    ['31_email',               typeof endOf_31_email_ === 'function'],
    ['40_module_responses',    typeof endOf_40_module_responses_ === 'function'],
    ['41_surveys',             typeof endOf_41_surveys_ === 'function'],
    ['42_performance_reviews', typeof endOf_42_performance_reviews_ === 'function'],
    ['90_editor_tools',        typeof endOf_90_editor_tools_ === 'function'],
    ['91_bridge',              typeof endOf_91_bridge_ === 'function']
  ];
}

/* The names (with .gs) of the files that are missing or cut short. */
function _missingHubFiles() {
  return _hubFiles()
    .filter(function (f) { return !f[1]; })
    .map(function (f) { return f[0] + '.gs'; });
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_02_router_() {}
