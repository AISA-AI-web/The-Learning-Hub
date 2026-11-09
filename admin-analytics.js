/* admin-analytics.js — the Learning Hub analytics page (admin-analytics.html).
 *
 * One admin_dashboard request brings everything (see the page's header
 * comment); this file turns it into a model, applies the filters, and draws
 * every section with admin-analytics-charts.js. Nothing is fetched again
 * when a filter changes: filtering is all in the page.
 *
 * Things to keep in step with the rest of the Hub:
 *   MODULES        the fourteen modules, grouped as in the 3 Nov report,
 *                  with the PD hours each certificate gives. A new module
 *                  goes here AND in the MODULES arrays of
 *                  admin-dashboard.html and dashboard.html.
 *   KNOWN_ISSUES   Digital Lion issues and the day each came out. An
 *                  issue page nobody lists here is still found
 *                  (Media Hub/<mon><day>.html) and dated from its name.
 *   TEST_ACCOUNTS  the accounts whose activity is mostly testing; the
 *                  "Leave out" box drops them everywhere (on by default).
 *   READINESS_STEPS / THEMES   the AI Literacy readiness module's saved
 *                  parts, in course order, and the keyword themes.
 *
 * Times: every day, hour and weekday is Abu Dhabi time (UTC+4, no daylight
 * saving), worked out from the instant, whatever the viewer's own clock is.
 */
