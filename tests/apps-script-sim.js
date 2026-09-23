/*
 * Simulator for auth/apps-script.gs — run it with:
 *
 *     node tests/apps-script-sim.js
 *     node tests/apps-script-sim.js --baseline old-apps-script.gs
 *
 * No dependencies. Exits 0 on pass, 1 on failure.
 *
 * WHAT IT PROVES. The backend keeps a read cache (CacheService) in front of
 * the spreadsheet. The one rule that cache lives by is that it only ever
 * holds COPIES: every answer the Hub gets, and every cell it writes, must
 * be exactly what the spreadsheet alone would have produced. So this runs
 * one long scenario — sign-ins, page views, completions, dwell, module
 * answers, goal forms, notifications, sign-outs, clock jumps — three times:
 *
 *   1. cache working
 *   2. cache throwing on every call (Google's cache down)
 *   3. with --baseline, an older apps-script.gs, before the cache existed
 *
 * and demands the same responses and the same final spreadsheet from all of
 * them. Then it checks the things only the cache can get wrong: a write
 * shows up on the next read, a signed-out token stops working, last_used
 * lands on the right row after rows move, a big payload survives chunking,
 * a hand edit shows up after Refresh.
 *
 * Every request runs in a FRESH copy of the script, as Apps Script does:
 * globals do not survive between requests there, and a test that let them
 * would hide exactly the bugs worth finding. The spreadsheet and the cache
 * are the only things carried over.
 *
 * The fakes below implement just enough of SpreadsheetApp, CacheService &c.
 * for this file. Extend them rather than weakening a check.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GS = path.join(__dirname, '..', 'auth', 'apps-script.gs');

let failures = 0;
function check(name, ok, detail) {
    console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || detail === undefined ? '' : '\n         ' + detail));
    if (!ok) failures++;
}

/* ------------------------------------------------------------------ */
/* Fake Google services                                                */
/* ------------------------------------------------------------------ */

function isBlank(v) { return v === '' || v === null || v === undefined; }
function cloneCell(v) { return (v instanceof Date) ? new Date(v.getTime()) : v; }

function makeSheet(name, rows) {
    const sh = { name: name, rows: (rows || []).map((r) => r.slice()) };
    const stats = { reads: 0, writes: 0 };
    function lastRow() {
        let n = sh.rows.length;
        while (n > 0 && (sh.rows[n - 1] || []).every(isBlank)) n--;
        return n;
    }
    function lastCol() {
        let m = 0;
        for (let i = 0; i < lastRow(); i++) {
            const r = sh.rows[i] || [];
            let k = r.length;
            while (k > 0 && isBlank(r[k - 1])) k--;
            if (k > m) m = k;
        }
        return m;
    }
    function cell(r, c) { const row = sh.rows[r - 1]; const v = row ? row[c - 1] : ''; return isBlank(v) ? '' : cloneCell(v); }
    function setCell(r, c, v) {
        while (sh.rows.length < r) sh.rows.push([]);
        const row = sh.rows[r - 1];
        while (row.length < c) row.push('');
        row[c - 1] = cloneCell(v);
    }
    function range(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        if (r < 1 || c < 1 || nr < 1 || nc < 1) throw new Error('Range out of bounds: ' + [r, c, nr, nc]);
        const api = {
            getValues() {
                stats.reads++;
                const out = [];
                for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(cell(r + i, c + j)); out.push(row); }
                return out;
            },
            getValue() { stats.reads++; return cell(r, c); },
            setValues(v) {
                stats.writes++;
                if (v.length !== nr || v.some((row) => row.length !== nc)) throw new Error('setValues dimension mismatch');
                for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) setCell(r + i, c + j, v[i][j]);
                return api;
            },
            setValue(v) { stats.writes++; setCell(r, c, v); return api; },
            setFontWeight() { return api; },
            copyTo(dest) { dest._paste(api.getValues()); },
            _paste(vals) { vals.forEach((row, i) => row.forEach((v, j) => setCell(r + i, c + j, v))); }
        };
        return api;
    }
    return {
        _sh: sh, _stats: stats,
        getName() { return sh.name; },
        getLastRow: lastRow,
        getLastColumn: lastCol,
        getRange: range,
        appendRow(arr) { stats.writes++; sh.rows.splice(lastRow(), 0, arr.map(cloneCell)); },
        deleteRow(i) { stats.writes++; sh.rows.splice(i - 1, 1); },
        setFrozenRows() {},
        clear() { stats.writes++; sh.rows = []; }
    };
}

function makeSpreadsheet(seed) {
    const sheets = {};
    Object.keys(seed).forEach((n) => { sheets[n] = makeSheet(n, seed[n]); });
    return {
        _sheets: sheets,
        getName() { return 'Hub analytics (sim)'; },
        getId() { return 'bound-sheet-id'; },
        getSheetByName(n) { return sheets[n] || null; },
        insertSheet(n) { sheets[n] = makeSheet(n, []); return sheets[n]; }
    };
}

