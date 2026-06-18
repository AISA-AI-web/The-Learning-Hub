/*
 * AISA Learning Hub — per-section dwell-time tracker.
 *
 * Auto-loaded by auth/gate.js. Activates on any page that declares a PD
 * module — i.e. has a #completion-banner — and watches every chapter
 * boundary (anything with a data-chapter / data-chapter-title attribute,
 * already on all six modules). It accumulates the time the chapter was
 * the most-visible block on screen, only counting "engaged" seconds:
 *
 *   • Tab must be visible (visibilityState === 'visible'),
 *   • User must not be idle (no mouse/key/touch input for >60s pauses
 *     the timer; the next input resumes it),
 *   • One chapter is "active" at a time — the one with the largest
 *     viewport intersection — and only that chapter accumulates time.
 *
 * Pending counts are flushed every 30s, on visibilitychange→hidden, and
 * on beforeunload (via sendBeacon so the data survives the navigation).
 * Between flushes the per-chapter totals live in localStorage so a hard
 * tab close still loses no more than one tick of data.
 *
 * The backend stores one row per (module, chapter) per flush in the
 * `dwell` sheet; the admin dashboard aggregates these rows into a per-
 * person breakdown ("chapter 3 took Jane 4m 12s; took Ahmed 14s — that
 * looks like skim-and-skip"). For per-person analytics — not graded.
 */
