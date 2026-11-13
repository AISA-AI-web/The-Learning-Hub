/*
 * AISA Learning Hub: the top bar, the same on every page (redesigned 10 November 2026).
 *
 * Auto-loaded by auth/gate.js on every page. Injects one fixed bar:
 *
 *   ┌───────────────────────────────────────────────────────────────────────────┐
 *   │ [☰] (seal) Learning Hub   My Dashboard  PD Modules  AI Literacy  Tools     │
 *   │                           Media  More ▾  [Admin ▾]   [Search ⌘K] [العربية] │
 *   │                                                           [🔔] (AL)        │
 *   └───────────────────────────────────────────────────────────────────────────┘
 *
 * - Brand:       the seal and "Learning Hub", left; goes home (index.html).
 * - Nav:         NAV, then "More" (MORE) and, for admins, "Admin" (ADMIN). The
 *                page's own section is marked (gold underline, aria-current).
 *                From NAV_MIN (1100px) up; below it the ☰ button opens the drawer
 *                (DRAWER: You / Learn / Resources, + Admin for admins).
 * - Search:      a field from 1360px (and from 720 to 1099px), an icon between
 *                and below; full-screen overlay over the Hub directory
 *                (window.AISA_HUB_INDEX from auth/search-index.js). Ctrl/⌘ K
 *                opens it from anywhere. Results show a line icon by type.
 * - Language:    flips html[lang]/[dir] between English and Arabic and rewrites
 *                data-placeholder-* / data-aria-label-* across the page. The
 *                button says the language it switches to. Persisted.
 * - Bell:        unread badge + dropdown; a notification opens in a modal with
 *                rich-text links (window.AisaRichText.render).
 * - Account:     initials in a purple circle; menu with name and address, My
 *                Dashboard, Request or report, the admin pages (admins only)
 *                and Sign out.
 * - "Request or report": the floating button, bottom right (buildFab).
 *
 * The bar must fit its row at every width, for staff and admins, in both
 * languages: tests/topbar-test.js checks 320 to 1600px. A new bar item needs
 * room found for it. The design system the pages use is auth/hub.css; the
 * bar keeps its own styles here so it draws the same on every page.
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

    /* The Hub's navigation, in one place: the top bar shows NAV (and MORE
     * under "More"), the drawer shows every group. `match` is tested
     * against the decoded path to mark the section the page belongs to.
     * Icons are names in ICONS (line icons, no emoji). */
    var NAV = [
        { id: 'dash',     label: 'My Dashboard',      ar: 'لوحتي',              icon: 'dash',    href: 'dashboard.html',                               match: /(^|\/)dashboard\.html$/ },
        { id: 'pd',       label: 'PD Modules',        ar: 'وحدات التطوير',       icon: 'cap',     href: 'PD%20Modules/pd.html',                         match: /\/PD Modules\// },
        { id: 'ai',       label: 'AI Literacy',       ar: 'الثقافة في الذكاء الاصطناعي', icon: 'spark', href: 'AI%20Literacy%20Hub/ai-literacy-hub.html', match: /\/AI Literacy Hub\// },
        { id: 'tools',    label: 'Tools',             ar: 'الأدوات',            icon: 'tools',   href: 'Tools%20and%20Resources/tools.html',           match: /\/Tools and Resources\// },
        { id: 'media',    label: 'Media',             ar: 'الإعلام',            icon: 'mic',     href: 'Media%20Hub/media.html',                       match: /\/Media Hub\// }
    ];
    var MORE = [
        { id: 'orient',   label: 'Orientation',       ar: 'التهيئة',            icon: 'compass', href: 'Orientation%20Hub/orientation-hub.html',       match: /\/Orientation Hub\//, desc: 'Getting started at AISA' },
        { id: 'pdday',    label: 'PD Day · Oct 2026', ar: 'يوم التطوير المهني', icon: 'calendar', href: 'PD%20Day/october-2026.html',           match: /\/PD Day\//,          desc: 'Session slides, games and links' },
        { id: 'library',  label: 'Library',           ar: 'المكتبة',            icon: 'book',    href: 'Library%20Hub/library-hub.html',               match: /\/Library Hub\//,     desc: 'For students and for staff' },
        { id: 'comm',     label: 'Committees',        ar: 'اللجان',             icon: 'landmark', href: 'Committees/committees.html',                  match: /\/Committees\//,      desc: 'Governance and membership' },
        { id: 'wired',    label: 'Wired Wednesdays',  ar: 'أربعاء التقنية',     icon: 'video',   href: 'Wired%20Wednesdays/wired-wednesdays.html',     match: /\/Wired Wednesdays\//, desc: 'On hold this term' }
    ];
    var ADMIN = [
        { id: 'admin',    label: 'Admin Dashboard',   icon: 'shield',  href: 'admin-dashboard.html',     match: /(^|\/)admin-(dashboard|charts)\.html$/ },
        { id: 'analytics', label: 'Hub Analytics',    icon: 'chart',   href: 'admin-analytics.html',     match: /(^|\/)admin-analytics\.html$/ },
        { id: 'inbox',    label: 'Requests inbox',    icon: 'inbox',   href: 'admin-requests.html',      match: /(^|\/)admin-requests\.html$/ },
        { id: 'notify',   label: 'Send notifications', icon: 'megaphone', href: 'admin-notifications.html', match: /(^|\/)admin-notifications\.html$/ }
    ];
    /* The drawer's groups (phones and narrow windows, where NAV does not fit). */
    var DRAWER = [
        { title: 'You',        items: [{ id: 'home', label: 'Home', icon: 'home', href: 'index.html', match: /(^|\/)(index\.html)?$/ }, NAV[0],
                                       { id: 'req', label: 'Request or report', icon: 'chat', href: 'request.html', match: /(^|\/)request\.html$/ }] },
        { title: 'Learn',      items: [NAV[1], NAV[2], MORE[1], MORE[0]] },
        { title: 'Resources',  items: [NAV[3], NAV[4], MORE[2], MORE[3], MORE[4]] }
    ];
    /* Kept for anything that still reads the old flat list. */
    var LINKS = DRAWER.reduce(function (all, g) { return all.concat(g.items); }, []);

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
        { title: 'Hub Analytics',                      desc: 'Usage, PD completions, newsletter readers, filter by date or person', href: 'admin-analytics.html',                                                    icon: '\u{1F4CA}', tag: 'Admin', adminOnly: true },
        { title: 'Requests inbox',                     desc: 'Training requests, problem reports and ideas from staff',       href: 'admin-requests.html',                                                              icon: '\u{1F4E5}', tag: 'Admin', adminOnly: true },
        { title: 'Request or report',                  desc: 'Ask for a training, report a problem, or share an idea',        href: 'request.html',                                                                     icon: '\u{1F4AC}', tag: 'Personal' },
        { title: 'Send Notifications',                 desc: 'Compose and publish notifications to staff',                    href: 'admin-notifications.html',                                                         icon: '\u{1F4E2}',  tag: 'Admin', adminOnly: true },
        { title: 'Personal Goals Tracker',             desc: 'Who has set a 2026\u201327 goal, and who still owes one',         href: 'admin-dashboard.html#goals',                                                       icon: '\u{1F3AF}', tag: 'Admin', adminOnly: true },

        /* PD modules */
        { title: 'PD Modules',                         desc: 'All professional development modules',                          href: 'PD%20Modules/pd.html',                                                             icon: '\u{1F393}', tag: 'Hub' },
        { title: 'PD Day \u2014 October 2026',          desc: 'Session slides, games and links from the October PD days',    href: 'PD%20Day/october-2026.html',                                                       icon: '\u{1F4C5}', tag: 'Hub' },
        { title: 'AI Literacy: Teacher Readiness',      desc: 'Required by 20 Sept: teach your first ADEK AI lesson',        href: 'PD%20Modules/ai-curriculum-readiness-module.html',                                 icon: '\u{1F393}', tag: 'Module' },
        { title: 'AI Literacy Hub',                     desc: 'Training, Scope & Sequence, InstrucTwin, assessment \u2014 all in one place', href: 'AI%20Literacy%20Hub/ai-literacy-hub.html',                     icon: '\u{1F9E0}', tag: 'Hub' },
        { title: 'AI Literacy: Scope & Sequence',       desc: 'The KG\u2013Grade 12 curriculum map \u2014 progression and end-of-phase expectations', href: 'PD%20Modules/ai-literacy-scope-and-sequence.html',       icon: '\u{1F5FA}', tag: 'Reference' },
        { title: 'AI Ethics & Policy',                 desc: 'Required: AISA AI vision, principles, approved tools',          href: 'PD%20Modules/ai-ethics-module.html',                                               icon: '\u{1F9ED}', tag: 'Module' },
        { title: 'Return to School',                   desc: 'Required: ADEK protocols, drills, safety',                      href: 'PD%20Modules/return-to-school.html',                                               icon: '\u{1F6A8}', tag: 'Module' },
        { title: 'Sustainability at AISA',             desc: 'Required: the year\u2019s initiatives and everyday green habits', href: 'PD%20Modules/sustainability-module.html',                                         icon: '\u{1F331}', tag: 'Module' },
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
        { title: 'Staff & Faculty Handbook 2026–2027 (PDF)', desc: 'The authoritative staff reference — policies, conduct, leave, safeguarding, appraisal', href: 'Orientation%20Hub/AISA-Staff-Faculty-Handbook-2026-2027.pdf', icon: '\u{1F4D8}', tag: 'Reference' },

        /* Tools */
        { title: 'Tools & Resources',                  desc: 'AI tools, templates, and reference materials',                  href: 'Tools%20and%20Resources/tools.html',                                               icon: '\u{1F6E0}', tag: 'Hub' },
        { title: 'Lesson Planning Tool',               desc: 'Excellent Teaching & Learning lesson planner',                  href: 'Tools%20and%20Resources/lesson-planning-tool.html',                                icon: '\u{1F4DD}', tag: 'Tool' },
        { title: 'AI Growth Test guide',               desc: 'AI Lead & Proctor steps for the ADEK Baseline AI Growth Test',  href: 'Tools%20and%20Resources/ai-growth-test-guide.html',                                icon: '\u{1F9ED}', tag: 'Guide' },
        { title: 'Flint Master Guide',                 desc: 'Pilot: lessons, feedback and student chatbots in Flint',        href: 'Tools%20and%20Resources/flint-guide.html',                                         icon: '\u{1F525}', tag: 'Guide' },
        { title: 'My Personal Goal 2026\u201327',        desc: 'Secondary: set your one professional goal for the year',        href: 'Tools%20and%20Resources/secondary-teacher-goal.html',                              icon: '\u{1F3AF}', tag: 'Form' },

        /* Library */
        { title: 'Library Hub',                        desc: 'Books, articles, and research collections',                     href: 'Library%20Hub/library-hub.html',                                                   icon: '\u{1F4DA}', tag: 'Hub' },
        { title: 'Library — for students',             desc: 'Student-facing library resources',                              href: 'Library%20Hub/student.html',                                                       icon: '\u{1F393}', tag: 'Library' },
        { title: 'Library — for teachers & staff',     desc: 'Staff-facing library resources',                                href: 'Library%20Hub/teacher.html',                                                       icon: '\u{1F468}\u{200D}\u{1F3EB}', tag: 'Library' },

        /* Media Hub */
        { title: 'Media Hub',                          desc: 'Newsletters, videos, recordings',                               href: 'Media%20Hub/media.html',                                                           icon: '\u{1F3AC}', tag: 'Hub' },
        { title: 'Digital Tools Newsletter — May 4',   desc: 'Issue 1: digital tools deep-dives',                             href: 'Media%20Hub/may4.html',                                                            icon: '\u{1F4F0}', tag: 'Newsletter' },
        { title: 'Digital Lion Newsletter — May 11',   desc: 'Issue 2: Wired Wednesdays, Flows, Gemini in Workspace',         href: 'Media%20Hub/may11.html',                                                           icon: '\u{1F4F0}', tag: 'Newsletter' },
        { title: 'Digital Lion Newsletter — May 18',   desc: 'Issue 3: class visit schedule, AI integration snapshot form',   href: 'Media%20Hub/may18.html',                                                           icon: '\u{1F4F0}', tag: 'Newsletter' },
        { title: 'Digital Lion Newsletter — September 18',  desc: 'Issue 5: AI Literacy starts 21 Sept, readiness module due 20 Sept',  href: 'Media%20Hub/sep18.html',                                                           icon: '\u{1F4F0}', tag: 'Newsletter' },
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

    /* -------- icon SVGs (Lucide-style line icons, 1.75 stroke) -------- */

    function icon(path, viewBox) {
        return '<svg viewBox="' + (viewBox || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
    }
    var ICONS = {
        back:     icon('<path d="M15 18l-6-6 6-6"/>'),
        home:     icon('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
        menu:     icon('<path d="M4 7h16M4 12h16M4 17h16"/>'),
        bell:     icon('<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
        search:   icon('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
        admin:    icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
        shield:   icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
        dash:     icon('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
        chart:    icon('<path d="M3 3v18h18"/><path d="M8 16v-5M12.5 16V7M17 16v-8"/>'),
        globe:    icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
        close:    icon('<path d="M18 6 6 18M6 6l12 12"/>'),
        signout:  icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
        chat:     icon('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/><path d="M8.5 10.5h7M8.5 14h4.5"/>'),
        chevron:  icon('<path d="m6 9 6 6 6-6"/>'),
        cap:      icon('<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2.5 9 2.5 12 0v-5"/>'),
        spark:    icon('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>'),
        tools:    icon('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"/>'),
        mic:      icon('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"/>'),
        compass:  icon('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2z"/>'),
        calendar: icon('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
        book:     icon('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>'),
        landmark: icon('<path d="M3 21h18M5 21V10M9.5 21V10M14.5 21V10M19 21V10M2.5 10 12 3.5 21.5 10z"/>'),
        video:    icon('<rect x="2.5" y="6" width="13" height="12" rx="2"/><path d="m15.5 10.5 6-3.5v10l-6-3.5"/>'),
        inbox:    icon('<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-6l2.5-8z"/>'),
        megaphone: icon('<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8.5a5 5 0 0 1 0 7"/>'),
        doc:      icon('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
        form:     icon('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
        news:     icon('<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5z"/><path d="M17 9h3v10a2 2 0 0 1-4 0M8 9h5M8 13h5M8 17h3"/>'),
        user:     icon('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
        external: icon('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>')
    };
    /* A search result's icon, from its type (the index's emoji are not shown). */
    var TYPE_ICON = { hub: 'home', personal: 'user', admin: 'shield', module: 'cap', reference: 'doc', tool: 'tools', guide: 'compass',
        form: 'form', onboarding: 'compass', library: 'book', newsletter: 'news', media: 'mic', podcast: 'mic', gem: 'spark',
        committee: 'landmark', video: 'video', event: 'calendar', 'pd day': 'calendar' };
    function typeIcon(type) { return ICONS[TYPE_ICON[String(type || '').toLowerCase()] || 'doc']; }
    /* -------- styles -------- */

    var BAR_HEIGHT = '3.75rem';  // 60px. Sticky page bars sit at this (pd.html, tools.html).
    var FONT = '"DM Sans",Cairo,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    /* The nav links fit the bar from this width; below it they live in the drawer. */
    var NAV_MIN = 1100;

    function injectStyles() {
        var s = document.createElement('style');
        s.id = 'aisa-menu-style';
        s.textContent = [
            'body{padding-top:' + BAR_HEIGHT + ';}',
            /* The old per-page sticky headers: the bar is the only top navigation. */
            'body > header.sticky.top-0{display:none!important;}',

            /* === Top bar === */
            '.aisa-topbar{position:fixed;top:0;left:0;right:0;height:' + BAR_HEIGHT + ';z-index:2147483000;',
                'background:rgba(255,255,255,.94);-webkit-backdrop-filter:saturate(180%) blur(14px);backdrop-filter:saturate(180%) blur(14px);',
                'border-bottom:1px solid #ECE8F5;font-family:' + FONT + ';color:#1A1A1A;-webkit-font-smoothing:antialiased;}',
            '.aisa-topbar *{box-sizing:border-box;}',
            '.aisa-topbar-inner{height:100%;margin:0 auto;padding:0 1.25rem;display:flex;align-items:center;gap:.25rem;}',
            '.aisa-tb-spacer{flex:1 1 auto;min-width:.5rem;}',
            '.aisa-topbar nav{height:100%;}',
            '.aisa-topbar-right{display:flex;align-items:center;gap:.25rem;flex-shrink:0;}',

            /* Brand: the seal and the name, on the left, like every site. */
            '.aisa-topbar-brand{display:inline-flex;align-items:center;gap:.65rem;text-decoration:none;flex-shrink:0;',
                'padding:.3rem .5rem .3rem .25rem;margin-inline-end:.75rem;border-radius:.6rem;}',
            '.aisa-topbar-brand:focus-visible{outline:2px solid #5B3FD0;outline-offset:2px;}',
            '.aisa-topbar-brand img{width:2.1rem;height:2.1rem;object-fit:contain;}',
            '.aisa-topbar-brand .wm{display:flex;flex-direction:column;line-height:1;}',
            '.aisa-topbar-brand .wm small{font-size:.625rem;font-weight:700;letter-spacing:.16em;color:#7A5C14;text-transform:uppercase;}',
            '.aisa-topbar-brand .wm b{font-size:1.02rem;font-weight:700;color:#21076C;letter-spacing:-.015em;margin-top:.2rem;white-space:nowrap;}',

            /* Icon buttons */
            '.aisa-tb-btn{position:relative;width:2.5rem;height:2.5rem;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;',
                'background:transparent;border:none;border-radius:999px;cursor:pointer;color:#3D3A48;padding:0;',
                'transition:background .15s,color .15s;-webkit-tap-highlight-color:transparent;}',
            '.aisa-tb-btn svg{width:1.3rem;height:1.3rem;}',
            '.aisa-tb-btn:hover{background:#F2EFFA;color:#21076C;}',
            '.aisa-tb-btn:focus-visible{outline:2px solid #5B3FD0;outline-offset:1px;}',
            '.aisa-tb-btn:disabled{opacity:.35;cursor:default;pointer-events:none;}',
            '.aisa-tb-menu{margin-inline-end:.25rem;}',

            /* Primary navigation */
            '.aisa-tb-nav{display:flex;align-items:stretch;height:100%;margin:0;padding:0;list-style:none;gap:.1rem;min-width:0;}',
            '.aisa-tb-nav > li{position:relative;display:flex;align-items:stretch;}',
            '.aisa-tb-link{position:relative;display:inline-flex;align-items:center;gap:.3rem;height:100%;padding:0 .75rem;',
                'color:#3D3A48;text-decoration:none;font:500 .9rem/1 ' + FONT + ';letter-spacing:-.005em;white-space:nowrap;',
                'background:none;border:none;cursor:pointer;transition:color .15s;}',
            '.aisa-tb-link:hover{color:#21076C;}',
            '.aisa-tb-link:focus-visible{outline:2px solid #5B3FD0;outline-offset:-10px;border-radius:.6rem;}',
            '.aisa-tb-link svg{width:.95rem;height:.95rem;transition:transform .2s;}',
            '.aisa-tb-link[aria-expanded="true"] svg{transform:rotate(180deg);}',
            '.aisa-tb-link::after{content:"";position:absolute;left:.75rem;right:.75rem;bottom:-1px;height:2px;border-radius:2px;background:transparent;transition:background .15s;}',
            '.aisa-tb-link.is-current{color:#21076C;font-weight:700;}',
            '.aisa-tb-link.is-current::after{background:#D8B664;}',
            '.aisa-tb-adminnav{display:none!important;}',
            '.aisa-tb-adminnav.show{display:flex!important;}',
            '.aisa-tb-adminnav .aisa-tb-link{color:#7A5C14;}',
            '.aisa-tb-adminnav .aisa-tb-link:hover,.aisa-tb-adminnav .aisa-tb-link.is-current{color:#21076C;}',

            /* Search: a field on wide screens, an icon below */
            '.aisa-tb-searchpill{height:2.5rem;width:15rem;display:inline-flex;align-items:center;gap:.55rem;padding:0 .5rem 0 .85rem;flex-shrink:1;min-width:2.5rem;',
                'background:#F6F4FB;border:1px solid #ECE8F5;border-radius:999px;color:#5E5A6B;font:inherit;cursor:text;',
                'transition:background .15s,border-color .15s,box-shadow .15s;}',
            '.aisa-tb-searchpill:hover{background:#fff;border-color:#C8BEE8;}',
            '.aisa-tb-searchpill:focus-visible{outline:none;border-color:#5B3FD0;box-shadow:0 0 0 3px rgba(91,63,208,.18);}',
            '.aisa-tb-searchpill svg{width:1.1rem;height:1.1rem;flex-shrink:0;color:#5E5A6B;}',
            '.aisa-tb-searchpill .ph{flex:1;min-width:0;text-align:start;font-size:.875rem;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-tb-searchpill .kbd{flex-shrink:0;font-size:.6875rem;font-weight:600;color:#5E5A6B;background:#fff;border:1px solid #E7E2F4;border-radius:999px;padding:.2rem .5rem;}',

            /* Language: says the language it switches to */
            '.aisa-tb-lang{display:inline-flex;align-items:center;gap:.4rem;height:2.5rem;padding:0 .8rem;flex-shrink:0;',
                'background:transparent;border:none;border-radius:999px;color:#3D3A48;',
                'font:600 .875rem/1 ' + FONT + ';cursor:pointer;transition:background .15s,color .15s;-webkit-tap-highlight-color:transparent;}',
            '.aisa-tb-lang:hover{background:#F2EFFA;color:#21076C;}',
            '.aisa-tb-lang:focus-visible{outline:2px solid #5B3FD0;outline-offset:1px;}',
            '.aisa-tb-lang svg{width:1.15rem;height:1.15rem;flex-shrink:0;}',
            '.aisa-tb-lang-label{white-space:nowrap;}',

            /* Account: initials in a purple circle */
            '.aisa-tb-avatar{width:2.5rem;height:2.5rem;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;margin-inline-start:.25rem;',
                'border:none;background:none;border-radius:999px;cursor:pointer;padding:0;-webkit-tap-highlight-color:transparent;}',
            '.aisa-tb-avatar .av{width:2.1rem;height:2.1rem;border-radius:999px;background:#21076C;color:#fff;display:inline-flex;align-items:center;justify-content:center;',
                'font:700 .78rem/1 ' + FONT + ';letter-spacing:.02em;box-shadow:0 0 0 2px #fff,0 0 0 3.5px #D8B664;transition:box-shadow .15s;}',
            '.aisa-tb-avatar .av svg{width:1.1rem;height:1.1rem;}',
            '.aisa-tb-avatar:hover .av,.aisa-tb-avatar[aria-expanded="true"] .av{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #21076C;}',
            '.aisa-tb-avatar:focus-visible{outline:2px solid #5B3FD0;outline-offset:2px;}',

            /* Unread badge on the bell */
            '.aisa-tb-badge{position:absolute;top:.3rem;right:.3rem;min-width:17px;height:17px;',
                'padding:0 4px;border-radius:9999px;background:#B42318;color:#fff;font-size:10.5px;',
                'font-weight:700;line-height:17px;text-align:center;box-shadow:0 0 0 2px #fff;display:none;font-style:normal;}',
            '.aisa-tb-badge.show{display:block;}',

            /* === Pop-overs: More, Admin and the account menu === */
            '.aisa-tb-pop{position:fixed;top:calc(' + BAR_HEIGHT + ' + .4rem);z-index:2147483005;min-width:16rem;max-width:calc(100vw - 1rem);',
                'background:#fff;border:1px solid #E7E2F4;border-radius:14px;padding:.4rem;',
                'box-shadow:0 2px 4px rgba(22,4,73,.06),0 18px 44px -12px rgba(22,4,73,.28);font-family:' + FONT + ';color:#1A1A1A;',
                'opacity:0;visibility:hidden;transform:translateY(-4px);transition:opacity .14s,transform .14s,visibility .14s;}',
            '.aisa-tb-pop.open{opacity:1;visibility:visible;transform:translateY(0);}',
            '.aisa-tb-pop a,.aisa-tb-pop button.item{display:flex;align-items:center;gap:.75rem;width:100%;padding:.6rem .7rem;border-radius:10px;',
                'color:#1A1A1A;text-decoration:none;font:500 .9rem/1.25 ' + FONT + ';background:none;border:none;cursor:pointer;text-align:start;}',
            '.aisa-tb-pop a:hover,.aisa-tb-pop button.item:hover,.aisa-tb-pop a:focus-visible,.aisa-tb-pop button.item:focus-visible{background:#F6F4FB;outline:none;}',
            '.aisa-tb-pop a.is-current{background:#F2EFFA;color:#21076C;font-weight:700;}',
            '.aisa-tb-pop .ic{width:2rem;height:2rem;border-radius:9px;background:#F2EFFA;color:#21076C;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}',
            '.aisa-tb-pop .ic svg{width:1.05rem;height:1.05rem;}',
            '.aisa-tb-pop .tx{display:flex;flex-direction:column;min-width:0;}',
            '.aisa-tb-pop .tx small{font-size:.75rem;color:#5E5A6B;font-weight:400;margin-top:.15rem;}',
            '.aisa-tb-pop hr{border:none;border-top:1px solid #F0EDF7;margin:.35rem .3rem;}',
            '.aisa-tb-pop .who{display:flex;align-items:center;gap:.75rem;padding:.65rem .7rem .75rem;}',
            '.aisa-tb-pop .who .av{width:2.5rem;height:2.5rem;border-radius:999px;background:#21076C;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem;flex-shrink:0;}',
            '.aisa-tb-pop .who .av svg{width:1.2rem;height:1.2rem;}',
            '.aisa-tb-pop .who .n{font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-tb-pop .who .e{font-size:.78rem;color:#5E5A6B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-tb-pop .who > div{min-width:0;}',
            '.aisa-tb-pop .admin-only{display:none;}',
            '.aisa-tb-pop.is-admin .admin-only{display:flex;}',
            '.aisa-tb-pop hr.admin-only{display:none;}',
            '.aisa-tb-pop.is-admin hr.admin-only{display:block;}',
            '.aisa-tb-pop .item.signout{color:#5E5A6B;}',

            /* === Drawer (narrow windows and phones) === */
            '.aisa-menu-backdrop{position:fixed;inset:0;z-index:2147483001;background:rgba(22,4,73,.38);',
                '-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;visibility:hidden;transition:opacity .25s,visibility .25s;}',
            '.aisa-menu-backdrop.open{opacity:1;visibility:visible;}',
            '.aisa-menu-drawer{position:fixed;top:0;left:0;bottom:0;z-index:2147483002;width:320px;max-width:88vw;',
                'background:#fff;box-shadow:0 0 60px rgba(22,4,73,.28);transform:translateX(-104%);',
                'transition:transform .3s cubic-bezier(.22,1,.36,1),visibility .3s;visibility:hidden;display:flex;flex-direction:column;font-family:' + FONT + ';color:#1A1A1A;}',
            'html[dir="rtl"] .aisa-menu-drawer{left:auto;right:0;transform:translateX(104%);}',
            '.aisa-menu-drawer.open,html[dir="rtl"] .aisa-menu-drawer.open{transform:translateX(0);visibility:visible;}',
            '.aisa-menu-head{height:' + BAR_HEIGHT + ';padding:0 .75rem 0 1rem;display:flex;align-items:center;gap:.65rem;border-bottom:1px solid #F0EDF7;flex-shrink:0;}',
            '.aisa-menu-head .logo{width:2rem;height:2rem;flex-shrink:0;}',
            '.aisa-menu-head .logo img{width:100%;height:100%;object-fit:contain;}',
            '.aisa-menu-head .t{flex:1;font-weight:700;color:#21076C;font-size:1rem;}',
            '.aisa-menu-user{display:flex;align-items:center;gap:.7rem;padding:1rem 1rem .5rem;}',
            '.aisa-menu-user .av{width:2.4rem;height:2.4rem;border-radius:999px;background:#21076C;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:.85rem;flex-shrink:0;}',
            '.aisa-menu-user .av svg{width:1.15rem;height:1.15rem;}',
            '.aisa-menu-user > div{min-width:0;}',
            '.aisa-menu-head .who,.aisa-menu-user .who{min-width:0;}',
            '.aisa-menu-user .name{font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-menu-user .email{font-size:.78rem;color:#5E5A6B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-menu-list{list-style:none;margin:0;padding:.25rem .6rem 1rem;overflow-y:auto;flex:1;}',
            '.aisa-menu-group{margin:1rem .55rem .35rem;font-size:.6875rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#7A5C14;}',
            'html[lang="ar"] .aisa-menu-group{letter-spacing:0;}',
            '.aisa-menu-list a{display:flex;align-items:center;gap:.75rem;padding:.6rem .6rem;border-radius:10px;',
                'text-decoration:none;color:#1A1A1A;font-weight:500;font-size:.94rem;transition:background .15s;}',
            '.aisa-menu-list a:hover{background:#F6F4FB;}',
            '.aisa-menu-list a.is-current{background:#F2EFFA;color:#21076C;font-weight:700;}',
            '.aisa-menu-list a .ico{width:2rem;height:2rem;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:#21076C;background:#F6F4FB;}',
            '.aisa-menu-list a.is-current .ico{background:#21076C;color:#D8B664;}',
            '.aisa-menu-list a .ico svg{width:1.05rem;height:1.05rem;}',
            '.aisa-menu-foot{padding:.75rem;border-top:1px solid #F0EDF7;}',
            '.aisa-menu-signout{width:100%;display:flex;align-items:center;justify-content:center;gap:.5rem;',
                'padding:.7rem 1rem;border-radius:999px;border:1px solid #E7E2F4;background:#fff;color:#3D3A48;',
                'font:600 .9rem/1 ' + FONT + ';cursor:pointer;transition:background .15s,border-color .15s;}',
            '.aisa-menu-signout:hover{background:#F6F4FB;border-color:#C8BEE8;}',
            '.aisa-menu-signout svg{width:16px;height:16px;}',

            /* "Request or report": the floating button at the bottom right of
             * every page (request.html). Below the menu's own layers and the
             * readiness pop-up (10000), above the page. placeFab() lifts it
             * above whatever already sits in that corner (FAB_AVOID). A circle
             * on phones, a pill with its words from 641px. */
            '.aisa-fab{position:fixed;right:20px;bottom:20px;z-index:1000;display:inline-flex;align-items:center;gap:.55rem;',
                'height:3rem;padding:0 1.15rem 0 1rem;border-radius:999px;background:#21076C;color:#fff;text-decoration:none;',
                'font:600 .9rem/1 ' + FONT + ';letter-spacing:-.005em;',
                'box-shadow:0 10px 28px -8px rgba(33,7,108,.55),inset 0 0 0 1px rgba(216,182,100,.55);',
                'transition:bottom .2s ease,transform .15s ease,box-shadow .15s ease,background .15s ease;}',
            '.aisa-fab:hover{background:#3A1F94;transform:translateY(-1px);box-shadow:0 14px 32px -8px rgba(33,7,108,.6),inset 0 0 0 1px #D8B664;}',
            '.aisa-fab:focus-visible{outline:2px solid #D8B664;outline-offset:3px;}',
            '.aisa-fab svg{width:1.25rem;height:1.25rem;flex-shrink:0;color:#D8B664;}',
            '.aisa-fab .t{white-space:nowrap;}',
            '@media (max-width:640px){.aisa-fab{width:3rem;padding:0;justify-content:center;right:16px;bottom:16px;}.aisa-fab .t{display:none;}}',
            '@media (prefers-reduced-motion:reduce){.aisa-fab,.aisa-menu-drawer,.aisa-tb-pop{transition:none;}}',
            '@media print{.aisa-fab{display:none!important;}}',

            /* === Bell panel === */
            '.aisa-bell-panel{position:fixed;top:calc(' + BAR_HEIGHT + ' + .4rem);z-index:2147483005;width:380px;max-width:calc(100vw - 1.2rem);',
                'background:#fff;border:1px solid #E7E2F4;border-radius:14px;box-shadow:0 2px 4px rgba(22,4,73,.06),0 18px 44px -12px rgba(22,4,73,.28);',
                'font-family:' + FONT + ';color:#1A1A1A;opacity:0;visibility:hidden;transform:translateY(-4px);',
                'transition:opacity .14s,transform .14s,visibility .14s;display:flex;flex-direction:column;max-height:75vh;}',
            '.aisa-bell-panel.open{opacity:1;visibility:visible;transform:translateY(0);}',
            '.aisa-bell-head{padding:.9rem 1rem;border-bottom:1px solid #F0EDF7;display:flex;align-items:center;justify-content:space-between;}',
            '.aisa-bell-head .t{font-size:.95rem;font-weight:700;color:#1A1A1A;}',
            '.aisa-bell-head button{font:inherit;font-size:.8rem;font-weight:600;color:#5B3FD0;background:none;border:none;cursor:pointer;padding:0;}',
            '.aisa-bell-head button:hover{text-decoration:underline;}',
            '.aisa-bell-head button:disabled{color:#C8BEE8;cursor:default;text-decoration:none;}',
            '.aisa-bell-list{flex:1;overflow-y:auto;padding:.4rem;}',
            '.aisa-bell-empty{padding:2.25rem 1rem;text-align:center;color:#5E5A6B;font-size:.875rem;}',
            '.aisa-bell-empty .e{width:2.75rem;height:2.75rem;margin:0 auto .65rem;border-radius:999px;background:#F2EFFA;color:#21076C;display:flex;align-items:center;justify-content:center;}',
            '.aisa-bell-empty .e svg{width:1.3rem;height:1.3rem;}',
            '.aisa-bell-item{display:block;width:100%;text-align:start;border:none;background:#fff;font-family:inherit;',
                'border-radius:10px;padding:.75rem .85rem;margin-bottom:.15rem;cursor:pointer;position:relative;transition:background .15s;}',
            '.aisa-bell-item:hover{background:#F6F4FB;}',
            '.aisa-bell-item.unread{background:#F2EFFA;}',
            '.aisa-bell-item.unread:hover{background:#EAE5F8;}',
            '.aisa-bell-item .nt{font-weight:700;font-size:.9rem;color:#1A1A1A;line-height:1.3;padding-inline-end:1rem;}',
            '.aisa-bell-item .nb{font-size:.8rem;color:#3D3A48;margin-top:3px;line-height:1.4;',
                'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
            '.aisa-bell-item .nm{font-size:.72rem;color:#5E5A6B;margin-top:5px;}',
            '.aisa-bell-item .dot{position:absolute;top:.95rem;right:.85rem;width:8px;height:8px;border-radius:50%;background:#D8B664;}',
            'html[dir="rtl"] .aisa-bell-item .dot{right:auto;left:.85rem;}',

            /* === Search overlay === */
            '.aisa-search-overlay{position:fixed;inset:0;z-index:2147483006;display:flex;align-items:flex-start;justify-content:center;',
                'padding:12vh 1rem 1rem;background:rgba(22,4,73,.42);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
                'opacity:0;visibility:hidden;transition:opacity .18s,visibility .18s;font-family:' + FONT + ';}',
            '.aisa-search-overlay.open{opacity:1;visibility:visible;}',
            '.aisa-search-card{width:100%;max-width:640px;background:#fff;border-radius:16px;box-shadow:0 30px 60px -12px rgba(22,4,73,.45);',
                'display:flex;flex-direction:column;max-height:70vh;overflow:hidden;transform:translateY(-6px);transition:transform .2s;}',
            '.aisa-search-overlay.open .aisa-search-card{transform:translateY(0);}',
            '.aisa-search-inputrow{display:flex;align-items:center;gap:.7rem;padding:1rem 1.15rem;border-bottom:1px solid #F0EDF7;}',
            '.aisa-search-inputrow svg{width:1.25rem;height:1.25rem;color:#5E5A6B;flex-shrink:0;}',
            '.aisa-search-input{flex:1;border:none;outline:none;font:inherit;font-size:1.05rem;color:#1A1A1A;background:transparent;}',
            '.aisa-search-input::placeholder{color:#8A8597;}',
            '.aisa-search-kbd{font-size:.7rem;font-weight:600;color:#5E5A6B;background:#F6F4FB;border:1px solid #E7E2F4;padding:.15rem .45rem;border-radius:999px;}',
            '.aisa-search-results{flex:1;overflow-y:auto;padding:.4rem;}',
            '.aisa-search-empty{padding:2rem 1rem;text-align:center;color:#5E5A6B;font-size:.875rem;}',
            '.aisa-search-result{display:flex;align-items:center;gap:.85rem;width:100%;padding:.65rem .75rem;border-radius:10px;',
                'text-decoration:none;color:#1A1A1A;font:inherit;cursor:pointer;transition:background .12s;border:none;background:transparent;text-align:start;}',
            '.aisa-search-result:hover,.aisa-search-result.active{background:#F2EFFA;}',
            '.aisa-search-result .ic{width:2.25rem;height:2.25rem;border-radius:10px;background:#F6F4FB;color:#21076C;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}',
            '.aisa-search-result.active .ic{background:#21076C;color:#D8B664;}',
            '.aisa-search-result .ic svg{width:1.1rem;height:1.1rem;}',
            /* .tt and .dd are <span>s: without a block display they stay inline, where
               overflow and text-overflow do nothing and the text runs out under the tag. */
            '.aisa-search-result .body{min-width:0;flex:1;}',
            '.aisa-search-result .tt{display:block;font-weight:700;font-size:.92rem;color:#1A1A1A;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
            '.aisa-search-result .dd{font-size:.8rem;color:#5E5A6B;margin-top:1px;line-height:1.35;',
                'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
            '.aisa-search-result .tag{font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7A5C14;background:#FBF5E6;padding:.2rem .5rem;border-radius:9999px;flex-shrink:0;}',

            /* === Full-view notification modal === */
            '.aisa-notif-modal{position:fixed;inset:0;z-index:2147483010;display:flex;align-items:center;justify-content:center;',
                'background:rgba(22,4,73,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
                'opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;padding:1rem;font-family:' + FONT + ';}',
            '.aisa-notif-modal.open{opacity:1;visibility:visible;}',
            '.aisa-notif-card{background:#fff;color:#1A1A1A;border-radius:18px;box-shadow:0 30px 60px -12px rgba(22,4,73,.45);',
                'width:100%;max-width:560px;max-height:85vh;display:flex;flex-direction:column;',
                'transform:translateY(8px) scale(.98);transition:transform .25s cubic-bezier(.22,1,.36,1);}',
            '.aisa-notif-modal.open .aisa-notif-card{transform:translateY(0) scale(1);}',
            '.aisa-notif-card-head{padding:1.5rem 1.5rem 1rem;border-bottom:1px solid #F0EDF7;position:relative;}',
            '.aisa-notif-card-head .close{position:absolute;top:.85rem;right:.85rem;background:transparent;border:none;cursor:pointer;',
                'color:#5E5A6B;font-size:1.5rem;line-height:1;width:2rem;height:2rem;display:flex;align-items:center;justify-content:center;border-radius:999px;}',
            'html[dir="rtl"] .aisa-notif-card-head .close{right:auto;left:.85rem;}',
            '.aisa-notif-card-head .close:hover{background:#F2EFFA;color:#21076C;}',
            '.aisa-notif-card-head .badge{display:inline-block;background:#FBF5E6;color:#7A5C14;font-size:.65rem;',
                'font-weight:700;letter-spacing:.12em;text-transform:uppercase;padding:.25rem .65rem;border-radius:9999px;margin-bottom:.6rem;}',
            '.aisa-notif-card-head h2{font-size:1.35rem;font-weight:700;color:#21076C;margin:0 2rem .25rem 0;line-height:1.25;letter-spacing:-.015em;}',
            '.aisa-notif-card-head .meta{font-size:.8rem;color:#5E5A6B;}',
            '.aisa-notif-card-body{padding:1.25rem 1.5rem 1.5rem;overflow-y:auto;flex:1;font-size:.95rem;color:#3D3A48;line-height:1.6;white-space:normal;word-break:break-word;}',
            '.aisa-rt-link{color:#5B3FD0;text-decoration:underline;text-underline-offset:2px;text-decoration-thickness:1.5px;}',
            '.aisa-rt-link:hover{color:#21076C;}',

            /* === Responsive === */
            '@media (min-width:' + NAV_MIN + 'px){.aisa-tb-menu{display:none;}}',
            '@media (max-width:' + (NAV_MIN - 1) + 'px){.aisa-tb-nav{display:none;}}',
            /* The search field becomes an icon where the nav needs the room. */
            '@media (max-width:1359px){',
                '.aisa-tb-searchpill{width:2.5rem;padding:0;justify-content:center;background:transparent;border-color:transparent;}',
                '.aisa-tb-searchpill:hover{background:#F2EFFA;border-color:transparent;}',
                '.aisa-tb-searchpill .ph,.aisa-tb-searchpill .kbd{display:none;}',
                '.aisa-tb-searchpill svg{width:1.3rem;height:1.3rem;color:#3D3A48;}',
            '}',
            '@media (max-width:' + (NAV_MIN - 1) + 'px) and (min-width:720px){',
                '.aisa-tb-searchpill{width:17rem;padding:0 .5rem 0 .85rem;justify-content:flex-start;background:#F6F4FB;border-color:#ECE8F5;}',
                '.aisa-tb-searchpill .ph,.aisa-tb-searchpill .kbd{display:inline;}',
                '.aisa-tb-searchpill svg{width:1.1rem;height:1.1rem;color:#5E5A6B;}',
            '}',
            /* Admins carry one more nav item; at the narrowest nav widths the
             * language button goes to its icon. */
            '@media (max-width:1239px){.aisa-topbar.aisa-tb-is-admin .aisa-tb-lang{width:2.5rem;padding:0;justify-content:center;}.aisa-topbar.aisa-tb-is-admin .aisa-tb-lang-label{display:none;}}',
            '@media (max-width:640px){',
                '.aisa-topbar-inner{padding:0 .5rem;gap:0;}',
                '.aisa-topbar-brand{margin-inline-end:0;padding:.3rem;}',
                '.aisa-topbar-brand .wm small{display:none;}',
                '.aisa-topbar-brand .wm b{margin-top:0;font-size:.95rem;}',
                '.aisa-tb-lang{width:2.5rem;padding:0;justify-content:center;}',
                '.aisa-tb-lang-label{display:none;}',
                '.aisa-bell-panel{left:.5rem!important;right:.5rem!important;width:auto;max-width:none;}',
                '.aisa-tb-pop{left:.5rem!important;right:.5rem!important;min-width:0;}',
                '.aisa-notif-card{max-height:90vh;border-radius:16px;}',
                '.aisa-search-overlay{padding:1rem .5rem .5rem;}',
            '}',
            '@media (max-width:420px){.aisa-topbar-brand .wm{display:none;}}',
            '@media (max-width:359px){.aisa-tb-btn,.aisa-tb-lang,.aisa-tb-searchpill{width:2.25rem;min-width:2.25rem;}.aisa-tb-avatar{width:2.3rem;margin:0;}}',

            '@media print{.aisa-topbar,.aisa-menu-backdrop,.aisa-menu-drawer,.aisa-bell-panel,.aisa-tb-pop,.aisa-notif-modal,.aisa-search-overlay{display:none!important;}body{padding-top:0!important;}}'
        ].join('');
        document.head.appendChild(s);
    }

    /* -------- build the topbar -------- */

    /* -------- the floating "Request or report" button -------- */

    /* What already sits in the bottom-right corner on some pages: a
     * module's Previous/Next bar (Next is on the right), the Committees
     * shortcuts button, Leo on the home page (phones), Tools & Resources'
     * own "Request a Tool or Resource" button, Return to School's Gem
     * helper, and AI & Assessment's own Previous/Next bar. The floating
     * button goes above whichever of them is there. A new one: add its
     * selector here, or give it data-fab-avoid. */
    var FAB_AVOID = '.aisa-train-nav, .aia-nav-bar, #shortcuts-btn, #gem-container, .leo-mascot, ' +
        '[data-fab-avoid]';
    var fabEl = null, fabQueued = false;

    function placeFab() {
        fabQueued = false;
        if (!fabEl) return;
        var base = window.innerWidth <= 640 ? 16 : 20;
        var w = fabEl.offsetWidth || 52, h = fabEl.offsetHeight || 52;
        var vw = window.innerWidth, vh = window.innerHeight;
        var others = document.querySelectorAll(FAB_AVOID);
        var lift = base;
        /* Twice: lifting above one thing can bring the button up against
         * another above it. */
        for (var pass = 0; pass < 3; pass++) {
            var moved = false;
            for (var i = 0; i < others.length; i++) {
                var r = others[i].getBoundingClientRect();
                if (r.width < 1 || r.height < 1) continue;
                var cs = window.getComputedStyle(others[i]);
                if (cs.visibility === 'hidden' || cs.display === 'none') continue;
                var fabTop = vh - lift - h, fabLeft = vw - base - w;
                var overlaps = r.left < vw - base + 4 && r.right > fabLeft - 8 &&
                               r.top < vh - lift + 4 && r.bottom > fabTop - 8;
                if (overlaps) {
                    var need = Math.ceil(vh - r.top + 12);
                    if (need > lift && need < vh - h - 8) { lift = need; moved = true; }
                }
            }
            if (!moved) break;
        }
        fabEl.style.bottom = lift + 'px';
    }
    function queuePlaceFab() {
        if (fabQueued) return;
        fabQueued = true;
        (window.requestAnimationFrame || setTimeout)(placeFab);
    }

    function buildFab() {
        if (/\/request\.html$/.test(location.pathname)) return;   // the form itself
        var a = document.createElement('a');
        a.className = 'aisa-fab';
        a.href = rootUrl('request.html');
        a.title = 'Request a training, report a problem, or share an idea';
        a.setAttribute('aria-label', 'Request a training, report a problem, or share an idea');
        a.setAttribute('data-track', 'request:fab');
        a.innerHTML = ICONS.chat + '<span class="t">Request or report</span>';
        /* The page the person is on goes with them (at the moment they
         * click: a module's chapter is in the hash), so a problem report
         * starts with "which page?" already answered. */
        function withFrom() {
            a.href = rootUrl('request.html') + '?from=' + encodeURIComponent(location.pathname + location.hash);
        }
        a.addEventListener('mousedown', withFrom);
        a.addEventListener('touchstart', withFrom, { passive: true });
        a.addEventListener('focus', withFrom);
        a.addEventListener('click', withFrom);
        document.body.appendChild(a);
        fabEl = a;
        window.addEventListener('scroll', queuePlaceFab, { passive: true });
        window.addEventListener('resize', queuePlaceFab);
        document.addEventListener('click', function () { setTimeout(queuePlaceFab, 50); }, true);
        [0, 400, 1200, 3000].forEach(function (ms) { setTimeout(queuePlaceFab, ms); });
    }

    function decodedPath() {
        try { return decodeURIComponent(window.location.pathname); } catch (e) { return window.location.pathname; }
    }
    function isCurrent(item) { return !!(item.match && item.match.test(decodedPath())); }
    function curClass(item) { return isCurrent(item) ? ' is-current' : ''; }

    function initials(name, email) {
        var src = String(name || '').trim();
        if (!src && email) src = String(email).split('@')[0].replace(/[._-]+/g, ' ');
        var parts = src.split(/\s+/).filter(Boolean);
        if (!parts.length) return '';
        var a = parts[0].charAt(0), b = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
        return (a + b).toUpperCase();
    }

    function popItem(item, withDesc, extra) {
        return '<a href="' + rootUrl(item.href) + '" class="' + ((extra || '') + curClass(item)).trim() + '"' + (isCurrent(item) ? ' aria-current="page"' : '') + '>' +
            '<span class="ic">' + ICONS[item.icon] + '</span>' +
            '<span class="tx">' + escapeHtml(item.label) + (withDesc && item.desc ? '<small>' + escapeHtml(item.desc) + '</small>' : '') + '</span></a>';
    }

    function build() {
        if (built) return;
        built = true;
        injectStyles();

        var moreCurrent = MORE.some(isCurrent), adminCurrent = ADMIN.some(isCurrent);
        var navHtml = NAV.map(function (l) {
            return '<li><a class="aisa-tb-link' + curClass(l) + '" href="' + rootUrl(l.href) + '"' + (isCurrent(l) ? ' aria-current="page"' : '') + '>' + escapeHtml(l.label) + '</a></li>';
        }).join('') +
            '<li><button type="button" class="aisa-tb-link aisa-tb-more' + (moreCurrent ? ' is-current' : '') + '" aria-expanded="false" aria-haspopup="true">More' + ICONS.chevron + '</button></li>' +
            '<li class="aisa-tb-adminnav"><button type="button" class="aisa-tb-link aisa-tb-adminbtn' + (adminCurrent ? ' is-current' : '') + '" aria-expanded="false" aria-haspopup="true">Admin' + ICONS.chevron + '</button></li>';

        var bar = document.createElement('header');
        bar.className = 'aisa-topbar';
        bar.setAttribute('role', 'banner');
        bar.innerHTML =
            '<div class="aisa-topbar-inner">' +
                '<button class="aisa-tb-btn aisa-tb-menu" type="button" aria-label="Open menu" aria-expanded="false">' + ICONS.menu + '</button>' +
                '<a class="aisa-topbar-brand" href="' + rootUrl('index.html') + '" aria-label="AISA Learning Hub home">' +
                    '<img src="' + rootUrl('AISA_logo.png') + '" alt="" onerror="this.style.display=\'none\';">' +
                    '<span class="wm"><small>AISA</small><b>Learning Hub</b></span>' +
                '</a>' +
                '<nav aria-label="Main"><ul class="aisa-tb-nav">' + navHtml + '</ul></nav>' +
                '<span class="aisa-tb-spacer"></span>' +
                '<div class="aisa-topbar-right">' +
                    '<button class="aisa-tb-searchpill" type="button" aria-label="Search the Learning Hub">' +
                        ICONS.search + '<span class="ph">Search the Hub</span><span class="kbd" aria-hidden="true">Ctrl K</span>' +
                    '</button>' +
                    '<button class="aisa-tb-lang" type="button" aria-label="Switch language">' + ICONS.globe + '<span class="aisa-tb-lang-label"></span></button>' +
                    '<button class="aisa-tb-btn aisa-tb-bell" type="button" aria-label="Notifications">' + ICONS.bell + '<b class="aisa-tb-badge" aria-hidden="true"></b></button>' +
                    '<button class="aisa-tb-avatar" type="button" aria-label="Your account" aria-expanded="false" aria-haspopup="true"><span class="av">' + ICONS.user + '</span></button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(bar);

        /* More, Admin and the account menu */
        var more = document.createElement('div');
        more.className = 'aisa-tb-pop aisa-tb-pop-more';
        more.setAttribute('role', 'menu');
        more.innerHTML = MORE.map(function (l) { return popItem(l, true); }).join('');

        var adminPop = document.createElement('div');
        adminPop.className = 'aisa-tb-pop aisa-tb-pop-admin';
        adminPop.setAttribute('role', 'menu');
        adminPop.innerHTML = ADMIN.map(function (l) { return popItem(l); }).join('');

        var account = document.createElement('div');
        account.className = 'aisa-tb-pop aisa-tb-pop-account';
        account.setAttribute('role', 'menu');
        account.innerHTML =
            '<div class="who"><span class="av">' + ICONS.user + '</span><div><div class="n">Signed in</div><div class="e"></div></div></div>' +
            '<hr>' +
            popItem(NAV[0]) +
            popItem({ label: 'Request or report', icon: 'chat', href: 'request.html', match: /(^|\/)request\.html$/ }) +
            '<hr class="admin-only">' +
            ADMIN.map(function (l) { return popItem(l, false, 'admin-only'); }).join('') +
            '<hr>' +
            '<button type="button" class="item signout"><span class="ic">' + ICONS.signout + '</span><span class="tx">Sign out</span></button>';

        /* Drawer */
        var backdrop = document.createElement('div');
        backdrop.className = 'aisa-menu-backdrop';
        var drawer = document.createElement('nav');
        drawer.className = 'aisa-menu-drawer';
        drawer.setAttribute('aria-label', 'Site navigation');
        function drawerLink(l, extra) {
            return '<li' + (extra || '') + '><a href="' + rootUrl(l.href) + '" class="' + curClass(l).trim() + '"' + (isCurrent(l) ? ' aria-current="page"' : '') + '>' +
                '<span class="ico">' + ICONS[l.icon] + '</span><span>' + escapeHtml(l.label) + '</span></a></li>';
        }
        var listHtml = DRAWER.map(function (g) {
            return '<li class="aisa-menu-group">' + escapeHtml(g.title) + '</li>' + g.items.map(function (l) { return drawerLink(l); }).join('');
        }).join('') +
            /* Admin entries: hidden until revealAdminIfAllowed() knows. */
            '<li class="aisa-menu-group aisa-menu-admin-item" style="display:none;">Admin</li>' +
            ADMIN.map(function (l) { return drawerLink(l, ' class="aisa-menu-admin-item" style="display:none;"'); }).join('');
        drawer.innerHTML =
            '<div class="aisa-menu-head">' +
                '<div class="logo"><img src="' + rootUrl('AISA_logo.png') + '" alt="AISA" onerror="this.style.display=\'none\';"></div>' +
                '<span class="t">Learning Hub</span>' +
                '<button class="aisa-tb-btn aisa-menu-close" type="button" aria-label="Close menu">' + ICONS.close + '</button>' +
            '</div>' +
            '<div class="aisa-menu-user"><span class="av">' + ICONS.user + '</span><div class="who"><div class="name">AISA Learning Hub</div><div class="email"></div></div></div>' +
            '<ul class="aisa-menu-list">' + listHtml + '</ul>' +
            '<div class="aisa-menu-foot"><button type="button" class="aisa-menu-signout">' + ICONS.signout + 'Sign out</button></div>';

        /* Bell panel */
        var panel = document.createElement('div');
        panel.className = 'aisa-bell-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Notifications');
        panel.innerHTML =
            '<div class="aisa-bell-head"><span class="t">Notifications</span><button type="button" class="aisa-bell-markall" disabled>Mark all read</button></div>' +
            '<div class="aisa-bell-list"></div>';

        /* Search overlay */
        var search = document.createElement('div');
        search.className = 'aisa-search-overlay';
        search.setAttribute('role', 'dialog');
        search.setAttribute('aria-label', 'Search the Learning Hub');
        search.innerHTML =
            '<div class="aisa-search-card">' +
                '<div class="aisa-search-inputrow">' + ICONS.search +
                    '<input class="aisa-search-input" type="search" placeholder="Search modules, pages and resources" autocomplete="off" spellcheck="false">' +
                    '<span class="aisa-search-kbd">Esc</span>' +
                '</div>' +
                '<div class="aisa-search-results"></div>' +
            '</div>';

        [backdrop, drawer, more, adminPop, account, panel, search].forEach(function (el) { document.body.appendChild(el); });
        buildFab();

        refs.bar          = bar;
        refs.backdrop     = backdrop;
        refs.drawer       = drawer;
        refs.panel        = panel;
        refs.search       = search;
        refs.more         = more;
        refs.adminPop     = adminPop;
        refs.account      = account;
        refs.btnMenu      = bar.querySelector('.aisa-tb-menu');
        refs.btnMore      = bar.querySelector('.aisa-tb-more');
        refs.btnAdminNav  = bar.querySelector('.aisa-tb-adminbtn');
        refs.adminNav     = bar.querySelector('.aisa-tb-adminnav');
        refs.btnAvatar    = bar.querySelector('.aisa-tb-avatar');
        refs.btnBell      = bar.querySelector('.aisa-tb-bell');
        refs.btnLang      = bar.querySelector('.aisa-tb-lang');
        refs.btnLangLabel = bar.querySelector('.aisa-tb-lang-label');
        refs.btnSearch    = bar.querySelector('.aisa-tb-searchpill');
        refs.bellBadge    = bar.querySelector('.aisa-tb-badge');
        refs.bellList     = panel.querySelector('.aisa-bell-list');
        refs.bellMarkAll  = panel.querySelector('.aisa-bell-markall');
        refs.name         = drawer.querySelector('.aisa-menu-user .name');
        refs.email        = drawer.querySelector('.aisa-menu-user .email');
        refs.searchInput  = search.querySelector('.aisa-search-input');
        refs.searchResults = search.querySelector('.aisa-search-results');

        /* --- Language toggle --- */
        applyLang(readLang(), { announce: false });
        refs.btnLang.addEventListener('click', function () {
            applyLang(readLang() === 'ar' ? 'en' : 'ar', { announce: true });
        });

        /* --- Pop-overs (More, Admin, account): one open at a time --- */
        var pops = [[refs.btnMore, more], [refs.btnAdminNav, adminPop], [refs.btnAvatar, account]];
        function closePops(except) {
            pops.forEach(function (p) {
                if (p[1] === except) return;
                p[1].classList.remove('open');
                p[0].setAttribute('aria-expanded', 'false');
            });
        }
        function placePop(pop, btn, alignEnd) {
            pop.style.left = ''; pop.style.right = '';
            var r = btn.getBoundingClientRect(), vw = window.innerWidth || document.documentElement.clientWidth;
            if (vw <= 640) return;   // full width, from the CSS
            var rtl = document.documentElement.getAttribute('dir') === 'rtl';
            if (alignEnd !== rtl) pop.style.right = Math.max(8, vw - r.right) + 'px';
            else pop.style.left = Math.max(8, r.left) + 'px';
        }
        pops.forEach(function (p) {
            var btn = p[0], pop = p[1];
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var open = !pop.classList.contains('open');
                closePops(); closePanel(); closeSearch();
                if (open) {
                    placePop(pop, btn, pop === account);
                    pop.classList.add('open');
                    btn.setAttribute('aria-expanded', 'true');
                    var first = pop.querySelector('a,button');
                    if (first && e.detail === 0) first.focus();   // opened from the keyboard
                }
            });
        });
        document.addEventListener('click', function (e) {
            pops.forEach(function (p) {
                if (p[1].classList.contains('open') && !p[1].contains(e.target) && !p[0].contains(e.target)) {
                    p[1].classList.remove('open'); p[0].setAttribute('aria-expanded', 'false');
                }
            });
        });
        window.addEventListener('resize', function () { closePops(); });

        function signOut() {
            if (window.aisaAuth && typeof window.aisaAuth.signOut === 'function') window.aisaAuth.signOut();
            else window.location.href = rootUrl('index.html');
        }
        account.querySelector('.signout').addEventListener('click', signOut);
        drawer.querySelector('.aisa-menu-signout').addEventListener('click', signOut);

        /* --- Drawer behaviour --- */
        function drawerOpen()  { closePops(); closePanel(); closeSearch(); backdrop.classList.add('open'); drawer.classList.add('open'); refs.btnMenu.setAttribute('aria-expanded', 'true'); refs.btnMenu.setAttribute('aria-label', 'Close menu'); }
        function drawerClose() { backdrop.classList.remove('open'); drawer.classList.remove('open'); refs.btnMenu.setAttribute('aria-expanded', 'false'); refs.btnMenu.setAttribute('aria-label', 'Open menu'); }
        function drawerIsOpen() { return drawer.classList.contains('open'); }
        refs.btnMenu.addEventListener('click', function () { drawerIsOpen() ? drawerClose() : drawerOpen(); });
        drawer.querySelector('.aisa-menu-close').addEventListener('click', drawerClose);
        backdrop.addEventListener('click', drawerClose);

        /* --- Bell panel --- */
        function openPanel() {
            drawerClose(); closeSearch(); closePops();
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

        /* --- Search overlay --- */
        function openSearch() {
            drawerClose(); closePanel(); closePops();
            search.classList.add('open');
            refs.searchInput.value = '';
            renderSearchResults('');
            setTimeout(function () { refs.searchInput.focus(); }, 30);
        }
        function closeSearch() { search.classList.remove('open'); }
        function searchIsOpen() { return search.classList.contains('open'); }

        /* Position a dropdown under a bar button, by the right edge of the
         * viewport so it stays on screen; full width on phones (CSS). */
        function anchorRight(el, btn) {
            el.style.left = '';
            el.style.right = '';
            var rect = btn.getBoundingClientRect();
            var vw = window.innerWidth || document.documentElement.clientWidth || 0;
            if (vw > 640) el.style.right = Math.max(8, vw - rect.right) + 'px';
        }

        refs.btnSearch.addEventListener('click', openSearch);
        refs.searchInput.addEventListener('input', function () { renderSearchResults(refs.searchInput.value); });
        refs.searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                var act = refs.searchResults.querySelector('.aisa-search-result.active') || refs.searchResults.querySelector('.aisa-search-result');
                if (act) act.click();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                moveSearchHighlight(e.key === 'ArrowDown' ? 1 : -1);
            }
        });
        search.addEventListener('click', function (e) { if (e.target === search) closeSearch(); });

        /* Global keyboard shortcuts. */
        document.addEventListener('keydown', function (e) {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                searchIsOpen() ? closeSearch() : openSearch();
                return;
            }
            if (e.key !== 'Escape') return;
            if (refs.openModal) { closeNotificationModal(); return; }
            if (searchIsOpen()) { closeSearch(); return; }
            if (panelIsOpen())  { closePanel();  return; }
            var openPop = pops.filter(function (p) { return p[1].classList.contains('open'); })[0];
            if (openPop) { closePops(); openPop[0].focus(); return; }
            if (drawerIsOpen()) { drawerClose(); return; }
        });
        /* On a Mac the hint says the Mac's shortcut. */
        try {
            if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) bar.querySelector('.aisa-tb-searchpill .kbd').textContent = '⌘ K';
        } catch (e) {}

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
                var ini = initials(u.name, u.email);
                var who = refs.account.querySelector('.who');
                who.querySelector('.n').textContent = u.name || 'Signed in';
                who.querySelector('.e').textContent = u.email || '';
                if (ini) {
                    [refs.btnAvatar.querySelector('.av'), who.querySelector('.av'), refs.drawer.querySelector('.aisa-menu-user .av')].forEach(function (el) {
                        if (el) el.textContent = ini;
                    });
                    refs.btnAvatar.setAttribute('aria-label', 'Your account: ' + (u.name || u.email));
                }
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
                /* Drawer entries: hidden inline until we know. */
                var items = refs.drawer ? refs.drawer.querySelectorAll('.aisa-menu-admin-item') : [];
                items.forEach(function (li) { li.style.display = ''; });
                /* The bar's Admin menu and the account menu's admin links:
                 * hidden by CSS until .show / .is-admin, so a race can never
                 * show them to anyone else. */
                if (refs.adminNav) refs.adminNav.classList.add('show');
                if (refs.account) refs.account.classList.add('is-admin');
                if (refs.bar) refs.bar.classList.add('aisa-tb-is-admin');
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
                '<span class="ic">' + typeIcon(it.type) + '</span>' +
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
                    '<div class="e">' + ICONS.bell + '</div>' +
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
