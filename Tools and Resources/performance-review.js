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

    /* Every form-building helper now takes an optional `prefix` so we can
     * render the same form twice with disjoint field names — staff-side
     * uses 's__', manager-side uses 'm__'. In single mode the prefix is
     * empty and the names match the legacy shape so older drafts and
     * older submissions still hydrate correctly. */
    function pfx(prefix, name) { return (prefix || '') + name; }

    function buildHeaderFields(cfg, prefix) {
        var fields = (cfg.headerFields || []).map(function (f, i) {
            var id = pfx(prefix, 'hf-' + i + '-' + slug(f.label));
            return el('div', { class: 'pr-field' }, [
                el('label', { for: id, text: f.label }),
                el('input', { type: 'text', id: id, name: id, autocomplete: 'off' })
            ]);
        });
        return el('div', { class: 'pr-header-grid' }, fields);
    }

    function buildRatingTable(section, sIndex, prefix) {
        // Header row
        var headCells = [el('th', { class: 'pr-crit-col', html: '&nbsp;' })];
        RATINGS.forEach(function (r) { headCells.push(el('th', { text: r })); });
        var thead = el('thead', null, [el('tr', null, headCells)]);

        // Criterion rows
        var body = section.criteria.map(function (crit, cIndex) {
            var groupName = pfx(prefix, 'rate-' + sIndex + '-' + cIndex + '-' + slug(section.name));
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

    function buildSection(section, sIndex, prefix) {
        var commentName = pfx(prefix, 'comment-' + sIndex + '-' + slug(section.name));
        return el('section', { class: 'pr-section' }, [
            el('div', { class: 'pr-section-band', text: section.name }),
            buildRatingTable(section, sIndex, prefix),
            el('div', { class: 'pr-comment' }, [
                el('label', { for: commentName, text: 'General Comments' }),
                el('textarea', { class: 'pr-text', id: commentName, name: commentName })
            ])
        ]);
    }

    function buildReflection(cfg, prefix) {
        var r = cfg.reflection;
        if (!r) { return null; }
        var id = pfx(prefix, 'reflection');
        var kids = [el('label', { for: id, text: r.label })];
        if (r.helper) { kids.push(el('p', { class: 'pr-helper', text: r.helper })); }
        kids.push(el('textarea', { class: 'pr-text', id: id, name: id }));
        return el('div', { class: 'pr-block pr-block-reflection' }, kids);
    }

    function buildGrowth(cfg, prefix) {
        var id = pfx(prefix, 'growth');
        var note = cfg.growthNote ||
            'Professional Growth — please identify 3–5 goals you will work on to grow and ' +
            'further develop as an AISA employee in your role. Goals will be discussed with the ' +
            'School Director and reviewed again at your next annual appraisal.';
        return el('div', { class: 'pr-block pr-block-growth' }, [
            el('label', { for: id, text: 'Professional Growth Goals' }),
            el('p', { class: 'pr-helper', text: note }),
            el('textarea', { class: 'pr-text', id: id, name: id })
        ]);
    }

    /* Compose a complete "sheet" (one half of the dual workflow, or the
     * whole thing in single mode). `prefix` namespaces all field names
     * so the two sides never collide. `opts.label` adds a column header
     * ("Self-Reflection" / "Manager's Evaluation") above the masthead;
     * `opts.readOnly` disables all inputs and applies the .pr-readonly
     * styling. */
    function buildFormSheet(cfg, prefix, opts) {
        opts = opts || {};
        var sheet = el('div', { class: 'pr-sheet' + (opts.readOnly ? ' pr-readonly' : '') });
        if (opts.label) {
            sheet.appendChild(el('div', {
                class: 'pr-sheet-label' + (opts.labelKind === 'manager' ? ' is-manager' : ''),
                text: opts.label
            }));
        }
        sheet.appendChild(buildHeader(cfg));
        sheet.appendChild(buildHeaderFields(cfg, prefix));
        (cfg.sections || []).forEach(function (section, i) {
            sheet.appendChild(buildSection(section, i, prefix));
        });
        var reflection = buildReflection(cfg, prefix);
        if (reflection) { sheet.appendChild(reflection); }
        sheet.appendChild(buildGrowth(cfg, prefix));
        sheet.appendChild(buildSignatures());
        sheet.appendChild(el('div', { class: 'pr-footnote', text: 'Cc: Personnel File' }));
        if (opts.readOnly) { applyReadOnly(sheet); }
        return sheet;
    }

    /* Lock down a sheet so it shows values but can't be edited. */
    function applyReadOnly(root) {
        root.querySelectorAll('input, textarea').forEach(function (node) {
            node.readOnly = true;
            if (node.type === 'radio') { node.disabled = true; }
            node.setAttribute('tabindex', '-1');
            node.setAttribute('aria-disabled', 'true');
        });
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
     *
     * If a `prefix` is given, only fields starting with that prefix are
     * collected, and the prefix is stripped from the keys in the returned
     * map. This lets the renderer build two namespaced forms (s__... and
     * m__...) but store them as clean unprefixed blobs under
     * data.staff / data.manager. */
    function collectFormData(root, prefix) {
        var data = {};
        var p = prefix || '';
        var pl = p.length;
        root.querySelectorAll('input, textarea').forEach(function (node) {
            if (p && node.name.indexOf(p) !== 0) return;
            var key = p ? node.name.slice(pl) : node.name;
            if (node.type === 'radio') {
                if (node.checked) { data[key] = node.value; }
            } else {
                data[key] = node.value;
            }
        });
        return data;
    }

    /* Apply a flat map back onto the form. Missing fields are left alone
     * (we don't blank fields that aren't in the saved data). `prefix`
     * mirrors collectFormData — pass it when hydrating one half of a
     * dual-form render. */
    function hydrateFormData(root, data, prefix) {
        if (!data) return;
        var p = prefix || '';
        root.querySelectorAll('input, textarea').forEach(function (node) {
            var key = p ? (node.name.indexOf(p) === 0 ? node.name.slice(p.length) : null) : node.name;
            if (key == null || !(key in data)) { return; }
            if (node.type === 'radio') { node.checked = (node.value === data[key]); }
            else { node.value = data[key]; }
        });
    }

    /* Normalise any saved blob into the {staff, manager} shape. Older
     * submissions written before the dual-canvas refactor stored a flat
     * map; we treat those as the staff side so they show up where the
     * staff member would expect them. */
    function normaliseData(raw) {
        var d = raw || {};
        if (d.staff || d.manager) return { staff: d.staff || {}, manager: d.manager || {} };
        /* Empty object or a legacy flat map. */
        return { staff: d, manager: {} };
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

        if (cfg.title) { document.title = 'AISA | ' + cfg.title; }

        var statusBanner = buildStatusBanner();
        var sendFooter = buildSendFooter();
        sendFooter.style.display = 'none';

        /* Container that holds whatever the current mode renders. We
         * reuse it across renders so the toolbar + status banner + send
         * footer stay put even when the form below them changes shape
         * (e.g. single → dual after a submission loads). */
        var formHost = el('div', { class: 'pr-host' });

        var draft = null;
        var toolbar = buildToolbar(
            function () { window.print(); },
            function () {
                if (!window.confirm('Clear all entries on this form? This cannot be undone.')) { return; }
                /* Clear only the editable side — never the read-only side. */
                formHost.querySelectorAll('.pr-sheet:not(.pr-readonly)').forEach(function (s) {
                    s.querySelectorAll('input, textarea').forEach(function (node) {
                        if (node.type === 'radio') { node.checked = false; }
                        else { node.value = ''; }
                    });
                });
                if (draft) { draft.clear(); }
            }
        );

        mount.appendChild(toolbar.node);
        mount.appendChild(statusBanner);
        mount.appendChild(formHost);
        mount.appendChild(sendFooter);

        /* ---- Mode renderers ----
         *
         * Each renderer wipes the form host, builds the appropriate
         * sheet(s), and returns a `collect` function that gathers the
         * editable side's data in the {staff,manager} shape we ship to
         * the backend. */

        function renderSingle(initialData) {
            formHost.innerHTML = '';
            var sheet = buildFormSheet(cfg, '', { readOnly: false });
            formHost.appendChild(sheet);
            hydrateFormData(sheet, (initialData && initialData.staff) || initialData || {}, '');
            draft = wireDraft(sheet, storageKey, toolbar.saved);
            return function collectAll() {
                return { staff: collectFormData(sheet, ''), manager: {} };
            };
        }

        function renderDual(opts) {
            /* opts:
             *   data:         the loaded submission's normalised data
             *   editableSide: 'manager' | null  — null means everything is read-only
             *   labels:       { staff, manager } — column titles
             */
            formHost.innerHTML = '';
            var dual = el('div', { class: 'pr-dual' });
            var leftReadOnly  = (opts.editableSide !== 'staff');
            var rightReadOnly = (opts.editableSide !== 'manager');
            var leftSheet  = buildFormSheet(cfg, 's__', {
                readOnly:  leftReadOnly,
                label:     opts.labels.staff,
                labelKind: 'staff'
            });
            var rightSheet = buildFormSheet(cfg, 'm__', {
                readOnly:  rightReadOnly,
                label:     opts.labels.manager,
                labelKind: 'manager'
            });
            dual.appendChild(leftSheet);
            dual.appendChild(rightSheet);
            formHost.appendChild(dual);

            hydrateFormData(leftSheet,  opts.data.staff   || {}, 's__');
            hydrateFormData(rightSheet, opts.data.manager || {}, 'm__');

            /* localStorage drafts only on the editable side. */
            draft = null;
            if (!rightReadOnly) {
                draft = wireDraft(rightSheet, storageKey + '_mgr', toolbar.saved);
            } else if (!leftReadOnly) {
                draft = wireDraft(leftSheet, storageKey, toolbar.saved);
            }

            return function collectAll() {
                return {
                    staff:   collectFormData(leftSheet,  's__'),
                    manager: collectFormData(rightSheet, 'm__')
                };
            };
        }

        /* ---- State dispatch ----
         *
         *   no ?submission           → renderSingle (fresh self-reflection)
         *   ?submission complete     → renderDual (combined doc, both read-only)
         *   ?submission pending      → manager: renderDual w/ manager editable
         *                              staff:   renderSingle (their submission, read-only-ish)
         */

        var submissionId = readSubmissionId();

        function startStandalone() {
            var collect = renderSingle({});
            renderSendFooter_staff(sendFooter, {
                formId:  cfg.formId || slug(cfg.title),
                title:   cfg.title,
                collect: collect,
                onSent:  function (sid, email, name) {
                    try {
                        var u = new URL(location.href);
                        u.searchParams.set('submission', sid);
                        history.replaceState({}, '', u.toString());
                    } catch (e) { /* ignore */ }
                    sendFooter.style.display = 'none';
                    setStatus(statusBanner, 'pending',
                        '<span>📨</span><span>Sent to <strong>' +
                        (name || email) + '</strong>. They\'ll get a notification and can fill in their evaluation. ' +
                        'You\'ll be notified when they send it back.</span>');
                }
            });
        }

        if (!submissionId) {
            startStandalone();
        } else if (window.aisaAuth && window.aisaAuth.getFormSubmission) {
            setStatus(statusBanner, 'info', '<span>⏳</span><span>Loading submission…</span>');
            sendFooter.style.display = 'none';
            /* Render a single empty form as a placeholder so the layout
             * doesn't jump when the data arrives. */
            renderSingle({});

            window.aisaAuth.getFormSubmission(submissionId).then(function (r) {
                if (!r || !r.ok) {
                    setStatus(statusBanner, 'info',
                        '<span>⚠️</span><span>Couldn\'t load this submission (' +
                        ((r && r.error) || 'unknown') + '). You can still fill the form fresh and send it.</span>');
                    startStandalone();
                    return;
                }
                var sub  = r.submission;
                var data = normaliseData(sub.data);

                var meEmail = '';
                try {
                    var u = window.aisaAuth.getUser && window.aisaAuth.getUser();
                    if (u && u.email) meEmail = String(u.email).toLowerCase();
                } catch (e) { /* ignore */ }
                var iAmManager = (meEmail && meEmail === String(sub.manager_email || '').toLowerCase());
                var iAmStaff   = (meEmail && meEmail === String(sub.staff_email   || '').toLowerCase());

                var labels = {
                    staff:   'Self-Reflection · ' + (sub.staff_name   || sub.staff_email),
                    manager: 'Manager Evaluation · ' + (sub.manager_name || sub.manager_email)
                };

                if (sub.status === 'complete') {
                    /* Combined document — both sides read-only. */
                    renderDual({ data: data, editableSide: null, labels: labels });
                    setStatus(statusBanner, 'complete',
                        '<span>✅</span><span>Combined evaluation — <strong>' +
                        (sub.staff_name || sub.staff_email) + '</strong>\'s self-reflection ' +
                        'and <strong>' + (sub.manager_name || sub.manager_email) +
                        '</strong>\'s evaluation, side by side. Use Print / Save as PDF to keep a copy.</span>');
                } else if (iAmManager) {
                    /* Manager filling — side-by-side, only manager column editable. */
                    var collect = renderDual({
                        data: data, editableSide: 'manager', labels: labels
                    });
                    setStatus(statusBanner, 'pending',
                        '<span>📝</span><span>You\'re evaluating <strong>' +
                        (sub.staff_name || sub.staff_email) +
                        '</strong>. Their self-reflection is on the left; fill in your evaluation on the right, then send it back at the bottom.</span>');
                    renderSendFooter_manager(sendFooter, {
                        submissionId: submissionId,
                        staffEmail:   sub.staff_email,
                        staffName:    sub.staff_name,
                        collect:      collect,
                        onComplete:   function () {
                            sendFooter.style.display = 'none';
                            /* Lock the manager side too. */
                            formHost.querySelectorAll('.pr-sheet').forEach(function (s) {
                                if (!s.classList.contains('pr-readonly')) {
                                    s.classList.add('pr-readonly');
                                    applyReadOnly(s);
                                }
                            });
                            setStatus(statusBanner, 'complete',
                                '<span>✅</span><span>Sent back to <strong>' +
                                (sub.staff_name || sub.staff_email) +
                                '</strong>. They\'ll get a notification with this link.</span>');
                        }
                    });
                } else if (iAmStaff) {
                    /* Staff watching pending — single column of their own
                     * self-reflection, read-only (it's already sent). */
                    formHost.innerHTML = '';
                    var sheet = buildFormSheet(cfg, '', {
                        readOnly: true,
                        label: 'Self-Reflection (sent)'
                    });
                    formHost.appendChild(sheet);
                    hydrateFormData(sheet, data.staff || {}, '');
                    setStatus(statusBanner, 'pending',
                        '<span>⏳</span><span>Waiting on <strong>' +
                        (sub.manager_name || sub.manager_email) +
                        '</strong> to complete their evaluation. You\'ll get a notification when they send it back, and this page will then show both sides side by side.</span>');
                } else {
                    setStatus(statusBanner, 'info',
                        '<span>🔒</span><span>You don\'t have access to this submission.</span>');
                }
            }).catch(function () {
                setStatus(statusBanner, 'info',
                    '<span>⚠️</span><span>Couldn\'t reach the server. Showing a blank form — you can fill it and send it fresh.</span>');
                startStandalone();
            });
        } else {
            /* Auth not configured (e.g. preview page) — degrade. */
            startStandalone();
        }
    };
})();
