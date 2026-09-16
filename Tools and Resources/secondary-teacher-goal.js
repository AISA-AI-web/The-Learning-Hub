/*
 * AISA Learning Hub — Secondary Teacher Personal Goal, 2026-27.
 *
 * A branching, required-entry form. This started life as a Google Form;
 * it moved here because Forms could not do what the secondary principal
 * needed — real required entries, guidance that changes with the focus
 * area chosen, a draft that survives a closed tab, and the responses
 * landing somewhere the Hub can track and chase.
 *
 * Shape of the form (the branching is the point):
 *
 *   1  Teacher information            all required
 *   2  Returning-teacher look-back    only when "at AISA last year" = Yes
 *   3  Choose your focus area         required; picks which section 4 is
 *   4  <the chosen area>              guidance for that area + 2 required
 *                                     answers. All ten routes rejoin here.
 *   5  Professional learning          optional
 *   6  Sign-off                       optional
 *   7  Review everything, then submit
 *
 * Storage: one response per person per survey, upserted server-side, so
 * coming back is an edit rather than a second entry. Answers autosave as
 * a draft while typing (server + localStorage mirror); pressing Submit
 * is what runs validation, stamps it submitted and emails the teacher
 * their copy.
 *
 * Required means required: the same rules are enforced again on the
 * server (SURVEY_SPECS in auth/apps-script.gs). If you add a question
 * here that must be answered, add its key there too — otherwise it is
 * only a suggestion.
 */
