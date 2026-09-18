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

function run() {
    const store = {};
    store[STORAGE_KEY] = JSON.stringify({
        email: 'someone@aisa.sch.ae', name: 'Someone', sessionToken: 'tok-smoke',
        expiresAt: Date.now() + 86400000
    });

    const fetched = [];          // action names that reached the network
    const injected = [];         // helper scripts gate.js asked for

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
            href: 'https://example.test/admin-dashboard.html'
        },
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        },
        fetch: (url, opts) => {
            fetched.push(JSON.parse(opts.body).action);
            return Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve(JSON.stringify({
                    ok: true, people: [], completions: [], is_admin: true
                }))
            });
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
    try {
        vm.runInContext(fs.readFileSync(GATE, 'utf8'), sandbox, { filename: 'gate.js' });
    } catch (e) {
        check('gate.js runs without throwing', false, e.message);
        return Promise.resolve();
    }
    check('gate.js runs without throwing', true);

    const auth = sandbox.window.aisaAuth;
    check('aisaAuth is exposed for a returning visitor', !!auth);
    if (!auth) return Promise.resolve();

    check('helper scripts are injected', injected.length > 0,
          'nothing was appended to <head>');
    check('the removed onboarding.js is not requested',
          !injected.some((u) => u.indexOf('onboarding.js') !== -1));

    /* The regression itself: the transport state must be live by the
     * time the first automatic request goes out. */
    return auth.adminOverview().then((r) => {
        check('adminOverview resolves', !!(r && r.ok === true));
        check('the automatic pageview reached fetch',
              fetched.indexOf('record_pageview') !== -1,
              'got: ' + (fetched.join(', ') || 'nothing'));
        check('adminOverview reached fetch', fetched.indexOf('admin_overview') !== -1);
    }, (e) => {
        check('adminOverview resolves', false, e && e.message);
    });
}

console.log('gate.js smoke test\n');
run().then(() => {
    console.log('\n' + (failures ? failures + ' failure(s)' : 'all checks passed'));
    process.exit(failures ? 1 : 0);
});
