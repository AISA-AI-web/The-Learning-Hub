/*
 * Smoke test for auth/gate.js — run it with:
 *
 *     node tests/gate-smoke.js
 *
 * No dependencies, no test runner, nothing to install. Exits 0 on pass
 * and 1 on failure, so it drops into CI later if the repo ever grows
 * any.
 *
 * WHY THIS EXISTS. gate.js is loaded by all 46 pages and every backend
 * call in the Hub goes through it, so a crash there is a total outage —
 * and it is a file nothing ever executes until a teacher opens a page.
 * On 18 September 2026 the request transport was added below
 * `var existing = readSession()`, which a returning visitor never
 * reaches past: the IIFE takes its early return, so `MAX_INFLIGHT`,
 * `queued` and `IDEMPOTENT_ACTIONS` were hoisted but never assigned, and
 * every request on every page died with "Cannot read properties of
 * undefined (reading 'push')". `node --check` passes that file happily —
 * it is valid syntax. Only running it catches it.
 *
 * What this covers is the returning-visitor path, because that is the
 * one almost every page load takes and the one that broke. It stubs the
 * browser just enough to get there. If a change needs more of the DOM
 * than is stubbed below, add to the stub rather than deleting the test.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GATE = path.join(__dirname, '..', 'auth', 'gate.js');
const STORAGE_KEY = 'aisa_auth_v2';   // must match gate.js

let failures = 0;
function check(name, ok, detail) {
    console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '  -> ' + detail));
    if (!ok) failures++;
}

/* ---------- the smallest browser gate.js will run in ---------- */

function makeElement() {
    const el = {
        style: {}, dataset: {}, children: [], textContent: '', innerHTML: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
        appendChild() {}, removeChild() {}, insertBefore() {}, remove() {},
        addEventListener() {}, removeEventListener() {}, focus() {}, click() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        closest() { return null; }, parentNode: null
    };
    return el;
}

/* A returning signed-in visitor's browser, with a fetch the test controls:
 * every request is recorded, answered from `answers[action]` (default
 * { ok: true }), and held on the wire while `hold[action]` is true. */
function makeBrowser(opts) {
    opts = opts || {};
    const store = Object.assign({}, opts.store || {});
    store[STORAGE_KEY] = JSON.stringify({
        email: 'someone@aisa.sch.ae', name: 'Someone', sessionToken: 'tok-smoke',
        expiresAt: Date.now() + 86400000
    });
    const session = {};
    const fetched = [];          // action names that reached the network
    const injected = [];         // scripts gate.js asked for
    const held = [];             // [action, release()] for held requests
    const answers = opts.answers || {};
    const hold = opts.hold || {};

    function answer(action) {
        const body = answers[action] || { ok: true, people: [], completions: [], is_admin: true };
        return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) };
    }

    const sandbox = {
        console,
        setTimeout, clearTimeout, setInterval, clearInterval,
        Promise, JSON, Date, Math, Object, Array, String, Number, Boolean, RegExp,
        Error, TypeError, isNaN, parseInt, parseFloat,
        encodeURIComponent, decodeURIComponent,
        AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,
        requestAnimationFrame: (f) => setTimeout(f, 0),
        navigator: { userAgent: 'gate-smoke' },
        location: {
            pathname: '/admin-dashboard.html', search: '', hash: '',
            origin: 'https://example.test',
            href: 'https://example.test/admin-dashboard.html',
            reload() {}
        },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        },
        sessionStorage: {
            getItem: (k) => (k in session ? session[k] : null),
            setItem: (k, v) => { session[k] = String(v); },
            removeItem: (k) => { delete session[k]; }
        },
        fetch: (url, opts2) => {
            const action = JSON.parse(opts2.body).action;
            fetched.push(action);
            if (hold[action]) {
                return new Promise((resolve) => { held.push([action, () => resolve(answer(action))]); });
            }
            return Promise.resolve(answer(action));
        }
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.document = {
        currentScript: { src: 'https://example.test/auth/gate.js?v=99' },
        head: {
            appendChild: (node) => { if (node && node.src) injected.push(node.src); }
        },
        body: makeElement(),
        documentElement: makeElement(),
        readyState: 'complete',
        createElement: makeElement,
        getElementById: () => null,
        querySelector: (sel) =>
            (String(sel).indexOf('gate.js') !== -1
                ? { src: 'https://example.test/auth/gate.js?v=99' } : null),
        querySelectorAll: () => [],
        addEventListener() {}
    };

    vm.createContext(sandbox);
    let error = null;
    try {
        vm.runInContext(fs.readFileSync(GATE, 'utf8'), sandbox, { filename: 'gate.js' });
    } catch (e) { error = e; }
    return { sandbox, auth: sandbox.window.aisaAuth, error, fetched, injected, held, store, session };
}

const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

