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
        toggle.innerHTML = '<span></span><span></span><span></span>';

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

        drawer.innerHTML =
            '<div class="aisa-menu-head">' +
                '<div class="logo"><img src="' + rootUrl('AISA_logo.png') + '" alt="AISA" ' +
                    'onerror="this.style.display=\'none\';this.parentNode.textContent=\'AISA\';"></div>' +
                '<div class="who">' +
                    '<div class="name">AISA Learning Hub</div>' +
                    '<div class="email"></div>' +
                '</div>' +
            '</div>' +
            '<ul class="aisa-menu-list">' + linksHtml + '</ul>' +
            '<div class="aisa-menu-foot">' +
                '<button type="button" class="aisa-menu-signout">' +
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>' +
                    'Sign out</button>' +
            '</div>';

        document.body.appendChild(toggle);
        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);

        refs.toggle   = toggle;
        refs.backdrop = backdrop;
        refs.drawer   = drawer;
        refs.name     = drawer.querySelector('.who .name');
        refs.email    = drawer.querySelector('.who .email');

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
    }

    function start() {
        if (document.body) {
            build();
        } else {
            document.addEventListener('DOMContentLoaded', build);
        }
        /* Fill in the signed-in user once auth resolves. */
        if (typeof window.aisaReady === 'function') {
            window.aisaReady(function () { if (built) fillUser(); else document.addEventListener('DOMContentLoaded', fillUser); });
        }
    }

    start();
})();
