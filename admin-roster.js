/* admin-roster.js — the People tab of the admin dashboard (the Roster tab, 4 Nov 2026; People since 9 Nov 2026: sub-tabs Staff list |
 * Admins | Sync with HR | Removed, compact rows with a ⋯ menu, 50 to a page).
 *
 * Staff list (add, edit name and groups, remove, bulk groups, CSV upload and download), the admins, and "mark a module
 * complete" for someone who cannot sign in. Every rule is enforced by the backend (12_roster_admin.gs, and the same
 * rules in the Supabase function); this file only asks and shows the answer. "Check against the school's staff list"
 * (5 Nov 2026) reads HR's list (.xlsx, .csv or pasted), shows who to invite and who to remove, and applies it. Names and addresses are put on the page
 * with textContent only, and kept nowhere: not in browser storage, not in the URL. */
(function () {
    'use strict';

    var $ = function (id) { return document.getElementById(id); };
    var root = $('panel-people');
    if (!root) return;

    var auth = null, me = '';
    var roster = [], admins = [], removed = [], selected = {}, editing = '', pending = null, check = null;
    var busy = false, page = 0, PER_PAGE = 50;

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
        request_timeout: 'The Hub took too long to answer. Check the list before trying again.',
        list_too_short: 'That list has fewer than 20 usable email addresses, so it cannot be the whole staff list. Check that you chose the right file.',
        not_flagged: 'The Hub’s view of who is on the list changed while you were reviewing. Check the list again.',
        mail_not_ready: 'The Hub cannot send email yet. Untick “Send the invitation email” to carry on without it.',
        mail_not_authorized: 'The Hub cannot send email right now. Untick “Send the invitation email” to carry on without it, and invite them later.',
        quota_low: 'There are not enough emails left in today’s sending allowance for all the invitations. Try again tomorrow, or untick “Send the invitation email”.',
        not_xlsx: 'I could not read that Excel file. Save it as CSV (File, Save as) and choose that, or paste the columns instead.'
    };
    var SKIP = { invalid_email: 'not a valid email', duplicate_in_file: 'the address is in the file twice (the first row is used)',
        not_school_email: 'not an @aisa.sch.ae address, so it is ignored',
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
            try { document.dispatchEvent(new CustomEvent('aisa:roster', { detail: { roster: roster } })); } catch (e) { /* old browser: filters wait for a reload */ }
            /* Its own request: an older server does not have it, and the rest of the tab must work without it. */
            return call('admin_removed_list').then(function (x) { removed = (x && x.ok !== false && x.removed) || []; }, function () { removed = null; })
                .then(renderRemoved);
        });
    }

    /* ---------- the staff table ---------- */

    function tagsText(p) { return (p.tags || []).join(', '); }

    /* ---------- roles in groups (9 Nov 2026): team:<id>, gll, hod, slt, llt; see admin-dashboard.js ---------- */
    var ROLE_LABEL = { slt: 'SLT', llt: 'LLT', gll: 'GLL', hod: 'HOD' };
    function G() { return window.aisaStaffGroups || null; }
    function isRole(t) { return !!ROLE_LABEL[t] || String(t).indexOf('team:') === 0; }
    function plainTags(p) { return (p.tags || []).filter(function (t) { return !isRole(t); }); }
    function roleTags(p) { return (p.tags || []).filter(isRole); }
    function teamLabel(id) {
        var t = ((G() && G().teams) || []).filter(function (x) { return x.id === id; })[0];
        return t ? t.label : id;
    }
    function roleText(t) { return ROLE_LABEL[t] || teamLabel(String(t).slice(5)); }
    function rolesLive() { return !!(G() && G().rolesFromTags && G().rolesFromTags()); }

    function visible() {
        var q = $('rs-search').value.trim().toLowerCase(), t = $('rs-tag').value, dv = $('rs-div').value, tm = $('rs-team').value;
        var g = window.aisaStaffGroups;
        return roster.filter(function (p) {
            if (dv === '__none') { if (p.division) return false; }
            else if (dv && g && !g.inStaff(p, dv)) return false;
            if (tm && g && !g.inTeam(p, tm)) return false;
            if (t === '__none') { if (p.tags.length) return false; }
            else if (t && p.tags.indexOf(t) === -1) return false;
            return !q || p.email.indexOf(q) !== -1 || p.name.toLowerCase().indexOf(q) !== -1 || (p.department || '').toLowerCase().indexOf(q) !== -1 || (p.designation || '').toLowerCase().indexOf(q) !== -1;
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

    /* Staff group and Grade or team: the tracker's own lists (window.aisaStaffGroups in admin-dashboard.js), counted on
     * the staff list. "No division" is added for people HR's list has not reached yet. */
    function renderDivFilter() {
        var sel = $('rs-div'), team = $('rs-team'), g = window.aisaStaffGroups, cur = sel.value;
        if (!g || !g.ready()) { sel.classList.add('hidden'); team.classList.add('hidden'); return; }
        var has = g.fillStaff(sel, roster, 'Every staff group');
        var none = roster.filter(function (p) { return !p.division; }).length;
        if (has && none) sel.appendChild(h('option', { value: '__none', text: 'No division (' + none + ')' }));
        if (cur === '__none' && none) sel.value = '__none';
        sel.classList.toggle('hidden', !has);
        team.classList.toggle('hidden', !g.fillTeams(team, roster, 'Every grade and team'));
    }
    document.addEventListener('aisa:staff-groups', function () { if (roster.length) { renderDivFilter(); renderStaff(); renderRolesCard(); } });

    function person(p, suffix) {
        return h('div', { class: 'rs-person' }, [h('b', { text: (p.name || p.email) + (suffix || '') }), p.name ? h('span', { text: p.email }) : null]);
    }

    /* The "⋯" menu on a row: one panel, moved to whichever row asked for it. */
    var menu = null;
    function closeMenu(back) {
        if (!menu) return;
        menu.el.remove();
        menu.btn.setAttribute('aria-expanded', 'false');
        if (back) menu.btn.focus();
        menu = null;
    }
    function rowMenu(label, items) {
        var btn = h('button', { type: 'button', class: 'rs-btn rs-more', 'aria-label': 'Actions for ' + label, 'aria-haspopup': 'true', 'aria-expanded': 'false' });
        btn.innerHTML = '<svg aria-hidden="true"><use href="#i-more"/></svg>';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var was = menu && menu.btn === btn;
            closeMenu(false);
            if (was) return;
            var el = h('div', { class: 'ad-pop', role: 'menu', 'aria-label': 'Actions for ' + label });
            items.forEach(function (it) {
                el.appendChild(h('button', { type: 'button', role: 'menuitem', class: 'ad-mi' + (it.danger ? ' danger' : ''), text: it.text, disabled: busy && it.guard,
                    onclick: function () { closeMenu(false); it.run(); } }));
            });
            el.addEventListener('click', function (ev) { ev.stopPropagation(); });
            el.addEventListener('keydown', function (ev) {
                var list = Array.prototype.slice.call(el.querySelectorAll('[role="menuitem"]:not(:disabled)'));
                var i = list.indexOf(document.activeElement);
                if (ev.key === 'ArrowDown') { ev.preventDefault(); list[(i + 1) % list.length].focus(); }
                else if (ev.key === 'ArrowUp') { ev.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
                else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
            });
            btn.parentNode.style.position = 'relative';
            btn.parentNode.appendChild(el);
            btn.setAttribute('aria-expanded', 'true');
            menu = { el: el, btn: btn };
            var first = el.querySelector('[role="menuitem"]:not(:disabled)');
            if (first) first.focus();
        });
        return btn;
    }
    document.addEventListener('click', function () { closeMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(true); });

    function removePerson(p) {
        if (!window.confirm('Remove ' + (p.name || p.email) + ' from the staff list?\n\nTheir training records are kept; they just stop being counted as expected staff.')) return;
        act(call('admin_roster_remove', { email: p.email }), 'Removed ' + (p.name || p.email) + '.');
    }

    function renderStaff() {
        var rows = visible(), body = $('rs-rows');
        closeMenu(false);
        body.textContent = '';
        $('rs-count').textContent = rows.length === roster.length ? '(' + roster.length + ')' : '(' + rows.length + ' of ' + roster.length + ')';
        $('rs-empty').classList.toggle('hidden', rows.length > 0);
        $('rs-empty').textContent = roster.length ? 'No one matches.' : 'No one is on the staff list yet. Add a person, or upload a CSV.';
        page = Math.max(0, Math.min(page, Math.ceil(rows.length / PER_PAGE) - 1));
        rows.slice(page * PER_PAGE, (page + 1) * PER_PAGE).forEach(function (p) {
            var tr = h('tr', { class: selected[p.email] ? 'rs-sel' : '' });
            var cb = h('input', { type: 'checkbox', 'aria-label': 'Select ' + (p.name || p.email), onchange: function (e) {
                if (e.target.checked) selected[p.email] = true; else delete selected[p.email];
                renderBulk(); tr.className = selected[p.email] ? 'rs-sel' : '';
                syncAll(rows);
            } });
            cb.checked = !!selected[p.email];
            tr.appendChild(h('td', { class: 'rs-cb' }, [cb]));
            if (editing === p.email) {
                var nm = h('input', { type: 'text', value: p.name, maxlength: '300', 'aria-label': 'Name', class: 'rs-in' });
                var tg = h('input', { type: 'text', value: plainTags(p).join(', '), 'aria-label': 'Groups', placeholder: 'secondary, maths', class: 'rs-in' });
                var live = rolesLive(), mineRoles = roleTags(p);
                var teamSel = h('select', { class: 'rs-in', 'aria-label': 'Team or grade', disabled: !live });
                teamSel.appendChild(h('option', { value: '', text: 'No team' }));
                ((G() && G().teams) || []).forEach(function (t) { teamSel.appendChild(h('option', { value: 'team:' + t.id, text: t.label })); });
                var curTeam = mineRoles.filter(function (t) { return t.indexOf('team:') === 0; });
                teamSel.value = curTeam[0] || '';
                var boxes = ['gll', 'hod', 'slt', 'llt'].map(function (r) {
                    var cb = h('input', { type: 'checkbox', 'aria-label': ROLE_LABEL[r], disabled: !live });
                    cb.checked = mineRoles.indexOf(r) !== -1;
                    cb.setAttribute('data-role', r);
                    return cb;
                });
                var roleBox = h('div', { class: 'rs-roles' }, [teamSel, h('span', { class: 'rs-role-checks' }, boxes.map(function (cb) {
                    return h('label', {}, [cb, ' ' + ROLE_LABEL[cb.getAttribute('data-role')]]);
                })), live ? null : h('span', { class: 'rs-dim', text: 'Roles are set by the faculty list until they are moved here: People › Sync with HR.' })]);
                var tagsToSave = function () {
                    if (!live) return tg.value.split(',').concat(mineRoles).join(',');
                    var out = tg.value.split(',').filter(function (t) { return !isRole(t.trim().toLowerCase()); });
                    curTeam.slice(1).forEach(function (t) { out.push(t); });   // a second team, kept as it was
                    if (teamSel.value) out.push(teamSel.value);
                    boxes.forEach(function (cb) { if (cb.checked) out.push(cb.getAttribute('data-role')); });
                    return out.join(',');
                };
                var dp = h('input', { type: 'text', value: p.department || '', maxlength: '200', 'aria-label': 'Department', placeholder: 'Primary - Grade 4', class: 'rs-in' });
                var ds = h('input', { type: 'text', value: p.designation || '', maxlength: '200', 'aria-label': 'Designation', placeholder: 'Homeroom Teacher', class: 'rs-in' });
                tr.appendChild(h('td', {}, [nm, h('span', { class: 'rs-dim', style: 'display:block', text: p.email })]));
                tr.appendChild(h('td', {}, [dp]));
                tr.appendChild(h('td', {}, [ds]));
                tr.appendChild(h('td', {}, [tg, roleBox]));
                tr.appendChild(h('td', { class: 'rs-actions' }, [
                    h('button', { type: 'button', class: 'rs-btn rs-primary', 'data-guard': '', text: 'Save', onclick: function () {
                        act(call('admin_roster_save', { email: p.email, name: nm.value, tags: tagsToSave(), department: dp.value, designation: ds.value }), 'Saved ' + (nm.value || p.email) + '.', function () { editing = ''; });
                    } }),
                    h('button', { type: 'button', class: 'rs-btn', text: 'Cancel', onclick: function () { editing = ''; renderStaff(); } })
                ]));
                setTimeout(function () { nm.focus(); }, 0);
            } else {
                tr.appendChild(h('td', {}, [person(p)]));
                tr.appendChild(h('td', { 'data-label': 'Department', text: p.department || '—' }));
                tr.appendChild(h('td', { 'data-label': 'Designation', text: p.designation || '—' }));
                var cell = h('td', { 'data-label': 'Groups' });
                if (!p.tags.length) cell.appendChild(h('span', { class: 'rs-dim', text: 'no group' }));
                roleTags(p).forEach(function (t) { cell.appendChild(h('span', { class: 'rs-chip rs-role', title: t, text: roleText(t) })); });
                plainTags(p).forEach(function (t) { cell.appendChild(h('span', { class: 'rs-chip', text: t })); });
                tr.appendChild(cell);
                tr.appendChild(h('td', { class: 'rs-menu-cell' }, [rowMenu(p.name || p.email, [
                    { text: 'Edit', run: function () { editing = p.email; renderStaff(); } },
                    { text: 'Mark a module complete…', run: function () { prefillComplete(p.email); } },
                    { text: 'Remove from the staff list', danger: true, guard: true, run: function () { removePerson(p); } }
                ])]));
            }
            body.appendChild(tr);
        });
        syncAll(rows);
        renderPager(rows.length);
        renderBulk();
        var n = $('pp-staff-n');
        if (n) { n.textContent = roster.length; n.classList.toggle('hidden', !roster.length); }
    }

    function syncAll(rows) {
        var all = $('rs-all'), sel = rows.filter(function (p) { return selected[p.email]; }).length;
        all.checked = rows.length > 0 && sel === rows.length;
        all.indeterminate = sel > 0 && sel < rows.length;
    }

    function renderPager(total) {
        var el = $('rs-pager');
        if (!el) return;
        el.textContent = '';
        if (total <= PER_PAGE) return;
        var pages = Math.ceil(total / PER_PAGE);
        var info = h('span', { class: 'ad-num', text: (page * PER_PAGE + 1) + '–' + Math.min(total, (page + 1) * PER_PAGE) + ' of ' + total });
        function btn(label, to, off) {
            return h('button', { type: 'button', class: 'ad-btn sm', text: label, disabled: off, onclick: function () { page = to; renderStaff(); $('rs-staff-h').scrollIntoView({ block: 'start' }); } });
        }
        el.appendChild(info);
        el.appendChild(h('span', { class: 'ad-pager-btns' }, [btn('Previous', page - 1, page === 0),
            h('span', { class: 'ad-num', style: 'align-self:center', text: 'Page ' + (page + 1) + ' of ' + pages }), btn('Next', page + 1, page >= pages - 1)]));
    }

    function renderBulk() {
        var n = Object.keys(selected).length;
        $('rs-bulk').classList.toggle('hidden', !n);
        $('rs-bulk-n').textContent = n + ' selected';
    }

    function render() { renderTagFilter(); renderDivFilter(); renderStaff(); renderAdmins(); renderCompleteOptions(); renderRolesCard(); }

    /* ---------- Teams and roles: from the faculty list to the staff list, once (9 Nov 2026) ---------- */
    function renderRolesCard() {
        var g = G(), status = $('rs-roles-status'), detail = $('rs-roles-detail'), btn = $('rs-roles-move');
        if (!status) return;
        detail.textContent = '';
        if (!g || !g.ready()) { status.textContent = 'Waiting for the dashboard’s data…'; btn.classList.add('hidden'); return; }
        var count = function (test) { return roster.filter(function (p) { return roleTags(p).some(test); }).length; };
        if (rolesLive()) {
            btn.classList.add('hidden');
            status.textContent = 'Teams and roles are kept on the staff list: ' + count(function (t) { return t.indexOf('team:') === 0; }) + ' people have a team, ' +
                count(function (t) { return t === 'gll' || t === 'hod'; }) + ' lead one (GLL or HOD), ' + count(function (t) { return t === 'slt'; }) + ' are SLT and ' +
                count(function (t) { return t === 'llt'; }) + ' LLT. To change someone’s, open ⋯ › Edit on the Staff list. HR’s grade departments still count for the homeroom teams.';
            return;
        }
        var seed = g.seedRoles(roster), c = seed.counts;
        status.textContent = 'Teams and roles now come from the faculty list in the Hub’s code and from HR job titles, so only Claude can change them. ' +
            'Move them to the staff list to change them here: ' + plural(c.people, 'person gets', 'people get') + ' their roles as groups (' +
            plural(c.team, 'team place', 'team places') + ', ' + plural(c.gll, 'GLL', 'GLLs') + ', ' + plural(c.hod, 'HOD', 'HODs') + ', ' +
            c.slt + ' SLT, ' + c.llt + ' LLT). Nothing else about them changes.';
        if (seed.offList.length) detail.appendChild(block('Not on the staff list, so not moved (' + seed.offList.length + ')',
            [h('p', { text: 'They are on the faculty list and have signed in, but are not on the staff list. Add them, then move again.' }), h('ul', { class: 'rs-list' }, seed.offList.map(function (n) { return h('li', { text: n }); }))]));
        if (seed.unmatched.length) detail.appendChild(block('On the faculty list but not found on the Hub (' + seed.unmatched.length + ')',
            [h('p', { text: 'Not signed in yet, or a different spelling. Once they are on the staff list, give them their team with ⋯ › Edit.' }), h('ul', { class: 'rs-list' }, seed.unmatched.map(function (n) { return h('li', { text: n }); }))]));
        btn.classList.toggle('hidden', !seed.rows.length);
        btn.onclick = function () {
            if (!window.confirm('Write the teams and roles of ' + seed.rows.length + ' people to the staff list as groups?\n\nFrom then on every admin changes them on the Staff list (⋯ › Edit), and the code’s faculty list is no longer used.')) return;
            act(call('admin_roster_import', { rows: seed.rows.map(function (r) { return { email: r.email, tags: r.tags.join(',') }; }) }),
                function (r) { return 'Teams and roles moved to the staff list for ' + (r.updated || seed.rows.length) + ' people.'; });
        };
    }

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
        act(call('admin_roster_save', { email: email, name: name, tags: tags, department: $('rs-add-dept').value, designation: $('rs-add-desig').value }), function (r) {
            return (r.created ? 'Added ' : 'Updated ') + (name.trim() || email.trim().toLowerCase()) + '.';
        }, function () { $('rs-add').reset(); $('rs-add-email').focus(); });
    });

    ['rs-search', 'rs-tag', 'rs-div', 'rs-team'].forEach(function (id) { $(id).addEventListener('input', function () { page = 0; renderStaff(); }); });
    $('rs-bulk-clear').addEventListener('click', function () { selected = {}; renderStaff(); });
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
        var cols = { email: find(/^(e-?mail( address)?|mail|address|staff email|work email)$/), name: find(/^(name|full name|staff name|employee name|employee|staff|display name|teacher)$/),
            first: find(/^(first name|given name|firstname|forename)$/), last: find(/^(last name|family name|surname|lastname)$/),
            tags: find(/^(tags?|groups?|teams?|cohorts?)$/),
            designation: find(/^(designation|job title|position|post|role|title)$/), department: find(/^(department|dept|section)$/) };
        if (cols.email !== -1) return { cols: cols, start: 1, header: true };
        if (/@/.test(rows[0][0] || '')) return { cols: { email: 0, name: rows[0].length > 1 ? 1 : -1, first: -1, last: -1, tags: rows[0].length > 2 ? 2 : -1, designation: -1, department: -1 }, start: 0, header: false };
        return null;
    }

    function fromCsv(text) { return fromRows(parseCsv(text)); }

    function fromRows(rows) {
        if (!rows.length) return { error: 'The file is empty.' };
        var m = mapColumns(rows);
        if (!m) return { error: 'I could not find an email column. The first row should say Email, Name, Groups.' };
        var out = [];
        for (var i = m.start; i < rows.length; i++) {
            var r = rows[i], c = m.cols, get = function (k) { return k >= 0 && r[k] != null ? String(r[k]).trim() : ''; };
            var name = get(c.name) || [get(c.first), get(c.last)].filter(Boolean).join(' ');
            out.push({ email: get(c.email), name: name, tags: get(c.tags).replace(/[;|]/g, ','), designation: get(c.designation), department: get(c.department) });
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
        /* A groups cell replaces the person's groups. Their roles (team, GLL, HOD, SLT, LLT) are kept unless the file names roles. */
        var have = {};
        roster.forEach(function (p) { have[p.email] = p; });
        var rows = pending.rows.map(function (r) {
            var cur = have[String(r.email || '').trim().toLowerCase()];
            var tags = cleanTags(r.tags);
            if (!cur || !tags.length || tags.some(isRole)) return r;
            return Object.assign({}, r, { tags: tags.concat(roleTags(cur)).join(',') });
        });
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
        download('aisa-hub-staff-list.csv', [['Email', 'Name', 'Designation', 'Department', 'Groups']].concat(roster.map(function (p) { return [p.email, p.name, p.designation || '', p.department || '', p.tags.join(', ')]; })));
    });
    $('rs-template').addEventListener('click', function () {
        download('aisa-hub-staff-list-template.csv', [['Email', 'Name', 'Groups'], ['a.teacher@aisa.sch.ae', 'A Teacher', 'secondary, maths'], ['guest@gmail.com', 'A Guest', 'secondary']]);
    });

    /* ---------- admins ---------- */

    function renderAdmins() {
        var body = $('rs-admin-rows');
        body.textContent = '';
        var n = $('pp-admins-n');
        if (n) { n.textContent = admins.length; n.classList.toggle('hidden', !admins.length); }
        admins.forEach(function (a) {
            var self = a.email === me;
            body.appendChild(h('tr', {}, [
                h('td', {}, [person(a, self ? ' (you)' : '')]),
                h('td', { 'data-label': 'Role', text: a.role || '—' }),
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
        $('rs-done-wrap').open = true;
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

    /* ---------- check against the school's staff list ---------- */

    function u16(d, o) { return d[o] | d[o + 1] << 8; }
    function u32(d, o) { return (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0; }

    /* An .xlsx is a zip of XML files. Read the first sheet's cells as rows of text, with the browser's own inflate: no library. */
    function inflateRaw(bytes) {
        var ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
        w.write(bytes); w.close();
        return new Response(ds.readable).arrayBuffer().then(function (b) { return new Uint8Array(b); });
    }
    function unzip(buf) {
        var d = new Uint8Array(buf), eocd = -1, i;
        for (i = d.length - 22; i >= Math.max(0, d.length - 65557); i--) if (u32(d, i) === 0x06054b50) { eocd = i; break; }
        if (eocd < 0) throw new Error('not_xlsx');
        var count = u16(d, eocd + 10), off = u32(d, eocd + 16), files = {}, dec = new TextDecoder();
        for (var k = 0; k < count; k++) {
            if (off + 46 > d.length || u32(d, off) !== 0x02014b50) throw new Error('not_xlsx');
            var nlen = u16(d, off + 28), elen = u16(d, off + 30), clen = u16(d, off + 32);
            files[dec.decode(d.subarray(off + 46, off + 46 + nlen))] = { method: u16(d, off + 10), csize: u32(d, off + 20), usize: u32(d, off + 24), lho: u32(d, off + 42) };
            off += 46 + nlen + elen + clen;
        }
        return { names: Object.keys(files), read: function (name) {
            var f = files[name];
            if (!f) return Promise.resolve(null);
            if (f.usize > 20 * 1024 * 1024) return Promise.reject(new Error('not_xlsx'));
            var start = f.lho + 30 + u16(d, f.lho + 26) + u16(d, f.lho + 28), raw = d.subarray(start, start + f.csize);
            if (f.method === 0) return Promise.resolve(raw);
            if (f.method === 8) return inflateRaw(raw);
            return Promise.reject(new Error('not_xlsx'));
        } };
    }
    function xmlOf(bytes) { return new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml'); }
    function tags(node, name) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', name)); }
    function fromXlsx(buf) {
        var z;
        try { z = unzip(buf); } catch (e) { return Promise.reject(e); }
        var sheets = z.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
            .sort(function (a, b) { return parseInt(a.replace(/\D+/g, ''), 10) - parseInt(b.replace(/\D+/g, ''), 10); });
        if (!sheets.length) return Promise.reject(new Error('not_xlsx'));
        return z.read('xl/sharedStrings.xml').then(function (ss) {
            var shared = ss ? tags(xmlOf(ss), 'si').map(function (si) { return tags(si, 't').map(function (t) { return t.textContent; }).join(''); }) : [];
            return z.read(sheets[0]).then(function (sheet) {
                var rows = [];
                tags(xmlOf(sheet), 'row').forEach(function (r) {
                    var cells = [];
                    tags(r, 'c').forEach(function (c) {
                        var m = /^([A-Z]+)/.exec(c.getAttribute('r') || ''), col = cells.length, t = c.getAttribute('t'), v = tags(c, 'v')[0], val = '';
                        if (m) { col = 0; for (var i = 0; i < m[1].length; i++) col = col * 26 + m[1].charCodeAt(i) - 64; col -= 1; }
                        if (t === 's') val = v ? (shared[parseInt(v.textContent, 10)] || '') : '';
                        else if (t === 'inlineStr') val = tags(c, 't').map(function (x) { return x.textContent; }).join('');
                        else if (v) val = v.textContent;
                        cells[col] = String(val).trim();
                    });
                    for (var i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
                    if (cells.some(function (x) { return x !== ''; })) rows.push(cells);
                });
                return rows;
            });
        });
    }

    function startCheck(parsed, label) {
        if (parsed.error) { note(parsed.error, 'bad'); return; }
        var rows = parsed.rows.map(function (r) { return { email: r.email, name: r.name, designation: r.designation || '', department: r.department || '' }; });
        if (rows.length > 3000) { note('The file has ' + rows.length + ' rows; the limit is 3,000.', 'bad'); return; }
        setBusy(true);
        note('Checking ' + label + '…', 'ok');
        call('admin_staff_check', { rows: rows }).then(function (r) {
            if (r && r.ok === false) throw new Error(r.error);
            check = { rows: rows, res: r, label: label, remove: {}, merge: {}, invite: r.mail && r.mail.ready };
            r.flagged.forEach(function (f) { if (f.suggest) check.merge[f.email] = f.suggest.email; else check.remove[f.email] = true; });
            note('', 'ok');
            renderCheck();
        }).catch(function (err) { check = null; $('rs-sc-result').classList.add('hidden'); note(say(err), 'bad'); })
          .then(function () { setBusy(false); });
    }

    $('rs-sc-file').addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 2 * 1024 * 1024) { note('That file is over 2 MB. A staff list should be much smaller: is it the right file?', 'bad'); return; }
        var rd = new FileReader();
        rd.onerror = function () { note('I could not read that file.', 'bad'); };
        if (/\.xlsx$/i.test(f.name)) {
            rd.onload = function () {
                if (typeof DecompressionStream === 'undefined') { note('This browser cannot open Excel files. Save the list as CSV, or paste the columns.', 'bad'); return; }
                fromXlsx(rd.result).then(function (rows) { startCheck(fromRows(rows), f.name); }, function (err) { note(say(err), 'bad'); });
            };
            rd.readAsArrayBuffer(f);
        } else {
            rd.onload = function () { startCheck(fromCsv(String(rd.result || '')), f.name); };
            rd.readAsText(f);
        }
    });
    $('rs-sc-paste-open').addEventListener('click', function () { $('rs-sc-paste').classList.toggle('hidden'); if (!$('rs-sc-paste').classList.contains('hidden')) $('rs-sc-text').focus(); });
    $('rs-sc-paste-go').addEventListener('click', function () {
        var text = $('rs-sc-text').value;
        if (!text.trim()) { note('Paste the columns first.', 'bad'); return; }
        /* A pasted list may have no header (an email, then a name, in either order): find the email in each line. */
        var rows = parseCsv(text), first = rows[0] || [];
        if (rows.length && !mapColumns(rows) && first.length) {
            rows = rows.map(function (r) { var at = -1; r.forEach(function (c, i) { if (at < 0 && /@/.test(c)) at = i; }); return [r[at] || '', r.filter(function (c, i) { return i !== at; }).join(' ')]; });
            rows.unshift(['Email', 'Name']);
        }
        startCheck(fromRows(rows), 'the pasted list');
    });

    function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
    function when(iso) { return iso ? String(iso).slice(0, 10) : 'never'; }
    function nameList(list) {
        return h('ul', { class: 'rs-list' }, list.slice(0, 300).map(function (p) { return h('li', { text: (p.name ? p.name + ' · ' : '') + p.email }); })
            .concat(list.length > 300 ? [h('li', { text: '…and ' + (list.length - 300) + ' more.' })] : []));
    }
    function block(title, kids) { return h('div', { class: 'rs-block' }, [h('h4', { text: title })].concat(kids)); }

    function renderCheck() {
        var box = $('rs-sc-result'), c = check, r = c.res;
        box.textContent = '';
        box.classList.remove('hidden');
        box.appendChild(h('p', { text: 'Checked ' + c.label + ': ' + plural(r.list_size, 'person', 'people') + ' on the list; ' + r.already + ' of them are on the Hub already.' }));

        /* who is invited */
        var added = r.add_count - r.invite.length;
        var inv = [h('p', {}, [h('span', { class: 'rs-big', text: String(r.invite.length) }), r.invite.length === 1 ? 'person is on the list but not on the Hub yet.' : 'people are on the list but not on the Hub yet.'])];
        if (r.invite.length) inv.push(h('details', {}, [h('summary', { text: 'Show who' }), nameList(r.invite)]));
        var cb = h('input', { type: 'checkbox', id: 'rs-sc-invite', onchange: function (e) { c.invite = e.target.checked; renderApply(); } });
        cb.checked = !!c.invite && !!r.invite.length; cb.disabled = !(r.mail && r.mail.ready) || !r.invite.length;
        if (r.invite.length) {
            inv.push(h('label', { class: 'rs-check' }, [cb, ' Send each of them the invitation email (from the Hub, with your address as the reply-to), asking them to sign in with their school Google account']));
            if (!(r.mail && r.mail.ready)) inv.push(h('p', { class: 'rs-dim', text: 'Emails cannot be sent right now (' + ((r.mail && r.mail.message) || 'the mail service is not ready') + '). They will still be added to the staff list.' }));
        }
        var more = [];
        if (added > 0) more.push(plural(added, 'person', 'people') + ' on the list ' + (added === 1 ? 'has' : 'have') + ' signed in or been listed but ' + (added === 1 ? 'is' : 'are') + ' not on the staff list: ' + (added === 1 ? 'they are' : 'they will be') + ' added to it');
        if (r.restore.length) more.push(plural(r.restore.length, 'person', 'people') + ' removed earlier ' + (r.restore.length === 1 ? 'is' : 'are') + ' on this list and will be brought back');
        if (more.length) inv.push(h('p', { class: 'rs-dim', text: more.join('. ') + '.' }));
        box.appendChild(block('To invite', inv));

        /* who is removed */
        var rm = [h('p', {}, [h('span', { class: 'rs-big', id: 'rs-sc-rm-n', text: '' }), h('span', { id: 'rs-sc-rm-t', text: '' })])];
        if (r.flagged.length) {
            rm.push(h('p', { class: 'rs-dim', text: 'These people are on the Hub but not on the school’s list. Untick anyone who still works here. Removing someone keeps everything they did, and if they sign in again they are back.' }));
            rm.push(h('p', { class: 'rs-dim', text: 'If someone is on the list under a different address (a longer name, another spelling), choose “Same person as” on their row. Their modules, answers and progress are then moved to, or combined with, that address instead of starting again. If both addresses have records, they are merged and nothing is lost.' }));
            rm.push(h('div', { class: 'rs-actions', style: 'margin-bottom:.5rem' }, [
                h('button', { type: 'button', class: 'rs-btn', text: 'Select all', onclick: function () { r.flagged.forEach(function (f) { if (!c.merge[f.email]) c.remove[f.email] = true; }); renderCheck(); } }),
                h('button', { type: 'button', class: 'rs-btn', text: 'Select none', onclick: function () { c.remove = {}; renderCheck(); } })]));
            var body = h('tbody', {});
            r.flagged.forEach(function (f) {
                var x = h('input', { type: 'checkbox', 'aria-label': 'Remove ' + (f.name || f.email), onchange: function (e) { if (e.target.checked) c.remove[f.email] = true; else delete c.remove[f.email]; renderApply(); } });
                x.checked = !!c.remove[f.email] && !c.merge[f.email];
                x.disabled = !!c.merge[f.email];
                var sel = h('select', { 'aria-label': 'Same person as', class: 'rs-in', onchange: function (e) {
                    var to = e.target.value;
                    Object.keys(c.merge).forEach(function (k) { if (to && c.merge[k] === to && k !== f.email) delete c.merge[k]; });
                    if (to) { c.merge[f.email] = to; delete c.remove[f.email]; } else { delete c.merge[f.email]; c.remove[f.email] = true; }
                    renderCheck();
                } });
                sel.appendChild(h('option', { value: '', text: '— a different person —' }));
                /* Everyone on the school's list: a suggestion is pre-chosen, and anyone can be picked by hand (type to jump). */
                (r.list_people || []).forEach(function (p) {
                    sel.appendChild(h('option', { value: p.email, text: (p.name ? p.name + ' · ' : '') + p.email + (p.on_hub ? ' (already on the Hub)' : ' (new)') }));
                });
                sel.value = c.merge[f.email] || '';
                sel.disabled = !(r.list_people || []).length;
                body.appendChild(h('tr', { class: c.merge[f.email] ? 'rs-sel' : '' }, [h('td', {}, [x]), h('td', { text: f.name || '—' }), h('td', { class: 'rs-mono', text: f.email }),
                    h('td', { text: f.signed_in ? 'last seen ' + when(f.last_seen) : 'never signed in' }), h('td', {}, [sel])]));
            });
            rm.push(h('div', { class: 'rs-wrap' }, [h('table', {}, [h('thead', {}, [h('tr', {}, [h('th', { style: 'width:2rem' }), h('th', { text: 'Name' }), h('th', { text: 'Email' }), h('th', { text: 'On the Hub' }), h('th', { text: 'Same person as' })])]), body])]));
        }
        box.appendChild(block('To remove', rm));

        /* kept, and skipped */
        if (r.keep_admins.length) box.appendChild(block('Admins not on the list (never removed here)', [h('p', { class: 'rs-dim', text: 'Take someone off the admins in the Admins section below if they have left.' }), nameList(r.keep_admins)]));
        if (r.keep_other.length) box.appendChild(block('On the staff list with a non-school address (left alone)', [h('p', { class: 'rs-dim', text: 'A list of school addresses says nothing about these, so check them by hand.' }), nameList(r.keep_other)]));
        if (r.skipped.length) {
            var ul = h('ul', { class: 'rs-list' });
            r.skipped.slice(0, 50).forEach(function (s) { ul.appendChild(h('li', { text: 'Row ' + s.line + (s.email ? ' (' + s.email + ')' : '') + ': ' + (SKIP[s.reason] || s.reason) })); });
            if (r.skipped.length > 50) ul.appendChild(h('li', { text: '…and ' + (r.skipped.length - 50) + ' more.' }));
            box.appendChild(block('Rows in the file that were not used', [ul]));
        }

        box.appendChild(h('div', { class: 'rs-actions', style: 'margin-top:.75rem' }, [
            h('button', { type: 'button', id: 'rs-sc-apply', class: 'rs-btn rs-primary', 'data-guard': '', onclick: applyCheck }),
            h('button', { type: 'button', class: 'rs-btn', text: 'Cancel', onclick: function () { check = null; box.classList.add('hidden'); box.textContent = ''; } })]));
        renderApply();
        box.scrollIntoView({ block: 'nearest' });
    }

    function chosen() { return Object.keys(check.remove).filter(function (e) { return !check.merge[e]; }); }
    function merges() { return Object.keys(check.merge).map(function (f) { return { from: f, to: check.merge[f] }; }); }
    function renderApply() {
        var r = check.res, nr = chosen().length, ni = check.invite && r.invite.length ? r.invite.length : 0;
        var rn = $('rs-sc-rm-n'), rt = $('rs-sc-rm-t'), btn = $('rs-sc-apply');
        if (rn) { rn.textContent = String(nr); rt.textContent = nr === 1 ? 'person will be removed from the staff list.' : 'people will be removed from the staff list.'; }
        var nm = merges().length, parts = [];
        if (ni) parts.push('invite ' + ni);
        if (nm) parts.push('merge ' + nm + (nm === 1 ? ' person’s' : ' people’s') + ' records');
        if (nr) parts.push('remove ' + nr);
        if (r.add_count && !parts.length) parts.push('add ' + r.add_count + ' to the staff list');
        btn.textContent = parts.length ? 'Apply: ' + (parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0]) : 'Apply';
        btn.disabled = busy || !(r.add_count || r.restore.length || nr || nm);
    }

    function applyCheck() {
        var r = check.res, remove = chosen(), invite = !!check.invite && r.invite.length > 0;
        var lines = [];
        if (invite) lines.push('• Email an invitation to ' + plural(r.invite.length, 'person', 'people') + '.');
        if (r.add_count) lines.push('• Put ' + plural(r.add_count, 'person', 'people') + ' on the staff list.');
        if (r.restore.length) lines.push('• Bring back ' + plural(r.restore.length, 'person', 'people') + ' who were removed.');
        if (merges().length) lines.push('• Merge the records of ' + plural(merges().length, 'person', 'people') + ' into the address HR lists for them: their modules, progress and answers move or are combined, and they sign in with that address. Nothing is deleted.');
        if (remove.length) lines.push('• Remove ' + plural(remove.length, 'person', 'people') + ' from the staff list and sign them out. Their records are kept, and they are back if they sign in again.');
        if (!window.confirm('Apply this?\n\n' + lines.join('\n') + (invite ? '\n\nEmails cannot be taken back once they are sent.' : ''))) return;
        setBusy(true);
        call('admin_staff_sync', { rows: check.rows, invite: invite, remove: remove, merge: merges() }).then(function (x) {
            if (x && x.ok === false) throw new Error(x.error);
            var bits = [];
            if (x.invited) bits.push(plural(x.invited, 'invitation', 'invitations') + ' on the way');
            if (x.added) bits.push(plural(x.added, 'person', 'people') + ' added to the staff list');
            if (x.merged) bits.push(plural(x.merged, 'person’s records', 'people’s records') + ' merged into the right address');
            if (x.restored) bits.push(x.restored + ' brought back');
            if (x.removed) bits.push(x.removed + ' removed');
            check = null; $('rs-sc-result').classList.add('hidden'); $('rs-sc-result').textContent = '';
            note('Done: ' + (bits.join(', ') || 'nothing needed changing') + '.', 'ok');
            return load();
        }).catch(function (err) { note(say(err), 'bad'); })
          .then(function () { setBusy(false); });
    }

    /* ---------- removed from the staff list ---------- */

    function renderRemoved() {
        var sec = $('rs-rm-h').closest('section'), body = $('rs-rm-rows');
        body.textContent = '';
        sec.classList.toggle('hidden', removed === null);
        if (removed === null) return;
        $('rs-rm-count').textContent = removed.length ? '(' + removed.length + ')' : '';
        var n = $('pp-removed-n');
        if (n) { n.textContent = removed.length; n.classList.toggle('hidden', !removed.length); }
        $('rs-rm-empty').classList.toggle('hidden', removed.length > 0);
        removed.forEach(function (p) {
            body.appendChild(h('tr', {}, [h('td', {}, [person(p)]),
                h('td', { 'data-label': 'Removed', text: when(p.removed_at) + (p.removed_by ? ' by ' + p.removed_by : '') }),
                h('td', { class: 'rs-actions' }, [h('button', { type: 'button', class: 'rs-btn', 'data-guard': '', text: 'Restore', onclick: function () {
                    act(call('admin_staff_restore', { email: p.email }), 'Restored ' + (p.name || p.email) + ' to the staff list.');
                } })])]));
        });
    }

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