(function () {
    'use strict';

    /* Idle threshold: no input for this many ms pauses the timer. */
    var IDLE_MS         = 60 * 1000;
    /* Tick once a second — one in-memory increment to the active chapter. */
    var TICK_MS         = 1000;
    /* Background flush cadence — send pending dwell to backend. */
    var FLUSH_MS        = 30 * 1000;
    /* Minimum total seconds for a chapter before it's worth a network round-trip. */
    var FLUSH_MIN_SECS  = 5;
    /* Cap any single payload so a stuck page can't spam giant rows. */
    var MAX_SECS_PER_FLUSH = 60 * 60;

    function isPdModule() {
        return !!document.getElementById('completion-banner');
    }

    /* Filename → module id, matching the IDs used in dashboard.html
     * and the rest of the Hub: "ai-ethics-module.html" → "ai-ethics",
     * "return-to-school.html" → "return-to-school", etc. */
    function inferModuleId() {
        try {
            var leaf = (location.pathname || '').split('/').pop() || '';
            leaf = decodeURIComponent(leaf).replace(/\.html?$/i, '');
            leaf = leaf.replace(/-module$/i, '');
            return leaf || '';
        } catch (e) { return ''; }
    }

    function getChapters() {
        var nodes = document.querySelectorAll('[data-chapter-title]');
        var out = [];
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var num = String(el.getAttribute('data-chapter') || (i + 1));
            var title = String(el.getAttribute('data-chapter-title') || ('Chapter ' + num)).trim();
            /* Stable key: "1:The Case for AI Governance". Order is preserved on
             * the backend so chapters always sort by their declared number. */
            var key = num + ':' + title;
            out.push({ el: el, key: key, num: num, title: title });
        }
        return out;
    }

    /* localStorage helpers — namespaced per module so multiple tabs on
     * different modules don't fight over the same key. */
    function storageKey(moduleId) { return 'aisa_dwell_v1::' + moduleId; }
    function loadPending(moduleId) {
        try {
            var raw = localStorage.getItem(storageKey(moduleId));
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }
    function savePending(moduleId, data) {
        try { localStorage.setItem(storageKey(moduleId), JSON.stringify(data)); }
        catch (e) { /* quota / disabled — fail quietly, in-memory still works */ }
    }
    function clearPending(moduleId) {
        try { localStorage.removeItem(storageKey(moduleId)); } catch (e) { /* noop */ }
    }

    function start() {
        if (!isPdModule()) return;
        var chapters = getChapters();
        if (!chapters.length) return;

        var moduleId = inferModuleId();
        if (!moduleId) return;

        /* In-memory per-chapter seconds, hydrated from any pending counts
         * that didn't make it to the backend on the last visit. */
        var totals = loadPending(moduleId);
        chapters.forEach(function (c) { if (!(c.key in totals)) totals[c.key] = 0; });

        /* Title cache — preserved alongside seconds so the flush can send
         * the human-readable title even if the user navigated away from the
         * page that declared it. */
        var titles = {};
        chapters.forEach(function (c) { titles[c.key] = c.title; });

        /* Track which keys have changed since the last flush. */
        var dirty = {};

        var activeKey = null;
        var lastVisibleAt = Date.now();
        var idle = false;
        var pageVisible = (document.visibilityState !== 'hidden');

        /* IntersectionObserver: each chapter reports its visible ratio;
         * we pick the largest one as "active". A small hysteresis (10% over
         * the runner-up) prevents flicker when two chapters are similarly
         * visible at the boundary. */
        var visibility = {};
        chapters.forEach(function (c) { visibility[c.key] = 0; });

        function recomputeActive() {
            var bestKey = null, bestRatio = 0;
            chapters.forEach(function (c) {
                if (visibility[c.key] > bestRatio) {
                    bestRatio = visibility[c.key];
                    bestKey = c.key;
                }
            });
            if (bestRatio < 0.05) { activeKey = null; return; }
            if (!activeKey) { activeKey = bestKey; return; }
            if (bestKey === activeKey) return;
            /* Hysteresis: only switch if the new one is clearly more visible. */
            if (bestRatio > visibility[activeKey] + 0.10) activeKey = bestKey;
        }

        var io = null;
        try {
            io = new IntersectionObserver(function (entries) {
                entries.forEach(function (ent) {
                    var key = ent.target.getAttribute('data-chapter-title') || '';
                    /* Match the same composite key we built above. */
                    var num = String(ent.target.getAttribute('data-chapter') || '');
                    var k = num + ':' + (key.trim());
                    visibility[k] = ent.intersectionRatio || 0;
                });
                recomputeActive();
            }, {
                /* Sample at several ratios so we know when a chapter takes
                 * over the viewport vs. only peeks in. */
                threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0]
            });
            chapters.forEach(function (c) { io.observe(c.el); });
        } catch (e) {
            /* IntersectionObserver unsupported — fall back to "first chapter
             * is active" so we still get something coarse. */
            if (chapters.length) activeKey = chapters[0].key;
        }

        /* Idle tracking — any input resets the timer; if more than IDLE_MS
         * passes with no input we pause counting. */
        function bump() {
            lastVisibleAt = Date.now();
            idle = false;
        }
        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'].forEach(function (ev) {
            window.addEventListener(ev, bump, { passive: true });
        });

        document.addEventListener('visibilitychange', function () {
            pageVisible = (document.visibilityState !== 'hidden');
            if (pageVisible) bump();
            else flush(true /* synchronous-ish via sendBeacon */);
        });

        /* Tick loop: each second, if we're active and the user is engaged,
         * add one second to the active chapter. */
        var tick = setInterval(function () {
            if (!pageVisible) return;
            if (Date.now() - lastVisibleAt > IDLE_MS) { idle = true; return; }
            if (idle) return;
            if (!activeKey) return;
            totals[activeKey] = (totals[activeKey] || 0) + 1;
            dirty[activeKey] = true;
            /* Persist immediately so a tab crash loses at most ~1s. */
            savePending(moduleId, totals);
        }, TICK_MS);

        /* Network flush — sends the FULL current chapter map (not a delta).
         * The backend aggregates client-side per-chapter totals into a
         * single per-module row (total_seconds, chapters_seen, avg), so
         * we need the complete snapshot each flush to avoid double-counting
         * across flushes. Skipped entirely when nothing has changed since
         * the previous successful send. */
        function flush(useBeacon) {
            if (!Object.keys(dirty).length) return;

            var payload = [];
            Object.keys(totals).forEach(function (k) {
                var secs = Math.min(totals[k] || 0, MAX_SECS_PER_FLUSH);
                if (secs <= 0) return;
                var parts = k.split(':');
                var num = parts[0];
                var title = titles[k] || k;
                payload.push({ chapter: num, title: title, seconds: secs });
            });

            /* Require at least one chapter to clear the per-flush noise
             * floor, otherwise it's just open-the-page-and-close noise. */
            var anyAboveFloor = payload.some(function (c) { return c.seconds >= FLUSH_MIN_SECS; });
            if (!payload.length || !anyAboveFloor) return;

            /* Clear dirty flags optimistically — losing a flush to the
             * network just means the next flush re-sends the same absolute
             * totals (idempotent on the backend). */
            dirty = {};

            if (window.aisaAuth && window.aisaAuth.recordDwell) {
                window.aisaAuth.recordDwell(moduleId, payload, { beacon: !!useBeacon });
            }

            /* Keep the local pending blob in sync so a tab crash before
             * the next flush doesn't lose what's already on the server. */
            savePending(moduleId, totals);
        }

        var flushTimer = setInterval(function () { flush(false); }, FLUSH_MS);

        window.addEventListener('beforeunload', function () { flush(true); });
        /* Modern Safari: pagehide fires when bfcache stashes the tab. */
        window.addEventListener('pagehide', function () { flush(true); });

        /* Public-ish hook for inspection / debugging from the console. */
        window.__aisaDwell = {
            moduleId: moduleId,
            totals: totals,
            chapters: chapters,
            flush: flush,
            stop: function () {
                clearInterval(tick);
                clearInterval(flushTimer);
                if (io) io.disconnect();
            }
        };
    }

    /* Wait for the auth gate to resolve so we can call recordDwell with a
     * valid session token; degrade silently if no gate is on the page. */
    if (typeof window.aisaReady === 'function') {
        window.aisaReady(function () {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', start);
            } else {
                start();
            }
        });
    }
})();
