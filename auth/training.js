/*
 * AISA Training framework.
 *
 * Wraps an existing PD module page in a chapter-by-chapter wizard:
 *   - Hides every section except the current chapter
 *   - Renders a sticky sidebar with chapter navigation
 *   - Adds a top progress bar and bottom Previous/Next nav
 *   - Gates Next behind any .aisa-quiz elements in the current chapter
 *   - Auto-ticks the original .module-checkbox in each section so the
 *     existing completion-tracking machinery in gate.js's wireModule
 *     keeps working without any changes there
 *
 * Module pages opt in by:
 *   - Marking each section with [data-chapter="N"] and [data-chapter-title="..."]
 *   - Calling AisaTraining.init({ moduleId: '...' }) once the DOM is ready
 */
(function () {
    'use strict';

    var initialized = false;
    var config = null;
    var chapters = [];
    var currentIndex = 0;
    var completedSet, unlockedSet;
    var refs = {};

    function $$(sel, root) {
        return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    }

    function init(cfg) {
        if (initialized) return;
        config = cfg || {};
        if (!config.moduleId) {
            console.warn('AisaTraining: init() called without moduleId');
            return;
        }

        var elements = $$('[data-chapter]');
        if (!elements.length) {
            console.warn('AisaTraining: no [data-chapter] sections found');
            return;
        }

        chapters = elements.map(function (el) {
            return {
                idx:   parseInt(el.getAttribute('data-chapter'), 10) - 1,
                id:    el.getAttribute('data-chapter-id') || ('ch' + el.getAttribute('data-chapter')),
                title: el.getAttribute('data-chapter-title') || ('Chapter ' + el.getAttribute('data-chapter')),
                el:    el,
                checkbox: el.querySelector('.module-checkbox'),
                quizzes:  $$('.aisa-quiz', el)
            };
        }).sort(function (a, b) { return a.idx - b.idx; });

        completedSet = new Set();
        unlockedSet  = new Set();
        loadState();
        unlockedSet.add(chapters[0].id);

        buildSidebar();
        buildNav();
        wireQuizzes();
        wireKeyboard();

        document.body.classList.add('aisa-train-managed');
        initialized = true;
        render();
    }

    /* Power-user navigation: Left/Right arrows move between chapters,
     * respecting the same quiz gate as the Next button. Ignored while
     * typing in a field so it never fights form input. */
    function wireKeyboard() {
        document.addEventListener('keydown', function (e) {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            var t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
                      t.tagName === 'SELECT' || t.isContentEditable)) return;
            if (e.key === 'ArrowRight') {
                if (!refs.btnNext || refs.btnNext.disabled) return;
                e.preventDefault();
                goNext();
            } else if (e.key === 'ArrowLeft') {
                if (!refs.btnPrev || refs.btnPrev.disabled) return;
                e.preventDefault();
                goPrev();
            }
        });
    }

    /* -------- state -------- */

    function storageKey() {
        return 'aisa_training_' + config.moduleId;
    }

    function loadState() {
        try {
            var saved = JSON.parse(localStorage.getItem(storageKey()) || '{}');
            if (Array.isArray(saved.completed)) saved.completed.forEach(function (id) { completedSet.add(id); });
            if (Array.isArray(saved.unlocked))  saved.unlocked.forEach(function (id)  { unlockedSet.add(id); });
            if (Array.isArray(saved.quizPassed)) {
                /* Restore quiz-passed flags so a refresh doesn't force
                 * the user to re-answer everything they've already done. */
                saved.quizPassed.forEach(function (quizKey) {
                    /* quizKey format: "chapterId/quizIndex" */
                    var parts = quizKey.split('/');
                    var chap = chapters.find(function (c) { return c.id === parts[0]; });
                    if (!chap) return;
                    var q = chap.quizzes[parseInt(parts[1], 10)];
                    if (q) q.dataset.passed = 'true';
                });
            }
            if (typeof saved.currentIndex === 'number') {
                currentIndex = Math.max(0, Math.min(saved.currentIndex, chapters.length - 1));
            }
        } catch (e) {}
    }

    function saveState() {
        try {
            var quizPassed = [];
            chapters.forEach(function (c) {
                c.quizzes.forEach(function (q, i) {
                    if (q.dataset.passed === 'true') quizPassed.push(c.id + '/' + i);
                });
            });
            localStorage.setItem(storageKey(), JSON.stringify({
                completed:    Array.from(completedSet),
                unlocked:     Array.from(unlockedSet),
                quizPassed:   quizPassed,
                currentIndex: currentIndex
            }));
        } catch (e) {}
    }

    /* -------- UI construction -------- */

    function buildSidebar() {
        /* Wrap the first chapter's container in a layout so we can put
         * the sidebar next to it. We look for the timeline-container
         * the module already uses; falling back to chapter[0]'s parent. */
        var anchor = document.querySelector('.timeline-container') || chapters[0].el.parentNode;
        if (!anchor) return;

        var layout = document.createElement('div');
        layout.className = 'aisa-train-layout';

        var sidebar = document.createElement('aside');
        sidebar.className = 'aisa-train-sidebar';
        sidebar.innerHTML =
            '<div class="aisa-train-sidebar-heading">Chapters</div>' +
            '<ul class="aisa-train-chapter-list"></ul>';

        var main = document.createElement('div');
        main.className = 'aisa-train-main';

        /* Top progress bar lives inside main so it scrolls with content
         * but stays above all chapters. */
        var topbar = document.createElement('div');
        topbar.className = 'aisa-train-topbar';
        topbar.innerHTML =
            '<span class="aisa-train-topbar-label">Progress</span>' +
            '<div class="aisa-train-topbar-bar"><div class="aisa-train-topbar-bar-fill"></div></div>' +
            '<span class="aisa-train-topbar-text">0%</span>';
        main.appendChild(topbar);

        /* Move anchor (timeline-container) into main */
        anchor.parentNode.insertBefore(layout, anchor);
        layout.appendChild(sidebar);
        layout.appendChild(main);
        main.appendChild(anchor);

        /* The module's own content wrapper is usually a narrow, centered
         * column (e.g. Tailwind's max-w-5xl mx-auto). Tag it so our CSS
         * can widen it and pull the sidebar toward the page's left gutter
         * instead of leaving dead space on the left. */
        if (layout.parentNode && layout.parentNode.classList) {
            layout.parentNode.classList.add('aisa-train-widthhost');
        }

        refs.sidebarList   = sidebar.querySelector('.aisa-train-chapter-list');
        refs.progressFill  = topbar.querySelector('.aisa-train-topbar-bar-fill');
        refs.progressText  = topbar.querySelector('.aisa-train-topbar-text');
        refs.main          = main;
        refs.layout        = layout;

        chapters.forEach(function (c, i) {
            var li = document.createElement('li');
            li.className = 'aisa-train-chapter-item';
            li.setAttribute('data-chapter-id', c.id);
            /* Two visuals live in the same slot — the chapter number
             * (default) and a checkmark SVG (revealed when the item
             * gains the .done class). CSS handles the swap so we
             * don't need to re-render the DOM on completion. */
            li.innerHTML =
                '<span class="aisa-train-chapter-marker" aria-hidden="true">' +
                    '<span class="aisa-train-chapter-num">' + (i + 1) + '</span>' +
                    '<svg class="aisa-train-chapter-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
                        '<polyline points="20 6 9 17 4 12"/>' +
                    '</svg>' +
                '</span>' +
                '<span class="aisa-train-chapter-text">' +
                    '<span class="aisa-train-chapter-kicker">Chapter ' + (i + 1) + '</span>' +
                    '<span class="aisa-train-chapter-title">' + escapeHtml(c.title) + '</span>' +
                '</span>';
            li.addEventListener('click', function () { tryGoTo(c.id); });
            refs.sidebarList.appendChild(li);
        });
    }

    function buildNav() {
        /* Look for the existing completion banner so we can keep it as
         * the bottom landmark; the nav sits just before it. */
        var banner = document.getElementById('completion-banner');
        var nav = document.createElement('div');
        nav.className = 'aisa-train-nav';
        nav.innerHTML =
            '<button type="button" class="aisa-train-btn aisa-train-btn-prev" data-action="prev">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
                '<span class="aisa-train-btn-prev-label">Previous</span>' +
            '</button>' +
            '<div class="aisa-train-nav-center">' +
                '<span class="aisa-train-nav-counter"></span>' +
                '<span class="aisa-train-nav-hint"></span>' +
            '</div>' +
            '<button type="button" class="aisa-train-btn primary aisa-train-btn-next" data-action="next">' +
                '<span class="aisa-train-nav-next-label">Next chapter</span>' +
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
            '</button>';

        if (banner && banner.parentNode) {
            banner.parentNode.insertBefore(nav, banner);
        } else {
            refs.main.appendChild(nav);
        }

        refs.nav        = nav;
        refs.btnPrev    = nav.querySelector('[data-action="prev"]');
        refs.btnNext    = nav.querySelector('[data-action="next"]');
        refs.navHint    = nav.querySelector('.aisa-train-nav-hint');
        refs.navCounter = nav.querySelector('.aisa-train-nav-counter');
        refs.nextLabel  = nav.querySelector('.aisa-train-nav-next-label');

        refs.btnPrev.addEventListener('click', goPrev);
        refs.btnNext.addEventListener('click', goNext);
    }

    /* Randomise the answer order so the correct option isn't always in the
     * same slot (modules tend to be authored with the correct answer as B).
     * Correctness lives on each option's data-correct attribute, so simply
     * reordering the DOM is safe; we then relabel any A/B/C/D badge to match
     * the new order. */
    function shuffleQuizOptions(quiz) {
        var options = $$('.aisa-quiz-option', quiz);
        if (options.length < 2) return;
        var parent = options[0].parentNode;
        if (!options.every(function (o) { return o.parentNode === parent; })) return;
        for (var i = options.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = options[i]; options[i] = options[j]; options[j] = t;
        }
        var letters = 'ABCDEFGH';
        options.forEach(function (opt, idx) {
            parent.appendChild(opt);                 // re-append in shuffled order
            var spans = opt.querySelectorAll('span');
            for (var k = 0; k < spans.length; k++) { // relabel the first A–H badge
                if (/^[A-H]$/.test((spans[k].textContent || '').trim())) {
                    spans[k].textContent = letters[idx];
                    break;
                }
            }
        });
    }

    function wireQuizzes() {
        chapters.forEach(function (chap) {
            chap.quizzes.forEach(function (quiz) {
                shuffleQuizOptions(quiz);
                var feedback = quiz.querySelector('.aisa-quiz-feedback');
                var options  = $$('.aisa-quiz-option', quiz);
                options.forEach(function (opt) {
                    opt.addEventListener('click', function () {
                        if (quiz.dataset.passed === 'true') return;
                        var correct = opt.getAttribute('data-correct') === 'true';
                        if (correct) {
                            opt.classList.add('is-correct');
                            options.forEach(function (o) { o.classList.add('aisa-quiz-locked'); });
                            quiz.dataset.passed = 'true';
                            if (feedback) {
                                feedback.classList.remove('wrong');
                                feedback.classList.add('correct', 'show');
                                feedback.innerHTML = (feedback.getAttribute('data-correct-msg')
                                    || '<strong>Correct!</strong> You can now move on.');
                            }
                            saveState();
                            updateNavState();
                        } else {
                            opt.classList.add('is-incorrect');
                            opt.classList.add('aisa-quiz-locked');
                            if (feedback) {
                                feedback.classList.remove('correct');
                                feedback.classList.add('wrong', 'show');
                                feedback.innerHTML = (feedback.getAttribute('data-wrong-msg')
                                    || '<strong>Not quite.</strong> Re-read the section above and try a different answer.');
                            }
                        }
                    });
                });
            });
        });
    }

    /* -------- rendering & navigation -------- */

    function isChapterReady(chap) {
        /* "Ready" = the Next button should be enabled. Chapters with
         * no quiz are always ready; chapters with quizzes need all of
         * them passed first. Once a chapter has been marked complete
         * (the user has already moved past it once) it stays ready
         * even if quiz state was reset. */
        if (completedSet.has(chap.id)) return true;
        if (!chap.quizzes.length) return true;
        for (var i = 0; i < chap.quizzes.length; i++) {
            if (chap.quizzes[i].dataset.passed !== 'true') return false;
        }
        return true;
    }

    function render(scroll) {
        chapters.forEach(function (c, i) {
            c.el.classList.toggle('aisa-current', i === currentIndex);
        });
        updateSidebar();
        updateNavState();
        updateProgress();
        if (scroll) scrollToContent();
    }

    /* Scroll so the start of the current chapter sits just below the
     * sticky page nav — not the very top of the page, which would show
     * the module header again on every Next. */
    function scrollToContent() {
        var target = refs.layout;
        if (!target) return;
        var y = target.getBoundingClientRect().top + window.pageYOffset - 80;
        if (y < 0) y = 0;
        try { window.scrollTo({ top: y, behavior: 'smooth' }); }
        catch (e) { window.scrollTo(0, y); }
    }

    function updateSidebar() {
        if (!refs.sidebarList) return;
        chapters.forEach(function (c, i) {
            var li = refs.sidebarList.querySelector('[data-chapter-id="' + c.id + '"]');
            if (!li) return;
            li.classList.toggle('current', i === currentIndex);
            li.classList.toggle('done',    completedSet.has(c.id));
            li.classList.toggle('locked',  !(unlockedSet.has(c.id) || completedSet.has(c.id)));
        });
    }

    function updateProgress() {
        var doneCount = 0;
        chapters.forEach(function (c) { if (completedSet.has(c.id)) doneCount++; });
        var pct = chapters.length ? Math.round((doneCount / chapters.length) * 100) : 0;
        if (refs.progressFill) refs.progressFill.style.width = pct + '%';
        if (refs.progressText) refs.progressText.textContent = pct + '%';
    }

    function updateNavState() {
        if (!refs.btnNext) return;
        var chap   = chapters[currentIndex];
        var isLast = currentIndex === chapters.length - 1;
        var canAdvance = isChapterReady(chap);

        refs.btnPrev.disabled  = currentIndex === 0;
        refs.btnNext.disabled  = !canAdvance;
        refs.nextLabel.textContent = isLast ? 'Finish training' : 'Next chapter';

        /* Center area shows the locator by default, and swaps to the
         * gate reason (in amber) when Next is blocked by a quiz. */
        if (refs.navCounter) {
            refs.navCounter.textContent = 'Chapter ' + (currentIndex + 1) + ' of ' + chapters.length;
        }
        var gated = !canAdvance && chap.quizzes.length;
        if (refs.navHint) {
            refs.navHint.textContent = gated ? 'Answer the knowledge check to continue' : '';
        }
        if (refs.nav) {
            refs.nav.classList.toggle('is-gated', !!gated);
        }

        /* When Next flips from blocked to available (e.g. the user just
         * answered the quiz correctly), pulse it once to pull the eye. */
        if (canAdvance && refs.btnNext.dataset.wasBlocked === '1') {
            refs.btnNext.classList.remove('aisa-train-pulse');
            /* reflow so the animation can re-trigger */
            void refs.btnNext.offsetWidth;
            refs.btnNext.classList.add('aisa-train-pulse');
        }
        refs.btnNext.dataset.wasBlocked = canAdvance ? '0' : '1';
    }

    function tryGoTo(id) {
        var chap = chapters.find(function (c) { return c.id === id; });
        if (!chap) return;
        var idx = chapters.indexOf(chap);
        /* Allow jumping to any chapter that's already unlocked or
         * completed. Locked chapters are gated by the Next button. */
        if (!unlockedSet.has(chap.id) && !completedSet.has(chap.id)) return;
        currentIndex = idx;
        saveState();
        render(true);
    }

    function goPrev() {
        if (currentIndex === 0) return;
        currentIndex--;
        saveState();
        render(true);
    }

    function goNext() {
        var chap = chapters[currentIndex];
        if (!isChapterReady(chap)) return;

        var isLast = currentIndex === chapters.length - 1;
        completedSet.add(chap.id);

        /* Auto-tick the section's hidden checkbox so the existing
         * wireModule + updateProgress machinery records the completion
         * and shows the celebration on the final chapter. We only fire
         * it the first time to avoid spamming the change handler. */
        if (chap.checkbox && !chap.checkbox.checked) {
            chap.checkbox.checked = true;
            chap.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (!isLast) {
            currentIndex++;
            unlockedSet.add(chapters[currentIndex].id);
        }
        saveState();
        render(true);

        /* "Finish training" on the last chapter: always surface the
         * certificate + path back to the module list, even on a revisit
         * where the backend completion event won't re-fire. (On a fresh
         * completion, gate.js also fires the event, but the modal guards
         * against showing twice.) */
        if (isLast && window.AisaCertificate && typeof window.AisaCertificate.celebrate === 'function') {
            window.AisaCertificate.celebrate();
        }
    }

    /* -------- utilities -------- */

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    window.AisaTraining = { init: init };
})();
