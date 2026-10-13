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
    ['90_editor_tools',        typeof endOf_90_editor_tools_ === 'function']
  ];
}

/* The names (with .gs) of the files that are missing or cut short. */
function _missingHubFiles() {
  return _hubFiles()
    .filter(function (f) { return !f[1]; })
    .map(function (f) { return f[0] + '.gs'; });
}

// End of 02_router.gs. checkHubInstall() looks for the function below to
// confirm this whole file was pasted in: keep it the last thing here.
function endOf_02_router_() {}
