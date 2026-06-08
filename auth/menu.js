/*
 * AISA Learning Hub — global navigation menu.
 *
 * Auto-loaded by auth/gate.js on every page. Injects a small hamburger
 * button at the top-left and a slide-in drawer linking to the main
 * sections of the hub, the teacher dashboard, and sign-out.
 *
 * Links are resolved against the site root (derived from this script's
 * own URL), so they work the same whether the current page is at the
 * root (index.html) or one level deep (PD Modules/x.html, etc.).
 */
(function () {
    'use strict';

    var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || (function () {
        var s = document.querySelector('script[src*="auth/menu.js"]');
        return s ? s.src : '';
    })();
    /* Everything up to and including the trailing slash before "auth/". */
    var ROOT = SCRIPT_SRC ? SCRIPT_SRC.replace(/auth\/menu\.js.*$/, '') : '';

    function rootUrl(rel) { return ROOT + rel; }

    var LINKS = [
        { label: 'Learning Hub',      icon: '\u{1F3E0}', href: 'index.html' },
        { label: 'My Dashboard',      icon: '\u{1F4CA}', href: 'dashboard.html' },
        { label: 'PD Modules',        icon: '\u{1F393}', href: 'PD%20Modules/pd.html' },
        { label: 'Orientation',       icon: '\u{1F9ED}', href: 'Orientation%20Hub/orientation-hub.html' },
        { label: 'Tools & Resources', icon: '\u{1F6E0}️', href: 'Tools%20and%20Resources/tools.html' },
        { label: 'Library',           icon: '\u{1F4DA}', href: 'Library%20Hub/library-hub.html' },
        { label: 'Wired Wednesdays',  icon: '\u{26A1}',  href: 'Wired%20Wednesdays/wired-wednesdays.html' },
        { label: 'Media Hub',         icon: '\u{1F3AC}', href: 'Media%20Hub/media.html' },
        { label: 'Committees',        icon: '\u{1F91D}', href: 'Committees/committees.html' }
    ];

    var built = false;
    var refs = {};

    function injectStyles() {
        var s = document.createElement('style');
        s.id = 'aisa-menu-style';
        s.textContent = [
            '.aisa-menu-toggle{position:fixed;top:.55rem;left:.6rem;z-index:2147483000;',
            'width:2.6rem;height:2.6rem;border-radius:.8rem;border:1px solid #e2e8f0;',
            'background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
            'box-shadow:0 4px 14px -4px rgba(15,23,42,.3);cursor:pointer;',
            'display:flex;align-items:center;justify-content:center;gap:0;',
            'flex-direction:column;transition:transform .15s,box-shadow .15s;}',
            '.aisa-menu-toggle:hover{transform:translateY(-1px);box-shadow:0 8px 20px -6px rgba(15,23,42,.4);}',
            '.aisa-menu-toggle span{display:block;width:1.15rem;height:2px;border-radius:2px;',
            'background:#0f172a;margin:2px 0;transition:transform .2s,opacity .2s;}',
            '.aisa-menu-toggle.open span:nth-child(1){transform:translateY(6px) rotate(45deg);}',
            '.aisa-menu-toggle.open span:nth-child(2){opacity:0;}',
            '.aisa-menu-toggle.open span:nth-child(3){transform:translateY(-6px) rotate(-45deg);}',

            '.aisa-menu-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.5);',
            '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;visibility:hidden;',
            'transition:opacity .25s,visibility .25s;}',
            '.aisa-menu-backdrop.open{opacity:1;visibility:visible;}',

            '.aisa-menu-drawer{position:fixed;top:0;left:0;bottom:0;z-index:2147483002;width:300px;max-width:84vw;',
            'background:#ffffff;box-shadow:0 0 60px rgba(15,23,42,.35);transform:translateX(-104%);',
            'transition:transform .28s cubic-bezier(.22,1,.36,1);display:flex;flex-direction:column;',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
            '.aisa-menu-drawer.open{transform:translateX(0);}',
            '.aisa-menu-head{padding:1.25rem 1.25rem 1rem;border-bottom:1px solid #f1f5f9;',
            'display:flex;align-items:center;gap:.75rem;background:linear-gradient(135deg,#0c4a6e,#312e81);color:#fff;}',
            '.aisa-menu-head .logo{width:2.5rem;height:2.5rem;border-radius:.6rem;background:#fff;',
            'display:flex;align-items:center;justify-content:center;font-weight:800;color:#0b2545;flex-shrink:0;overflow:hidden;}',
            '.aisa-menu-head .logo img{width:100%;height:100%;object-fit:contain;}',
            '.aisa-menu-head .who{min-width:0;}',
            '.aisa-menu-head .who .name{font-weight:700;font-size:.95rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-menu-head .who .email{font-size:.75rem;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-menu-list{list-style:none;margin:0;padding:.5rem;overflow-y:auto;flex:1;}',
            '.aisa-menu-list a{display:flex;align-items:center;gap:.75rem;padding:.7rem .8rem;border-radius:.6rem;',
            'text-decoration:none;color:#0f172a;font-weight:600;font-size:.92rem;transition:background .15s;}',
            '.aisa-menu-list a:hover{background:#f1f5f9;}',
            '.aisa-menu-list a .ico{width:1.5rem;text-align:center;font-size:1.05rem;flex-shrink:0;}',
            '.aisa-menu-foot{padding:.75rem;border-top:1px solid #f1f5f9;}',
            '.aisa-menu-signout{width:100%;display:flex;align-items:center;justify-content:center;gap:.5rem;',
            'padding:.7rem 1rem;border-radius:.6rem;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;',
            'font:inherit;font-weight:700;cursor:pointer;transition:background .15s;}',
            '.aisa-menu-signout:hover{background:#fee2e2;}',

            // Unread badge on the hamburger
            '.aisa-menu-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;',
            'padding:0 4px;border-radius:9999px;background:#ef4444;color:#fff;font-size:11px;',
            'font-weight:800;line-height:18px;text-align:center;box-shadow:0 0 0 2px #fff;display:none;font-style:normal;}',
            '.aisa-menu-badge.show{display:block;}',

            // Notifications section in the drawer
            '.aisa-menu-notifs{border-bottom:1px solid #f1f5f9;}',
            '.aisa-menu-notifs-head{display:flex;align-items:center;justify-content:space-between;padding:.7rem .9rem .3rem;}',
            '.aisa-menu-notifs-head .t{font-size:.68rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;}',
            '.aisa-menu-notifs-head button{font:inherit;font-size:.72rem;font-weight:700;color:#4f46e5;background:none;border:none;cursor:pointer;padding:0;}',
            '.aisa-menu-notifs-head button:hover{text-decoration:underline;}',
            '.aisa-menu-notifs-list{max-height:240px;overflow-y:auto;padding:0 .55rem .55rem;}',
            '.aisa-menu-notif{display:block;width:100%;text-align:left;border:none;background:#f8fafc;',
            'border-radius:.6rem;padding:.6rem .7rem;margin-top:.35rem;cursor:pointer;position:relative;transition:background .15s;}',
            '.aisa-menu-notif:hover{background:#f1f5f9;}',
            '.aisa-menu-notif.unread{background:#eef2ff;}',
            '.aisa-menu-notif.unread:hover{background:#e0e7ff;}',
            '.aisa-menu-notif .nt{font-weight:700;font-size:.85rem;color:#0f172a;line-height:1.25;padding-right:1rem;}',
            '.aisa-menu-notif .nb{font-size:.78rem;color:#475569;margin-top:2px;line-height:1.35;white-space:pre-wrap;word-break:break-word;}',
            '.aisa-menu-notif .nm{font-size:.66rem;color:#94a3b8;margin-top:4px;}',
            '.aisa-menu-notif .dot{position:absolute;top:.7rem;right:.65rem;width:8px;height:8px;border-radius:50%;background:#4f46e5;}',

            '@media print{.aisa-menu-toggle,.aisa-menu-backdrop,.aisa-menu-drawer{display:none!important;}}'
        ].join('');
        document.head.appendChild(s);
    }

    function build() {
        if (built) return;
        built = true;
        injectStyles();

        var toggle = document.createElement('button');
        toggle.className = 'aisa-menu-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Open menu');
        toggle.innerHTML = '<span></span><span></span><span></span>' +
            '<b class="aisa-menu-badge" aria-hidden="true"></b>';

        var backdrop = document.createElement('div');
        backdrop.className = 'aisa-menu-backdrop';

        var drawer = document.createElement('nav');
        drawer.className = 'aisa-menu-drawer';
        drawer.setAttribute('aria-label', 'Site navigation');

        var linksHtml = LINKS.map(function (l) {
            return '<li><a href="' + rootUrl(l.href) + '">' +
                '<span class="ico" aria-hidden="true">' + l.icon + '</span>' +
                '<span>' + l.label + '</span></a></li>';
        }).join('');

        /* Admin link is hidden until we confirm the user is an admin. */
        var adminHtml = '<li class="aisa-menu-admin-item" style="display:none;">' +
            '<a href="' + rootUrl('admin-dashboard.html') + '">' +
                '<span class="ico" aria-hidden="true">\u{1F6E1}️</span>' +
                '<span>Admin Dashboard</span></a></li>';

        drawer.innerHTML =
            '<div class="aisa-menu-head">' +
                '<div class="logo"><img src="' + rootUrl('AISA_logo.png') + '" alt="AISA" ' +
                    'onerror="this.style.display=\'none\';this.parentNode.textContent=\'AISA\';"></div>' +
                '<div class="who">' +
                    '<div class="name">AISA Learning Hub</div>' +
                    '<div class="email"></div>' +
                '</div>' +
            '</div>' +
            '<div class="aisa-menu-notifs" style="display:none;">' +
                '<div class="aisa-menu-notifs-head">' +
                    '<span class="t">Notifications</span>' +
                    '<button type="button" class="aisa-menu-markall">Mark all read</button>' +
                '</div>' +
                '<div class="aisa-menu-notifs-list"></div>' +
            '</div>' +
            '<ul class="aisa-menu-list">' + linksHtml + adminHtml + '</ul>' +
            '<div class="aisa-menu-foot">' +
                '<button type="button" class="aisa-menu-signout">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>' +
                    'Sign out</button>' +
            '</div>';

        document.body.appendChild(toggle);
        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);

        refs.toggle     = toggle;
        refs.backdrop   = backdrop;
        refs.drawer     = drawer;
        refs.name       = drawer.querySelector('.who .name');
        refs.email      = drawer.querySelector('.who .email');
        refs.badge      = toggle.querySelector('.aisa-menu-badge');
        refs.notifsWrap = drawer.querySelector('.aisa-menu-notifs');
        refs.notifsList = drawer.querySelector('.aisa-menu-notifs-list');

        drawer.querySelector('.aisa-menu-markall').addEventListener('click', markAllRead);

        function open()  { toggle.classList.add('open'); backdrop.classList.add('open'); drawer.classList.add('open'); toggle.setAttribute('aria-label', 'Close menu'); }
        function close() { toggle.classList.remove('open'); backdrop.classList.remove('open'); drawer.classList.remove('open'); toggle.setAttribute('aria-label', 'Open menu'); }
        function isOpen() { return drawer.classList.contains('open'); }

        toggle.addEventListener('click', function () { isOpen() ? close() : open(); });
        backdrop.addEventListener('click', close);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen()) close(); });

        drawer.querySelector('.aisa-menu-signout').addEventListener('click', function () {
            if (window.aisaAuth && typeof window.aisaAuth.signOut === 'function') {
                window.aisaAuth.signOut();
            } else {
                window.location.href = rootUrl('index.html');
            }
        });

        fillUser();
    }

    function fillUser() {
        try {
            var u = window.aisaAuth && window.aisaAuth.getUser ? window.aisaAuth.getUser() : null;
            if (u && refs.name) {
                if (u.name)  refs.name.textContent  = u.name;
                if (u.email && refs.email) refs.email.textContent = u.email;
            }
        } catch (e) {}
        revealAdminIfAllowed();
    }

    function revealAdminIfAllowed() {
        try {
            if (!window.aisaAuth || typeof window.aisaAuth.isAdmin !== 'function') return;
            window.aisaAuth.isAdmin().then(function (yes) {
                if (!yes) return;
                var item = refs.drawer && refs.drawer.querySelector('.aisa-menu-admin-item');
                if (item) item.style.display = '';
            }).catch(function () {});
        } catch (e) {}
    }

    /* ----- Notifications ----- */

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function timeAgo(iso) {
        if (!iso) return '';
        var then = new Date(iso).getTime();
        if (!then) return '';
        var s = Math.max(0, Math.floor((Date.now() - then) / 1000));
        if (s < 60) return 'just now';
        var m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
        var h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
        var d = Math.floor(h / 24); if (d < 7)  return d + 'd ago';
        try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
        catch (e) { return ''; }
    }

    function updateBadge(count) {
        if (!refs.badge) return;
        if (count > 0) {
            refs.badge.textContent = count > 9 ? '9+' : String(count);
            refs.badge.classList.add('show');
        } else {
            refs.badge.classList.remove('show');
        }
    }

    function renderNotifications(items) {
        if (!refs.notifsWrap || !refs.notifsList) return;
        if (!items || !items.length) {
            refs.notifsWrap.style.display = 'none';
            updateBadge(0);
            return;
        }
        refs.notifsWrap.style.display = '';
        var unread = 0;
        refs.notifsList.innerHTML = items.map(function (n) {
            if (!n.read) unread++;
            return '<button type="button" class="aisa-menu-notif' + (n.read ? '' : ' unread') + '" data-id="' + escapeHtml(n.id) + '">' +
                (n.read ? '' : '<span class="dot" aria-hidden="true"></span>') +
                '<div class="nt">' + escapeHtml(n.title || 'Notification') + '</div>' +
                (n.body ? '<div class="nb">' + escapeHtml(n.body) + '</div>' : '') +
                '<div class="nm">' + escapeHtml(n.author_name || 'AISA') + ' · ' + timeAgo(n.created_at) + '</div>' +
            '</button>';
        }).join('');
        updateBadge(unread);

        refs.notifsList.querySelectorAll('.aisa-menu-notif').forEach(function (el) {
            el.addEventListener('click', function () {
                if (!el.classList.contains('unread')) return;
                var id = el.getAttribute('data-id');
                el.classList.remove('unread');
                var dot = el.querySelector('.dot'); if (dot) dot.remove();
                var current = refs.notifsList.querySelectorAll('.aisa-menu-notif.unread').length;
                updateBadge(current);
                if (window.aisaAuth && window.aisaAuth.markNotificationRead) {
                    window.aisaAuth.markNotificationRead(id).catch(function () {});
                }
            });
        });
    }

    function markAllRead() {
        if (!refs.notifsList) return;
        refs.notifsList.querySelectorAll('.aisa-menu-notif.unread').forEach(function (el) {
            el.classList.remove('unread');
            var dot = el.querySelector('.dot'); if (dot) dot.remove();
        });
        updateBadge(0);
        if (window.aisaAuth && window.aisaAuth.markAllNotificationsRead) {
            window.aisaAuth.markAllNotificationsRead().catch(function () {});
        }
    }

    function loadNotifications() {
        if (!window.aisaAuth || typeof window.aisaAuth.getNotifications !== 'function') return;
        if (!window.aisaAuth.isConfigured || !window.aisaAuth.isConfigured()) return;
        window.aisaAuth.getNotifications().then(function (r) {
            renderNotifications((r && r.notifications) || []);
        }).catch(function () {});
    }

    function afterAuth() {
        fillUser();
        loadNotifications();
    }

    function start() {
        if (document.body) {
            build();
        } else {
            document.addEventListener('DOMContentLoaded', build);
        }
        /* Fill in the signed-in user + notifications once auth resolves. */
        if (typeof window.aisaReady === 'function') {
            window.aisaReady(function () { if (built) afterAuth(); else document.addEventListener('DOMContentLoaded', afterAuth); });
        }
    }

    start();
})();