(function () {
    'use strict';

    var SURVEY_ID = 'secondary-teacher-goal-2026-27';
    var LOCAL_KEY = 'aisa_survey_' + SURVEY_ID;

    /* ------------------------------------------------------------------
     * The ten focus areas.
     *
     * Wording is the principal's, split into three labelled parts so a
     * teacher can scan it rather than read a wall. Editing a guidance
     * string here is the only change needed — nothing else references
     * these by anything but `name`.
     *
     * `name` is the stored value AND the value the server validates
     * against, so changing one means changing SURVEY_SPECS.choices
     * .focus_area in auth/apps-script.gs to match, or submissions start
     * bouncing.
     * ------------------------------------------------------------------ */
    var FOCUS_AREAS = [
        {
            name: 'Planning & Preparation for Learning',
            icon: '🗺️',
            guidance: 'At AISA, planning starts from backward design: name what students need to know and do, decide what counts as evidence of that, then build the lessons.',
            strategies: 'Writing the summative assessment before the lesson sequence; using an Exit Ticket or ActiveObservation to check whether the plan is working.',
            evidence: 'A unit plan showing the assessment written before the lessons; Exit Ticket data that predicts summative results; a completed data tracker used to plan the next unit.'
        },
        {
            name: 'Curriculum & Lesson Design',
            icon: '🎯',
            guidance: 'Students should be able to say what they’re learning and what success looks like — not just what page they’re on.',
            strategies: 'Posting a precise learning objective and success criteria; using an I Do / We Do / You Do sequence; checking students can restate the objective in their own words.',
            evidence: 'A lesson observation showing the objective and success criteria posted and referenced; students able to restate the objective when asked.'
        },
        {
            name: 'Questioning & Discussion',
            icon: '💬',
            guidance: 'The goal isn’t more questions, it’s better ones — pushing past the first correct answer and reaching students beyond the usual volunteers.',
            strategies: 'Asking “how do you know?” after correct answers; cold-calling from a full roster; using wait time.',
            evidence: 'A self-recorded lesson showing follow-up justification questions; a cold-call tally showing a broader range of students called on.'
        },
        {
            name: 'Student Engagement & Learning Behaviors',
            icon: '✋',
            guidance: 'Engagement means every student is thinking and producing something, not just a few.',
            strategies: 'Turn and Talk; mini-whiteboards; Cold Call; circulating with purpose; bringing disengaged students back into the exchange.',
            evidence: 'A weekly tally showing an active-participation structure used per lesson; a record of students circled back to.'
        },
        {
            name: 'Differentiation & Inclusion',
            icon: '🧩',
            guidance: 'Differentiation means every student reaches the same standard through a different path, not a lowered one, and that IEP/ISP/EAL accommodations are implemented as written.',
            strategies: 'A planned scaffold per unit; No Opt Out; checking plans against accommodations before teaching.',
            evidence: 'Unit plans checked against accommodations; a planned scaffold visible in at least one task per unit.'
        },
        {
            name: 'Assessment for Learning',
            icon: '📏',
            guidance: 'This is about catching where students are throughout the lesson, not only at the end, and visibly changing what happens next.',
            strategies: 'A mid-lesson check for understanding; exit tickets; closing the loop with a reteach when a gap shows up.',
            evidence: 'Exit ticket data compared against summative results; a documented reteach logged after a formative check showed a gap.'
        },
        {
            name: 'Classroom Climate & Relationships',
            icon: '🤝',
            guidance: 'A strong climate means expectations are held consistently, not just posted, and behavior is redirected calmly rather than through escalation.',
            strategies: 'Two-by-Ten; a calm consistent redirection routine; greeting students by name.',
            evidence: 'A weekly log showing reduced off-task incidents; documented use of calm redirection instead of public correction.'
        },
        {
            name: 'Use of Resources & Technology',
            icon: '🔧',
            guidance: 'Resources and technology should be purposeful and matched to the learning, with real accountability when students use them.',
            strategies: 'Circulating and checking in with groups during resource-based tasks; explicit group-work instructions.',
            evidence: 'Observation notes on how many groups were checked in with; explicit task instructions documented before group work begins.'
        },
        {
            name: 'UAE Culture, Heritage & National Identity',
            icon: '🇦🇪',
            guidance: 'This is about planned, genuine connections to Emirati culture and heritage, not incidental mentions.',
            strategies: 'A planned cultural connection in every unit; displaying student work connected to UAE landmarks or culture.',
            evidence: 'A documented cultural connection in every unit plan; a completed student-led citizenship task each semester.'
        },
        {
            name: 'Professionalism, Collaboration & Family Partnership',
            icon: '👪',
            guidance: 'This covers actively contributing to the team and communicating with families proactively, not only when there’s a problem.',
            strategies: 'Bringing an idea to every department meeting; responding to family messages within 24 hours; sending positive news home.',
            evidence: 'A running list of meeting contributions; a log of family messages and response times.'
        }
    ];

    var PL_OPTIONS = [
        'Coaching cycle with my HOD or a coach',
        'Watching a colleague teach',
        'Being watched by a colleague, informally',
        'A workshop or course',
        'Professional reading or research',
        'Mentoring — giving or receiving',
        'Reviewing video of my own teaching',
        'Protected PLC/department time to work on this specifically'
    ];

    var GOAL_TEMPLATE =
        'For the 2026-2027 school year, I will focus on improving my ability to [specific skill or practice]. ' +
        'My goal is to implement [strategy or technique], and success will look like [observable outcome]. ' +
        'I will measure my progress by [method], and this aligns with my growth as a teacher while improving ' +
        '[student achievement or a school priority]. To achieve this, I will take actionable steps such as ' +
        '[step] and [step]. I will seek support from [person or team] and use [resource] as a resource. ' +
        'I plan to accomplish this goal by [specific date].';

    var CONFIRMATION =
        'Save a copy of this response. We’ll revisit this goal at your mid-year and end-of-year ' +
        'check-ins, and in your appraisal conversation.';

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    /* Every answer lives here. Keys match SURVEY_SPECS.fields in
     * auth/apps-script.gs — the server drops anything it doesn't know. */
    var answers = {
        name: '', email: '', department: '', at_aisa_last_year: '',
        focus_area: '', goal: '', if_then: '',
        pl_supports: [], pl_other: '', pl_detail: '', beyond_classroom: ''
    };

    var stepIndex   = 0;
    var submitted   = false;      // already submitted at least once
    var revision    = 0;
    var dirty       = false;      // unsaved edits since the last server write
    var saveTimer   = null;
    var serverReady = true;       // flipped off when the backend rejects us

    function $(id) { return document.getElementById(id); }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function areaByName(name) {
        for (var i = 0; i < FOCUS_AREAS.length; i++) {
            if (FOCUS_AREAS[i].name === name) return FOCUS_AREAS[i];
        }
        return null;
    }

    function isReturning() { return answers.at_aisa_last_year === 'Yes'; }

    /* ------------------------------------------------------------------
     * Steps.
     *
     * `when` makes a step conditional — that is the whole branching
     * mechanism. The look-back is skipped for teachers new to AISA, and
     * the focus-area step can't be reached until an area is chosen, so
     * there is never a step showing guidance for nothing.
     * ------------------------------------------------------------------ */
    var STEPS = [
        { id: 'info',     label: 'Your details',       render: renderInfo,     required: ['name', 'email', 'department', 'at_aisa_last_year'] },
        { id: 'lookback', label: 'Last year',          render: renderLookback, required: [], when: isReturning },
        { id: 'focus',    label: 'Focus area',         render: renderFocus,    required: ['focus_area'] },
        { id: 'goal',     label: 'Your goal',          render: renderGoal,     required: ['goal', 'if_then'] },
        { id: 'pl',       label: 'Support',            render: renderPl,       required: [] },
        { id: 'signoff',  label: 'Sign-off',           render: renderSignoff,  required: [] },
        { id: 'review',   label: 'Review & submit',    render: renderReview,   required: [] }
    ];

    function activeSteps() {
        return STEPS.filter(function (s) { return !s.when || s.when(); });
    }

    /* ------------------------------------------------------------------
     * Persistence
     * ------------------------------------------------------------------ */

    function readLocal() {
        try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
        catch (e) { return {}; }
    }
    function writeLocal() {
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify(answers)); }
        catch (e) { /* storage full or blocked — the server copy stands */ }
    }

    function setSaveState(text, tone) {
        var el = $('save-state');
        if (!el) return;
        el.textContent = text;
        el.className = 'text-xs font-semibold ' + (
            tone === 'error' ? 'text-rose-600' :
            tone === 'ok'    ? 'text-emerald-600' : 'text-slate-400'
        );
    }

    function showAlert(message, isSetup) {
        var box = $('form-alert');
        if (!box) return;
        box.innerHTML = '<strong class="font-bold">Heads up.</strong> ' + esc(message);
        box.classList.remove('hidden');
        if (isSetup) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function clearAlert() {
        var box = $('form-alert');
        if (box) box.classList.add('hidden');
    }

    /* Push the current answers up as a draft. Never blocks the teacher:
     * a failed autosave shows in the save-state line and the typing is
     * still safe in localStorage until the tab closes. */
    function saveDraft() {
        writeLocal();
        if (!window.aisaAuth || !window.aisaAuth.saveSurveyResponse || !serverReady) {
            setSaveState('Saved on this device only', 'error');
            return Promise.resolve();
        }
        setSaveState('Saving…');
        return window.aisaAuth.saveSurveyResponse(SURVEY_ID, answers, { submit: false })
            .then(function () {
                dirty = false;
                setSaveState('Draft saved', 'ok');
                clearAlert();
            })
            .catch(function (err) {
                setSaveState('Not saved', 'error');
                /* A backend that doesn't know this survey will never know
                 * it until someone redeploys — stop retrying on every
                 * keystroke and say so once, loudly. */
                if (err && (err.isSetupProblem || err.message === 'unknown_survey')) {
                    serverReady = false;
                    showAlert(err.userMessage || 'This form is not switched on in the backend yet.', true);
                }
            });
    }

    function scheduleSave() {
        dirty = true;
        setSaveState('Unsaved changes');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { saveDraft(); }, 1200);
    }

    function flushSave() {
        clearTimeout(saveTimer);
        if (dirty) return saveDraft();
        return Promise.resolve();
    }

    /* ------------------------------------------------------------------
     * Validation
     * ------------------------------------------------------------------ */

    var LABELS = {
        name: 'Name', email: 'Email', department: 'Department / Subject',
        at_aisa_last_year: 'Were you at AISA last year?',
        focus_area: 'Your focus area',
        goal: 'Your goal', if_then: 'Your if-then plan'
    };

    function isBlank(v) {
        if (Array.isArray(v)) return v.length === 0;
        return !String(v == null ? '' : v).trim();
    }

    function missingIn(step) {
        return (step.required || []).filter(function (k) { return isBlank(answers[k]); });
    }

    /* Everything still outstanding anywhere in the form, in step order —
     * what the review step needs so it can refuse to submit and say
     * exactly which question is empty. */
    function missingEverywhere() {
        var out = [];
        activeSteps().forEach(function (s) {
            missingIn(s).forEach(function (k) { out.push({ key: k, step: s.id }); });
        });
        return out;
    }

    function markInvalid(keys) {
        keys.forEach(function (k) {
            var field = document.querySelector('[data-error-for="' + k + '"]');
            var input = document.querySelector('[data-field="' + k + '"]');
            if (field) field.classList.remove('hidden');
            if (input) input.classList.add('ring-2', 'ring-rose-300', 'border-rose-400');
        });
        var first = document.querySelector('[data-field="' + keys[0] + '"]');
        if (first) {
            first.scrollIntoView({ behavior: 'smooth', block: 'center' });
            try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
        }
    }

    function clearInvalid(key) {
        var field = document.querySelector('[data-error-for="' + key + '"]');
        var input = document.querySelector('[data-field="' + key + '"]');
        if (field) field.classList.add('hidden');
        if (input) input.classList.remove('ring-2', 'ring-rose-300', 'border-rose-400');
    }

    /* ------------------------------------------------------------------
     * Shared field builders
     * ------------------------------------------------------------------ */

    function requiredPill() {
        return '<span class="ml-2 align-middle inline-block text-[10px] font-bold uppercase tracking-widest ' +
               'text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">Required</span>';
    }
    function optionalPill() {
        return '<span class="ml-2 align-middle inline-block text-[10px] font-bold uppercase tracking-widest ' +
               'text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Optional</span>';
    }

    function errorSlot(key, message) {
        return '<p data-error-for="' + key + '" class="hidden mt-1.5 text-xs font-semibold text-rose-600">' +
               esc(message || 'This one is required.') + '</p>';
    }

    function textField(key, label, opts) {
        opts = opts || {};
        return '<div class="mb-5">' +
            '<label for="f-' + key + '" class="block text-sm font-bold text-slate-800 mb-1.5">' +
                esc(label) + (opts.required ? requiredPill() : optionalPill()) +
            '</label>' +
            (opts.hint ? '<p class="text-xs text-slate-500 mb-2 leading-relaxed">' + esc(opts.hint) + '</p>' : '') +
            '<input id="f-' + key + '" data-field="' + key + '" type="' + (opts.type || 'text') + '" ' +
                'value="' + esc(answers[key]) + '" ' +
                (opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '" ' : '') +
                'autocomplete="' + (opts.autocomplete || 'off') + '" ' +
                'class="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 bg-white ' +
                'focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition">' +
            errorSlot(key) +
        '</div>';
    }

    function textArea(key, label, opts) {
        opts = opts || {};
        return '<div class="mb-5">' +
            '<label for="f-' + key + '" class="block text-sm font-bold text-slate-800 mb-1.5">' +
                esc(label) + (opts.required ? requiredPill() : optionalPill()) +
            '</label>' +
            (opts.hintHtml ? opts.hintHtml : '') +
            '<textarea id="f-' + key + '" data-field="' + key + '" rows="' + (opts.rows || 5) + '" ' +
                (opts.placeholder ? 'placeholder="' + esc(opts.placeholder) + '" ' : '') +
                'class="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 bg-white leading-relaxed ' +
                'focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition">' +
                esc(answers[key]) +
            '</textarea>' +
            errorSlot(key) +
        '</div>';
    }

    /* ------------------------------------------------------------------
     * Step renderers
     * ------------------------------------------------------------------ */

    function stepHeading(title, blurb) {
        return '<h2 class="text-xl sm:text-2xl font-heading font-black text-slate-900 leading-tight">' +
                    esc(title) + '</h2>' +
               (blurb ? '<p class="text-sm text-slate-600 mt-1.5 mb-6 leading-relaxed">' + blurb + '</p>'
                      : '<div class="mb-6"></div>');
    }

    function renderInfo() {
        var yesNo = ['Yes', 'No'].map(function (v) {
            var on = answers.at_aisa_last_year === v;
            return '<button type="button" data-choice="at_aisa_last_year" data-value="' + v + '" ' +
                'class="flex-1 text-sm font-bold rounded-xl border px-4 py-3 transition ' +
                (on ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50') +
                '">' + esc(v) + '</button>';
        }).join('');

        return stepHeading('Teacher information', 'Just so we know whose goal this is.') +
            textField('name', 'Name', { required: true, autocomplete: 'name' }) +
            textField('email', 'Email', { required: true, type: 'email', autocomplete: 'email' }) +
            textField('department', 'Department / Subject', { required: true, placeholder: 'e.g. Secondary Science' }) +
            '<div class="mb-2">' +
                '<span class="block text-sm font-bold text-slate-800 mb-2">' +
                    'Were you at AISA last year?' + requiredPill() + '</span>' +
                '<div data-field="at_aisa_last_year" class="flex gap-3 max-w-sm rounded-xl">' + yesNo + '</div>' +
                errorSlot('at_aisa_last_year', 'Please choose Yes or No.') +
            '</div>';
    }

    function renderLookback() {
        return stepHeading('Before you write this year’s goal') +
            '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-5 sm:p-6">' +
                '<p class="text-sm text-amber-950 leading-relaxed">' +
                    'Pull up two things before you write this year’s goal: your <strong>appraisal feedback ' +
                    'from last year</strong>, and <strong>the goal you wrote for this year</strong> at that time.' +
                '</p>' +
                '<p class="text-sm text-amber-950 leading-relaxed mt-3">' +
                    'Ask yourself honestly: <strong>did that goal happen?</strong>' +
                '</p>' +
                '<ul class="mt-3 space-y-2 text-sm text-amber-950 leading-relaxed">' +
                    '<li class="flex gap-2"><span aria-hidden="true">•</span><span>If it did, this year’s goal should ' +
                        'push further in the same area or move to a new one <em>on purpose</em> — not repeat last ' +
                        'year’s in different words.</span></li>' +
                    '<li class="flex gap-2"><span aria-hidden="true">•</span><span>If it didn’t happen, ask <em>why</em> ' +
                        'before writing another one just like it.</span></li>' +
                '</ul>' +
            '</div>' +
            '<p class="text-xs text-slate-500 mt-4">Nothing to fill in here — this page is for you. ' +
             'Carry on when you’ve had that think.</p>';
    }

    function renderFocus() {
        var opts = ['<option value="">Choose an area…</option>'].concat(
            FOCUS_AREAS.map(function (a) {
                return '<option value="' + esc(a.name) + '"' +
                       (answers.focus_area === a.name ? ' selected' : '') + '>' +
                       esc(a.name) + '</option>';
            })
        ).join('');

        var chosen = areaByName(answers.focus_area);

        return stepHeading('Choose your focus area',
                'One area, chosen on purpose. What you pick decides the guidance and the ' +
                'strategies you get on the next page.') +
            '<div class="mb-5">' +
                '<label for="f-focus_area" class="block text-sm font-bold text-slate-800 mb-1.5">' +
                    'Which area of your practice do you want to focus on this year?' + requiredPill() +
                '</label>' +
                '<select id="f-focus_area" data-field="focus_area" ' +
                    'class="w-full text-sm border border-slate-300 rounded-xl px-3.5 py-2.5 bg-white ' +
                    'focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition">' +
                    opts +
                '</select>' +
                errorSlot('focus_area', 'Pick the area you want to focus on.') +
            '</div>' +
            '<div id="focus-preview">' + (chosen ? focusPreview(chosen) : '') + '</div>';
    }

    function focusPreview(area) {
        return '<div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-start gap-3">' +
            '<div class="text-2xl leading-none flex-shrink-0" aria-hidden="true">' + area.icon + '</div>' +
            '<div>' +
                '<p class="text-sm font-bold text-indigo-900">' + esc(area.name) + '</p>' +
                '<p class="text-sm text-indigo-900/80 leading-relaxed mt-1">' + esc(area.guidance) + '</p>' +
            '</div>' +
        '</div>';
    }

    function guidanceBlock(area) {
        function row(label, text, tone) {
            return '<div class="' + tone + ' rounded-xl border px-4 py-3">' +
                '<p class="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">' + esc(label) + '</p>' +
                '<p class="text-sm leading-relaxed">' + esc(text) + '</p>' +
            '</div>';
        }
        return '<div class="mb-7">' +
            '<div class="flex items-center gap-2.5 mb-3">' +
                '<span class="text-2xl leading-none" aria-hidden="true">' + area.icon + '</span>' +
                '<h3 class="text-base font-heading font-black text-slate-900 leading-tight">' + esc(area.name) + '</h3>' +
            '</div>' +
            '<div class="space-y-2.5">' +
                row('Guidance', area.guidance, 'bg-indigo-50 border-indigo-200 text-indigo-950') +
                row('Real strategies to name in your goal', area.strategies, 'bg-white border-slate-200 text-slate-800') +
                row('What counts as evidence', area.evidence, 'bg-emerald-50 border-emerald-200 text-emerald-950') +
            '</div>' +
        '</div>';
    }

    function renderGoal() {
        var area = areaByName(answers.focus_area);
        if (!area) {
            /* Only reachable if the stored focus area no longer matches a
             * known one — an edited FOCUS_AREAS list against an old draft. */
            return stepHeading('Choose a focus area first') +
                '<p class="text-sm text-slate-600">Go back a step and pick the area you want to focus on.</p>';
        }

        var templateHint =
            '<div class="mb-3">' +
                '<p class="text-xs text-slate-500 mb-2 leading-relaxed">Use this format — replace everything in brackets.</p>' +
                '<div class="bg-slate-50 border border-slate-200 rounded-xl p-3.5">' +
                    '<p class="text-[13px] text-slate-600 leading-relaxed font-mono">' + esc(GOAL_TEMPLATE) + '</p>' +
                    '<button type="button" id="use-template" ' +
                        'class="mt-3 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 ' +
                        'rounded-lg px-3 py-1.5 hover:bg-indigo-50 transition">' +
                        'Start from this template' +
                    '</button>' +
                '</div>' +
            '</div>';

        return stepHeading('Write your goal',
                'This is the part we’ll come back to. Name the strategy, not just the intention.') +
            guidanceBlock(area) +
            textArea('goal', 'Write your goal using this format', {
                required: true, rows: 9, hintHtml: templateHint
            }) +
            textArea('if_then', 'Your if-then plan', {
                required: true, rows: 3,
                hintHtml: '<p class="text-xs text-slate-500 mb-2 leading-relaxed">' +
                    'One specific moment, one specific action. “If [a specific moment that will come up in ' +
                    'your classroom], then I will [a specific action].”</p>',
                placeholder: 'If a student gives me a correct answer with no reasoning, then I will ask “how do you know?” before moving on.'
            });
    }

    function renderPl() {
        var boxes = PL_OPTIONS.map(function (opt, i) {
            var on = answers.pl_supports.indexOf(opt) !== -1;
            return '<label class="flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ' +
                (on ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200 hover:border-indigo-200') + '">' +
                '<input type="checkbox" data-pl="' + i + '" ' + (on ? 'checked ' : '') +
                    'class="mt-0.5 w-4 h-4 accent-indigo-600 flex-shrink-0">' +
                '<span class="text-sm text-slate-800 leading-snug">' + esc(opt) + '</span>' +
            '</label>';
        }).join('');

        var otherOn = !!String(answers.pl_other || '').trim();

        return stepHeading('Professional learning',
                'Now that you’ve written your goal, what kind of support would actually help you get there?') +
            '<div class="mb-5">' +
                '<span class="block text-sm font-bold text-slate-800 mb-2">' +
                    'What kind of professional learning would help you reach this goal?' + optionalPill() + '</span>' +
                '<div class="space-y-2">' + boxes +
                    '<label class="flex items-start gap-3 rounded-xl border px-4 py-3 transition ' +
                        (otherOn ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200') + '">' +
                        '<span class="mt-0.5 text-sm font-bold text-slate-700 flex-shrink-0">Other</span>' +
                        '<input type="text" data-field="pl_other" value="' + esc(answers.pl_other) + '" ' +
                            'placeholder="Something not on the list" ' +
                            'class="flex-1 text-sm bg-transparent border-0 border-b border-slate-300 pb-0.5 ' +
                            'focus:outline-none focus:border-indigo-500 transition">' +
                    '</label>' +
                '</div>' +
            '</div>' +
            textArea('pl_detail', 'Anything specific about that support — a topic, a person, a format — that would make it most useful?', {
                rows: 4
            });
    }

    function renderSignoff() {
        return stepHeading('Sign-off', 'Last one.') +
            textField('beyond_classroom',
                'Anything beyond the classroom this year worth noting?', {
                hint: 'Committees, coaching, activities — one line is fine.',
                placeholder: 'e.g. Coaching the secondary debate team'
            });
    }

    function reviewRow(label, value, stepId, keys) {
        var empty = isBlank(value);
        var text  = Array.isArray(value) ? value.join(', ') : String(value || '');
        return '<div class="border-b border-slate-100 py-3 last:border-0">' +
            '<div class="flex items-start justify-between gap-3">' +
                '<p class="text-[11px] font-bold uppercase tracking-widest text-slate-400">' + esc(label) + '</p>' +
                '<button type="button" data-goto="' + stepId + '" ' +
                    'class="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex-shrink-0">Edit</button>' +
            '</div>' +
            (empty
                ? '<p class="text-sm mt-0.5 ' + (keys ? 'text-rose-600 font-semibold' : 'text-slate-400 italic') + '">' +
                  (keys ? 'Still empty — this one is required.' : 'Not answered') + '</p>'
                : '<p class="text-sm text-slate-800 mt-0.5 whitespace-pre-wrap leading-relaxed">' + esc(text) + '</p>') +
        '</div>';
    }

    function renderReview() {
        var gaps = missingEverywhere();
        var banner = gaps.length
            ? '<div class="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 mb-5">' +
                '<p class="text-sm font-bold text-rose-800">' + gaps.length +
                    ' required ' + (gaps.length === 1 ? 'answer is' : 'answers are') + ' still empty.</p>' +
                '<p class="text-sm text-rose-700 mt-0.5">You can’t submit until ' +
                    (gaps.length === 1 ? 'it’s' : 'they’re') + ' filled in. Use the Edit links below.</p>' +
              '</div>'
            : '<div class="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-5">' +
                '<p class="text-sm font-bold text-emerald-800">Everything required is answered.</p>' +
                '<p class="text-sm text-emerald-700 mt-0.5">Read it back once, then submit. ' +
                    'A copy goes to your email, and you can come back and edit it later.</p>' +
              '</div>';

        var plText = answers.pl_supports.slice();
        if (String(answers.pl_other || '').trim()) plText.push('Other: ' + answers.pl_other.trim());

        return stepHeading('Review and submit', 'Check it reads the way you meant it.') +
            banner +
            '<div class="bg-white border border-slate-200 rounded-2xl px-4 sm:px-5 py-1">' +
                reviewRow('Name', answers.name, 'info', true) +
                reviewRow('Email', answers.email, 'info', true) +
                reviewRow('Department / Subject', answers.department, 'info', true) +
                reviewRow('At AISA last year', answers.at_aisa_last_year, 'info', true) +
                reviewRow('Focus area', answers.focus_area, 'focus', true) +
                reviewRow('Your goal', answers.goal, 'goal', true) +
                reviewRow('If-then plan', answers.if_then, 'goal', true) +
                reviewRow('Professional learning wanted', plText, 'pl', false) +
                reviewRow('What would make that support most useful', answers.pl_detail, 'pl', false) +
                reviewRow('Beyond the classroom', answers.beyond_classroom, 'signoff', false) +
            '</div>' +
            '<div class="mt-6 flex flex-wrap items-center gap-3">' +
                '<button type="button" id="submit-btn" ' + (gaps.length ? 'disabled ' : '') +
                    'class="font-bold text-sm rounded-xl px-6 py-3 transition shadow-sm ' +
                    (gaps.length
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700') + '">' +
                    (submitted ? 'Save my changes' : 'Submit my goal') +
                '</button>' +
                '<span id="submit-state" class="text-xs font-semibold text-slate-500"></span>' +
            '</div>';
    }

    /* ------------------------------------------------------------------
     * Confirmation
     * ------------------------------------------------------------------ */

    function renderDone(emailInfo) {
        var mail = (emailInfo && emailInfo.sent)
            ? 'A copy is on its way to <strong>' + esc(answers.email || '') + '</strong>.'
            : 'We couldn’t email you a copy just now — use the button below to keep one.';

        $('form-card').innerHTML =
            '<div class="text-center py-6">' +
                '<div class="text-5xl mb-4" aria-hidden="true">✅</div>' +
                '<h2 class="text-2xl font-heading font-black text-slate-900">Goal submitted</h2>' +
                '<p class="text-sm text-slate-600 mt-3 max-w-xl mx-auto leading-relaxed">' + esc(CONFIRMATION) + '</p>' +
                '<p class="text-sm text-slate-500 mt-3">' + mail + '</p>' +
                '<div class="mt-7 flex flex-wrap justify-center gap-3">' +
                    '<button type="button" id="print-btn" ' +
                        'class="font-bold text-sm rounded-xl px-5 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 transition">' +
                        'Print / save as PDF</button>' +
                    '<button type="button" id="reopen-btn" ' +
                        'class="font-bold text-sm rounded-xl px-5 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition">' +
                        'Edit my goal</button>' +
                    '<a href="../index.html" ' +
                        'class="font-bold text-sm rounded-xl px-5 py-2.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition">' +
                        'Back to the Hub</a>' +
                '</div>' +
            '</div>' +
            printableSummary();

        $('step-rail').classList.add('hidden');
        $('nav-bar').classList.add('hidden');

        $('print-btn').addEventListener('click', function () { window.print(); });
        $('reopen-btn').addEventListener('click', function () {
            $('step-rail').classList.remove('hidden');
            $('nav-bar').classList.remove('hidden');
            goTo(0);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* Hidden on screen, printed on paper — so "save a copy" works even
     * if the email never lands. */
    function printableSummary() {
        var area = areaByName(answers.focus_area);
        var pl = answers.pl_supports.slice();
        if (String(answers.pl_other || '').trim()) pl.push('Other: ' + answers.pl_other.trim());

        var rows = [
            ['Name', answers.name],
            ['Email', answers.email],
            ['Department / Subject', answers.department],
            ['At AISA last year', answers.at_aisa_last_year],
            ['Focus area', answers.focus_area],
            ['Goal', answers.goal],
            ['If-then plan', answers.if_then],
            ['Professional learning wanted', pl.join(', ')],
            ['What would make that support most useful', answers.pl_detail],
            ['Beyond the classroom', answers.beyond_classroom]
        ].filter(function (r) { return !isBlank(r[1]); });

        return '<div id="print-copy" class="hidden print:block mt-10 text-left">' +
            '<h2 class="text-lg font-black text-slate-900">AISA Secondary Teacher Personal Goal, 2026-27</h2>' +
            (area ? '<p class="text-sm text-slate-500 mt-0.5">' + esc(area.name) + '</p>' : '') +
            rows.map(function (r) {
                return '<div class="mt-4">' +
                    '<p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">' + esc(r[0]) + '</p>' +
                    '<p class="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">' + esc(r[1]) + '</p>' +
                '</div>';
            }).join('') +
        '</div>';
    }

    /* ------------------------------------------------------------------
     * Submit
     * ------------------------------------------------------------------ */

    function doSubmit() {
        var gaps = missingEverywhere();
        if (gaps.length) { goTo(indexOfStep(gaps[0].step)); return; }

        var btn = $('submit-btn');
        var state = $('submit-state');
        btn.disabled = true;
        btn.classList.add('opacity-60');
        state.textContent = 'Submitting…';

        /* The pending autosave is about to be cancelled, so mirror what's
         * typed before doing it — otherwise a submit that bounces on
         * validation loses the last second of typing. */
        writeLocal();
        clearTimeout(saveTimer);
        dirty = false;

        if (!window.aisaAuth || !window.aisaAuth.saveSurveyResponse) {
            btn.disabled = false;
            btn.classList.remove('opacity-60');
            state.textContent = '';
            showAlert('You are not signed in, so this cannot be submitted. Sign in and try again.', true);
            return;
        }

        window.aisaAuth.saveSurveyResponse(SURVEY_ID, answers, { submit: true })
            .then(function (r) {
                submitted = true;
                revision = (r && r.revision) || revision + 1;
                writeLocal();
                renderDone(r && r.email);
            })
            .catch(function (err) {
                btn.disabled = false;
                btn.classList.remove('opacity-60');
                state.textContent = '';
                /* Nothing reached the server, so these answers are still
                 * unsaved — put the flag back so the next edit re-saves
                 * and the leave-the-page guard stays armed. */
                dirty = true;
                /* The server checks the same required fields we do. If it
                 * disagrees with us, it wins and it tells us which ones —
                 * jump the teacher to the first one rather than leaving
                 * them staring at a refusal. */
                if (err && err.missing && err.missing.length) {
                    var key = err.missing[0];
                    var step = stepOwning(key);
                    showAlert(err.userMessage || 'Some required answers are still empty.', false);
                    if (step) { goTo(indexOfStep(step)); markInvalid([key]); }
                    return;
                }
                showAlert((err && err.userMessage) ||
                    'Your goal could not be submitted just now. Check your connection and try again — ' +
                    'nothing you typed has been lost.', !!(err && err.isSetupProblem));
            });
    }

    function stepOwning(key) {
        for (var i = 0; i < STEPS.length; i++) {
            if ((STEPS[i].required || []).indexOf(key) !== -1) return STEPS[i].id;
        }
        return null;
    }
    function indexOfStep(id) {
        var list = activeSteps();
        for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
        return 0;
    }

    /* ------------------------------------------------------------------
     * Rendering + navigation
     * ------------------------------------------------------------------ */

    function renderRail() {
        var list = activeSteps();
        $('step-rail').innerHTML = list.map(function (s, i) {
            var done    = i < stepIndex;
            var current = i === stepIndex;
            return '<li class="flex items-center gap-2 flex-shrink-0">' +
                '<button type="button" data-step="' + i + '" ' +
                    'class="flex items-center gap-2 text-xs font-bold px-2.5 py-1.5 rounded-full transition ' +
                    (current ? 'bg-indigo-600 text-white'
                             : done ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : 'text-slate-400 hover:text-slate-600') + '">' +
                    '<span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] ' +
                        (current ? 'bg-white/25'
                                 : done ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500') + '">' +
                        (done ? '✓' : (i + 1)) +
                    '</span>' +
                    esc(s.label) +
                '</button>' +
                (i < list.length - 1 ? '<span class="text-slate-300" aria-hidden="true">›</span>' : '') +
            '</li>';
        }).join('');
    }

    function renderNav() {
        var list = activeSteps();
        var last = stepIndex === list.length - 1;
        $('nav-bar').innerHTML =
            '<button type="button" id="back-btn" ' + (stepIndex === 0 ? 'disabled ' : '') +
                'class="font-bold text-sm rounded-xl px-5 py-2.5 border transition ' +
                (stepIndex === 0
                    ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                    : 'border-slate-300 text-slate-700 bg-white hover:bg-slate-50') + '">← Back</button>' +
            '<div class="flex items-center gap-3">' +
                '<span id="save-state" class="text-xs font-semibold text-slate-400"></span>' +
                (last ? ''
                      : '<button type="button" id="next-btn" ' +
                        'class="font-bold text-sm rounded-xl px-6 py-2.5 bg-indigo-600 text-white ' +
                        'hover:bg-indigo-700 transition shadow-sm">Next →</button>') +
            '</div>';

        $('back-btn').addEventListener('click', function () {
            if (stepIndex > 0) goTo(stepIndex - 1);
        });
        var next = $('next-btn');
        if (next) next.addEventListener('click', onNext);
    }

    function onNext() {
        var step = activeSteps()[stepIndex];
        var gaps = missingIn(step);
        if (gaps.length) { markInvalid(gaps); return; }
        flushSave();
        goTo(stepIndex + 1);
    }

    function goTo(i) {
        var list = activeSteps();
        stepIndex = Math.max(0, Math.min(i, list.length - 1));
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function render() {
        var list = activeSteps();
        /* The look-back step appears and disappears with the Yes/No
         * answer, so a stored index can point past the end. */
        if (stepIndex > list.length - 1) stepIndex = list.length - 1;
        var step = list[stepIndex];

        $('form-card').innerHTML = step.render();
        $('progress-bar').style.width =
            Math.round(((stepIndex + 1) / list.length) * 100) + '%';
        $('progress-text').textContent = 'Step ' + (stepIndex + 1) + ' of ' + list.length;

        renderRail();
        renderNav();
        wireCard();
        if (submitted) {
            $('resubmit-note').classList.remove('hidden');
        }
    }

    /* Field wiring is re-applied on every render because each step
     * rebuilds its own markup. Keeps state in `answers` as the single
     * source of truth rather than reading the DOM at submit time. */
    function wireCard() {
        var card = $('form-card');

        card.querySelectorAll('[data-field]').forEach(function (el) {
            var key = el.getAttribute('data-field');
            if (!(key in answers)) return;
            if (el.tagName === 'DIV') return;   // choice groups wire below

            var evt = el.tagName === 'SELECT' ? 'change' : 'input';
            el.addEventListener(evt, function () {
                answers[key] = el.value;
                clearInvalid(key);
                scheduleSave();
                if (key === 'focus_area') {
                    var area = areaByName(answers.focus_area);
                    var host = $('focus-preview');
                    if (host) host.innerHTML = area ? focusPreview(area) : '';
                }
            });
        });

        card.querySelectorAll('[data-choice]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var key = btn.getAttribute('data-choice');
                answers[key] = btn.getAttribute('data-value');
                clearInvalid(key);
                scheduleSave();
                render();       // Yes/No changes which steps exist
            });
        });

        card.querySelectorAll('[data-pl]').forEach(function (box) {
            box.addEventListener('change', function () {
                var opt = PL_OPTIONS[Number(box.getAttribute('data-pl'))];
                var at = answers.pl_supports.indexOf(opt);
                if (box.checked && at === -1) answers.pl_supports.push(opt);
                else if (!box.checked && at !== -1) answers.pl_supports.splice(at, 1);
                scheduleSave();
                render();
            });
        });

        var tpl = $('use-template');
        if (tpl) {
            tpl.addEventListener('click', function () {
                var field = $('f-goal');
                if (!field) return;
                /* Never clobber something already written. */
                if (String(field.value).trim() &&
                    !window.confirm('Replace what you\'ve written with the blank template?')) return;
                field.value = GOAL_TEMPLATE;
                answers.goal = GOAL_TEMPLATE;
                clearInvalid('goal');
                scheduleSave();
                field.focus();
                field.setSelectionRange(0, 0);
            });
        }

        card.querySelectorAll('[data-goto]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                goTo(indexOfStep(btn.getAttribute('data-goto')));
            });
        });

        var submit = $('submit-btn');
        if (submit) submit.addEventListener('click', doSubmit);
    }

    /* ------------------------------------------------------------------
     * Boot
     * ------------------------------------------------------------------ */

    function adopt(data) {
        if (!data) return;
        Object.keys(answers).forEach(function (k) {
            if (!Object.prototype.hasOwnProperty.call(data, k)) return;
            if (k === 'pl_supports') {
                answers[k] = Array.isArray(data[k]) ? data[k].slice() : [];
            } else if (data[k] != null) {
                answers[k] = String(data[k]);
            }
        });
    }

    function boot() {
        adopt(readLocal());
        render();

        $('step-rail').addEventListener('click', function (e) {
            var btn = e.target.closest('[data-step]');
            if (!btn) return;
            var target = Number(btn.getAttribute('data-step'));
            /* Going back is always allowed; going forward past an
             * unanswered required question is not. */
            if (target > stepIndex) {
                var list = activeSteps();
                for (var i = stepIndex; i < target; i++) {
                    var gaps = missingIn(list[i]);
                    if (gaps.length) { goTo(i); markInvalid(gaps); return; }
                }
            }
            goTo(target);
        });

        /* Don't let a half-typed goal leave with the tab. */
        window.addEventListener('beforeunload', function (e) {
            if (!dirty) return;
            e.preventDefault();
            e.returnValue = '';
        });

        if (!window.aisaReady) return;
        window.aisaReady(function (auth) {
            if (!auth) return;

            /* Prefill from the signed-in session so nobody types their own
             * name wrong and lands in the tracker as a second person. */
            var user = auth.getUser && auth.getUser();
            if (user) {
                if (!answers.name)  answers.name  = user.name  || '';
                if (!answers.email) answers.email = user.email || '';
            }

            if (!auth.getSurveyResponse) { render(); return; }

            auth.getSurveyResponse(SURVEY_ID).then(function (r) {
                if (r && r.found) {
                    /* Server wins: it is the record, and it is what
                     * survives a change of device. */
                    adopt(r.data);
                    submitted = r.status === 'submitted';
                    revision  = r.revision || 0;
                    writeLocal();
                }
                render();
                if (submitted) $('resubmit-note').classList.remove('hidden');
            }).catch(function (err) {
                if (err && (err.isSetupProblem || err.message === 'unknown_survey')) {
                    serverReady = false;
                    showAlert(err.userMessage ||
                        'This form is not switched on in the Learning Hub backend yet.', true);
                }
                render();
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
