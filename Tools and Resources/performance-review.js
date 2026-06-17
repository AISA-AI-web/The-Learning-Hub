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
    function wireDraft(root, storageKey, savedEl) {
        var saveTimer = null;

        function collect() {
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

        function restore() {
            var raw;
            try { raw = JSON.parse(localStorage.getItem(storageKey) || '{}'); }
            catch (e) { raw = {}; }
            root.querySelectorAll('input, textarea').forEach(function (node) {
                if (!(node.name in raw)) { return; }
                if (node.type === 'radio') { node.checked = (node.value === raw[node.name]); }
                else { node.value = raw[node.name]; }
            });
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
                localStorage.setItem(storageKey, JSON.stringify(collect()));
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

    window.renderPerformanceReview = function (cfg) {
        var mount = document.getElementById(cfg.mount || 'form-root');
        if (!mount) { return; }

        var storageKey = 'aisa_perf_review_' + (cfg.formId || slug(cfg.title));

        var sheet = el('div', { class: 'pr-sheet' });
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
    };
})();
