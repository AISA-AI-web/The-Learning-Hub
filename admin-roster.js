/* admin-roster.js — the Roster tab of the admin dashboard (4 Nov 2026).
 *
 * Staff list (add, edit name and groups, remove, bulk groups, CSV upload and download), the admins, and "mark a module
 * complete" for someone who cannot sign in. Every rule is enforced by the backend (12_roster_admin.gs, and the same
 * rules in the Supabase function); this file only asks and shows the answer. Names and addresses are put on the page
 * with textContent only, and kept nowhere: not in browser storage, not in the URL. */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var root = $('panel-roster');
    if (!root) return;

    var auth = null, me = '';
    var roster = [], admins = [], selected = {}, editing = '', pending = null;
    var busy = false;

    var MESSAGES = {
        invalid_email: 'That is not a valid email address.',
        invalid_tags: 'A group name is longer than 40 characters, or there are too many groups.',
        not_found: 'That person is no longer on the list. Refresh and try again.',
        not_school_email: 'Admins must have an @aisa.sch.ae account: it is the account they sign in with.',
        cannot_remove_self: 'You cannot remove yourself. Ask another admin to do it.',
        last_admin: 'That would leave no admins.',
        not_on_roster: 'Add the person to the staff list first.',
        invalid_module_id: 'Pick a module.',
        missing_rows: 'The file has no rows.',
        nothing_to_import: 'The file has no usable email addresses.',
        too_many_rows: 'The file has more than 3,000 rows. Split it and upload the parts one at a time.',
        busy_try_again: 'The Hub was busy. Try again in a moment.',
        not_admin: 'Only admins can do this.',
        unknown_action: 'The Hub’s backend has not been updated for the Roster tab yet.',
        request_timeout: 'The Hub took too long to answer. Check the list before trying again.'
    };
    var SKIP = { invalid_email: 'not a valid email', duplicate_in_file: 'the address is in the file twice (the first row is used)',
        invalid_tags: 'a group name is longer than 40 characters' };
    function say(err) { var c = (err && err.message) || String(err || ''); return MESSAGES[c] || ('Something went wrong (' + c + ').'); }

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

    function note(msg, kind) {
        var n = $('rs-status');
        n.textContent = msg || '';
        n.className = 'rs-note rs-' + (kind || 'ok') + (msg ? '' : ' hidden');
        if (msg) n.scrollIntoView({ block: 'nearest' });
    }

    function call(action, payload) {
        return auth.adminRoster(action, payload);
    }

    function setBusy(on) {
        busy = on;
        Array.prototype.forEach.call(root.querySelectorAll('button[data-guard]'), function (b) { b.disabled = on; });
    }

    /* ---------- loading ---------- */

    function load() {
        return call('admin_roster_list').then(function (r) {
            if (!r || r.ok === false) throw new Error((r && r.error) || 'server_error');
            roster = r.roster || []; admins = r.admins || [];
            var still = {};
            roster.forEach(function (p) { if (selected[p.email]) still[p.email] = true; });
            selected = still;
            render();
        });
    }

    /* ---------- the staff table ---------- */

    function tagsText(p) { return (p.tags || []).join(', '); }

    function visible() {
        var q = $('rs-search').value.trim().toLowerCase(), t = $('rs-tag').value;
        return roster.filter(function (p) {
            if (t === '__none') { if (p.tags.length) return false; }
            else if (t && p.tags.indexOf(t) === -1) return false;
            return !q || p.email.indexOf(q) !== -1 || p.name.toLowerCase().indexOf(q) !== -1;
        });
    }

    function renderTagFilter() {
        var sel = $('rs-tag'), cur = sel.value, tags = {};
        roster.forEach(function (p) { p.tags.forEach(function (t) { tags[t] = (tags[t] || 0) + 1; }); });
        sel.textContent = '';
        sel.appendChild(h('option', { value: '', text: 'All groups' }));
        sel.appendChild(h('option', { value: '__none', text: 'No group' }));
        Object.keys(tags).sort().forEach(function (t) { sel.appendChild(h('option', { value: t, text: t + ' (' + tags[t] + ')' })); });
        sel.value = Array.prototype.some.call(sel.options, function (o) { return o.value === cur; }) ? cur : '';
    }

    function renderStaff() {
        var rows = visible(), body = $('rs-rows');
        body.textContent = '';
        $('rs-count').textContent = rows.length === roster.length ? '(' + roster.length + ')' : '(' + rows.length + ' of ' + roster.length + ')';
        $('rs-empty').classList.toggle('hidden', rows.length > 0);
        $('rs-empty').textContent = roster.length ? 'No one matches.' : 'No one is on the staff list yet. Add a person, or upload a CSV.';
        rows.forEach(function (p) {
            var tr = h('tr', { class: selected[p.email] ? 'rs-sel' : '' });
            var cb = h('input', { type: 'checkbox', 'aria-label': 'Select ' + (p.name || p.email), onchange: function (e) {
                if (e.target.checked) selected[p.email] = true; else delete selected[p.email];
                renderBulk(); tr.className = selected[p.email] ? 'rs-sel' : '';
            } });
            cb.checked = !!selected[p.email];
            tr.appendChild(h('td', {}, [cb]));
            if (editing === p.email) {
                var nm = h('input', { type: 'text', value: p.name, maxlength: '300', 'aria-label': 'Name', class: 'rs-in' });
                var tg = h('input', { type: 'text', value: tagsText(p), 'aria-label': 'Groups', placeholder: 'secondary, maths', class: 'rs-in' });
                tr.appendChild(h('td', {}, [nm]));
                tr.appendChild(h('td', { class: 'rs-mono', text: p.email }));
                tr.appendChild(h('td', {}, [tg]));
                tr.appendChild(h('td', { class: 'rs-actions' }, [
                    h('button', { type: 'button', class: 'rs-btn rs-primary', 'data-guard': '', text: 'Save', onclick: function () {
                        act(call('admin_roster_save', { email: p.email, name: nm.value, tags: tg.value }), 'Saved ' + (nm.value || p.email) + '.', function () { editing = ''; });
                    } }),
                    h('button', { type: 'button', class: 'rs-btn', text: 'Cancel', onclick: function () { editing = ''; renderStaff(); } })
                ]));
            } else {
                tr.appendChild(h('td', { text: p.name || '—' }));
                tr.appendChild(h('td', { class: 'rs-mono', text: p.email }));
                var cell = h('td', {});
                if (!p.tags.length) cell.appendChild(h('span', { class: 'rs-dim', text: 'no group' }));
                p.tags.forEach(function (t) { cell.appendChild(h('span', { class: 'rs-chip', text: t })); });
                tr.appendChild(cell);
                tr.appendChild(h('td', { class: 'rs-actions' }, [
                    h('button', { type: 'button', class: 'rs-btn', text: 'Edit', onclick: function () { editing = p.email; renderStaff(); } }),
                    h('button', { type: 'button', class: 'rs-btn', text: 'Mark complete…', onclick: function () { prefillComplete(p.email); } }),
                    h('button', { type: 'button', class: 'rs-btn rs-danger', 'data-guard': '', text: 'Remove', onclick: function () {
                        if (!window.confirm('Remove ' + (p.name || p.email) + ' from the staff list?\n\nTheir training records are kept; they just stop being counted as expected staff.')) return;
                        act(call('admin_roster_remove', { email: p.email }), 'Removed ' + (p.name || p.email) + '.');
                    } })
                ]));
            }
            body.appendChild(tr);
        });
        var all = $('rs-all');
        all.checked = rows.length > 0 && rows.every(function (p) { return selected[p.email]; });
        renderBulk();
    }

    function renderBulk() {
        var n = Object.keys(selected).length;
        $('rs-bulk').classList.toggle('hidden', !n);
        $('rs-bulk-n').textContent = n + ' selected';
    }

    function render() { renderTagFilter(); renderStaff(); renderAdmins(); renderCompleteOptions(); }

    /* Runs a request, then reloads the lists; shows the message or the reason it failed. */
    function act(promise, okMsg, before) {
        setBusy(true);
        return promise.then(function (r) {
            if (r && r.ok === false) throw new Error(r.error);
            if (before) before(r);
            note(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'ok');
            return load();
        }).catch(function (err) { note(say(err), 'bad'); return load().catch(function () {}); })
          .then(function () { setBusy(false); });
    }

    /* ---------- add a person ---------- */

    $('rs-add-open').addEventListener('click', function () { $('rs-add').classList.toggle('hidden'); if (!$('rs-add').classList.contains('hidden')) $('rs-add-email').focus(); });
    $('rs-add-cancel').addEventListener('click', function () { $('rs-add').classList.add('hidden'); });
    $('rs-add').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = $('rs-add-email').value, name = $('rs-add-name').value, tags = $('rs-add-tags').value;
        act(call('admin_roster_save', { email: email, name: name, tags: tags }), function (r) {
            return (r.created ? 'Added ' : 'Updated ') + (name.trim() || email.trim().toLowerCase()) + '.';
        }, function () { $('rs-add').reset(); $('rs-add-email').focus(); });
    });

    ['rs-search', 'rs-tag'].forEach(function (id) { $(id).addEventListener('input', renderStaff); });
    $('rs-all').addEventListener('change', function (e) {
        visible().forEach(function (p) { if (e.target.checked) selected[p.email] = true; else delete selected[p.email]; });
        renderStaff();
    });

    /* ---------- groups for several people at once ---------- */

    function bulkTag(add) {
        var tag = $('rs-bulk-tag').value.trim().toLowerCase();
        if (!tag) { note('Type the group name first.', 'bad'); return; }
        if (tag.indexOf(',') !== -1) { note('One group at a time.', 'bad'); return; }
        var todo = roster.filter(function (p) { return selected[p.email]; }).map(function (p) {
            var t = p.tags.filter(function (x) { return x !== tag; });
            if (add) t.push(tag);
            return { email: p.email, tags: t, same: add ? p.tags.indexOf(tag) !== -1 : p.tags.indexOf(tag) === -1 };
        }).filter(function (x) { return !x.same; });
        if (!todo.length) { note('Nobody needed changing.', 'ok'); return; }
        setBusy(true);
        var done = 0;
        todo.reduce(function (chain, x) {
            return chain.then(function () {
                return call('admin_roster_save', { email: x.email, tags: x.tags }).then(function (r) {
                    if (r && r.ok === false) throw new Error(r.error);
                    done++; note((add ? 'Adding' : 'Removing') + ' “' + tag + '”… ' + done + ' of ' + todo.length, 'ok');
                });
            });
        }, Promise.resolve()).then(function () {
            note((add ? 'Added “' : 'Removed “') + tag + '” for ' + done + ' ' + (done === 1 ? 'person' : 'people') + '.', 'ok');
        }).catch(function (err) { note(say(err) + ' (' + done + ' of ' + todo.length + ' done.)', 'bad'); })
          .then(function () { setBusy(false); return load(); });
    }
    $('rs-bulk-add').addEventListener('click', function () { bulkTag(true); });
    $('rs-bulk-del').addEventListener('click', function () { bulkTag(false); });
    $('rs-bulk-remove').addEventListener('click', function () {
        var emails = Object.keys(selected);
        if (!window.confirm('Remove ' + emails.length + ' ' + (emails.length === 1 ? 'person' : 'people') + ' from the staff list?')) return;
        setBusy(true);
        var done = 0;
        emails.reduce(function (chain, e) {
            return chain.then(function () { return call('admin_roster_remove', { email: e }).then(function (r) { if (r && r.ok === false && r.error !== 'not_found') throw new Error(r.error); done++; }); });
        }, Promise.resolve()).then(function () { selected = {}; note('Removed ' + done + '.', 'ok'); })
          .catch(function (err) { note(say(err) + ' (' + done + ' removed.)', 'bad'); })
          .then(function () { setBusy(false); return load(); });
    });

    /* ---------- CSV: reading, previewing, uploading ---------- */

    /* One CSV (or tab- or semicolon-separated) text as rows of cells. Quotes, doubled quotes, CRLF and a BOM are handled. */
    function parseCsv(text) {
        text = String(text).replace(/^﻿/, '');
        var first = text.split(/\r?\n/, 1)[0] || '';
        var count = function (c) { return first.split(c).length - 1; };
        var sep = count('\t') > count(',') && count('\t') > count(';') ? '\t' : (count(';') > count(',') ? ';' : ',');
        var rows = [], row = [], cell = '', q = false;
        for (var i = 0; i < text.length; i++) {
            var c = text[i];
            if (q) {
                if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
                else cell += c;
            } else if (c === '"' && cell === '') q = true;
            else if (c === sep) { row.push(cell); cell = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); cell = '';
                if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
                row = [];
            } else cell += c;
        }
        row.push(cell);
        if (row.some(function (x) { return x.trim() !== ''; })) rows.push(row);
        return rows;
    }

    /* Which column is which, from the first row. Falls back to email, name, groups when the first row is a person. */
    function mapColumns(rows) {
        var head = rows[0].map(function (x) { return x.trim().toLowerCase().replace(/[_\s]+/g, ' '); });
        var find = function (re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; };
        var cols = { email: find(/^(e-?mail( address)?|mail|address|staff email|work email)$/), name: find(/^(name|full name|staff name|staff|display name|teacher)$/),
            first: find(/^(first name|given name|firstname|forename)$/), last: find(/^(last name|family name|surname|lastname)$/),
            tags: find(/^(tags?|groups?|teams?|cohorts?)$/) };
        if (cols.email !== -1) return { cols: cols, start: 1, header: true };
        if (/@/.test(rows[0][0] || '')) return { cols: { email: 0, name: rows[0].length > 1 ? 1 : -1, first: -1, last: -1, tags: rows[0].length > 2 ? 2 : -1 }, start: 0, header: false };
        return null;
    }

    function fromCsv(text) {
        var rows = parseCsv(text);
        if (!rows.length) return { error: 'The file is empty.' };
        var m = mapColumns(rows);
        if (!m) return { error: 'I could not find an email column. The first row should say Email, Name, Groups.' };
        var out = [];
        for (var i = m.start; i < rows.length; i++) {
            var r = rows[i], c = m.cols, get = function (k) { return k >= 0 && r[k] != null ? String(r[k]).trim() : ''; };
            var name = get(c.name) || [get(c.first), get(c.last)].filter(Boolean).join(' ');
            out.push({ email: get(c.email), name: name, tags: get(c.tags).replace(/[;|]/g, ',') });
        }
        return { rows: out, header: m.header, groupsColumn: m.cols.tags !== -1 };
    }

    var EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

    function cleanTags(s) {
        var seen = {}, out = [];
        String(s || '').split(',').forEach(function (t) { t = t.trim().toLowerCase(); if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
        return out;
    }

    $('rs-file').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { note('That file is over 2 MB. A staff list should be much smaller: is it the right file?', 'bad'); return; }
        var rd = new FileReader();
        rd.onload = function () { preview(f.name, String(rd.result || '')); };
        rd.onerror = function () { note('I could not read that file.', 'bad'); };
        rd.readAsText(f);
    });

    function preview(fileName, text) {
        var parsed = fromCsv(text);
        if (parsed.error) { note(parsed.error, 'bad'); return; }
        if (parsed.rows.length > 3000) { note('The file has ' + parsed.rows.length + ' rows; the limit is 3,000. Split it and upload the parts one at a time.', 'bad'); return; }
        var have = {};
        roster.forEach(function (p) { have[p.email] = p; });
        var seen = {}, add = 0, change = 0, same = 0, bad = [], dup = [], keep = {};
        parsed.rows.forEach(function (r, i) {
            var e = r.email.trim().toLowerCase();
            if (!e || !EMAIL_RE.test(e)) { bad.push(i + 1 + (parsed.header ? 1 : 0)); return; }
            if (seen[e]) { dup.push(e); return; }
            seen[e] = 1; keep[e] = 1;
            var cur = have[e];
            if (!cur) { add++; return; }
            var nm = r.name || cur.name, tg = cleanTags(r.tags).length ? cleanTags(r.tags).join(',') : cur.tags.join(',');
            if (nm === cur.name && tg === cur.tags.join(',')) same++; else change++;
        });
        var remove = roster.filter(function (p) { return !keep[p.email]; }).length;
        pending = { rows: parsed.rows, remove: remove, valid: add + change + same };
        var box = $('rs-preview');
        box.textContent = '';
        box.classList.remove('hidden');
        box.appendChild(h('h4', { text: 'Ready to upload ' + fileName }));
        box.appendChild(h('p', { text: add + ' to add, ' + change + ' to update, ' + same + ' unchanged' +
            (bad.length ? ', ' + bad.length + ' skipped (no valid email, line' + (bad.length === 1 ? ' ' : 's ') + bad.slice(0, 10).join(', ') + (bad.length > 10 ? '…' : '') + ')' : '') +
            (dup.length ? ', ' + dup.length + ' repeated address' + (dup.length === 1 ? '' : 'es') + ' (the first row is used)' : '') + '.' }));
        box.appendChild(h('p', { class: 'rs-dim', text: 'A blank name or Groups cell keeps what the person already has. ' +
            (parsed.groupsColumn ? '' : 'This file has no Groups column, so nobody’s groups change.') }));
        var rm = h('input', { type: 'checkbox', id: 'rs-replace' });
        box.appendChild(h('label', { class: 'rs-check' }, [rm, ' Also remove the ' + remove + ' ' + (remove === 1 ? 'person' : 'people') + ' who ' + (remove === 1 ? 'is' : 'are') + ' on the list now but not in this file']));
        box.appendChild(h('div', { class: 'rs-actions' }, [
            h('button', { type: 'button', class: 'rs-btn rs-primary', 'data-guard': '', text: 'Upload', onclick: function () { upload(rm.checked); } }),
            h('button', { type: 'button', class: 'rs-btn', text: 'Cancel', onclick: function () { pending = null; box.classList.add('hidden'); } })
        ]));
        note('', 'ok');
        box.scrollIntoView({ block: 'nearest' });
    }

    function upload(replace) {
        if (!pending || !pending.valid) { note('Nothing usable to upload.', 'bad'); return; }
        if (replace && pending.remove && !window.confirm('This removes ' + pending.remove + ' ' + (pending.remove === 1 ? 'person' : 'people') + ' from the staff list. Their training records are kept. Continue?')) return;
        var rows = pending.rows;
        setBusy(true);
        call('admin_roster_import', { rows: rows, remove_missing: !!replace }).then(function (r) {
            if (r && r.ok === false) { var e = new Error(r.error); e.skipped = r.skipped; throw e; }
            pending = null; $('rs-preview').classList.add('hidden');
            var bits = [r.added + ' added', r.updated + ' updated'];
            if (r.removed) bits.push(r.removed + ' removed');
            if (r.skipped && r.skipped.length) bits.push(r.skipped.length + ' skipped');
            note('Upload finished: ' + bits.join(', ') + '.', 'ok');
            showSkipped(r.skipped);
            return load();
        }).catch(function (err) { note(say(err), 'bad'); })
          .then(function () { setBusy(false); });
    }

    function showSkipped(list) {
        var box = $('rs-skipped');
        box.textContent = '';
        if (!list || !list.length) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        box.appendChild(h('p', { text: 'These rows were not used:' }));
        var ul = h('ul', {});
        list.slice(0, 50).forEach(function (s) { ul.appendChild(h('li', { text: 'Row ' + s.line + (s.email ? ' (' + s.email + ')' : '') + ': ' + (SKIP[s.reason] || s.reason) })); });
        if (list.length > 50) ul.appendChild(h('li', { text: '…and ' + (list.length - 50) + ' more.' }));
        box.appendChild(ul);
    }

    /* ---------- CSV: download ---------- */

    /* A cell that starts with = + - @ would be run as a formula by a spreadsheet, so it gets a leading apostrophe. */
    function csvCell(v) {
        v = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
        return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    function download(name, rows) {
        var blob = new Blob(['﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
        var a = h('a', { href: URL.createObjectURL(blob), download: name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }
    $('rs-export').addEventListener('click', function () {
        download('aisa-hub-staff-list.csv', [['Email', 'Name', 'Groups']].concat(roster.map(function (p) { return [p.email, p.name, p.tags.join(', ')]; })));
    });
    $('rs-template').addEventListener('click', function () {
        download('aisa-hub-staff-list-template.csv', [['Email', 'Name', 'Groups'], ['a.teacher@aisa.sch.ae', 'A Teacher', 'secondary, maths'], ['guest@gmail.com', 'A Guest', 'secondary']]);
    });

    /* ---------- admins ---------- */

    function renderAdmins() {
        var body = $('rs-admin-rows');
        body.textContent = '';
        admins.forEach(function (a) {
            var self = a.email === me;
            body.appendChild(h('tr', {}, [
                h('td', { text: (a.name || '—') + (self ? '  (you)' : '') }),
                h('td', { class: 'rs-mono', text: a.email }),
                h('td', { text: a.role || '—' }),
                h('td', { class: 'rs-actions' }, [
                    h('button', { type: 'button', class: 'rs-btn rs-danger', 'data-guard': '', disabled: self || admins.length < 2, title: self ? 'You cannot remove yourself' : '', text: 'Remove', onclick: function () {
                        if (!window.confirm('Remove ' + (a.name || a.email) + ' as an admin? They will no longer be able to open the admin pages.')) return;
                        act(call('admin_admin_remove', { email: a.email }), 'Removed ' + (a.name || a.email) + ' as an admin.');
                    } })
                ])
            ]));
        });
    }
    $('rs-admin-add').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = $('rs-admin-email').value, name = $('rs-admin-name').value, role = $('rs-admin-role').value;
        if (!window.confirm('Make ' + (email.trim() || 'this person') + ' an admin? Admins can read everyone’s training records and what staff wrote in modules and goals, post notifications and change this list.')) return;
        act(call('admin_admin_save', { email: email, name: name, role: role }), function (r) { return (r.created ? 'Added ' : 'Updated ') + (name.trim() || email.trim().toLowerCase()) + ' as an admin.'; },
            function () { $('rs-admin-add').reset(); });
    });

    /* ---------- mark a module complete ---------- */

    function renderCompleteOptions() {
        var list = $('rs-people');
        list.textContent = '';
        roster.forEach(function (p) { list.appendChild(h('option', { value: p.email, label: p.name })); });
        var sel = $('rs-module');
        if (sel.options.length <= 1) {
            var mods = (typeof MODULES !== 'undefined' && MODULES) || [];
            mods.forEach(function (m) { sel.appendChild(h('option', { value: m.id, text: m.title })); });
        }
    }
    function prefillComplete(email) {
        $('rs-done-email').value = email;
        $('rs-done').scrollIntoView({ block: 'center' });
        $('rs-module').focus();
    }
    $('rs-done').addEventListener('submit', function (e) {
        e.preventDefault();
        var email = $('rs-done-email').value.trim().toLowerCase(), mod = $('rs-module').value;
        var p = roster.filter(function (x) { return x.email === email; })[0];
        if (!p) { note('Pick someone from the staff list first.', 'bad'); return; }
        if (!mod) { note('Pick a module.', 'bad'); return; }
        var title = $('rs-module').selectedOptions[0].textContent;
        if (!window.confirm('Record “' + title + '” as finished for ' + (p.name || p.email) + '?\n\nIt shows on the tracker as completed, and says an admin marked it.')) return;
        act(call('admin_mark_complete', { email: email, module_id: mod }), function (r) {
            return r.already ? (p.name || p.email) + ' already had “' + title + '” recorded.' : 'Recorded “' + title + '” as finished for ' + (p.name || p.email) + '.';
        }, function () { $('rs-done').reset(); });
    });

    /* ---------- start ---------- */

    /* Loads the first time the tab is shown (it is hidden until then, and a page that is not an admin's never gets here), so
     * it never queues behind the dashboard's own request. A failed first load is tried again the next time it is shown. */
    var loaded = false, loading = false;
    function ensure() {
        if (loaded || loading || root.classList.contains('hidden') || !window.aisaReady) return;
        loading = true;
        window.aisaReady(function (a) {
            auth = a;
            if (!auth.adminRoster) { loading = false; note('The Hub\u2019s page code is out of date. Reload the page.', 'bad'); return; }
            (auth.whoami ? auth.whoami() : Promise.resolve({})).then(function (w) { me = String((w && w.email) || '').toLowerCase(); }, function () {})
                .then(load).then(function () { loaded = true; })
                .catch(function (err) { note(say(err), 'bad'); })
                .then(function () { loading = false; });
        });
    }
    new MutationObserver(ensure).observe(root, { attributes: true, attributeFilter: ['class'] });
    ensure();
})();
