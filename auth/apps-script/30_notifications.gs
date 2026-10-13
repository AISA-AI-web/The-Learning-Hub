/**
 * 30_notifications.gs — the notification bell.
 *
 * Admins post notifications to everyone, to roster tags or to named people
 * (the `notifications` tab); each read is a row in `notification_reads`.
 * The Hub posts its own as well — a review sent to a line manager, a teacher
 * asking for something before go-live — through _fireSystemNotification().
 * An email copy of a post, when asked for, goes out through 31_email.gs.
 */

function isActiveFlag(v) {
  // Default to active unless explicitly set to a falsey marker.
  const s = String(v).trim().toLowerCase();
  return !(s === 'false' || s === 'no' || s === '0');
}

/** All active notifications, newest first. Tolerant of older row widths
 *  (pre-targeting). Each notification carries its target_tags and
 *  target_emails arrays so callers can decide who receives it. */
function readActiveNotifications() {
  /* Every page load reads this for the notification bell, for everyone.
   * Posting or deleting a notification bumps it. */
  return _cachedRead(_dataKey('notifs', ['notifs']), CACHE_TTL.notifs, _readActiveNotificationsFromSheet);
}

function _readActiveNotificationsFromSheet() {
  const sheet = getNotifsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  // Read whatever the sheet has — never wider than NOTIF_HEADERS, but it
  // may be narrower if the sheet predates the targeting columns.
  const width = Math.min(sheet.getLastColumn(), NOTIF_HEADERS.length);
  const rows = sheet.getRange(2, 1, last - 1, width).getValues();
  const i_id    = NOTIF_HEADERS.indexOf('id');
  const i_ts    = NOTIF_HEADERS.indexOf('created_at_iso');
  const i_name  = NOTIF_HEADERS.indexOf('author_name');
  const i_title = NOTIF_HEADERS.indexOf('title');
  const i_body  = NOTIF_HEADERS.indexOf('body');
  const i_tags  = NOTIF_HEADERS.indexOf('target_tags');
  const i_em    = NOTIF_HEADERS.indexOf('target_emails');
  const i_act   = NOTIF_HEADERS.indexOf('active');
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Active flag lives at the rightmost present column on legacy rows;
    // fall back to it if we read fewer columns than NOTIF_HEADERS.
    const activeVal = (i_act < width) ? r[i_act] : r[r.length - 1];
    if (!isActiveFlag(activeVal)) continue;
    out.push({
      id:            String(r[i_id]),
      created_at:    _isoOut(r[i_ts]),
      author_name:   String(r[i_name] || ''),
      title:         String(r[i_title] || ''),
      body:          String(r[i_body] || ''),
      target_tags:   _parseList(i_tags < width ? r[i_tags] : ''),
      target_emails: _parseList(i_em   < width ? r[i_em]   : '')
    });
  }
  /* Newest first by instant. A string compare put "Z" rows and "+04:00"
   * rows in the wrong order, and a date-typed cell sorted by weekday name. */
  out.sort(function (a, b) { return _tsMs(b.created_at) - _tsMs(a.created_at); });
  return out;
}

/** True if `email` should see notification `n` given its targeting. */
function userReceivesNotification(email, n, userTags) {
  // Broadcast: no targeting set → everyone gets it.
  if (!n.target_tags.length && !n.target_emails.length) return true;
  const e = String(email || '').trim().toLowerCase();
  if (n.target_emails.indexOf(e) !== -1) return true;
  if (n.target_tags.length) {
    const tags = userTags || getTagsForEmail(email);
    for (let i = 0; i < tags.length; i++) {
      if (n.target_tags.indexOf(tags[i]) !== -1) return true;
    }
  }
  return false;
}

/** Set of notification ids this email has already read. Cached per person,
 *  and bumped per person when they mark something read — the reads tab is
 *  the one that grows with every notification times every reader. */
function readIdsFor(email) {
  const target = String(email || '').trim().toLowerCase();
  const key = target ? _dataKey('reads:' + target, ['reads:' + target]) : null;
  return _cachedRead(key, CACHE_TTL.reads, function () { return _readIdsFromSheet(target); });
}

