/*
 * admin-requests.html — the Requests inbox. See the comment at the top of
 * the page. One admin_requests read; each request drawn with its answers
 * (labelled from request-spec.js), the person's job from the staff list,
 * what their browser sent, a status and note form, and "Copy AI prompt".
 *
 * promptFor() is the whole point: someone hands it to an AI assistant and
 * the assistant can do the work without asking anything the person was
 * already asked. Keep it in step with the Hub: where its code is, the
 * rules in CLAUDE.md, and the files a new module touches.
 */
(function () {
    'use strict';

    var SPEC = window.AISA_REQUEST_SPEC;
    var VIEW_KEY = 'aisa_requests_view_v1';
    var $ = function (id) { return document.getElementById(id); };
    var data = null;
    var selected = {};
    var view = { status: 'open', kind: '', q: '' };
    try { var saved = JSON.parse(localStorage.getItem(VIEW_KEY) || 'null'); if (saved) view = Object.assign(view, saved, { q: '' }); } catch (e) {}
    /* A link to one request (the email the Hub team gets) shows it whatever its status. */
    if (/^#r\d+$/.test(location.hash)) view.status = 'all';

    var HUB_URL = 'https://aisa-ai-web.github.io/The-Learning-Hub/';
    var OPEN = { new: 1, planned: 1, in_progress: 1 };

    function el(tag, attrs, text) {
        var e = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'class') e.className = attrs[k];
            else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
        });
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }
    function show(id) {
        ['state-loading', 'state-denied', 'state-error', 'ri-app'].forEach(function (s) { $(s).hidden = s !== id; });
    }
    function whenAuth() {
        return new Promise(function (resolve) {
            var start = Date.now();
            (function poll() {
                if (window.aisaAuth && window.aisaAuth.adminRequests) return resolve(window.aisaAuth);
                if (Date.now() - start > 600000) return resolve(null);
                setTimeout(poll, 150);
            })();
        });
    }
    function fmt(iso, withTime) {
        var t = Date.parse(iso);
        if (!isFinite(t)) return '';
        var o = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' };
        if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
        return new Date(t).toLocaleString('en-GB', o);
    }
    var toastTimer = null;
    function toast(text) {
        var t = $('ri-toast');
        t.textContent = text;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
    }

    /* ---------- reading a request ---------- */

    function fieldsOf(kind) { return ((SPEC[kind] && SPEC[kind].fields) || []).concat(SPEC.about); }
    function kindLabel(k) { return (SPEC[k] && SPEC[k].prompt) || k; }
    function statusLabel(s) { return SPEC.statuses[s] || s; }

    /** [[question, answer text], …] in the form's order, then anything the form no longer asks. */
    function answersOf(r) {
        var d = r.details || {}, out = [], used = { title: 1 };
        fieldsOf(r.kind).forEach(function (f) {
            if (f.key === 'title') return;
            used[f.key] = 1;
            var v = d[f.key];
            if (f.other) used[f.key + '_other'] = 1;
            if (v === undefined || v === '' || v === false) return;
            var text = Array.isArray(v) ? v.slice() : v;
            if (f.other && d[f.key + '_other']) {
                if (Array.isArray(text)) text = text.map(function (x) { return x === 'Other' ? 'Other: ' + d[f.key + '_other'] : x; });
                else if (text === 'Other') text = 'Other: ' + d[f.key + '_other'];
            }
            if (f.type === 'check') text = 'Yes';
            out.push([f.label, Array.isArray(text) ? text.join('; ') : String(text), f.type === 'textarea']);
        });
        Object.keys(d).forEach(function (k) {
            if (used[k]) return;
            var v = d[k];
            out.push([k.replace(/_/g, ' '), Array.isArray(v) ? v.join('; ') : String(v)]);
        });
        return out;
    }

    var CTX_LABELS = { came_from: 'Page they came from', browser: 'Browser', system: 'System', screen: 'Screen', touch: 'Touch screen',
        language: 'Browser language', hub_language: 'Hub language', time_zone: 'Time zone', local_time: 'Their time when sent',
        user_agent: 'User agent', errors: 'Errors the Hub noticed on their tab' };
    function contextOf(r) {
        var c = r.context || {}, out = [];
        Object.keys(c).forEach(function (k) {
            var v = c[k];
            if (k === 'touch') v = v ? 'yes' : 'no';
            out.push([CTX_LABELS[k] || k.replace(/_/g, ' '), Array.isArray(v) ? v.join('\n') : String(v), Array.isArray(v)]);
        });
        return out;
    }

    function personLine(r, withName) {
        var p = r.person || {};
        var job = [p.designation, p.department && p.department !== p.designation ? p.department : '', p.division && p.division !== p.department ? p.division : '']
            .filter(Boolean).join(', ');
        var who = withName ? (r.name || r.email) : '';
        return [who, job || (withName ? '' : 'a member of staff'), r.is_admin ? 'a Hub admin' : ''].filter(Boolean).join(' · ');
    }

    function isUrgent(r) {
        var d = r.details || {};
        return /Urgent/.test(d.urgency || '') || /cannot finish/.test(d.impact || '') || /really needed/.test(d.priority || '');
    }

    /* ---------- the prompt ---------- */

    var PREAMBLE = [
        'You are working on the AISA Learning Hub: the staff professional-development website of the American International School in Abu Dhabi (AISA). Staff sign in with their school Google account to take PD modules (self-paced trainings with certificates), read the newsletter, and find tools, guides and resources. A member of staff sent the request below through the Hub’s “Request or report” form. Do what it asks, to a standard you would be happy for the whole school to use.',
        '',
        'Where things are:',
        '- The pages: GitHub repository AISA-AI-web/The-Learning-Hub (static HTML, CSS and JavaScript, published from `main` at ' + HUB_URL + '). Read its CLAUDE.md first and follow it.',
        '- The server and data: the Supabase edge function `learning-hub` in AISA-AI-web/AI-Lessons (`supabase/functions/learning-hub/`; `learning-hub/README.md` explains it). Change it only if the request needs the server; it then needs its tests (`node supabase/test/run.js`) and a deploy, which that repository’s CLAUDE.md describes.',
        '',
        'Rules:',
        '- The Hub’s repository is PUBLIC. Never commit anyone’s name, email address or anything personal from this request (staff named on purpose, like a presenter credited on a page, only with their agreement). Nothing about students, ever.',
        '- Work on a branch and open a pull request; never push to `main`. Say in the pull request what you built, how you checked it, and anything still to confirm.',
        '- Follow the Hub’s conventions in CLAUDE.md, especially the `?v=N` cache-busting: a change to `auth/gate.js`, or to a helper it loads (`menu.js`, `search-index.js`, …), means the next unused number on every page that loads `gate.js`.',
        '- The brand and the design system: DM Sans, deep purple #21076C, gold #D8B664, white; use the `lh-` classes in `auth/hub.css` (the `.lh-hero` page header, `.lh-btn`, `.lh-card`, line icons, no emoji as icons), as `index.html` and `PD Modules/pd.html` do. Pages must work on a phone (no sideways scroll at 390px) and, where the Hub has it, in Arabic too.',
        '- Use only facts from this request, its linked material and the repository. Where something needed is missing, do not invent it: write [TO CONFIRM: …] in the page and list the open questions in the pull request.'
    ].join('\n');

    var TASKS = {
        training: [
            'What to do with a training request:',
            '1. Decide the format from the answers (“What would work best?”). By default build a self-paced PD module like the existing ones in `PD Modules/` (for example `sustainability-module.html`: chapters run by `auth/training.js`, a knowledge check, the completion recorded with `aisaAuth.wireModule(...)`, and the certificate). If they asked for a guide, a cheat sheet, templates or a video page instead, build that, in the style of `Tools and Resources/`.',
            '2. Turn “By the end, people should be able to…” into the learning objectives and make every chapter serve one of them. Cover the must-cover topics, in their order. Write for the audience and level given: plain, practical, with examples from a school day. Keep it within the time they asked for.',
            '3. For a new module, add it everywhere a module is listed (search the repository for an existing module id such as `sustainability`): `PD Modules/pd.html`, `dashboard.html`, the admin dashboard’s `MODULES` in `admin-dashboard.html`, `MODULES` in `admin-analytics.js` (with its group and hours), `auth/search-index.js` and the fallback list in `auth/menu.js`. Mark it required, recommended or optional as asked.',
            '4. If it is wanted in Arabic, add the Arabic the way the other bilingual modules do (an `-ar.js` file beside the page).',
            '5. Check it in a browser: every chapter, the knowledge check, the completion, the certificate, a phone width. Then open the pull request.'
        ],
        bug: [
            'What to do with a problem report:',
            '1. Reproduce it first: the page, the steps, their browser and screen, and the errors their tab recorded (above). If you cannot reproduce it, find what in the code could produce exactly what they saw, and say how sure you are.',
            '2. Fix the cause, not the symptom, and keep the fix as small as it can be. Check nothing else that uses the same code breaks.',
            '3. If it affected a completion or a certificate, say whose records may need correcting and how (the Hub has `admin_mark_complete` on the admin dashboard’s People tab), without naming anyone in the repository.',
            '4. Add or extend a test in `tests/` when the Hub has one for that part (`node tests/gate-smoke.js` after touching `gate.js`). Explain the cause in the pull request.'
        ],
        idea: [
            'What to do with an idea:',
            '1. Look at how the Hub does this today, and whether something close already exists.',
            '2. If it is a contained change, build it. If it is large, build the smallest version that solves the problem they described, and put the rest as a short plan in the pull request (what would change, where, and the risks).',
            '3. Make it work for everyone it is meant to help (the “Who would it help?” answer), on a phone too, and check it in a browser before opening the pull request.'
        ]
    };

    var CLOSING = 'When you have finished, end with two or three plain sentences I can send back to the person who asked: what was done and where to find it on the Hub (or, if it is not going ahead, why).';

    function requestBlock(r, n) {
        var lines = [];
        lines.push((n ? n + '. ' : '') + kindLabel(r.kind).toUpperCase() + ' #' + r.id + ': ' + r.title);
        lines.push('Sent ' + fmt(r.created_at, true) + ' by ' + (personLine(r, true) || r.email) + ' (for your information only: never put this in the repository).');
        if (r.status && r.status !== 'new') lines.push('Status now: ' + statusLabel(r.status) + (r.admin_note ? ' — note: ' + r.admin_note : ''));
        lines.push('');
        /* "Question? answer", "Statement: answer"; a list or several lines go underneath, indented. */
        function line(label, v, list) {
            if (list || v.indexOf('\n') !== -1) return '- ' + label + (/[?…:]$/.test(label) ? '' : ':') + '\n  ' + v.replace(/\n/g, '\n  ');
            return '- ' + label + (/[?…:]$/.test(label) ? ' ' : ': ') + v;
        }
        answersOf(r).forEach(function (a) { lines.push(line(a[0], a[1], false)); });
        var c = contextOf(r);
        if (c.length) {
            lines.push('');
            lines.push('Sent automatically with it:');
            c.forEach(function (a) { lines.push(line(a[0], a[1], a[2])); });
        }
        return lines.join('\n');
    }

    function promptFor(list) {
        var kinds = {};
        list.forEach(function (r) { kinds[r.kind] = 1; });
        var parts = [PREAMBLE, ''];
        parts.push(list.length === 1 ? '=== THE REQUEST ===' : '=== THE ' + list.length + ' REQUESTS (do them in this order; one pull request each unless they belong together) ===');
        parts.push('');
        list.forEach(function (r, i) { parts.push(requestBlock(r, list.length > 1 ? i + 1 : 0)); parts.push(''); });
        parts.push('=== WHAT TO DO ===');
        ['training', 'bug', 'idea'].forEach(function (k) { if (kinds[k]) { parts.push(TASKS[k].join('\n')); parts.push(''); } });
        parts.push(CLOSING);
        return parts.join('\n');
    }

    function copy(text, what) {
        function fallback() {
            var ta = el('textarea', { style: 'position:fixed;top:-1000px;opacity:0' });
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            var okc = false;
            try { okc = document.execCommand('copy'); } catch (e) {}
            ta.remove();
            toast(okc ? what + ' copied' : 'Could not copy: your browser blocked it');
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () { toast(what + ' copied: paste it into your AI assistant'); }, fallback);
        } else fallback();
    }

    /* ---------- drawing ---------- */

    function matches(r) {
        if (view.status === 'open' && !OPEN[r.status]) return false;
        if (view.status !== 'open' && view.status !== 'all' && r.status !== view.status) return false;
        if (view.kind && r.kind !== view.kind) return false;
        if (view.q) {
            var hay = [r.title, r.name, r.email, personLine(r, false)].concat(answersOf(r).map(function (a) { return a[1]; })).join(' ').toLowerCase();
            var words = view.q.toLowerCase().split(/\s+/).filter(Boolean);
            for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) === -1) return false;
        }
        return true;
    }

    function drawPills() {
        var box = $('ri-status');
        box.textContent = '';
        var c = data.counts || {};
        var open = (c.new || 0) + (c.planned || 0) + (c.in_progress || 0);
        var all = data.requests.length;
        [['open', 'Open', open]].concat(data.statuses.map(function (s) { return [s, statusLabel(s), c[s] || 0]; }), [['all', 'All', all]])
            .forEach(function (p) {
                var b = el('button', { type: 'button', class: 'ri-pill', 'aria-pressed': view.status === p[0] ? 'true' : 'false' });
                b.appendChild(document.createTextNode(p[1]));
                b.appendChild(el('span', { class: 'n' }, String(p[2])));
                b.addEventListener('click', function () { view.status = p[0]; saveView(); drawPills(); drawList(); });
                box.appendChild(b);
            });
    }

    function saveView() {
        try { localStorage.setItem(VIEW_KEY, JSON.stringify({ status: view.status, kind: view.kind })); } catch (e) {}
    }

    function shown() { return data.requests.filter(matches); }

    function drawSel() {
        var ids = Object.keys(selected).filter(function (k) { return selected[k]; });
        $('ri-sel-text').textContent = ids.length ? ids.length + ' selected' : 'Tick requests to copy them as one prompt.';
        $('ri-sel-copy').disabled = !ids.length;
    }

    function drawList() {
        var box = $('ri-list');
        box.textContent = '';
        var list = shown();
        if (!list.length) {
            box.appendChild(el('div', { class: 'ri-empty' }, data.requests.length ? 'Nothing matches these filters.' :
                'No requests yet. Staff send them from “Request a training or report a problem” in the Hub’s menu.'));
            drawSel();
            return;
        }
        list.forEach(function (r) { box.appendChild(card(r)); });
        drawSel();
        if (location.hash && /^#r\d+$/.test(location.hash)) {
            var t = document.getElementById(location.hash.slice(1));
            if (t && !t.dataset.seen) { t.dataset.seen = '1'; t.querySelector('details').open = true; t.scrollIntoView({ block: 'start' }); }
        }
    }

    function card(r) {
        var art = el('article', { class: 'ri-req', id: 'r' + r.id });
        var top = el('div', { class: 'ri-req-top' });
        var tick = el('input', { type: 'checkbox', 'aria-label': 'Select request ' + r.id });
        tick.checked = !!selected[r.id];
        tick.addEventListener('change', function () { selected[r.id] = tick.checked; drawSel(); });
        top.appendChild(tick);

        var mid = el('div', { style: 'min-width:0' });
        var chips = el('div', { class: 'ri-chips' });
        chips.appendChild(el('span', { class: 'ri-chip kind' }, kindLabel(r.kind)));
        chips.appendChild(el('span', { class: 'ri-chip s-' + r.status }, statusLabel(r.status)));
        if (isUrgent(r) && OPEN[r.status]) chips.appendChild(el('span', { class: 'ri-chip urgent' }, 'Urgent'));
        mid.appendChild(chips);
        mid.appendChild(el('div', { class: 'ri-ttl' }, r.title));
        mid.appendChild(el('div', { class: 'ri-who' }, '#' + r.id + ' · ' + fmt(r.created_at, true) + ' · ' + (personLine(r, true) || r.email)));
        top.appendChild(mid);

        var acts = el('div', { class: 'ri-top-actions' });
        var cp = el('button', { type: 'button', class: 'ri-btn sm primary' }, 'Copy AI prompt');
        cp.addEventListener('click', function () { copy(promptFor([r]), 'Prompt for #' + r.id); });
        acts.appendChild(cp);
        var mail = el('a', { class: 'ri-btn sm', href: 'mailto:' + encodeURIComponent(r.email) + '?subject=' + encodeURIComponent('Your Learning Hub request: ' + r.title) }, 'Email them');
        acts.appendChild(mail);
        top.appendChild(acts);
        art.appendChild(top);

        var det = el('details');
        det.appendChild(el('summary', { class: 'ri-btn sm', style: 'margin:0 1rem .9rem;list-style:none;display:inline-flex' }, 'Read it and update'));
        var body = el('div', { class: 'ri-body' });

        var ans = el('div', { class: 'ri-answers' });
        ans.appendChild(el('h3', null, 'Their answers'));
        var dl = el('dl');
        answersOf(r).forEach(function (a) { dl.appendChild(el('dt', null, a[0])); dl.appendChild(el('dd', null, a[1])); });
        ans.appendChild(dl);
        var ctx = contextOf(r);
        if (ctx.length) {
            ans.appendChild(el('h3', null, 'Sent with it'));
            var cdl = el('dl', { class: 'ri-ctx' });
            ctx.forEach(function (a) { cdl.appendChild(el('dt', null, a[0])); cdl.appendChild(el('dd', null, a[1])); });
            ans.appendChild(cdl);
        }
        body.appendChild(ans);

        var side = el('div', { class: 'ri-side' });
        side.appendChild(el('h3', null, 'Status'));
        var selId = 'ri-s-' + r.id, noteId = 'ri-n-' + r.id;
        side.appendChild(el('label', { for: selId }, 'Where it is'));
        var sel = el('select', { id: selId });
        data.statuses.forEach(function (s) {
            var o = el('option', { value: s }, statusLabel(s));
            if (s === r.status) o.selected = true;
            sel.appendChild(o);
        });
        side.appendChild(sel);
        side.appendChild(el('label', { for: noteId }, 'Note to them (they see it on the request page)'));
        var note = el('textarea', { id: noteId, maxlength: '2000', placeholder: 'e.g. Live now: PD Modules › AI feedback. Thank you!' });
        note.value = r.admin_note || '';
        side.appendChild(note);
        var row = el('div', { class: 'row' });
        var tell = el('label', { class: 'tell' });
        var tellBox = el('input', { type: 'checkbox' });
        tellBox.checked = true;
        tell.appendChild(tellBox);
        tell.appendChild(document.createTextNode('Tell them in their bell'));
        row.appendChild(tell);
        var save = el('button', { type: 'button', class: 'ri-btn sm primary' }, 'Save');
        row.appendChild(save);
        side.appendChild(row);
        var msg = el('div', { class: 'msg', 'aria-live': 'polite' });
        side.appendChild(msg);
        if (r.updated_at) side.appendChild(el('div', { class: 'ri-who' }, 'Last updated ' + fmt(r.updated_at, true) + (r.updated_by ? ' by ' + r.updated_by : '')));
        save.addEventListener('click', function () {
            save.disabled = true;
            msg.className = 'msg';
            msg.textContent = 'Saving…';
            window.aisaAuth.adminRequestUpdate({ id: r.id, status: sel.value, note: note.value, notify: tellBox.checked }).then(function (res) {
                var before = r.status;
                r.status = sel.value;
                r.admin_note = note.value.trim();
                r.updated_at = new Date().toISOString();
                data.counts[before] = Math.max(0, (data.counts[before] || 0) - 1);
                data.counts[r.status] = (data.counts[r.status] || 0) + 1;
                msg.className = 'msg good';
                msg.textContent = res.told ? 'Saved, and they have been told.' : 'Saved.';
                toast('#' + r.id + ' is now ' + statusLabel(r.status));
                drawPills();
                var chip = art.querySelector('.ri-chip.s-' + before);
                if (chip) { chip.className = 'ri-chip s-' + r.status; chip.textContent = statusLabel(r.status); }
            }).catch(function (err) {
                msg.className = 'msg bad';
                msg.textContent = 'Not saved: ' + ((err && err.message) || 'error');
            }).then(function () { save.disabled = false; });
        });
        body.appendChild(side);
        det.appendChild(body);
        art.appendChild(det);
        return art;
    }

    /* ---------- loading ---------- */

    function loadAll() {
        show(data ? 'ri-app' : 'state-loading');
        whenAuth().then(function (auth) {
            if (!auth) throw new Error('aisa_api_not_configured');
            return auth.adminRequests();
        }).then(function (res) {
            data = res;
            data.statuses = data.statuses || Object.keys(SPEC.statuses);
            data.counts = data.counts || {};
            $('ri-asof').textContent = 'As of ' + fmt(res.generated_at, true) + ' ';
            show('ri-app');
            drawPills();
            $('ri-kind').value = view.kind;
            drawList();
        }).catch(function (err) {
            var code = (err && err.message) || 'error';
            if (code === 'not_admin') { show('state-denied'); return; }
            $('state-error-text').textContent = code === 'unknown_action'
                ? 'The Hub’s server has not been updated for requests yet (it answered “unknown_action”).'
                : (/^[a-z_0-9]+$/.test(code) ? 'The server answered: ' + code + '.' : 'This page hit an error: ' + code);
            show('state-error');
        });
    }

    if (!SPEC) return;
    $('retry').addEventListener('click', loadAll);
    $('ri-refresh').addEventListener('click', loadAll);
    $('ri-kind').addEventListener('change', function () { view.kind = this.value; saveView(); drawList(); });
    var qTimer = null;
    $('ri-q').addEventListener('input', function () {
        var v = this.value;
        clearTimeout(qTimer);
        qTimer = setTimeout(function () { view.q = v.trim(); drawList(); }, 150);
    });
    $('ri-sel-all').addEventListener('click', function () {
        shown().forEach(function (r) { selected[r.id] = true; });
        drawList();
    });
    $('ri-sel-copy').addEventListener('click', function () {
        var list = data.requests.filter(function (r) { return selected[r.id]; });
        if (list.length) copy(promptFor(list), list.length === 1 ? 'Prompt' : 'One prompt for ' + list.length + ' requests');
    });
    /* For the test, and for anyone who wants the text without the clipboard. */
    window.aisaRequestPrompt = function (ids) {
        return promptFor(data.requests.filter(function (r) { return ids.indexOf(r.id) !== -1; }));
    };
    loadAll();
})();
