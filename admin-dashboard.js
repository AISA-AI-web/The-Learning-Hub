/* admin-dashboard.js — the admin console (redesigned 9 Nov 2026).
 *
 * Five tabs, each with its own address: #overview, #training, #engagement, #surveys (/goals, /innovation, /readiness) and
 * #people (/staff, /admins, /sync, /removed; that tab's rows are admin-roster.js). The old addresses still work: #goals,
 * #responses, and the old tab names (pd, survey, actions, roster).
 *
 * The whole page is ONE request, admin_dashboard (audited 23 Sept 2026: it used to be four, each queueing behind everyone
 * else's page views). The last good answer is drawn at once from this device (auth.readAdminSnapshot), marked as a saved
 * copy, while the live one is fetched; Refresh asks the server to skip any cache. A backend from before admin_dashboard
 * answers `unknown_action` and the page falls back to the separate endpoints (legacyLoad).
 *
 * MODULES, EXTRA, COLUMNS, REQUIRED and AI_LITERACY_COHORT are declared in admin-dashboard.html, before this file.
 *
 * Names, addresses and what staff wrote are personal data: they are drawn on the page and kept nowhere else. This device
 * remembers only the last tab and any skim thresholds an admin changed.
 */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };

    /* ================================================================ helpers */

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function icon(name) { return '<svg class="ad-ico" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
    function pctOf(n, d) { return d ? Math.round(n / d * 100) : 0; }
    /* The one place a percentage becomes a status colour: green 90%+, amber 60–89%, red under 60%. */
    function statusOf(p) { return p >= 90 ? 'good' : (p >= 60 ? 'warn' : 'bad'); }
    function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function fmtStamp(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        return isNaN(d) ? String(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    function fmtHours(n) {
        if (!isFinite(n)) return '0';
        return (n % 1 === 0) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
    }
    function fmtSecs(n) {
        n = Math.max(0, Math.floor(Number(n) || 0));
        if (n < 60) return n + 's';
        var m = Math.floor(n / 60), s = n % 60;
        if (m < 60) return s ? (m + 'm ' + s + 's') : (m + 'm');
        var h = Math.floor(m / 60), rm = m % 60;
        return rm ? (h + 'h ' + rm + 'm') : (h + 'h');
    }
    function median(list) {
        if (!list.length) return 0;
        var s = list.slice().sort(function (a, b) { return a - b; }), mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    function csvCell(v) {
        v = String(v == null ? '' : v);
        if (/^[=+\-@]/.test(v)) v = "'" + v;   // a spreadsheet would run it as a formula
        return '"' + v.replace(/"/g, '""') + '"';
    }
    function downloadCsv(name, lines) {
        var blob = new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name + '-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }
    function storeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
    function storeSet(key, v) { try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch (e) { /* private mode */ } }
    function moduleById(id) { return COLUMNS.filter(function (c) { return c.id === id; })[0] || null; }
    function moduleTitle(id) { var m = moduleById(id); return m ? m.title : id; }

    /* A pager under a table: "1–25 of 140", Previous / Next. `go(page)` redraws. */
    function renderPager(el, page, total, per, go) {
        el.textContent = '';
        if (total <= per) return;
        var pages = Math.ceil(total / per), from = page * per + 1, to = Math.min(total, (page + 1) * per);
        var info = document.createElement('span');
        info.className = 'ad-num';
        info.textContent = from + '–' + to + ' of ' + total;
        var btns = document.createElement('span');
        btns.className = 'ad-pager-btns';
        function btn(label, target, disabled) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'ad-btn sm'; b.textContent = label; b.disabled = disabled;
            b.addEventListener('click', function () { go(target); });
            return b;
        }
        var where = document.createElement('span');
        where.className = 'ad-num';
        where.style.alignSelf = 'center';
        where.textContent = 'Page ' + (page + 1) + ' of ' + pages;
        btns.appendChild(btn('Previous', page - 1, page === 0));
        btns.appendChild(where);
        btns.appendChild(btn('Next', page + 1, page >= pages - 1));
        el.appendChild(info);
        el.appendChild(btns);
    }
    function clampPage(page, total, per) { return Math.max(0, Math.min(page, Math.ceil(total / per) - 1)); }

    /* A button that opens a little panel: Escape and a click elsewhere close it; focus goes to its first item. */
    var openPop = null;
    function popover(btn, pop) {
        function close(back) {
            pop.classList.add('hidden');
            btn.setAttribute('aria-expanded', 'false');
            if (openPop && openPop.pop === pop) openPop = null;
            if (back) btn.focus();
        }
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var opening = pop.classList.contains('hidden');
            if (openPop) openPop.close(false);
            if (!opening) return;
            pop.classList.remove('hidden');
            btn.setAttribute('aria-expanded', 'true');
            openPop = { pop: pop, close: close };
            var first = pop.querySelector('a, button, select, input');
            if (first) first.focus();
        });
        pop.addEventListener('click', function (e) { e.stopPropagation(); });
        pop.addEventListener('keydown', function (e) {
            if (pop.getAttribute('role') !== 'menu') return;
            var items = Array.prototype.slice.call(pop.querySelectorAll('[role="menuitem"]'));
            var i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        });
        return close;
    }
    document.addEventListener('click', function () { if (openPop) openPop.close(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openPop) openPop.close(true); });
    popover($('tools-btn'), $('tools-menu'));
    popover($('more-filters-btn'), $('more-filters'));

    /* ================================================================ tabs and the address */

    var TABS = ['overview', 'training', 'engagement', 'surveys', 'people'];
    var SUBS = { surveys: ['goals', 'innovation', 'readiness'], people: ['staff', 'admins', 'sync', 'removed'] };
    var LEGACY = { pd: 'overview', survey: 'surveys', actions: 'overview', roster: 'people',
                   goals: 'surveys/goals', responses: 'surveys/readiness' };
    var KEY = 'aisa_admin_tab';
    var current = { tab: 'overview', sub: { surveys: 'goals', people: 'staff' } };

    function parseHash(hash) {
        var id = String(hash || '').replace(/^#/, '');
        if (!id) return null;
        if (LEGACY[id]) id = LEGACY[id];
        var parts = id.split('/'), tab = parts[0], sub = parts[1] || '';
        if (TABS.indexOf(tab) !== -1) {
            if (sub && (!SUBS[tab] || SUBS[tab].indexOf(sub) === -1)) sub = '';
            return { tab: tab, sub: sub };
        }
        /* Any element on the page: the tab (and sub-section) it is in. */
        var el = document.getElementById(id);
        if (!el) return null;
        for (var i = 0; i < TABS.length; i++) {
            if (!$('panel-' + TABS[i]).contains(el)) continue;
            var s = '';
            (SUBS[TABS[i]] || []).forEach(function (x) {
                var box = $((TABS[i] === 'surveys' ? 'sv-' : 'pp-') + x);
                if (box && box.contains(el)) s = x;
            });
            return { tab: TABS[i], sub: s, el: el };
        }
        return null;
    }

    function hashFor(tab, sub) { return '#' + tab + (sub ? '/' + sub : ''); }

    function setSub(tab, sub) {
        if (!SUBS[tab] || SUBS[tab].indexOf(sub) === -1) return;
        current.sub[tab] = sub;
        var pre = tab === 'surveys' ? 'sv' : 'pp';
        SUBS[tab].forEach(function (x) {
            var on = x === sub;
            $(pre + '-' + x).classList.toggle('hidden', !on);
            var b = $(pre + '-tab-' + x);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
    }

    /* opts: push (add to the history), focus (move focus to the tab), sub (a sub-section) */
    function show(tab, opts) {
        opts = opts || {};
        if (TABS.indexOf(tab) === -1) tab = 'overview';
        if (opts.sub) setSub(tab, opts.sub);
        current.tab = tab;
        TABS.forEach(function (t) {
            var on = t === tab;
            $('panel-' + t).classList.toggle('hidden', !on);
            var b = $('tab-' + t);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.tabIndex = on ? 0 : -1;
        });
        storeSet(KEY, tab);
        var want = hashFor(tab, SUBS[tab] ? current.sub[tab] : '');
        if (opts.push && location.hash !== want) {
            try { history.pushState(null, '', want); } catch (e) { location.hash = want; }
        } else if (opts.replace && location.hash !== want) {
            try { history.replaceState(null, '', want); } catch (e) { /* file:// */ }
        }
        if (opts.focus) $('tab-' + tab).focus();
        if (opts.top) window.scrollTo(0, 0);
    }

    function applyHash() {
        var r = parseHash(location.hash);
        if (!r) return false;
        var isElement = !!r.el;
        show(r.tab, { sub: r.sub || undefined, replace: !isElement && LEGACY[location.hash.slice(1)] !== undefined });
        if (isElement && r.el.id !== 'panel-' + r.tab) {
            setTimeout(function () { r.el.scrollIntoView({ block: 'start' }); }, 0);
        }
        return true;
    }

    TABS.forEach(function (t) {
        $('tab-' + t).addEventListener('click', function () { show(t, { push: true }); });
    });
    Object.keys(SUBS).forEach(function (tab) {
        var pre = tab === 'surveys' ? 'sv' : 'pp';
        SUBS[tab].forEach(function (x) {
            $(pre + '-tab-' + x).addEventListener('click', function () { setSub(tab, x); show(tab, { push: true }); });
        });
    });

    /* Arrow keys move along a tab list, as a tab list is expected to behave. */
    function tablistKeys(list, names, pick, vertical) {
        list.addEventListener('keydown', function (e) {
            var i = names.indexOf(document.activeElement && (document.activeElement.getAttribute('data-tab') ||
                    document.activeElement.getAttribute('data-sv') || document.activeElement.getAttribute('data-pp')));
            if (i === -1) return;
            var next = null, fwd = vertical ? 'ArrowDown' : 'ArrowRight', back = vertical ? 'ArrowUp' : 'ArrowLeft';
            if (e.key === fwd) next = names[(i + 1) % names.length];
            else if (e.key === back) next = names[(i - 1 + names.length) % names.length];
            else if (e.key === 'Home') next = names[0];
            else if (e.key === 'End') next = names[names.length - 1];
            if (!next) return;
            e.preventDefault();
            pick(next);
        });
    }
    tablistKeys(document.querySelector('.ad-tabs'), TABS, function (t) { show(t, { push: true, focus: true }); });
    tablistKeys(document.querySelector('.ad-svlist'), SUBS.surveys, function (x) {
        setSub('surveys', x); show('surveys', { push: true }); $('sv-tab-' + x).focus();
    }, true);
    tablistKeys(document.querySelector('#panel-people .ad-subtabs'), SUBS.people, function (x) {
        setSub('people', x); show('people', { push: true }); $('pp-tab-' + x).focus();
    });

    /* Back and Forward: an address with no tab in it is the Overview. */
    function onNavigate() { if (!applyHash()) show('overview'); }
    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);
    /* In-page links (#training, an anchor in a closed tab): show the tab even when the address already says so. */
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;
        var r = parseHash(a.getAttribute('href'));
        if (!r) return;
        e.preventDefault();
        show(r.tab, { sub: r.sub || undefined, push: true, top: !r.el });
        if (r.el) r.el.scrollIntoView({ block: 'start' });
    });

    if (!applyHash()) {
        var saved = storeGet(KEY);
        if (saved && LEGACY[saved]) saved = LEGACY[saved].split('/')[0];
        show(TABS.indexOf(saved) !== -1 ? saved : 'overview');
    }

    /* Other parts of the page send people to a tab: "Review", "See who hasn't" … */
    function go(tab, sub) { show(tab, { sub: sub, push: true, top: true }); }

    /* ================================================================ the data */

    var DATA = null;       // { byEmail, list }
    var AUTH = null;       // gate.js's auth handle
    var rendered = false;

    /* A module with a cohort applies only to that cohort; a module without one applies to everybody. */
    function applies(m, email) { return !m.cohort || m.cohort.has(String(email || '').toLowerCase()); }
    function isCompleteFor(p, mods) { return mods.every(function (m) { return !applies(m, p.email) || !!p.done[m.id]; }); }

    function buildIndex(payload) {
        var byEmail = {};
        (payload.people || []).forEach(function (p) {
            byEmail[p.email] = { email: p.email, name: p.name || '', last_seen: p.last_seen || '', done: {},
                division: p.division || '', department: p.department || '', designation: p.designation || '' };
        });
        (payload.completions || []).forEach(function (c) {
            if (!byEmail[c.email]) byEmail[c.email] = { email: c.email, name: '', last_seen: '', done: {} };
            byEmail[c.email].done[c.module_id] = c.completed_at;
        });
        return byEmail;
    }

    /* The cohort as rows: real data where there is some, a stub for someone never seen on the Hub (without it a teacher
     * who never signed in is simply absent, and nobody's problem). */
    function cohortRows() {
        return AI_LITERACY_COHORT.map(function (t) {
            return DATA.byEmail[t.email] || { email: t.email, name: t.name, last_seen: '', done: {}, neverSeen: true };
        });
    }

    /* Who a module is measured against, within a list of people (a division, say). A cohort module: its cohort, and
     * when the list is narrowed, only the cohort members in it. */
    function population(m, list, narrowed) {
        if (!m.cohort) return list;
        if (!narrowed) return cohortRows();
        var inList = {};
        list.forEach(function (p) { inList[p.email] = true; });
        return cohortRows().filter(function (p) { return inList[p.email]; });
    }

    /* ================================================================ Overview */

    function ovDivision() { return $('ov-division').value; }

    /* ---- Division groups (9 Nov 2026) ----
     * A person's division is HR's: Early Years / Primary / Secondary, otherwise their HR department, so the same group of
     * people can be split across several spellings. The Division filter lists these groups instead, then the divisions no
     * group takes. Edit the groups here; option values start "__" so they never clash with a real division's name. */
    var DIVISION_GROUPS = {
        __admin:      { label: 'Administration & finance', divisions: ['Accounts Office', 'Administration', 'Administrator', 'Finance', 'HR Office', 'Purchasing', 'Registration'] },
        __facilities: { label: 'Maintenance, cleaning & transport', divisions: ['Maintenance Department', 'Transport', 'Support Staff'] },
        __monitors:   { label: 'Hallway & bus monitors', divisions: ['Hallway / Bus Monitor', 'Hallway Monitor'] }
    };
    /* The Senior Leadership Team: anyone whose designation says "principal" (so a new one joins by themselves), plus these. */
    var SLT_EMAILS = ['atorris@aisa.sch.ae', 'aturabi@aisa.sch.ae'];
    function divKey(s) { return String(s || '').trim().toLowerCase(); }
    var GROUPED = {};
    Object.keys(DIVISION_GROUPS).forEach(function (g) { DIVISION_GROUPS[g].divisions.forEach(function (d) { GROUPED[divKey(d)] = g; }); });

    function isSLT(p) { return /principal/i.test(p.designation || '') || SLT_EMAILS.indexOf(divKey(p.email)) !== -1; }
    /* Teaching staff: a designation with "teacher" and not "assistant", or Primary Learning Support. Teacher Assistants,
     * counsellors, librarians and coordinators are not. */
    function isTeacher(p) {
        var d = p.designation || '';
        return (/teacher/i.test(d) && !/assistant/i.test(d)) || /primary learning support/i.test(d);
    }
    /* KG & Primary or Secondary: from the division, else from how the designation starts ("Primary …", "Secondary …"). */
    function phaseOf(p) {
        var d = divKey(p.division);
        if (d === 'early years' || d === 'primary') return 'elem';
        if (d === 'secondary') return 'sec';
        var g = divKey(p.designation);
        if (/^(early years|primary|elementary|kg)\b/.test(g)) return 'elem';
        if (/^secondary\b/.test(g)) return 'sec';
        return '';
    }

    function inDivision(p, div) {
        if (!div) return true;
        if (div === '__slt') return isSLT(p);
        if (div === '__teach') return isTeacher(p);
        if (div === '__teach_elem') return isTeacher(p) && phaseOf(p) === 'elem';
        if (div === '__teach_sec') return isTeacher(p) && phaseOf(p) === 'sec';
        if (isSLT(p)) return false;   // the SLT are a group of their own, left out of every other group and division
        var d = divKey(p.division);
        if (div === '__elem') return d === 'early years' || d === 'primary';
        if (DIVISION_GROUPS[div]) return GROUPED[d] === div;
        return d === divKey(div);
    }
    function ovList() { var div = ovDivision(); return DATA.list.filter(function (p) { return inDivision(p, div); }); }

    /* The Division select (Overview's "Showing" and the tracker's): teaching staff, groups, then the divisions no group
     * takes, each with how many people it holds (counted with inDivision, so a count is what the filter shows). An empty
     * one is left out; a division that appears later in HR's data and is in no group still shows up at the bottom. */
    function fillDivisionSelect(sel, allLabel) {
        var cur = sel.value;
        function count(v) { var n = 0; DATA.list.forEach(function (p) { if (inDivision(p, v)) n++; }); return n; }
        sel.textContent = '';
        function opt(parent, v, t) {
            var n = count(v);
            if (!n) return 0;
            var o = document.createElement('option'); o.value = v; o.textContent = t + ' (' + n + ')'; parent.appendChild(o);
            return n;
        }
        function group(label, items) {
            var g = document.createElement('optgroup'); g.label = label;
            var any = 0;
            items.forEach(function (it) { any += opt(g, it[0], it[1]); });
            if (any) sel.appendChild(g);
            return any;
        }
        var o = document.createElement('option'); o.value = ''; o.textContent = allLabel; sel.appendChild(o);
        var hasDivisions = DATA.list.some(function (p) { return p.division; });
        if (!hasDivisions) { sel.value = ''; return false; }
        group('Teaching staff', [['__teach', 'All teaching staff'], ['__teach_elem', 'KG & Primary teaching staff'], ['__teach_sec', 'Secondary teaching staff']]);
        group('Groups', [['__slt', 'Senior Leadership Team (SLT)'], ['__elem', 'Elementary: Early Years + Primary']]
            .concat(Object.keys(DIVISION_GROUPS).map(function (k) { return [k, DIVISION_GROUPS[k].label]; })));
        var raw = {};
        DATA.list.forEach(function (p) {
            var k = divKey(p.division);
            if (k && !GROUPED[k] && !raw[k]) raw[k] = String(p.division).trim();
        });
        group('Divisions', Object.keys(raw).map(function (k) { return raw[k]; }).sort(function (a, b) { return a.localeCompare(b); })
            .map(function (name) { return [name, name]; }));
        sel.value = Array.prototype.some.call(sel.options, function (x) { return x.value === cur; }) ? cur : '';
        return true;
    }

    /* ---- Teams and grade levels (admin-teams.js) ----
     * The faculty list names people; the staff list has addresses. A member with an address is that person; the rest are
     * matched by name: the surname (or a near spelling of it) and the first name, a nickname's first letters ("JP" for Juan
     * Pierre) or a shortened first name. Only a single clear match counts. Who could not be matched is listed under the
     * filter, to correct in admin-teams.js. */
    var TEAMS = window.AISA_TEAMS || [], TEAM_AREAS = window.AISA_TEAM_AREAS || [];
    var teamIndex = null;   // { byTeam: {id: {email: true}}, leads: {email: true}, unmatched: [names] }

    function nameTokens(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
            .replace(/\(.*?\)/g, ' ').replace(/[^a-z]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    }
    function lev(a, b) {
        if (Math.abs(a.length - b.length) > 2) return 3;
        var prev = [], i, j;
        for (j = 0; j <= b.length; j++) prev[j] = j;
        for (i = 1; i <= a.length; i++) {
            var cur = [i];
            for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[b.length];
    }
    function prefixLen(a, b) { var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; }
    function nameScore(listName, staffName) {
        var tm = nameTokens(listName), tp = nameTokens(staffName);
        if (tm.length < 2 || !tp.length) return 0;
        var last = tm[tm.length - 1], surname = tm.slice(1).join(''), joined = tp.join('');
        var surnameOk = joined.indexOf(surname) !== -1 ||
            tp.some(function (t) { return t === last || (last.length >= 5 && lev(t, last) <= 1); });
        if (!surnameOk) return 0;
        var f = tm[0];
        var firstOk = tp.some(function (t) { return t === f || prefixLen(t, f) >= 4; }) ||
            (tp.length > 1 && lev(f, tp[0] + tp[1]) <= 1);
        if (!firstOk && f.length <= 3) {   // initials: "JP" is Juan Pierre
            for (var i = 0; i + f.length <= tp.length; i++) {
                if (tp.slice(i, i + f.length).map(function (t) { return t[0]; }).join('') === f) { firstOk = true; break; }
            }
        }
        if (firstOk) return 2;
        /* Surname only: still the same first initial (a nickname like "Sissy" for Angelique needs an address instead). */
        return tp.some(function (t) { return t[0] === f[0]; }) ? 1 : 0;
    }
    function matchTeams() {
        var byTeam = {}, leads = {}, unmatched = [], cache = {};
        TEAMS.forEach(function (t) {
            byTeam[t.id] = {};
            t.members.forEach(function (m) {
                var name = m[0], email = divKey(m[1]), found = '';
                if (email) found = email;
                else if (cache[name] !== undefined) found = cache[name];
                else {
                    var best = [], good = [];
                    DATA.list.forEach(function (p) {
                        var s = nameScore(name, p.name);
                        if (s === 2) best.push(p.email); else if (s === 1) good.push(p.email);
                    });
                    /* A surname alone is enough only when it is distinctive and nobody else has it. */
                    found = best.length === 1 ? best[0]
                          : (!best.length && good.length === 1 && nameTokens(name).slice(1).join('').length >= 5 ? good[0] : '');
                    cache[name] = found;
                }
                if (found && DATA.byEmail[found]) {
                    byTeam[t.id][found] = true;
                    if (m[2]) leads[found] = true;
                } else unmatched.push(name + ' (' + t.label + ')');
            });
        });
        teamIndex = { byTeam: byTeam, leads: leads, unmatched: unmatched };
    }
    function inTeam(p, v) {
        if (!v) return true;
        if (!teamIndex) return false;
        if (v === '__leads') return !!teamIndex.leads[p.email];
        if (v.indexOf('area:') === 0) {
            var a = v.slice(5), area = TEAM_AREAS.filter(function (x) { return x.id === a; })[0];
            return TEAMS.some(function (t) { return t.area === a && (!area || !area.homeroomOnly || t.homeroom) && teamIndex.byTeam[t.id][p.email]; });
        }
        var set = teamIndex.byTeam[v.slice(5)];
        return !!(set && set[p.email]);
    }
    function fillTeamSelect() {
        var sel = $('tracker-team'), cur = sel.value;
        sel.textContent = '';
        if (!TEAMS.length) { $('tracker-team').closest('label').classList.add('hidden'); return; }
        matchTeams();
        function count(v) { var n = 0; DATA.list.forEach(function (p) { if (inTeam(p, v)) n++; }); return n; }
        function add(parent, v, t) {
            var n = count(v);
            if (!n) return;
            var o = document.createElement('option'); o.value = v; o.textContent = t + ' (' + n + ')'; parent.appendChild(o);
        }
        var o = document.createElement('option'); o.value = ''; o.textContent = 'Every team'; sel.appendChild(o);
        add(sel, '__leads', 'Team leaders (GLLs, HODs)');
        TEAM_AREAS.forEach(function (a) {
            var g = document.createElement('optgroup'); g.label = a.label;
            if (a.all) add(g, 'area:' + a.id, a.all);
            TEAMS.filter(function (t) { return t.area === a.id; }).forEach(function (t) { add(g, 'team:' + t.id, t.label); });
            if (g.children.length) sel.appendChild(g);
        });
        sel.value = Array.prototype.some.call(sel.options, function (x) { return x.value === cur; }) ? cur : '';
        var un = teamIndex.unmatched, box = $('team-unmatched');
        box.classList.toggle('hidden', !un.length);
        if (un.length) {
            box.querySelector('summary').textContent = plural(un.length, 'name') + ' on the faculty list not found on the staff list';
            box.querySelector('p').textContent = un.join(', ') + '. Not signed in yet, or spelled differently: give them an email in admin-teams.js.';
        }
    }

    function moduleStatus(m, list, narrowed) {
        var pop = population(m, list, narrowed);
        var done = pop.filter(function (p) { return p.done[m.id]; });
        var p = pctOf(done.length, pop.length);
        return { m: m, pop: pop, done: done.length, total: pop.length, pct: p,
                 outstanding: pop.filter(function (x) { return !x.done[m.id]; }) };
    }

    /* A compact row (the recommended list): the name, "33% · 20 of 60" and a thin neutral bar. */
    function smallBarRow(s) {
        return '<div class="ad-barrow" title="' + esc(s.m.title + ': ' + s.done + ' of ' + s.total + ' staff') + '">' +
            '<span class="ad-bar-name">' + esc(s.m.title) + '</span>' +
            '<span class="ad-bar-pct">' + s.pct + '% <small class="ad-num">· ' + s.done + ' of ' + s.total + '</small></span>' +
            '<span class="ad-bar" aria-hidden="true"><span style="width:' + s.pct + '%"></span></span></div>';
    }

    function barRow(s, unit, statusColoured) {
        var tone = statusColoured ? statusOf(s.pct) : '';
        return '<div class="ad-barrow">' +
            '<span class="ad-bar-name" title="' + esc(s.m.title) + '">' + esc(s.m.title) + '</span>' +
            '<span class="ad-bar-pct ' + tone + '">' + s.pct + '%</span>' +
            '<span class="ad-bar ' + tone + '" role="img" aria-label="' + s.pct + '% done"><span style="width:' + s.pct + '%"></span></span>' +
            '<span class="ad-bar-meta"><span class="ad-num">' + s.done + ' of ' + s.total + ' ' + esc(unit) + '</span>' +
            (statusColoured && s.outstanding.length
                ? '<a href="#training" class="ad-link" data-goto-module="' + esc(s.m.id) + '">' + s.outstanding.length + ' outstanding</a>'
                : '') +
            '</span></div>';
    }

    function renderOverview() {
        var list = ovList(), narrowed = !!ovDivision();
        var total = list.length;
        var reqDone = 0, completions = 0, hours = 0, never = 0;
        list.forEach(function (p) {
            if (isCompleteFor(p, REQUIRED)) reqDone++;
            MODULES.forEach(function (m) { if (p.done[m.id]) { completions++; hours += m.hours || 0; } });
            if (!p.last_seen) never++;
        });
        var reqPct = pctOf(reqDone, total);

        $('req-pct').textContent = reqPct + '%';
        $('req-pct').className = 'ad-big ' + statusOf(reqPct);
        $('req-n').textContent = '(' + reqDone + ' of ' + total + ')';

        var reqStats = REQUIRED.map(function (m) { return moduleStatus(m, list, narrowed); });
        $('required-bars').innerHTML = reqStats.map(function (s) {
            return barRow(s, s.m.cohort ? 'assigned teachers' : 'staff', true);
        }).join('');
        var recStats = MODULES.filter(function (m) { return !m.required; }).map(function (m) { return moduleStatus(m, list, narrowed); })
            .sort(function (a, b) { return b.pct - a.pct; });
        $('recommended-bars').innerHTML = recStats.map(smallBarRow).join('');

        $('stat-people').textContent = total;
        $('stat-people-sub').textContent = never ? plural(never, 'person', 'people') + ' never signed in' : 'on the staff list or signed in';
        $('stat-required').textContent = reqDone;
        $('stat-required-pct').textContent = total ? reqPct + '%' : '';
        $('stat-completions').textContent = completions;
        $('stat-completions-sub').textContent = total ? (completions / total).toFixed(1) + ' per person, of ' + MODULES.length : '';
        $('stat-hours').textContent = fmtHours(hours);
        $('stat-hours-avg').textContent = total ? fmtHours(Math.round(hours / total * 10) / 10) : '0';

        renderAttention(reqStats, list);
    }

    /* "Needs attention": each item says what and offers the one click that deals with it. Redrawn whenever any part of the
     * data arrives (the goals and engagement parts feed it too). */
    var lastReqStats = null, lastList = null;
    function renderAttention(reqStats, list) {
        if (reqStats) { lastReqStats = reqStats; lastList = list; }
        if (!lastReqStats) return;
        reqStats = lastReqStats; list = lastList;
        var items = [];
        /* A module at 90% or more is on track: it stays on the bars (with its "n outstanding" link), not in this list. */
        reqStats.filter(function (s) { return s.outstanding.length && s.pct < 90; })
            .sort(function (a, b) { return b.outstanding.length - a.outstanding.length; })
            .forEach(function (s) {
                items.push({ tone: statusOf(s.pct), weight: 100 - s.pct,
                    html: '<strong>' + s.outstanding.length + '</strong> ' + (s.m.cohort ? 'assigned teachers' : 'staff') +
                          ' outstanding on <b>' + esc(s.m.title) + '</b><small>' + s.pct + '% done · ' + s.done + ' of ' + s.total + '</small>',
                    label: 'Remind', icon: 'bell',
                    run: function () { openNotify({ targets: sortByName(s.outstanding), mods: [s.m] }); } });
            });
        var low = reqStats.filter(function (s) { return s.total && s.pct < 60; });
        if (low.length) {
            items.push({ tone: 'bad', weight: 90,
                html: '<strong>' + low.length + '</strong> required ' + (low.length === 1 ? 'module is' : 'modules are') + ' under 60%' +
                      '<small>' + esc(low.map(function (s) { return s.m.short; }).join(', ')) + '</small>',
                label: 'View', icon: 'arrow', run: function () { gotoTracker({ view: 'person', cols: 'required', status: 'pending' }); } });
        }
        var never = list.filter(function (p) { return !p.last_seen; }).length;
        if (never) {
            items.push({ tone: 'warn', weight: 20,
                html: '<strong>' + never + '</strong> ' + (never === 1 ? 'person on the staff list has' : 'people on the staff list have') + ' never signed in to the Hub' +
                      '<small>Check HR’s current list to invite them, or take off anyone who has left.</small>',
                label: 'Review', icon: 'arrow', run: function () { go('people', 'sync'); } });
        }
        if (GOALS.outstanding().length) {
            var n = GOALS.outstanding().length;
            items.push({ tone: 'warn', weight: 30,
                html: '<strong>' + n + '</strong> ' + (n === 1 ? 'teacher still owes' : 'teachers still owe') + ' a personal goal' +
                      '<small>' + esc(GOALS.cohortLabel()) + '</small>',
                label: 'Remind', icon: 'bell', run: function () { GOALS.remind(); } });
        }
        var skim = ENG.flaggedPeople();
        if (skim) {
            items.push({ tone: 'warn', weight: 10,
                html: '<strong>' + skim + '</strong> ' + (skim === 1 ? 'person' : 'people') + ' may have skimmed a module' +
                      '<small>Under the module’s skim threshold per chapter.</small>',
                label: 'Review', icon: 'arrow', run: function () { go('engagement'); } });
        }
        var rank = { bad: 0, warn: 1, good: 2 };
        items.sort(function (a, b) { return (rank[a.tone] - rank[b.tone]) || (b.weight - a.weight); });

        var ul = $('attention');
        ul.textContent = '';
        if (!items.length) {
            var li = document.createElement('li');
            li.innerHTML = '<span class="ad-dot good" aria-hidden="true"></span><span class="ad-attn-text">Nothing needs attention right now.</span>';
            ul.appendChild(li);
        }
        items.forEach(function (it) {
            var li = document.createElement('li');
            li.innerHTML = '<span class="ad-dot ' + it.tone + '" aria-hidden="true"></span><span class="ad-attn-text">' + it.html + '</span>';
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'ad-btn sm' + (it.label === 'Remind' ? ' primary' : '');
            b.innerHTML = icon(it.icon) + ' ' + esc(it.label);
            b.addEventListener('click', it.run);
            li.appendChild(b);
            ul.appendChild(li);
        });
        $('attn-count').textContent = items.length ? '· ' + items.length : '';
        var badge = $('tab-overview-badge');
        badge.textContent = items.length;
        badge.classList.toggle('hidden', !items.length);
    }

    $('ov-division').addEventListener('change', function () { if (rendered) renderOverview(); });
    $('panel-overview').addEventListener('click', function (e) {
        var a = e.target.closest('[data-goto-module]');
        if (!a) return;
        e.preventDefault();
        e.stopPropagation();
        gotoTracker({ view: 'training', module: a.getAttribute('data-goto-module'), status: 'pending',
                      division: ovDivision() });
    }, true);

    function sortByName(list) {
        return list.slice().sort(function (a, b) { return (a.name || a.email).localeCompare(b.name || b.email); });
    }

    /* ================================================================ Training tracker */

    var PER_PAGE = 25;
    var T = { view: 'person', page: 0, sortKey: 'name', sortDir: 'asc', selected: {} };

    function trackerMods() {
        if (T.view === 'training') {
            var m = moduleById($('tracker-module').value);
            return [m || REQUIRED[0]];
        }
        return $('tracker-cols').value === 'all' ? MODULES.slice() : REQUIRED.slice();
    }
    function scopeLabel(mods) {
        if (mods.length === 1) return mods[0].title;
        return mods.length === REQUIRED.length && mods.every(function (m) { return m.required; }) ? 'all required modules' : 'all modules';
    }

    /* ---- The Department select, grouped (9 Nov 2026) ----
     * HR's departments are "Phase - detail" ("Primary - Grade 3", "Secondary - PE") or a support office. The select lists
     * them under Early Years & Primary and Secondary (each with an "all" option and the grades or subjects by their short
     * name), then the support offices merged as in DIVISION_GROUPS, then any department left over, so a new one still
     * appears. Values: `__dep_elem` / `__dep_sec` for a whole phase, a DIVISION_GROUPS key, or the department itself. */
    function deptPhase(dep) {
        var d = divKey(dep);
        if (/^(early years|primary|kg)\b/.test(d)) return 'elem';
        if (/^secondary\b/.test(d)) return 'sec';
        return '';
    }
    function inDepartment(p, v) {
        if (!v) return true;
        if (v === '__dep_elem') return deptPhase(p.department) === 'elem';
        if (v === '__dep_sec') return deptPhase(p.department) === 'sec';
        if (DIVISION_GROUPS[v]) return GROUPED[divKey(p.department)] === v;
        return divKey(p.department) === divKey(v);
    }
    /* "Primary - Grade 3" → "Grade 3"; "Early Years - KG1" → "KG1"; "Primary Arabic" → "Arabic"; "Primary" → "Primary, no grade given". */
    function deptShort(dep) {
        var t = String(dep).trim(), m = t.match(/^(early years|primary|secondary)\s*[-–:]\s*(.+)$/i);
        if (m) return m[2].trim();
        m = t.match(/^(early years|primary|secondary)\s+(.+)$/i);
        if (m) return m[2].trim();
        return t + (deptPhase(t) === 'sec' ? ', no subject given' : ', no grade given');
    }
    function deptOrder(label) {
        var m = label.match(/^kg\s*(\d)/i);
        if (m) return [0, Number(m[1]), label];
        m = label.match(/^grade\s*(\d+)/i);
        if (m) return [1, Number(m[1]), label];
        return [/, no (grade|subject) given$/.test(label) ? 3 : 2, 0, label];
    }
    function fillDepartmentSelect() {
        var sel = $('tracker-department'), cur = sel.value;
        sel.textContent = '';
        function count(v) { var n = 0; DATA.list.forEach(function (p) { if (inDepartment(p, v)) n++; }); return n; }
        function add(parent, v, t) {
            var n = count(v);
            if (!n) return 0;
            var o = document.createElement('option'); o.value = v; o.textContent = t + ' (' + n + ')'; parent.appendChild(o);
            return n;
        }
        function group(label, items) {
            var g = document.createElement('optgroup'); g.label = label;
            items.forEach(function (it) { add(g, it[0], it[1]); });
            if (g.children.length) sel.appendChild(g);
        }
        var o = document.createElement('option'); o.value = ''; o.textContent = 'All departments'; sel.appendChild(o);
        var raw = {};
        DATA.list.forEach(function (p) { var k = divKey(p.department); if (k && !raw[k]) raw[k] = String(p.department).trim(); });
        var names = Object.keys(raw).map(function (k) { return raw[k]; });
        function phaseItems(phase, allValue, allLabel) {
            var list = names.filter(function (n) { return deptPhase(n) === phase; })
                .map(function (n) { return [n, deptShort(n)]; })
                .sort(function (a, b) {
                    var x = deptOrder(a[1]), y = deptOrder(b[1]);
                    return (x[0] - y[0]) || (x[1] - y[1]) || x[2].localeCompare(y[2]);
                });
            return [[allValue, allLabel]].concat(list);
        }
        group('Early Years & Primary', phaseItems('elem', '__dep_elem', 'All Early Years & Primary'));
        group('Secondary', phaseItems('sec', '__dep_sec', 'All Secondary'));
        var support = Object.keys(DIVISION_GROUPS).map(function (k) { return [k, DIVISION_GROUPS[k].label]; });
        var rest = names.filter(function (n) { return !deptPhase(n) && !GROUPED[divKey(n)]; })
            .sort(function (a, b) { return a.localeCompare(b); }).map(function (n) { return [n, n]; });
        group('Support & other departments', support.concat(rest));
        sel.value = Array.prototype.some.call(sel.options, function (x) { return x.value === cur; }) ? cur : '';
    }

    /* Division, team, department and designation: "More filters". */
    var GROUP_FILTERS = ['tracker-division', 'tracker-team', 'tracker-department', 'tracker-designation'];
    function inGroup(p) {
        var div = $('tracker-division').value, dep = $('tracker-department').value, des = $('tracker-designation').value;
        if (!inDivision(p, div)) return false;
        if (!inTeam(p, $('tracker-team').value)) return false;
        if (!inDepartment(p, dep)) return false;
        if (des && (p.designation || '') !== des) return false;
        return true;
    }
    function fillGroupFilters() {
        var any = DATA.list.some(function (p) { return p.division || p.department || p.designation; });
        $('more-filters-empty').classList.toggle('hidden', any);
        ['tracker-division', 'tracker-department', 'tracker-designation'].forEach(function (id) {
            $(id).closest('label').classList.toggle('hidden', !any);
        });
        fillDivisionSelect($('tracker-division'), 'All divisions');
        function count(key) { var c = {}; DATA.list.forEach(function (p) { if (p[key]) c[p[key]] = (c[p[key]] || 0) + 1; }); return c; }
        function fill(id, all, counts) {
            var el = $(id), cur = el.value;
            el.textContent = '';
            function add(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; el.appendChild(o); }
            add('', all);
            Object.keys(counts).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (k) { add(k, k + ' (' + counts[k] + ')'); });
            el.value = Array.prototype.some.call(el.options, function (o) { return o.value === cur; }) ? cur : '';
        }
        fillDepartmentSelect();
        fill('tracker-designation', 'All designations', count('designation'));
        fillTeamSelect();
        var hasOv = fillDivisionSelect($('ov-division'), 'All staff');
        $('ov-division').closest('label').classList.toggle('hidden', !hasOv);
    }
    function groupFilterCount() {
        return GROUP_FILTERS.filter(function (id) { return $(id).value; }).length;
    }

    function buildTrackerOptions() {
        var sel = $('tracker-module'), keep = sel.value;
        function opt(m) { return '<option value="' + esc(m.id) + '">' + esc(m.title) + '</option>'; }
        sel.innerHTML =
            '<optgroup label="Required">' + MODULES.filter(function (m) { return m.required; }).map(opt).join('') + '</optgroup>' +
            '<optgroup label="Recommended">' + MODULES.filter(function (m) { return !m.required; }).map(opt).join('') + '</optgroup>' +
            '<optgroup label="Other">' + EXTRA.map(opt).join('') + '</optgroup>';
        sel.value = keep && moduleById(keep) ? keep : REQUIRED[0].id;
    }

    /* The people the tracker is about, before the status filter: the cohort for a cohort module on its own, else everyone. */
    function trackerBase(mods) {
        var q = ($('filter-text').value || '').toLowerCase().trim();
        var source = (mods.length === 1 && mods[0].cohort) ? cohortRows() : DATA.list;
        return source.filter(function (p) {
            if (!inGroup(p)) return false;
            if (q && ((p.name || '') + ' ' + p.email + ' ' + (p.department || '')).toLowerCase().indexOf(q) === -1) return false;
            return true;
        });
    }
    function trackerRows(mods) {
        var status = $('tracker-status').value;
        return trackerBase(mods).filter(function (p) {
            if (!status) return true;
            var done = isCompleteFor(p, mods);
            return status === 'done' ? done : !done;
        });
    }

    function sortValue(p, mods) {
        var k = T.sortKey;
        if (k.indexOf('mod:') === 0) { var id = k.slice(4); return p.done[id] ? 2 : (applies(moduleById(id) || {}, p.email) ? 0 : 1); }
        switch (k) {
            case 'seen':      return p.last_seen ? (Date.parse(p.last_seen) || 0) : 0;
            case 'done':      return mods.filter(function (m) { return p.done[m.id]; }).length;
            case 'status':    return isCompleteFor(p, mods) ? 1 : 0;
            case 'completed': return p.done[mods[0].id] ? (Date.parse(p.done[mods[0].id]) || 0) : 0;
            default:          return (p.name || p.email || '').toLowerCase();
        }
    }
    function sortPeople(list, mods) {
        var dir = T.sortDir === 'asc' ? 1 : -1;
        return list.slice().sort(function (a, b) {
            var va = sortValue(a, mods), vb = sortValue(b, mods);
            if (va < vb) return -dir;
            if (va > vb) return dir;
            return (a.name || a.email || '').localeCompare(b.name || b.email || '');
        });
    }

    function mark(state, label) {
        if (state === 'yes') return '<span class="ad-mark yes" title="' + esc(label) + ': done"><svg aria-hidden="true"><use href="#i-check"/></svg><span class="ad-sr">done</span></span>';
        if (state === 'no') return '<span class="ad-mark no" title="' + esc(label) + ': not done"><svg aria-hidden="true"><use href="#i-x"/></svg><span class="ad-sr">not done</span></span>';
        return '<span class="ad-mark na" title="' + esc(label) + ': not assigned">–<span class="ad-sr">not assigned</span></span>';
    }

    function th(label, key, cls) {
        var sorted = T.sortKey === key;
        var aria = sorted ? (T.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
        return '<th class="' + (cls || '') + '" data-sort="' + esc(key) + '" aria-sort="' + aria + '"><button type="button" class="ad-th">' +
               esc(label) + (sorted ? (T.sortDir === 'asc' ? ' ▲' : ' ▼') : '') + '</button></th>';
    }

    function renderTracker() {
        if (!DATA) return;
        var mods = trackerMods(), single = T.view === 'training' ? mods[0] : null;
        var base = trackerBase(mods);
        var rows = sortPeople(trackerRows(mods), mods);
        var outstandingN = base.filter(function (p) { return !isCompleteFor(p, mods); }).length;
        T.page = clampPage(T.page, rows.length, PER_PAGE);
        var page = rows.slice(T.page * PER_PAGE, (T.page + 1) * PER_PAGE);

        var allSel = rows.length > 0 && rows.every(function (p) { return T.selected[p.email]; });
        var someSel = rows.some(function (p) { return T.selected[p.email]; });
        var head = '<th class="ad-cb"><input type="checkbox" id="tracker-all" aria-label="Select all ' + rows.length + ' who match"' + (allSel ? ' checked' : '') + '></th>' +
                   th('Staff member', 'name');
        if (single) {
            head += th('Status', 'status') + th('Completed on', 'completed', 'r');
        } else {
            mods.forEach(function (m) { head += th(m.short, 'mod:' + m.id, 'c'); });
            head += th('Done', 'done', 'r');
        }
        head += th('Last seen', 'seen', 'r');
        $('matrix-head').innerHTML = head;
        var all = $('tracker-all');
        all.indeterminate = someSel && !allSel;

        $('matrix-body').innerHTML = page.map(function (p) {
            var sel = !!T.selected[p.email];
            var cells = '<td class="ad-cb"><input type="checkbox" data-email="' + esc(p.email) + '" aria-label="Select ' + esc(p.name || p.email) + '"' + (sel ? ' checked' : '') + '></td>' +
                '<td class="main"><div class="ad-person"><b>' + esc(p.name || p.email) + '</b>' + (p.name ? '<span>' + esc(p.email) + '</span>' : '') + '</div></td>';
            if (single) {
                var at = p.done[single.id];
                cells += '<td data-label="Status">' + (at ? '<span class="ad-pill good">Completed</span>' : '<span class="ad-pill bad">Not yet</span>') + '</td>' +
                         '<td class="r" data-label="Completed on">' + (fmtDate(at) || '—') + '</td>';
            } else {
                var n = 0, of = 0;
                mods.forEach(function (m) {
                    var ok = applies(m, p.email);
                    if (ok) { of++; if (p.done[m.id]) n++; }
                    cells += '<td class="c" data-label="' + esc(m.short) + '">' + mark(!ok ? 'na' : (p.done[m.id] ? 'yes' : 'no'), m.title) + '</td>';
                });
                cells += '<td class="r" data-label="Done"><b>' + n + '/' + of + '</b></td>';
            }
            cells += '<td class="r" data-label="Last seen">' + (p.neverSeen || !p.last_seen ? '<span class="ad-meta">never</span>' : fmtDate(p.last_seen)) + '</td>';
            return '<tr' + (sel ? ' class="sel"' : '') + '>' + cells + '</tr>';
        }).join('');

        $('matrix-empty').classList.toggle('hidden', rows.length > 0);
        renderPager($('tracker-pager'), T.page, rows.length, PER_PAGE, function (pg) { T.page = pg; renderTracker(); $('matrix').scrollIntoView({ block: 'nearest' }); });

        var doneN = base.length - outstandingN;
        $('tracker-title-count').textContent = '· ' + outstandingN + ' outstanding';
        $('tracker-count').innerHTML = '<strong>' + rows.length + '</strong> shown of ' + base.length + (single && single.cohort ? ' assigned teachers' : ' people') +
            ' · <strong>' + doneN + '</strong> completed · <strong>' + outstandingN + '</strong> outstanding <span>(' + esc(scopeLabel(mods)) + ')</span>';

        var targets = remindTargets(false);
        $('notify-btn').disabled = targets.length === 0;
        $('notify-btn-label').textContent = targets.length ? 'Remind ' + targets.length + ' outstanding' : 'Nobody outstanding';

        var nSel = Object.keys(T.selected).length;
        $('tracker-bulk').classList.toggle('hidden', !nSel);
        if (nSel) {
            var selTargets = remindTargets(true);
            $('tracker-bulk-n').textContent = plural(nSel, 'person', 'people') + ' selected' + (selTargets.length !== nSel ? ' · ' + selTargets.length + ' outstanding' : '');
            $('tracker-bulk-remind').disabled = !selTargets.length;
        }
        var nf = groupFilterCount();
        $('more-filters-n').textContent = nf;
        $('more-filters-n').classList.toggle('hidden', !nf);
        $('export-btn').classList.remove('hidden');
    }

    /* Who a reminder goes to: the selected people still outstanding, or everyone outstanding in the view. */
    function remindTargets(selectedOnly) {
        var mods = trackerMods();
        var list = selectedOnly
            ? trackerBase(mods).filter(function (p) { return T.selected[p.email]; })
            : trackerRows(mods);
        return sortPeople(list.filter(function (p) { return !isCompleteFor(p, mods); }), mods);
    }

    function setView(view) {
        T.view = view;
        $('view-person').setAttribute('aria-pressed', view === 'person' ? 'true' : 'false');
        $('view-training').setAttribute('aria-pressed', view === 'training' ? 'true' : 'false');
        $('tracker-cols-wrap').classList.toggle('hidden', view !== 'person');
        $('tracker-module-wrap').classList.toggle('hidden', view !== 'training');
        T.sortKey = 'name'; T.sortDir = 'asc'; T.page = 0; T.selected = {};
    }

    /* From elsewhere on the page: open the tracker on a view. */
    function gotoTracker(o) {
        setView(o.view || 'person');
        if (o.cols) $('tracker-cols').value = o.cols;
        if (o.module && moduleById(o.module)) $('tracker-module').value = o.module;
        if (o.status != null) $('tracker-status').value = o.status;
        $('filter-text').value = '';
        ['tracker-team', 'tracker-department', 'tracker-designation'].forEach(function (id) { $(id).value = ''; });
        $('tracker-division').value = o.division || '';
        renderTracker();
        go('training');
    }

    function refreshTracker() { T.page = 0; renderTracker(); }
    $('view-person').addEventListener('click', function () { setView('person'); renderTracker(); });
    $('view-training').addEventListener('click', function () { setView('training'); renderTracker(); });
    $('tracker-cols').addEventListener('change', function () { T.sortKey = 'name'; T.sortDir = 'asc'; refreshTracker(); });
    $('tracker-module').addEventListener('change', function () { T.sortKey = 'name'; T.sortDir = 'asc'; T.selected = {}; refreshTracker(); });
    $('tracker-status').addEventListener('change', refreshTracker);
    $('filter-text').addEventListener('input', refreshTracker);
    GROUP_FILTERS.forEach(function (id) { $(id).addEventListener('change', refreshTracker); });
    $('tracker-reset').addEventListener('click', function () {
        $('tracker-cols').value = 'required';
        $('tracker-status').value = 'pending';
        $('filter-text').value = '';
        GROUP_FILTERS.forEach(function (id) { $(id).value = ''; });
        setView(T.view);
        renderTracker();
    });
    $('matrix-head').addEventListener('click', function (e) {
        var t = e.target.closest('th[data-sort]');
        if (!t || !rendered) return;
        var k = t.getAttribute('data-sort');
        if (k === T.sortKey) T.sortDir = T.sortDir === 'asc' ? 'desc' : 'asc';
        else { T.sortKey = k; T.sortDir = k === 'name' ? 'asc' : 'desc'; }
        renderTracker();
    });
    $('matrix-head').addEventListener('change', function (e) {
        if (e.target.id !== 'tracker-all') return;
        var rows = trackerRows(trackerMods());
        rows.forEach(function (p) { if (e.target.checked) T.selected[p.email] = true; else delete T.selected[p.email]; });
        renderTracker();
    });
    $('matrix-body').addEventListener('change', function (e) {
        var email = e.target.getAttribute && e.target.getAttribute('data-email');
        if (!email) return;
        if (e.target.checked) T.selected[email] = true; else delete T.selected[email];
        renderTracker();
    });
    $('tracker-bulk-clear').addEventListener('click', function () { T.selected = {}; renderTracker(); });
    $('tracker-bulk-remind').addEventListener('click', function () { openNotify({ targets: remindTargets(true), mods: trackerMods() }); });
    $('notify-btn').addEventListener('click', function () { openNotify({ targets: remindTargets(false), mods: trackerMods() }); });

    /* Exports what is on screen (every page of it): the same view, filters and order. */
    $('export-btn').addEventListener('click', function () {
        var mods = trackerMods(), rows = sortPeople(trackerRows(mods), mods);
        var lines = [['Name', 'Email', 'Division', 'Department', 'Designation', 'Last seen']
            .concat(mods.map(function (m) { return m.short; })).concat(['Completed']).map(csvCell).join(',')];
        rows.forEach(function (p) {
            var n = mods.filter(function (m) { return p.done[m.id]; }).length;
            lines.push([p.name || '', p.email, p.division || '', p.department || '', p.designation || '', fmtDate(p.last_seen)]
                .concat(mods.map(function (m) { return !applies(m, p.email) ? 'n/a' : (p.done[m.id] ? 'Yes' : 'No'); }))
                .concat([n + '/' + mods.length]).map(csvCell).join(','));
        });
        downloadCsv('aisa-pd-compliance', lines);
    });

    /* ================================================================ the reminder dialog */

    var NOTIFY_BATCH = 200;   // post_notification takes at most 200 addresses
    var notifyCtx = null, notifyOpener = null;

    function moduleUrl(m) {
        if (!m || !m.file) return '';
        try {
            var u = new URL(m.file, location.href).href;
            return /^https?:/i.test(u) ? u : '';
        } catch (e) { return ''; }
    }
    function defaultMessage(mods) {
        if (mods.length === 1) {
            var m = mods[0], url = moduleUrl(m);
            return { title: 'Reminder: complete ' + m.title,
                     body: 'Our records show you haven\'t completed "' + m.title + '" yet.\n\n' +
                           (url ? 'Open the training here: ' + url + '\n\n' : '') + 'Please complete it as soon as you can — thank you!' };
        }
        return { title: 'Reminder: outstanding PD training',
                 body: 'Our records show you still have training to complete:\n\n' + mods.map(function (x) { return '• ' + x.title; }).join('\n') +
                       '\n\nOpen the Learning Hub to finish up — thank you!' };
    }
    function notifyLinkFor(mods) {
        if (mods.length === 1) { var u = moduleUrl(mods[0]); if (u) return { url: u, label: 'Open the training' }; }
        try {
            var d = new URL('dashboard.html', location.href).href;
            if (/^https?:/i.test(d)) return { url: d, label: 'Open the Learning Hub' };
        } catch (e) { /* falls through */ }
        return { url: '', label: '' };
    }
    function updateDeliveryNote() {
        var n = notifyCtx ? notifyCtx.targets.length : 0;
        $('notify-delivery-note').textContent = $('notify-email').checked
            ? 'Emails ' + plural(n, 'person', 'people') + ' and posts to their notification bell.'
            : 'Posts to their notification bell only: they see it next time they sign in.';
    }
    function setNotifyStatus(text, kind) {
        var el = $('notify-status');
        el.textContent = text || '';
        el.className = 'ad-msg' + (kind ? ' ' + kind : '');
    }
    function openNotify(ctx) {
        if (!ctx || !ctx.targets.length) return;
        notifyCtx = ctx;
        notifyOpener = document.activeElement;
        var msg = defaultMessage(ctx.mods);
        $('notify-title').value = msg.title;
        $('notify-body').value = msg.body;
        $('notify-modal-sub').textContent = plural(ctx.targets.length, 'person has', 'people have') + ' not completed ' + scopeLabel(ctx.mods) + '.';
        $('notify-recipients').innerHTML = ctx.targets.map(function (p) {
            return '<div><b>' + esc(p.name || '—') + '</b><span>' + esc(p.email) + '</span></div>';
        }).join('');
        var many = ctx.targets.length > NOTIFY_BATCH;
        $('notify-cap').classList.toggle('hidden', !many);
        if (many) $('notify-cap').textContent = 'Over ' + NOTIFY_BATCH + ' recipients: it goes out in ' + Math.ceil(ctx.targets.length / NOTIFY_BATCH) + ' batches.';
        /* Always reopens with email on: a remembered opt-out would quietly send bell-only reminders. */
        $('notify-email').checked = true;
        updateDeliveryNote();
        setNotifyStatus('');
        $('notify-send').disabled = false;
        $('notify-modal').classList.remove('hidden');
        $('notify-title').focus();
    }
    function closeNotify() {
        if ($('notify-modal').classList.contains('hidden')) return;
        $('notify-modal').classList.add('hidden');
        if (notifyOpener && notifyOpener.focus && document.body.contains(notifyOpener)) notifyOpener.focus();
    }
    function sendNotify() {
        var title = $('notify-title').value.trim(), body = $('notify-body').value.trim();
        if (!title && !body) { setNotifyStatus('Add a title or a message first.', 'error'); return; }
        var emails = notifyCtx.targets.map(function (p) { return p.email; });
        var wantEmail = $('notify-email').checked;
        var link = notifyLinkFor(notifyCtx.mods);
        var opts = wantEmail ? { sendEmail: true, emailLink: link.url, emailLinkLabel: link.label } : null;
        var batches = [];
        for (var i = 0; i < emails.length; i += NOTIFY_BATCH) batches.push(emails.slice(i, i + NOTIFY_BATCH));
        var btn = $('notify-send');
        btn.disabled = true;
        setNotifyStatus(wantEmail ? 'Sending emails…' : 'Sending…');
        var tally = { sent: 0, failed: 0, skipped: 0, supported: true };
        batches.reduce(function (chain, batch) {
            return chain.then(function () {
                return AUTH.postNotification(title, body, [], batch, opts).then(function (res) {
                    if (res && res.ok === false) throw new Error(res.error || 'post_failed');
                    if (wantEmail) {
                        if (res && res.email) {
                            tally.sent += res.email.sent || 0; tally.failed += res.email.failed || 0; tally.skipped += res.email.skipped || 0;
                        } else tally.supported = false;
                    }
                });
            });
        }, Promise.resolve()).then(function () {
            var who = plural(emails.length, 'person', 'people');
            if (!wantEmail) setNotifyStatus('Posted to ' + who + '’s notification bell.', 'ok');
            else if (!tally.supported) {
                setNotifyStatus('Posted to ' + who + '’s notification bell, but NO emails were sent: the backend needs updating.', 'error');
                btn.disabled = false;
                return;
            } else {
                var m = 'Reminder sent to ' + who + ': ' + tally.sent + ' emailed';
                if (tally.failed) m += ', ' + tally.failed + ' failed';
                if (tally.skipped) m += ', ' + tally.skipped + ' skipped (daily email allowance)';
                setNotifyStatus(m + '.', tally.failed || tally.skipped ? 'error' : 'ok');
            }
            T.selected = {};
            if (rendered) renderTracker();
            setTimeout(closeNotify, tally.failed || tally.skipped ? 4000 : 1600);
        }).catch(function (err) {
            console.warn('AISA: reminder failed', err);
            setNotifyStatus('Could not send the reminder. Please try again.', 'error');
            btn.disabled = false;
        });
    }
    $('notify-close').addEventListener('click', closeNotify);
    $('notify-cancel').addEventListener('click', closeNotify);
    $('notify-backdrop').addEventListener('click', closeNotify);
    $('notify-send').addEventListener('click', sendNotify);
    $('notify-email').addEventListener('change', updateDeliveryNote);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !$('notify-modal').classList.contains('hidden')) closeNotify();
        /* Keep Tab inside the dialog while it is open. */
        if (e.key === 'Tab' && !$('notify-modal').classList.contains('hidden')) {
            var f = Array.prototype.filter.call($('notify-modal').querySelectorAll('button, input, textarea'), function (x) { return !x.disabled; });
            var first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });

    /* ================================================================ Engagement */

    var ENG = (function () {
        var ROWS = [], loaded = false, page = 0, PER = 20;
        var OVR_KEY = 'aisa_admin_skim_v1';
        var overrides = {};
        try { overrides = JSON.parse(storeGet(OVR_KEY) || '{}') || {}; } catch (e) { overrides = {}; }

        /* The default threshold follows the module: a third of its median seconds per chapter, between 10 and 120 seconds.
         * With fewer than 5 people there is no typical pace yet, so it is the old rule, 30 seconds. */
        function defaultThreshold(med, n) {
            if (n < 5 || !med) return 30;
            return Math.max(10, Math.min(120, Math.round(med / 3)));
        }
        var stats = {};
        function computeStats() {
            stats = {};
            var by = {};
            ROWS.forEach(function (r) { (by[r.module_id] = by[r.module_id] || []).push(r); });
            Object.keys(by).forEach(function (id) {
                var rs = by[id];
                var withChapters = rs.filter(function (r) { return r.chapters_seen > 0 && r.avg_secs_per_chapter > 0; });
                var medAvg = median(withChapters.map(function (r) { return Number(r.avg_secs_per_chapter) || 0; }));
                var def = defaultThreshold(medAvg, withChapters.length);
                var thr = overrides[id] > 0 ? overrides[id] : def;
                stats[id] = { id: id, n: rs.length, medTotal: median(rs.map(function (r) { return r.total_seconds || 0; })),
                    medAvg: medAvg, def: def, thr: thr, custom: overrides[id] > 0,
                    skimmed: rs.filter(function (r) { return isSkim(r, thr); }).length };
            });
        }
        function isSkim(r, thr) {
            if (thr == null) thr = stats[r.module_id] ? stats[r.module_id].thr : 30;
            return r.chapters_seen > 0 && r.avg_secs_per_chapter > 0 && r.avg_secs_per_chapter < thr;
        }
        function order(id) { var i = MODULES.map(function (m) { return m.id; }).indexOf(id); return i === -1 ? 999 : i; }

        function renderSummary() {
            var ids = Object.keys(stats).sort(function (a, b) { return order(a) - order(b) || a.localeCompare(b); });
            $('eng-summary').innerHTML = ids.map(function (id) {
                var s = stats[id];
                var p = pctOf(s.skimmed, s.n);
                return '<tr>' +
                    '<td class="main"><b>' + esc(moduleTitle(id)) + '</b></td>' +
                    '<td class="r" data-label="People">' + s.n + '</td>' +
                    '<td class="r" data-label="Median time">' + fmtSecs(s.medTotal) + '</td>' +
                    '<td class="r" data-label="Median per chapter">' + (s.medAvg ? fmtSecs(Math.round(s.medAvg)) : '—') + '</td>' +
                    '<td class="r" data-label="Skim threshold"><label><span class="ad-sr">Skim threshold for ' + esc(moduleTitle(id)) + ', seconds per chapter</span>' +
                        '<input type="number" class="ad-thr" min="5" max="600" step="1" data-thr="' + esc(id) + '" value="' + s.thr + '"></label> s' +
                        (s.custom ? ' <button type="button" class="ad-link" data-thr-reset="' + esc(id) + '" title="Back to ' + s.def + 's">reset</button>' : '') + '</td>' +
                    '<td class="r" data-label="Skimmed"><b>' + s.skimmed + '</b> <span class="ad-meta">(' + p + '%)</span></td>' +
                    '</tr>';
            }).join('');
            $('eng-sum-count').textContent = ids.length ? '· ' + plural(ids.length, 'module') : '';
            $('eng-summary').closest('.ad-tablewrap').classList.toggle('hidden', !ids.length);
        }

        function people() {
            var mod = $('dwell-module-filter').value, q = ($('dwell-search').value || '').trim().toLowerCase();
            var flaggedOnly = $('dwell-flagged').checked, by = {};
            ROWS.forEach(function (r) {
                if (mod && r.module_id !== mod) return;
                var k = r.email;
                if (!by[k]) by[k] = { email: r.email, name: r.name || '', rows: [], flags: 0, total: 0 };
                if (r.name && !by[k].name) by[k].name = r.name;
                var flag = isSkim(r);
                by[k].rows.push({ r: r, flag: flag });
                by[k].total += r.total_seconds || 0;
                if (flag) by[k].flags++;
            });
            var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (p) {
                if (flaggedOnly && !p.flags) return false;
                if (q && (p.name + ' ' + p.email).toLowerCase().indexOf(q) === -1) return false;
                return true;
            });
            var sort = $('dwell-sort').value;
            list.sort(function (a, b) {
                if (sort === 'total') return b.total - a.total;
                if (sort === 'flags' && a.flags !== b.flags) return b.flags - a.flags;
                return (a.name || a.email).localeCompare(b.name || b.email);
            });
            return list;
        }

        function renderPeople() {
            var flaggedOnly = $('dwell-flagged').checked;
            var list = people();
            page = clampPage(page, list.length, PER);
            var shown = list.slice(page * PER, (page + 1) * PER);
            $('dwell-body').innerHTML = shown.map(function (p) {
                var rows = p.rows.filter(function (x) { return !flaggedOnly || x.flag; })
                    .sort(function (a, b) { return (b.flag - a.flag) || order(a.r.module_id) - order(b.r.module_id); });
                return '<tr>' +
                    '<td class="main"><div class="ad-person"><b>' + esc(p.name || p.email) + '</b>' + (p.name ? '<span>' + esc(p.email) + '</span>' : '') + '</div></td>' +
                    '<td class="stack" data-label="Modules"><ul class="ad-flaglist">' + rows.map(function (x) {
                        var r = x.r;
                        return '<li class="' + (x.flag ? 'flag' : '') + '"><span>' + esc(moduleTitle(r.module_id)) + (x.flag ? ' · skimmed' : '') + '</span>' +
                            '<span>' + fmtSecs(Math.round(r.avg_secs_per_chapter || 0)) + ' / chapter · ' + plural(r.chapters_seen || 0, 'chapter') + ' · ' + fmtSecs(r.total_seconds) + '</span></li>';
                    }).join('') + '</ul></td>' +
                    '<td class="r" data-label="Total time">' + fmtSecs(p.total) + '</td>' +
                    '</tr>';
            }).join('');
            var none = !list.length;
            $('dwell-table-wrap').classList.toggle('hidden', none);
            $('dwell-people-empty').classList.toggle('hidden', !none || !ROWS.length);
            $('dwell-people-empty').textContent = flaggedOnly ? 'No one is flagged for these filters.' : 'No one matches these filters.';
            renderPager($('dwell-pager'), page, list.length, PER, function (pg) { page = pg; renderPeople(); });
            var flagged = flaggedPeople();
            $('eng-flag-count').textContent = '· ' + flagged + ' flagged';
        }

        function flaggedPeople() {
            var seen = {};
            ROWS.forEach(function (r) { if (isSkim(r)) seen[r.email] = true; });
            return Object.keys(seen).length;
        }

        function buildModuleFilter() {
            var sel = $('dwell-module-filter'), keep = sel.value, ids = {};
            ROWS.forEach(function (r) { ids[r.module_id] = true; });
            sel.innerHTML = '<option value="">All modules</option>' + Object.keys(ids).sort(function (a, b) { return order(a) - order(b); })
                .map(function (id) { return '<option value="' + esc(id) + '">' + esc(moduleTitle(id)) + '</option>'; }).join('');
            if (keep && ids[keep]) sel.value = keep;
        }

        function renderAll() {
            computeStats();
            renderSummary();
            renderPeople();
            renderAttention();
        }

        function setRows(rows) {
            ROWS = Array.isArray(rows) ? rows : [];
            loaded = true;
            $('dwell-empty').textContent = 'No engagement data yet: time appears here as teachers work through PD modules.';
            $('dwell-empty').classList.toggle('hidden', ROWS.length > 0);
            buildModuleFilter();
            renderAll();
        }

        $('eng-summary').addEventListener('change', function (e) {
            var id = e.target.getAttribute('data-thr');
            if (!id) return;
            var v = Math.round(Number(e.target.value));
            if (!(v >= 5 && v <= 600)) { e.target.value = stats[id].thr; return; }
            if (v === stats[id].def) delete overrides[id]; else overrides[id] = v;
            storeSet(OVR_KEY, Object.keys(overrides).length ? JSON.stringify(overrides) : null);
            renderAll();
        });
        $('eng-summary').addEventListener('click', function (e) {
            var id = e.target.getAttribute && e.target.getAttribute('data-thr-reset');
            if (!id) return;
            delete overrides[id];
            storeSet(OVR_KEY, Object.keys(overrides).length ? JSON.stringify(overrides) : null);
            renderAll();
        });
        ['dwell-flagged', 'dwell-module-filter', 'dwell-sort'].forEach(function (id) { $(id).addEventListener('change', function () { page = 0; renderPeople(); }); });
        $('dwell-search').addEventListener('input', function () { page = 0; renderPeople(); });

        return { setRows: setRows, flaggedPeople: function () { return loaded ? flaggedPeople() : 0; } };
    })();
    window.renderDwell = ENG.setRows;

    function applyDwell(dw) {
        if (!dw) return;
        if (dw.ok) {
            $('dwell-needs-migration').classList.add('hidden');
            ENG.setRows(dw.rows || []);
        } else if (dw.error === 'dwell_sheet_needs_migration') {
            $('dwell-needs-migration').classList.remove('hidden');
            $('dwell-empty').textContent = 'No engagement data to show until the dwell sheet is migrated.';
        } else {
            console.warn('AISA: admin dwell failed', dw);
            $('dwell-empty').textContent = 'Couldn’t load engagement (' + (dw.error || 'error') + '). Use Refresh at the top to try again.';
        }
    }

    /* ================================================================ AI & Innovation Survey */

    function renderInnovation() {
        var m = moduleById('survey');
        if (!m || !DATA) return;
        var s = moduleStatus(m, DATA.list, false);
        $('innov-bar').innerHTML = barRow(s, 'staff', false);
        $('innov-title-count').textContent = '· ' + s.done + ' of ' + s.total + ' done';
        $('sv-innovation-badge').textContent = s.pct + '%';
        $('sv-innovation-badge').classList.remove('hidden');
        $('innov-open').disabled = !s.outstanding.length;
    }
    $('innov-open').addEventListener('click', function () { gotoTracker({ view: 'training', module: 'survey', status: 'pending' }); });

    /* ================================================================ AI Literacy readiness (archived) */

    var READINESS = (function () {
        var MODULE_ID = 'ai-curriculum-readiness';
        var rows = [];
        var PRIMARY = [
            { seg: 'lesson', key: 'needs_before', label: 'Needs from me before the 21st', key2: true },
            { seg: 'lesson', key: 'unsure',       label: 'Least sure about' },
            { seg: 'commit', key: 'question',     label: 'Question for 21 September' }
        ];
        var SECONDARY = [
            { seg: 'lesson', key: 'outcome',  label: 'Lesson outcome' },
            { seg: 'lesson', key: 'hook',     label: 'Hook' },
            { seg: 'lesson', key: 'moves',    label: 'Facilitation moves' },
            { seg: 'lesson', key: 'evidence', label: 'Evidence of thinking' },
            { seg: 'thinking', key: 'repair', label: 'Ms Hana rewrite' },
            { seg: 'quality', key: 'which',    label: 'Which sample shows more learning' },
            { seg: 'quality', key: 'question', label: 'Question for sample A' },
            { seg: 'commit',  key: 'will_do',  label: 'Will do differently' }
        ];
        function val(r, seg, key) { var s = r.data && r.data[seg]; var v = s ? s[key] : ''; return (v == null || v === false) ? '' : String(v).trim(); }
        function isDone(r) { return !!r.completed_at; }
        function isBlocked(r) { return val(r, 'lesson', 'blocked') === 'true'; }
        function needsHelp(r) { return !!val(r, 'lesson', 'needs_before'); }
        function isFlagged(r) { return r.flagged || needsHelp(r) || isBlocked(r); }
        function answer(label, text, key) {
            return text ? '<div class="ad-answer' + (key ? ' key' : '') + '"><div>' + esc(label) + '</div><div>' + esc(text) + '</div></div>' : '';
        }
        function card(r) {
            var pills = [isDone(r) ? '<span class="ad-pill good">Completed</span>' : '<span class="ad-pill plain">In progress</span>'];
            if (needsHelp(r)) pills.push('<span class="ad-pill warn">Asked for something</span>');
            if (isBlocked(r)) pills.push('<span class="ad-pill bad">InstrucTwin blocked</span>');
            if (val(r, 'responsible', 'acknowledged') === 'true') pills.push('<span class="ad-pill plain">Safeguarding read</span>');
            var meta = [val(r, 'lesson', 'grade'), isDone(r) ? 'Finished ' + fmtStamp(r.completed_at) : 'Last saved ' + fmtStamp(r.updated_at)].filter(Boolean).join(' · ');
            var secondary = SECONDARY.map(function (f) { return answer(f.label, val(r, f.seg, f.key)); }).join('');
            return '<div class="ad-resp' + (isFlagged(r) ? ' flag' : '') + '"><div class="ad-resp-head"><div>' +
                '<b>' + esc(r.name || r.email) + '</b><div class="ad-meta">' + esc(r.email) + (meta ? ' · ' + esc(meta) : '') + '</div></div>' +
                '<div>' + pills.join(' ') + '</div></div>' +
                PRIMARY.map(function (f) { return answer(f.label, val(r, f.seg, f.key), f.key2); }).join('') +
                (secondary ? '<details><summary>Full delivery plan and other answers</summary>' + secondary + '</details>' : '') +
                '</div>';
        }
        function visible() {
            var mode = $('resp-filter').value, q = $('resp-search').value.trim().toLowerCase();
            return rows.filter(function (r) {
                if (mode === 'flagged' && !isFlagged(r)) return false;
                if (mode === 'done' && !isDone(r)) return false;
                if (mode === 'open' && isDone(r)) return false;
                if (q && ((r.name || '') + ' ' + r.email).toLowerCase().indexOf(q) === -1) return false;
                return true;
            }).sort(function (a, b) {
                if (isFlagged(a) !== isFlagged(b)) return isFlagged(a) ? -1 : 1;
                if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
                return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
            });
        }
        function tile(n, label) { return '<div class="ad-tile"><p>' + esc(String(n)) + '</p><p>' + esc(label) + '</p></div>'; }
        /* Measured against the cohort (62), the same people the bar on the Overview counts: someone outside it who opened
         * the module is in the list below but not in these numbers. */
        function renderStats() {
            var inCohort = rows.filter(function (r) { return AI_LITERACY_EMAILS.has(String(r.email || '').toLowerCase()); });
            var n = AI_LITERACY_COHORT.length;
            $('resp-stats').innerHTML =
                tile(inCohort.length + ' / ' + n, 'Started') +
                tile(inCohort.filter(isDone).length, 'Completed') +
                tile(Math.max(0, n - inCohort.length), 'Not started') +
                tile(rows.filter(needsHelp).length, 'Asked for something') +
                tile(rows.filter(isBlocked).length, 'Blocked on InstrucTwin');
        }
        function rerender() {
            var list = visible();
            $('resp-list').innerHTML = list.map(card).join('');
            $('resp-empty').classList.toggle('hidden', list.length > 0);
            $('resp-empty').textContent = rows.length ? 'Nobody matches that filter.' : 'No responses.';
        }
        function apply(payload) { rows = (payload && payload.responses) || []; renderStats(); rerender(); }
        function fail(err) {
            var code = (err && err.message) || 'error';
            if (code === 'unknown_action') { $('resp-no-endpoint').classList.remove('hidden'); $('resp-empty').classList.add('hidden'); return; }
            if (code === 'not_admin') return;
            $('resp-empty').textContent = 'Couldn’t load the responses (' + code + '). Use Refresh at the top to try again.';
        }
        $('resp-filter').addEventListener('change', rerender);
        $('resp-search').addEventListener('input', rerender);
        $('resp-export').addEventListener('click', function () {
            var fields = PRIMARY.concat(SECONDARY);
            var lines = [['Name', 'Email', 'Grade', 'Status', 'Started', 'Last saved', 'Completed', 'Safeguarding acknowledged', 'InstrucTwin blocked']
                .concat(fields.map(function (f) { return f.label; })).map(csvCell).join(',')];
            visible().forEach(function (r) {
                lines.push([r.name || '', r.email, val(r, 'lesson', 'grade'), isDone(r) ? 'Completed' : 'In progress',
                    fmtStamp(r.first_saved), fmtStamp(r.updated_at), fmtStamp(r.completed_at),
                    val(r, 'responsible', 'acknowledged') === 'true' ? 'Yes' : 'No', isBlocked(r) ? 'Yes' : 'No']
                    .concat(fields.map(function (f) { return val(r, f.seg, f.key); })).map(csvCell).join(','));
            });
            downloadCsv('aisa-ai-literacy-readiness', lines);
        });
        return { MODULE_ID: MODULE_ID, apply: apply, fail: fail };
    })();

    /* ================================================================ Personal goals */

    var GOALS = (function () {
        var SURVEY_ID = 'secondary-teacher-goal-2026-27';
        var FORM_URL = 'Tools%20and%20Resources/secondary-teacher-goal.html';
        var rows = [], fields = [], outstanding = [], outstandingAll = null, rosterTag = '', loaded = false, legacyAuth = null;

        function val(r, key) {
            var v = r.data ? r.data[key] : '';
            if (Array.isArray(v)) return v.join(', ');
            return (v == null || v === false) ? '' : String(v).trim();
        }
        function isSubmitted(r) { return r.status === 'submitted'; }
        function answer(label, text, key) {
            return text ? '<div class="ad-answer' + (key ? ' key' : '') + '"><div>' + esc(label) + '</div><div>' + esc(text) + '</div></div>' : '';
        }
        /* One line (name, focus area, status) that opens to the goal. */
        function card(r) {
            var name = val(r, 'name') || r.name || r.email;
            var pills = [isSubmitted(r) ? '<span class="ad-pill good">Submitted</span>' : '<span class="ad-pill warn">Draft</span>'];
            if (val(r, 'at_aisa_last_year') === 'No') pills.push('<span class="ad-pill plain">New to AISA</span>');
            if (r.revision > 1) pills.push('<span class="ad-pill plain">Edited ×' + esc(r.revision) + '</span>');
            var meta = [r.email, val(r, 'department'), isSubmitted(r) ? 'Submitted ' + fmtStamp(r.submitted_at) : 'Last saved ' + fmtStamp(r.updated_at)].filter(Boolean).join(' · ');
            var extras = answer('Professional learning wanted', [val(r, 'pl_supports'), val(r, 'pl_other') ? 'Other: ' + val(r, 'pl_other') : ''].filter(Boolean).join(', ')) +
                answer('What would make that support most useful', val(r, 'pl_detail')) +
                answer('Beyond the classroom', val(r, 'beyond_classroom'));
            return '<details class="ad-goal"><summary>' +
                '<span class="ad-goal-name">' + esc(name) + '</span>' +
                '<span class="ad-goal-area">' + esc(val(r, 'focus_area') || '—') + '</span>' +
                '<span>' + pills.join(' ') + '</span>' +
                '<svg class="ad-chev" aria-hidden="true"><use href="#i-chev-right"/></svg>' +
                '</summary><div class="ad-goal-body"><p class="ad-meta">' + esc(meta) + '</p>' +
                answer('Goal', val(r, 'goal'), true) + answer('If-then plan', val(r, 'if_then')) +
                (extras ? '<details class="ad-disclose"><summary>Support asked for, and the rest</summary>' + extras + '</details>' : '') +
                '</div></details>';
        }
        function visible() {
            var mode = $('goal-filter').value, area = $('goal-area').value, q = $('goal-search').value.trim().toLowerCase();
            return rows.filter(function (r) {
                if (mode === 'submitted' && !isSubmitted(r)) return false;
                if (mode === 'draft' && isSubmitted(r)) return false;
                if (area && val(r, 'focus_area') !== area) return false;
                if (q && (val(r, 'name') + ' ' + (r.name || '') + ' ' + r.email + ' ' + val(r, 'department')).toLowerCase().indexOf(q) === -1) return false;
                return true;
            }).sort(function (a, b) {
                if (isSubmitted(a) !== isSubmitted(b)) return isSubmitted(a) ? -1 : 1;
                return (Date.parse(b.submitted_at || b.updated_at) || 0) - (Date.parse(a.submitted_at || a.updated_at) || 0);
            });
        }
        /* Submitted goals only: a draft's half-chosen area would skew what PD gets planned. */
        function areaCounts() {
            var c = {};
            rows.filter(isSubmitted).forEach(function (r) { var a = val(r, 'focus_area'); if (a) c[a] = (c[a] || 0) + 1; });
            return Object.keys(c).map(function (k) { return { area: k, n: c[k] }; }).sort(function (a, b) { return b.n - a.n; });
        }
        function tile(n, label) { return '<div class="ad-tile"><p>' + esc(String(n)) + '</p><p>' + esc(label) + '</p></div>'; }
        function rerender() {
            var list = visible(), subs = rows.filter(isSubmitted).length, top = areaCounts()[0];
            $('goal-list').innerHTML = list.map(card).join('');
            $('goal-list').classList.toggle('hidden', !list.length);
            $('goal-empty').classList.toggle('hidden', list.length > 0);
            $('goal-empty').textContent = rows.length ? 'Nobody matches that filter.' : 'No goals yet: they appear here as teachers submit them.';
            $('goal-stats').innerHTML = tile(subs, 'Submitted') + tile(rows.length - subs, 'Started, not submitted') +
                tile(outstanding.length, 'Still to submit') + tile(top ? top.n : 0, top ? 'Top area: ' + top.area : 'Top area');
            $('goal-title-count').textContent = '· ' + subs + ' submitted';

            var areas = areaCounts(), max = areas.length ? areas[0].n : 1, chosen = $('goal-area').value;
            $('goal-focus-wrap').classList.toggle('hidden', !areas.length);
            $('goal-focus').innerHTML = areas.map(function (it) {
                return '<button type="button" data-area="' + esc(it.area) + '" aria-pressed="' + (chosen === it.area) + '">' +
                    '<span class="ad-focus-name" title="' + esc(it.area) + '">' + esc(it.area) + '</span>' +
                    '<span class="ad-bar"><span style="width:' + pctOf(it.n, max) + '%"></span></span>' +
                    '<span class="ad-num">' + it.n + '</span></button>';
            }).join('');

            $('goal-outstanding-wrap').classList.toggle('hidden', !outstanding.length);
            $('goal-outstanding-count').textContent = outstanding.length;
            $('goal-outstanding').innerHTML = outstanding.map(function (p) {
                return '<div><b>' + esc(p.name || '—') + '</b> <span>' + esc(p.email) + '</span></div>';
            }).join('');
            ['sv-goals-badge', 'tab-surveys-badge'].forEach(function (id) {
                $(id).textContent = outstanding.length;
                $(id).title = plural(outstanding.length, 'person has', 'people have') + ' not submitted a goal';
                $(id).classList.toggle('hidden', !outstanding.length);
            });
            renderAttention();
        }
        function fillAreaOptions() {
            var sel = $('goal-area'), cur = sel.value;
            sel.innerHTML = '<option value="">All focus areas</option>';
            areaCounts().forEach(function (it) {
                var o = document.createElement('option'); o.value = it.area; o.textContent = it.area + ' (' + it.n + ')'; sel.appendChild(o);
            });
            sel.value = cur;
            if (sel.value !== cur) sel.value = '';
        }
        function fillTagOptions(tags) {
            var sel = $('goal-tag');
            if (sel.options.length !== 1) return false;
            (tags || []).forEach(function (t) { var o = document.createElement('option'); o.value = t; o.textContent = 'Group: ' + t; sel.appendChild(o); });
            return true;
        }
        /* `secondary` when the staff list has it: this is a secondary form. */
        function defaultTag() { return $('goal-tag').querySelector('option[value="secondary"]') ? 'secondary' : ''; }
        function narrow() {
            outstanding = (outstandingAll || []).filter(function (p) {
                return !rosterTag || !Array.isArray(p.tags) || p.tags.indexOf(rosterTag) !== -1;
            });
        }
        function applyBundle(p) {
            rows = p.responses || []; fields = p.fields || []; outstandingAll = p.outstanding || [];
            if (fillTagOptions(p.roster_tags) && !rosterTag) rosterTag = defaultTag();
            $('goal-tag').value = rosterTag;
            narrow(); fillAreaOptions(); loaded = true; rerender();
        }
        function fail(err) {
            var code = (err && err.message) || 'error';
            if (code === 'unknown_action' || code === 'unknown_survey') { $('goal-no-endpoint').classList.remove('hidden'); $('goal-empty').classList.add('hidden'); return; }
            if (code === 'not_admin') return;
            $('goal-empty').textContent = 'Couldn’t load the goals (' + code + '). Use Refresh at the top to try again.';
        }
        function legacyLoad(auth) {
            return auth.adminSurveyResponses(SURVEY_ID, { rosterTag: rosterTag }).then(function (p) {
                rows = (p && p.responses) || []; outstanding = (p && p.outstanding) || []; fields = (p && p.fields) || []; outstandingAll = null;
                if (fillTagOptions(p && p.roster_tags) && !rosterTag && defaultTag()) {
                    rosterTag = defaultTag(); $('goal-tag').value = rosterTag; return legacyLoad(auth);
                }
                $('goal-tag').value = rosterTag;
                fillAreaOptions(); loaded = true; rerender();
            });
        }
        function setStatus(text, kind) { $('goal-remind-status').textContent = text || ''; $('goal-remind-status').className = 'ad-msg' + (kind ? ' ' + kind : ''); }

        /* Not the tracker's reminder dialog: this goes to the goal cohort, with a link to the form. */
        function remind() {
            if (!outstanding.length) return;
            var emails = outstanding.map(function (p) { return p.email; });
            if (!window.confirm('Send a reminder to ' + plural(emails.length, 'person', 'people') + ' who haven’t submitted a goal?\n\nThey get the in-app bell and an email.')) return;
            var btn = $('goal-remind');
            btn.disabled = true;
            setStatus('Sending…');
            var link = location.origin + location.pathname.replace(/[^/]*$/, '') + FORM_URL;
            window.aisaAuth.postNotification('Your personal goal for 2026-27',
                'You haven’t set your personal goal for this year yet. It takes about ten minutes: pick the area of your practice you most want ' +
                'to grow in, and write one goal plus an if-then plan for actually doing it.\n\nWe’ll come back to it at your mid-year and end-of-year check-ins.',
                [], emails, { sendEmail: true, emailLink: link, emailLinkLabel: 'Set your goal' }
            ).then(function (r) {
                btn.disabled = false;
                var e = r && r.email;
                if (e && e.sent) setStatus('Sent to ' + e.sent + ' by email, and posted to everyone’s bell.', 'ok');
                else if (e && (e.failed || e.skipped)) setStatus('Bell notification posted, but ' + ((e.failed || 0) + (e.skipped || 0)) + ' email(s) did not go out.', 'error');
                else setStatus('Bell notification posted. No emails were sent: the backend needs updating for that.', 'error');
                if (current.tab !== 'surveys') window.alert($('goal-remind-status').textContent);
            }).catch(function (err) {
                btn.disabled = false;
                setStatus('Could not send: ' + ((err && err.message) || 'unknown error'), 'error');
                if (current.tab !== 'surveys') window.alert($('goal-remind-status').textContent);
            });
        }

        $('goal-filter').addEventListener('change', rerender);
        $('goal-area').addEventListener('change', rerender);
        $('goal-search').addEventListener('input', rerender);
        $('goal-remind').addEventListener('click', remind);
        $('goal-tag').addEventListener('change', function (e) {
            rosterTag = e.target.value;
            if (outstandingAll) { narrow(); rerender(); return; }
            if (legacyAuth) legacyLoad(legacyAuth).catch(fail);
        });
        $('goal-focus').addEventListener('click', function (e) {
            var b = e.target.closest('[data-area]');
            if (!b) return;
            var area = b.getAttribute('data-area');
            $('goal-area').value = $('goal-area').value === area ? '' : area;
            rerender();
        });
        $('goal-export').addEventListener('click', function () {
            var cols = fields.length ? fields : [{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'department', label: 'Department / Subject' },
                { key: 'focus_area', label: 'Focus area' }, { key: 'goal', label: 'Goal' }, { key: 'if_then', label: 'If-then plan' }];
            var lines = [['Account email', 'Status', 'Submitted', 'Last saved', 'Revisions'].concat(cols.map(function (f) { return f.label; })).map(csvCell).join(',')];
            visible().forEach(function (r) {
                lines.push([r.email, isSubmitted(r) ? 'Submitted' : 'Draft', fmtStamp(r.submitted_at), fmtStamp(r.updated_at), r.revision || 0]
                    .concat(cols.map(function (f) { return val(r, f.key); })).map(csvCell).join(','));
            });
            downloadCsv('aisa-secondary-goals', lines);
        });

        return {
            SURVEY_ID: SURVEY_ID, applyBundle: applyBundle, fail: fail, remind: remind,
            legacy: function (auth) { legacyAuth = auth; return legacyLoad(auth); },
            outstanding: function () { return loaded ? outstanding : []; },
            cohortLabel: function () { return rosterTag ? 'Group: ' + rosterTag : 'Whole staff list'; }
        };
    })();

    /* ================================================================ loading */

    function showState(id) {
        ['state-loading', 'state-denied', 'state-error', 'state-ready'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
    }

    function render(payload) {
        var byEmail = buildIndex(payload);
        DATA = { byEmail: byEmail, list: Object.keys(byEmail).map(function (k) { return byEmail[k]; }) };
        fillGroupFilters();
        buildTrackerOptions();
        renderOverview();
        renderTracker();
        renderInnovation();
        showState('state-ready');
        rendered = true;
    }

    /* Only the backend's own `not_admin` means "Admin access required". Anything else is a failure to find out. */
    function describeLoadFailure(err) {
        var code = (err && err.message) || 'api_error';
        var says = {
            request_timeout: 'The Hub didn’t answer in time. Trying again usually works.',
            busy_try_again: 'The Hub was busy with another change and gave up waiting. Try again in a moment.',
            bad_response: 'The Hub replied with something that wasn’t data, which usually means its server hit an error.',
            server_error: 'The Hub’s server hit an error reading the data. Trying again in a minute usually works.',
            aisa_api_not_configured: 'This copy of the Hub has no server address configured, so there is nothing to load.',
            unknown_action: 'The Hub’s server is an older version without this request. It needs updating.',
            http_404: 'The Hub’s server address does not answer. Nothing can load anywhere on the Hub while that is true, and module completions are not being saved. Check API_URL in auth/gate.js.',
            http_403: 'The server answered but would not serve the Hub. Check its access settings.',
            http_401: 'The server answered but would not serve the Hub. Check its access settings.'
        };
        /* A backend error is a lower_snake_case code; anything else is this page crashing, not the server. */
        if (!/^[a-z][a-z0-9_]*$/.test(code)) {
            return 'The dashboard hit a bug while building the page. Nothing is wrong with your access or the data: this is a fault in the page. ' +
                   'The line below is what broke; send it to Brandon, and check the browser console for the full trace.';
        }
        return says[code] || (/^http_5/.test(code) ? 'The server crashed while answering. That is usually temporary: try again in a moment.'
                                                   : 'The server refused the request. Trying again may help.');
    }
    function errorCode(err) { return ((err && err.message) || 'api_error') + (err && err.serverMessage ? ' — ' + err.serverMessage : ''); }
    function showLoadFailure(err) {
        if (err && err.message === 'not_admin') { showState('state-denied'); return; }
        $('state-error-msg').textContent = describeLoadFailure(err);
        $('state-error-code').textContent = errorCode(err);
        showState('state-error');
    }
    $('state-error-retry').addEventListener('click', function () { location.reload(); });

    /* The sections subscribe here: fn gets each answer (first load and every Refresh), and the latest at once. */
    window.aisaAdminData = (function () {
        var latest = null, subs = [];
        function deliver(fn, b) { try { fn(b); } catch (e) { console.warn('AISA: an admin section failed to draw', e); } }
        return {
            on: function (fn) { subs.push(fn); if (latest) deliver(fn, latest); },
            publish: function (b) { latest = b; subs.forEach(function (fn) { deliver(fn, b); }); },
            fail: function (err) {
                if (latest && !latest.failed) return;
                latest = { failed: err };
                subs.forEach(function (fn) { deliver(fn, latest); });
            }
        };
    })();
    window.aisaAdminData.on(function (b) {
        if (b.failed) { READINESS.fail(b.failed); GOALS.fail(b.failed); return; }
        var r = b.module_responses;
        if (r) {
            if (r.ok === false) READINESS.fail(new Error(r.error || 'error'));
            else if (!r.module_id || r.module_id === READINESS.MODULE_ID) READINESS.apply(r);
        }
        var s = b.survey;
        if (s) {
            if (s.ok === false) GOALS.fail(new Error(s.error || 'error'));
            else if (!s.survey_id || s.survey_id === GOALS.SURVEY_ID) GOALS.applyBundle(s);
        }
    });

    var loadMode = null, liveAt = 0, snapshotAt = 0, loading = false, gateDone = false;
    function settleGate() { gateDone = true; }

    function fmtWhen(ms) {
        if (!ms) return '';
        var d = new Date(ms);
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    /* saved: a copy from last time is showing, the live read is on its way · loading: Refresh was pressed
     * ok: live data (arg = its generated_at) · failed: the live read failed but there is data on screen (arg = err) */
    function setStatus(state, arg) {
        var busy = state === 'saved' || state === 'loading', btn = $('data-refresh');
        $('data-status-spin').classList.toggle('hidden', !busy);
        $('data-status').classList.toggle('failed', state === 'failed');
        btn.disabled = busy;
        btn.setAttribute('data-fresh', state === 'failed' ? '0' : '1');
        $('data-refresh-label').textContent = state === 'failed' ? 'Try again' : 'Refresh';
        var msg = '', note = '';
        if (state === 'saved') msg = 'Saved copy from ' + fmtWhen(snapshotAt) + ', getting the latest…';
        else if (state === 'loading') msg = 'Getting the latest…';
        else if (state === 'ok') msg = 'Data as of ' + fmtWhen(Date.parse(arg) || Date.now());
        else if (state === 'failed') {
            msg = 'Couldn’t refresh: data as of ' + fmtWhen(liveAt || snapshotAt);
            note = describeLoadFailure(arg) + ' (' + errorCode(arg) + ')';
        }
        $('data-status-msg').textContent = msg;
        $('data-status-note').textContent = note;
        $('data-status-note').classList.toggle('hidden', !note);
    }

    function acceptLive(overview, dwell) {
        render(overview);
        applyDwell(dwell);
        AUTH.saveAdminSnapshot(overview, dwell);
        liveAt = Date.now();
        snapshotAt = 0;
        setStatus('ok', overview.generated_at);
    }

    function loadFailed(err) {
        if (err && err.message === 'not_admin') {
            AUTH.clearAdminSnapshot();
            showState('state-denied');
            settleGate();
            window.aisaAdminData.fail(err);
            return;
        }
        console.warn('AISA: admin dashboard load failed', err);
        if (rendered) setStatus('failed', err); else showLoadFailure(err);
        settleGate();
        window.aisaAdminData.fail(err);
    }

    function load(fresh) {
        if (loading) return;
        if (loadMode === 'legacy') { location.reload(); return; }
        loading = true;
        if (rendered) setStatus(snapshotAt && !liveAt ? 'saved' : 'loading');
        AUTH.adminDashboard({ moduleId: READINESS.MODULE_ID, surveyId: GOALS.SURVEY_ID, fresh: !!fresh }).then(function (b) {
            loading = false;
            var ov = b && b.overview;
            if (!ov || ov.ok === false) {
                var e = new Error((ov && ov.error) || 'api_error');
                if (ov && ov.message) e.serverMessage = ov.message;
                throw e;
            }
            loadMode = 'bundle';
            acceptLive(ov, b.dwell);
            settleGate();
            window.aisaAdminData.publish(b);
        }).catch(function (err) {
            loading = false;
            if (err && err.message === 'unknown_action' && loadMode !== 'bundle') { legacyLoad(); return; }
            loadFailed(err);
        });
    }

    /* A backend from before admin_dashboard: the separate endpoints, one after another. Refresh reloads the page. */
    function legacyLoad() {
        loadMode = 'legacy';
        if (rendered) setStatus('saved');
        AUTH.adminOverview().then(function (payload) {
            acceptLive(payload, null);
            settleGate();
            if (AUTH.getAdminDwell) {
                AUTH.getAdminDwell().then(function (dw) { applyDwell(dw); AUTH.saveAdminSnapshot(payload, dw); })
                    .catch(function (err) { applyDwell({ ok: false, error: (err && err.message) || 'error' }); });
            }
            if (AUTH.adminModuleResponses) AUTH.adminModuleResponses(READINESS.MODULE_ID).then(READINESS.apply).catch(READINESS.fail);
            if (AUTH.adminSurveyResponses) GOALS.legacy(AUTH).catch(GOALS.fail);
        }).catch(loadFailed);
    }

    $('data-refresh').addEventListener('click', function () { load(this.getAttribute('data-fresh') !== '0'); });

    function boot(auth) {
        if (!auth.isConfigured()) { showLoadFailure(new Error('aisa_api_not_configured')); settleGate(); return; }
        AUTH = auth;
        var snap = auth.readAdminSnapshot ? auth.readAdminSnapshot() : null;
        if (snap) {
            try {
                render(snap.overview);
                if (snap.dwell) applyDwell(snap.dwell);
                snapshotAt = snap.savedAt;
                setStatus('saved');
            } catch (e) {
                /* A copy saved by an older version of this page that it can no longer draw: drop it, wait for the live read. */
                console.warn('AISA: saved dashboard copy unusable', e);
                auth.clearAdminSnapshot();
                rendered = false;
                snapshotAt = 0;
                showState('state-loading');
            }
        }
        if (auth.adminDashboard) load(false); else legacyLoad();
    }

    if (window.aisaReady) window.aisaReady(boot);
    else { showLoadFailure(new Error('aisa_api_not_configured')); settleGate(); }
})();
