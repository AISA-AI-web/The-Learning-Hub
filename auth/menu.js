/*
 * AISA Learning Hub — global top app-bar.
 *
 * Auto-loaded by auth/gate.js on every page. Injects a single fixed
 * top app-bar that becomes the navigation surface for the whole Hub:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │  [←][⌂][☰]  [🔍 Search… ⌘K]  [🌐 AR][🛡️][🔔]  AISA Learning Hub │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * - Back:        history.back() (disabled if there's nothing to go to)
 * - Home:        navigates to index.html
 * - Menu (☰):    slide-in drawer with every section + Sign out
 * - Search pill: full-screen overlay over the shared Hub directory
 *                (window.AISA_HUB_INDEX from auth/search-index.js).
 *                ⌘K / Ctrl-K opens it from anywhere.
 * - Language:    flips html[lang]/[dir] between English and Arabic and
 *                rewrites data-placeholder-* / data-aria-label-* across
 *                the page. Choice is persisted in localStorage so the
 *                whole Hub respects it.
 * - Admin (🛡️): shown only once isAdmin() resolves true; dropdown
 *                shortcuts to Admin Dashboard and Send Notifications.
 * - Bell:        unread badge + dropdown of recent notifications →
 *                clicking a notification opens a full-view modal with
 *                rich-text links rendered (window.AisaRichText.render)
 * - Brand:       AISA logo + wordmark, links to the Learning Hub home
 *
 * Per-page sticky headers (the ones with the duplicated AISA logo)
 * are hidden via CSS so this is the only top navigation visible.
 * Body padding-top is set to the bar's height so nothing slips under.
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

    /* Fallback search index. The canonical directory lives in
     * auth/search-index.js (window.AISA_HUB_INDEX) so the global
     * search and the home-page hero search stay in sync. We keep
     * this short list only as a safety net for the rare case where
     * search-index.js hasn't loaded yet. */
    var SEARCH_INDEX = [
        /* Hub home + personal */
        { title: 'Learning Hub',                       desc: 'AISA hub home page',                                           href: 'index.html',                                                                       icon: '\u{1F3E0}', tag: 'Hub' },
        { title: 'My Dashboard',                       desc: 'Your PD progress, badges, and certificate downloads',           href: 'dashboard.html',                                                                   icon: '\u{1F4CA}', tag: 'Personal' },

        /* Admin (filtered to admins only) */
        { title: 'Admin Dashboard',                    desc: 'Staff completion overview and compliance reports',              href: 'admin-dashboard.html',                                                             icon: '\u{1F6E1}',  tag: 'Admin', adminOnly: true },
        { title: 'Send Notifications',                 desc: 'Compose and publish notifications to staff',                    href: 'admin-notifications.html',                                                         icon: '\u{1F4E2}',  tag: 'Admin', adminOnly: true },

        /* PD modules */
        { title: 'PD Modules',                         desc: 'All professional development modules',                          href: 'PD%20Modules/pd.html',                                                             icon: '\u{1F393}', tag: 'Hub' },
        { title: 'AI Ethics & Policy',                 desc: 'Required: AISA AI vision, principles, approved tools',          href: 'PD%20Modules/ai-ethics-module.html',                                               icon: '\u{1F9ED}', tag: 'Module' },
        { title: 'Return to School',                   desc: 'Required: ADEK protocols, drills, safety',                      href: 'PD%20Modules/return-to-school.html',                                               icon: '\u{1F6A8}', tag: 'Module' },
        { title: 'Workspace Studio',                   desc: 'Build Flows + Skills for everyday tasks in Google Workspace',   href: 'PD%20Modules/workspace-studio-module.html',                                        icon: '\u{1F6E0}', tag: 'Module' },
        { title: 'NotebookLM',                         desc: 'Source-grounded AI for lesson planning and presentations',      href: 'PD%20Modules/notebooklm-module.html',                                              icon: '\u{1F4D2}', tag: 'Module' },
        { title: 'Chalkie',                            desc: 'AI teaching assistant masterclass',                             href: 'PD%20Modules/chalkie-module.html',                                                 icon: '\u{270F}',  tag: 'Module' },
        { title: 'AI & Assessment',                    desc: 'Assessment design in the age of AI',                            href: 'PD%20Modules/ai-and-assessment.html',                                              icon: '\u{1F4DD}', tag: 'Module' },

        /* Orientation Hub */
        { title: 'Orientation Hub',                    desc: 'Landing page for new-staff onboarding',                         href: 'Orientation%20Hub/orientation-hub.html',                                           icon: '\u{1F9ED}', tag: 'Hub' },
        { title: 'Orientation overview',               desc: 'Welcome and orientation introduction',                          href: 'Orientation%20Hub/orientation.html',                                               icon: '\u{1F44B}', tag: 'Onboarding' },
        { title: 'AISA history',                       desc: 'About the American International School in Abu Dhabi',          href: 'Orientation%20Hub/aisa-history.html',                                              icon: '\u{1F3DB}', tag: 'Onboarding' },
        { title: 'First-week checklist & FAQs',        desc: 'Practical guidance for your first week at AISA',                href: 'Orientation%20Hub/first-week-faqs.html',                                           icon: '\u{2705}',  tag: 'Onboarding' },
        { title: 'Living in Abu Dhabi',                desc: 'Visas, banking, housing, transport, getting settled',           href: 'Orientation%20Hub/living-in-abu-dhabi.html',                                       icon: '\u{1F3D9}', tag: 'Onboarding' },
        { title: 'Meet the AISA team',                 desc: 'Leadership and key staff directory',                            href: 'Orientation%20Hub/meet-the-team.html',                                             icon: '\u{1F465}', tag: 'Onboarding' },
        { title: 'Programs & Curriculum',              desc: 'Academic programs and curriculum overview',                     href: 'Orientation%20Hub/programs-and-curriculum.html',                                   icon: '\u{1F4DA}', tag: 'Onboarding' },
        { title: 'Work matters & policies',            desc: 'HR essentials, professional standards, policies',               href: 'Orientation%20Hub/work-matters.html',                                              icon: '\u{1F4CB}', tag: 'Onboarding' },
        { title: 'New Teachers Onboarding Guide (PDF)', desc: 'Full onboarding handbook PDF for new staff',                   href: 'Orientation%20Hub/Copy%20of%20AISA%20New%20Teachers%20%20Onbording%20Guide%20.pdf', icon: '\u{1F4C4}', tag: 'Reference' },

        /* Tools */
        { title: 'Tools & Resources',                  desc: 'AI tools, templates, and reference materials',                  href: 'Tools%20and%20Resources/tools.html',                                               icon: '\u{1F6E0}', tag: 'Hub' },
        { title: 'Lesson Planning Tool',               desc: 'Excellent Teaching & Learning lesson planner',                  href: 'Tools%20and%20Resources/lesson-planning-tool.html',                                icon: '\u{1F4DD}', tag: 'Tool' },

        /* Library */
        { title: 'Library Hub',                        desc: 'Books, articles, and research collections',                     href: 'Library%20Hub/library-hub.html',                                                   icon: '\u{1F4DA}', tag: 'Hub' },
        { title: 'Library — for students',             desc: 'Student-facing library resources',                              href: 'Library%20Hub/student.html',                                                       icon: '\u{1F393}', tag: 'Library' },
        { title: 'Library — for teachers & staff',     desc: 'Staff-facing library resources',                                href: 'Library%20Hub/teacher.html',                                                       icon: '\u{1F468}\u{200D}\u{1F3EB}', tag: 'Library' },

        /* Wired Wed */
        { title: 'Wired Wednesdays',                   desc: 'Weekly drop-in AI sessions',                                    href: 'Wired%20Wednesdays/wired-wednesdays.html',                                         icon: '\u{26A1}',  tag: 'Hub' },

        /* Media Hub */
        { title: 'Media Hub',                          desc: 'Newsletters, videos, recordings',                               href: 'Media%20Hub/media.html',                                                           icon: '\u{1F3AC}', tag: 'Hub' },
        { title: 'Digital Tools Newsletter — May 4',   desc: 'Issue 1: digital tools deep-dives',                             href: 'Media%20Hub/may4.html',                                                            icon: '\u{1F4F0}', tag: 'Newsletter' },
        { title: 'Digital Lion Newsletter — May 11',   desc: 'Issue 2: Wired Wednesdays, Flows, Gemini in Workspace',         href: 'Media%20Hub/may11.html',                                                           icon: '\u{1F4F0}', tag: 'Newsletter' },
        { title: 'Digital Lion Newsletter — May 18',   desc: 'Issue 3: class visit schedule, AI integration snapshot form',   href: 'Media%20Hub/may18.html',                                                           icon: '\u{1F4F0}', tag: 'Newsletter' },
        { title: 'Classroom AI Integration Snapshot',  desc: 'Non-evaluative classroom-visit observation form (PDF)',         href: 'Media%20Hub/Classroom%20AI%20Integration%20Snapshot.pdf',                          icon: '\u{1F4CB}', tag: 'Reference' },

        /* Committees */
        { title: 'Committees & Governance',            desc: 'AISA staff committees',                                         href: 'Committees/committees.html',                                                       icon: '\u{1F91D}', tag: 'Hub' },
        { title: '25–26 Committee List (PDF)',         desc: 'Current academic-year committee membership',                    href: 'Committees/25-26%20committee%20list%20(1).pdf',                                    icon: '\u{1F4C4}', tag: 'Reference' }
    ];

    var built = false;
    var refs = {};
    var notifications = [];
    var isAdminUser = false;  // flipped to true once isAdmin() resolves yes

    /* Bilingual support — Arabic <-> English. The localStorage key is
     * shared with the legacy per-page toggle so the global toggle and
     * any older inline toggles stay in sync. */
    var LANG_KEY = 'aisa-newsletter-lang';
    function readLang() {
        try { return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en'; }
        catch (e) { return 'en'; }
    }
    function writeLang(lang) {
        try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
    }

    /* Switch the whole page to the requested language. This is the
     * canonical applier for the entire Hub: it sets html[lang]/[dir],
     * rewrites every data-placeholder-* / data-aria-label-* attribute,
     * persists the choice, refreshes our own button label, and fires
     * an 'aisa:lang-change' event so per-page code (e.g. document.title
     * swaps) can react without duplicating this logic. */
    function applyLang(lang, opts) {
        var next = lang === 'ar' ? 'ar' : 'en';
        var html = document.documentElement;
        html.setAttribute('lang', next);
        html.setAttribute('dir', next === 'ar' ? 'rtl' : 'ltr');

        document.querySelectorAll('[data-placeholder-en]').forEach(function (el) {
            var v = el.getAttribute('data-placeholder-' + next);
            if (v != null) el.setAttribute('placeholder', v);
        });
        document.querySelectorAll('[data-aria-label-en]').forEach(function (el) {
            var v = el.getAttribute('data-aria-label-' + next);
            if (v != null) el.setAttribute('aria-label', v);
        });

        writeLang(next);
        if (refs.btnLangLabel) {
            /* Show the *target* language — what you'll switch TO. */
            refs.btnLangLabel.textContent = next === 'ar' ? 'EN' : 'العربية';
        }
        if (refs.btnLang) {
            refs.btnLang.setAttribute('aria-label',
                next === 'ar' ? 'Switch to English' : 'Switch to Arabic');
        }
        if (opts && opts.announce) {
            try {
                document.dispatchEvent(new CustomEvent('aisa:lang-change', { detail: { lang: next } }));
            } catch (e) {}
        }
    }

    /* -------- shared rich-text helpers (exposed via window.AisaRichText) -------- */

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function renderRichText(text) {
        if (!text) return '';
        var safe = escapeHtml(text);
        var anchors = [];
        safe = safe.replace(
            /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g,
            function (_, label, url) {
                var ix = anchors.length;
                anchors.push(makeAnchor(url, label));
                return '\x00A' + ix + '\x00';
            }
        );
        safe = safe.replace(
            /(^|[\s(])(https?:\/\/[^\s<]+)/g,
            function (_, prefix, url) {
                var trail = '';
                var m = url.match(/[.,!?;:)]+$/);
                if (m) { trail = m[0]; url = url.slice(0, -trail.length); }
                return prefix + makeAnchor(url, url) + trail;
            }
        );
        safe = safe.replace(/\x00A(\d+)\x00/g, function (_, ix) { return anchors[+ix]; });
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

    /* -------- icon SVGs (Lucide-style, 1.8 stroke) -------- */

    function icon(path, viewBox) {
        return '<svg viewBox="' + (viewBox || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }
    var ICONS = {
        back:   icon('<path d="M15 18l-6-6 6-6"/>'),
        home:   icon('<path d="M3 9.5L12 3l9 6.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20V9.5z"/><path d="M9 21V13h6v8"/>'),
        menu:   icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
        bell:   icon('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M13.73 21a2 2 0 0 1-3.46 0"/>'),
        search: icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
        admin:  icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
        globe:  icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
        close:  icon('<path d="M18 6L6 18M6 6l12 12"/>'),
        signout: icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>')
    };

    /* -------- styles -------- */

    var BAR_HEIGHT = '3.75rem';  // 60px

    function injectStyles() {
        var s = document.createElement('style');
        s.id = 'aisa-menu-style';
        s.textContent = [
            /* === Reset body so the fixed bar doesn't cover content === */
            'body{padding-top:' + BAR_HEIGHT + ';}',

            /* Hide the duplicated per-page sticky headers across the site
             * so the global app-bar is the only top navigation surface. */
            'body > header.sticky.top-0{display:none!important;}',

            /* === Top app-bar === */
            '.aisa-topbar{position:fixed;top:0;left:0;right:0;height:' + BAR_HEIGHT + ';z-index:2147483000;',
                'background:rgba(255,255,255,.92);-webkit-backdrop-filter:saturate(180%) blur(12px);backdrop-filter:saturate(180%) blur(12px);',
                'border-bottom:1px solid #e2e8f0;',
                'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
            '.aisa-topbar-inner{height:100%;max-width:none;margin:0 auto;padding:0 1rem;',
                'display:flex;align-items:center;justify-content:space-between;gap:.5rem;}',
            '.aisa-topbar-actions{display:flex;align-items:center;gap:.25rem;}',
            '.aisa-topbar-right{display:flex;align-items:center;gap:.25rem;}',

            /* Action buttons (bigger than before for the "professional" feel) */
            '.aisa-tb-btn{position:relative;width:2.6rem;height:2.6rem;display:inline-flex;align-items:center;justify-content:center;',
                'background:transparent;border:none;border-radius:.75rem;cursor:pointer;color:#0f172a;',
                'transition:background .15s,color .15s,transform .12s;-webkit-tap-highlight-color:transparent;}',
            '.aisa-tb-btn svg{width:1.35rem;height:1.35rem;}',
            '.aisa-tb-btn:hover{background:#f1f5f9;}',
            '.aisa-tb-btn:active{transform:scale(.96);}',
            '.aisa-tb-btn:focus-visible{outline:2px solid #4f46e5;outline-offset:2px;}',
            '.aisa-tb-btn:disabled{opacity:.35;cursor:default;pointer-events:none;}',

            /* Hamburger animation: rotate ☰ → ✕ via CSS when drawer is open. */
            '.aisa-tb-btn.aisa-tb-menu svg path{transition:transform .2s,opacity .2s;transform-origin:center;}',
            '.aisa-tb-btn.aisa-tb-menu.open svg{transform:rotate(90deg);transition:transform .2s;}',

            /* Admin shield button — hidden until isAdmin() resolves true. */
            '.aisa-tb-btn.aisa-tb-admin{color:#0f766e;}',
            '.aisa-tb-btn.aisa-tb-admin:hover{background:#ccfbf1;}',

            /* Language toggle — pill with globe icon + the target language. */
            '.aisa-tb-lang{display:inline-flex;align-items:center;gap:.4rem;height:2.4rem;padding:0 .8rem;',
                'background:transparent;border:1px solid #e2e8f0;border-radius:9999px;color:#0f172a;',
                'font:inherit;font-weight:700;font-size:.82rem;cursor:pointer;',
                'transition:background .15s,border-color .15s,color .15s;-webkit-tap-highlight-color:transparent;}',
            '.aisa-tb-lang:hover{background:#f1f5f9;border-color:#cbd5e1;}',
            '.aisa-tb-lang:focus-visible{outline:2px solid #4f46e5;outline-offset:2px;}',
            '.aisa-tb-lang svg{width:1.05rem;height:1.05rem;color:#4f46e5;flex-shrink:0;}',
            '.aisa-tb-lang-label{white-space:nowrap;}',

            /* === Search pill (center of the bar — the primary action) === */
            '.aisa-tb-searchpill{flex:1 1 auto;min-width:0;max-width:36rem;margin:0 1rem;height:2.6rem;',
                'display:inline-flex;align-items:center;gap:.65rem;padding:0 .85rem;',
                'background:#f1f5f9;border:1px solid transparent;border-radius:.85rem;',
                'color:#64748b;font:inherit;cursor:text;',
                'transition:background .15s,border-color .15s,box-shadow .15s;}',
            '.aisa-tb-searchpill:hover{background:#e2e8f0;border-color:#cbd5e1;}',
            '.aisa-tb-searchpill:focus-visible{outline:none;border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.18);}',
            '.aisa-tb-searchpill svg{width:1.15rem;height:1.15rem;flex-shrink:0;color:#475569;}',
            '.aisa-tb-searchpill .ph{flex:1;min-width:0;text-align:left;font-size:.92rem;font-weight:500;',
                'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-tb-searchpill .kbd{flex-shrink:0;font-size:.7rem;font-weight:700;color:#64748b;',
                'background:#fff;border:1px solid #e2e8f0;border-radius:.35rem;padding:.15rem .4rem;',
                'letter-spacing:.02em;}',

            /* Brand on the right */
            '.aisa-topbar-brand{display:inline-flex;align-items:center;gap:.6rem;text-decoration:none;',
                'padding:.35rem .55rem .35rem .35rem;border-radius:.6rem;transition:background .15s;}',
            '.aisa-topbar-brand:hover{background:#f1f5f9;}',
            '.aisa-topbar-brand img{width:2rem;height:2rem;object-fit:contain;border-radius:.35rem;}',
            '.aisa-topbar-brand .wm{font-weight:800;color:#0f172a;font-size:.95rem;letter-spacing:-.01em;line-height:1;',
                'display:flex;flex-direction:column;}',
            '.aisa-topbar-brand .wm small{font-weight:600;font-size:.68rem;color:#64748b;margin-top:2px;letter-spacing:.04em;}',

            /* Unread badge on the bell */
            '.aisa-tb-badge{position:absolute;top:.35rem;right:.4rem;min-width:18px;height:18px;',
                'padding:0 4px;border-radius:9999px;background:#ef4444;color:#fff;font-size:11px;',
                'font-weight:800;line-height:18px;text-align:center;box-shadow:0 0 0 2px rgba(255,255,255,.92);display:none;font-style:normal;}',
            '.aisa-tb-badge.show{display:block;}',

            /* === Menu drawer === */
            '.aisa-menu-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.5);',
                '-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);opacity:0;visibility:hidden;',
                'transition:opacity .25s,visibility .25s;}',
            '.aisa-menu-backdrop.open{opacity:1;visibility:visible;}',

            '.aisa-menu-drawer{position:fixed;top:0;left:0;bottom:0;z-index:2147483002;width:320px;max-width:88vw;',
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
            '.aisa-menu-head .who .email{font-size:.75rem;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-menu-list{list-style:none;margin:0;padding:.5rem;overflow-y:auto;flex:1;}',
            '.aisa-menu-list a{display:flex;align-items:center;gap:.75rem;padding:.75rem .8rem;border-radius:.6rem;',
                'text-decoration:none;color:#0f172a;font-weight:600;font-size:.92rem;transition:background .15s;}',
            '.aisa-menu-list a:hover{background:#f1f5f9;}',
            '.aisa-menu-list a .ico{width:1.5rem;text-align:center;font-size:1.05rem;flex-shrink:0;}',
            '.aisa-menu-foot{padding:.75rem;border-top:1px solid #f1f5f9;}',
            '.aisa-menu-signout{width:100%;display:flex;align-items:center;justify-content:center;gap:.5rem;',
                'padding:.75rem 1rem;border-radius:.6rem;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;',
                'font:inherit;font-weight:700;cursor:pointer;transition:background .15s;}',
            '.aisa-menu-signout:hover{background:#fee2e2;}',
            '.aisa-menu-signout svg{width:16px;height:16px;}',

            /* === Bell dropdown panel === */
            '.aisa-bell-panel{position:fixed;top:calc(' + BAR_HEIGHT + ' + .25rem);z-index:2147483005;width:380px;max-width:calc(100vw - 1.2rem);',
                'background:#fff;border:1px solid #e2e8f0;border-radius:1rem;box-shadow:0 25px 50px -12px rgba(15,23,42,.35);',
                'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;',
                'opacity:0;visibility:hidden;transform:translateY(-6px);',
                'transition:opacity .15s,transform .15s,visibility .15s;display:flex;flex-direction:column;max-height:75vh;}',
            '.aisa-bell-panel.open{opacity:1;visibility:visible;transform:translateY(0);}',
            '.aisa-bell-head{padding:.95rem 1rem;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;justify-content:space-between;}',
            '.aisa-bell-head .t{font-size:.95rem;font-weight:800;color:#0f172a;}',
            '.aisa-bell-head button{font:inherit;font-size:.78rem;font-weight:700;color:#4f46e5;background:none;border:none;cursor:pointer;padding:0;}',
            '.aisa-bell-head button:hover{text-decoration:underline;}',
            '.aisa-bell-head button:disabled{color:#cbd5e1;cursor:default;text-decoration:none;}',
            '.aisa-bell-list{flex:1;overflow-y:auto;padding:.4rem;}',
            '.aisa-bell-empty{padding:2.25rem 1rem;text-align:center;color:#94a3b8;font-size:.85rem;}',
            '.aisa-bell-empty .e{font-size:1.75rem;margin-bottom:.5rem;}',

            '.aisa-bell-item{display:block;width:100%;text-align:left;border:none;background:#f8fafc;',
                'border-radius:.6rem;padding:.75rem .85rem;margin-bottom:.3rem;cursor:pointer;position:relative;transition:background .15s;}',
            '.aisa-bell-item:hover{background:#f1f5f9;}',
            '.aisa-bell-item.unread{background:#eef2ff;}',
            '.aisa-bell-item.unread:hover{background:#e0e7ff;}',
            '.aisa-bell-item .nt{font-weight:700;font-size:.9rem;color:#0f172a;line-height:1.3;padding-right:1rem;}',
            '.aisa-bell-item .nb{font-size:.8rem;color:#475569;margin-top:3px;line-height:1.4;',
                'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
            '.aisa-bell-item .nm{font-size:.7rem;color:#94a3b8;margin-top:5px;}',
            '.aisa-bell-item .dot{position:absolute;top:.95rem;right:.85rem;width:8px;height:8px;border-radius:50%;background:#4f46e5;}',

            /* === Admin dropdown panel === */
            '.aisa-admin-panel{position:fixed;top:calc(' + BAR_HEIGHT + ' + .25rem);z-index:2147483005;width:300px;max-width:calc(100vw - 1.2rem);',
                'background:#fff;border:1px solid #e2e8f0;border-radius:1rem;box-shadow:0 25px 50px -12px rgba(15,23,42,.35);',
                'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;',
                'opacity:0;visibility:hidden;transform:translateY(-6px);',
                'transition:opacity .15s,transform .15s,visibility .15s;padding:.4rem;}',
            '.aisa-admin-panel.open{opacity:1;visibility:visible;transform:translateY(0);}',
            '.aisa-admin-head{padding:.5rem .75rem .25rem;display:flex;align-items:center;justify-content:space-between;}',
            '.aisa-admin-head .t{font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;color:#64748b;}',
            '.aisa-admin-item{display:flex;align-items:center;gap:.75rem;padding:.65rem .75rem;border-radius:.6rem;',
                'text-decoration:none;color:#0f172a;transition:background .12s;}',
            '.aisa-admin-item:hover{background:#f1f5f9;}',
            '.aisa-admin-item .ic{width:2.1rem;height:2.1rem;border-radius:.55rem;background:#f1f5f9;display:inline-flex;align-items:center;justify-content:center;font-size:1.05rem;flex-shrink:0;}',
            '.aisa-admin-item .body{min-width:0;flex:1;}',
            '.aisa-admin-item .tt{display:block;font-weight:700;font-size:.9rem;line-height:1.25;}',
            '.aisa-admin-item .dd{display:block;font-size:.75rem;color:#64748b;margin-top:1px;}',

            /* === Search overlay === */
            '.aisa-search-overlay{position:fixed;inset:0;z-index:2147483006;display:flex;align-items:flex-start;justify-content:center;',
                'padding:5rem 1rem 1rem;background:rgba(15,23,42,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
                'opacity:0;visibility:hidden;transition:opacity .18s,visibility .18s;',
                'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}',
            '.aisa-search-overlay.open{opacity:1;visibility:visible;}',
            '.aisa-search-card{width:100%;max-width:620px;background:#fff;border-radius:1rem;box-shadow:0 25px 50px -12px rgba(0,0,0,.4);',
                'display:flex;flex-direction:column;max-height:70vh;overflow:hidden;transform:translateY(-6px);transition:transform .2s;}',
            '.aisa-search-overlay.open .aisa-search-card{transform:translateY(0);}',
            '.aisa-search-inputrow{display:flex;align-items:center;gap:.6rem;padding:.85rem 1.1rem;border-bottom:1px solid #f1f5f9;}',
            '.aisa-search-inputrow svg{width:1.25rem;height:1.25rem;color:#64748b;flex-shrink:0;}',
            '.aisa-search-input{flex:1;border:none;outline:none;font:inherit;font-size:1.05rem;color:#0f172a;background:transparent;}',
            '.aisa-search-input::placeholder{color:#94a3b8;}',
            '.aisa-search-kbd{font-size:.7rem;font-weight:700;color:#64748b;background:#f1f5f9;padding:.15rem .4rem;border-radius:.35rem;}',
            '.aisa-search-results{flex:1;overflow-y:auto;padding:.4rem;}',
            '.aisa-search-empty{padding:2rem 1rem;text-align:center;color:#94a3b8;font-size:.85rem;}',
            '.aisa-search-result{display:flex;align-items:center;gap:.85rem;width:100%;padding:.7rem .85rem;border-radius:.6rem;',
                'text-decoration:none;color:#0f172a;font:inherit;cursor:pointer;transition:background .12s;border:none;background:transparent;text-align:left;}',
            '.aisa-search-result:hover,.aisa-search-result.active{background:#eef2ff;}',
            '.aisa-search-result .ic{width:2.2rem;height:2.2rem;border-radius:.5rem;background:#f1f5f9;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;font-size:1.1rem;}',
            '.aisa-search-result .body{min-width:0;flex:1;}',
            '.aisa-search-result .tt{font-weight:700;font-size:.92rem;color:#0f172a;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-search-result .dd{font-size:.78rem;color:#64748b;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-search-result .tag{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#4f46e5;background:#eef2ff;padding:.2rem .45rem;border-radius:9999px;flex-shrink:0;}',

            /* === Full-view notification modal === */
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
            '.aisa-notif-card-head .close{position:absolute;top:.85rem;right:.85rem;background:transparent;border:none;cursor:pointer;',
                'color:#94a3b8;font-size:1.5rem;line-height:1;width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;',
                'border-radius:.5rem;}',
            '.aisa-notif-card-head .close:hover{background:#f1f5f9;color:#0f172a;}',
            '.aisa-notif-card-head .badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:.65rem;',
                'font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:.2rem .6rem;border-radius:9999px;margin-bottom:.6rem;}',
            '.aisa-notif-card-head h2{font-size:1.35rem;font-weight:800;color:#0f172a;margin:0 2rem .25rem 0;line-height:1.25;}',
            '.aisa-notif-card-head .meta{font-size:.8rem;color:#64748b;}',
            '.aisa-notif-card-body{padding:1.25rem 1.5rem 1.5rem;overflow-y:auto;flex:1;font-size:.95rem;color:#334155;line-height:1.6;white-space:normal;word-break:break-word;}',

            '.aisa-rt-link{color:#4f46e5;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1.5px;}',
            '.aisa-rt-link:hover{color:#312e81;}',

            /* === Responsive === */
            '@media (max-width:640px){',
                '.aisa-topbar-inner{padding:0 .5rem;}',
                '.aisa-tb-btn{width:2.4rem;height:2.4rem;border-radius:.6rem;}',
                '.aisa-tb-btn svg{width:1.2rem;height:1.2rem;}',
                '.aisa-topbar-brand .wm{display:none;}',
                '.aisa-topbar-brand img{width:1.85rem;height:1.85rem;}',
                /* Hide ⌘K hint on small screens — keyboard shortcut hint is desktop-only. */
                '.aisa-tb-searchpill .kbd{display:none;}',
                '.aisa-tb-searchpill{margin:0 .5rem;}',
                /* Language pill loses its text label on small screens, becomes icon-only. */
                '.aisa-tb-lang{width:2.4rem;padding:0;justify-content:center;border-radius:.6rem;}',
                '.aisa-tb-lang-label{display:none;}',
            '}',
            '@media (max-width:480px){',
                '.aisa-bell-panel,.aisa-admin-panel{left:.5rem!important;right:.5rem!important;width:auto;max-width:none;}',
                '.aisa-notif-card{max-height:90vh;border-radius:1rem;}',
                '.aisa-search-overlay{padding:1rem 0.5rem 0.5rem;align-items:flex-start;}',
                /* Search pill collapses to icon-only — placeholder takes too much width. */
                '.aisa-tb-searchpill{width:2.4rem;max-width:2.4rem;min-width:2.4rem;padding:0;justify-content:center;flex:0 0 auto;margin:0 .35rem;}',
                '.aisa-tb-searchpill .ph{display:none;}',
            '}',
            '@media (max-width:380px){',
                '.aisa-topbar-actions{gap:0;}',
                '.aisa-tb-btn{width:2.15rem;height:2.15rem;}',
                '.aisa-tb-lang{width:2.15rem;}',
                '.aisa-tb-searchpill{width:2.15rem;max-width:2.15rem;min-width:2.15rem;}',
            '}',

            '@media print{.aisa-topbar,.aisa-menu-backdrop,.aisa-menu-drawer,.aisa-bell-panel,.aisa-admin-panel,.aisa-notif-modal,.aisa-search-overlay{display:none!important;}body{padding-top:0!important;}}'
        ].join('');
        document.head.appendChild(s);
    }

    /* -------- build the topbar -------- */

    function build() {
        if (built) return;
        built = true;
        injectStyles();

        var bar = document.createElement('header');
        bar.className = 'aisa-topbar';
        bar.setAttribute('role', 'banner');

        bar.innerHTML =
            '<div class="aisa-topbar-inner">' +
                '<div class="aisa-topbar-actions aisa-topbar-actions-left">' +
                    '<button class="aisa-tb-btn aisa-tb-back" type="button" aria-label="Back">' + ICONS.back + '</button>' +
                    '<button class="aisa-tb-btn aisa-tb-home" type="button" aria-label="Home">' + ICONS.home + '</button>' +
                    '<button class="aisa-tb-btn aisa-tb-menu" type="button" aria-label="Open menu">' + ICONS.menu + '</button>' +
                '</div>' +
                '<button class="aisa-tb-searchpill" type="button" aria-label="Search the Learning Hub">' +
                    ICONS.search +
                    '<span class="ph">Search modules, tools, committees&hellip;</span>' +
                    '<span class="kbd" aria-hidden="true">&#8984; K</span>' +
                '</button>' +
                '<div class="aisa-topbar-right">' +
                    '<div class="aisa-topbar-actions aisa-topbar-actions-right">' +
                        '<button class="aisa-tb-lang" type="button" aria-label="Switch language">' +
                            ICONS.globe + '<span class="aisa-tb-lang-label"></span>' +
                        '</button>' +
                        '<button class="aisa-tb-btn aisa-tb-admin" type="button" aria-label="Admin tools" hidden>' +
                            ICONS.admin +
                        '</button>' +
                        '<button class="aisa-tb-btn aisa-tb-bell" type="button" aria-label="Notifications">' +
                            ICONS.bell + '<b class="aisa-tb-badge" aria-hidden="true"></b>' +
                        '</button>' +
                    '</div>' +
                    '<a class="aisa-topbar-brand" href="' + rootUrl('index.html') + '" aria-label="AISA Learning Hub home">' +
                        '<img src="' + rootUrl('AISA_logo.png') + '" alt="AISA" ' +
                            'onerror="this.style.display=\'none\';">' +
                        '<span class="wm">AISA<small>Learning Hub</small></span>' +
                    '</a>' +
                '</div>' +
            '</div>';

        document.body.appendChild(bar);

        /* Drawer */
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

        /* Admin-only menu items. Hidden by default; revealed once
         * window.aisaAuth.isAdmin() resolves true. The per-page admin
         * headers used to host these links, but the global app-bar
         * hides those headers — so the drawer is now the canonical
         * entry-point for every admin destination. */
        var adminHtml =
            '<li class="aisa-menu-admin-item" style="display:none;">' +
                '<a href="' + rootUrl('admin-dashboard.html') + '">' +
                    '<span class="ico" aria-hidden="true">\u{1F6E1}️</span>' +
                    '<span>Admin Dashboard</span></a></li>' +
            '<li class="aisa-menu-admin-item" style="display:none;">' +
                '<a href="' + rootUrl('admin-notifications.html') + '">' +
                    '<span class="ico" aria-hidden="true">\u{1F4E2}</span>' +
                    '<span>Send Notifications</span></a></li>';

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
                '<button type="button" class="aisa-menu-signout">' + ICONS.signout + 'Sign out</button>' +
            '</div>';

        /* Bell panel */
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

        /* Admin shortcuts panel. Anchored under the shield button when
         * opened. Kept minimal — just one-click links to the two admin
         * destinations the drawer also exposes. */
        var adminPanel = document.createElement('div');
        adminPanel.className = 'aisa-admin-panel';
        adminPanel.setAttribute('role', 'dialog');
        adminPanel.setAttribute('aria-label', 'Admin tools');
        adminPanel.innerHTML =
            '<div class="aisa-admin-head">' +
                '<span class="t">Admin tools</span>' +
            '</div>' +
            '<a class="aisa-admin-item" href="' + rootUrl('admin-dashboard.html') + '">' +
                '<span class="ic" aria-hidden="true">\u{1F6E1}️</span>' +
                '<span class="body">' +
                    '<span class="tt">Admin Dashboard</span>' +
                    '<span class="dd">Staff completion overview &amp; compliance reports</span>' +
                '</span>' +
            '</a>' +
            '<a class="aisa-admin-item" href="' + rootUrl('admin-notifications.html') + '">' +
                '<span class="ic" aria-hidden="true">\u{1F4E2}</span>' +
                '<span class="body">' +
                    '<span class="tt">Send Notifications</span>' +
                    '<span class="dd">Compose &amp; publish a notification to staff</span>' +
                '</span>' +
            '</a>';

        /* Search overlay */
        var search = document.createElement('div');
        search.className = 'aisa-search-overlay';
        search.setAttribute('role', 'dialog');
        search.setAttribute('aria-label', 'Search the Learning Hub');
        search.innerHTML =
            '<div class="aisa-search-card">' +
                '<div class="aisa-search-inputrow">' + ICONS.search +
                    '<input class="aisa-search-input" type="search" placeholder="Search modules, pages, and resources…" autocomplete="off" spellcheck="false">' +
                    '<span class="aisa-search-kbd">Esc</span>' +
                '</div>' +
                '<div class="aisa-search-results"></div>' +
            '</div>';

        document.body.appendChild(backdrop);
        document.body.appendChild(drawer);
        document.body.appendChild(panel);
        document.body.appendChild(adminPanel);
        document.body.appendChild(search);

        refs.bar         = bar;
        refs.backdrop    = backdrop;
        refs.drawer      = drawer;
        refs.panel       = panel;
        refs.adminPanel  = adminPanel;
        refs.search      = search;
        refs.btnBack     = bar.querySelector('.aisa-tb-back');
        refs.btnHome     = bar.querySelector('.aisa-tb-home');
        refs.btnMenu     = bar.querySelector('.aisa-tb-menu');
        refs.btnBell     = bar.querySelector('.aisa-tb-bell');
        refs.btnAdmin    = bar.querySelector('.aisa-tb-admin');
        refs.btnLang     = bar.querySelector('.aisa-tb-lang');
        refs.btnLangLabel = bar.querySelector('.aisa-tb-lang-label');
        refs.btnSearch   = bar.querySelector('.aisa-tb-searchpill');
        refs.bellBadge   = bar.querySelector('.aisa-tb-badge');
        refs.bellList    = panel.querySelector('.aisa-bell-list');
        refs.bellMarkAll = panel.querySelector('.aisa-bell-markall');
        refs.name        = drawer.querySelector('.who .name');
        refs.email       = drawer.querySelector('.who .email');
        refs.searchInput = search.querySelector('.aisa-search-input');
        refs.searchResults = search.querySelector('.aisa-search-results');

        /* --- Back button --- */
        if (window.history.length <= 1) {
            refs.btnBack.disabled = true;
            refs.btnBack.setAttribute('aria-disabled', 'true');
        }
        refs.btnBack.addEventListener('click', function () {
            if (window.history.length > 1) window.history.back();
        });

        /* --- Home button --- */
        refs.btnHome.addEventListener('click', function () { window.location.href = rootUrl('index.html'); });

        /* --- Language toggle --- */
        applyLang(readLang(), { announce: false });
        if (refs.btnLang) {
            refs.btnLang.addEventListener('click', function () {
                applyLang(readLang() === 'ar' ? 'en' : 'ar', { announce: true });
            });
        }

        /* --- Drawer behaviour --- */
        function drawerOpen()  { closePanel(); closeAdminPanel(); closeSearch(); refs.btnMenu.classList.add('open'); backdrop.classList.add('open'); drawer.classList.add('open'); refs.btnMenu.setAttribute('aria-label', 'Close menu'); }
        function drawerClose() { refs.btnMenu.classList.remove('open'); backdrop.classList.remove('open'); drawer.classList.remove('open'); refs.btnMenu.setAttribute('aria-label', 'Open menu'); }
        function drawerIsOpen() { return drawer.classList.contains('open'); }

        refs.btnMenu.addEventListener('click', function () { drawerIsOpen() ? drawerClose() : drawerOpen(); });
        backdrop.addEventListener('click', drawerClose);

        drawer.querySelector('.aisa-menu-signout').addEventListener('click', function () {
            if (window.aisaAuth && typeof window.aisaAuth.signOut === 'function') {
                window.aisaAuth.signOut();
            } else {
                window.location.href = rootUrl('index.html');
            }
        });

        /* --- Bell panel --- */
        function openPanel() {
            drawerClose(); closeAdminPanel(); closeSearch();
            /* Anchor the panel to the bell button. Now that the bell
             * sits on the right side, prefer right-edge alignment so
             * the panel stays on screen; left-edge is the fallback for
             * narrow viewports where the panel goes full-width anyway. */
            anchorRight(panel, refs.btnBell);
            panel.classList.add('open');
            refs.btnBell.setAttribute('aria-label', 'Close notifications');
        }
        function closePanel() { panel.classList.remove('open'); refs.btnBell.setAttribute('aria-label', 'Notifications'); }
        function panelIsOpen() { return panel.classList.contains('open'); }

        refs.btnBell.addEventListener('click', function (e) {
            e.stopPropagation();
            panelIsOpen() ? closePanel() : openPanel();
        });
        document.addEventListener('click', function (e) {
            if (!panelIsOpen()) return;
            if (panel.contains(e.target) || refs.btnBell.contains(e.target)) return;
            closePanel();
        });
        refs.bellMarkAll.addEventListener('click', markAllRead);

        /* --- Admin panel --- */
        function openAdminPanel() {
            if (!refs.btnAdmin) return;
            drawerClose(); closePanel(); closeSearch();
            anchorRight(adminPanel, refs.btnAdmin);
            adminPanel.classList.add('open');
            refs.btnAdmin.setAttribute('aria-label', 'Close admin tools');
        }
        function closeAdminPanel() {
            adminPanel.classList.remove('open');
            if (refs.btnAdmin) refs.btnAdmin.setAttribute('aria-label', 'Admin tools');
        }
        function adminPanelIsOpen() { return adminPanel.classList.contains('open'); }

        if (refs.btnAdmin) {
            refs.btnAdmin.addEventListener('click', function (e) {
                e.stopPropagation();
                adminPanelIsOpen() ? closeAdminPanel() : openAdminPanel();
            });
        }
        document.addEventListener('click', function (e) {
            if (!adminPanelIsOpen()) return;
            if (adminPanel.contains(e.target) || (refs.btnAdmin && refs.btnAdmin.contains(e.target))) return;
            closeAdminPanel();
        });

        /* --- Search overlay --- */
        function openSearch() {
            drawerClose(); closePanel(); closeAdminPanel();
            search.classList.add('open');
            refs.searchInput.value = '';
            renderSearchResults('');
            /* Defer focus so the transition fires first. */
            setTimeout(function () { refs.searchInput.focus(); }, 30);
        }
        function closeSearch() { search.classList.remove('open'); }
        function searchIsOpen() { return search.classList.contains('open'); }

        /* Position a floating dropdown under a top-bar button, anchored
         * to the right edge of the viewport so it stays on-screen even
         * when the button sits near the right side. Falls back to no
         * positioning on tiny viewports where panels go full-width. */
        function anchorRight(el, btn) {
            el.style.left = '';
            el.style.right = '';
            var rect = btn.getBoundingClientRect();
            var vw = window.innerWidth || document.documentElement.clientWidth || 0;
            if (vw > 480) {
                el.style.right = Math.max(8, vw - rect.right) + 'px';
            }
        }

        refs.btnSearch.addEventListener('click', openSearch);
        refs.searchInput.addEventListener('input', function () { renderSearchResults(refs.searchInput.value); });
        refs.searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var first = refs.searchResults.querySelector('.aisa-search-result');
                if (first) first.click();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveSearchHighlight(e.key === 'ArrowDown' ? 1 : -1);
            }
        });
        search.addEventListener('click', function (e) { if (e.target === search) closeSearch(); });

        /* Global keyboard shortcuts. */
        document.addEventListener('keydown', function (e) {
            /* Cmd/Ctrl-K opens search from anywhere. */
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                searchIsOpen() ? closeSearch() : openSearch();
                return;
            }
            if (e.key !== 'Escape') return;
            if (refs.openModal)     { closeNotificationModal(); return; }
            if (searchIsOpen())     { closeSearch();     return; }
            if (adminPanelIsOpen()) { closeAdminPanel(); return; }
            if (panelIsOpen())      { closePanel();      return; }
            if (drawerIsOpen())     { drawerClose();     return; }
        });

        /* Expose closers for internal cross-calls. */
        refs._closeDrawer = drawerClose;
        refs._closePanel  = closePanel;
        refs._closeSearch = closeSearch;

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
                isAdminUser = true;
                /* Drawer admin items. */
                var items = refs.drawer ? refs.drawer.querySelectorAll('.aisa-menu-admin-item') : [];
                items.forEach(function (li) { li.style.display = ''; });
                /* App-bar admin shortcut button. */
                if (refs.btnAdmin) {
                    refs.btnAdmin.removeAttribute('hidden');
                    refs.btnAdmin.classList.add('show');
                }
                /* If the search overlay happens to be open right now, re-render
                 * so the admin destinations appear without re-typing. */
                if (refs.search && refs.search.classList.contains('open')) {
                    renderSearchResults(refs.searchInput ? refs.searchInput.value : '');
                }
            }).catch(function () {});
        } catch (e) {}
    }

    /* -------- search -------- */

    /* Normalize a directory entry from either the canonical shared
     * index (window.AISA_HUB_INDEX, `url`/`type`/`keywords`) or the
     * fallback inline list (`href`/`tag`). Returns a uniform shape so
     * the rest of the search code doesn't care which source it came
     * from. */
    function normalizeSearchItem(it) {
        var rawUrl = it.url || it.href || '';
        var isExternal = /^https?:\/\//i.test(rawUrl);
        return {
            title:     it.title || '',
            desc:      it.desc || '',
            href:      isExternal ? rawUrl : rootUrl(rawUrl),
            external:  isExternal,
            type:      it.type || it.tag || '',
            icon:      it.icon || '\u{2728}',
            keywords:  it.keywords || '',
            adminOnly: !!it.adminOnly
        };
    }

    function getSearchSource() {
        return (window.AISA_HUB_INDEX && window.AISA_HUB_INDEX.length)
            ? window.AISA_HUB_INDEX
            : SEARCH_INDEX;
    }

    function renderSearchResults(query) {
        var q = (query || '').trim().toLowerCase();
        var source = getSearchSource().map(normalizeSearchItem);
        var visible = source.filter(function (it) { return isAdminUser || !it.adminOnly; });
        var items;
        if (!q) {
            /* Empty query: show a curated quick-launcher of top destinations. */
            items = visible.slice(0, 8);
        } else {
            items = visible
                .map(function (it) {
                    var title    = it.title.toLowerCase();
                    var desc     = it.desc.toLowerCase();
                    var keywords = it.keywords.toLowerCase();
                    var type     = it.type.toLowerCase();
                    var score;
                    if (title.indexOf(q) === 0)          score = 0;          // prefix in title
                    else if (title.indexOf(q) !== -1)    score = 10;         // anywhere in title
                    else if (keywords.indexOf(q) !== -1) score = 25;         // keyword hit
                    else if (type.indexOf(q) !== -1)     score = 35;         // type chip
                    else if (desc.indexOf(q) !== -1)     score = 50;         // description hit
                    else                                  score = -1;
                    return score === -1 ? null : { it: it, score: score };
                })
                .filter(Boolean)
                .sort(function (a, b) { return a.score - b.score; })
                .slice(0, 20)
                .map(function (x) { return x.it; });
        }
        if (!items.length) {
            refs.searchResults.innerHTML = '<div class="aisa-search-empty">No results for &ldquo;' + escapeHtml(query) + '&rdquo;.</div>';
            return;
        }
        refs.searchResults.innerHTML = items.map(function (it, ix) {
            return '<button class="aisa-search-result' + (ix === 0 ? ' active' : '') + '" type="button" ' +
                'data-href="' + escapeHtml(it.href) + '" ' +
                'data-external="' + (it.external ? '1' : '0') + '">' +
                '<span class="ic">' + it.icon + '</span>' +
                '<span class="body">' +
                    '<span class="tt">' + escapeHtml(it.title) + '</span>' +
                    '<span class="dd">' + escapeHtml(it.desc) + '</span>' +
                '</span>' +
                '<span class="tag">' + escapeHtml(it.type) + '</span>' +
            '</button>';
        }).join('');

        refs.searchResults.querySelectorAll('.aisa-search-result').forEach(function (el) {
            el.addEventListener('click', function () {
                var href = el.getAttribute('data-href');
                if (el.getAttribute('data-external') === '1') {
                    window.open(href, '_blank', 'noopener');
                } else {
                    window.location.href = href;
                }
            });
            el.addEventListener('mouseenter', function () {
                refs.searchResults.querySelectorAll('.aisa-search-result.active').forEach(function (a) { a.classList.remove('active'); });
                el.classList.add('active');
            });
        });
    }

    function moveSearchHighlight(dir) {
        var all = Array.prototype.slice.call(refs.searchResults.querySelectorAll('.aisa-search-result'));
        if (!all.length) return;
        var idx = all.findIndex(function (el) { return el.classList.contains('active'); });
        if (idx === -1) idx = 0;
        idx = Math.max(0, Math.min(all.length - 1, idx + dir));
        all.forEach(function (el) { el.classList.remove('active'); });
        all[idx].classList.add('active');
        all[idx].scrollIntoView({ block: 'nearest' });
    }

    /* -------- Notifications -------- */

    function updateBadge(count) {
        if (!refs.bellBadge) return;
        if (count > 0) {
            refs.bellBadge.textContent = count > 9 ? '9+' : String(count);
            refs.bellBadge.classList.add('show');
        } else {
            refs.bellBadge.classList.remove('show');
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