function makeCache(clock, mode) {
    const store = new Map();
    const stats = { calls: 0 };
    function guard() { stats.calls++; if (mode.broken) throw new Error('Exception: Cache service unavailable (sim)'); }
    function key(k) {
        if (typeof k !== 'string' || !k.length || k.length > 250) throw new Error('Invalid cache key: ' + k);
        return k;
    }
    const api = {
        get(k) { guard(); const e = store.get(key(k)); return (e && e.exp > clock.t) ? e.v : null; },
        getAll(keys) {
            guard();
            const o = {};
            keys.forEach((k) => { const e = store.get(key(k)); if (e && e.exp > clock.t) o[k] = e.v; });
            return o;
        },
        put(k, v, ttl) {
            guard();
            key(k);
            const s = String(v);
            /* The real limits: 100 KB per value, 6 hours at most. */
            if (Buffer.byteLength(s, 'utf8') > 100 * 1024) throw new Error('Argument too large: value');
            if (ttl !== undefined && (ttl < 1 || ttl > 21600)) throw new Error('Invalid expiration: ' + ttl);
            store.set(k, { v: s, exp: clock.t + (ttl || 600) * 1000 });
        },
        putAll(obj, ttl) { Object.keys(obj).forEach((k) => api.put(k, obj[k], ttl)); },
        remove(k) { guard(); store.delete(key(k)); }
    };
    return { api: api, store: store, stats: stats };
}

function makeRandom(seed) {
    let s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* Everything that persists between requests: the spreadsheet, the cache,
 * the clock, the mail log and the random stream. */
function makeWorld(seed, opts) {
    opts = opts || {};
    const clock = { t: Date.parse('2026-09-23T05:00:00Z') };
    const cacheMode = { broken: !!opts.cacheBroken };
    return {
        clock: clock,
        ss: makeSpreadsheet(seed),
        cache: makeCache(clock, cacheMode),
        cacheMode: cacheMode,
        random: makeRandom(12345),
        uuid: 0,
        mail: []
    };
}

function formatDubai(date, fmt) {
    const d = new Date(date.getTime() + 4 * 3600 * 1000);
    const p = (n, w) => String(n).padStart(w || 2, '0');
    const Y = d.getUTCFullYear(), M = p(d.getUTCMonth() + 1), D = p(d.getUTCDate());
    const h = p(d.getUTCHours()), m = p(d.getUTCMinutes()), s = p(d.getUTCSeconds());
    if (fmt === "yyyy-MM-dd'T'HH:mm:ssXXX") return Y + '-' + M + '-' + D + 'T' + h + ':' + m + ':' + s + '+04:00';
    if (fmt === 'yyyyMMdd_HHmmss') return '' + Y + M + D + '_' + h + m + s;
    if (fmt === 'H') return String(d.getUTCHours());
    throw new Error('formatDate: unsupported format ' + fmt);
}

/* One Apps Script execution: a fresh global scope over the shared world. */
function execute(src, world, fnName, args) {
    const clock = world.clock;
    class FakeDate extends Date {
        constructor(...a) { if (a.length === 0) super(clock.t); else super(...a); }
        static now() { return clock.t; }
    }
    const rnd = world.random;
    const FakeMath = Object.create(Math);
    FakeMath.random = rnd;

    const sandbox = {
        console, JSON, Object, Array, String, Number, Boolean, RegExp, Error, TypeError,
        isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
        Date: FakeDate, Math: FakeMath,
        SpreadsheetApp: {
            getActiveSpreadsheet: () => world.ss,
            openById: () => { throw new Error('openById not simulated'); }
        },
        CacheService: { getScriptCache: () => world.cache.api },
        LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
        Utilities: {
            formatDate: (d, tz, fmt) => formatDubai(d, fmt),
            base64EncodeWebSafe: (bytes) => Buffer.from(bytes.map((b) => b & 255)).toString('base64')
                .replace(/\+/g, '-').replace(/\//g, '_'),
            getUuid: () => {
                world.uuid++;
                const h = ('00000000' + world.uuid.toString(16)).slice(-8);
                return h + '-aaaa-4bbb-8ccc-' + ('000000000000' + (world.uuid * 7919).toString(16)).slice(-12);
            }
        },
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput: (s) => ({ content: s, setMimeType() { return this; } })
        },
        UrlFetchApp: {
            fetch: (url) => {
                const tok = decodeURIComponent(String(url).split('id_token=')[1] || '');
                let claims = null;
                try { claims = JSON.parse(tok); } catch (e) { /* not ours */ }
                return {
                    getResponseCode: () => (claims ? 200 : 400),
                    getContentText: () => JSON.stringify(claims || {})
                };
            }
        },
        MailApp: {
            getRemainingDailyQuota: () => 100,
            sendEmail: (o) => { world.mail.push(o.to); }
        },
        Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@aisa.sch.ae' }) },
        Logger: { log() {} }
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: 'apps-script.gs' });
    return sandbox[fnName].apply(null, args || []);
}

function post(src, world, body) {
    const out = execute(src, world, 'doPost', [{ postData: { contents: JSON.stringify(body) } }]);
    return JSON.parse(out.content);
}

/* ------------------------------------------------------------------ */
/* Seed spreadsheet                                                    */
/* ------------------------------------------------------------------ */

const OAUTH = '719019551782-h9pdg57s6oq4jpo884a53o0d1pgel1u6.apps.googleusercontent.com';
const FUTURE = '2027-09-01T08:00:00+04:00';