function _readIdsFromSheet(target) {
  const sheet = getNotifReadsSheet();
  const last = sheet.getLastRow();
  const set = {};
  if (last < 2) return set;
  const rows = sheet.getRange(2, 1, last - 1, 2).getValues();   // id, email
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][1] || '').trim().toLowerCase() === target) {
      set[String(rows[i][0])] = true;
    }
  }
  return set;
}

function listNotifications(email) {
  const notifs = readActiveNotifications();
  const readSet = readIdsFor(email);
  const userTags = getTagsForEmail(email);
  let unread = 0;
  const items = [];
  for (let i = 0; i < notifs.length; i++) {
    const n = notifs[i];
    if (!userReceivesNotification(email, n, userTags)) continue;
    const read = !!readSet[n.id];
    if (!read) unread++;
    items.push({
      id: n.id, created_at: n.created_at, author_name: n.author_name,
      title: n.title, body: n.body, read: read
    });
  }
  return { ok: true, notifications: items, unread: unread };
}

function postNotification(claims, body) {
  const title         = String(body.title || '').slice(0, 200).trim();
  const text          = String(body.body  || '').slice(0, 4000).trim();
  const target_tags   = _parseList(body.target_tags).slice(0, 50);
  const target_emails = _parseList(body.target_emails).slice(0, 200);
  if (!title && !text) return { ok: false, error: 'empty_notification' };

  const id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const row = new Array(NOTIF_HEADERS.length).fill('');
  row[NOTIF_HEADERS.indexOf('id')]             = id;
  row[NOTIF_HEADERS.indexOf('created_at_iso')] = nowIsoLocal();
  row[NOTIF_HEADERS.indexOf('author_email')]   = claims.email;
  row[NOTIF_HEADERS.indexOf('author_name')]    = claims.name || '';
  row[NOTIF_HEADERS.indexOf('title')]          = title;
  row[NOTIF_HEADERS.indexOf('body')]           = text;
  row[NOTIF_HEADERS.indexOf('target_tags')]    = target_tags.join(',');
  row[NOTIF_HEADERS.indexOf('target_emails')]  = target_emails.join(',');
  row[NOTIF_HEADERS.indexOf('active')]         = true;
  getNotifsSheet().appendRow(row);
  _bump('notifs');

  const out = {
    ok: true, id: id,
    target_tags: target_tags, target_emails: target_emails
  };

  // Optional second delivery: real email on top of the in-app bell.
  // Only ever to an explicit recipient list, so an "everyone" audience
  // can never turn into a school-wide blast by accident.
  const wantEmail = body.send_email === true ||
                    String(body.send_email || '') === '1' ||
                    String(body.send_email || '').toLowerCase() === 'true';
  if (wantEmail) {
    out.email = target_emails.length
      ? _sendReminderEmails(claims, target_emails, title, text,
                            String(body.email_link || '').trim(),
                            String(body.email_link_label || '').trim())
      : { sent: 0, failed: 0, skipped: 0, reason: 'no_explicit_recipients' };
  }
  return out;
}

/* System-fired notification — used when the form workflow needs to
 * notify the manager (form submitted) or the staff member (form
 * returned). The existing user-driven postNotification is admin-only;
 * this internal helper bypasses that gate but is only called from
 * controlled code paths (submitForm / completeForm). */
function _fireSystemNotification(authorEmail, authorName, title, body, targetEmails) {
  if (!title && !body) return null;
  const id = 'n_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  const row = new Array(NOTIF_HEADERS.length).fill('');
  row[NOTIF_HEADERS.indexOf('id')]             = id;
  row[NOTIF_HEADERS.indexOf('created_at_iso')] = nowIsoLocal();
  row[NOTIF_HEADERS.indexOf('author_email')]   = authorEmail || '';
  row[NOTIF_HEADERS.indexOf('author_name')]    = authorName || '';
  row[NOTIF_HEADERS.indexOf('title')]          = String(title || '').slice(0, 200);
  row[NOTIF_HEADERS.indexOf('body')]           = String(body  || '').slice(0, 4000);
  row[NOTIF_HEADERS.indexOf('target_tags')]    = '';
  row[NOTIF_HEADERS.indexOf('target_emails')]  = (targetEmails || []).join(',');
  row[NOTIF_HEADERS.indexOf('active')]         = true;
  getNotifsSheet().appendRow(row);
  _bump('notifs');
  return id;
}

