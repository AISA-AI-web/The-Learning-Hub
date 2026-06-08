/*
 * AISA Learning Hub — global navigation menu.
 *
 * Auto-loaded by auth/gate.js on every page. Injects:
 *   - A hamburger button at top-left that opens a slide-in drawer with
 *     links to every section of the Hub and a Sign-out button.
 *   - A bell button right of the hamburger that opens a notifications
 *     dropdown. Each item is clickable; click expands the notification
 *     in a full-view modal with rich-text links rendered.
 *   - An unread badge on the bell that reflects the per-user filtered
 *     notification count from the backend.
 *
 * Notification bodies may contain markdown-style links — [label](url) —
 * and bare URLs are auto-linkified. Anything else is escaped. The
 * renderer is exposed as window.AisaRichText so admin pages can preview
 * exactly what staff will see.
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
    var notifications = [];  // last fetched list

    /* -------- shared rich-text helpers (exposed via window.AisaRichText) -------- */

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /**
     * Render free-form notification body safely as HTML.
     *   - Escapes everything.
     *   - Recognises markdown links: [label](url) where url is http(s) or mailto.
     *   - Auto-linkifies bare http(s) URLs that aren't already inside a link.
     *   - Preserves newlines as <br>.
     * Returns a string safe to inject via innerHTML.
     */
    function renderRichText(text) {
        if (!text) return '';
        var safe = escapeHtml(text);

        /* Replace markdown links first, stashing rendered anchors so the
         * bare-URL pass doesn't re-process URLs that we already wrapped. */
        var anchors = [];
        safe = safe.replace(
            /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
            function (_, label, url) {
                var ix = anchors.length;
                anchors.push(makeAnchor(url, label));
                return '\x00A' + ix + '\x00';
            }
        );
        /* Auto-linkify bare URLs (only at word boundaries, never mid-token).
         * Strip trailing punctuation that's almost certainly part of the
         * surrounding sentence, not the URL. */
        safe = safe.replace(
            /(^|[\s(])(https?:\/\/[^\s<]+)/g,
            function (_, prefix, url) {
                var trail = '';
                var m = url.match(/[.,!?;:)]+$/);
                if (m) { trail = m[0]; url = url.slice(0, -trail.length); }
                return prefix + makeAnchor(url, url) + trail;
            }
        );
        /* Restore stashed anchors. */
        safe = safe.replace(/\x00A(\d+)\x00/g, function (_, ix) { return anchors[+ix]; });
        /* Newlines as line breaks. */
        return safe.replace(/\n/g, '<br>');
    }

    function makeAnchor(url, label) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="aisa-rt-link">' +
            escapeHtml(label) + '</a>';
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

    function timeFull(iso) {
        if (!iso) return '';
        try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return ''; }
    }

    window.AisaRichText = {
        render:    renderRichText,
        escapeHtml: escapeHtml,
        timeAgo:   timeAgo,
        timeFull:  timeFull
    };

    /* -------- styles -------- */

    function injectStyles() {
        var s = document.createElement('style');
        s.id = 'aisa-menu-style';
        s.textContent = [
            /* === Floating buttons (hamburger + bell) === */
            '.aisa-menu-toggle,.aisa-bell-toggle{position:fixed;top:.55rem;z-index:2147483000;',
            'width:2.6rem;height:2.6rem;border-radius:.8rem;border:1px solid #e2e8f0;',
            'background:rgba(255,255,255,.92);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
            'box-shadow:0 4px 14px -4px rgba(15,23,42,.3);cursor:pointer;',
            'display:flex;align-items:center;justify-content:center;',
            'transition:transform .15s,box-shadow .15s;}',
            '.aisa-menu-toggle:hover,.aisa-bell-toggle:hover{transform:translateY(-1px);box-shadow:0 8px 20px -6px rgba(15,23,42,.4);}',
            '.aisa-menu-toggle{left:.6rem;flex-direction:column;gap:0;}',
            '.aisa-bell-toggle{left:3.5rem;color:#0f172a;}',

            '.aisa-menu-toggle span{display:block;width:1.15rem;height:2px;border-radius:2px;',
            'background:#0f172a;margin:2px 0;transition:transform .2s,opacity .2s;}',
            '.aisa-menu-toggle.open span:nth-child(1){transform:translateY(6px) rotate(45deg);}',
            '.aisa-menu-toggle.open span:nth-child(2){opacity:0;}',
            '.aisa-menu-toggle.open span:nth-child(3){transform:translateY(-6px) rotate(-45deg);}',

            '.aisa-bell-toggle svg{width:1.25rem;height:1.25rem;}',
            '.aisa-bell-toggle.has-unread svg{color:#0f172a;}',

            /* Unread badge (lives on the bell now). */
            '.aisa-menu-badge{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;',
            'padding:0 4px;border-radius:9999px;background:#ef4444;color:#fff;font-size:11px;',
            'font-weight:800;line-height:18px;text-align:center;box-shadow:0 0 0 2px #fff;display:none;font-style:normal;}',
            '.aisa-menu-badge.show{display:block;}',

            /* === Drawer (menu) === */
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

            /* === Bell dropdown panel === */
            '.aisa-bell-panel{position:fixed;top:3.5rem;left:.6rem;z-index:2147483005;width:360px;max-width:calc(100vw - 1.2rem);',
            'background:#fff;border:1px solid #e2e8f0;border-radius:1rem;box-shadow:0 25px 50px -12px rgba(15,23,42,.35);',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;',
            'opacity:0;visibility:hidden;transform:translateY(-6px);',
            'transition:opacity .15s,transform .15s,visibility .15s;display:flex;flex-direction:column;max-height:75vh;}',
            '.aisa-bell-panel.open{opacity:1;visibility:visible;transform:translateY(0);}',
            '.aisa-bell-head{padding:.85rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;}',
            '.aisa-bell-head .t{font-size:.95rem;font-weight:800;color:#0f172a;}',
            '.aisa-bell-head button{font:inherit;font-size:.75rem;font-weight:700;color:#4f46e5;background:none;border:none;cursor:pointer;padding:0;}',
            '.aisa-bell-head button:hover{text-decoration:underline;}',
            '.aisa-bell-head button:disabled{color:#cbd5e1;cursor:default;text-decoration:none;}',
            '.aisa-bell-list{flex:1;overflow-y:auto;padding:.4rem;}',
            '.aisa-bell-empty{padding:2rem 1rem;text-align:center;color:#94a3b8;font-size:.85rem;}',
            '.aisa-bell-empty .e{font-size:1.75rem;margin-bottom:.5rem;}',

            '.aisa-bell-item{display:block;width:100%;text-align:left;border:none;background:#f8fafc;',
            'border-radius:.6rem;padding:.7rem .8rem;margin-bottom:.3rem;cursor:pointer;position:relative;transition:background .15s;}',
            '.aisa-bell-item:hover{background:#f1f5f9;}',
            '.aisa-bell-item.unread{background:#eef2ff;}',
            '.aisa-bell-item.unread:hover{background:#e0e7ff;}',
            '.aisa-bell-item .nt{font-weight:700;font-size:.9rem;color:#0f172a;line-height:1.3;padding-right:1rem;}',
            '.aisa-bell-item .nb{font-size:.8rem;color:#475569;margin-top:3px;line-height:1.4;',
            'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
            '.aisa-bell-item .nm{font-size:.7rem;color:#94a3b8;margin-top:5px;}',
            '.aisa-bell-item .dot{position:absolute;top:.85rem;right:.7rem;width:8px;height:8px;border-radius:50%;background:#4f46e5;}',

            /* === Full-view modal === */
            '.aisa-notif-modal{position:fixed;inset:0;z-index:2147483010;display:flex;align-items:center;justify-content:center;',
            'background:rgba(15,23,42,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
            'opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;padding:1rem;',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
            '.aisa-notif-modal.open{opacity:1;visibility:visible;}',
            '.aisa-notif-card{background:#fff;color:#0f172a;border-radius:1.25rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.4);',
            'width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column;',
            'transform:translateY(8px) scale(.98);transition:transform .25s cubic-bezier(.22,1,.36,1);}',
            '.aisa-notif-modal.open .aisa-notif-card{transform:translateY(0) scale(1);}',
            '.aisa-notif-card-head{padding:1.5rem 1.5rem 1rem;border-bottom:1px solid #f1f5f9;position:relative;}',
            '.aisa-notif-card-head .close{position:absolute;top:.75rem;right:.75rem;background:transparent;border:none;cursor:pointer;',
            'color:#94a3b8;font-size:1.5rem;line-height:1;width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;',
            'border-radius:.5rem;}',
            '.aisa-notif-card-head .close:hover{background:#f1f5f9;color:#0f172a;}',
            '.aisa-notif-card-head .badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:.65rem;',
            'font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:.2rem .6rem;border-radius:9999px;margin-bottom:.6rem;}',
            '.aisa-notif-card-head h2{font-size:1.35rem;font-weight:800;color:#0f172a;margin:0 2rem .25rem 0;line-height:1.25;}',
            '.aisa-notif-card-head .meta{font-size:.8rem;color:#64748b;}',
            '.aisa-notif-card-body{padding:1.25rem 1.5rem 1.5rem;overflow-y:auto;flex:1;font-size:.95rem;color:#334155;line-height:1.6;white-space:normal;word-break:break-word;}',
            '.aisa-notif-card-body p{margin:0 0 .75em;}',

            /* Link styling (used in panel preview AND in modal) */
            '.aisa-rt-link{color:#4f46e5;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1.5px;}',
            '.aisa-rt-link:hover{color:#312e81;}',

            /* Small screens */
            '@media (max-width:480px){',
                '.aisa-bell-panel{left:.5rem;right:.5rem;width:auto;max-width:none;}',
                '.aisa-notif-card{max-height:90vh;border-radius:1rem;}',
            '}',

            '@media print{.aisa-menu-toggle,.aisa-bell-toggle,.aisa-menu-backdrop,.aisa-menu-drawer,.aisa-bell-panel,.aisa-notif-modal{display:none!important;}}'
        ].join('');
        document.head.appendChild(s);
    }

    /* -------- build -------- */

    function build() {
        if (built) return;
        built = true;
        injectStyles();

        /* Hamburger */
        var toggle = document.createElement('button');
        toggle.className = 'aisa-menu-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Open menu');
        toggle.innerHTML = '<span></span><span></span><span></span>';

        /* Bell */
        var bell = document.createElement('button');
        bell.className = 'aisa-bell-toggle';
        bell.type = 'button';
        bell.setAttribute('aria-label', 'Open notifications');
        bell.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>' +
            '</svg>' +
            '<b class="aisa-menu-badge" aria-hidden="true"></b>';

        /* Drawer backdrop + drawer */
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
            '<ul class="aisa-menu-list">' + linksHtml + adminHtml + '</ul>' +
            '<div class="aisa-menu-foot">' +
                '<button type="button" class="aisa-menu-signout">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>' +
                    'Sign out</button>' +
            '</div>';

        /* Bell dropdown */
        var panel = document.createElement('div');
        panel.className = 'aisa-bell-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Notifications');
        panel.innerHTML =
            '<div class="aisa-bell-head">' +
                '<span class="t">Notifications</span>' +
                '<button type="button" class="aisa-bell-markall" disabled>Mark all read</button>' +
            '</div>' +
            '<div class="aisa-bell-list"></div>';

        document.body.appendChild(toggle);
        document.body.appendChild(bell);
        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);
        document.body.appendChild(panel);

        refs.toggle      = toggle;
        refs.bell        = bell;
        refs.backdrop    = backdrop;
        refs.drawer      = drawer;
        refs.panel       = panel;
        refs.bellBadge   = bell.querySelector('.aisa-menu-badge');
        refs.bellList    = panel.querySelector('.aisa-bell-list');
        refs.bellMarkAll = panel.querySelector('.aisa-bell-markall');
        refs.name        = drawer.querySelector('.who .name');
        refs.email       = drawer.querySelector('.who .email');

        /* --- Drawer behaviour --- */
        function drawerOpen()  { closePanel(); toggle.classList.add('open'); backdrop.classList.add('open'); drawer.classList.add('open'); toggle.setAttribute('aria-label', 'Close menu'); }
        function drawerClose() { toggle.classList.remove('open'); backdrop.classList.remove('open'); drawer.classList.remove('open'); toggle.setAttribute('aria-label', 'Open menu'); }
        function drawerIsOpen() { return drawer.classList.contains('open'); }

        toggle.addEventListener('click', function () { drawerIsOpen() ? drawerClose() : drawerOpen(); });
        backdrop.addEventListener('click', drawerClose);

        drawer.querySelector('.aisa-menu-signout').addEventListener('click', function () {
            if (window.aisaAuth && typeof window.aisaAuth.signOut === 'function') {
                window.aisaAuth.signOut();
            } else {
                window.location.href = rootUrl('index.html');
            }
        });

        /* --- Bell behaviour --- */
        function openPanel()  { drawerClose(); panel.classList.add('open'); bell.setAttribute('aria-label', 'Close notifications'); }
        function closePanel() { panel.classList.remove('open'); bell.setAttribute('aria-label', 'Open notifications'); }
        function panelIsOpen() { return panel.classList.contains('open'); }

        bell.addEventListener('click', function (e) {
            e.stopPropagation();
            panelIsOpen() ? closePanel() : openPanel();
        });
        /* Click outside closes the panel; clicks inside the panel itself
         * (or on the bell) are filtered out by stopPropagation/contains. */
        document.addEventListener('click', function (e) {
            if (!panelIsOpen()) return;
            if (panel.contains(e.target) || bell.contains(e.target)) return;
            closePanel();
        });

        refs.bellMarkAll.addEventListener('click', markAllRead);

        /* Global escape closes whichever is open. */
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (refs.openModal) { closeNotificationModal(); return; }
            if (panelIsOpen())  { closePanel();  return; }
            if (drawerIsOpen()) { drawerClose(); return; }
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

    /* -------- Notifications: bell list, modal, badge -------- */

    function updateBadge(count) {
        if (!refs.bellBadge || !refs.bell) return;
        if (count > 0) {
            refs.bellBadge.textContent = count > 9 ? '9+' : String(count);
            refs.bellBadge.classList.add('show');
            refs.bell.classList.add('has-unread');
        } else {
            refs.bellBadge.classList.remove('show');
            refs.bell.classList.remove('has-unread');
        }
    }

    function renderBellList() {
        if (!refs.bellList) return;
        var items = notifications;
        if (!items.length) {
            refs.bellList.innerHTML =
                '<div class="aisa-bell-empty">' +
                    '<div class="e">\u{1F389}</div>' +
                    'You’re all caught up.' +
                '</div>';
            refs.bellMarkAll.disabled = true;
            updateBadge(0);
            return;
        }
        var unread = 0;
        refs.bellList.innerHTML = items.map(function (n, idx) {
            if (!n.read) unread++;
            return '<button type="button" class="aisa-bell-item' + (n.read ? '' : ' unread') + '" data-idx="' + idx + '">' +
                (n.read ? '' : '<span class="dot" aria-hidden="true"></span>') +
                '<div class="nt">' + escapeHtml(n.title || 'Notification') + '</div>' +
                (n.body ? '<div class="nb">' + escapeHtml(n.body).replace(/\n/g, ' ') + '</div>' : '') +
                '<div class="nm">' + escapeHtml(n.author_name || 'AISA') + ' · ' + timeAgo(n.created_at) + '</div>' +
            '</button>';
        }).join('');
        refs.bellMarkAll.disabled = unread === 0;
        updateBadge(unread);

        refs.bellList.querySelectorAll('.aisa-bell-item').forEach(function (el) {
            el.addEventListener('click', function () {
                var idx = parseInt(el.getAttribute('data-idx'), 10);
                openNotificationModal(notifications[idx]);
                /* Mark read locally + server-side. */
                if (!notifications[idx].read) {
                    notifications[idx].read = true;
                    el.classList.remove('unread');
                    var d = el.querySelector('.dot'); if (d) d.remove();
                    var unreadNow = notifications.filter(function (x) { return !x.read; }).length;
                    updateBadge(unreadNow);
                    refs.bellMarkAll.disabled = unreadNow === 0;
                    if (window.aisaAuth && window.aisaAuth.markNotificationRead) {
                        window.aisaAuth.markNotificationRead(notifications[idx].id).catch(function () {});
                    }
                }
            });
        });
    }

    function markAllRead() {
        notifications.forEach(function (n) { n.read = true; });
        renderBellList();
        if (window.aisaAuth && window.aisaAuth.markAllNotificationsRead) {
            window.aisaAuth.markAllNotificationsRead().catch(function () {});
        }
    }

    function openNotificationModal(n) {
        if (!n) return;
        closeNotificationModal();
        /* Hide the panel — the modal takes over the focus. */
        if (refs.panel) refs.panel.classList.remove('open');

        var modal = document.createElement('div');
        modal.className = 'aisa-notif-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div class="aisa-notif-card">' +
                '<div class="aisa-notif-card-head">' +
                    '<button class="close" type="button" aria-label="Close">&times;</button>' +
                    '<div class="badge">Notification</div>' +
                    '<h2>' + escapeHtml(n.title || 'Notification') + '</h2>' +
                    '<div class="meta">' + escapeHtml(n.author_name || 'AISA') + ' &middot; ' + escapeHtml(timeFull(n.created_at)) + '</div>' +
                '</div>' +
                '<div class="aisa-notif-card-body">' +
                    (n.body ? renderRichText(n.body) : '<em style="color:#94a3b8">(no message body)</em>') +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        /* Force a reflow so the .open transition triggers. */
        void modal.offsetWidth;
        modal.classList.add('open');

        refs.openModal = modal;
        modal.querySelector('.close').addEventListener('click', closeNotificationModal);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeNotificationModal();
        });
    }

    function closeNotificationModal() {
        var m = refs.openModal;
        if (!m) return;
        m.classList.remove('open');
        refs.openModal = null;
        /* Wait for transition before removing. */
        setTimeout(function () { if (m.parentNode) m.parentNode.removeChild(m); }, 220);
    }

    function loadNotifications() {
        if (!window.aisaAuth || typeof window.aisaAuth.getNotifications !== 'function') return;
        if (!window.aisaAuth.isConfigured || !window.aisaAuth.isConfigured()) return;
        window.aisaAuth.getNotifications().then(function (r) {
            notifications = (r && r.notifications) || [];
            renderBellList();
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
        if (typeof window.aisaReady === 'function') {
            window.aisaReady(function () { if (built) afterAuth(); else document.addEventListener('DOMContentLoaded', afterAuth); });
        }
    }

    start();
})();