function run() {
    const b = makeBrowser();
    check('gate.js runs without throwing', !b.error, b.error && b.error.message);
    if (b.error) return Promise.resolve();

    const auth = b.auth;
    check('aisaAuth is exposed for a returning visitor', !!auth);
    if (!auth) return Promise.resolve();

    check('helper scripts are injected', b.injected.length > 0,
          'nothing was appended to <head>');
    check('the removed onboarding.js is not requested',
          !b.injected.some((u) => u.indexOf('onboarding.js') !== -1));

    /* The regression itself: the transport state must be live by the
     * time the first automatic request goes out. */
    return auth.adminOverview().then((r) => {
        check('adminOverview resolves', !!(r && r.ok === true));
        check('the automatic pageview reached fetch',
              b.fetched.indexOf('record_pageview') !== -1,
              'got: ' + (b.fetched.join(', ') || 'nothing'));
        check('adminOverview reached fetch', b.fetched.indexOf('admin_overview') !== -1);
    }, (e) => {
        check('adminOverview resolves', false, e && e.message);
    }).then(transportChecks);
}

/* The same trap, one level down: state declared below the early return is
 * undefined for a returning visitor. These are the pieces that lived there. */
function transportChecks() {
    return Promise.resolve()
    .then(() => {
        /* Analytics never block the page. The pageview is held on the wire;
         * a second analytics call must wait, a foreground read must not. */
        const b = makeBrowser({ hold: { record_pageview: true } });
        b.auth.trackClick('x');
        b.auth.adminDashboard({ parts: ['overview'] });
        return tick(5).then(() => {
            check('a foreground read starts while analytics is on the wire',
                  b.fetched.indexOf('admin_dashboard') !== -1, 'got: ' + b.fetched.join(', '));
            check('analytics take one slot at most', b.fetched.indexOf('record_click') === -1,
                  'got: ' + b.fetched.join(', '));
            b.held.forEach((h) => h[1]());
            return tick(5).then(() => check('queued analytics go out once the slot frees',
                                            b.fetched.indexOf('record_click') !== -1));
        });
    })
    .then(() => {
        /* Two identical reads in flight share one request. */
        const b = makeBrowser({ hold: { get_completions: true } });
        const p1 = b.auth.getCompletions(), p2 = b.auth.getCompletions();
        return tick(5).then(() => {
            const n = b.fetched.filter((a) => a === 'get_completions').length;
            check('identical reads in flight share one request', n === 1, n + ' requests');
            b.held.forEach((h) => h[1]());
            return Promise.all([p1, p2]);
        }).then(() => {
            check('the completions cache has a real key, not "undefined"',
                  'aisa_completions_v2' in b.store && !('undefined' in b.store),
                  'keys: ' + Object.keys(b.store).join(', '));
        });
    })
    .then(() => {
        /* A stray cache from the "undefined" key bug is tidied away. */
        const b = makeBrowser({ store: { undefined: JSON.stringify({ email: 'x', completions: [] }) } });
        check('the old localStorage["undefined"] completions cache is removed', !('undefined' in b.store));
    })
    .then(() => {
        /* Asked recently: no request. */
        const b = makeBrowser({ store: { aisa_is_admin_v1: JSON.stringify({
            email: 'someone@aisa.sch.ae', is_admin: true, checked_at: Date.now() }) } });
        return b.auth.isAdmin().then((yes) => tick(5).then(() => {
            check('a recent admin answer is reused, not re-asked',
                  yes === true && b.fetched.indexOf('whoami') === -1, 'got: ' + b.fetched.join(', '));
        }));
    })
    .then(() => {
        /* The bell: one request for two page loads' worth of asking. */
        const b = makeBrowser({ answers: { get_notifications: { ok: true, notifications: [], unread: 0 } } });
        return b.auth.getNotifications().then(() => b.auth.getNotifications()).then(() => {
            const n = b.fetched.filter((a) => a === 'get_notifications').length;
            check('the bell reuses a fresh answer', n === 1, n + ' requests');
            return b.auth.markNotificationRead('n1').then(() => b.auth.getNotifications());
        }).then(() => {
            const n = b.fetched.filter((a) => a === 'get_notifications').length;
            check('marking one read makes the bell ask again', n === 2, n + ' requests');
        });
    })
    .then(() => {
        /* The server revokes the session: the sign-in screen must come up.
         * pendingReAuthResolvers used to be undefined here, so this threw. */
        const b = makeBrowser({ answers: { get_completions: { ok: false, error: 'invalid_session' } } });
        let settled = null;
        b.auth.getCompletions().then(() => { settled = 'resolved'; }, (e) => { settled = e; });
        return tick(20).then(() => {
            check('a revoked session waits for sign-in instead of throwing',
                  settled === null, settled && (settled.message || settled));
            check('…and loads Google sign-in to get it',
                  b.injected.some((u) => u.indexOf('accounts.google.com/gsi/client') !== -1));
        });
    })
    .then(() => {
        /* A thrown server exception is retried for a read, once. */
        const b = makeBrowser({ answers: { admin_dashboard: { ok: false, error: 'server_error', message: 'Sheets timed out' } } });
        return b.auth.adminDashboard({}).then(() => {
            check('server_error rejects', false);
        }, (e) => {
            const n = b.fetched.filter((a) => a === 'admin_dashboard').length;
            check('a server_error on a read is retried once, then reported with its message',
                  e.message === 'server_error' && e.serverMessage === 'Sheets timed out' && n === 2,
                  e.message + ' / ' + e.serverMessage + ' / ' + n + ' requests');
        });
    });
}

console.log('gate.js smoke test\n');
run().then(() => {
    console.log('\n' + (failures ? failures + ' failure(s)' : 'all checks passed'));
    process.exit(failures ? 1 : 0);
});
