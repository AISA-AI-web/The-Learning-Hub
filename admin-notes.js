/* admin-notes.js — notes on the admin pages (9 Nov 2026).
 *
 * A "Notes" button (any element with data-admin-notes-open) opens a side panel where an admin writes a note about the
 * page, optionally about one part of it, and reads everyone's notes: open first, then done, each with its writer, date and
 * any reply. Every admin reads every note; the writer edits or deletes their own; anyone marks one done or open again.
 * When Brandon tells a Claude session "check notes", it reads the open notes from the database, acts on them, and marks
 * them done with a short reply that shows here (AISA-AI-web/AI-Lessons, CLAUDE.md, *"Check notes"*).
 *
 * The page names itself and its parts on the mount: <div data-admin-notes="analytics" data-topics="Overview|Engagement|…">.
 * Server: the learning-hub function's admin_notes_list / admin_note_save / admin_note_status / admin_note_delete, through
 * gate.js's admin allow-list (aisaAuth.adminRoster). Names and text go on the page with textContent only; nothing is kept
 * in the browser. Styles are its own (.hn-*), so it fits any admin page.
 */
(function () {
    'use strict';
    var mount = document.querySelector('[data-admin-notes]');
    if (!mount) return;
    var PAGE = mount.getAttribute('data-admin-notes');
    var TOPICS = (mount.getAttribute('data-topics') || '').split('|').filter(Boolean);

    var css = '' +
        '.hn-back{position:fixed;inset:0;background:rgba(23,19,43,.35);z-index:2147483050}' +
        '.hn-panel{position:fixed;top:0;right:0;bottom:0;width:min(28rem,100%);background:#fff;z-index:2147483060;display:flex;flex-direction:column;' +
        'box-shadow:-12px 0 40px rgba(23,19,43,.18);font-family:"DM Sans",system-ui,sans-serif;color:#17132b}' +
        '.hn-panel *{box-sizing:border-box}.hn-panel h2{margin:0;font-size:1.1rem;font-weight:800;color:#21076C}' +
        '.hn-head{display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:1rem 1.1rem;border-bottom:1px solid #e6e2f0}' +
        '.hn-sub{font-size:.78rem;color:#6f6a86;margin:.2rem 0 0}' +
        '.hn-x{border:0;background:none;font-size:1.5rem;line-height:1;cursor:pointer;color:#6f6a86;padding:.2rem .4rem;border-radius:8px}' +
        '.hn-x:hover{background:#f3f0fb;color:#17132b}' +
        '.hn-form{padding:.9rem 1.1rem;border-bottom:1px solid #e6e2f0;display:flex;flex-direction:column;gap:.5rem;background:#faf9fd}' +
        '.hn-form select,.hn-form textarea,.hn-edit textarea{font:inherit;font-size:.88rem;border:1px solid #d6d1e6;border-radius:9px;padding:.45rem .6rem;background:#fff;color:#17132b;width:100%}' +
        '.hn-form textarea,.hn-edit textarea{min-height:5.5rem;resize:vertical}' +
        '.hn-row{display:flex;gap:.5rem;align-items:center;justify-content:space-between;flex-wrap:wrap}' +
        '.hn-btn{font:inherit;font-size:.8rem;font-weight:700;border:1px solid #d6d1e6;background:#fff;color:#17132b;border-radius:999px;padding:.35rem .8rem;cursor:pointer}' +
        '.hn-btn:hover:not(:disabled){background:#f3f0fb}.hn-btn:disabled{opacity:.5;cursor:not-allowed}' +
        '.hn-btn.primary{background:#21076C;border-color:#21076C;color:#fff}.hn-btn.primary:hover:not(:disabled){background:#3b2596}' +
        '.hn-btn.danger{color:#b42318}' +
        '.hn-filter{display:flex;gap:.3rem;padding:.6rem 1.1rem 0}.hn-filter button{font:inherit;font-size:.78rem;font-weight:700;border:1px solid #e6e2f0;background:#fff;' +
        'border-radius:999px;padding:.25rem .7rem;cursor:pointer;color:#4d4866}.hn-filter button[aria-pressed="true"]{background:#21076C;color:#fff;border-color:#21076C}' +
        '.hn-list{flex:1;overflow-y:auto;padding:.6rem 1.1rem 1.2rem;display:flex;flex-direction:column;gap:.6rem}' +
        '.hn-note{border:1px solid #e6e2f0;border-radius:12px;padding:.7rem .8rem;background:#fff}' +
        '.hn-note.done{background:#faf9fd}.hn-note.done .hn-body{color:#4d4866}' +
        '.hn-meta{font-size:.75rem;color:#6f6a86;display:flex;gap:.4rem;flex-wrap:wrap;align-items:center}' +
        '.hn-topic{font-size:.72rem;font-weight:700;background:#efecf8;color:#3b2596;border-radius:999px;padding:.05rem .5rem}' +
        '.hn-status{font-size:.68rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;padding:.05rem .45rem}' +
        '.hn-status.open{background:#fdf3df;color:#8a5300}.hn-status.done{background:#e7f4ec;color:#146c43}' +
        '.hn-body{white-space:pre-wrap;font-size:.9rem;margin:.4rem 0 .2rem;overflow-wrap:anywhere}' +
        '.hn-reply{border-left:3px solid #D8B664;background:#fffaf0;padding:.4rem .6rem;border-radius:0 8px 8px 0;font-size:.84rem;white-space:pre-wrap;margin:.4rem 0 0;overflow-wrap:anywhere}' +
        '.hn-reply b{display:block;font-size:.72rem;color:#7a5d10;margin-bottom:.1rem}' +
        '.hn-actions{display:flex;gap:.35rem;flex-wrap:wrap;margin-top:.5rem}' +
        '.hn-msg{font-size:.8rem;font-weight:600;color:#6f6a86;min-height:1em}.hn-msg.bad{color:#b42318}' +
        '.hn-empty{color:#6f6a86;font-size:.88rem;text-align:center;padding:1.5rem .5rem}' +
        '.hn-count{display:inline-block;min-width:1.2rem;font-size:.7rem;font-weight:800;border-radius:999px;padding:0 .35rem;margin-left:.3rem;background:#fdf3df;color:#8a5300;text-align:center}' +
        '.hn-back[hidden],.hn-panel[hidden],.hn-count[hidden]{display:none!important}' +
        '@media print{.hn-back,.hn-panel{display:none!important}}';
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);

    function h(tag, attrs, kids) {
        var el = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') el.textContent = attrs[k];
            else if (k === 'class') el.className = attrs[k];
            else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
            else if (attrs[k] === true) el.setAttribute(k, '');
            else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
        });
        (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
        return el;
    }
    var MESSAGES = {
        unknown_action: 'Notes need the Hub’s server update. Try again later.',
        not_admin: 'Only admins can use notes.',
        empty_note: 'Write something first.',
        note_too_long: 'A note can be up to 4,000 characters.',
        not_yours: 'Only the person who wrote a note can change or delete it.',
        not_found: 'That note is no longer there. Refreshing the list.'
    };
    function say(err) { var c = (err && err.message) || String(err || ''); return MESSAGES[c] || ('Something went wrong (' + c + ').'); }
    function when(iso) {
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    var auth = null, me = '', notes = [], loaded = false, filter = 'open', editing = null, opener = null;

    /* ---------- the panel ---------- */
    var back = h('div', { class: 'hn-back', hidden: true });
    var topic = h('select', { 'aria-label': 'What the note is about' }, [h('option', { value: '', text: 'The whole page' })].concat(
        TOPICS.map(function (t) { return h('option', { value: t, text: t }); })));
    var text = h('textarea', { 'aria-label': 'Note', maxlength: '4000', placeholder: 'What should change, or what should the team know?' });
    var msg = h('p', { class: 'hn-msg', role: 'status', 'aria-live': 'polite' });
    var saveBtn = h('button', { type: 'button', class: 'hn-btn primary', text: 'Add note', onclick: save });
    var list = h('div', { class: 'hn-list' });
    var filters = h('div', { class: 'hn-filter', role: 'group', 'aria-label': 'Show' });
    [['open', 'Open'], ['done', 'Done'], ['all', 'All']].forEach(function (f) {
        filters.appendChild(h('button', { type: 'button', 'data-f': f[0], 'aria-pressed': f[0] === filter ? 'true' : 'false', text: f[1], onclick: function () {
            filter = f[0];
            Array.prototype.forEach.call(filters.children, function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === filter ? 'true' : 'false'); });
            renderList();
        } }));
    });
    var closeBtn = h('button', { type: 'button', class: 'hn-x', 'aria-label': 'Close notes', text: '×', onclick: close });
    var panel = h('aside', { class: 'hn-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'hn-title', hidden: true }, [
        h('div', { class: 'hn-head' }, [
            h('div', {}, [h('h2', { id: 'hn-title', text: 'Notes' }),
                h('p', { class: 'hn-sub', text: 'Seen by every admin. Say “check notes” to Claude and it acts on the open ones, then replies here.' })]),
            closeBtn]),
        h('div', { class: 'hn-form' }, [
            h('label', { class: 'hn-sub', text: 'About' }), topic, text,
            h('div', { class: 'hn-row' }, [msg, saveBtn])]),
        filters, list]);
    document.body.appendChild(back);
    document.body.appendChild(panel);
    back.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
        if (panel.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); }
        if (e.key === 'Tab') {
            var f = Array.prototype.filter.call(panel.querySelectorAll('button, select, textarea'), function (x) { return !x.disabled; });
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-admin-notes-open]'), function (b) {
        b.addEventListener('click', function () { open(b); });
    });

    function open(from) {
        opener = from || document.activeElement;
        back.hidden = false; panel.hidden = false;
        text.focus();
        if (!loaded) load();
    }
    function close() {
        back.hidden = true; panel.hidden = true;
        if (opener && opener.focus) opener.focus();
    }
    function setMsg(t, bad) { msg.textContent = t || ''; msg.className = 'hn-msg' + (bad ? ' bad' : ''); }

    /* ---------- the server ---------- */
    function call(action, payload) {
        return auth.adminRoster(action, payload).then(function (r) {
            if (r && r.ok === false) throw new Error(r.error || 'error');
            return r;
        });
    }
    function load() {
        if (!auth) return Promise.resolve();
        return call('admin_notes_list', { page: PAGE }).then(function (r) {
            notes = r.notes || []; loaded = true;
            renderList(); renderCount();
        }).catch(function (err) {
            list.textContent = '';
            list.appendChild(h('p', { class: 'hn-empty', text: say(err) }));
        });
    }
    function save() {
        var body = text.value.trim();
        if (!body) { setMsg(MESSAGES.empty_note, true); return; }
        saveBtn.disabled = true; setMsg('Saving…');
        call('admin_note_save', { page: PAGE, topic: topic.value, body: body }).then(function () {
            text.value = ''; topic.value = ''; setMsg('Saved.');
            if (filter === 'done') filter = 'open';
            return load();
        }).catch(function (err) { setMsg(say(err), true); })
          .then(function () { saveBtn.disabled = false; });
    }
    function act(promise) {
        return promise.catch(function (err) { setMsg(say(err), true); }).then(load);
    }

    /* ---------- drawing ---------- */
    function renderCount() {
        var n = notes.filter(function (x) { return x.status === 'open'; }).length;
        Array.prototype.forEach.call(document.querySelectorAll('[data-admin-notes-open]'), function (b) {
            var c = b.querySelector('.hn-count');
            if (!c) { c = h('span', { class: 'hn-count' }); b.appendChild(c); }
            c.textContent = n;
            c.hidden = !n;
            b.setAttribute('aria-label', 'Notes' + (n ? ', ' + n + ' open' : ''));
        });
    }
    function renderList() {
        list.textContent = '';
        var shown = notes.filter(function (x) { return filter === 'all' || x.status === filter; })
            .sort(function (a, b) {
                if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
                return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
            });
        if (!shown.length) {
            list.appendChild(h('p', { class: 'hn-empty', text: filter === 'open' ? 'No open notes.' : (filter === 'done' ? 'Nothing marked done yet.' : 'No notes yet.') }));
            return;
        }
        shown.forEach(function (x) { list.appendChild(card(x)); });
    }
    function card(x) {
        var mine = me && x.author_email === me;
        var el = h('article', { class: 'hn-note' + (x.status === 'done' ? ' done' : '') });
        var meta = h('div', { class: 'hn-meta' }, [
            h('span', { class: 'hn-status ' + x.status, text: x.status === 'done' ? 'Done' : 'Open' }),
            x.topic ? h('span', { class: 'hn-topic', text: x.topic }) : null,
            h('span', { text: (x.author_name || x.author_email) + ' · ' + when(x.created_at) + (x.updated_at && x.updated_at !== x.created_at && !x.done_at ? ' (edited)' : '') })]);
        el.appendChild(meta);
        if (editing === x.id) {
            var ta = h('textarea', { 'aria-label': 'Edit note', maxlength: '4000' });
            ta.value = x.body;
            el.appendChild(h('div', { class: 'hn-edit' }, [ta]));
            el.appendChild(h('div', { class: 'hn-actions' }, [
                h('button', { type: 'button', class: 'hn-btn primary', text: 'Save', onclick: function () {
                    editing = null;
                    act(call('admin_note_save', { id: x.id, page: PAGE, topic: x.topic, body: ta.value }));
                } }),
                h('button', { type: 'button', class: 'hn-btn', text: 'Cancel', onclick: function () { editing = null; renderList(); } })]));
            setTimeout(function () { ta.focus(); }, 0);
            return el;
        }
        el.appendChild(h('p', { class: 'hn-body', text: x.body }));
        if (x.reply) el.appendChild(h('div', { class: 'hn-reply' }, [h('b', { text: 'Reply from ' + (x.reply_by === 'claude' ? 'Claude' : x.reply_by) }), x.reply]));
        var acts = h('div', { class: 'hn-actions' });
        acts.appendChild(h('button', { type: 'button', class: 'hn-btn', text: x.status === 'done' ? 'Open again' : 'Mark done', onclick: function () {
            act(call('admin_note_status', { id: x.id, status: x.status === 'done' ? 'open' : 'done' }));
        } }));
        if (mine) {
            acts.appendChild(h('button', { type: 'button', class: 'hn-btn', text: 'Edit', onclick: function () { editing = x.id; renderList(); } }));
            acts.appendChild(h('button', { type: 'button', class: 'hn-btn danger', text: 'Delete', onclick: function () {
                if (!window.confirm('Delete this note? It disappears for every admin.')) return;
                act(call('admin_note_delete', { id: x.id }));
            } }));
        }
        el.appendChild(acts);
        return el;
    }

    /* ---------- start: the count shows on the button at once; the list loads with it ---------- */
    if (window.aisaReady) {
        window.aisaReady(function (a) {
            auth = a;
            if (!auth.adminRoster) return;
            (auth.whoami ? auth.whoami() : Promise.resolve({})).then(function (w) { me = String((w && w.email) || '').toLowerCase(); }, function () {})
                .then(load);
        });
    }
})();