function seed() {
    const D = (s) => new Date(s);
    const arabic = 'أحتاج إلى وقت إضافي للتخطيط — وخطة للدرس الأول ✓ ';
    return {
        sessions: [
            ['session_token', 'email', 'name', 'created_at_iso', 'expires_at_iso', 'last_used_iso', 'user_agent'],
            ['tokA', 'Admin@aisa.sch.ae', 'Ada Admin', '2026-09-01T08:00:00Z', FUTURE, D('2026-09-20T10:00:00Z'), 'ua'],
            ['tokT', 't.one@aisa.sch.ae', 'Tee One', '2026-09-02T10:00:00+04:00', FUTURE, '2026-09-22T09:00:00+04:00', 'ua'],
            ['tokT2', 'T.One@aisa.sch.ae', '', '2026-09-03T10:00:00+04:00', FUTURE, '2026-09-22T06:30:00Z', 'ua'],
            ['tokX', 'x@aisa.sch.ae', 'Ex Pired', '2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '', 'ua'],
            ['tokS', 'bbaki@aisa.sch.ae', 'Brandon', '2026-09-04T07:00:00Z', FUTURE, '2026-09-23T08:59:00+04:00', 'ua'],
            ['tokN', 'n.two@aisa.sch.ae', 'Nia Two', '2026-09-05T07:00:00Z', D(FUTURE), '', 'ua'],
            ['tokR', 'r.three@aisa.sch.ae', 'Ravi Three', '2026-09-06T07:00:00Z', FUTURE, '2026-09-21T07:00:00Z', 'ua']
        ],
        events: [
            ['timestamp_iso', 'email', 'name', 'module_id', 'event', 'progress_pct', 'version', 'user_agent'],
            ['2026-09-10T08:00:00Z', 't.one@aisa.sch.ae', 'Tee One', 'ai-ethics', 'completed', 100, 'v1', 'ua'],
            ['2026-09-10T12:30:00+04:00', 'T.ONE@aisa.sch.ae', 'Tee One', 'ai-ethics', 'completed', 100, 'v2', 'ua'],   // 08:30Z: later
            ['2026-09-10T12:00:00+04:00', 't.one@aisa.sch.ae', '', 'ai-ethics', 'completed', 100, 'v3', 'ua'],          // 08:00Z: tie, earlier row wins
            [D('2026-09-11T09:00:00Z'), 't.one@aisa.sch.ae', 'Tee One', 'safeguarding', 'completed', 100, 'v1', 'ua'],
            ['2026-09-11T09:00:00Z', 't.one@aisa.sch.ae', 'Tee One', 'safeguarding', 'started', 0, 'v1', 'ua'],
            ['2026-09-12T09:00:00Z', 'solo@aisa.sch.ae', 'Solo Event', 'chalkie', 'completed', 100, 'v1', 'ua'],
            ['2026-09-12T10:00:00Z', 'n.two@aisa.sch.ae', '', 'ai-ethics', 'completed', 100, 'v1', 'ua'],
            ['2026-09-12T11:00:00Z', '', 'Nobody', 'ai-ethics', 'completed', 100, 'v1', 'ua'],
            ['2026-09-13T11:00:00Z', 'survey@aisa.sch.ae', 'Old Survey', 'survey', 'completed', 100, 'v1', 'ua']
        ],
        roster: [
            ['email', 'name', 'tags'],
            ['t.one@aisa.sch.ae', 'Tee One (roster)', 'secondary, math'],
            ['n.two@aisa.sch.ae', '', 'elementary'],
            ['never@aisa.sch.ae', 'Never Signed', 'secondary'],
            ['', 'blank row', 'secondary'],
            ['NEVER@aisa.sch.ae', 'Never Again', 'secondary,science'],
            ['admin@aisa.sch.ae', 'Ada (roster)', 'slt'],
            ['elem@aisa.sch.ae', 'Elle Mentary', 'elementary']
        ],
        admins: [
            ['email', 'name', 'role'],
            [' admin@aisa.sch.ae ', 'Ada', 'slt'],
            ['bbaki@aisa.sch.ae', 'Brandon', 'ai lead']
        ],
        notifications: [
            ['id', 'created_at_iso', 'author_email', 'author_name', 'title', 'body', 'target_tags', 'target_emails', 'active'],
            ['n1', D('2026-09-10T06:00:00Z'), 'admin@aisa.sch.ae', 'Ada', 'Welcome', 'Hello all', '', '', true],
            ['n2', '2026-09-18T12:00:00+04:00', 'admin@aisa.sch.ae', 'Ada', 'Secondary', 'For secondary', 'secondary', '', true],
            ['n3', '2026-09-18T07:30:00Z', 'admin@aisa.sch.ae', 'Ada', 'For Nia', 'Just you', '', 'n.two@aisa.sch.ae', true],
            ['n4', '2026-09-19T07:30:00Z', 'admin@aisa.sch.ae', 'Ada', 'Gone', 'Deleted', '', '', 'FALSE'],
            ['n5', '2026-09-20T07:30:00Z', 'admin@aisa.sch.ae', 'Ada', 'Elementary', 'Elem only', 'elementary', '', true]
        ],
        notification_reads: [
            ['notification_id', 'email', 'read_at_iso'],
            ['n1', 'T.One@aisa.sch.ae', '2026-09-11T06:00:00Z'],
            ['n3', 'n.two@aisa.sch.ae', '2026-09-19T06:00:00Z']
        ],
        dwell: [
            ['updated_at_iso', 'first_seen_iso', 'email', 'name', 'module_id', 'total_seconds', 'chapters_seen', 'avg_secs_per_chapter', 'user_agent'],
            ['2026-09-20T10:00:00Z', '2026-09-19T10:00:00Z', 'n.two@aisa.sch.ae', 'Nia Two', 'safeguarding', 600, 4, 150, 'ua'],
            [D('2026-09-21T10:00:00Z'), '2026-09-19T11:00:00Z', 't.one@aisa.sch.ae', 'Tee One', 'ai-ethics', 300, 3, 100, 'ua']
        ],
        module_responses: [
            ['first_saved_iso', 'updated_at_iso', 'email', 'name', 'module_id', 'segments_done', 'data_json', 'flagged', 'completed_at_iso', 'user_agent'],
            ['2026-09-15T08:00:00Z', D('2026-09-16T08:00:00Z'), 'n.two@aisa.sch.ae', 'Nia Two', 'ai-curriculum-readiness', 'lesson',
                JSON.stringify({ lesson: { needs_before: arabic, grade: 'Grade 7', _saved_at: '2026-09-16T08:00:00Z' } }), true, '', 'ua'],
            ['2026-09-15T09:00:00Z', '2026-09-15T09:30:00Z', 'r.three@aisa.sch.ae', 'Ravi Three', 'other-module', 'x',
                JSON.stringify({ x: { a: 1 } }), false, '', 'ua']
        ],
        survey_responses: [
            ['first_saved_iso', 'updated_at_iso', 'submitted_at_iso', 'email', 'name', 'survey_id', 'status', 'revision', 'data_json', 'user_agent'],
            ['2026-09-17T08:00:00Z', '2026-09-17T08:10:00Z', '2026-09-17T08:10:00Z', 'never@aisa.sch.ae', 'Never Signed',
                'secondary-teacher-goal-2026-27', 'submitted', 1, JSON.stringify({ name: 'Never Signed', focus_area: 'Assessment for Learning', goal: 'g' }), 'ua'],
            ['2026-09-17T09:00:00Z', D('2026-09-17T09:10:00Z'), '', 'n.two@aisa.sch.ae', 'Nia Two',
                'secondary-teacher-goal-2026-27', 'draft', 0, JSON.stringify({ name: 'Nia' }), 'ua']
        ],
        form_submissions: [
            ['submission_id', 'created_at_iso', 'updated_at_iso', 'status', 'form_id', 'form_url', 'form_title', 'staff_email', 'staff_name', 'manager_email', 'manager_name', 'data_json', 'staff_snapshot_json', 'completed_at_iso'],
            ['s_1', '2026-09-10T08:00:00Z', D('2026-09-12T08:00:00Z'), 'complete', 'ta', 'https://x/f', 'TA', 't.one@aisa.sch.ae', 'Tee', 'admin@aisa.sch.ae', 'Ada', '{}', '{}', '2026-09-12T08:00:00Z'],
            ['s_2', '2026-09-11T08:00:00Z', '2026-09-12T11:00:00+04:00', 'pending_manager', 'ta', 'https://x/f', 'TA', 't.one@aisa.sch.ae', 'Tee', 'admin@aisa.sch.ae', 'Ada', '{}', '{}', ''],
            ['s_3', '2026-09-11T08:00:00Z', '2026-09-12T07:30:00Z', 'pending_manager', 'ta', 'https://x/f', 'TA', 'n.two@aisa.sch.ae', 'Nia', 't.one@aisa.sch.ae', 'Tee', '{}', '{}', '']
        ],
        line_managers: [
            ['email', 'name', 'division'],
            ['admin@aisa.sch.ae', 'Ada', 'SLT']
        ]
    };
}

/* ------------------------------------------------------------------ */
/* The scenario                                                        */
/* ------------------------------------------------------------------ */

const MIN = 60 * 1000;
const RESP_MODULE = 'ai-curriculum-readiness';
const SURVEY = 'secondary-teacher-goal-2026-27';

function scenario(src, world, opts) {
    opts = opts || {};
    const log = [];
    const call = (label, body) => { log.push([label, post(src, world, body)]); };
    const as = (tok, action, extra) => Object.assign({ action: action, session_token: tok }, extra || {});
    const tick = (ms) => { world.clock.t += ms; };

    call('whoami admin', as('tokA', 'whoami'));
    call('whoami teacher', as('tokT', 'whoami'));
    call('whoami expired', as('tokX', 'whoami'));
    call('whoami unknown', as('nope', 'whoami'));
    call('completions teacher', as('tokT', 'get_completions'));
    call('completions teacher 2nd device', as('tokT2', 'get_completions'));
    call('overview', as('tokA', 'admin_overview'));
    call('overview not admin', as('tokT', 'admin_overview'));
    call('dwell admin', as('tokA', 'admin_dwell'));
    call('module responses', as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));
    call('module responses all', as('tokA', 'admin_module_responses', {}));
    call('survey whole roster', as('tokA', 'admin_survey_responses', { survey_id: SURVEY, roster_tag: '' }));
    call('survey secondary', as('tokA', 'admin_survey_responses', { survey_id: SURVEY, roster_tag: 'secondary' }));
    call('notifs teacher', as('tokT', 'get_notifications'));
    call('notifs nia', as('tokN', 'get_notifications'));
    call('tags', as('tokA', 'admin_list_tags'));
    call('notif stats', as('tokA', 'admin_notification_stats'));
    call('newsletter status', as('tokS', 'newsletter_status'));
    call('my submissions', as('tokT', 'list_my_submissions'));
    call('line managers', as('tokT', 'get_line_managers'));

    tick(1 * MIN);
    call('pageview', as('tokT', 'record_pageview', { page_path: '/index.html', page_title: 'Hub' }));
    call('click', as('tokT', 'record_click', { label: 'x', page_path: '/index.html' }));

    // A completion lands, and must be visible on the very next read.
    call('complete chalkie', as('tokT', 'record_event', { module_id: 'chalkie', event: 'completed', progress_pct: 100, version: 'v1' }));
    call('completions after', as('tokT', 'get_completions'));
    call('overview after', as('tokA', 'admin_overview'));

    // Dwell: an existing row (date-typed updated), then a new one, then again.
    const ch = [{ chapter: '1', title: 'A', seconds: 40 }, { chapter: '2', title: 'B', seconds: 20 }];
    call('dwell existing', as('tokT', 'record_dwell', { module_id: 'ai-ethics', chapters: ch }));
    call('dwell new', as('tokT', 'record_dwell', { module_id: 'chalkie', chapters: ch }));
    tick(30 * 1000);
    call('dwell new again', as('tokT', 'record_dwell', { module_id: 'chalkie', chapters: ch.concat([{ chapter: '3', title: 'C', seconds: 9 }]) }));
    call('dwell nia', as('tokN', 'record_dwell', { module_id: 'safeguarding', chapters: ch }));

    // Module answers: a new row, then an edit, then the admin view.
    call('save resp new', as('tokT', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'lesson', data: { unsure: 'ثقة', grade: 'Grade 8' } }));
    call('save resp edit', as('tokT', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'commit', data: { will_do: 'x' }, completed: true }));
    call('save resp nia', as('tokN', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'lesson', data: { needs_before: '' } }));
    call('get own resp', as('tokT', 'get_module_response', { module_id: RESP_MODULE }));
    call('get own resp none', as('tokR', 'get_module_response', { module_id: RESP_MODULE }));
    call('module responses after', as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));

    // Goal form: draft, rejected submit, real submit, admin view.
    call('goal draft', as('tokT', 'save_survey_response', { survey_id: SURVEY, data: { name: 'Tee', department: 'Maths' } }));
    call('goal bad submit', as('tokT', 'save_survey_response', { survey_id: SURVEY, data: { email: 't.one@aisa.sch.ae' }, submit: true }));
    call('goal submit', as('tokT', 'save_survey_response', { survey_id: SURVEY, submit: true, data: {
        name: 'Tee One', email: 't.one@aisa.sch.ae', department: 'Maths', at_aisa_last_year: 'Yes',
        focus_area: 'Assessment for Learning', goal: 'Better exit tickets', if_then: 'If Monday then plan' } }));
    call('goal own', as('tokT', 'get_survey_response', { survey_id: SURVEY }));
    call('survey after', as('tokA', 'admin_survey_responses', { survey_id: SURVEY, roster_tag: 'secondary' }));

    // Notifications: read one, read all, post, delete.
    call('mark read', as('tokT', 'mark_notification_read', { notification_id: 'n2' }));
    call('mark read again', as('tokT', 'mark_notification_read', { notification_id: 'n2' }));
    call('notifs after read', as('tokT', 'get_notifications'));
    call('post notif', as('tokA', 'post_notification', { title: 'New', body: 'Fresh', target_tags: 'secondary', target_emails: '' }));
    call('notifs after post', as('tokT', 'get_notifications'));
    call('mark all', as('tokT', 'mark_all_notifications_read'));
    call('notifs after all', as('tokT', 'get_notifications'));
    call('delete notif', as('tokA', 'delete_notification', { notification_id: 'n1' }));
    call('notifs after delete', as('tokN', 'get_notifications'));
    call('notif stats after', as('tokA', 'admin_notification_stats'));

    // Performance review round trip.
    call('submit form', as('tokN', 'submit_form', { form_id: 'ta', form_url: 'https://x/f', form_title: 'TA', manager_email: 'admin@aisa.sch.ae', data: { a: 1 } }));
    call('my submissions after', as('tokA', 'list_my_submissions'));

    // A new sign-in, used straight away.
    call('create session', { action: 'create_session', user_agent: 'ua', id_token: JSON.stringify({
        aud: OAUTH, hd: 'aisa.sch.ae', email_verified: 'true', exp: String(Math.floor(world.clock.t / 1000) + 3600),
        email: 'fresh@aisa.sch.ae', name: 'Fresh Face' }) });
    const freshTok = log[log.length - 1][1].session_token;
    call('fresh whoami', as(freshTok, 'whoami'));
    call('overview with fresh person', as('tokA', 'admin_overview'));

    // Sign-out removes a row from the MIDDLE of the sessions tab, which moves
    // every row below it. last_used must still land on the right rows.
    call('sign out teacher device 2', as('tokT2', 'sign_out'));
    call('signed-out token', as('tokT2', 'whoami'));
    tick(6 * MIN);
    call('after 6 min: nia', as('tokN', 'whoami'));
    call('after 6 min: ravi', as('tokR', 'get_completions'));
    call('after 6 min: brandon', as('tokS', 'whoami'));
    tick(6 * MIN);
    call('after 12 min: fresh', as(freshTok, 'whoami'));
    call('after 12 min: nia', as('tokN', 'whoami'));

    // Newsletter test send (mail is faked).
    call('newsletter test', as('tokS', 'send_newsletter', { url: 'https://hub/x', test_only: '1', items: 'a\nb' }));
    call('unknown action', as('tokT', 'no_such_thing'));

    if (opts.bundle) {
        call('bundle', as('tokA', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
        call('bundle not admin', as('tokT', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
    }
    return log;
}

/* ------------------------------------------------------------------ */
/* Comparison                                                          */
/* ------------------------------------------------------------------ */

/* Differences that are intended, applied to both sides before comparing:
 *   - generated_at is "as of", which the cache makes older on purpose
 *   - a person's last_seen may lag by up to CACHE_TTL.people: the list of
 *     who has signed in is cached, and last_used moves on every visit.
 *     It already lagged by up to five minutes before the cache (the
 *     write is throttled), and the tracker shows it as a date. Checked
 *     on its own below: it catches up once the TTL passes.
 *   - timestamps read from date-typed cells come back as ISO now, where
 *     they used to be "Mon Mar 02 2026 …" — compare the instant
 *   - survey `outstanding` entries gained `tags`, module responses gained
 *     `module_id`: additions, dropped here
 *   - a thrown exception is `server_error` + message now */
function normalise(v, keyName) {
    if (Array.isArray(v)) return v.map((x) => normalise(x));
    if (v && typeof v === 'object') {
        const o = {};
        Object.keys(v).sort().forEach((k) => {
            if (k === 'generated_at' || k === 'last_seen') return;
            if (k === 'tags' && keyName === 'outstanding') return;
            o[k] = normalise(v[k], k);
        });
        if (keyName === 'outstanding') delete o.tags;
        return o;
    }
    if (typeof v === 'string' && /\d{4}|GMT/.test(v) && !/^[a-z_]+$/.test(v)) {
        const t = Date.parse(v);
        if (!isNaN(t) && /(\d{4}-\d{2}-\d{2}T|GMT)/.test(v)) return 'T' + t;
    }
    return v;
}

function normaliseResponse(label, r) {
    const n = normalise(r);
    if (n && n.outstanding) n.outstanding = n.outstanding.map((p) => { const q = Object.assign({}, p); delete q.tags; return q; });
    if (n && Array.isArray(n.responses) && 'module_id' in n) delete n.module_id;
    return n;
}

function sheetDump(world) {
    const out = {};
    Object.keys(world.ss._sheets).sort().forEach((n) => {
        out[n] = world.ss._sheets[n]._sh.rows
            .filter((r) => !(r || []).every(isBlank))
            .map((r) => r.map((v) => (v instanceof Date) ? 'T' + v.getTime() : normalise(v)));
    });
    return out;
}

function firstDiff(a, b, where) {
    where = where || '';
    if (JSON.stringify(a) === JSON.stringify(b)) return null;
    if (a && b && typeof a === 'object' && typeof b === 'object') {
        const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
        for (const k of keys) {
            const d = firstDiff(a[k], b[k], where + '/' + k);
            if (d) return d;
        }
    }
    return where + ': ' + JSON.stringify(a) + '  vs  ' + JSON.stringify(b);
}

/* Against a baseline from before the cache only: the old code sorted
 * notifications and submissions by comparing timestamps as TEXT, which put
 * a date-typed cell ("Thu Sep 10 …") above every ISO one and "Z" rows out
 * of order with "+04:00" ones. This version sorts by instant — the fix,
 * not a regression — so compare those two lists as sets. */
function unorder(r) {
    if (!r || typeof r !== 'object') return r;
    const byId = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]));
    const o = Object.assign({}, r);
    if (Array.isArray(o.notifications)) o.notifications = o.notifications.slice().sort(byId('id'));
    if (Array.isArray(o.submissions)) o.submissions = o.submissions.slice().sort(byId('submission_id'));
    return o;
}

