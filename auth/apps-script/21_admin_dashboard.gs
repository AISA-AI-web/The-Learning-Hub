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
 *   parts      comma list, default these four: overview,dwell,module_responses,survey
 *              Two more, only when asked for by name (admin-analytics.html):
 *              usage (adminUsage below) and notifications
 *              (adminNotificationStats in 30_notifications.gs)
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
  part('notifications', adminNotificationStats);
  part('usage', adminUsage);
  return out;
}

/**
 * What staff did on the Hub, for admin-analytics.html: every page view,
 * tagged click, module event and sign-in, as compact rows the page filters
 * and charts itself (by date, by person, by roster tag).
 *
 *   people    [[email, name], ...]  everyone the rows below name, emails
 *             trimmed and lower-cased, name the first non-empty one seen
 *   pages     [[page_path, page_title], ...]  as recorded; the latest title
 *   refs      ['', host, ...]  where a page view came from: the referrer's
 *             host only, never its path or query; '' = no referrer
 *   labels    [click label, ...]
 *   pageviews [[t, person, page, ref, device], ...]
 *   clicks    [[t, person, label, page], ...]
 *   events    [[t, person, module_id, event], ...]   every event, not only
 *             the latest completion (that is admin_overview's job)
 *   signins   [[t, person, device], ...]   one per session created
 *   roster    [[email, name, [tags]], ...]  the roster tab, row by row, so
 *             the page can filter by tag and count who has never visited
 *
 * t is seconds since 1970 (UTC); people/page/ref/label are indexes into the
 * lists above; device is 0 laptop or desktop, 1 phone, 2 tablet, from the
 * user agent (an iPad asking for the desktop site counts as a laptop). Rows
 * without an address or a readable time are left out. Rows are in sheet
 * order, each tab on its own.
 *
 * Cached for CACHE_TTL.usage. Module events and sign-ins bump it; page views
 * and clicks arrive with every page anyone opens, so like dwell they are
 * kept fresh by the TTL and the Refresh button rather than by generation. */
function adminUsage() {
  const part = _cachedRead(_dataKey('usage', ['events', 'sessions']), CACHE_TTL.usage,
                           _readUsage, false);
  const roster = _rosterPart(false);
  const out = { ok: true, generated_at: _olderIso(part.at, roster.at) };
  Object.keys(part).forEach(function (k) { if (k !== 'at') out[k] = part[k]; });
  out.roster = roster.rows;
  return out;
}

function _readUsage() {
  const people = [], personAt = {};
  const pages = [], pageAt = {};
  const refs = [''], refAt = { '': 0 };
  const labels = [], labelAt = {};

  function person(email, name) {
    const key = String(email || '').trim().toLowerCase();
    if (!key) return -1;
    let i = personAt[key];
    if (i === undefined) { i = personAt[key] = people.length; people.push([key, '']); }
    if (name && !people[i][1]) people[i][1] = String(name);
    return i;
  }
  function page(path, title) {
    const key = String(path || '');
    let i = pageAt[key];
    if (i === undefined) { i = pageAt[key] = pages.length; pages.push([key, '']); }
    if (title) pages[i][1] = String(title);
    return i;
  }
  function ref(url) {
    const m = /^[a-z][a-z0-9+.\-]*:\/\/([^\/?#:@]+)/i.exec(String(url || '').trim());
    const host = m ? m[1].toLowerCase() : '';
    let i = refAt[host];
    if (i === undefined) { i = refAt[host] = refs.length; refs.push(host); }
    return i;
  }
  function label(text) {
    const key = String(text || '');
    let i = labelAt[key];
    if (i === undefined) { i = labelAt[key] = labels.length; labels.push(key); }
    return i;
  }
  function secs(v) { return Math.floor(_tsMs(v) / 1000); }

  /* Sign-ins first, so a person's name comes from their Google account
   * where there is one. Columns 2-7: email, name, created, expires,
   * last_used, user_agent. Never the token. */
  const signins = [];
  _dataRows(getSessionsSheet(), 6, 2).forEach(function (r) {
    const t = secs(r[2]);
    const p = person(r[0], r[1]);
    if (t > 0 && p >= 0) signins.push([t, p, _deviceOf(r[5])]);
  });

  const ev = _colIndex(EVENT_HEADERS);
  const events = [];
  _dataRows(getEventsSheet(), ev.event + 1).forEach(function (r) {
    const t = secs(r[ev.timestamp_iso]);
    const p = person(r[ev.email], r[ev.name]);
    if (t > 0 && p >= 0) events.push([t, p, String(r[ev.module_id] || ''), String(r[ev.event] || '')]);
  });

  const pv = _colIndex(PAGEVIEW_HEADERS);
  const pageviews = [];
  _dataRows(getPageviewsSheet(), PAGEVIEW_HEADERS.length).forEach(function (r) {
    const t = secs(r[pv.timestamp_iso]);
    const p = person(r[pv.email], r[pv.name]);
    if (t > 0 && p >= 0) {
      pageviews.push([t, p, page(r[pv.page_path], r[pv.page_title]), ref(r[pv.referrer]),
                      _deviceOf(r[pv.user_agent])]);
    }
  });

  const ck = _colIndex(CLICK_HEADERS);
  const clicks = [];
  _dataRows(getClicksSheet(), ck.page_path + 1).forEach(function (r) {
    const t = secs(r[ck.timestamp_iso]);
    const p = person(r[ck.email], r[ck.name]);
    if (t > 0 && p >= 0) clicks.push([t, p, label(r[ck.label]), page(r[ck.page_path], '')]);
  });

  return {
    at: nowIsoLocal(),
    people: people, pages: pages, refs: refs, labels: labels,
    pageviews: pageviews, clicks: clicks, events: events, signins: signins
  };
}

/* 0 laptop or desktop, 1 phone, 2 tablet. */
function _deviceOf(ua) {
  ua = String(ua || '');
  if (/iPad|Tablet|PlayBook|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 2;
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 1;
  return 0;
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_21_admin_dashboard_() {}
