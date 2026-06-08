/*
 * AISA Learning Hub — first-login onboarding.
 *
 * Loaded automatically by auth/gate.js once the user is signed in.
 * Two pieces of UI, both gated on completion data the backend already
 * tracks for PD modules:
 *
 *   1. Tutorial modal (4 slides). Records the synthetic "module"
 *      tutorial as completed when the user reaches the final slide
 *      and clicks "Got it". Dismissible via the X — dismissal does
 *      not record the event, so it reappears next page load until
 *      they actually click through.
 *
 *   2. Survey gate (full-screen overlay). Shows when the user has
 *      not yet self-attested to completing the anonymous AI &
 *      Innovation survey. Two actions: "Take the survey" opens the
 *      Google Form in a new tab without dismissing the gate; "I've
 *      already completed it" records the synthetic "module" survey
 *      and unlocks the site.
 *
 * Both events are stored via the existing recordEvent pipeline so
 * the admin can see who's done each in the same sheet as PD module
 * completions. The survey itself is still anonymous — we only know
 * who clicked the self-attestation button, not their answers.
 */
(function () {
    'use strict';

    var SURVEY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScMbNJ1xK6-63sCTpkAN8C6cXKirHGsXwj5furPuzTqS9j7Fw/viewform?usp=header';

    /* Use the same module-id convention everywhere so the backend
     * treats these as system events. recordEvent / getCompletions
     * don't care what the id is. */
    var TUTORIAL_ID = 'tutorial';
    var SURVEY_ID   = 'survey';

    var stylesInjected = false;
    var shownThisLoad  = false;

    /* -------------------- styles -------------------- */

    function injectStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        var style = document.createElement('style');
        style.id = 'aisa-onb-style';
        style.textContent = [
            /* shared overlay base */
            '.aisa-onb-overlay{position:fixed;inset:0;display:flex;align-items:center;',
            'justify-content:center;padding:1rem;font-family:Inter,system-ui,-apple-system,',
            'Segoe UI,Roboto,sans-serif;color:#0f172a;}',
            '.aisa-onb-overlay.aisa-onb-blur{background:rgba(15,23,42,0.72);',
            '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}',
            '#aisa-onb-tutorial{z-index:2147483630;}',
            '#aisa-onb-survey{z-index:2147483640;background:linear-gradient(135deg,#0c4a6e 0%,#1e3a8a 50%,#312e81 100%);}',

            /* card */
            '.aisa-onb-card{background:#fff;width:100%;max-width:540px;border-radius:1.25rem;',
            'box-shadow:0 25px 50px -12px rgba(0,0,0,.45);padding:2.25rem 2rem 1.75rem;',
            'position:relative;animation:aisa-onb-pop .4s cubic-bezier(.22,1,.36,1) both;}',
            '@keyframes aisa-onb-pop{from{opacity:0;transform:translateY(12px) scale(.98)}',
            'to{opacity:1;transform:translateY(0) scale(1)}}',

            /* close button */
            '.aisa-onb-close{position:absolute;top:.75rem;right:.75rem;background:transparent;',
            'border:none;cursor:pointer;color:#94a3b8;font-size:1.5rem;line-height:1;width:2rem;',
            'height:2rem;display:flex;align-items:center;justify-content:center;border-radius:.5rem;',
            'transition:background .15s,color .15s;}',
            '.aisa-onb-close:hover{background:#f1f5f9;color:#0f172a;}',

            /* content */
            '.aisa-onb-emoji{font-size:2.75rem;line-height:1;margin-bottom:.5rem;}',
            '.aisa-onb-step{font-size:.7rem;font-weight:800;letter-spacing:.12em;',
            'text-transform:uppercase;color:#64748b;margin-bottom:.25rem;}',
            '.aisa-onb-title{margin:.25rem 0 .75rem;font-size:1.5rem;font-weight:800;',
            'letter-spacing:-.01em;line-height:1.2;color:#0f172a;}',
            '.aisa-onb-body{margin:0 0 1.5rem;color:#475569;font-size:1rem;line-height:1.55;}',
            '.aisa-onb-body strong{color:#0f172a;}',
            '.aisa-onb-foot{margin:1rem 0 0;font-size:.78rem;color:#94a3b8;line-height:1.5;}',

            /* dot pager */
            '.aisa-onb-dots{display:flex;gap:.4rem;justify-content:center;margin-bottom:1.25rem;}',
            '.aisa-onb-dot{width:.5rem;height:.5rem;border-radius:50%;background:#e2e8f0;',
            'transition:background .2s,width .2s;}',
            '.aisa-onb-dot.current{background:#0f172a;width:1.5rem;border-radius:9999px;}',

            /* actions */
            '.aisa-onb-actions{display:flex;justify-content:space-between;align-items:center;gap:.75rem;}',
            '.aisa-onb-actions-stacked{flex-direction:column;align-items:stretch;}',
            '.aisa-onb-btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;',
            'padding:.7rem 1.25rem;font-size:.95rem;font-weight:700;border-radius:.6rem;',
            'border:1px solid transparent;cursor:pointer;transition:all .15s;',
            'font-family:inherit;text-decoration:none;}',
            '.aisa-onb-btn-primary{background:#0f172a;color:#fff;border-color:#0f172a;}',
            '.aisa-onb-btn-primary:hover{background:#1e293b;transform:translateY(-1px);}',
            '.aisa-onb-btn-secondary{background:#fff;color:#0f172a;border-color:#e2e8f0;}',
            '.aisa-onb-btn-secondary:hover:not(:disabled){background:#f8fafc;}',
            '.aisa-onb-btn-link{background:transparent;color:#475569;border-color:transparent;',
            'text-decoration:underline;text-underline-offset:3px;}',
            '.aisa-onb-btn-link:hover{color:#0f172a;}',
            '.aisa-onb-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}',

            /* survey gate sits on its own gradient background — make the */
            /* card a little larger and dim the page behind it more. */
            '#aisa-onb-survey .aisa-onb-card{max-width:480px;text-align:center;}',
            '#aisa-onb-survey .aisa-onb-emoji{font-size:3rem;}',

            /* small screens */
            '@media (max-width:480px){',
            '.aisa-onb-card{padding:1.5rem 1.25rem;}',
            '.aisa-onb-title{font-size:1.25rem;}',
            '.aisa-onb-actions{flex-direction:column-reverse;align-items:stretch;}',
            '.aisa-onb-actions .aisa-onb-btn{width:100%;}',
            '}'
        ].join('');
        document.head.appendChild(style);
    }

    /* -------------------- tutorial -------------------- */

    function tutorialSlides(firstName) {
        var hello = firstName ? 'Welcome, ' + escapeHtml(firstName) + '!' : 'Welcome to the Learning Hub';
        return [
            {
                emoji: '\u{1F44B}',
                title: hello,
                body:  'The Learning Hub is AISA’s central place for PD modules, library resources, orientation materials, and weekly updates. Here’s a 30-second tour before you dive in.'
            },
            {
                emoji: '\u{1F4DA}',
                title: 'PD Modules are step-by-step',
                body:  'Each module is a short, structured training. Newer ones are chapter-by-chapter with knowledge checks. Your progress saves automatically as you go.'
            },
            {
                emoji: '✅',
                title: 'Your progress is tracked',
                body:  'Completions are recorded against your AISA account, so you can pick up where you left off on any device. The admin dashboard can see <strong>which modules</strong> you’ve finished, not what you wrote in any text box.'
            },
            {
                emoji: '\u{1F4DD}',
                title: 'One thing before you start',
                body:  'To access the rest of the site, you’ll need to complete the <strong>AI &amp; Innovation Survey</strong> — it’s fully anonymous, takes about 2 minutes, and shapes next year’s PD plan. We’ll ask you to confirm right after this tutorial.'
            }
        ];
    }

    function showTutorial(firstName, onFinish) {
        injectStyles();
        var slides  = tutorialSlides(firstName);
        var current = 0;

        var overlay = document.createElement('div');
        overlay.id        = 'aisa-onb-tutorial';
        overlay.className = 'aisa-onb-overlay aisa-onb-blur';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Welcome tour');
        overlay.innerHTML =
            '<div class="aisa-onb-card">' +
                '<button class="aisa-onb-close" type="button" aria-label="Close">&times;</button>' +
                '<div class="aisa-onb-emoji" aria-hidden="true"></div>' +
                '<div class="aisa-onb-step"></div>' +
                '<h2 class="aisa-onb-title"></h2>' +
                '<p class="aisa-onb-body"></p>' +
                '<div class="aisa-onb-dots" aria-hidden="true"></div>' +
                '<div class="aisa-onb-actions">' +
                    '<button class="aisa-onb-btn aisa-onb-btn-secondary" type="button" data-action="prev">Previous</button>' +
                    '<button class="aisa-onb-btn aisa-onb-btn-primary" type="button" data-action="next">Next</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var emoji   = overlay.querySelector('.aisa-onb-emoji');
        var step    = overlay.querySelector('.aisa-onb-step');
        var title   = overlay.querySelector('.aisa-onb-title');
        var body    = overlay.querySelector('.aisa-onb-body');
        var dots    = overlay.querySelector('.aisa-onb-dots');
        var btnPrev = overlay.querySelector('[data-action="prev"]');
        var btnNext = overlay.querySelector('[data-action="next"]');
        var btnX    = overlay.querySelector('.aisa-onb-close');

        for (var i = 0; i < slides.length; i++) {
            var dot = document.createElement('span');
            dot.className = 'aisa-onb-dot';
            dots.appendChild(dot);
        }

        function render() {
            var slide = slides[current];
            emoji.textContent = slide.emoji;
            step.textContent  = 'Step ' + (current + 1) + ' of ' + slides.length;
            title.textContent = slide.title;
            body.innerHTML    = slide.body;
            btnPrev.disabled  = current === 0;
            btnNext.textContent = current === slides.length - 1 ? "Got it — let's go" : 'Next';
            var dotEls = dots.querySelectorAll('.aisa-onb-dot');
            for (var i = 0; i < dotEls.length; i++) {
                dotEls[i].classList.toggle('current', i === current);
            }
        }

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }

        function finishAndRecord() {
            close();
            if (window.aisaAuth && window.aisaAuth.isConfigured()) {
                window.aisaAuth.recordEvent(TUTORIAL_ID, 'completed', 100, 'v1').catch(function (err) {
                    console.warn('AISA: could not record tutorial completion', err);
                });
            }
            if (typeof onFinish === 'function') onFinish(true);
        }

        function softDismiss() {
            /* Don't record completion. Next page load will show it
             * again until the user actually clicks through. We still
             * fire onFinish(false) so the survey gate (if needed)
             * can decide what to do. */
            close();
            if (typeof onFinish === 'function') onFinish(false);
        }

        btnPrev.addEventListener('click', function () {
            if (current > 0) { current--; render(); }
        });
        btnNext.addEventListener('click', function () {
            if (current < slides.length - 1) {
                current++;
                render();
            } else {
                finishAndRecord();
            }
        });
        btnX.addEventListener('click', softDismiss);

        render();
    }

    /* -------------------- survey gate -------------------- */

    function showSurveyGate() {
        injectStyles();
        var overlay = document.createElement('div');
        overlay.id        = 'aisa-onb-survey';
        overlay.className = 'aisa-onb-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Survey required');
        overlay.innerHTML =
            '<div class="aisa-onb-card">' +
                '<div class="aisa-onb-emoji" aria-hidden="true">\u{1F4DD}</div>' +
                '<h2 class="aisa-onb-title">One step before you continue</h2>' +
                '<p class="aisa-onb-body">' +
                    'To access the Learning Hub, please complete the <strong>AI &amp; Innovation Survey</strong>. ' +
                    'It’s a <strong>2-minute anonymous form</strong> — no name field, no rating of your teaching — ' +
                    'and the results feed next year’s AI &amp; Innovation plan.' +
                '</p>' +
                '<div class="aisa-onb-actions aisa-onb-actions-stacked">' +
                    '<a class="aisa-onb-btn aisa-onb-btn-primary" target="_blank" rel="noopener noreferrer" data-action="take">' +
                        'Take the survey →' +
                    '</a>' +
                    '<button class="aisa-onb-btn aisa-onb-btn-link" type="button" data-action="done">' +
                        'I’ve already completed it' +
                    '</button>' +
                '</div>' +
                '<p class="aisa-onb-foot">' +
                    'After submitting the form in the new tab, come back to this window and click ' +
                    '“I’ve already completed it” to continue.' +
                '</p>' +
            '</div>';
        document.body.appendChild(overlay);

        overlay.querySelector('[data-action="take"]').href = SURVEY_URL;
        var doneBtn = overlay.querySelector('[data-action="done"]');
        doneBtn.addEventListener('click', function () {
            if (!window.aisaAuth || !window.aisaAuth.isConfigured()) {
                /* No backend — best we can do is close locally. */
                close();
                return;
            }
            doneBtn.disabled = true;
            doneBtn.textContent = 'Saving…';
            window.aisaAuth.recordEvent(SURVEY_ID, 'completed', 100, 'v1').then(function () {
                close();
            }).catch(function (err) {
                console.warn('AISA: could not record survey completion', err);
                doneBtn.disabled = false;
                doneBtn.textContent = 'I’ve already completed it';
                alert('Could not save right now. Please try again in a moment.');
            });
        });

        /* Lock body scroll while the gate is up so the user can't peek
         * past it. Restored on close. */
        var prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.body.style.overflow = prevOverflow;
        }
    }

    /* -------------------- decision logic -------------------- */

    function decide(completions, firstName) {
        if (shownThisLoad) return;
        var tutDone = completions.some(function (c) { return c.module_id === TUTORIAL_ID; });
        var surDone = completions.some(function (c) { return c.module_id === SURVEY_ID; });

        if (!tutDone) {
            shownThisLoad = true;
            showTutorial(firstName, function () {
                /* After tutorial (whether completed or dismissed), show
                 * the survey gate if it's still outstanding. */
                if (!surDone) showSurveyGate();
            });
        } else if (!surDone) {
            shownThisLoad = true;
            showSurveyGate();
        }
    }

    function maybeRun() {
        var auth = window.aisaAuth;
        if (!auth || !auth.isConfigured()) return;

        var user = auth.getUser();
        var firstName = '';
        if (user && user.name) firstName = String(user.name).trim().split(/\s+/)[0];

        /* Use the cached completions for an instant decision (so the
         * tutorial doesn't appear after a one-second delay), then
         * refresh from the server in the background to catch the case
         * where the user completed it on another device. */
        var cached = auth.getCompletionsCached();
        if (cached) decide(cached, firstName);

        auth.getCompletions().then(function (items) {
            decide(items || [], firstName);
        }).catch(function (err) {
            console.warn('AISA: could not check onboarding state', err);
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /* Wait for auth via the helper gate.js exposes, then run. */
    if (typeof window.aisaReady === 'function') {
        window.aisaReady(function () { maybeRun(); });
    } else {
        console.warn('AISA: onboarding.js loaded without gate.js — skipping');
    }
})();
