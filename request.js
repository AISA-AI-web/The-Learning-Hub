/*
 * request.html — "Request or report". See the comment at the top of the
 * page. Draws the form from window.AISA_REQUEST_SPEC (request-spec.js),
 * keeps a draft on this device until it is sent, checks the required
 * answers (the server checks them again), and sends one submit_request.
 * Everything the person typed goes on the page with textContent / value
 * only.
 */
(function () {
    'use strict';

    var SPEC = window.AISA_REQUEST_SPEC;
    var KINDS = ['training', 'bug', 'idea'];
    var DRAFT_KEY = 'aisa_request_draft_v1';
    var $ = function (id) { return document.getElementById(id); };
    var params = new URLSearchParams(location.search);
    var kind = null;
    var sending = false;

    /* ---------- small helpers ---------- */

    function el(tag, attrs, text) {
        var e = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'class') e.className = attrs[k];
            else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
        });
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function whenAuth(timeoutMs) {
        return new Promise(function (resolve) {
            var start = Date.now();
            (function poll() {
                if (window.aisaAuth && window.aisaAuth.submitRequest) return resolve(window.aisaAuth);
                if (Date.now() - start > (timeoutMs || 30000)) return resolve(window.aisaAuth || null);
                setTimeout(poll, 150);
            })();
        });
    }

    function store(key, value) {
        try {
            if (value === undefined) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {}
    }
    function load(key) {
        try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
    }
    function me() {
        try { return (window.aisaAuth && window.aisaAuth.getUser && window.aisaAuth.getUser()) || null; } catch (e) { return null; }
    }

    function fmtDate(iso) {
        var t = Date.parse(iso);
        if (!isFinite(t)) return '';
        return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    }

    /* ---------- the questions ---------- */

    var idSeq = 0;
    function fieldId(f) { return 'rq-f-' + f.key; }

    function buildField(f) {
        var wrap;
        var hint = f.hint ? el('div', { class: 'rq-hint', id: fieldId(f) + '-hint' }, f.hint) : null;
        var req = f.required ? el('span', { class: 'rq-req', 'aria-hidden': 'true' }, '*') : null;
        var err = el('div', { class: 'rq-err' }, f.type === 'multi' ? 'Tick at least one.' : 'Please answer this one.');

        if (f.type === 'choice' || f.type === 'multi') {
            wrap = el('fieldset', { class: 'rq-q', 'data-key': f.key, 'data-type': f.type });
            var lg = el('legend', null, f.label);
            if (req) lg.appendChild(req);
            wrap.appendChild(lg);
            if (hint) wrap.appendChild(hint);
            var opts = el('div', { class: 'rq-opts' });
            var list = f.options.slice();
            if (f.other) list.push('Other');
            list.forEach(function (o) {
                var lab = el('label', { class: 'rq-opt' });
                var inp = el('input', { type: f.type === 'multi' ? 'checkbox' : 'radio', name: f.key, value: o, id: 'rq-o' + (++idSeq) });
                if (f.required && f.type === 'choice') inp.required = true;
                lab.appendChild(inp);
                lab.appendChild(document.createTextNode(o));
                opts.appendChild(lab);
            });
            wrap.appendChild(opts);
            if (f.other) {
                var other = el('input', { type: 'text', class: 'rq-other', name: f.key + '_other', maxlength: '200',
                    'aria-label': f.label + ' — other', placeholder: 'Other: say which', hidden: true });
                wrap.appendChild(other);
                opts.addEventListener('change', function () {
                    var on = !!opts.querySelector('input[value="Other"]:checked');
                    other.hidden = !on;
                    if (on && document.activeElement && document.activeElement.value === 'Other') other.focus();
                });
            }
            wrap.appendChild(err);
            return wrap;
        }

        if (f.type === 'check') {
            wrap = el('div', { class: 'rq-q', 'data-key': f.key, 'data-type': 'check' });
            var cl = el('label', { class: 'rq-check' });
            cl.appendChild(el('input', { type: 'checkbox', name: f.key, id: fieldId(f) }));
            cl.appendChild(el('span', null, f.label));
            wrap.appendChild(cl);
            return wrap;
        }

        wrap = el('div', { class: 'rq-q', 'data-key': f.key, 'data-type': f.type });
        var label = el('label', { for: fieldId(f) }, f.label);
        if (req) label.appendChild(req);
        wrap.appendChild(label);
        if (hint) wrap.appendChild(hint);
        var input;
        var common = { id: fieldId(f), name: f.key, 'aria-describedby': hint ? hint.id : null };
        if (f.type === 'textarea') input = el('textarea', Object.assign({ maxlength: '4000', rows: '4' }, common));
        else if (f.type === 'select') {
            input = el('select', common);
            input.appendChild(el('option', { value: '' }, 'Choose…'));
            f.options.forEach(function (o) { input.appendChild(el('option', { value: o }, o)); });
        }
        else input = el('input', Object.assign({ type: f.type === 'date' ? 'date' : 'text', maxlength: f.key === 'title' ? '200' : '1000' }, common));
        if (f.ph) input.setAttribute('placeholder', f.ph);
        if (f.required) { input.required = true; input.setAttribute('aria-required', 'true'); }
        wrap.appendChild(input);
        wrap.appendChild(err);
        return wrap;
    }

    function drawKinds() {
        var box = $('rq-kinds');
        KINDS.forEach(function (k) {
            var s = SPEC[k];
            var lab = el('label', { class: 'rq-kind' });
            var inp = el('input', { type: 'radio', name: 'rq-kind', value: k });
            lab.appendChild(inp);
            lab.appendChild(el('span', { class: 'ic', 'aria-hidden': 'true' }, s.icon));
            var txt = el('span');
            txt.appendChild(el('span', { class: 't', style: 'display:block' }, s.label));
            txt.appendChild(el('span', { class: 'd', style: 'display:block' }, s.blurb));
            lab.appendChild(txt);
            box.appendChild(lab);
            inp.addEventListener('change', function () { if (inp.checked) choose(k, true); });
        });
    }

    function choose(k, fromClick) {
        if (fromClick) saveDraft();            // keep what was typed under the old kind
        kind = k;
        var radio = document.querySelector('input[name="rq-kind"][value="' + k + '"]');
        if (radio) radio.checked = true;
        var holder = $('rq-fields');
        holder.textContent = '';
        SPEC[k].fields.forEach(function (f) {
            if (f.section) holder.appendChild(el('div', { class: 'rq-sec' }, f.section));
            holder.appendChild(buildField(f));
        });
        var about = $('rq-about');
        if (!about.childNodes.length) SPEC.about.forEach(function (f) { about.appendChild(buildField(f)); });
        $('rq-form').hidden = false;
        $('rq-problem').hidden = true;
        $('rq-send').textContent = k === 'bug' ? 'Send the report' : k === 'idea' ? 'Send my idea' : 'Send the request';
        restoreDraft();
        if (k === 'bug') {
            var page = $('rq-f-page');
            if (page && !page.value && fromPage()) page.value = fromPage();
        }
        drawContext();
        try { history.replaceState(null, '', location.pathname + '?type=' + k + (params.get('from') ? '&from=' + encodeURIComponent(params.get('from')) : '')); } catch (e) {}
        if (fromClick) {
            var first = holder.querySelector('input,textarea,select');
            if (first) first.focus();
        }
    }

    /* ---------- reading and restoring answers ---------- */

    function fieldsNow() { return kind ? SPEC[kind].fields.concat(SPEC.about) : SPEC.about; }

    function readAnswers() {
        var form = $('rq-form');
        var out = {};
        fieldsNow().forEach(function (f) {
            if (f.type === 'multi') {
                var ticked = [].slice.call(form.querySelectorAll('input[name="' + f.key + '"]:checked')).map(function (i) { return i.value; });
                if (ticked.length) out[f.key] = ticked;
            } else if (f.type === 'choice') {
                var c = form.querySelector('input[name="' + f.key + '"]:checked');
                if (c) out[f.key] = c.value;
            } else if (f.type === 'check') {
                var b = form.querySelector('input[name="' + f.key + '"]');
                if (b && b.checked) out[f.key] = true;
            } else {
                var i = form.querySelector('[name="' + f.key + '"]');
                if (i && i.value.trim()) out[f.key] = i.value.trim();
            }
            if (f.other) {
                var o = form.querySelector('input[name="' + f.key + '_other"]');
                var otherTicked = form.querySelector('input[name="' + f.key + '"][value="Other"]:checked');
                if (o && otherTicked && o.value.trim()) out[f.key + '_other'] = o.value.trim();
            }
        });
        return out;
    }

    function writeAnswers(ans) {
        var form = $('rq-form');
        fieldsNow().forEach(function (f) {
            var v = ans[f.key];
            if (v === undefined) return;
            if (f.type === 'multi' || f.type === 'choice') {
                var vals = Array.isArray(v) ? v : [v];
                [].forEach.call(form.querySelectorAll('input[name="' + f.key + '"]'), function (i) { i.checked = vals.indexOf(i.value) !== -1; });
                if (f.other) {
                    var o = form.querySelector('input[name="' + f.key + '_other"]');
                    if (o) { o.value = ans[f.key + '_other'] || ''; o.hidden = vals.indexOf('Other') === -1; }
                }
            } else if (f.type === 'check') {
                var b = form.querySelector('input[name="' + f.key + '"]');
                if (b) b.checked = !!v;
            } else {
                var i = form.querySelector('[name="' + f.key + '"]');
                if (i) i.value = v;
            }
        });
    }

    /* The draft: per person, per kind, on this device only, until sent. */
    var saveTimer = null;
    function saveDraft() {
        if (!kind) return;
        var u = me();
        var d = load(DRAFT_KEY) || {};
        if (!u || d.email !== u.email) d = { email: u ? u.email : '', kinds: {} };
        var ans = readAnswers();
        d.kinds = d.kinds || {};
        d.kinds[kind] = ans;
        d.about = {};
        SPEC.about.forEach(function (f) { if (ans[f.key]) d.about[f.key] = ans[f.key]; });
        d.last = kind;
        store(DRAFT_KEY, d);
        $('rq-saved').textContent = 'Draft saved on this device';
    }
    function restoreDraft() {
        var u = me(), d = load(DRAFT_KEY);
        if (!d || !u || d.email !== u.email) return;
        writeAnswers(Object.assign({}, d.about || {}, (d.kinds || {})[kind] || {}));
    }
    function dropDraft(k) {
        var d = load(DRAFT_KEY);
        if (!d) return;
        if (d.kinds) delete d.kinds[k];
        store(DRAFT_KEY, d);
    }

    /* ---------- what goes with it ---------- */

    function fromPage() {
        var f = params.get('from') || '';
        if (!f && document.referrer) {
            try { var r = new URL(document.referrer); if (r.origin === location.origin) f = r.pathname + r.hash; } catch (e) {}
        }
        if (!f) return '';
        try { f = decodeURIComponent(f); } catch (e) {}
        return f.slice(0, 300);
    }

    function browserOf(ua) {
        var m;
        if ((m = /Edg\/(\d+)/.exec(ua))) return 'Edge ' + m[1];
        if ((m = /OPR\/(\d+)/.exec(ua))) return 'Opera ' + m[1];
        if ((m = /Firefox\/(\d+)/.exec(ua))) return 'Firefox ' + m[1];
        if ((m = /CriOS\/(\d+)/.exec(ua))) return 'Chrome ' + m[1] + ' (iOS)';
        if ((m = /Chrome\/(\d+)/.exec(ua))) return 'Chrome ' + m[1];
        if ((m = /Version\/([\d.]+).*Safari/.exec(ua))) return 'Safari ' + m[1];
        return 'Unknown browser';
    }
    function systemOf(ua) {
        if (/iPad|Macintosh.*Mobile/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPadOS';
        if (/iPhone/.test(ua)) return 'iOS';
        if (/Android/.test(ua)) return 'Android';
        if (/CrOS/.test(ua)) return 'ChromeOS';
        if (/Windows/.test(ua)) return 'Windows';
        if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
        if (/Linux/.test(ua)) return 'Linux';
        return 'Unknown system';
    }

    function errorsNow() {
        var list = [];
        try { list = (window.aisaAuth && window.aisaAuth.recentErrors && window.aisaAuth.recentErrors()) || []; } catch (e) {}
        return list.filter(function (x) { return x && x.msg && !/\/request\.html$/.test(x.page || ''); }).slice(-8).map(function (x) {
            return (x.t ? x.t.slice(11, 19) + ' ' : '') + (x.page || '') + ' — ' + x.msg + (x.src ? ' (' + x.src + ')' : '');
        });
    }

    function context() {
        var ua = navigator.userAgent || '';
        var c = {
            came_from: fromPage(),
            browser: browserOf(ua),
            system: systemOf(ua),
            screen: (window.innerWidth || 0) + '×' + (window.innerHeight || 0) + ' window, ' +
                (screen.width || 0) + '×' + (screen.height || 0) + ' screen, ×' + (window.devicePixelRatio || 1),
            touch: (navigator.maxTouchPoints || 0) > 0,
            language: navigator.language || '',
            hub_language: (function () { try { return localStorage.getItem('aisa-newsletter-lang') === 'ar' ? 'Arabic' : 'English'; } catch (e) { return ''; } })(),
            time_zone: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })(),
            local_time: new Date().toString().slice(0, 33),
            user_agent: ua.slice(0, 400)
        };
        if (kind === 'bug' && $('rq-errs-ok').checked) {
            var errs = errorsNow();
            if (errs.length) c.errors = errs;
        }
        return c;
    }

    function drawContext() {
        var c = context(), dl = $('rq-ctx-list');
        dl.textContent = '';
        var u = me();
        var rows = [['From', u ? (u.name ? u.name + ' · ' : '') + u.email : 'You (when signed in)'],
            ['Page you came from', c.came_from || '—'], ['Browser', c.browser + ' on ' + c.system + (c.touch ? ' (touch)' : '')],
            ['Screen', c.screen], ['Language', c.language + ' · Hub in ' + c.hub_language], ['Time zone', c.time_zone]];
        rows.forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); });
        var errs = kind === 'bug' ? errorsNow() : [];
        $('rq-errs-wrap').hidden = !errs.length;
        var ul = $('rq-errs');
        ul.textContent = '';
        errs.forEach(function (e) { ul.appendChild(el('li', null, e)); });
    }

    /* ---------- checking and sending ---------- */

    function markBad(key, bad) {
        var q = document.querySelector('.rq-q[data-key="' + key + '"]');
        if (!q) return null;
        q.classList.toggle('bad', !!bad);
        [].forEach.call(q.querySelectorAll('input,textarea,select'), function (i) {
            if (i.type !== 'radio' && i.type !== 'checkbox') i.setAttribute('aria-invalid', bad ? 'true' : 'false');
        });
        return q;
    }

    function check(ans) {
        var missing = [];
        SPEC[kind].fields.forEach(function (f) {
            var miss = f.required && (ans[f.key] === undefined || (Array.isArray(ans[f.key]) && !ans[f.key].length));
            markBad(f.key, miss);
            if (miss) missing.push(f.key);
        });
        return missing;
    }

    function showProblem(text) {
        var p = $('rq-problem');
        p.textContent = text;
        p.hidden = !text;
    }

    function focusFirst(keys) {
        var q = keys.length && document.querySelector('.rq-q[data-key="' + keys[0] + '"]');
        if (!q) return;
        q.scrollIntoView({ behavior: 'smooth', block: 'center' });
        var i = q.querySelector('input,textarea,select');
        if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 250);
    }

    var MESSAGES = {
        missing_required: 'A few required answers are missing: they are marked in red.',
        too_many_requests: 'You have sent a lot of requests today. Thank you! Please send this one tomorrow, or add it to one you have sent.',
        too_long: 'This is longer than the Hub can keep. Please shorten the longest answers, or put long material in a linked document.',
        unknown_action: 'The Hub’s server is not ready for requests yet. Your draft is saved on this device: please try again later.',
        request_timeout: 'The Hub did not answer in time. Your draft is saved: please try again.',
        aisa_api_not_configured: 'The Hub’s server is not available from this page. Your draft is saved.'
    };

    function send(ev) {
        ev.preventDefault();
        if (sending || !kind) return;
        showProblem('');
        var ans = readAnswers();
        var missing = check(ans);
        if (missing.length) {
            showProblem(MESSAGES.missing_required);
            focusFirst(missing);
            return;
        }
        saveDraft();
        var title = ans.title;
        var details = {};
        Object.keys(ans).forEach(function (k) { if (k !== 'title') details[k] = ans[k]; });
        sending = true;
        var btn = $('rq-send'), label = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Sending…';
        whenAuth(600000).then(function (auth) {
            if (!auth || !auth.submitRequest) throw new Error('aisa_api_not_configured');
            return auth.submitRequest({ kind: kind, title: title, details: details, context: context() });
        }).then(function (r) {
            dropDraft(kind);
            var u = me();
            $('rq-done-text').textContent = 'We’ve got your ' + SPEC[kind].prompt.toLowerCase() + ' (number ' + r.id + '). ' +
                'You can follow it under “Your requests” below, and you’ll get a notification in the bell when its status changes' +
                (u && u.email ? '.' : ' once you’re signed in.');
            $('rq-form-wrap').hidden = true;
            $('rq-done').hidden = false;
            $('rq-done').scrollIntoView({ behavior: 'smooth', block: 'start' });
            loadMine();
        }).catch(function (err) {
            var code = (err && err.message) || 'error';
            if (err && err.missing) { err.missing.forEach(function (k) { markBad(k, true); }); focusFirst(err.missing); }
            showProblem(MESSAGES[code] || ('It could not be sent (' + code + '). Your draft is saved on this device: please try again.'));
        }).then(function () {
            sending = false;
            btn.disabled = false;
            btn.textContent = label;
        });
    }

    /* ---------- your requests ---------- */

    function loadMine() {
        var box = $('rq-mine');
        whenAuth(600000).then(function (auth) {
            if (!auth || !auth.myRequests) throw new Error('aisa_api_not_configured');
            return auth.myRequests();
        }).then(function (r) {
            box.textContent = '';
            var list = (r && r.requests) || [];
            if (!list.length) { box.appendChild(el('p', { class: 'rq-empty' }, 'Nothing yet. What you send appears here, with where it is up to.')); return; }
            list.forEach(function (q) {
                var item = el('article', { class: 'rq-item' });
                var top = el('div', { class: 'top' });
                top.appendChild(el('span', { class: 'rq-chip kind' }, (SPEC[q.kind] || { prompt: q.kind }).prompt));
                top.appendChild(el('span', { class: 'ttl' }, q.title));
                top.appendChild(el('span', { class: 'rq-chip s-' + q.status }, SPEC.statuses[q.status] || q.status));
                item.appendChild(top);
                item.appendChild(el('div', { class: 'meta' }, 'Sent ' + fmtDate(q.created_at) + ' · number ' + q.id +
                    (q.updated_at ? ' · updated ' + fmtDate(q.updated_at) : '')));
                if (q.admin_note) item.appendChild(el('div', { class: 'reply' }, q.admin_note));
                box.appendChild(item);
            });
        }).catch(function (err) {
            box.textContent = '';
            var code = (err && err.message) || 'error';
            box.appendChild(el('p', { class: 'rq-empty' }, code === 'unknown_action'
                ? 'Your requests will show here once the Hub’s server is updated.'
                : 'Your requests could not be loaded just now (' + code + ').'));
        });
    }

    /* ---------- start ---------- */

    if (!SPEC) return;
    drawKinds();
    var form = $('rq-form');
    form.addEventListener('submit', send);
    form.addEventListener('input', function (e) {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDraft, 600);
        var q = e.target.closest && e.target.closest('.rq-q.bad');
        if (q) markBad(q.getAttribute('data-key'), false);
    });
    form.addEventListener('change', function (e) {
        saveDraft();
        var q = e.target.closest && e.target.closest('.rq-q.bad');
        if (q) markBad(q.getAttribute('data-key'), false);
    });
    $('rq-errs-ok').addEventListener('change', drawContext);
    $('rq-clear').addEventListener('click', function () {
        if (!confirm('Clear everything you have typed for this ' + SPEC[kind].prompt.toLowerCase() + '?')) return;
        dropDraft(kind);
        choose(kind, false);
        $('rq-saved').textContent = '';
    });
    $('rq-again').addEventListener('click', function () {
        $('rq-done').hidden = true;
        $('rq-form-wrap').hidden = false;
        choose(kind, false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    var want = params.get('type');
    whenAuth(4000).then(function () {
        var d = load(DRAFT_KEY), u = me();
        var start = KINDS.indexOf(want) !== -1 ? want : (d && u && d.email === u.email && d.last) || null;
        if (start) choose(start, false);
        loadMine();
    });
})();
