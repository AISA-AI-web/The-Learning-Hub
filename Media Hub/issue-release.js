/*
 * The Digital Lion — holding an issue back until it is released.
 *
 * A new issue goes on the Hub before staff can see it. Until someone
 * releases it, only the newsletter senders (bbaki@ and hodai@) see the
 * page and its cards; everyone else gets a "not out yet" panel and the
 * previous issue. The Release button on the issue posts its announcement
 * to everyone's notification bell, and THAT notification is what
 * "released" means: any page asks the bell, and an issue is out once the
 * bell carries a notification that links to it.
 *
 * Why the bell and not a flag of its own: it needs no backend change and
 * no redeploy (post_notification and get_notifications have been live for
 * months), the bell list is fetched on every page anyway (menu.js, with a
 * 90-second cache), and staff should be told when an issue is out, which
 * the same notification does.
 *
 * So: DELETING THAT NOTIFICATION UN-RELEASES THE ISSUE. Within about 90
 * seconds the page, the Media Hub card and the home-page card go back to
 * the previous issue for everyone but the senders. The issue's own bar has
 * an "Undo release" button that does exactly this, on purpose.
 *
 * None of this is a security boundary. The repo is public, the page is on
 * GitHub Pages, and anyone who views source can read it. It decides what
 * the Hub shows, nothing more. Never put anything in an unreleased issue
 * that could not be published.
 *
 * Used by Media Hub/<issue>.html, Media Hub/media.html and index.html:
 *
 *   aisaIssueRelease.check('oct30')    -> Promise of
 *       { ok, sender, released, notification, fromCache, error }
 *   aisaIssueRelease.applyListing('oct30')
 *       shows [data-dl-show="oct30"] and hides [data-dl-hide="oct30"] once
 *       the issue is out (or for a sender), and shows
 *       [data-dl-preview="oct30"] badges only while it is not out yet.
 *   aisaIssueRelease.release('oct30', { title, body })
 *   aisaIssueRelease.unrelease('oct30')
 */
(function () {
    'use strict';
    if (window.aisaIssueRelease) return;

    /* Who sees an issue before it is out. Mirrors NEWSLETTER_SENDERS in
     * auth/apps-script/00_settings.gs; keep the two lists the same. This
     * copy only decides what the page shows. Releasing posts a bell
     * notification, which the backend allows for anyone on the `admins`
     * tab, and emailing the issue is send_newsletter, which the backend
     * holds to NEWSLETTER_SENDERS itself. */
    var SENDERS = ['bbaki@aisa.sch.ae', 'hodai@aisa.sch.ae'];

    /* The last answer each issue got, kept so that a failed bell read
     * does not hide an issue that is already out. Only "released" is
     * remembered; a successful read that finds no notification clears it,
     * which is what makes Undo release work. */
    var SEEN_KEY = 'aisa_dl_released_v1';

    function readSeen() {
        try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }
    function writeSeen(issue, released) {
        try {
            var seen = readSeen();
            if (released) seen[issue] = seen[issue] || new Date().toISOString();
            else delete seen[issue];
            localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
        } catch (e) { /* storage blocked: the next read asks the bell again */ }
    }

    /* An issue is out when a notification's text links to its page. The
     * page's own address is percent-encoded (Media%20Hub/oct30.html);
     * someone posting by hand from admin-notifications.html may type it
     * either way, so accept both. */
    function linksTo(n, issue) {
        var text = String((n && n.title) || '') + '\n' + String((n && n.body) || '');
        return new RegExp('Media(?:%20| )Hub/' + issue + '\\.html', 'i').test(text);
    }

    /* aisaReady() gives up after a minute. Someone who takes longer than
     * that to get through the sign-in screen would then be left on
     * "Checking…" for good, so wait for the gate ourselves, without a cap. */
    function whenSignedIn(cb) {
        if (window.aisaAuth) { cb(window.aisaAuth); return; }
        var timer = setInterval(function () {
            if (window.aisaAuth) { clearInterval(timer); cb(window.aisaAuth); }
        }, 250);
    }

    function viewerEmail(auth) {
        try {
            var u = auth.getUser && auth.getUser();
            return String((u && u.email) || '').trim().toLowerCase();
        } catch (e) { return ''; }
    }

    function check(issue) {
        return new Promise(function (resolve) {
            whenSignedIn(function (auth) {
                var sender = SENDERS.indexOf(viewerEmail(auth)) !== -1;
                if (!auth.getNotifications) {
                    resolve({ ok: false, sender: sender, released: !!readSeen()[issue],
                              fromCache: true, error: 'no_bell' });
                    return;
                }
                auth.getNotifications().then(function (r) {
                    var list = (r && r.notifications) || [];
                    var hit = null;
                    for (var i = 0; i < list.length; i++) {
                        if (linksTo(list[i], issue)) { hit = list[i]; break; }
                    }
                    writeSeen(issue, !!hit);
                    resolve({ ok: true, sender: sender, released: !!hit, notification: hit });
                }, function (err) {
                    resolve({ ok: false, sender: sender, released: !!readSeen()[issue],
                              fromCache: true, error: (err && err.message) || String(err) });
                });
            });
        });
    }

    function show(el, on) { el.style.display = on ? '' : 'none'; }

    /* For pages that list the issue (Media Hub, the home page). Elements
     * start in the "not out yet" state in the markup: [data-dl-show]
     * carry style="display:none", so nothing flashes before the answer.
     * A failed read leaves the page as it is unless this browser has
     * already seen the issue released. */
    function applyListing(issue) {
        return check(issue).then(function (s) {
            var visible = s.released || s.sender;
            var q = function (attr) {
                return document.querySelectorAll('[' + attr + '="' + issue + '"]');
            };
            Array.prototype.forEach.call(q('data-dl-show'), function (el) { show(el, visible); });
            Array.prototype.forEach.call(q('data-dl-hide'), function (el) { show(el, !visible); });
            Array.prototype.forEach.call(q('data-dl-preview'), function (el) { show(el, visible && !s.released); });
            return s;
        });
    }

    /* Post the announcement to every member of staff's bell. Broadcast:
     * no tags and no named people, so everyone receives it. */
    function release(issue, opts) {
        var o = opts || {};
        return new Promise(function (resolve, reject) {
            whenSignedIn(function (auth) {
                if (!auth.postNotification) { reject(new Error('no_bell')); return; }
                var body = String(o.body || '');
                if (!new RegExp('Media(?:%20| )Hub/' + issue + '\\.html').test(body)) {
                    reject(new Error('body_does_not_link_to_issue'));
                    return;
                }
                auth.postNotification(o.title || 'The Digital Lion', body, '', '').then(function (r) {
                    writeSeen(issue, true);
                    resolve(r);
                }, reject);
            });
        });
    }

    /* Take the issue back: delete every bell notification that links to it. */
    function unrelease(issue) {
        return new Promise(function (resolve, reject) {
            whenSignedIn(function (auth) {
                auth.getNotifications().then(function (r) {
                    var ids = ((r && r.notifications) || [])
                        .filter(function (n) { return linksTo(n, issue); })
                        .map(function (n) { return n.id; });
                    return ids.reduce(function (p, id) {
                        return p.then(function () { return auth.deleteNotification(id); });
                    }, Promise.resolve()).then(function () {
                        writeSeen(issue, false);
                        resolve(ids.length);
                    });
                }).catch(reject);
            });
        });
    }

    window.aisaIssueRelease = {
        SENDERS: SENDERS.slice(),
        check: check,
        applyListing: applyListing,
        release: release,
        unrelease: unrelease
    };
})();
