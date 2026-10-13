/**
 * 31_email.gs — the emails the Hub sends to groups of people.
 *
 * Reminder emails (post_notification with send_email) and the newsletter
 * mail-out (send_newsletter), both inside the AISA frame _aisaEmailShell()
 * builds. The one other email, a teacher's copy of their goal, is built in
 * 41_surveys.gs from that survey's own list of fields.
 *
 * Nothing here can send until the script's owner has granted the send-mail
 * permission once: Run → authorizeMail, in 90_editor_tools.gs. A web app
 * never shows that prompt to the person pressing a button in the Hub.
 */

/* Reading the mail quota needs the send-mail scope, so this throws --
 * not returns zero -- when the script has never been authorised to send.
 * Those two cases need completely different advice ("wait until
 * tomorrow" vs "grant the permission"), so keep them apart and never
 * collapse a thrown error into a quota of 0. */
function _mailQuota() {
  try {
    return { quota: MailApp.getRemainingDailyQuota(), error: '' };
  } catch (e) {
    return { quota: 0, error: String(e && e.message || e) };
  }
}

// ---------- Building an email ----------

function _firstName(name) {
  const n = String(name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

/* "Hi Sara," — or "Hi," when there is no name to go on. */
function _greeting(name) {
  const first = _firstName(name);
  return first ? ('Hi ' + first + ',') : 'Hi,';
}

function _escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* The AISA-branded email frame every Hub email sits in: deep royal
 * purple header, mustard-gold kicker, white body, grey footnote.
 * Table-based and inline-styled because that is what mail clients
 * reliably render. `inner` is HTML; `kicker` and `footer` are plain text,
 * escaped here. */
function _aisaEmailShell(kicker, inner, footer) {
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
           'style="background:#f8fafc;padding:24px 12px;"><tr><td align="center">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
             'style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;' +
             'font-family:\'DM Sans\',\'Segoe UI\',Arial,sans-serif;">' +
        '<tr><td style="background:#21076C;padding:20px 28px;">' +
          '<p style="margin:0;color:#ffffff;font-size:17px;font-weight:700;">AISA Learning Hub</p>' +
          '<p style="margin:3px 0 0;color:#D8B664;font-size:11px;font-weight:700;' +
             'letter-spacing:.09em;text-transform:uppercase;">' + _escHtml(kicker) + '</p>' +
        '</td></tr>' +
        '<tr><td style="padding:28px;">' + inner + '</td></tr>' +
        '<tr><td style="padding:16px 28px 24px;border-top:1px solid #eef2f7;">' +
          '<p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;">' +
            _escHtml(footer) +
          '</p>' +
        '</td></tr>' +
      '</table>' +
    '</td></tr></table></body></html>';
}

/* The pieces that go inside the frame. Plain text in, HTML out. */
function _emailGreetingHtml(greeting) {
  return '<p style="margin:0 0 16px;font-size:16px;font-weight:700;color:#21076C;">' +
    _escHtml(greeting) + '</p>';
}

function _emailParagraphHtml(text) {
  return '<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">' +
    _escHtml(text).replace(/\n/g, '<br>') + '</p>';
}

/* The mustard-gold call-to-action button. */
function _emailButtonHtml(url, label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0;">' +
      '<tr><td style="background:#D8B664;border-radius:8px;">' +
        '<a href="' + _escHtml(url) + '" ' +
           'style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;' +
           'color:#21076C;text-decoration:none;">' + _escHtml(label) + '</a>' +
      '</td></tr></table>';
}

// ---------- Sending to a list ----------

/* A web app is stopped after six minutes. Both mailers stop sending after
 * four and report whatever is left as skipped, rather than being cut off
 * mid-list with nothing reported at all. */
const MAIL_TIME_BUDGET_MS = 240000;

/* One personalised email per address: compose(to, greeting) builds it.
 * Counts what happened into `out` (sent / failed / skipped / errors) and
 * never throws, so the caller can tell whoever pressed the button exactly
 * what went out. Stops short of the time budget and of the day's quota;
 * the rest is reported as skipped — not lost — so they know to run it
 * again rather than assuming everyone got it. */
function _sendEach(emails, quota, out, replyTo, compose) {
  const names   = _namesForEmails(emails);
  const started = Date.now();
  for (let i = 0; i < emails.length; i++) {
    if (Date.now() - started > MAIL_TIME_BUDGET_MS || out.sent >= quota) {
      out.skipped += emails.length - i;
      break;
    }
    const to   = emails[i];
    const opts = compose(to, _greeting(names[to]));
    if (replyTo) opts.replyTo = replyTo;

    try {
      MailApp.sendEmail(opts);
      out.sent++;
    } catch (err) {
      out.failed++;
      if (out.errors.length < 5) out.errors.push(String(err));
    }
  }
  return out;
}

// ---------- Reminder emails ----------
//
// Reminders post to the in-app bell first (that write always happens);
// email is an optional second delivery on top, so a mail failure can
// never lose the notification itself.

/* AISA-branded HTML reminder: deep royal purple header, mustard-gold
 * call-to-action, white body. Table-based and inline-styled because
 * that is what mail clients reliably render. */
function _reminderHtml(greeting, bodyText, linkUrl, linkLabel) {
  // The in-app body carries the link inline; in email the button covers
  // it, so drop the line that would just repeat the URL.
  let text = String(bodyText || '');
  if (linkUrl) {
    text = text.split('\n')
      .filter(function (line) { return line.indexOf(linkUrl) === -1; })
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  const paras = text.split(/\n{2,}/).filter(function (p) { return p.trim(); })
    .map(_emailParagraphHtml).join('');

  const button = linkUrl ? _emailButtonHtml(linkUrl, linkLabel || 'Open the training') : '';

  return _aisaEmailShell(
    'Professional Development',
    (greeting ? _emailGreetingHtml(greeting) : '') + paras + button,
    'Sent from the AISA Learning Hub. This reminder is also waiting ' +
    'in your notifications the next time you sign in.'
  );
}

/* One personalised email per recipient. Never throws: a mail problem is
 * reported back as counts so the caller can tell the admin exactly what
 * happened, while the in-app notification stands regardless. */
function _sendReminderEmails(claims, emails, title, bodyText, linkUrl, linkLabel) {
  const out = { sent: 0, failed: 0, skipped: 0, quota_left: 0, errors: [] };
  if (!emails.length) return out;

  const q = _mailQuota();
  const quota = q.quota;
  out.quota_left = quota;
  if (q.error) {
    // Same trap as the newsletter: a thrown quota read means the script
    // was never authorised to send, which is not "out of quota".
    out.error = 'mail_not_authorized';
    out.message = q.error;
    out.skipped = emails.length;
    return out;
  }
  if (quota <= 0) { out.skipped = emails.length; out.reason = 'daily_quota_exhausted'; return out; }

  const subject = title || 'A reminder from the AISA Learning Hub';
  const replyTo = String(claims && claims.email || '').trim();
  return _sendEach(emails, quota, out, replyTo, function (to, greet) {
    return {
      to:       to,
      subject:  subject,
      body:     greet + '\n\n' + bodyText + (linkUrl ? '\n\n' + linkUrl : ''),
      htmlBody: _reminderHtml(greet, bodyText, linkUrl, linkLabel),
      name:     'AISA Learning Hub'
    };
  });
}

// ---------- Newsletter mail-out ----------
//
// One button, two people, the whole school in the "to" line. Kept apart
// from post_notification on purpose: that one refuses to email a tag
// audience precisely so nobody blasts the school by accident, and this
// one exists to do exactly that, deliberately, from a short allowlist.

/* Newsletter bullets arrive either as a JSON array or as one string per
 * line. Not _parseList: that lowercases and splits on commas, which is
 * right for tags and wrong for a sentence like "Level 1, due Sept 30". */
function _newsletterItems(v) {
  const raw = Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/);
  return raw.map(function (t) { return String(t == null ? '' : t).trim(); })
            .filter(function (t) { return !!t; });
}

/* What the page needs to decide whether to show the send bar at all, and
 * to tell the sender how many people are about to hear from them. */
function newsletterStatus(claims) {
  const may = canSendNewsletter(claims.email);
  const out = { ok: true, may_send: may };
  if (!may) return out;
  out.recipients = _allStaffEmails().length;
  const q = _mailQuota();
  out.quota_left = q.quota;
  if (q.error) { out.mail_authorized = false; out.mail_error = q.error; }
  else         { out.mail_authorized = true; }
  return out;
}

function sendNewsletter(claims, body) {
  // Run bare from the editor this would throw on body.url. Say what to do
  // instead, because "TypeError: cannot read properties of undefined" is
  // not a useful thing to meet when you are trying to debug a send.
  if (!claims || !body) {
    return { ok: false, error: 'not_callable_from_editor',
             message: 'sendNewsletter is called by the Hub with a signed-in user. '
                    + 'To grant the mail permission, run authorizeMail() instead.' };
  }
  const url = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'missing_url' };

  const testOnly = String(body.test_only || '') === '1' ||
                   String(body.test_only || '').toLowerCase() === 'true';
  // A real send has to say so. Nothing goes school-wide on a stray click.
  if (!testOnly && String(body.confirm || '') !== '1') {
    return { ok: false, error: 'not_confirmed' };
  }

  const subject  = String(body.subject  || 'The Digital Lion — AISA Learning Hub').trim();
  const issue    = String(body.issue    || '').trim();
  const headline = String(body.headline || '').trim();
  const intro    = String(body.intro    || '').trim();
  const label    = String(body.link_label || 'Read the newsletter').trim();
  const items    = _newsletterItems(body.items).slice(0, 8);

  const emails = testOnly ? [String(claims.email || '').trim().toLowerCase()]
                          : _allStaffEmails();
  const out = {
    ok: true, test_only: testOnly, recipients: emails.length,
    sent: 0, failed: 0, skipped: 0, quota_left: 0, errors: []
  };
  if (!emails.length) { out.ok = false; out.error = 'no_recipients'; return out; }

  const q = _mailQuota();
  const quota = q.quota;
  out.quota_left = quota;
  if (q.error) {
    // Not a quota problem: the script has never been allowed to send mail.
    out.ok = false;
    out.error = 'mail_not_authorized';
    out.message = q.error;
    return out;
  }
  if (quota <= 0) { out.skipped = emails.length; out.reason = 'daily_quota_exhausted'; return out; }

  const replyTo = String(claims && claims.email || '').trim();
  return _sendEach(emails, quota, out, replyTo, function (to, greet) {
    return {
      to:       to,
      subject:  subject,
      body:     greet + '\n\n' + (headline ? headline + '\n\n' : '') +
                (intro ? intro + '\n\n' : '') +
                (items.length ? items.map(function (t) { return '• ' + t; }).join('\n') + '\n\n' : '') +
                url,
      htmlBody: _newsletterHtml(greet, issue, headline, intro, items, url, label),
      name:     'AISA Learning Hub'
    };
  });
}

/* The newsletter email: the same AISA frame as the PD reminders, with a
 * gold issue kicker, the headline, a short intro, up to eight
 * what's-inside lines and one big button through to the real thing.
 * The body stays short on purpose — the email is the trailer, the Hub
 * page is the newsletter. */
function _newsletterHtml(greeting, issue, headline, intro, items, url, linkLabel) {
  const list = items && items.length
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
             'style="margin:0 0 20px;background:#F2EFFA;border-radius:10px;">' +
        '<tr><td style="padding:16px 18px;">' +
          items.map(function (t, i) {
            const gap = (i === items.length - 1) ? '0' : '0 0 8px';
            return '<p style="margin:' + gap + ';font-size:14px;line-height:1.55;color:#21076C;">' +
              '<span style="color:#D8B664;font-weight:700;">•</span>&nbsp;' + _escHtml(t) + '</p>';
          }).join('') +
        '</td></tr></table>'
    : '';

  return _aisaEmailShell(
    issue || 'The Digital Lion',
    (greeting ? _emailGreetingHtml(greeting) : '') +
    (headline ? '<p style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;' +
       'color:#21076C;">' + _escHtml(headline) + '</p>' : '') +
    (intro ? _emailParagraphHtml(intro) : '') + list + _emailButtonHtml(url, linkLabel),
    'Sent from the AISA Learning Hub. You can read this and every past ' +
    'issue any time from the Media Hub.'
  );
}

// The end. checkHubInstall() looks for this marker to confirm the whole
// file was pasted in, so keep it the last thing here.
function endOf_31_email_() {}
