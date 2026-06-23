/*
 * AISA Learning Hub — Staff Performance Review renderer.
 *
 * Data-driven: each form page (Teacher Assistant, Admin Support Staff,
 * Hallway / Bus Monitor) declares its sections and criteria as a config
 * object and calls renderPerformanceReview(config). This file builds the
 * fillable form, wires the Print / Save-as-PDF button, and keeps a local
 * draft in localStorage so a half-finished report survives a refresh.
 *
 * No network calls. Submission is print-to-PDF, matching the rest of the
 * Hub's forms. Drafts never leave the browser.
 */
(function () {
    'use strict';

    var RATINGS = ['Outstanding', 'Very Good', 'Good', 'Satisfactory', 'Unsatisfactory', 'N/A'];

    // Tiny DOM helper: el('div', {class:'x'}, child, child, ...)
    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                if (k === 'text') { node.textContent = attrs[k]; }
                else if (k === 'html') { node.innerHTML = attrs[k]; }
                else if (k === 'for') { node.htmlFor = attrs[k]; }
                else { node.setAttribute(k, attrs[k]); }
            });
        }
        (children || []).forEach(function (c) {
            if (c == null) { return; }
            node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return node;
    }

    // Stable, filesystem-ish slug for field names so drafts restore reliably.
    function slug(s) {
        return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    }

    function buildHeader(cfg) {
        var kids = [];
        if (cfg.logo !== false) {
            kids.push(el('img', { src: cfg.logo || '../AISA_logo.png', alt: 'AISA logo' }));
        }
        kids.push(el('p', { class: 'pr-school', text: cfg.schoolName || 'American International School in Abu Dhabi' }));
        kids.push(el('h1', { class: 'pr-title', text: cfg.title }));
        if (cfg.subtitle) { kids.push(el('p', { class: 'pr-subtitle', text: cfg.subtitle })); }
        return el('header', { class: 'pr-masthead' }, kids);
    }

    function buildHeaderFields(cfg) {
        var fields = (cfg.headerFields || []).map(function (f, i) {
            var id = 'hf-' + i + '-' + slug(f.label);
            return el('div', { class: 'pr-field' }, [
                el('label', { for: id, text: f.label }),
                el('input', { type: 'text', id: id, name: id, autocomplete: 'off' })
            ]);
        });
        return el('div', { class: 'pr-header-grid' }, fields);
    }

    function buildRatingTable(section, sIndex) {
        // Header row
        var headCells = [el('th', { class: 'pr-crit-col', html: '&nbsp;' })];
        RATINGS.forEach(function (r) { headCells.push(el('th', { text: r })); });
        var thead = el('thead', null, [el('tr', null, headCells)]);

        // Criterion rows
        var body = section.criteria.map(function (crit, cIndex) {
            var groupName = 'rate-' + sIndex + '-' + cIndex + '-' + slug(section.name);
            var cells = [el('td', { class: 'pr-crit', text: crit })];
            RATINGS.forEach(function (r, rIndex) {
                var radio = el('input', {
                    type: 'radio',
                    name: groupName,
                    value: r,
                    'aria-label': crit + ' — ' + r
                });
                cells.push(el('td', { class: 'pr-rate' }, [el('label', null, [radio])]));
            });
            return el('tr', null, cells);
        });

        var table = el('table', { class: 'pr-table' }, [thead, el('tbody', null, body)]);
        return el('div', { class: 'pr-table-wrap' }, [table]);
    }

    function buildSection(section, sIndex) {
        var commentName = 'comment-' + sIndex + '-' + slug(section.name);
        return el('section', { class: 'pr-section' }, [
            el('div', { class: 'pr-section-band', text: section.name }),
            buildRatingTable(section, sIndex),
            el('div', { class: 'pr-comment' }, [
                el('label', { for: commentName, text: 'General Comments' }),
                el('textarea', { class: 'pr-text', id: commentName, name: commentName })
            ])
        ]);
    }

    function buildReflection(cfg) {
        var r = cfg.reflection;
        if (!r) { return null; }
        var kids = [el('label', { for: 'reflection', text: r.label })];
        if (r.helper) { kids.push(el('p', { class: 'pr-helper', text: r.helper })); }
        kids.push(el('textarea', { class: 'pr-text', id: 'reflection', name: 'reflection' }));
        return el('div', { class: 'pr-block pr-block-reflection' }, kids);
    }

    function buildGrowth(cfg) {
        var note = cfg.growthNote ||
            'Professional Growth — please identify 3–5 goals you will work on to grow and ' +
            'further develop as an AISA employee in your role. Goals will be discussed with the ' +
            'School Director and reviewed again at your next annual appraisal.';
        return el('div', { class: 'pr-block pr-block-growth' }, [
            el('label', { for: 'growth', text: 'Professional Growth Goals' }),
            el('p', { class: 'pr-helper', text: note }),
            el('textarea', { class: 'pr-text', id: 'growth', name: 'growth' })
        ]);
    }

    function buildSignatures() {
        function sign(role) {
            return el('div', { class: 'pr-sign' }, [
                document.createTextNode(role),
                el('div', { class: 'pr-date', text: 'Date: ____________________' })
            ]);
        }
        return el('div', null, [
            el('div', { class: 'pr-signatures' }, [
                sign('Employee’s Signature'),
                sign('Evaluator’s Signature')
            ]),
            el('div', { class: 'pr-signatures' }, [
                sign('Administrator’s Signature'),
                el('div')
            ])
        ]);
    }

    // ---- Draft auto-save (localStorage, client-only) -------------------
    /* Serialize every input + textarea under `root` into a flat map.
     * Reused by the localStorage draft AND the server-sync workflow. */
    function collectFormData(root) {
        var data = {};
        root.querySelectorAll('input, textarea').forEach(function (node) {
            if (node.type === 'radio') {
                if (node.checked) { data[node.name] = node.value; }
            } else {
                data[node.name] = node.value;
            }
        });
        return data;
    }

    /* Apply a flat map back onto the form. Missing fields are left alone
     * (we don't blank fields that aren't in the saved data). */
    function hydrateFormData(root, data) {
        if (!data) return;
        root.querySelectorAll('input, textarea').forEach(function (node) {
            if (!(node.name in data)) { return; }
            if (node.type === 'radio') { node.checked = (node.value === data[node.name]); }
            else { node.value = data[node.name]; }
        });
    }

    function wireDraft(root, storageKey, savedEl) {
        var saveTimer = null;

        function restore() {
            var raw;
            try { raw = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
            catch (e) { raw = {}; }
            hydrateFormData(root, raw);
        }

        function flashSaved() {
            if (!savedEl) { return; }
            savedEl.textContent = 'Draft saved';
            savedEl.classList.add('is-shown');
            clearTimeout(flashSaved._t);
            flashSaved._t = setTimeout(function () {
                savedEl.classList.remove('is-shown');
            }, 1600);
        }

        function save() {
            try {
                localStorage.setItem(storageKey, JSON.stringify(collectFormData(root)));
                flashSaved();
            } catch (e) { /* storage full / disabled — fail quietly */ }
        }

        restore();
        root.addEventListener('input', function () {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(save, 500);
        });
        root.addEventListener('change', function () {
            clearTimeout(saveTimer);
            save();
        });

        return {
            clear: function () {
                try { localStorage.removeItem(storageKey); } catch (e) { /* noop */ }
            }
        };
    }

    function buildToolbar(onPrint, onClear) {
        var saved = el('span', { class: 'pr-saved', 'aria-live': 'polite' });
        var clearBtn = el('button', { type: 'button', class: 'pr-btn', text: 'Clear form' });
        var printBtn = el('button', { type: 'button', class: 'pr-btn pr-btn-primary', text: 'Print / Save as PDF' });
        clearBtn.addEventListener('click', onClear);
        printBtn.addEventListener('click', onPrint);
        return {
            node: el('div', { class: 'pr-toolbar' }, [saved, clearBtn, printBtn]),
            saved: saved
        };
    }

    /* Status banner shown at the top of the sheet when a submission_id
     * is in the URL (or set after submit). Stays out of the way for
     * standalone form use. */
    function buildStatusBanner() {
        var node = el('div', { class: 'pr-status hidden', role: 'status' });
        node.style.cssText = [
            'margin:0 0 14px;padding:10px 14px;border-radius:8px;',
            'border:1px solid #cbd5e1;background:#f8fafc;color:#0f172a;',
            'font-size:13px;line-height:1.4;display:flex;align-items:center;gap:10px;'
        ].join('');
        return node;
    }
    function setStatus(banner, kind, html) {
        if (!banner) return;
        var palette = {
            pending: { bg: '#fef3c7', border: '#fcd34d', ink: '#78350f' },  // waiting on someone
            complete:{ bg: '#dcfce7', border: '#86efac', ink: '#14532d' },  // done
            info:    { bg: '#dbeafe', border: '#93c5fd', ink: '#1e3a8a' }
        }[kind] || { bg: '#f8fafc', border: '#cbd5e1', ink: '#0f172a' };
        banner.style.background  = palette.bg;
        banner.style.borderColor = palette.border;
        banner.style.color       = palette.ink;
        banner.innerHTML = html;
        banner.classList.remove('hidden');
        banner.style.display = 'flex';
    }

    /* "Send to line manager" footer.
     *
     * Mode = 'staff'   → dropdown + Send. Visible on standalone form pages
     *                    and on a fresh load where no submission_id is
     *                    in the URL.
     * Mode = 'manager' → "Send back to staff" button. Shown when the
     *                    signed-in user IS the manager on an existing
     *                    pending submission.
     * Mode = 'complete'→ Hidden — nothing left to send. */
    function buildSendFooter() {
        var node = el('section', { class: 'pr-send no-print' });
        node.style.cssText = [
            'margin-top:24px;padding:18px 20px;border-radius:12px;',
            'background:#ffffff;border:1px solid #e2e8f0;'
        ].join('');
        return node;
    }
    function renderSendFooter_staff(node, opts) {
        node.innerHTML = '';
        node.style.display = '';
        var heading = el('p');
        heading.style.cssText = 'font-weight:700;font-size:14px;margin:0 0 8px;color:#0f172a;';
        heading.textContent = 'Send to your line manager';
        var hint = el('p');
        hint.style.cssText = 'font-size:12.5px;color:#475569;margin:0 0 12px;line-height:1.4;';
        hint.textContent = 'They\'ll get a notification with a link to open this form pre-filled with your answers, add their evaluation, then send it back to you.';

        var row = el('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:center;';

        var select = document.createElement('select');
        select.style.cssText = [
            'flex:1 1 240px;min-width:220px;font:inherit;font-size:14px;',
            'padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;'
        ].join('');
        var placeholder = document.createElement('option');
        placeholder.value = ''; placeholder.textContent = 'Loading line managers…';
        placeholder.disabled = true; placeholder.selected = true;
        select.appendChild(placeholder);

        var btn = el('button', { type: 'button' });
        btn.textContent = 'Send to line manager';
        btn.disabled = true;
        btn.style.cssText = [
            'font:inherit;font-weight:700;font-size:14px;cursor:pointer;',
            'background:#0f172a;color:#fff;border:none;border-radius:8px;padding:9px 18px;',
            'transition:background .15s,opacity .15s;'
        ].join('');
        btn.addEventListener('mouseenter', function () { if (!btn.disabled) btn.style.background = '#334155'; });
        btn.addEventListener('mouseleave', function () { btn.style.background = '#0f172a'; });

        var status = el('span');
        status.style.cssText = 'font-size:12px;color:#475569;margin-left:auto;';

        row.appendChild(select);
        row.appendChild(btn);
        node.appendChild(heading);
        node.appendChild(hint);
        node.appendChild(row);
        node.appendChild(status);

        function setBusy(yes, msg) {
            btn.disabled = yes || !select.value;
            btn.style.opacity = btn.disabled ? '0.55' : '1';
            status.textContent = msg || '';
        }

        /* Populate the dropdown. */
        if (window.aisaAuth && window.aisaAuth.getLineManagers) {
            window.aisaAuth.getLineManagers().then(function (r) {
                placeholder.textContent = 'Choose a line manager…';
                var managers = (r && r.managers) || [];
                if (!managers.length) {
                    placeholder.textContent = 'No line managers in the directory yet — ask an admin to add one.';
                    return;
                }
                managers.forEach(function (m) {
                    var opt = document.createElement('option');
                    opt.value = m.email;
                    opt.textContent = (m.division ? '[' + m.division + '] ' : '') +
                                      (m.name || m.email) + ' · ' + m.email;
                    opt.setAttribute('data-name', m.name || '');
                    select.appendChild(opt);
                });
            }).catch(function () {
                placeholder.textContent = 'Couldn\'t load line managers. Try refreshing.';
            });
        } else {
            placeholder.textContent = 'Sign-in required to send.';
        }

        select.addEventListener('change', function () { setBusy(false, ''); });

        btn.addEventListener('click', function () {
            var email = select.value;
            if (!email) return;
            var name = select.options[select.selectedIndex].getAttribute('data-name') || '';
            setBusy(true, 'Sending…');
            window.aisaAuth.submitForm({
                form_id:       opts.formId,
                form_url:      location.pathname,
                form_title:    opts.title,
                manager_email: email,
                manager_name:  name,
                data:          opts.collect()
            }).then(function (r) {
                if (r && r.ok) {
                    opts.onSent(r.submission_id, email, name);
                } else {
                    setBusy(false, 'Couldn\'t send: ' + ((r && r.error) || 'unknown'));
                }
            }).catch(function (err) {
                setBusy(false, 'Send failed — ' + ((err && err.message) || 'network error'));
            });
        });
    }
    function renderSendFooter_manager(node, opts) {
        node.innerHTML = '';
        node.style.display = '';
        var heading = el('p');
        heading.style.cssText = 'font-weight:700;font-size:14px;margin:0 0 8px;color:#0f172a;';
        heading.textContent = 'Send back to ' + (opts.staffName || opts.staffEmail);
        var hint = el('p');
        hint.style.cssText = 'font-size:12.5px;color:#475569;margin:0 0 12px;line-height:1.4;';
        hint.textContent = 'When you\'re done, this sends a notification to ' +
            (opts.staffName || opts.staffEmail) + ' so they can review your evaluation and download the final PDF.';

        var btn = el('button', { type: 'button' });
        btn.textContent = 'Send back to staff';
        btn.style.cssText = [
            'font:inherit;font-weight:700;font-size:14px;cursor:pointer;',
            'background:#0f766e;color:#fff;border:none;border-radius:8px;padding:10px 22px;',
            'transition:background .15s;'
        ].join('');
        btn.addEventListener('mouseenter', function () { if (!btn.disabled) btn.style.background = '#115e59'; });
        btn.addEventListener('mouseleave', function () { btn.style.background = '#0f766e'; });

        var status = el('span');
        status.style.cssText = 'font-size:12px;color:#475569;margin-left:14px;';

        node.appendChild(heading);
        node.appendChild(hint);
        node.appendChild(btn);
        node.appendChild(status);

        btn.addEventListener('click', function () {
            btn.disabled = true;
            btn.style.opacity = '0.55';
            status.textContent = 'Sending…';
            window.aisaAuth.completeForm({
                submission_id: opts.submissionId,
                data:          opts.collect()
            }).then(function (r) {
                if (r && r.ok) {
                    opts.onComplete();
                } else {
                    btn.disabled = false; btn.style.opacity = '1';
                    status.textContent = 'Couldn\'t send: ' + ((r && r.error) || 'unknown');
                }
            }).catch(function (err) {
                btn.disabled = false; btn.style.opacity = '1';
                status.textContent = 'Send failed — ' + ((err && err.message) || 'network error');
            });
        });
    }

    /* Append a "Workflow" rich-text helper if Tailwind isn't around. */
    function ensureBaseHelpers() {
        if (document.getElementById('pr-workflow-style')) return;
        var s = document.createElement('style');
        s.id = 'pr-workflow-style';
        s.textContent = [
            '.pr-status a{color:inherit;text-decoration:underline;}',
            '.pr-status.hidden{display:none !important;}',
            '@media print{.pr-status,.pr-send{display:none !important;}}'
        ].join('');
        document.head.appendChild(s);
    }

    /* Pull `?submission=ID` out of the URL. */
    function readSubmissionId() {
        try {
            var u = new URLSearchParams(window.location.search);
            return (u.get('submission') || '').trim();
        } catch (e) { return ''; }
    }

    window.renderPerformanceReview = function (cfg) {
        var mount = document.getElementById(cfg.mount || 'form-root');
        if (!mount) { return; }

        var storageKey = 'aisa_perf_review_' + (cfg.formId || slug(cfg.title));

        ensureBaseHelpers();

        var sheet = el('div', { class: 'pr-sheet' });
        var statusBanner = buildStatusBanner();
        sheet.appendChild(statusBanner);
        sheet.appendChild(buildHeader(cfg));
        sheet.appendChild(buildHeaderFields(cfg));
        (cfg.sections || []).forEach(function (section, i) {
            sheet.appendChild(buildSection(section, i));
        });
        var reflection = buildReflection(cfg);
        if (reflection) { sheet.appendChild(reflection); }
        sheet.appendChild(buildGrowth(cfg));
        sheet.appendChild(buildSignatures());
        sheet.appendChild(el('div', { class: 'pr-footnote', text: 'Cc: Personnel File' }));

        var sendFooter = buildSendFooter();
        sendFooter.style.display = 'none';
        sheet.appendChild(sendFooter);

        var draft;
        var toolbar = buildToolbar(
            function () { window.print(); },
            function () {
                if (!window.confirm('Clear all entries on this form? This cannot be undone.')) { return; }
                sheet.querySelectorAll('input, textarea').forEach(function (node) {
                    if (node.type === 'radio') { node.checked = false; }
                    else { node.value = ''; }
                });
                if (draft) { draft.clear(); }
            }
        );

        mount.appendChild(toolbar.node);
        mount.appendChild(sheet);

        draft = wireDraft(sheet, storageKey, toolbar.saved);

        if (cfg.title) { document.title = 'AISA | ' + cfg.title; }

        /* ---- Round-trip workflow wiring ----
         *
         * Three states the page can be in:
         *
         *   A) Standalone (no ?submission, no recently-sent state) —
         *      show the staff "Send to line manager" footer so anyone
         *      filling the form locally can hand it off.
         *
         *   B) ?submission=ID present — fetch the saved submission,
         *      pre-fill the form, and show the right footer for whoever
         *      is signed in (staff sees a "waiting on manager" banner;
         *      manager sees the "Send back to staff" footer; complete
         *      shows a green banner with no footer).
         *
         *   C) Just submitted from this tab — switch to the pending
         *      banner and hide the send footer. */

        var submissionId = readSubmissionId();

        function showStaffFooterStandalone() {
            renderSendFooter_staff(sendFooter, {
                formId:  cfg.formId || slug(cfg.title),
                title:   cfg.title,
                collect: function () { return collectFormData(sheet); },
                onSent:  function (sid, email, name) {
                    /* Update the URL so a refresh keeps the same submission view. */
                    try {
                        var u = new URL(location.href);
                        u.searchParams.set('submission', sid);
                        history.replaceState({}, '', u.toString());
                    } catch (e) { /* ignore */ }
                    sendFooter.style.display = 'none';
                    setStatus(statusBanner, 'pending',
                        '<span>📨</span><span>Sent to <strong>' +
                        (name || email) + '</strong>. They\'ll get a notification and can fill in their evaluation. ' +
                        'This page will show their answers once they send it back.</span>');
                }
            });
        }

        if (!submissionId) {
            /* State A — standalone. */
            showStaffFooterStandalone();
        } else if (window.aisaAuth && window.aisaAuth.getFormSubmission) {
            /* State B — load existing submission. */
            setStatus(statusBanner, 'info', '<span>⏳</span><span>Loading submission…</span>');
            sendFooter.style.display = 'none';
            window.aisaAuth.getFormSubmission(submissionId).then(function (r) {
                if (!r || !r.ok) {
                    setStatus(statusBanner, 'info',
                        '<span>⚠️</span><span>Couldn\'t load this submission (' +
                        ((r && r.error) || 'unknown') + '). You can still fill the form fresh and send it.</span>');
                    showStaffFooterStandalone();
                    return;
                }
                var sub = r.submission;
                hydrateFormData(sheet, sub.data || {});
                var meEmail = '';
                try {
                    var u = window.aisaAuth.getUser && window.aisaAuth.getUser();
                    if (u && u.email) meEmail = String(u.email).toLowerCase();
                } catch (e) { /* ignore */ }
                var iAmManager = (meEmail && meEmail === String(sub.manager_email || '').toLowerCase());
                var iAmStaff   = (meEmail && meEmail === String(sub.staff_email   || '').toLowerCase());

                if (sub.status === 'complete') {
                    setStatus(statusBanner, 'complete',
                        '<span>✅</span><span>Completed — manager <strong>' +
                        (sub.manager_name || sub.manager_email) +
                        '</strong> sent this back to <strong>' +
                        (sub.staff_name || sub.staff_email) +
                        '</strong>. Use Print / Save as PDF to keep a copy.</span>');
                } else if (iAmManager) {
                    setStatus(statusBanner, 'pending',
                        '<span>📝</span><span>You\'re evaluating <strong>' +
                        (sub.staff_name || sub.staff_email) +
                        '</strong>. Their answers are pre-filled — add your evaluation, then send it back at the bottom.</span>');
                    renderSendFooter_manager(sendFooter, {
                        submissionId: submissionId,
                        staffEmail:   sub.staff_email,
                        staffName:    sub.staff_name,
                        collect:      function () { return collectFormData(sheet); },
                        onComplete:   function () {
                            sendFooter.style.display = 'none';
                            setStatus(statusBanner, 'complete',
                                '<span>✅</span><span>Sent back to <strong>' +
                                (sub.staff_name || sub.staff_email) +
                                '</strong>. They\'ll get a notification with this link.</span>');
                        }
                    });
                } else if (iAmStaff) {
                    setStatus(statusBanner, 'pending',
                        '<span>⏳</span><span>Waiting on <strong>' +
                        (sub.manager_name || sub.manager_email) +
                        '</strong> to complete their evaluation. You\'ll get a notification when they send it back.</span>');
                } else {
                    /* Shouldn't happen — backend would have returned not_authorized. */
                    setStatus(statusBanner, 'info',
                        '<span>🔒</span><span>You don\'t have access to this submission.</span>');
                }
            }).catch(function () {
                setStatus(statusBanner, 'info',
                    '<span>⚠️</span><span>Couldn\'t reach the server. Showing a blank form — you can fill it and send it fresh.</span>');
                showStaffFooterStandalone();
            });
        } else {
            /* Auth not configured (e.g. preview page) — degrade. */
            showStaffFooterStandalone();
        }
    };
})();