(function () {
    'use strict';

    var K = window.AisaCharts;
    if (!K) return;
    var h = K.h, fmt = K.fmt, fmt1 = K.fmt1, pct = K.pct, C = K.C, CAT = K.CAT;

    /* ---------------- what the page knows ---------------- */

    var TEST_ACCOUNTS = ['bbaki@aisa.sch.ae', 'hodai@aisa.sch.ae'];
    var READINESS_ID = 'ai-curriculum-readiness';
    var GOAL_SURVEY = 'secondary-teacher-goal-2026-27';
    var STORE_KEY = 'aisa_analytics_view_v1';   // date range, group, spotlight only: never people

    var GROUPS = [
        { id: 'whole', name: 'Whole-school', color: CAT[0] },
        { id: 'onboard', name: 'New-staff onboarding', color: CAT[1] },
        { id: 'tools', name: 'Tools & practice', color: CAT[2] }
    ];
    var MODULES = [
        { id: 'safeguarding', hours: 2, title: 'Child Protection, Safeguarding, and Drug Prevention', short: 'Safeguarding', group: 'whole', file: 'safeguarding-module.html' },
        { id: 'sustainability', hours: 0.5, title: 'Sustainability at AISA', short: 'Sustainability', group: 'whole', file: 'sustainability-module.html' },
        { id: 'ai-ethics', hours: 1, title: 'AI Vision & Ethical Framework', short: 'AI Ethics', group: 'whole', file: 'ai-ethics-module.html' },
        { id: 'return-to-school', hours: 2, title: 'Return to School: Emergency Protocol', short: 'Return to School', group: 'whole', file: 'return-to-school.html' },
        { id: 'ai-curriculum-readiness', hours: 1, title: 'AI Literacy: Teacher Readiness', short: 'AI Literacy Readiness', group: 'whole', file: 'ai-curriculum-readiness-module.html' },
        { id: 'campus-safety', hours: 1, title: 'Campus Layout, Safety & Security', short: 'Campus Safety', group: 'onboard', file: 'campus-safety-module.html' },
        { id: 'visa-emirates-id', hours: 1, title: 'Employment Visa & Emirates ID', short: 'Visa & Emirates ID', group: 'onboard', file: 'visa-emirates-id-module.html' },
        { id: 'payroll-prf', hours: 1, title: 'Payroll & Purchase Requisitions', short: 'Payroll & PRF', group: 'onboard', file: 'payroll-prf-module.html' },
        { id: 'ai-and-assessment', hours: 1, title: 'AI & Assessment Design', short: 'AI & Assessment', group: 'tools', file: 'ai-and-assessment.html' },
        { id: 'workspace-studio', hours: 1, title: 'Google Workspace Studio', short: 'Workspace Studio', group: 'tools', file: 'workspace-studio-module.html' },
        { id: 'chalkie', hours: 1, title: 'Chalkie.ai', short: 'Chalkie', group: 'tools', file: 'chalkie-module.html' },
        { id: 'success-criteria', hours: 1, title: 'Objectives & Success Criteria', short: 'Success Criteria', group: 'tools', file: null, hash: 'module-objectives' },
        { id: 'sharepoint-workflows', hours: 1, title: 'SharePoint Workflows', short: 'SharePoint', group: 'tools', file: 'sharepoint-workflows-module.html' },
        { id: 'notebooklm', hours: 1, title: 'NotebookLM Masterclass', short: 'NotebookLM', group: 'tools', file: 'notebooklm-module.html' }
    ];
    var MOD = {};
    MODULES.forEach(function (m) { MOD[m.id] = m; });
    /* AI Literacy: Teacher Readiness applies to its cohort only (ai-literacy-cohort.js, shared with the admin dashboard):
     * its completion, its "still to finish" and its finish rate count those 62 teachers, including any who never opened
     * the Hub, and nobody else. Without the file the module is measured against everyone, as before. */
    var COHORT = {};
    (window.AISA_AI_LITERACY_COHORT || []).forEach(function (t) { COHORT[String(t.email || '').trim().toLowerCase()] = t.name || ''; });
    if (Object.keys(COHORT).length) MOD[READINESS_ID].cohort = COHORT;
    function applies(mm, e) { return !mm.cohort || Object.prototype.hasOwnProperty.call(mm.cohort, e); }

    var KNOWN_ISSUES = [
        { file: 'may4.html', no: 1, date: '2026-05-04' },
        { file: 'may11.html', no: 2, date: '2026-05-11' },
        { file: 'may18.html', no: 3, date: '2026-05-18' },
        { file: 'jun17.html', no: 4, date: '2026-06-17' },
        { file: 'sep18.html', no: 5, date: '2026-09-18' },
        { file: 'oct30.html', no: 6, date: '2026-10-30' }
    ];

    var READINESS_STEPS = [
        { id: 'architecture', label: 'Curriculum architecture' },
        { id: 'thinking', label: 'Thinking task' },
        { id: 'lesson', label: 'Lesson sketch' },
        { id: 'quality', label: 'Judging quality' },
        { id: 'responsible', label: 'Responsible use' },
        { id: 'commit', label: 'Commitment' },
        { id: 'f2f', label: 'Face-to-face task' },
        { id: 'strands', label: 'The four strands' }
    ];
    var THEMES = [
        { label: 'Clear expectations and examples', re: /expect|example|exemplar|model(?:led|ling)?\b|clarit|clear|guidance|what (?:it|this|that) looks like|rubric|criteria|structure/i },
        { label: 'When and how often to teach it', re: /\btime\b|timetabl|schedul|period|how often|frequen|\bslot|calendar|when (?:to|do|will|should)|which lesson|minutes/i },
        { label: 'Lesson materials and InstrucTwin access', re: /instructwin|material|resource|lesson plan|slide|worksheet|\baccess|log ?in|platform|content|plans?\b/i },
        { label: 'Making it work for KG and EAL learners', re: /\bkg\b|kinder|young(?:er)? (?:learner|student|children)|\beal\b|\bell\b|english|language|arabic|different(?:iat|\s+level)|\bsen\b|learning support|abilit/i },
        { label: 'Assessing and recording learning', re: /assess|grad(?:e|ing)\b|marking|\brecord|report|evidence|track|progress/i },
        { label: 'Their own AI knowledge and confidence', re: /confiden|knowledge|understand|myself|\bskills?\b|familiar|learn more|not sure|unsure|new to (?:ai|this)|comfortable/i },
        { label: 'Devices, accounts and tech', re: /device|laptop|ipad|chromebook|wi-?fi|internet|\btech\b|technolog|screen|projector|account/i }
    ];

    var KNOWN_DIRS = { 'PD Modules': 1, 'Media Hub': 1, 'Orientation Hub': 1, 'Tools and Resources': 1, 'AI Literacy Hub': 1,
                       'PD Day': 1, 'Library Hub': 1, 'Committees': 1, 'Wired Wednesdays': 1, 'assets': 1, 'auth': 1 };
    var SECTIONS = [
        [/^PD Modules\//, 'PD modules'], [/^Media Hub\//, 'Newsletter & media'], [/^Orientation Hub\//, 'Orientation'],
        [/^Tools and Resources\//, 'Tools & resources'], [/^AI Literacy Hub\//, 'AI Literacy Hub'], [/^PD Day\//, 'PD Day'],
        [/^Library Hub\//, 'Library'], [/^Committees\//, 'Committees'], [/^Wired Wednesdays\//, 'Wired Wednesdays'],
        [/^(?:index\.html)?$/, 'Hub home'], [/^dashboard\.html$/, 'My Dashboard'], [/^admin-/, 'Admin pages']
    ];
    var SOURCES = [
        { id: 'hub', name: 'From the Hub', color: CAT[0] },
        { id: 'gmail', name: 'From Gmail', color: CAT[1] },
        { id: 'direct', name: 'Direct link (email app, chat, bookmark)', color: CAT[2], ink: C.ink },
        { id: 'other', name: 'Another site', color: CAT[3], ink: C.ink }
    ];
    var DEVICES = ['Laptop', 'Phone', 'Tablet'];

    /* ---------------- time (Abu Dhabi) ---------------- */

    var DAY = 86400, TZ = 14400;
    function dayOf(t) { return Math.floor((t + TZ) / DAY); }
    function dayStart(d) { return d * DAY - TZ; }
    function weekdayOf(d) { return ((d + 4) % 7 + 7) % 7; }            // 0 Sunday … 6 Saturday
    function mondayOf(d) { return d - ((weekdayOf(d) + 6) % 7); }
    function hourOf(t) { return Math.floor((((t + TZ) % DAY) + DAY) % DAY / 3600); }
    function dateOfDay(d) { return new Date(d * DAY * 1000); }          // UTC fields = Abu Dhabi calendar
    function nowSec() { return Math.floor(Date.now() / 1000); }
    function isoSec(iso) { var t = Date.parse(iso || ''); return isNaN(t) ? 0 : Math.floor(t / 1000); }
    var DF = {
        d: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        dy: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }),
        wd: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }),
        m: new Intl.DateTimeFormat('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    };
    function dLabel(d) { return DF.d.format(dateOfDay(d)); }
    function dyLabel(d) { return DF.dy.format(dateOfDay(d)); }
    function tLabel(t) { return t ? DF.d.format(dateOfDay(dayOf(t))) : '—'; }
    function clock(t) {
        var s = t + TZ, hh = Math.floor((s % DAY) / 3600), mm = Math.floor((s % 3600) / 60);
        return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }
    function hourLabel(hr) { var x = hr % 12 || 12; return x + (hr < 12 ? 'am' : 'pm') + '–' + ((hr + 1) % 12 || 12) + ((hr + 1) % 24 < 12 ? 'am' : 'pm'); }
    function dayFromInput(v) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
        return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 / DAY) : null;
    }
    function inputFromDay(d) { return dateOfDay(d).toISOString().slice(0, 10); }

    /* ---------------- state ---------------- */

    var AUTH = null, RAW = null, M = null, LOADED_AT = 0;
    var F = { range: 'all', from: '', to: '', tag: '', staff: [], noTest: true };
    var VIEW = { spot: 'sustainability', act: 'staff', modMeasure: 'count', section: '', sortKey: 'last', sortDir: -1, q: '', showAll: false };
    var TEST = {};
    TEST_ACCOUNTS.forEach(function (e) { TEST[e] = true; });

    (function restore() {
        try {
            var v = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
            if (v.range) F.range = v.range;
            if (v.from) F.from = v.from;
            if (v.to) F.to = v.to;
            if (typeof v.tag === 'string') F.tag = v.tag;
            if (typeof v.noTest === 'boolean') F.noTest = v.noTest;
            if (v.spot && MOD[v.spot]) VIEW.spot = v.spot;
        } catch (e) { /* private mode, or nothing saved */ }
    })();
    function remember() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify({
                range: F.range, from: F.from, to: F.to, tag: F.tag, noTest: F.noTest, spot: VIEW.spot }));
        } catch (e) { /* fine: it's a convenience */ }
    }

    /* ---------------- small helpers ---------------- */

    function $(id) { return document.getElementById(id); }
    function lower(e) { return String(e || '').trim().toLowerCase(); }
    function nameOf(e) {
        var p = M && M.people[e];
        if (p && p.name) return p.name;
        if (COHORT[e]) return COHORT[e];
        return String(e || '').split('@')[0];
    }
    function rich(el, parts) {
        K.clear(el);
        parts.forEach(function (p) {
            if (p === null || p === undefined || p === false) return;
            if (typeof p === 'string' || typeof p === 'number') el.appendChild(document.createTextNode(String(p)));
            else el.appendChild(h('b', { text: p.b, 'class': p.crit ? 'is-crit' : null }));
        });
    }
    function b(x) { return { b: typeof x === 'number' ? fmt(x) : String(x) }; }
    function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }
    function median(a) {
        if (!a.length) return 0;
        var s = a.slice().sort(function (x, y) { return x - y; });
        var m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    function cleanTitle(t) {
        return String(t || '').replace(/^\s*AISA\s*[|·:–-]\s*/i, '').replace(/\s*[|·–-]\s*AISA.*$/i, '').trim();
    }
    function safe(name, fn) {
        try { fn(); } catch (e) { console.error('AISA analytics: ' + name + ' failed', e); }
    }

    /* ---------------- paths and sources ---------------- */

    var ROOT = (function () {
        var r = location.pathname.replace(/[^/]*$/, '');
        try { return decodeURIComponent(r); } catch (e) { return r; }
    })();
    function relPath(path) {
        var p = String(path || '').split(/[?#]/)[0];
        try { p = decodeURIComponent(p); } catch (e) { /* keep as is */ }
        if (ROOT !== '/' && p.indexOf(ROOT) === 0) return p.slice(ROOT.length);
        p = p.replace(/^\/+/, '');
        var segs = p.split('/');
        if (segs.length > 1 && !KNOWN_DIRS[segs[0]] && !/\.html?$/i.test(segs[0])) p = segs.slice(1).join('/');
        return p;
    }
    function sectionOf(rel) {
        for (var i = 0; i < SECTIONS.length; i++) if (SECTIONS[i][0].test(rel)) return SECTIONS[i][1];
        return 'Other';
    }

    /* ---------------- the model ---------------- */

    function build(raw) {
        var m = {
            hasUsage: !!(raw.usage && raw.usage.ok),
            people: {}, pv: [], ev: [], ck: [], si: [], titles: {},
            done: [], doneKey: {}, opened: {}, tags: []
        };
        function person(email, name) {
            var e = lower(email);
            if (!e) return null;
            var p = m.people[e];
            if (!p) p = m.people[e] = { email: e, name: '', tags: [], onRoster: false, first: Infinity, last: 0, lastSeenIso: '' };
            if (name && !p.name) p.name = String(name).trim();
            return p;
        }
        var ov = raw.overview && raw.overview.ok !== false ? raw.overview : null;
        if (ov) (ov.people || []).forEach(function (r) {
            var p = person(r.email, r.name);
            if (p) p.lastSeenIso = r.last_seen || '';
        });

        if (m.hasUsage) {
            var U = raw.usage;
            (U.roster || []).forEach(function (r) {
                var p = person(r[0], r[1]);
                if (!p) return;
                p.onRoster = true;
                (r[2] || []).forEach(function (t) { if (p.tags.indexOf(t) === -1) p.tags.push(t); });
            });
            var ppl = (U.people || []).map(function (r) { var p = person(r[0], r[1]); return p ? p.email : ''; });
            var pages = (U.pages || []).map(function (r) {
                var rel = relPath(r[0]);
                if (r[1]) m.titles[rel] = cleanTitle(r[1]);
                return { raw: String(r[0] || ''), rel: rel, sec: sectionOf(rel) };
            });
            var refs = U.refs || [''];
            var refCount = {};
            (U.pageviews || []).forEach(function (r) { var host = refs[r[3]] || ''; if (host) refCount[host] = (refCount[host] || 0) + 1; });
            /* The Hub's own host: this page's, plus the most common referrer
             * that isn't Google (internal clicks far outnumber anything else),
             * so the page works wherever the Hub is served from. */
            var hubHosts = {}; hubHosts[location.hostname] = true;
            var topHost = Object.keys(refCount).filter(function (x) { return !/google\./.test(x); })
                .sort(function (a, c) { return refCount[c] - refCount[a]; })[0];
            if (topHost) hubHosts[topHost] = true;
            var refClass = refs.map(function (host) {
                if (!host) return 'direct';
                if (hubHosts[host]) return 'hub';
                if (host === 'mail.google.com' || host === 'google.com' || host === 'www.google.com') return 'gmail';
                return 'other';
            });
            (U.pageviews || []).forEach(function (r) {
                var pg = pages[r[2]] || { raw: '', rel: '', sec: 'Other' };
                m.pv.push({ t: r[0], p: ppl[r[1]], page: pg.rel, raw: pg.raw, sec: pg.sec, ref: refClass[r[3]] || 'direct', dev: r[4] | 0 });
            });
            (U.events || []).forEach(function (r) { m.ev.push({ t: r[0], p: ppl[r[1]], mod: r[2], ev: r[3] }); });
            (U.clicks || []).forEach(function (r) {
                var pg = pages[r[3]] || { rel: '' };
                m.ck.push({ t: r[0], p: ppl[r[1]], label: (U.labels || [])[r[2]] || '', page: pg.rel });
            });
            (U.signins || []).forEach(function (r) { m.si.push({ t: r[0], p: ppl[r[1]], dev: r[2] | 0 }); });
        } else if (ov) {
            /* A backend without `usage`: completions are all there is, and
             * only the latest per person and module. */
            (ov.completions || []).forEach(function (c) {
                var p = person(c.email, '');
                var t = isoSec(c.completed_at);
                if (p && t) m.ev.push({ t: t, p: p.email, mod: c.module_id, ev: 'completed' });
            });
        }

        [m.pv, m.ev, m.si, m.ck].forEach(function (list) {
            list.forEach(function (r) {
                var p = m.people[r.p];
                if (!p) return;
                if (r.t < p.first) p.first = r.t;
                if (r.t > p.last) p.last = r.t;
            });
        });
        Object.keys(m.people).forEach(function (e) {
            var p = m.people[e];
            var seen = isoSec(p.lastSeenIso);
            if (seen > p.last) p.last = seen;
            if (seen && seen < p.first && !m.hasUsage) p.first = seen;
            p.tags.forEach(function (t) { if (m.tags.indexOf(t) === -1) m.tags.push(t); });
        });
        m.tags.sort();

        /* first completion per person and module; first opening */
        m.ev.slice().sort(function (a, c) { return a.t - c.t; }).forEach(function (r) {
            if (!MOD[r.mod]) return;
            var key = r.p + '|' + r.mod;
            if (!(key in m.opened)) m.opened[key] = r.t;
            if (r.ev === 'completed' && !(key in m.doneKey)) {
                m.doneKey[key] = r.t;
                m.done.push({ p: r.p, mod: r.mod, t: r.t });
            }
        });
        var fileMod = {};
        MODULES.forEach(function (mm) { if (mm.file) fileMod[mm.file] = mm.id; });
        m.pv.forEach(function (r) {
            var file = r.page.split('/').pop();
            var id = fileMod[file];
            if (!id && r.raw.indexOf('module-objectives') !== -1) id = 'success-criteria';
            if (!id) return;
            r.mod = id;
            var key = r.p + '|' + id;
            if (!(key in m.opened) || r.t < m.opened[key]) m.opened[key] = r.t;
        });

        var firsts = [];
        [m.pv, m.ev, m.si].forEach(function (l) { if (l.length) firsts.push(Math.min.apply(null, l.map(function (r) { return r.t; }))); });
        m.firstT = firsts.length ? Math.min.apply(null, firsts) : nowSec() - 30 * DAY;
        m.pvStart = m.pv.length ? Math.min.apply(null, m.pv.map(function (r) { return r.t; })) : 0;
        m.firstDay = dayOf(m.firstT);

        /* newsletter issues: the known ones, plus any issue page seen */
        var issues = {};
        KNOWN_ISSUES.forEach(function (k) {
            var d = dayFromInput(k.date);
            issues[k.file] = { file: k.file, no: k.no, day: d, label: dLabel(d) };
        });
        var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        m.pv.forEach(function (r) {
            var mt = /^Media Hub\/([a-z]{3})(\d{1,2})\.html$/i.exec(r.page);
            if (!mt) return;
            var file = mt[1].toLowerCase() + mt[2] + '.html';
            r.issue = file;
            if (issues[file]) return;
            var mi = MONTHS.indexOf(mt[1].toLowerCase());
            if (mi < 0) return;
            var seen = dateOfDay(dayOf(r.t));
            var y = seen.getUTCFullYear();
            if (mi > seen.getUTCMonth()) y--;
            var d = Math.floor(Date.UTC(y, mi, +mt[2]) / 1000 / DAY);
            issues[file] = { file: file, no: 0, day: d, label: dLabel(d) };
        });
        m.issues = Object.keys(issues).map(function (k) { return issues[k]; })
            .sort(function (a, c) { return a.day - c.day; });

        m.dwellLegacy = !!(raw.dwell && raw.dwell.error === 'dwell_sheet_needs_migration');
        m.dwell = (raw.dwell && raw.dwell.ok) ? (raw.dwell.rows || []) : [];
        m.notifs = (raw.notifications && raw.notifications.ok) ? raw.notifications.notifications || [] : null;
        m.ready = (raw.module_responses && raw.module_responses.ok) ? raw.module_responses.responses || [] : null;
        m.survey = (raw.survey && raw.survey.ok) ? raw.survey : null;
        (m.ready || []).forEach(function (r) { person(r.email, r.name); });
        if (m.survey) (m.survey.responses || []).forEach(function (r) { person(r.email, r.name); });
        Object.keys(m.people).forEach(function (e) {
            var p = m.people[e];
            p.tags.forEach(function (t) { if (m.tags.indexOf(t) === -1) m.tags.push(t); });
        });
        m.tags.sort();
        return m;
    }

    /* ---------------- filters → one query ---------------- */

    function scope() {
        var staff = F.staff.length ? {} : null;
        F.staff.forEach(function (e) { staff[e] = true; });
        var S = {};
        Object.keys(M.people).forEach(function (e) {
            var p = M.people[e];
            if (staff) { if (!staff[e]) return; }
            else if (F.noTest && TEST[e]) return;
            if (F.tag && p.tags.indexOf(F.tag) === -1) return;
            S[e] = true;
        });
        return S;
    }

    /* All time starts at the first thing anyone in the selection did. */
    function range(S) {
        var today = dayOf(nowSec());
        var first = Infinity;
        Object.keys(S || {}).forEach(function (e) { if (M.people[e].first < first) first = M.people[e].first; });
        var a = first < Infinity ? dayOf(first) : M.firstDay, b2 = today + 1;
        if (F.range === '7' || F.range === '30' || F.range === '90') a = today - (+F.range - 1);
        else if (F.range === 'year') {
            var d = dateOfDay(today), y = d.getUTCFullYear();
            if (d.getUTCMonth() < 7) y--;
            a = Math.floor(Date.UTC(y, 7, 1) / 1000 / DAY);
        } else if (F.range === 'custom') {
            var fa = dayFromInput(F.from), fb = dayFromInput(F.to);
            if (fa !== null) a = fa;
            if (fb !== null) b2 = fb + 1;
        }
        if (a >= b2) a = b2 - 1;
        return { a: a, b: b2, ta: dayStart(a), tb: dayStart(b2), days: b2 - a, bounded: F.range !== 'all' };
    }

    function rangeText(R) {
        if (F.range === 'all') return 'since ' + dyLabel(R.a);
        if (R.days === 1) return 'on ' + dyLabel(R.a);
        return dLabel(R.a) + ' – ' + dyLabel(R.b - 1);
    }

    function query() {
        var S = scope(), R = range(S);
        var inS = function (r) { return S[r.p]; };
        var inR = function (r) { return r.t >= R.ta && r.t < R.tb; };
        var Q = { S: S, R: R };
        Q.pv = M.pv.filter(function (r) { return inS(r) && inR(r); });
        Q.ev = M.ev.filter(function (r) { return inS(r) && inR(r); });
        Q.ck = M.ck.filter(function (r) { return inS(r) && inR(r); });
        Q.si = M.si.filter(function (r) { return inS(r) && inR(r); });
        /* Active: a page view or a module event. A day on the Hub: a day with
         * a page view (with no page views to go on, a day with an event). */
        Q.active = {};
        Q.days = {};
        Q.pv.concat(Q.ev).forEach(function (r) { Q.active[r.p] = true; });
        (M.hasUsage ? Q.pv : Q.ev).forEach(function (r) { (Q.days[r.p] = Q.days[r.p] || {})[dayOf(r.t)] = true; });
        Q.activeList = Object.keys(Q.active);
        /* Hub users: in the selection, and seen before the range ended */
        Q.users = Object.keys(S).filter(function (e) { return M.people[e].first < R.tb; });
        Q.doneIn = M.done.filter(function (d) { return S[d.p] && d.t >= R.ta && d.t < R.tb; });
        Q.doneBy = {};
        M.done.forEach(function (d) {
            if (!S[d.p] || d.t >= R.tb) return;
            (Q.doneBy[d.p] = Q.doneBy[d.p] || {})[d.mod] = d.t;
        });
        Q.readers = {};
        Q.pv.forEach(function (r) { if (r.issue) (Q.readers[r.p] = Q.readers[r.p] || {})[r.issue] = true; });
        return Q;
    }

    /* Headline numbers for any window, for the deltas and sparklines. */
    function windowStats(S, ta, tb) {
        var active = {}, views = 0, readers = {}, finished = 0;
        M.pv.forEach(function (r) {
            if (!S[r.p] || r.t < ta || r.t >= tb) return;
            active[r.p] = 1; views++;
            if (r.issue) readers[r.p] = 1;
        });
        M.ev.forEach(function (r) { if (S[r.p] && r.t >= ta && r.t < tb) active[r.p] = 1; });
        M.done.forEach(function (d) { if (S[d.p] && d.t >= ta && d.t < tb) finished++; });
        return { active: Object.keys(active).length, views: views, readers: Object.keys(readers).length, finished: finished };
    }

    /* Time buckets for the chosen range: days, weeks (from Monday) or months. */
    function buckets(R) {
        var unit = R.days <= 45 ? 'day' : (R.days <= 560 ? 'week' : 'month');
        var list = [];
        if (unit === 'day') {
            for (var d = R.a; d < R.b; d++) list.push({ a: d, b: d + 1, label: dLabel(d), title: DF.wd.format(dateOfDay(d)) });
        } else if (unit === 'week') {
            for (var w = mondayOf(R.a); w < R.b; w += 7) list.push({ a: w, b: w + 7, label: dLabel(w), title: 'Week of ' + DF.wd.format(dateOfDay(w)) });
        } else {
            var s = dateOfDay(R.a), y = s.getUTCFullYear(), mo = s.getUTCMonth();
            while (true) {
                var a = Math.floor(Date.UTC(y, mo, 1) / 1000 / DAY);
                if (a >= R.b) break;
                var nb = Math.floor(Date.UTC(y, mo + 1, 1) / 1000 / DAY);
                list.push({ a: a, b: nb, label: DF.m.format(dateOfDay(a)), title: DF.m.format(dateOfDay(a)) });
                mo++; if (mo > 11) { mo = 0; y++; }
            }
        }
        function index(t) {
            var d = dayOf(t);
            if (unit === 'day') return d - R.a;
            if (unit === 'week') return Math.floor((d - mondayOf(R.a)) / 7);
            for (var i = 0; i < list.length; i++) if (d >= list[i].a && d < list[i].b) return i;
            return -1;
        }
        return { unit: unit, list: list, index: index,
                 noun: unit === 'day' ? 'day' : (unit === 'week' ? 'week' : 'month') };
    }
    function series(B, rows, fn) {
        var out = B.list.map(function () { return 0; });
        rows.forEach(function (r) { var i = B.index(r.t); if (i >= 0 && i < out.length) out[i] += fn ? fn(r) : 1; });
        return out;
    }
    function distinctSeries(B, rows) {
        var sets = B.list.map(function () { return {}; });
        rows.forEach(function (r) { var i = B.index(r.t); if (i >= 0 && i < sets.length) sets[i][r.p] = 1; });
        return sets.map(function (s) { return Object.keys(s).length; });
    }

    /* ---------------- rendering: header, filters, KPIs ---------------- */

    function render() {
        if (!M) return;
        var Q = query();
        safe('filters', function () { renderFilterSummary(Q); });
        safe('header', function () { renderHeader(Q); });
        safe('kpis', function () { renderKpis(Q); });
        safe('profile', function () { renderProfile(Q); });
        safe('insights', function () { renderInsights(Q); });
        safe('engagement', function () { renderEngagement(Q); });
        safe('modules', function () { renderModules(Q); });
        safe('spotlight', function () { renderSpotlight(Q); });
        safe('newsletter', function () { renderNewsletter(Q); });
        safe('notices', function () { renderNotices(Q); });
        safe('readiness', function () { renderReadiness(Q); });
        safe('goals', function () { renderGoals(Q); });
        safe('staff', function () { renderStaff(Q); });
        lastWidth = document.documentElement.clientWidth;
    }

    /* Who a module is measured against: Hub users in the selection, or, for a cohort module, its cohort in the selection
     * (with a person or group filter on, only the cohort members it picks; without one, also those never seen on the Hub). */
    function population(Q, mm) {
        if (!mm.cohort) return Q.users;
        var picked = F.staff.length || F.tag;
        return Object.keys(mm.cohort).filter(function (e) { return Q.S[e] || (!picked && !M.people[e]); });
    }
    function spotStats(Q, id) {
        var done = 0, todo = [], openedOnly = 0, mm = MOD[id];
        population(Q, mm).forEach(function (e) {
            if (Q.doneBy[e] && Q.doneBy[e][id]) { done++; return; }
            todo.push(e);
            var o = M.opened[e + '|' + id];
            if (o && o < Q.R.tb) openedOnly++;
        });
        return { done: done, total: done + todo.length, todo: todo, openedOnly: openedOnly,
                 unit: mm.cohort ? 'assigned teachers' : 'Hub users' };
    }

    function issueReach(Q) {
        var best = null;
        M.issues.forEach(function (is) {
            var n = 0;
            Object.keys(Q.readers).forEach(function (e) { if (Q.readers[e][is.file]) n++; });
            if (!best || n > best.n) best = { issue: is, n: n };
        });
        return best;
    }

    function renderHeader(Q) {
        var R = Q.R, spot = MOD[VIEW.spot], sp = spotStats(Q, VIEW.spot);
        var parts = [];
        if (M.hasUsage) {
            parts.push(b(Q.activeList.length), ' ' + plural(Q.activeList.length, 'member of staff has', 'staff have') + ' used the Hub ' + rangeText(R) + '. ');
        } else {
            parts.push(b(Q.users.length), ' staff are known to the Hub. ');
        }
        if (sp.total) {
            parts.push(spot.title + ' is ', b(pct(sp.done, sp.total) + '%'), ' complete with ', b(sp.total - sp.done), ' staff still to finish');
            var best = M.hasUsage ? issueReach(Q) : null;
            if (best && best.n && Q.activeList.length) {
                parts.push(', and the best-read newsletter issue reached ', b(pct(best.n, Q.activeList.length) + '%'), ' of them.');
            } else parts.push('.');
        }
        rich($('lede'), parts);
        var gen = RAW && (RAW.usage && RAW.usage.generated_at || RAW.generated_at);
        var asof = gen ? new Date(Date.parse(gen)) : new Date(LOADED_AT || Date.now());
        var t = Math.floor(asof.getTime() / 1000);
        var note = 'Live from the Hub’s spreadsheet, as of ' + clock(t) + ' on ' + dyLabel(dayOf(t)) +
            ' (Abu Dhabi time). ';
        if (F.noTest && !F.staff.length) note += 'The AI team’s two test accounts (bbaki@ and hodai@) are left out everywhere, since most of their activity is testing. ';
        note += 'Hover any chart for its numbers; “Show the numbers” under a chart gives them as a table.';
        $('asof').textContent = note;
        $('banner-usage').hidden = M.hasUsage;
    }

    function renderFilterSummary(Q) {
        var box = $('f-sum');
        K.clear(box);
        var n = Object.keys(Q.S).length;
        box.appendChild(h('span', { text: 'Showing ' + fmt(n) + ' ' + plural(n, 'person', 'people') + ' · ' + rangeText(Q.R) +
            (F.tag ? ' · group “' + F.tag + '”' : '') }));
        F.staff.forEach(function (e) {
            var chip = h('span', { 'class': 'an-chip' }, [h('span', { text: nameOf(e) })]);
            var x = h('button', { type: 'button', 'aria-label': 'Remove ' + nameOf(e), text: '×' });
            x.addEventListener('click', function () { F.staff = F.staff.filter(function (s) { return s !== e; }); render(); });
            chip.appendChild(x);
            box.appendChild(chip);
        });
        if (F.staff.length > 1) {
            var clr = h('button', { type: 'button', 'class': 'an-linkbtn', text: 'Clear people' });
            clr.addEventListener('click', function () { F.staff = []; render(); });
            box.appendChild(clr);
        }
    }

    function delta(now, before, R) {
        if (!R.bounded || before === null) return null;
        if (!before && !now) return { cls: 'is-flat', text: 'no change' };
        if (!before) return { cls: 'is-up', text: '▲ new' };
        var d = Math.round((now - before) / before * 100);
        var span = R.days === 1 ? 'the day before' : 'the ' + R.days + ' days before';
        if (d === 0) return { cls: 'is-flat', text: '= ' + span };
        return { cls: d > 0 ? 'is-up' : 'is-down', text: (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + '% vs ' + span };
    }

    function renderKpis(Q) {
        var box = $('kpis');
        K.clear(box);
        var R = Q.R, B = buckets(R);
        var prev = R.bounded ? windowStats(Q.S, R.ta - (R.tb - R.ta), R.ta) : null;
        var active = Q.activeList.length;
        var five = Q.activeList.filter(function (e) { return Object.keys(Q.days[e] || {}).length >= 5; }).length;
        var mobile = Q.pv.filter(function (r) { return r.dev > 0; }).length;
        var readers = Object.keys(Q.readers).length;
        var spot = MOD[VIEW.spot], sp = spotStats(Q, VIEW.spot);
        var never = Object.keys(Q.S).filter(function (e) { var p = M.people[e]; return p.onRoster && p.first === Infinity; }).length;
        var tiles = [
            { hero: true, label: M.hasUsage ? 'Staff using the Hub' : 'Staff with a completion', value: fmt(active),
              sub: !M.hasUsage ? 'visits need the backend update' : (active ? pct(five, active) + '% came back on 5 or more days' : 'nobody in this selection'),
              spark: distinctSeries(B, Q.pv.concat(Q.ev)), d: prev && delta(active, prev.active, R) },
            { label: 'Page views', value: M.hasUsage ? fmt(Q.pv.length) : '—',
              sub: M.hasUsage ? (Q.pv.length ? pct(mobile, Q.pv.length) + '% on a phone or tablet' : 'none in this selection') : 'needs the backend update',
              spark: M.hasUsage ? series(B, Q.pv) : null, d: prev && M.hasUsage && delta(Q.pv.length, prev.views, R) },
            { label: 'PD modules finished', value: fmt(Q.doneIn.length),
              sub: active ? (Math.round(Q.doneIn.length / active * 10) / 10) + ' per active member of staff' : '',
              spark: series(B, Q.doneIn), d: prev && delta(Q.doneIn.length, prev.finished, R) },
            { gold: true, label: spot.short + ' complete', value: sp.total ? pct(sp.done, sp.total) + '%' : '—',
              sub: fmt(sp.done) + ' of ' + fmt(sp.total) + ' ' + sp.unit },
            { label: 'Newsletter readers', value: M.hasUsage ? fmt(readers) : '—',
              sub: M.hasUsage ? (active ? pct(readers, active) + '% of active staff opened an issue' : '') : 'needs the backend update',
              spark: M.hasUsage ? distinctSeries(B, Q.pv.filter(function (r) { return r.issue; })) : null,
              d: prev && M.hasUsage && delta(readers, prev.readers, R) },
            M.tags.length || never
                ? { label: 'Never opened the Hub', value: fmt(never), sub: 'on the roster, with no visit yet' }
                : { label: 'Sign-ins', value: M.hasUsage ? fmt(Q.si.length) : '—', sub: 'new sessions, one per device' }
        ];
        tiles.forEach(function (t) {
            var tile = h('div', { 'class': 'an-kpi' + (t.hero ? ' is-hero' : '') + (t.gold ? ' is-gold' : '') });
            tile.appendChild(h('div', { 'class': 'an-kpi-l', text: t.label }));
            tile.appendChild(h('div', { 'class': 'an-kpi-v', text: t.value }));
            tile.appendChild(h('div', { 'class': 'an-kpi-s', text: t.sub }));
            var foot = h('div', { 'class': 'an-kpi-f' });
            foot.appendChild(t.d ? h('span', { 'class': 'an-delta ' + t.d.cls, text: t.d.text }) : h('span'));
            if (t.spark && t.spark.length > 2) {
                var sp2 = h('span', { 'aria-hidden': 'true' });
                K.spark(sp2, t.spark, { width: 84, height: 24, color: t.hero ? '#ffffff' : C.purple });
                foot.appendChild(sp2);
            }
            tile.appendChild(foot);
            box.appendChild(tile);
        });
    }

    /* ---------------- one person on their own ---------------- */

    function renderProfile(Q) {
        var host = $('profile');
        if (F.staff.length !== 1) { host.hidden = true; K.clear(host); return; }
        var e = F.staff[0], p = M.people[e];
        if (!p) { host.hidden = true; return; }
        host.hidden = false;
        K.clear(host);
        var card = h('div', { 'class': 'an-card an-prof' });
        var head = h('div', { 'class': 'an-prof-h' });
        var who = h('div', null, [
            h('p', { 'class': 'an-eyebrow', text: 'One person' }),
            h('div', { 'class': 'an-prof-name', text: nameOf(e) }),
            h('div', { 'class': 'an-card-sub', text: e })
        ]);
        if (p.tags.length) {
            var tg = h('div', { style: 'margin-top:.35rem' });
            p.tags.forEach(function (t) { tg.appendChild(h('span', { 'class': 'an-tag', text: t })); });
            who.appendChild(tg);
        }
        head.appendChild(who);
        var back = h('button', { type: 'button', 'class': 'an-btn', text: '← Everyone' });
        back.addEventListener('click', function () { F.staff = []; render(); });
        head.appendChild(back);
        card.appendChild(head);

        var myPv = Q.pv;
        var dev = {};
        myPv.forEach(function (r) { dev[DEVICES[r.dev] || DEVICES[0]] = 1; });
        var issues = Object.keys(Q.readers[e] || {}).length;
        var mods = Object.keys(Q.doneBy[e] || {}).length;
        var stats = h('div', { 'class': 'an-stats', style: 'margin-top:1rem' });
        [
            [p.first === Infinity ? 'never' : tLabel(p.first), 'first seen on the Hub'],
            [p.last ? tLabel(p.last) : '—', 'last seen'],
            [fmt(Object.keys(Q.days[e] || {}).length), 'days active in these dates'],
            [M.hasUsage ? fmt(myPv.length) : '—', 'page views in these dates'],
            [mods + ' of ' + MODULES.length, 'modules finished by ' + dLabel(Q.R.b - 1)],
            [M.hasUsage ? fmt(issues) : '—', 'newsletter issues opened'],
            [Object.keys(dev).join(' + ') || '—', 'devices used']
        ].forEach(function (s) {
            stats.appendChild(h('div', null, [h('div', { 'class': 'an-stat-v', style: 'font-size:1.3rem', text: s[0] }), h('div', { 'class': 'an-stat-l', text: s[1] })]));
        });
        card.appendChild(stats);

        if (M.hasUsage) {
            card.appendChild(h('h3', { style: 'margin-top:1.25rem;font-size:.9rem', text: 'Days on the Hub' }));
            var cal = h('div', { style: 'margin-top:.5rem' });
            card.appendChild(cal);
            var start = mondayOf(Math.max(Q.R.a, Q.R.b - 7 * 53));
            var counts = {};
            Q.pv.forEach(function (r) { var d = dayOf(r.t); counts[d] = (counts[d] || 0) + 1; });
            var days = [];
            for (var d = start; d < Q.R.b; d++) days.push({ label: DF.wd.format(dateOfDay(d)), value: counts[d] || 0 });
            K.calendar(cal, { days: days, unit: 'page views' });
        }

        card.appendChild(h('h3', { style: 'margin-top:1.25rem;font-size:.9rem', text: 'Modules' }));
        var grid = h('div', { 'class': 'an-mods' });
        MODULES.forEach(function (mm) {
            var dt = (Q.doneBy[e] || {})[mm.id];
            var op = M.opened[e + '|' + mm.id];
            var cls = dt ? 'is-done' : (op && op < Q.R.tb ? 'is-open' : 'is-none');
            var mark = dt ? '✓' : (cls === 'is-open' ? '◐' : '·');
            var note = dt ? 'finished ' + tLabel(dt) : (cls === 'is-open' ? 'opened ' + tLabel(op) + ', not finished' : 'not opened');
            grid.appendChild(h('div', { 'class': 'an-mod ' + cls }, [h('i', { text: mark, 'aria-hidden': 'true' }),
                h('span', null, [mm.title + ' ', h('small', { text: note })])]));
        });
        card.appendChild(grid);

        if (M.hasUsage && myPv.length) {
            card.appendChild(h('h3', { style: 'margin-top:1.25rem;font-size:.9rem', text: 'Pages they open most' }));
            var top = h('div', { style: 'margin-top:.5rem' });
            card.appendChild(top);
            var byPage = {};
            myPv.forEach(function (r) { byPage[r.page] = (byPage[r.page] || 0) + 1; });
            K.rankBars(top, Object.keys(byPage).sort(function (a, c) { return byPage[c] - byPage[a]; }).slice(0, 8).map(function (pg) {
                return { label: M.titles[pg] || pg || 'Hub home', value: byPage[pg] };
            }));
        }
        var goal = M.survey && (M.survey.responses || []).filter(function (r) { return lower(r.email) === e; })[0];
        var ready = M.ready && M.ready.filter(function (r) { return lower(r.email) === e; })[0];
        if (goal || ready) {
            var extra = h('div', { 'class': 'an-needs' });
            var bits = [];
            if (goal) bits.push('Personal goal: ' + (goal.status === 'submitted' ? 'submitted' : 'draft') +
                (goal.data && goal.data.focus_area ? ', focus “' + goal.data.focus_area + '”' : '') + '.');
            if (ready) bits.push('AI Literacy readiness: ' + (ready.completed_at ? 'finished' : 'started') +
                ((ready.data && ready.data.lesson && String(ready.data.lesson.needs_before || '').trim()) ? ', and said they need something first' : '') + '.');
            extra.textContent = bits.join(' ');
            card.appendChild(extra);
        }
        host.appendChild(card);
    }

    /* ---------------- what is working / in the way ---------------- */

    function moduleFunnel(Q) {
        /* within the dates: who opened (or finished) each module, who finished */
        var out = {};
        MODULES.forEach(function (mm) { out[mm.id] = { opened: {}, finished: {} }; });
        Q.pv.forEach(function (r) { if (r.mod && applies(MOD[r.mod], r.p)) out[r.mod].opened[r.p] = 1; });
        Q.ev.forEach(function (r) { if (out[r.mod] && applies(MOD[r.mod], r.p)) out[r.mod].opened[r.p] = 1; });
        Q.doneIn.forEach(function (d) { if (applies(MOD[d.mod], d.p)) { out[d.mod].finished[d.p] = 1; out[d.mod].opened[d.p] = 1; } });
        Object.keys(out).forEach(function (id) {
            out[id].a = Object.keys(out[id].opened).length;
            out[id].b = Object.keys(out[id].finished).length;
        });
        return out;
    }

    function reminderNotices(id) {
        if (!M.notifs) return [];
        var mm = MOD[id];
        var keys = [mm.title.toLowerCase(), mm.short.toLowerCase()];
        return M.notifs.filter(function (n) {
            var t = String(n.title || '').toLowerCase();
            return /remind/.test(t) && keys.some(function (k) { return t.indexOf(k) !== -1; });
        });
    }

    function reminderEffect(id, n, S) {
        var t0 = isoSec(n.created_at);
        var targets = (n.target_emails || []).map(lower).filter(function (e) { return !S || S[e]; });
        var day = 0, week = 0, before = 0;
        targets.forEach(function (e) {
            var dt = M.doneKey[e + '|' + id];
            if (!dt) return;
            if (dt < t0) before++;
            else if (dt - t0 <= DAY) { day++; week++; }
            else if (dt - t0 <= 7 * DAY) week++;
        });
        return { t: t0, n: targets.length, day: day, week: week, before: before };
    }

    function renderInsights(Q) {
        var good = [], bad = [];
        var active = Q.activeList.length;
        var five = Q.activeList.filter(function (e) { return Object.keys(Q.days[e] || {}).length >= 5; }).length;
        if (M.hasUsage && five) good.push(['Staff return. ', b(five), ' staff have opened the Hub on five or more separate days.']);

        var fun = moduleFunnel(Q);
        var shares = MODULES.filter(function (mm) { return mm.file && fun[mm.id].a >= 5; })
            .map(function (mm) { return { m: mm, s: fun[mm.id].b / fun[mm.id].a }; });
        var allDone = Q.users.filter(function (e) {
            return MODULES.every(function (mm) { return !applies(mm, e) || (Q.doneBy[e] && Q.doneBy[e][mm.id]); });
        }).length;
        if (M.hasUsage && shares.length) {
            var med = Math.round(median(shares.map(function (x) { return x.s; })) * 100);
            if (med >= 70) good.push(['Modules get finished once opened. The typical module is finished by ', b(med + '%'),
                ' of the staff who open it', allDone ? [', and '].concat([b(allDone)], [' staff have finished every module that applies to them.']) : '.'].reduce(flat, []));
        }
        var bestRem = null;
        MODULES.forEach(function (mm) {
            reminderNotices(mm.id).forEach(function (n) {
                var t = isoSec(n.created_at);
                if (t < Q.R.ta || t >= Q.R.tb) return;
                var e = reminderEffect(mm.id, n, Q.S);
                if (e.n && (!bestRem || e.day > bestRem.e.day)) bestRem = { m: mm, e: e };
            });
        });
        if (bestRem && bestRem.e.day) good.push(['Reminders move people. ', b(bestRem.e.day), ' of the ', b(bestRem.e.n),
            ' staff reminded about ' + bestRem.m.title + ' finished it within a day.']);
        var reach = M.hasUsage ? issueReach(Q) : null;
        if (reach && reach.n) good.push(['The ', b(reach.issue.label), ' newsletter reached ', b(reach.n), ' staff, the most of any issue.']);
        var topMod = null;
        MODULES.forEach(function (mm) {
            var n = Q.doneIn.filter(function (d) { return d.mod === mm.id; }).length;
            if (n && (!topMod || n > topMod.n)) topMod = { m: mm, n: n };
        });
        if (topMod && good.length < 4) good.push([b(topMod.n), ' staff finished ' + topMod.m.title + ' ' + rangeText(Q.R) + ', more than any other module.']);

        var spot = MOD[VIEW.spot], sp = spotStats(Q, VIEW.spot);
        if (sp.total && sp.done < sp.total) bad.push([b(sp.total - sp.done), ' staff (', b(pct(sp.total - sp.done, sp.total) + '%'), ') still have not finished ' + spot.title + '.']);
        if (M.hasUsage && Q.users.length) {
            var none = 0, one = 0;
            Q.users.forEach(function (e) {
                var n = Object.keys(Q.readers[e] || {}).length;
                if (!n) none++; else if (n === 1) one++;
            });
            if (none > Q.users.length / 3 && Q.users.length >= 10) bad.push(['Newsletter reach is thin. ', b(none), ' Hub ' + plural(none, 'user has', 'users have') + ' never opened an issue ' + (F.range === 'all' ? '' : 'in these dates ') + 'and ', b(one), ' ' + plural(one, 'has', 'have') + ' opened only one.']);
        }
        if (M.ready) {
            var rr = readinessRows(Q);
            var need = rr.filter(function (r) { return !!needText(r); }).length;
            var low = shares.slice().sort(function (x, y) { return x.s - y.s; })[0];
            if (rr.length && need) bad.push([b(pct(need, rr.length) + '%'), ' of teachers on AI Literacy readiness said they need something before they can teach it.']);
            if (low && low.s < 0.8) bad.push([low.m.title + ' has the lowest finish rate, at ', { b: Math.round(low.s * 100) + '%', crit: true }, ' of the staff who open it.']);
        }
        var alerts = alertStats(Q);
        if (alerts && alerts.n) bad.push(['The “needs something” alert fired ', b(alerts.n), ' times from ', b(alerts.teachers),
            plural(alerts.teachers, ' teacher', ' teachers') + '. It sends again on every save.']);
        var notices = bellRows(Q);
        if (notices.length) {
            var bestShare = Math.max.apply(null, notices.map(function (n) { return n.recipient_count ? n.read_count / n.recipient_count : 0; }));
            if (bestShare < 0.5) bad.push(['In-Hub notices are barely opened: the best-read one reached ', b(Math.round(bestShare * 100) + '%'), ' of its recipients.']);
        }
        if (!M.dwellLegacy && M.dwell.length < 20) {
            var lastDw = Math.max.apply(null, M.dwell.map(function (r) { return isoSec(r.last_seen); }).concat([0]));
            bad.push(['Reading-time tracking holds only ', b(M.dwell.length), plural(M.dwell.length, ' row', ' rows') +
                (lastDw ? ', the last on ' + tLabel(lastDw) : '') + ', so time spent in modules can’t be judged yet.']);
        }
        var never = Object.keys(Q.S).filter(function (e) { var p = M.people[e]; return p.onRoster && p.first === Infinity; }).length;
        if (never) bad.push([b(never), ' ' + plural(never, 'person', 'people') + ' on the roster ' + plural(never, 'has', 'have') + ' never opened the Hub.']);

        fill($('ins-good'), good, 'Nothing stands out yet for this selection.');
        fill($('ins-bad'), bad, 'Nothing stands out for this selection.');
        function fill(ul, items, emptyText) {
            K.clear(ul);
            if (!items.length) { ul.appendChild(h('li', { text: emptyText })); return; }
            items.slice(0, 5).forEach(function (parts) { var li = h('li'); rich(li, parts); ul.appendChild(li); });
        }
    }
    function flat(a, x) { return a.concat(x); }

    /* ---------------- engagement ---------------- */

    function renderEngagement(Q) {
        var B = buckets(Q.R);
        /* Without page views there is nothing to draw here: say so once. */
        Array.prototype.forEach.call(document.querySelectorAll('#engagement .an-card, #engagement .an-grid2'), function (el) { el.hidden = !M.hasUsage; });
        if (!M.hasUsage) {
            $('eng-lede').textContent = 'This part needs the backend update (see the note at the top): it is drawn from every page view.';
            return;
        }
        /* lede */
        var secCount = {};
        Q.pv.forEach(function (r) { secCount[r.sec] = (secCount[r.sec] || 0) + 1; });
        var secs = Object.keys(secCount).sort(function (a, c) { return secCount[c] - secCount[a]; });
        var staffSeries = distinctSeries(B, Q.pv.concat(Q.ev));
        var peakI = staffSeries.indexOf(Math.max.apply(null, staffSeries.concat([0])));
        var lede = [];
        if (Q.pv.length) {
            if (B.list.length > 2 && staffSeries[peakI]) lede.push('The busiest ' + B.noun + ' was ', b(B.list[peakI].title.replace(/^Week of /, 'the week of ')), ', with ', b(staffSeries[peakI]), ' staff. ');
            if (secs.length) lede.push(secs[0] + ' take ', b(pct(secCount[secs[0]], Q.pv.length) + '%'), ' of page views');
            var quiet = secs.filter(function (s) { return s !== 'Admin pages' && s !== 'Other'; }).slice(-2);
            if (secs.length > 4 && quiet.length === 2) lede.push('; ' + quiet[0] + ' and ' + quiet[1] + ' are the least opened');
            lede.push('.');
        } else lede.push('No page views in this selection.');
        rich($('eng-lede'), lede);

        /* activity: staff / views / new, with modules finished underneath */
        var measure = VIEW.act;
        var top, name, peak;
        if (measure === 'views') { top = series(B, Q.pv); name = 'page views'; }
        else if (measure === 'new') {
            var firstIn = Q.activeList.filter(function (e) { var f = M.people[e].first; return f >= Q.R.ta && f < Q.R.tb; })
                .map(function (e) { return { t: M.people[e].first, p: e }; });
            top = series(B, firstIn); name = 'staff on the Hub for the first time';
        } else { top = staffSeries; name = 'staff who opened the Hub'; }
        peak = function (i, v) { return fmt(v) + (measure === 'views' ? ' views' : ' staff') + ', ' + B.list[i].title.replace(/^Week of /, 'week of '); };
        $('act-title').textContent = { staff: 'Staff active each ', views: 'Page views each ', 'new': 'New staff each ' }[measure] + B.noun;
        $('act-sub').textContent = 'Top: ' + name + ' that ' + B.noun + '. Bottom: PD modules finished that ' + B.noun + '.' +
            (B.unit === 'week' ? ' Weeks start on Monday.' : '');
        var finished = series(B, Q.doneIn);
        K.trend($('c-activity'), {
            label: name + ' per ' + B.noun,
            labels: B.list.map(function (x) { return x.label; }),
            titles: B.list.map(function (x) { return x.title; }),
            panels: [
                { kind: 'line', name: name, values: top, color: C.purple, area: true, height: 170, peak: peak },
                { kind: 'bars', name: 'PD modules finished', values: finished, color: C.gold, height: 70, title: 'PD modules finished', ticks: 2 }
            ]
        });
        K.tableView($('c-activity'), [B.noun === 'week' ? 'Week of' : (B.noun === 'day' ? 'Day' : 'Month'), name, 'Modules finished'],
            B.list.map(function (x, i) { return [x.label, fmt(top[i]), fmt(finished[i])]; }));

        /* weekday × hour */
        var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        var grid = DAYS.map(function () { return Array(24).fill(0); });
        Q.pv.forEach(function (r) { grid[(weekdayOf(dayOf(r.t)) + 6) % 7][hourOf(r.t)]++; });
        K.heat($('c-busy'), {
            rowLabels: DAYS, colLabels: Array.apply(null, Array(24)).map(function (_, i) { return (i % 12 || 12) + (i < 12 ? 'am' : 'pm'); }),
            values: grid, unit: 'page views', colEvery: 3,
            tip: function (r, c, v) { return { title: DAYS[r] + ' · ' + hourLabel(c), rows: [{ v: fmt(v), l: 'page views' }] }; }
        });
        K.tableView($('c-busy'), ['Day'].concat(Array.apply(null, Array(24)).map(function (_, i) { return i + 'h'; })),
            grid.map(function (row, i) { return [DAYS[i]].concat(row.map(String)); }));

        /* where page views go */
        var activeSec = VIEW.section && secCount[VIEW.section] ? VIEW.section : '';
        K.treemap($('c-tree'), {
            items: secs.map(function (s) { return { name: s, value: secCount[s] }; }),
            height: 280, active: activeSec,
            onClick: function (it) { VIEW.section = VIEW.section === it.name ? '' : it.name; renderEngagement(query()); }
        });
        var byPage = {}, pageStaff = {};
        Q.pv.forEach(function (r) {
            if (activeSec && r.sec !== activeSec) return;
            byPage[r.page] = (byPage[r.page] || 0) + 1;
            (pageStaff[r.page] = pageStaff[r.page] || {})[r.p] = 1;
        });
        var topPages = Object.keys(byPage).sort(function (a, c) { return byPage[c] - byPage[a]; });
        $('pages-title').textContent = activeSec ? 'Most-viewed pages in ' + activeSec + ' (click the block again for all)' : 'Most-viewed pages';
        K.rankBars($('c-pages'), topPages.slice(0, 10).map(function (pg) {
            var n = Object.keys(pageStaff[pg]).length;
            return { label: M.titles[pg] || pg || 'Hub home', value: byPage[pg], valueText: fmt(byPage[pg]) + ' · ' + fmt(n) + ' staff',
                     tip: { title: pg || 'index.html', rows: [{ v: fmt(byPage[pg]), l: 'page views' }, { v: fmt(n), l: 'different staff' }] } };
        }));
        K.tableView($('c-pages'), ['Page', 'Views', 'Staff'], topPages.map(function (pg) {
            return [M.titles[pg] || pg || 'Hub home', fmt(byPage[pg]), fmt(Object.keys(pageStaff[pg]).length)];
        }), { summary: 'Show every page' });

        /* devices, per person */
        var used = {};
        Q.pv.forEach(function (r) { (used[r.p] = used[r.p] || {})[r.dev > 0 ? 'm' : 'd'] = 1; });
        var dOnly = 0, both = 0, mOnly = 0;
        Object.keys(used).forEach(function (e) {
            var u = used[e];
            if (u.d && u.m) both++; else if (u.m) mOnly++; else dOnly++;
        });
        K.donut($('c-devices'), {
            label: 'Staff by the devices they use', size: 200,
            parts: [
                { name: 'Laptop or desktop only', value: dOnly, color: CAT[0] },
                { name: 'Both', value: both, color: CAT[1] },
                { name: 'Phone or tablet only', value: mOnly, color: CAT[2] }
            ],
            center: fmt(dOnly + both + mOnly), centerSub: 'staff'
        });
        var bands = [['1 day', 1, 1], ['2 days', 2, 2], ['3–4 days', 3, 4], ['5–9 days', 5, 9], ['10 or more days', 10, Infinity]];
        var counts = bands.map(function (bd) {
            return Q.activeList.filter(function (e) { var n = Object.keys(Q.days[e] || {}).length; return n >= bd[1] && n <= bd[2]; }).length;
        });
        K.rankBars($('c-days'), bands.map(function (bd, i) {
            return { label: bd[0], value: counts[i], valueText: fmt(counts[i]) + ' staff' };
        }));

        /* tagged clicks */
        var cl = {}, clStaff = {};
        Q.ck.forEach(function (r) { cl[r.label] = (cl[r.label] || 0) + 1; (clStaff[r.label] = clStaff[r.label] || {})[r.p] = 1; });
        var labels = Object.keys(cl).sort(function (a, c) { return cl[c] - cl[a]; });
        K.rankBars($('c-clicks'), labels.slice(0, 12).map(function (l) {
            return { label: l.replace(/:/g, ' › '), value: cl[l], valueText: fmt(cl[l]) + ' · ' + fmt(Object.keys(clStaff[l]).length), color: CAT[0] };
        }), { empty: 'No tagged clicks in this selection.' });
        K.tableView($('c-clicks'), ['Label', 'Clicks', 'Staff'], labels.map(function (l) {
            return [l, fmt(cl[l]), fmt(Object.keys(clStaff[l]).length)];
        }), { summary: 'Show every label' });

        /* arrivals by section */
        var bySec = {};
        Q.pv.forEach(function (r) {
            var row = bySec[r.sec] = bySec[r.sec] || { hub: 0, gmail: 0, direct: 0, other: 0 };
            row[r.ref]++;
        });
        var arriveRows = secs.slice(0, 7).map(function (s) {
            var r = bySec[s];
            return { label: s, parts: [r.hub, r.gmail, r.direct, r.other] };
        });
        K.stack100($('c-arrive'), arriveRows, SOURCES, { unit: 'page views' });
        K.tableView($('c-arrive'), ['Part of the Hub'].concat(SOURCES.map(function (s2) { return s2.name; })),
            arriveRows.map(function (r) { return [r.label].concat(r.parts.map(fmt)); }));
    }

    /* ---------------- PD modules ---------------- */

    function renderModules(Q) {
        var fun = moduleFunnel(Q);
        var rows = MODULES.map(function (mm) {
            var a = mm.file || M.hasUsage === false ? fun[mm.id].a : null;
            var share = (a && mm.file && M.hasUsage) ? fun[mm.id].b / a : null;
            return { mm: mm, a: M.hasUsage && mm.file ? fun[mm.id].a : null, b: fun[mm.id].b, share: share };
        });
        var eligible = rows.filter(function (r) { return r.share !== null && r.a >= 5; });
        var low = eligible.slice().sort(function (x, y) { return x.share - y.share; })[0];
        var groups = GROUPS.map(function (g) {
            return { name: g.name, rows: rows.filter(function (r) { return r.mm.group === g.id; })
                .sort(function (x, y) { return (y.a || y.b) - (x.a || x.b); })
                .map(function (r) {
                    return { label: r.mm.title, a: r.a, b: r.b, highlight: low && r === low,
                             shareText: r.share === null ? 'n/a' : Math.round(r.share * 100) + '%',
                             note: r.a === null ? (M.hasUsage ? 'No page of its own to count openings from.' : 'Openings need the backend update.') : null };
                }) };
        });
        K.dumbbell($('c-dumbbell'), { label: 'Opened and finished, per module', groups: groups });
        K.tableView($('c-dumbbell'), ['Module', 'Opened', 'Finished', 'Share finished'], rows.map(function (r) {
            return [r.mm.title, r.a === null ? 'n/a' : fmt(r.a), fmt(r.b), r.share === null ? 'n/a' : Math.round(r.share * 100) + '%'];
        }));
        var lede = [];
        if (M.hasUsage && eligible.length) {
            var med = Math.round(median(eligible.map(function (r) { return r.share; })) * 100);
            lede.push('Half the modules are finished by ', b(med + '%'), ' or more of the staff who open them. ');
            if (low) lede.push(low.mm.title + ' loses the most, at ', { b: Math.round(low.share * 100) + '%', crit: true }, '. ');
        }
        lede.push(F.range === 'all' ? 'Counted over everything the Hub has recorded.' : 'Counted for ' + rangeText(Q.R) + ': opened or finished in these dates.');
        if (M.hasUsage) lede.push(' ' + MOD['success-criteria'].title + ' has no page of its own, so only its finishers show.');
        rich($('mod-lede'), lede);

        /* modules per person, by the end of the range */
        var dist = MODULES.map(function () { return 0; }).concat([0]);
        Q.users.forEach(function (e) { dist[Object.keys(Q.doneBy[e] || {}).length]++; });
        $('lolli-sub').textContent = 'Every Hub user in the selection, by modules finished by ' + dyLabel(Q.R.b - 1) +
            '. The gold stem on the right is staff who have done all ' + MODULES.length + '.';
        K.lollipop($('c-lolli'), {
            label: 'Staff by number of modules finished', xTitle: 'Modules finished',
            data: dist.map(function (v, i) {
                return { label: String(i), value: v, color: i === 0 ? C.lav : (i === MODULES.length ? C.gold : C.purple),
                         tip: { title: i + ' ' + plural(i, 'module') + ' finished', rows: [{ v: fmt(v), l: 'staff' }] } };
            })
        });
        K.tableView($('c-lolli'), ['Modules finished', 'Staff'], dist.map(function (v, i) { return [String(i), fmt(v)]; }));

        /* over time, by group: modules, or the PD hours they carry */
        var B = buckets(Q.R);
        var asHours = VIEW.modMeasure === 'hours';
        var weigh = asHours ? function (d) { return MOD[d.mod].hours || 0; } : null;
        var gseries = GROUPS.map(function (g) {
            return { name: g.name, color: g.color, values: series(B, Q.doneIn.filter(function (d) { return MOD[d.mod].group === g.id; }), weigh) };
        });
        var totalHours = Q.doneIn.reduce(function (a, d) { return a + (MOD[d.mod].hours || 0); }, 0);
        $('mod-time-sub').textContent = asHours
            ? fmt1(totalHours) + ' PD hours earned ' + rangeText(Q.R) + ', ' +
              (Q.activeList.length ? fmt1(totalHours / Q.activeList.length) + ' per active member of staff' : 'by nobody active') + '. By the kind of module.'
            : fmt(Q.doneIn.length) + ' first completions ' + rangeText(Q.R) + ', by the kind of module.';
        if (!Q.doneIn.length) K.empty($('c-mod-time'), 'No modules finished in these dates.');
        else K.trend($('c-mod-time'), {
            label: (asHours ? 'PD hours earned' : 'Modules finished') + ' per ' + B.noun + ', by kind',
            labels: B.list.map(function (x) { return x.label; }), titles: B.list.map(function (x) { return x.title; }),
            panels: [{ kind: 'stack', series: gseries, height: 190, fmt: asHours ? function (v) { return fmt1(v) + ' h'; } : fmt }],
            legend: GROUPS.map(function (g) { return { name: g.name, color: g.color }; })
        });
        K.tableView($('c-mod-time'), [B.noun].concat(GROUPS.map(function (g) { return g.name; })),
            B.list.map(function (x, i) { return [x.label].concat(gseries.map(function (s2) { return asHours ? fmt1(s2.values[i]) : fmt(s2.values[i]); })); }));

        /* reading time */
        var dw = M.dwell.filter(function (r) {
            var t = isoSec(r.last_seen);
            return Q.S[lower(r.email)] && MOD[r.module_id] && (!t || (t >= Q.R.ta && t < Q.R.tb));
        });
        if (M.dwellLegacy) K.empty($('c-dwell'), 'The dwell tab still has its old layout: run migrateDwellToPerModule() once in the Apps Script editor.');
        else if (!dw.length) K.empty($('c-dwell'), 'No reading time recorded for this selection. The tracker holds ' + fmt(M.dwell.length) + ' rows in all.');
        else {
            var byMod = {};
            dw.forEach(function (r) { (byMod[r.module_id] = byMod[r.module_id] || []).push(r.total_seconds / 60); });
            var mrows = Object.keys(byMod).map(function (id) { return { id: id, med: median(byMod[id]), n: byMod[id].length }; })
                .sort(function (x, y) { return y.med - x.med; });
            K.rankBars($('c-dwell'), mrows.map(function (r) {
                return { label: MOD[r.id].title, value: r.med, valueText: fmt1(r.med) + ' min · ' + r.n + ' ' + plural(r.n, 'reader') };
            }));
            K.tableView($('c-dwell'), ['Module', 'Median minutes', 'Readers'], mrows.map(function (r) { return [MOD[r.id].title, fmt1(r.med), String(r.n)]; }));
        }
    }

    /* ---------------- module spotlight ---------------- */

    function renderSpotlight(Q) {
        var pick = $('spot-pick');
        if (!pick.options.length) {
            GROUPS.forEach(function (g) {
                var og = h('optgroup', { label: g.name });
                MODULES.filter(function (mm) { return mm.group === g.id; }).forEach(function (mm) { og.appendChild(h('option', { value: mm.id, text: mm.title })); });
                pick.appendChild(og);
            });
        }
        pick.value = VIEW.spot;
        var mm = MOD[VIEW.spot], id = mm.id;
        var sp = spotStats(Q, id);
        $('spot-title').textContent = mm.title + ': who has finished';

        var mine = Q.doneIn.filter(function (d) { return d.mod === id; });
        var speeds = [];
        mine.forEach(function (d) {
            var o = M.opened[d.p + '|' + id];
            var pvOpen = null;
            /* the first view of the module's page, if earlier than any event */
            if (o !== undefined && o <= d.t) pvOpen = o;
            if (pvOpen !== null) speeds.push(d.t - pvOpen);
        });
        var quick = speeds.filter(function (x) { return x < 300; }).length;
        var medMin = speeds.length ? Math.round(median(speeds) / 60) : null;
        var lede = [b(sp.done), ' of the ', b(sp.total), ' ' + sp.unit + ' in this selection have finished ' + mm.title];
        lede.push(sp.total ? [' (', b(pct(sp.done, sp.total) + '%'), ').'] : '.');
        if (mine.length && F.range !== 'all') lede.push([' ', b(mine.length), ' of them finished ' + rangeText(Q.R) + '.']);
        if (medMin !== null && speeds.length >= 5) lede.push([' Half of finishers took ', b(medMin <= 1 ? 'a minute' : medMin + ' minutes'), ' or less from opening the course to finishing it',
            quick / speeds.length > 0.3 ? ', so check it can’t be clicked through without reading.' : '.']);
        rich($('spot-lede'), lede.reduce(flat, []));

        $('spot-donut-sub').textContent = sp.openedOnly ? fmt(sp.openedOnly) + ' opened it but have not finished.'
            : (mm.cohort ? 'Of the ' + fmt(sp.total) + ' teachers it is assigned to.' : 'Of every Hub user in the selection.');
        K.donut($('c-spot-donut'), {
            label: mm.title + ' completion', size: 230,
            parts: [{ name: 'Finished', value: sp.done, color: C.purple }, { name: 'Still to finish', value: sp.total - sp.done, color: C.gold }],
            center: sp.total ? pct(sp.done, sp.total) + '%' : '—', centerSub: fmt(sp.done) + ' of ' + fmt(sp.total) + ' staff'
        });

        /* by day, with the running total underneath */
        var R = Q.R;
        var dayR = { a: Math.max(R.a, mine.length ? dayOf(Math.min.apply(null, mine.map(function (d) { return d.t; }))) : R.a), b: R.b };
        dayR.days = dayR.b - dayR.a; dayR.ta = dayStart(dayR.a); dayR.tb = dayStart(dayR.b);
        var B = buckets(dayR);
        var per = series(B, mine);
        var before = M.done.filter(function (d) { return d.mod === id && Q.S[d.p] && d.t < dayR.ta; }).length;
        var run = [], acc = before;
        per.forEach(function (v) { acc += v; run.push(acc); });
        var rems = reminderNotices(id);
        var markers = rems.map(function (n) {
            var t = isoSec(n.created_at);
            return { index: B.index(t), label: 'Reminder', note: 'Reminder sent ' + DF.wd.format(dateOfDay(dayOf(t))) + ': ' + n.title };
        }).filter(function (mk) { return mk.index >= 0 && mk.index < B.list.length; });
        if (!mine.length) K.empty($('c-spot-days'), 'Nobody in this selection finished it in these dates.');
        else K.trend($('c-spot-days'), {
            label: 'Completions per ' + B.noun,
            labels: B.list.map(function (x) { return x.label; }), titles: B.list.map(function (x) { return x.title; }),
            markers: markers,
            panels: [
                { kind: 'bars', name: 'finished that ' + B.noun, values: per, color: C.purple, height: 150 },
                { kind: 'line', name: 'running total', values: run, color: C.gold, height: 70, title: 'Running total', ticks: 2 }
            ]
        });
        K.tableView($('c-spot-days'), [B.noun, 'Finished', 'Running total'], B.list.map(function (x, i) { return [x.label, fmt(per[i]), fmt(run[i])]; }));

        /* opening to finishing */
        var bins = [['Under 5 min', 0, 300], ['5–10 min', 300, 600], ['10–30 min', 600, 1800], ['30–60 min', 1800, 3600], ['1–24 hours', 3600, DAY], ['Over a day', DAY, Infinity]];
        var binN = bins.map(function (bn) { return speeds.filter(function (x) { return x >= bn[1] && x < bn[2]; }).length; });
        $('spot-speed-sub').textContent = speeds.length
            ? pct(binN[0] + binN[1], speeds.length) + '% finished within 10 minutes of first opening it.' +
              (M.hasUsage ? '' : ' Openings need the backend update.')
            : 'Needs a recorded opening and a finish in these dates.';
        K.columns($('c-spot-speed'), {
            label: 'Time from opening to finishing', height: 200,
            data: bins.map(function (bn, i) {
                return { label: bn[0], value: binN[i], color: i === 0 ? C.gold : C.purple,
                         tip: { title: bn[0], rows: [{ v: fmt(binN[i]), l: 'staff', c: i === 0 ? C.gold : C.purple }] } };
            }),
            empty: 'No openings and finishes to compare in these dates.'
        });
        if (!speeds.length) K.empty($('c-spot-speed'), 'No openings and finishes to compare in these dates.');
        else K.tableView($('c-spot-speed'), ['Time taken', 'Staff'], bins.map(function (bn, i) { return [bn[0], fmt(binN[i])]; }));

        /* the clock */
        var hours = Array(24).fill(0);
        mine.forEach(function (d) { hours[hourOf(d.t)]++; });
        var topH = hours.map(function (v, i) { return [v, i]; }).filter(function (x) { return x[0]; })
            .sort(function (x, y) { return y[0] - x[0]; }).slice(0, 3).map(function (x) { return x[1]; });
        K.radial($('c-spot-clock'), { values: hours, highlight: topH, hourLabel: hourLabel, unit: 'completions', label: 'Completions by hour of the day' });
        K.tableView($('c-spot-clock'), ['Hour', 'Completions'], hours.map(function (v, i) { return [hourLabel(i), fmt(v)]; }));

        /* still to finish */
        var lastOf = function (e) { return (M.people[e] || {}).last || 0; };
        var todo = sp.todo.slice().sort(function (x, y) { return lastOf(y) - lastOf(x); });
        $('spot-todo-sub').textContent = todo.length ? fmt(todo.length) + ' ' + (mm.cohort ? plural(todo.length, 'assigned teacher') : 'Hub ' + plural(todo.length, 'user')) + ' in the selection, most recently active first.' : 'Everyone in the selection has finished it.';
        var list = h('ul', { 'class': 'an-list' });
        todo.forEach(function (e) {
            var o = M.opened[e + '|' + id];
            var li = h('li');
            var nm;
            if (M.people[e]) {
                nm = h('button', { type: 'button', 'class': 'an-linkbtn', text: nameOf(e) });
                nm.addEventListener('click', function () { focusPerson(e); });
            } else nm = h('span', { text: nameOf(e) });   // never on the Hub: nothing to drill into
            li.appendChild(h('span', null, [nm]));
            li.appendChild(h('span', { text: (o && o < Q.R.tb ? 'opened ' + tLabel(o) + ' · ' : '') + (M.people[e] ? 'last seen ' + tLabel(M.people[e].last) : 'never opened the Hub') }));
            list.appendChild(li);
        });
        var todoHost = $('spot-todo');
        K.clear(todoHost);
        if (todo.length) todoHost.appendChild(list);
        $('spot-copy').disabled = !todo.length;
        $('spot-copy').onclick = function () { copy(todo.join(', '), $('spot-copy')); };

        /* reminders */
        var remHost = $('spot-reminders');
        K.clear(remHost);
        var withList = rems.filter(function (n) { return (n.target_emails || []).length; });
        if (!M.notifs) { K.empty(remHost, 'Notice data needs the backend update.'); return; }
        if (!withList.length) { K.empty(remHost, 'No reminder about this module was sent to a named list. Reminders from the admin dashboard’s “Remind outstanding” button are.'); return; }
        var table = h('table', { 'class': 'an-tbl' });
        table.appendChild(h('thead', null, [h('tr', null, ['Sent', 'Reminded', 'Finished within a day', 'Within a week'].map(function (c2, i) {
            return h('th', { text: c2, 'class': i ? 'num' : null });
        }))]));
        var tb = h('tbody');
        withList.sort(function (x, y) { return isoSec(y.created_at) - isoSec(x.created_at); }).forEach(function (n) {
            var ef = reminderEffect(id, n, Q.S);
            tb.appendChild(h('tr', null, [
                h('td', null, [tLabel(ef.t), h('small', { text: n.title })]),
                h('td', { 'class': 'num', text: fmt(ef.n) }),
                h('td', { 'class': 'num', text: fmt(ef.day) + (ef.n ? ' (' + pct(ef.day, ef.n) + '%)' : '') }),
                h('td', { 'class': 'num', text: fmt(ef.week) + (ef.n ? ' (' + pct(ef.week, ef.n) + '%)' : '') })
            ]));
        });
        table.appendChild(tb);
        remHost.appendChild(h('div', { 'class': 'an-tbl-wrap' }, [table]));
    }

    /* ---------------- newsletter ---------------- */

    function renderNewsletter(Q) {
        Array.prototype.forEach.call(document.querySelectorAll('#newsletter .an-grid2'), function (el) { el.hidden = !M.hasUsage; });
        if (!M.hasUsage) {
            $('news-lede').textContent = 'Readership comes from page views, which arrive with the backend update (see the note at the top).';
            return;
        }
        var active = Q.activeList.length;
        var startDay = M.pvStart ? dayOf(M.pvStart) : Infinity;
        var latest = M.issues[M.issues.length - 1];
        var counts = M.issues.map(function (is) {
            var n = 0;
            Object.keys(Q.readers).forEach(function (e) { if (Q.readers[e][is.file]) n++; });
            return n;
        });
        var readers = Object.keys(Q.readers).length;
        $('news-bars-sub').textContent = 'Share of active staff under each count. ' +
            (M.issues.some(function (is) { return is.day < startDay; }) ? 'Issues before ' + dLabel(startDay) + ', when page tracking began, are undercounted. ' : '') +
            'The latest issue may still be gathering readers.';
        var show = M.issues.map(function (is, i) { return { is: is, n: counts[i] }; })
            .filter(function (x) { return x.n || x.is.day >= startDay; });
        K.columns($('c-news-bars'), {
            label: 'Staff who opened each issue', height: 240,
            data: show.map(function (x) {
                var pre = x.is.day < startDay, last = x.is === latest;
                return { label: x.is.label, sub: pre ? 'before tracking' : (last ? 'latest' : (x.is.no ? 'No. ' + x.is.no : '')),
                         value: x.n, subText: active ? pct(x.n, active) + '% of staff' : '',
                         color: pre ? C.lav : (last ? C.gold : C.purple),
                         tip: { title: 'The Digital Lion · ' + x.is.label + (x.is.no ? ' (Issue No. ' + x.is.no + ')' : ''),
                                rows: [{ v: fmt(x.n), l: 'staff opened it' }, { v: pct(x.n, active) + '%', l: 'of active staff' }] } };
            })
        });
        K.tableView($('c-news-bars'), ['Issue', 'Came out', 'Staff who opened it', 'Share of active staff'], show.map(function (x) {
            return [x.is.label + (x.is.no ? ' (No. ' + x.is.no + ')' : ''), dyLabel(x.is.day), fmt(x.n), pct(x.n, active) + '%'];
        }));

        /* first two weeks: people scope only, not the date range */
        var today = dayOf(nowSec());
        var tracked = M.issues.filter(function (is) { return is.day >= startDay - 1; }).slice(-4);
        var firsts = {};
        M.pv.forEach(function (r) {
            if (!r.issue || !Q.S[r.p]) return;
            var k = r.issue + '|' + r.p;
            if (!(k in firsts) || r.t < firsts[k]) firsts[k] = r.t;
        });
        var lineSeries = tracked.map(function (is, i) {
            var vals = [];
            for (var d = 0; d <= 14; d++) {
                if (is.day + d > today) { vals.push(null); continue; }
                var end = dayStart(is.day + d + 1), n = 0;
                Object.keys(firsts).forEach(function (k) { if (k.indexOf(is.file + '|') === 0 && firsts[k] < end) n++; });
                vals.push(n);
            }
            var lastVal = vals.filter(function (v) { return v !== null; }).pop();
            return { name: is.label, color: CAT[i % CAT.length], values: vals, endLabel: is.label + ' · ' + fmt(lastVal || 0) };
        });
        K.lines($('c-news-lines'), {
            label: 'Readers in the first two weeks', series: lineSeries, height: 240,
            xLabel: function (i) { return i === 0 ? 'Day 0' : String(i); }, xTitle: function (i) { return 'Day ' + i + ' after it came out'; },
            empty: 'No tracked issue has readers in this selection.'
        });
        K.tableView($('c-news-lines'), ['Days since it came out'].concat(lineSeries.map(function (s2) { return s2.name; })),
            Array.apply(null, Array(15)).map(function (_, d) { return [String(d)].concat(lineSeries.map(function (s2) { return s2.values[d] === null ? '' : fmt(s2.values[d]); })); }));

        /* where readers came from */
        var src = {};
        Q.pv.forEach(function (r) {
            if (!r.issue) return;
            var row = src[r.issue] = src[r.issue] || { hub: 0, gmail: 0, direct: 0, other: 0 };
            row[r.ref]++;
        });
        var srcRows = M.issues.filter(function (is) { return src[is.file]; }).map(function (is) {
            var r = src[is.file];
            return { label: is.label, parts: [r.hub, r.gmail, r.direct, r.other] };
        });
        K.stack100($('c-news-src'), srcRows, SOURCES, { unit: 'page views', empty: 'No issue page views in this selection.' });
        K.tableView($('c-news-src'), ['Issue'].concat(SOURCES.map(function (s2) { return s2.name; })),
            srcRows.map(function (r) { return [r.label].concat(r.parts.map(fmt)); }));

        /* waffle */
        var buckets2 = [[], [], [], []];
        Q.users.forEach(function (e) {
            var n = Object.keys(Q.readers[e] || {}).length;
            buckets2[Math.min(3, n)].push(nameOf(e));
        });
        K.waffle($('c-news-waffle'), { groups: [
            { name: 'None', count: buckets2[0].length, color: '#e7e3f4', people: buckets2[0] },
            { name: '1 issue', count: buckets2[1].length, color: K.ramp(0.35), people: buckets2[1] },
            { name: '2 issues', count: buckets2[2].length, color: K.ramp(0.65), people: buckets2[2] },
            { name: '3 or more', count: buckets2[3].length, color: C.purple, people: buckets2[3] }
        ] });

        rich($('news-lede'), readers
            ? [b(readers), ' of the ', b(active), ' staff active ' + rangeText(Q.R) + ' opened at least one issue. ',
               'Readership arrives in a burst: most readers open an issue in its first few days, then it flattens. ',
               'Hover the squares to see who has and hasn’t read.']
            : ['Nobody in this selection opened an issue in these dates.']);
    }

    /* ---------------- notices ---------------- */

    function bellRows(Q) {
        if (!M.notifs) return [];
        return M.notifs.filter(function (n) {
            var t = isoSec(n.created_at);
            return !/^module request/i.test(n.title || '') && (n.recipient_count || 0) >= 5 && t >= Q.R.ta && t < Q.R.tb;
        }).sort(function (x, y) { return isoSec(y.created_at) - isoSec(x.created_at); });
    }
    function alertStats(Q) {
        if (!M.notifs) return null;
        var list = M.notifs.filter(function (n) {
            var t = isoSec(n.created_at);
            return /^module request/i.test(n.title || '') && t >= Q.R.ta && t < Q.R.tb;
        });
        var by = {};
        list.forEach(function (n) { var k = n.author_name || '?'; by[k] = (by[k] || 0) + 1; });
        var teachers = Object.keys(by).length;
        return { n: list.length, teachers: teachers, max: teachers ? Math.max.apply(null, Object.keys(by).map(function (k) { return by[k]; })) : 0,
                 inbox: list.reduce(function (a, n) { return a + (n.recipient_count || 0); }, 0),
                 read: list.reduce(function (a, n) { return a + (n.read_count || 0); }, 0) };
    }

    function renderNotices(Q) {
        var host = $('c-bell');
        K.clear(host);
        if (!M.notifs) {
            K.empty(host, 'Notice data needs the backend update.');
            K.clear($('c-alerts')); K.clear($('c-health'));
            $('bell-lede').textContent = '';
            return;
        }
        var rows = bellRows(Q);
        if (!rows.length) K.empty(host, 'No notices to five or more people in these dates.');
        else {
            var table = h('table', { 'class': 'an-tbl' });
            table.appendChild(h('thead', null, [h('tr', null, ['Notice', 'Sent', 'Recipients', 'Opened', 'Share opened'].map(function (c2, i) {
                return h('th', { text: c2, 'class': i >= 2 && i < 4 ? 'num' : null });
            }))]));
            var tb = h('tbody');
            rows.forEach(function (n) {
                var share = n.recipient_count ? n.read_count / n.recipient_count : 0;
                var meter = h('span', { 'class': 'an-meter' }, [h('i', { style: 'width:' + Math.max(2, share * 100) + '%;background:' + (share < 0.1 ? C.gold : C.purple) })]);
                tb.appendChild(h('tr', null, [
                    h('td', { text: n.title }),
                    h('td', { text: tLabel(isoSec(n.created_at)), style: 'white-space:nowrap' }),
                    h('td', { 'class': 'num', text: fmt(n.recipient_count) }),
                    h('td', { 'class': 'num', text: fmt(n.read_count) }),
                    h('td', { style: 'white-space:nowrap' }, [Math.round(share * 100) + '%', meter])
                ]));
            });
            table.appendChild(tb);
            host.appendChild(h('div', { 'class': 'an-tbl-wrap' }, [table]));
        }
        var all = rows.reduce(function (a, n) { return a + n.recipient_count; }, 0);
        var opened = rows.reduce(function (a, n) { return a + n.read_count; }, 0);
        rich($('bell-lede'), rows.length
            ? [b(rows.length), plural(rows.length, ' notice', ' notices') + ' went to five or more staff ' + rangeText(Q.R) + '. Across them, ',
               b(pct(opened, all) + '%'), ' of recipients opened the notice in the Hub. Staff often act on a reminder without opening it, so the bell is not the whole story. These counts are school-wide: the group and staff filters don’t narrow them.']
            : ['No notices to five or more staff ' + rangeText(Q.R) + '.']);

        var al = alertStats(Q);
        var A = $('c-alerts');
        K.clear(A);
        [[al.n, 'alerts sent', true], [al.teachers, 'teachers behind them'], [al.max, 'from one teacher, at most'], [al.inbox, 'bell items for admins', true]]
            .forEach(function (s2) {
                A.appendChild(h('div', null, [h('div', { 'class': 'an-stat-v' + (s2[2] ? ' is-gold' : ''), text: fmt(s2[0]) }), h('div', { 'class': 'an-stat-l', text: s2[1] })]));
            });

        var Hh = $('c-health');
        K.clear(Hh);
        var lastDw = Math.max.apply(null, M.dwell.map(function (r) { return isoSec(r.last_seen); }).concat([0]));
        var sp = spotStats(Q, VIEW.spot);
        var never = Object.keys(Q.S).filter(function (e) { var p = M.people[e]; return p.onRoster && p.first === Infinity; }).length;
        [
            [M.dwellLegacy ? '!' : fmt(M.dwell.length), M.dwellLegacy ? 'reading-time tab needs migrating' : 'reading-time rows' + (lastDw ? ', last on ' + tLabel(lastDw) : ''), true],
            [M.hasUsage ? fmt(Q.ck.length) : '—', 'tagged clicks in these dates'],
            [fmt(sp.openedOnly), 'opened ' + MOD[VIEW.spot].short + ' without finishing'],
            [fmt(never), 'on the roster, never on the Hub', true]
        ].forEach(function (s2) {
            Hh.appendChild(h('div', null, [h('div', { 'class': 'an-stat-v' + (s2[2] ? ' is-gold' : ''), text: s2[0] }), h('div', { 'class': 'an-stat-l', text: s2[1] })]));
        });
    }

    /* ---------------- AI Literacy readiness ---------------- */

    function readinessRows(Q) {
        return (M.ready || []).filter(function (r) {
            var e = lower(r.email), t = isoSec(r.first_saved);
            return Q.S[e] && (!t || (t >= Q.R.ta && t < Q.R.tb));
        });
    }
    function seg(r, s2, k) { var x = r.data && r.data[s2]; return x ? String(x[k] == null || x[k] === false ? '' : x[k]).trim() : ''; }
    function needText(r) { return seg(r, 'lesson', 'needs_before'); }

    function renderReadiness(Q) {
        if (!M.ready) {
            ['c-ready-funnel', 'c-ready-themes'].forEach(function (id) { K.empty($(id), 'The readiness answers did not load.'); });
            $('ready-lede').textContent = '';
            return;
        }
        var rows = readinessRows(Q);
        var steps = READINESS_STEPS.slice();
        var seen = {};
        rows.forEach(function (r) {
            (r.segments_done || []).concat(Object.keys(r.data || {})).forEach(function (s2) { seen[s2] = 1; });
        });
        Object.keys(seen).forEach(function (s2) {
            if (!steps.some(function (x) { return x.id === s2; })) steps.push({ id: s2, label: s2.replace(/[-_]/g, ' ') });
        });
        var counted = steps.map(function (st) {
            return { label: st.label, value: rows.filter(function (r) {
                return (r.segments_done || []).indexOf(st.id) !== -1 || (r.data && r.data[st.id] && Object.keys(r.data[st.id]).some(function (k) { return k !== '_saved_at' && r.data[st.id][k] !== '' && r.data[st.id][k] !== false; }));
            }).length };
        }).filter(function (x, i) { return x.value || i < READINESS_STEPS.length; });
        var start = Math.max.apply(null, counted.map(function (x) { return x.value; }).concat([0]));
        K.funnel($('c-ready-funnel'), counted, { total: start || 1, empty: 'No readiness answers in this selection.' });
        K.tableView($('c-ready-funnel'), ['Part', 'Teachers', 'Share'], counted.map(function (x) { return [x.label, fmt(x.value), pct(x.value, start) + '%']; }));

        var themeN = THEMES.map(function (th) {
            var who = rows.filter(function (r) {
                var text = [needText(r), seg(r, 'lesson', 'unsure'), seg(r, 'commit', 'question')].join(' \n ');
                return th.re.test(text);
            });
            return { label: th.label, value: who.length };
        }).sort(function (x, y) { return y.value - x.value; });
        K.rankBars($('c-ready-themes'), themeN.filter(function (x) { return x.value; }).map(function (x, i) {
            return { label: x.label, value: x.value, valueText: fmt(x.value) + ' ' + plural(x.value, 'teacher'), color: i === 0 ? C.gold : C.purple };
        }), { empty: 'No answers to read themes from in this selection.' });
        K.tableView($('c-ready-themes'), ['Theme', 'Teachers'], themeN.map(function (x) { return [x.label, fmt(x.value)]; }));

        var need = rows.filter(function (r) { return !!needText(r); }).length;
        var done = rows.filter(function (r) { return !!r.completed_at; }).length;
        var blocked = rows.filter(function (r) { return seg(r, 'lesson', 'blocked') === 'true'; }).length;
        rich($('ready-lede'), rows.length
            ? ['The AI Literacy readiness module asks teachers whether they need anything before they can teach it. ', b(need), ' of ', b(rows.length),
               ' said yes; ', b(done), ' have finished the module', blocked ? [' and ', b(blocked), ' reported being blocked on InstrucTwin'] : '', '. ',
               themeN[0] && themeN[0].value ? ['Their words point most to ', b(themeN[0].label.toLowerCase()), '.'] : ''].reduce(flat, [])
            : ['No readiness answers from this selection in these dates.']);
    }

    /* ---------------- teacher goals ---------------- */

    function renderGoals(Q) {
        var st = $('c-goal-stats');
        K.clear(st);
        if (!M.survey) {
            K.empty(st, 'The goal survey did not load.');
            K.clear($('c-goal-focus')); K.clear($('c-goal-support'));
            $('goals-lede').textContent = '';
            return;
        }
        var all = (M.survey.responses || []).filter(function (r) { return Q.S[lower(r.email)]; });
        var sub = all.filter(function (r) {
            var t = isoSec(r.submitted_at);
            return r.status === 'submitted' && (!t || (t >= Q.R.ta && t < Q.R.tb));
        });
        var drafts = all.filter(function (r) { return r.status !== 'submitted'; });
        var newcomers = sub.filter(function (r) { return r.data && r.data.at_aisa_last_year === 'No'; }).length;
        var tag = F.tag || (M.tags.indexOf('secondary') !== -1 ? 'secondary' : '');
        var owed = (M.survey.outstanding || []).filter(function (p) {
            var e = lower(p.email);
            return Q.S[e] && (!tag || (p.tags || []).indexOf(tag) !== -1);
        });
        [[sub.length, 'goals submitted' + (F.range === 'all' ? '' : ' in these dates')], [newcomers, 'from staff new to AISA'],
         [drafts.length, 'started but not submitted', true], [owed.length, 'still to submit' + (tag ? ' (roster “' + tag + '”)' : ' (whole roster)'), true]]
            .forEach(function (s2) {
                st.appendChild(h('div', null, [h('div', { 'class': 'an-stat-v' + (s2[2] ? ' is-gold' : ''), text: fmt(s2[0]) }), h('div', { 'class': 'an-stat-l', text: s2[1] })]));
            });
        var focus = {}, support = {};
        sub.forEach(function (r) {
            var d = r.data || {};
            if (d.focus_area) focus[d.focus_area] = (focus[d.focus_area] || 0) + 1;
            (Array.isArray(d.pl_supports) ? d.pl_supports : []).forEach(function (x) { support[x] = (support[x] || 0) + 1; });
        });
        var fRows = Object.keys(focus).sort(function (a, c) { return focus[c] - focus[a]; });
        var sRows = Object.keys(support).sort(function (a, c) { return support[c] - support[a]; });
        K.rankBars($('c-goal-focus'), fRows.map(function (k) { return { label: k, value: focus[k] }; }), { empty: 'No goals submitted in this selection.' });
        K.tableView($('c-goal-focus'), ['Focus area', 'Teachers'], fRows.map(function (k) { return [k, fmt(focus[k])]; }));
        K.rankBars($('c-goal-support'), sRows.map(function (k) { return { label: k, value: support[k], color: C.gold }; }), { empty: 'No support asked for in this selection.' });
        K.tableView($('c-goal-support'), ['Support', 'Teachers'], sRows.map(function (k) { return [k, fmt(support[k])]; }));
        rich($('goals-lede'), sub.length
            ? [b(sub.length), ' teachers have submitted a 2026–27 personal goal through the Hub', newcomers ? [' (', b(newcomers), ' new to AISA)'] : '', '. ',
               fRows.length ? ['The most chosen focus is ', b(fRows[0]), ', and the support most asked for is ', b((sRows[0] || '—').toLowerCase()), '.'] : ''].reduce(flat, [])
            : ['No goals submitted by this selection in these dates.']);
    }

    /* ---------------- staff explorer ---------------- */

    var STAFF_COLS = [
        { key: 'name', label: 'Name' }, { key: 'tags', label: 'Groups' },
        { key: 'first', label: 'First seen' }, { key: 'last', label: 'Last seen' },
        { key: 'days', label: 'Days active', num: true }, { key: 'views', label: 'Page views', num: true },
        { key: 'mods', label: 'Modules', num: true }, { key: 'issues', label: 'Issues read', num: true },
        { key: 'device', label: 'Device' }
    ];
    var STAFF_PAGE = 40;

    function staffRows(Q) {
        var views = {}, dev = {};
        Q.pv.forEach(function (r) { views[r.p] = (views[r.p] || 0) + 1; (dev[r.p] = dev[r.p] || {})[r.dev > 0 ? 'm' : 'd'] = 1; });
        return Object.keys(Q.S).map(function (e) {
            var p = M.people[e], d = dev[e] || {};
            return {
                email: e, name: nameOf(e), tags: p.tags.join(', '),
                first: p.first === Infinity ? 0 : p.first, last: p.last || 0,
                days: Object.keys(Q.days[e] || {}).length, views: views[e] || 0,
                mods: Object.keys(Q.doneBy[e] || {}).length, issues: Object.keys(Q.readers[e] || {}).length,
                device: d.d && d.m ? 'Both' : (d.m ? 'Phone/tablet' : (d.d ? 'Laptop' : ''))
            };
        });
    }

    function renderStaff(Q) {
        var rows = staffRows(Q);
        var q = VIEW.q.toLowerCase();
        if (q) rows = rows.filter(function (r) { return (r.name + ' ' + r.email + ' ' + r.tags).toLowerCase().indexOf(q) !== -1; });
        var k = VIEW.sortKey, dir = VIEW.sortDir;
        rows.sort(function (x, y) {
            var a = x[k], c = y[k];
            if (typeof a === 'string') return dir * a.localeCompare(c);
            return dir * (a - c) || x.name.localeCompare(y.name);
        });
        $('staff-count').textContent = fmt(rows.length) + ' ' + plural(rows.length, 'person', 'people');
        var table = $('staff-table');
        K.clear(table);
        var tr = h('tr');
        STAFF_COLS.forEach(function (col) {
            var on = VIEW.sortKey === col.key;
            var btn = h('button', { type: 'button', text: col.label + (on ? (VIEW.sortDir > 0 ? ' ↑' : ' ↓') : '') });
            btn.addEventListener('click', function () {
                if (VIEW.sortKey === col.key) VIEW.sortDir = -VIEW.sortDir;
                else { VIEW.sortKey = col.key; VIEW.sortDir = (col.num || col.key === 'first' || col.key === 'last') ? -1 : 1; }
                renderStaff(query());
            });
            tr.appendChild(h('th', { 'class': col.num ? 'num' : null, 'aria-sort': on ? (VIEW.sortDir > 0 ? 'ascending' : 'descending') : null }, [btn]));
        });
        table.appendChild(h('thead', null, [tr]));
        var tb = h('tbody');
        (VIEW.showAll ? rows : rows.slice(0, STAFF_PAGE)).forEach(function (r) {
            var nm = h('button', { type: 'button', 'class': 'an-linkbtn', text: r.name });
            nm.addEventListener('click', function () { focusPerson(r.email); });
            var tagsCell = h('td');
            (M.people[r.email].tags || []).forEach(function (t) { tagsCell.appendChild(h('span', { 'class': 'an-tag', text: t })); });
            var meter = h('span', { 'class': 'an-meter' }, [h('i', { style: 'width:' + (100 * r.mods / MODULES.length) + '%' })]);
            tb.appendChild(h('tr', null, [
                h('td', null, [nm, h('small', { text: r.email })]),
                tagsCell,
                h('td', { text: r.first ? tLabel(r.first) : 'never' }),
                h('td', { text: r.last ? tLabel(r.last) : '—' }),
                h('td', { 'class': 'num', text: fmt(r.days) }),
                h('td', { 'class': 'num', text: M.hasUsage ? fmt(r.views) : '—' }),
                h('td', { 'class': 'num' }, [r.mods + '/' + MODULES.length, meter]),
                h('td', { 'class': 'num', text: M.hasUsage ? fmt(r.issues) : '—' }),
                h('td', { text: r.device || '—' })
            ]));
        });
        table.appendChild(tb);
        var more = $('staff-more');
        K.clear(more);
        if (rows.length > STAFF_PAGE) {
            var btn = h('button', { type: 'button', 'class': 'an-btn', text: VIEW.showAll ? 'Show the first ' + STAFF_PAGE : 'Show all ' + fmt(rows.length) });
            btn.addEventListener('click', function () { VIEW.showAll = !VIEW.showAll; renderStaff(query()); });
            more.appendChild(btn);
        }
        $('staff-csv').onclick = function () { exportCsv(staffRows(query())); };
    }

    function exportCsv(rows) {
        var Q = query();
        var esc = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var lines = [
            ['Personal data (UAE Federal Decree-Law No. 45 of 2021): for AISA SLT use only. Do not share further.'],
            ['Learning Hub analytics · ' + rangeText(Q.R) + (F.tag ? ' · group ' + F.tag : '') + ' · exported ' + new Date().toISOString().slice(0, 10)],
            ['Name', 'Email', 'Groups', 'First seen', 'Last seen', 'Days active', 'Page views', 'Modules finished', 'Issues read', 'Device']
        ];
        rows.forEach(function (r) {
            lines.push([r.name, r.email, r.tags, r.first ? inputFromDay(dayOf(r.first)) : '', r.last ? inputFromDay(dayOf(r.last)) : '',
                        r.days, r.views, r.mods, r.issues, r.device]);
        });
        var blob = new Blob(['﻿' + lines.map(function (l) { return l.map(esc).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = h('a', { href: URL.createObjectURL(blob), download: 'hub-analytics-staff-' + new Date().toISOString().slice(0, 10) + '.csv' });
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }

    function focusPerson(e) {
        F.staff = [e];
        render();
        var top = $('overview');
        if (top && top.scrollIntoView) top.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function copy(text, btn) {
        var done = function () { var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = t; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
        function fallback() {
            var ta = h('textarea', { style: 'position:fixed;opacity:0' });
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { /* the button just stays as it is */ }
            ta.remove();
        }
    }

    /* ---------------- controls ---------------- */

    function wireControls() {
        var range = $('f-range'), from = $('f-from'), to = $('f-to');
        range.value = F.range;
        $('f-custom').hidden = F.range !== 'custom';
        from.value = F.from; to.value = F.to;
        range.addEventListener('change', function () {
            F.range = range.value;
            $('f-custom').hidden = F.range !== 'custom';
            if (F.range === 'custom' && !F.from) {
                var R = { a: dayOf(nowSec()) - 29, b: dayOf(nowSec()) + 1 };
                F.from = from.value = inputFromDay(R.a);
                F.to = to.value = inputFromDay(R.b - 1);
            }
            remember(); render();
        });
        [from, to].forEach(function (inp) {
            inp.addEventListener('change', function () { F.from = from.value; F.to = to.value; remember(); render(); });
        });
        $('f-tag').addEventListener('change', function () { F.tag = this.value; remember(); render(); });
        var test = $('f-test');
        test.checked = F.noTest;
        test.addEventListener('change', function () { F.noTest = test.checked; remember(); render(); });
        $('f-reset').addEventListener('click', function () {
            F = { range: 'all', from: '', to: '', tag: '', staff: [], noTest: true };
            VIEW.section = ''; VIEW.q = ''; $('staff-q').value = '';
            range.value = 'all'; $('f-custom').hidden = true; $('f-tag').value = ''; test.checked = true;
            remember(); render();
        });
        $('f-refresh').addEventListener('click', function () { load(true); });
        $('f-print').addEventListener('click', function () { window.print(); });
        $('spot-pick').addEventListener('change', function () { VIEW.spot = this.value; remember(); render(); });
        $('act-measure').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-m]');
            if (!btn) return;
            VIEW.act = btn.getAttribute('data-m');
            Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x === btn); });
            safe('engagement', function () { renderEngagement(query()); });
        });
        $('mod-measure').addEventListener('click', function (e) {
            var btn = e.target.closest('button[data-m]');
            if (!btn) return;
            VIEW.modMeasure = btn.getAttribute('data-m');
            Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.toggle('is-on', x === btn); });
            safe('modules', function () { renderModules(query()); });
        });
        $('staff-q').addEventListener('input', function () { VIEW.q = this.value; VIEW.showAll = false; renderStaff(query()); });
        wireStaffPicker();
        $('error-retry').addEventListener('click', function () { load(false); });
    }

    function fillTagSelect() {
        var sel = $('f-tag');
        while (sel.options.length > 1) sel.remove(1);
        M.tags.forEach(function (t) { sel.appendChild(h('option', { value: t, text: t })); });
        if (F.tag && M.tags.indexOf(F.tag) === -1) F.tag = '';
        sel.value = F.tag;
        $('f-tag-wrap').hidden = !M.tags.length;
    }

    function wireStaffPicker() {
        var input = $('f-staff'), list = $('f-staff-list');
        var hi = 0, opts = [];
        function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); }
        function choose(e) {
            if (F.staff.indexOf(e) === -1) F.staff.push(e);
            input.value = '';
            close();
            render();
        }
        function draw() {
            if (!M) return;
            var q = input.value.trim().toLowerCase();
            if (!q) { close(); return; }
            opts = Object.keys(M.people).filter(function (e) {
                var p = M.people[e];
                if (F.tag && p.tags.indexOf(F.tag) === -1) return false;
                if (F.noTest && TEST[e] && e.indexOf(q) !== 0) return false;
                return F.staff.indexOf(e) === -1 && (e.indexOf(q) !== -1 || (p.name || '').toLowerCase().indexOf(q) !== -1 ||
                       p.tags.some(function (t) { return t.indexOf(q) === 0; }));
            }).sort(function (a, c) { return nameOf(a).localeCompare(nameOf(c)); }).slice(0, 12);
            K.clear(list);
            if (!opts.length) { list.appendChild(h('div', { 'class': 'an-staff-opt', text: 'Nobody matches “' + input.value + '”' })); }
            hi = Math.min(hi, Math.max(0, opts.length - 1));
            opts.forEach(function (e, i) {
                var p = M.people[e];
                var o = h('button', { type: 'button', role: 'option', 'class': 'an-staff-opt' + (i === hi ? ' is-hi' : ''), 'aria-selected': i === hi ? 'true' : 'false' },
                    [h('b', { text: nameOf(e) }), h('span', { text: e + (p.tags.length ? ' · ' + p.tags.join(', ') : '') })]);
                o.addEventListener('mousedown', function (ev) { ev.preventDefault(); choose(e); });
                list.appendChild(o);
            });
            list.hidden = false;
            input.setAttribute('aria-expanded', 'true');
        }
        input.addEventListener('input', function () { hi = 0; draw(); });
        input.addEventListener('focus', draw);
        input.addEventListener('blur', function () { setTimeout(close, 120); });
        input.addEventListener('keydown', function (e) {
            if (list.hidden) return;
            if (e.key === 'ArrowDown') { hi = Math.min(opts.length - 1, hi + 1); draw(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { hi = Math.max(0, hi - 1); draw(); e.preventDefault(); }
            else if (e.key === 'Enter') { if (opts[hi]) choose(opts[hi]); e.preventDefault(); }
            else if (e.key === 'Escape') close();
        });
    }

    var lastWidth = 0, resizeTimer = null;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (M && document.documentElement.clientWidth !== lastWidth) render();
        }, 180);
    });

    /* ---------------- loading ---------------- */

    function show(state) {
        ['state-loading', 'state-denied', 'state-error', 'state-ready'].forEach(function (s2) { $(s2).hidden = s2 !== state; });
    }

    var HINTS = {
        request_timeout: 'The backend didn’t answer within a minute, usually Google Sheets under load. Try again in a moment.',
        server_error: 'The backend hit an error reading the spreadsheet (usually Sheets timing out while the Hub is busy). Try again in a minute.',
        bad_response: 'The backend answered with an error page instead of data: it crashed or hit its daily quota.',
        http_404: 'The backend URL in auth/gate.js no longer points at a live Apps Script deployment. The whole Hub is affected, not just this page.',
        invalid_session: 'Your sign-in has expired. Reload the page to sign in again.',
        aisa_api_not_configured: 'The backend URL isn’t set in auth/gate.js. This is a deploy problem, not a permissions one.'
    };

    function failed(err) {
        var code = (err && err.message) || 'unknown';
        if (code === 'not_admin') { M = null; show('state-denied'); return; }
        if (M) {
            var stale = $('banner-stale');
            stale.hidden = false;
            stale.textContent = 'Couldn’t get the latest (' + code + '). Showing what loaded at ' +
                clock(Math.floor(LOADED_AT / 1000)) + '. ' + (HINTS[code] || '');
            return;
        }
        $('error-code').textContent = code + (err && err.serverMessage ? ' — ' + err.serverMessage : '');
        $('error-hint').textContent = HINTS[code] || (/^[a-z0-9_]+$/.test(code)
            ? 'Try again; if it keeps happening, the Apps Script executions log says why.'
            : 'This page itself failed (' + code + '), not the backend. Please report it.');
        show('state-error');
    }

    function ready(raw) {
        if (raw.overview && raw.overview.ok === false) {
            var e = new Error(raw.overview.error || 'unknown');
            e.serverMessage = raw.overview.message;
            throw e;
        }
        RAW = raw;
        LOADED_AT = Date.now();
        M = build(raw);
        $('banner-stale').hidden = true;
        show('state-ready');
        fillTagSelect();
        render();
    }

    /* A backend from before admin_dashboard: the separate admin reads. */
    function legacy() {
        var p = function (fn) { return fn().then(function (x) { return x; }, function (e) { return { ok: false, error: e && e.message }; }); };
        return Promise.all([
            AUTH.adminOverview(),
            p(function () { return AUTH.getAdminDwell ? AUTH.getAdminDwell() : Promise.resolve(null); }),
            p(function () { return AUTH.adminNotificationStats(); }),
            p(function () { return AUTH.adminModuleResponses(READINESS_ID); }),
            p(function () { return AUTH.adminSurveyResponses(GOAL_SURVEY, {}); })
        ]).then(function (r) {
            return { ok: true, overview: r[0], dwell: r[1], notifications: r[2], module_responses: r[3], survey: r[4] };
        });
    }

    var loading = false;
    function load(fresh) {
        if (loading || !AUTH) return;
        loading = true;
        var content = $('content'), btn = $('f-refresh');
        if (M) { content.classList.add('an-busy'); btn.disabled = true; }
        else show('state-loading');
        AUTH.adminDashboard({
            parts: ['overview', 'dwell', 'module_responses', 'survey', 'notifications', 'usage'],
            moduleId: READINESS_ID, surveyId: GOAL_SURVEY, fresh: !!fresh
        }).catch(function (err) {
            if (err && err.message === 'unknown_action') return legacy();
            throw err;
        }).then(ready).catch(failed).then(function () {
            loading = false;
            content.classList.remove('an-busy');
            btn.disabled = false;
        });
    }

    wireControls();
    if (window.aisaReady) {
        window.aisaReady(function (auth) {
            AUTH = auth;
            if (!auth.isConfigured()) { failed(new Error('aisa_api_not_configured')); return; }
            load(false);
        });
    } else {
        failed(new Error('aisa_api_not_configured'));
    }
    /* Text is measured for labels; once the brand font is in, draw again. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (M) render(); });
})();