function markNotificationRead(claims, body) {
  const id = String(body.notification_id || '').trim();
  if (!id) return { ok: false, error: 'missing_notification_id' };
  // Avoid duplicate read rows for the same person + notification.
  if (readIdsFor(claims.email)[id]) return { ok: true, already: true };
  getNotifReadsSheet().appendRow([id, claims.email, nowIsoLocal()]);
  _bump('reads:' + String(claims.email || '').trim().toLowerCase());
  return { ok: true };
}

function markAllNotificationsRead(claims) {
  // Only auto-mark the ones the user is actually a recipient of, so the
  // user's read history doesn't get polluted with notifications they
  // never had access to.
  const notifs = readActiveNotifications();
  const readSet = readIdsFor(claims.email);
  const userTags = getTagsForEmail(claims.email);
  const sheet = getNotifReadsSheet();
  const now = nowIsoLocal();
  const toAdd = [];
  for (let i = 0; i < notifs.length; i++) {
    const n = notifs[i];
    if (!userReceivesNotification(claims.email, n, userTags)) continue;
    if (!readSet[n.id]) toAdd.push([n.id, claims.email, now]);
  }
  if (toAdd.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, NOTIF_READ_HEADERS.length).setValues(toAdd);
    _bump('reads:' + String(claims.email || '').trim().toLowerCase());
  }
  return { ok: true, marked: toAdd.length };
}

function deleteNotification(body) {
  const id = String(body.notification_id || '').trim();
  if (!id) return { ok: false, error: 'missing_notification_id' };
  const sheet = getNotifsSheet();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: true };
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      // Soft delete: flip the active column to FALSE.
      sheet.getRange(i + 2, NOTIF_HEADERS.indexOf('active') + 1).setValue(false);
      _bump('notifs');
      return { ok: true };
    }
  }
  return { ok: true };
}

/** Admin view: each active notification with targeting info, the number
 *  of people the targeting resolves to, and how many have read it. */
function adminNotificationStats() {
  const notifs = readActiveNotifications();
  const roster = getRosterIndex();

  // Count reads per notification id in one pass.
  const reads = getNotifReadsSheet();
  const last = reads.getLastRow();
  const counts = {};
  if (last >= 2) {
    const rows = reads.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < rows.length; i++) {
      const id = String(rows[i][0]);
      counts[id] = (counts[id] || 0) + 1;
    }
  }

  // Total "audience" for a broadcast (no targeting). We use the
  // adminOverview people list — every signed-in user union the roster.
  // Computing it on every call is fine at this scale.
  const overviewPeople = adminOverview().people || [];
  const totalAudience = overviewPeople.length;

  function resolveAudience(n) {
    if (!n.target_tags.length && !n.target_emails.length) return totalAudience;
    const matched = {};
    // Match by email
    for (let i = 0; i < n.target_emails.length; i++) matched[n.target_emails[i]] = true;
    // Match by tag (against roster)
    if (n.target_tags.length) {
      const tagSet = {};
      n.target_tags.forEach(function (t) { tagSet[t] = true; });
      const byEmail = roster.byEmail;
      Object.keys(byEmail).forEach(function (email) {
        if (matched[email]) return;
        const tags = byEmail[email].tags || [];
        for (let j = 0; j < tags.length; j++) {
          if (tagSet[tags[j]]) { matched[email] = true; return; }
        }
      });
    }
    return Object.keys(matched).length;
  }

  /* Copies, not the notifications themselves: those are the cached list
   * other callers in this request may still be reading. */
  const items = notifs.map(function (n) {
    const o = {};
    Object.keys(n).forEach(function (k) { o[k] = n[k]; });
    o.read_count      = counts[n.id] || 0;
    o.recipient_count = resolveAudience(n);
    return o;
  });
  return {
    ok: true,
    notifications: items,
    generated_at: nowIsoLocal()
  };
}

/** Admin view: the union of tags currently in the roster, so the
 *  compose UI can show pickable chips. */
function adminListTags() {
  const roster = getRosterIndex();
  return { ok: true, tags: roster.allTags };
}

// End of 30_notifications.gs. checkHubInstall() looks for the function below to
// confirm this whole file was pasted in: keep it the last thing here.
function endOf_30_notifications_() {}
