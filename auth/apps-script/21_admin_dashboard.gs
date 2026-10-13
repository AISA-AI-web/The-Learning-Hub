/**
 * 21_admin_dashboard.gs — what admin-dashboard.html loads.
 *
 * admin_overview is the compliance tracker's data; admin_dashboard is the
 * whole page in one request. The other admin reads live with their feature:
 * adminDwell() in 20_tracking.gs, adminModuleResponses() in
 * 40_module_responses.gs, adminSurveyResponses() in 41_surveys.gs.
 */

/**
 * Aggregates everything the admin dashboard needs in one payload:
 *   - people: every known staff member (union of the optional `roster`
 *     tab and everyone who has ever signed in), with their latest
 *     activity timestamp.
 *   - completions: the latest 'completed' event per person × module.
 * The frontend cross-references these against its own module registry.
 */
function adminOverview() {
  const people = {};  // emailLower -> { email, name, last_seen }

  function touch(email, name, ts) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return;
    if (!people[key]) people[key] = { email: key, name: name || '', last_seen: ts || '' };
    else {
      if (name && !people[key].name) people[key].name = name;
      if (ts && _tsMs(ts) > _tsMs(people[key].last_seen)) people[key].last_seen = ts;
    }
  }

  /* Assembled from three cached parts, in the same order and by the same
   * rules as when this read all three sheets itself on every call. */

  // Everyone who has signed in (sessions tab).
  const signedIn = _sessionPeople(false);
  signedIn.people.forEach(function (p) { touch(p[0], p[1], p[2]); });

  // Optional roster tab (email, name) so staff who never signed in
  // still show up as outstanding.
  const roster = _rosterPart(false);
  roster.rows.forEach(function (r) { touch(r[0], r[1], ''); });

  // Latest 'completed' per person × module.
  const ci = _completionsIndex(false);
  const completions = [];
  ci.list.forEach(function (e) {
    touch(e[0], ci.names[e[0]] || '', e[2]);  // ensure the person exists
    completions.push({ email: e[0], module_id: e[1], completed_at: e[2] });
  });

  return {
    ok: true,
    /* As of the oldest part that can drift. Completions are bumped by
     * every record_event, so they are current whenever they were read. */
    generated_at: _olderIso(signedIn.at, roster.at),
    people: Object.keys(people).map(function (k) { return people[k]; }),
    completions: completions
  };
}

/**
 * Everything admin-dashboard.html shows, in one request.
 *
 * The page used to fire admin_overview, admin_dwell, admin_module_responses
 * and admin_survey_responses (twice, when the roster had a `secondary` tag)
 * one after another, and each paid its own cold start, session check,
 * admin check and full-sheet reads. Here they share one of each.
 *
 * Every part is independent: one that throws comes back as
 * { ok: false, error, message } and the rest still arrive, so a problem in
 * the survey sheet can't blank the compliance tracker. The individual
 * endpoints are unchanged, and the page falls back to them if this one is
 * missing (a backend that hasn't been redeployed yet).
 *
 *   parts      comma list, default all four: overview,dwell,module_responses,survey
 *   module_id  for module_responses
 *   survey_id  for survey; its `outstanding` is the whole roster with tags,
 *              and the page narrows it by tag itself
 *   fresh      '1' = the Refresh button: re-read the sheets
 */
function adminDashboard(body) {
  body = body || {};
  const want = _parseList(body.parts || 'overview,dwell,module_responses,survey');
  const out = { ok: true, generated_at: nowIsoLocal() };
  function part(name, fn) {
    if (want.indexOf(name) === -1) return;
    try { out[name] = fn(); }
    catch (e) { out[name] = { ok: false, error: 'server_error', message: String(e && e.message || e) }; }
  }
  part('overview', adminOverview);
  part('dwell', adminDwell);
  part('module_responses', function () { return adminModuleResponses({ module_id: body.module_id }); });
  part('survey', function () { return adminSurveyResponses({ survey_id: body.survey_id, roster_tag: '' }); });
  return out;
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_21_admin_dashboard_() {}