function compareRuns(nameA, runA, nameB, runB, opts) {
    opts = opts || {};
    const prep = (e) => { const n = normaliseResponse(e[0], e[1]); return opts.baseline ? unorder(n) : n; };
    let bad = 0;
    runA.log.forEach((entry, i) => {
        const other = runB.log[i];
        const d = firstDiff(prep(entry), prep(other));
        if (d) { bad++; if (bad <= 6) check(nameA + ' = ' + nameB + ': ' + entry[0], false, d); }
    });
    if (!bad) check(nameA + ' = ' + nameB + ': all ' + runA.log.length + ' responses identical', true);
    else if (bad > 6) check('… and ' + (bad - 6) + ' more differing responses', false);
    const sd = firstDiff(runA.sheets, runB.sheets);
    check(nameA + ' = ' + nameB + ': final spreadsheet identical, cell for cell', !sd, sd);
}

function sheetReads(world) {
    return Object.keys(world.ss._sheets).reduce((n, k) => n + world.ss._sheets[k]._stats.reads, 0);
}

function run(src, opts) {
    const world = makeWorld(seed(), opts);
    const log = scenario(src, world, opts);
    return { world: world, log: log, sheets: sheetDump(world), reads: sheetReads(world) };
}

/* ------------------------------------------------------------------ */
/* Targeted checks                                                     */
/* ------------------------------------------------------------------ */

