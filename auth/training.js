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

        document.body.classList.add('aisa-train-managed');
        initialized = true;
        render();
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

        refs.sidebarList   = sidebar.querySelector('.aisa-train-chapter-list');
        refs.progressFill  = topbar.querySelector('.aisa-train-topbar-bar-fill');
        refs.progressText  = topbar.querySelector('.aisa-train-topbar-text');
        refs.main          = main;

        chapters.forEach(function (c, i) {
            var li = document.createElement('li');
            li.className = 'aisa-train-chapter-item';
            li.setAttribute('data-chapter-id', c.id);
            li.innerHTML =
                '<span class="aisa-train-chapter-num">' + (i + 1) + '</span>' +
                '<span class="aisa-train-chapter-title">' + escapeHtml(c.title) + '</span>';
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
            '<button type="button" class="aisa-train-btn" data-action="prev">' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>' +
                'Previous' +
            '</button>' +
            '<span class="aisa-train-nav-hint"></span>' +
            '<button type="button" class="aisa-train-btn primary" data-action="next">' +
                '<span class="aisa-train-nav-next-label">Next chapter</span>' +
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' +
            '</button>';

        if (banner && banner.parentNode) {
            banner.parentNode.insertBefore(nav, banner);
        } else {
            refs.main.appendChild(nav);
        }

        refs.btnPrev    = nav.querySelector('[data-action="prev"]');
        refs.btnNext    = nav.querySelector('[data-action="next"]');
        refs.navHint    = nav.querySelector('.aisa-train-nav-hint');
        refs.nextLabel  = nav.querySelector('.aisa-train-nav-next-label');

        refs.btnPrev.addEventListener('click', goPrev);
        refs.btnNext.addEventListener('click', goNext);
    }

    function wireQuizzes() {
        chapters.forEach(function (chap) {
            chap.quizzes.forEach(function (quiz) {
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

    function render() {
        chapters.forEach(function (c, i) {
            c.el.classList.toggle('aisa-current', i === currentIndex);
        });
        updateSidebar();
        updateNavState();
        updateProgress();
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
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

        if (!canAdvance) {
            refs.navHint.textContent = chap.quizzes.length
                ? 'Answer the knowledge check correctly to continue.'
                : '';
        } else {
            refs.navHint.textContent = '';
        }
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
        render();
    }

    function goPrev() {
        if (currentIndex === 0) return;
        currentIndex--;
        saveState();
        render();
    }

    function goNext() {
        var chap = chapters[currentIndex];
        if (!isChapterReady(chap)) return;

        var wasCompleted = completedSet.has(chap.id);
        completedSet.add(chap.id);

        /* Auto-tick the section's hidden checkbox so the existing
         * wireModule + updateProgress machinery records the completion
         * and shows the celebration on the final chapter. We only fire
         * it the first time to avoid spamming the change handler. */
        if (chap.checkbox && !chap.checkbox.checked) {
            chap.checkbox.checked = true;
            chap.checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (currentIndex < chapters.length - 1) {
            currentIndex++;
            unlockedSet.add(chapters[currentIndex].id);
        }
        saveState();
        render();
    }

    /* -------- utilities -------- */

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    window.AisaTraining = { init: init };
})();