function targeted(src) {
    const as = (tok, action, extra) => Object.assign({ action: action, session_token: tok }, extra || {});

    /* last_used goes to the right row after rows move. */
    (function () {
        const world = makeWorld(seed());
        post(src, world, as('tokN', 'whoami'));     // caches row 7 for tokN
        post(src, world, as('tokR', 'whoami'));     // caches row 8 for tokR
        post(src, world, as('tokT2', 'sign_out'));  // deletes row 4: tokN is now row 6
        world.clock.t += 6 * MIN;
        post(src, world, as('tokN', 'whoami'));
        const rows = world.ss._sheets.sessions._sh.rows;
        const nia = rows.find((r) => r[0] === 'tokN');
        const ravi = rows.find((r) => r[0] === 'tokR');
        const want = formatDubai(new Date(world.clock.t), "yyyy-MM-dd'T'HH:mm:ssXXX");
        check('last_used written to the moved row, not the old row number', nia[5] === want, 'tokN row: ' + JSON.stringify(nia));
        check('the row that slid into the old position was left alone', ravi[5] !== want, 'tokR row: ' + JSON.stringify(ravi));
    })();

    /* last_seen lags by at most the people TTL, then catches up. */
    (function () {
        const world = makeWorld(seed());
        const seen = (r) => (r.people.find((p) => p.email === 'r.three@aisa.sch.ae') || {}).last_seen;
        const first = seen(post(src, world, as('tokA', 'admin_overview')));
        world.clock.t += 6 * MIN;
        post(src, world, as('tokR', 'whoami'));             // writes last_used (older than 5 min)
        const lagging = seen(post(src, world, as('tokA', 'admin_overview')));
        world.clock.t += 11 * MIN;
        const caught = seen(post(src, world, as('tokA', 'admin_overview')));
        check('last_seen catches up once CACHE_TTL.people has passed',
              lagging === first && Date.parse(caught) > Date.parse(first),
              [first, lagging, caught].join(' | '));
    })();

    /* A session deleted by hand stops working after flushHubCache(). */
    (function () {
        const world = makeWorld(seed());
        check('session works', post(src, world, as('tokR', 'whoami')).ok === true);
        const rows = world.ss._sheets.sessions._sh.rows;
        rows.splice(rows.findIndex((r) => r[0] === 'tokR'), 1);
        execute(src, world, 'flushHubCache', []);
        check('hand-deleted session is refused after flushHubCache()',
              post(src, world, as('tokR', 'whoami')).error === 'invalid_session');
    })();

    /* A hand edit to the roster shows after Refresh, and after the TTL. */
    (function () {
        const world = makeWorld(seed());
        const before = post(src, world, as('tokA', 'admin_overview'));
        world.ss._sheets.roster._sh.rows.push(['handadded@aisa.sch.ae', 'Hand Added', 'secondary']);
        const has = (r) => r.people.some((p) => p.email === 'handadded@aisa.sch.ae');
        check('overview before the hand edit', !has(before));
        const cached = post(src, world, as('tokA', 'admin_overview'));
        const refreshed = post(src, world, as('tokA', 'admin_dashboard', { parts: 'overview', fresh: '1' }));
        check('Refresh (fresh=1) picks up a hand edit at once', has(refreshed.overview),
              'cached read had it: ' + has(cached));
        const world2 = makeWorld(seed());
        post(src, world2, as('tokA', 'admin_overview'));
        world2.ss._sheets.roster._sh.rows.push(['handadded@aisa.sch.ae', 'Hand Added', 'secondary']);
        world2.clock.t += 16 * MIN;
        check('a hand edit shows once the roster TTL has passed',
              has(post(src, world2, as('tokA', 'admin_overview'))));
    })();

    /* The bundle is the individual endpoints, together. */
    (function () {
        const world = makeWorld(seed());
        const b = post(src, world, as('tokA', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
        const ov = post(src, world, as('tokA', 'admin_overview'));
        const dw = post(src, world, as('tokA', 'admin_dwell'));
        const mr = post(src, world, as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));
        const sv = post(src, world, as('tokA', 'admin_survey_responses', { survey_id: SURVEY, roster_tag: '' }));
        check('bundle.overview = admin_overview', !firstDiff(normalise(b.overview), normalise(ov)));
        check('bundle.dwell = admin_dwell', !firstDiff(normalise(b.dwell), normalise(dw)));
        check('bundle.module_responses = admin_module_responses', !firstDiff(normalise(b.module_responses), normalise(mr)));
        check('bundle.survey = admin_survey_responses', !firstDiff(normalise(b.survey), normalise(sv)));
        check('survey outstanding carries roster tags',
              b.survey.outstanding.every((p) => Array.isArray(p.tags)) &&
              b.survey.outstanding.some((p) => p.tags.indexOf('secondary') !== -1));
        const parts = post(src, world, as('tokA', 'admin_dashboard', { parts: 'overview,dwell' }));
        check('parts= limits the bundle', parts.overview && parts.dwell && !parts.survey && !parts.module_responses);
    })();

    /* A warm dashboard load reads no sheet at all. */
    (function () {
        const world = makeWorld(seed());
        const body = as('tokA', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY });
        post(src, world, body);
        const before = sheetReads(world);
        post(src, world, body);
        const warm = sheetReads(world) - before;
        check('a warm admin_dashboard reads no sheet at all', warm === 0, warm + ' range reads');
        const t0 = sheetReads(world);
        post(src, world, as('tokT', 'get_completions'));
        post(src, world, as('tokT', 'get_completions'));
        const t1 = sheetReads(world);
        post(src, world, as('tokT', 'get_notifications'));
        post(src, world, as('tokT', 'get_notifications'));
        const t2 = sheetReads(world);
        post(src, world, as('tokT', 'get_notifications'));
        check('a teacher\'s repeat get_notifications reads no sheet', sheetReads(world) === t2,
              (sheetReads(world) - t2) + ' reads; completions pair took ' + (t1 - t0) + ', notifs pair ' + (t2 - t1));
    })();

    /* Big payloads survive chunking, with 2- and 3-byte characters. */
    (function () {
        const world = makeWorld(seed());
        const rows = world.ss._sheets.module_responses._sh.rows;
        const big = ('تجربة ' + '—“quoted” ' + '汉字 ').repeat(120);
        for (let i = 0; i < 150; i++) {
            rows.push(['2026-09-15T08:00:00Z', '2026-09-15T08:00:00Z', 'bulk' + i + '@aisa.sch.ae', 'Bulk ' + i,
                       RESP_MODULE, 'lesson', JSON.stringify({ lesson: { unsure: big + i } }), false, '', 'ua']);
        }
        const a = post(src, world, as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));
        const chunks = Array.from(world.cache.store.keys()).filter((k) => /:responses:.*#/.test(k)).length;
        const before = sheetReads(world);
        const b = post(src, world, as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));
        check('a ' + Math.round(JSON.stringify(a).length / 1024) + ' KB payload is cached in chunks', chunks > 3, chunks + ' chunks');
        check('…and comes back out of the cache byte for byte', sheetReads(world) === before && JSON.stringify(a) === JSON.stringify(b));
    })();

    /* Evicted chunk = a miss, never a half answer. */
    (function () {
        const world = makeWorld(seed());
        const rows = world.ss._sheets.module_responses._sh.rows;
        for (let i = 0; i < 60; i++) {
            rows.push(['x', 'x', 'bulk' + i + '@aisa.sch.ae', 'B', RESP_MODULE, 'l', JSON.stringify({ l: { u: 'y'.repeat(3000) } }), false, '', '']);
        }
        const a = post(src, world, as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));
        const chunk = Array.from(world.cache.store.keys()).find((k) => /:responses:.*#.*#1$/.test(k));
        world.cache.store.delete(chunk);
        const b = post(src, world, as('tokA', 'admin_module_responses', { module_id: RESP_MODULE }));
        check('an evicted chunk reads as a miss and is rebuilt from the sheet', !!chunk && JSON.stringify(a) === JSON.stringify(b));
    })();

    /* The warmer runs in hours, is a no-op out of hours, and changes nothing. */
    (function () {
        const world = makeWorld(seed());
        /* The admin's session was seen recently (a real visit sends a
         * pageview first). Outside that, the one read left is the
         * five-minutely single-cell last_used check, by design. */
        world.clock.t = Date.parse('2026-09-23T04:59:30Z');
        post(src, world, as('tokA', 'record_pageview', { page_path: '/admin-dashboard.html' }));
        const before = JSON.stringify(sheetDump(world));
        world.clock.t = Date.parse('2026-09-23T05:00:00Z');   // 09:00 Abu Dhabi
        check('warmHubCache runs in school hours', execute(src, world, 'warmHubCache', []) === 'ok');
        world.clock.t = Date.parse('2026-09-23T20:00:00Z');   // midnight Abu Dhabi
        check('warmHubCache idles overnight', execute(src, world, 'warmHubCache', []) === 'outside_hours');
        check('warmHubCache writes nothing to the spreadsheet', JSON.stringify(sheetDump(world)) === before);
        world.clock.t = Date.parse('2026-09-23T05:04:00Z');   // inside the 5-minute trigger interval
        const r0 = sheetReads(world);
        post(src, world, as('tokA', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
        check('after warming, the first dashboard load of the day reads no sheet', sheetReads(world) === r0,
              (sheetReads(world) - r0) + ' range reads');
    })();

    /* A server exception is a code the pages can switch on. */
    (function () {
        const world = makeWorld(seed());
        world.ss._sheets.events.getRange = () => { throw new Error('Service Spreadsheets timed out while accessing document'); };
        const r = post(src, world, as('tokT', 'get_completions'));
        check('a thrown exception comes back as server_error + message',
              r.ok === false && r.error === 'server_error' && /timed out/.test(r.message || ''), JSON.stringify(r));
    })();
}

/* ------------------------------------------------------------------ */

function main() {
    const src = fs.readFileSync(GS, 'utf8');
    const baselineArg = process.argv.indexOf('--baseline');
    const baselinePath = baselineArg !== -1 ? process.argv[baselineArg + 1] : null;

    console.log('apps-script.gs simulator\n');
    console.log('Same scenario, cache working vs cache broken:');
    const withCache = run(src, { bundle: true });
    const noCache = run(src, { bundle: true, cacheBroken: true });
    compareRuns('cache on', withCache, 'cache broken', noCache);

    if (baselinePath) {
        console.log('\nSame scenario, this backend vs ' + baselinePath + ':');
        const old = run(fs.readFileSync(baselinePath, 'utf8'), {});
        const now = run(src, {});
        compareRuns('baseline', old, 'this version', now, { baseline: true });
        console.log('  sheet range reads for the whole scenario: baseline ' + old.reads + ', this version ' + now.reads);
    }

    console.log('\nCache-specific behaviour:');
    targeted(src);

    console.log('\n' + (failures ? failures + ' failure(s)' : 'all checks passed'));
    process.exit(failures ? 1 : 0);
}

/* Runnable on its own, and requireable for a browser-level test that wants
 * a simulated backend behind the real pages. */
if (require.main === module) main();
else module.exports = { makeWorld: makeWorld, seed: seed, execute: execute, post: post };
