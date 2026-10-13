/*
 * Simulator for the Apps Script backend (auth/apps-script.gs) — run it with:
 *
 *     node tests/apps-script-sim.js
 *     node tests/apps-script-sim.js --baseline old-apps-script.gs
 *     node tests/apps-script-sim.js --baseline old-apps-script.gs --strict
 *     node tests/apps-script-sim.js --backend some/other/backend
 *
 * No dependencies. Exits 0 on pass, 1 on failure.
 *
 * WHAT IT PROVES. The backend keeps a read cache (CacheService) in front of
 * the spreadsheet. The one rule that cache lives by is that it only ever
 * holds COPIES: every answer the Hub gets, and every cell it writes, must
 * be exactly what the spreadsheet alone would have produced. So this runs
 * the same scenarios with the cache working and with the cache throwing on
 * every call (Google's cache down), and demands the same responses and the
 * same final spreadsheet from both. The scenarios:
 *
 *   main               sign-ins, page views, completions, dwell, module
 *                      answers, goal forms, notifications, sign-outs,
 *                      clock jumps, the admin dashboard
 *   edge cases         every validation error, every admin-only action
 *                      asked for by a teacher, the performance-review round
 *                      trip, reminder emails and the newsletter, and every
 *                      way sending mail can fail
 *   empty spreadsheet  a brand-new workbook: every tab created on first use
 *   editor tools       auditHubData, authorizeMail, flushHubCache,
 *                      warmHubCache, migrateDwellToPerModule
 *
 * Then it checks the things only the cache can get wrong: a write shows up
 * on the next read, a signed-out token stops working, last_used lands on
 * the right row after rows move, a big payload survives chunking, a hand
 * edit shows up after Refresh.
 *
 * --baseline <file or folder> compares this backend with an older one.
 *   Without --strict it is lenient about the differences the read cache
 *   introduced on purpose (see normalise() below), which is what comparing
 *   with a backend from before the cache needs. With --strict nothing is
 *   forgiven: every response byte for byte, every cell, every email sent,
 *   the editor log, the cache contents and the number of sheet reads and
 *   writes, across every scenario. That is the check for a change that is
 *   meant to alter nothing — a reorganisation, a rename, a tidy-up:
 *
 *     git show HEAD:auth/apps-script.gs > /tmp/old.gs
 *     node tests/apps-script-sim.js --baseline /tmp/old.gs --strict
 *
 * Every request runs in a FRESH copy of the script, as Apps Script does:
 * globals do not survive between requests there, and a test that let them
 * would hide exactly the bugs worth finding. The spreadsheet, the cache,
 * the clock and the outbox are the only things carried over.
 *
 * The fakes below implement just enough of SpreadsheetApp, CacheService &c.
 * for the backend. Extend them rather than weakening a check.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const BACKEND = path.join(__dirname, '..', 'auth', 'apps-script.gs');

let failures = 0;
function check(name, ok, detail) {
    console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || detail === undefined ? '' : '\n         ' + detail));
    if (!ok) failures++;
}

/* The backend as Apps Script holds it: a list of files, loaded one after
 * another into one shared global scope. A folder means every .gs file in
 * it, in name order; a single file is a backend that has not been split. */
function loadBackend(p) {
    if (fs.statSync(p).isDirectory()) {
        return fs.readdirSync(p).filter((n) => /\.gs$/.test(n)).sort().map((n) => ({
            name: n, src: fs.readFileSync(path.join(p, n), 'utf8')
        }));
    }
    return [{ name: path.basename(p), src: fs.readFileSync(p, 'utf8') }];
}

/* ------------------------------------------------------------------ */
/* Fake Google services                                                */
/* ------------------------------------------------------------------ */

function isBlank(v) { return v === '' || v === null || v === undefined; }
function cloneCell(v) { return (v instanceof Date) ? new Date(v.getTime()) : v; }

function makeSheet(name, rows) {
    const sh = { name: name, rows: (rows || []).map((r) => r.slice()) };
    const stats = { reads: 0, writes: 0, cellsRead: 0 };
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
                stats.cellsRead += nr * nc;
                const out = [];
                for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(cell(r + i, c + j)); out.push(row); }
                return out;
            },
            getValue() { stats.reads++; stats.cellsRead++; return cell(r, c); },
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
    /* Insertion order is tab order, which a strict comparison checks: a
     * backend that creates its tabs in a different order on a new workbook
     * is visibly different to whoever opens it. */
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
 * the clock, the outbox, the editor log and the random stream.
 *
 * mailCfg is what MailApp does, and scenarios change it as they go:
 *   quota         what getRemainingDailyQuota() answers
 *   unauthorized  the script was never granted the send-mail scope, so
 *                 every MailApp call throws (quota reads included)
 *   failFor       { address: true } — sendEmail throws for these
 *   msPerSend     how far the clock moves per message sent, to reach the
 *                 mailers' six-minute cap */
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
        mail: [],
        logs: [],
        mailCfg: { quota: 100, unauthorized: false, failFor: {}, msPerSend: 0 }
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

const NO_MAIL_SCOPE = 'Exception: You do not have permission to call MailApp.sendEmail. ' +
    'Required permissions: https://www.googleapis.com/auth/script.send_mail';

function makeSandbox(world) {
    const clock = world.clock;
    class FakeDate extends Date {
        constructor(...a) { if (a.length === 0) super(clock.t); else super(...a); }
        static now() { return clock.t; }
    }
    const FakeMath = Object.create(Math);
    FakeMath.random = world.random;

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
            getRemainingDailyQuota: () => {
                if (world.mailCfg.unauthorized) throw new Error(NO_MAIL_SCOPE);
                return world.mailCfg.quota;
            },
            sendEmail: (o) => {
                if (world.mailCfg.unauthorized) throw new Error(NO_MAIL_SCOPE);
                if (world.mailCfg.failFor[o.to]) throw new Error('Invalid email: ' + o.to);
                world.mail.push({ to: o.to, subject: o.subject, body: o.body, htmlBody: o.htmlBody,
                                  replyTo: o.replyTo, name: o.name });
                world.clock.t += world.mailCfg.msPerSend;
            }
        },
        Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@aisa.sch.ae' }) },
        Logger: { log(s) { world.logs.push(String(s)); } }
    };
    sandbox.globalThis = sandbox;
    return sandbox;
}

/* One Apps Script execution: a fresh global scope over the shared world,
 * with every file of the backend loaded into it in turn — which is how
 * Apps Script runs a project of several files. */
function execute(files, world, fnName, args) {
    if (typeof files === 'string') files = [{ name: 'apps-script.gs', src: files }];
    const sandbox = makeSandbox(world);
    vm.createContext(sandbox);
    files.forEach((f) => vm.runInContext(f.src, sandbox, { filename: f.name }));
    return sandbox[fnName].apply(null, args || []);
}

function postEvent(files, world, e) {
    return JSON.parse(execute(files, world, 'doPost', [e]).content);
}

function post(files, world, body) {
    return postEvent(files, world, { postData: { contents: JSON.stringify(body) } });
}

/* ------------------------------------------------------------------ */
/* Seed spreadsheets                                                   */
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
            ['admin@aisa.sch.ae', 'Ada', 'SLT'],
            ['  Zed@aisa.sch.ae ', ' Zed Zero ', 'Elementary'],
            ['', 'No email', 'SLT'],
            ['amy@aisa.sch.ae', 'Amy', 'Elementary']
        ]
    };
}

/* The dwell tab as it was before per-module rows: one row per chapter.
 * Timestamps share one offset here, so the migration's choice of earliest
 * and latest is the same whether it compares them as text or as instants. */
function legacyDwellRows() {
    return [
        ['updated_at_iso', 'first_seen_iso', 'email', 'name', 'module_id', 'chapter', 'chapter_title', 'total_seconds', 'user_agent'],
        ['2026-09-20T10:00:00+04:00', '2026-09-19T10:00:00+04:00', 'N.Two@aisa.sch.ae', 'Nia Two', 'safeguarding', '1', 'Intro', 120, 'ua'],
        ['2026-09-21T09:00:00+04:00', '2026-09-18T08:00:00+04:00', 'n.two@aisa.sch.ae', '', 'safeguarding', '2', 'Signs', 60, 'ua'],
        ['2026-09-19T09:00:00+04:00', '2026-09-19T09:00:00+04:00', 'n.two@aisa.sch.ae', 'Nia', 'safeguarding', '3', 'Report', 0, 'ua'],
        ['2026-09-21T11:00:00+04:00', '', 't.one@aisa.sch.ae', 'Tee One', 'ai-ethics', '1', 'Start', 30, 'ua'],
        ['2026-09-22T11:00:00+04:00', '2026-09-20T11:00:00+04:00', 't.one@aisa.sch.ae', 'Tee One', 'chalkie', '1', 'Start', 0, 'ua'],
        ['2026-09-22T11:00:00+04:00', '2026-09-20T11:00:00+04:00', '', 'Nobody', 'chalkie', '1', 'Start', 50, 'ua']
    ];
}

/* ------------------------------------------------------------------ */
/* Scenarios                                                           */
/* ------------------------------------------------------------------ */

const MIN = 60 * 1000;
const RESP_MODULE = 'ai-curriculum-readiness';
const SURVEY = 'secondary-teacher-goal-2026-27';

/* Everything only an admin may do. A teacher asking for any of them must
 * get `not_admin` and must change nothing. */
const ADMIN_ONLY = [
    'admin_overview', 'admin_dwell', 'admin_dashboard', 'admin_module_responses',
    'admin_survey_responses', 'admin_notification_stats', 'admin_list_tags',
    'post_notification', 'delete_notification'
];

function scenario(files, world, opts) {
    opts = opts || {};
    const log = [];
    const call = (label, body) => { log.push([label, post(files, world, body)]); };
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

/* The paths the main scenario never takes: refusals, validation errors,
 * the performance-review round trip, and every way mail can go wrong. */
function edgeScenario(files, world) {
    const log = [];
    const call = (label, body) => { log.push([label, post(files, world, body)]); };
    const callEvent = (label, e) => { log.push([label, postEvent(files, world, e)]); };
    const as = (tok, action, extra) => Object.assign({ action: action, session_token: tok }, extra || {});
    const last = () => log[log.length - 1][1];
    const idToken = (over) => JSON.stringify(Object.assign({
        aud: OAUTH, hd: 'aisa.sch.ae', email_verified: 'true',
        exp: String(Math.floor(world.clock.t / 1000) + 3600),
        email: 'new.person@aisa.sch.ae', name: 'New Person' }, over || {}));

    // ----- Requests that never reach an action -----
    callEvent('no event at all', undefined);
    callEvent('empty body', { postData: { contents: '' } });
    callEvent('malformed JSON', { postData: { contents: '{"action": "whoami", ' } });
    call('no action, no token', {});
    call('unknown action, bad token', as('nope', 'no_such_thing'));
    call('action as a list', as('tokT', ['whoami']));
    call('inherited name as action', as('tokT', 'toString'));
    call('__proto__ as action', as('tokT', '__proto__'));
    call('constructor as action', as('tokT', 'constructor'));
    call('token too long', as('x'.repeat(201), 'whoami'));
    call('token not a string', as(12345, 'whoami'));
    call('id token missing', { action: 'create_session' });
    call('id token garbage', { action: 'create_session', id_token: 'not-a-token' });
    call('id token for another app', { action: 'create_session', id_token: idToken({ aud: 'someone-else' }) });
    call('id token outside the school', { action: 'create_session', id_token: idToken({ hd: 'gmail.com' }) });
    call('id token unverified', { action: 'create_session', id_token: idToken({ email_verified: false }) });
    call('id token expired', { action: 'create_session', id_token: idToken({ exp: String(Math.floor(world.clock.t / 1000) - 10) }) });
    call('id token without an email', { action: 'create_session', id_token: idToken({ email: '' }) });
    call('sign-in without a name', { action: 'create_session', id_token: idToken({ name: undefined, email: 'noname@aisa.sch.ae' }) });
    const nonameTok = last().session_token;
    call('nameless whoami', as(nonameTok, 'whoami'));

    // ----- Admin-only actions, asked for by a teacher -----
    ADMIN_ONLY.forEach((a) => {
        call('teacher refused: ' + a, as('tokT', a, {
            survey_id: SURVEY, module_id: RESP_MODULE, notification_id: 'n2',
            title: 'Not allowed', body: 'x', target_emails: 'elem@aisa.sch.ae', send_email: '1', fresh: '1'
        }));
    });
    call('admin who may not mail the school', as('tokA', 'send_newsletter', { url: 'https://hub/n', test_only: '1' }));
    call('teacher newsletter status', as('tokT', 'newsletter_status'));

    // ----- Tracking validation -----
    call('event: no module', as('tokT', 'record_event', { event: 'completed' }));
    call('event: no event', as('tokT', 'record_event', { module_id: 'm' }));
    call('event: progress over 100', as('tokT', 'record_event', { module_id: 'clamp', event: 'progress', progress_pct: 250, version: 'v9' }));
    call('event: progress under 0', as('tokT', 'record_event', { module_id: 'clamp', event: 'progress', progress_pct: -5 }));
    call('event: progress not a number', as('tokT', 'record_event', { module_id: 'clamp', event: 'progress', progress_pct: 'lots', user_agent: 'u'.repeat(400) }));
    call('event: long values cut', as('tokT', 'record_event', { module_id: 'm'.repeat(100), event: 'e'.repeat(50), version: 'v'.repeat(30) }));
    call('pageview: no path', as('tokT', 'record_pageview', { page_title: 't' }));
    call('pageview: long values cut', as('tokN', 'record_pageview', { page_path: '/p'.repeat(200), page_title: 't'.repeat(300), referrer: 'r'.repeat(400) }));
    call('click: no label', as('tokT', 'record_click', { page_path: '/x' }));
    call('dwell: no module', as('tokT', 'record_dwell', { chapters: [{ seconds: 5 }] }));
    call('dwell: chapters not a list', as('tokT', 'record_dwell', { module_id: 'm', chapters: 'lots' }));
    call('dwell: no chapters', as('tokT', 'record_dwell', { module_id: 'm', chapters: [] }));
    call('dwell: nothing but zeros', as('tokT', 'record_dwell', { module_id: 'm', chapters: [{ seconds: 0 }, null, { seconds: -4 }] }));
    call('dwell: values clamped', as('tokT', 'record_dwell', { module_id: 'clampdwell', chapters: [{ seconds: 999999 }, { seconds: '12' }, { seconds: 'x' }] }));
    const many = [];
    for (let i = 0; i < 230; i++) many.push({ seconds: 1 });
    call('dwell: over 200 chapters', as('tokN', 'record_dwell', { module_id: 'manych', chapters: many }));
    call('dwell: rows read back', as('tokA', 'admin_dwell', { fresh: '1' }));

    // ----- Module answers -----
    call('answers: no module', as('tokT', 'save_module_response', { segment_id: 's' }));
    call('answers: no segment', as('tokT', 'save_module_response', { module_id: RESP_MODULE }));
    call('answers: data not an object', as('tokR', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'odd', data: 'text' }));
    call('answers: blocked on access', as('tokR', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'access', data: { blocked: true } }));
    call('answers: asks the admins', as('tokR', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'lesson', notify_admins: true, data: { needs_before: '  More planning time  ' } }));
    call('answers: asks, but blank', as('tokR', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'lesson2', notify_admins: true, data: { needs_before: '   ' } }));
    call('answers: finished twice', as('tokR', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'commit', completed: true, data: { ok: 1 } }));
    call('answers: finished again', as('tokR', 'save_module_response', { module_id: RESP_MODULE, segment_id: 'commit', completed: true, data: { ok: 2 } }));
    call('answers read: no module', as('tokR', 'get_module_response', {}));
    call('answers read back', as('tokR', 'get_module_response', { module_id: RESP_MODULE }));
    call('the admins see the ask', as('tokA', 'get_notifications'));
    call('admin view after the asks', as('tokA', 'admin_module_responses', { module_id: RESP_MODULE, fresh: '1' }));

    // ----- Goal form -----
    const goal = {
        name: 'Ravi Three', email: 'r.three@aisa.sch.ae', department: 'Science', at_aisa_last_year: 'No',
        focus_area: 'Questioning & Discussion', goal: 'Ask better questions <every> day & "listen"',
        if_then: 'If a lesson starts,\nthen I open with a question',
        pl_supports: ['Coaching', '', null, 'Peer observation'], pl_detail: 'Short cycles\nwith feedback',
        beyond_classroom: ''
    };
    call('goal: no survey id', as('tokT', 'save_survey_response', {}));
    call('goal: unknown survey', as('tokT', 'save_survey_response', { survey_id: 'nope' }));
    call('goal: focus area not on the list', as('tokR', 'save_survey_response', { survey_id: SURVEY, submit: true, data: Object.assign({}, goal, { focus_area: 'Juggling' }) }));
    call('goal: unknown fields dropped', as('tokR', 'save_survey_response', { survey_id: SURVEY, data: { name: 'Ravi', hacker: 'x', pl_other: true, pl_detail: 'p'.repeat(9000) } }));
    call('goal: submit, no copy wanted', as('tokR', 'save_survey_response', { survey_id: SURVEY, submit: true, email_copy: false, data: goal }));
    call('goal: resubmit is revision 2', as('tokR', 'save_survey_response', { survey_id: SURVEY, submit: true, data: { goal: 'A better goal' } }));
    call('goal: a draft after submitting stays submitted', as('tokR', 'save_survey_response', { survey_id: SURVEY, data: { goal: 'Even better' } }));
    world.mailCfg.quota = 0;
    call('goal: copy with no quota left', as('tokN', 'save_survey_response', { survey_id: SURVEY, submit: true, data: Object.assign({}, goal, { name: 'Nia Two', email: 'n.two@aisa.sch.ae' }) }));
    world.mailCfg.quota = 100;
    world.mailCfg.failFor['n.two@aisa.sch.ae'] = true;
    call('goal: copy fails to send', as('tokN', 'save_survey_response', { survey_id: SURVEY, submit: true, data: { goal: 'Again' } }));
    world.mailCfg.failFor = {};
    world.mailCfg.unauthorized = true;
    call('goal: copy, mail never authorised', as('tokN', 'save_survey_response', { survey_id: SURVEY, submit: true, data: { goal: 'Third' } }));
    world.mailCfg.unauthorized = false;
    call('goal read: no id', as('tokR', 'get_survey_response', {}));
    call('goal read: unknown survey', as('tokR', 'get_survey_response', { survey_id: 'nope' }));
    call('goal read: own', as('tokR', 'get_survey_response', { survey_id: SURVEY }));
    call('goal admin: no id', as('tokA', 'admin_survey_responses', {}));
    call('goal admin: unknown survey', as('tokA', 'admin_survey_responses', { survey_id: 'nope', roster_tag: 'Elementary' }));
    call('goal admin: after the edits', as('tokA', 'admin_survey_responses', { survey_id: SURVEY, roster_tag: 'secondary', fresh: '1' }));

    // ----- Performance review round trip -----
    call('review: no form id', as('tokN', 'submit_form', { manager_email: 'admin@aisa.sch.ae' }));
    call('review: no manager', as('tokN', 'submit_form', { form_id: 'ta' }));
    call('review: manager outside the school', as('tokN', 'submit_form', { form_id: 'ta', manager_email: 'boss@gmail.com' }));
    call('review: no form url', as('tokN', 'submit_form', { form_id: 'tb', manager_email: ' T.One@aisa.sch.ae ', data: 'not an object' }));
    const subA = last().submission_id;
    call('review: form url with a query', as('tokN', 'submit_form', { form_id: 'tc', form_url: 'https://x/f?lang=ar', form_title: 'TC', manager_email: 'admin@aisa.sch.ae', manager_name: 'Ada', data: { q: [1, 2] } }));
    const subB = last().submission_id;
    call('review read: no id', as('tokN', 'get_form_submission', {}));
    call('review read: not found', as('tokN', 'get_form_submission', { submission_id: 's_nope' }));
    call('review read: staff', as('tokN', 'get_form_submission', { submission_id: subA }));
    call('review read: manager', as('tokT', 'get_form_submission', { submission_id: subA }));
    call('review read: anyone else', as('tokR', 'get_form_submission', { submission_id: subA }));
    call('review read: seeded, date-typed', as('tokA', 'get_form_submission', { submission_id: 's_1' }));
    call('review complete: no id', as('tokT', 'complete_form', {}));
    call('review complete: not found', as('tokT', 'complete_form', { submission_id: 's_nope' }));
    call('review complete: not the manager', as('tokN', 'complete_form', { submission_id: subA, data: { hijack: true } }));
    call('review complete: the manager', as('tokT', 'complete_form', { submission_id: subA, data: { rating: 'good' } }));
    call('review complete: the other manager', as('tokA', 'complete_form', { submission_id: subB, data: 'not an object' }));
    call('review read: completed', as('tokN', 'get_form_submission', { submission_id: subA }));
    call('review list: staff', as('tokN', 'list_my_submissions'));
    call('review list: manager', as('tokT', 'list_my_submissions'));
    call('review bell: staff', as('tokN', 'get_notifications'));

    // ----- Notifications and reminder emails -----
    const remind = (extra) => as('tokA', 'post_notification', Object.assign({
        title: 'Finish safeguarding', body: 'Please finish it.\n\nOpen: https://hub/pd\n\n\n\nThanks',
        target_emails: 't.one@aisa.sch.ae, N.Two@aisa.sch.ae, never@aisa.sch.ae, ghost@aisa.sch.ae',
        send_email: '1', email_link: 'https://hub/pd', email_link_label: 'Open it'
    }, extra || {}));
    call('notif: empty', as('tokA', 'post_notification', { title: '  ', body: '' }));
    call('notif: emailed reminder', remind());
    call('notif: email to a tag only', as('tokA', 'post_notification', { title: 'Tagged', body: 'b', target_tags: 'Secondary, MATH', send_email: 'true' }));
    call('notif: email as a boolean, no link', as('tokA', 'post_notification', { title: '', body: 'Body only <b>', target_emails: 'elem@aisa.sch.ae', send_email: true }));
    call('notif: email switched off', as('tokA', 'post_notification', { title: 'Off', body: 'b', target_emails: 'elem@aisa.sch.ae', send_email: 'no' }));
    world.mailCfg.failFor['never@aisa.sch.ae'] = true;
    world.mailCfg.failFor['ghost@aisa.sch.ae'] = true;
    call('notif: two addresses fail', remind({ title: '' }));
    world.mailCfg.failFor = {};
    world.mailCfg.quota = 2;
    call('notif: quota runs out mid-send', remind());
    world.mailCfg.quota = 0;
    call('notif: no quota left', remind());
    world.mailCfg.quota = 100;
    world.mailCfg.unauthorized = true;
    call('notif: mail never authorised', remind());
    call('newsletter status: mail never authorised', as('tokS', 'newsletter_status'));
    call('newsletter: mail never authorised', as('tokS', 'send_newsletter', { url: 'https://hub/n', test_only: '1' }));
    world.mailCfg.unauthorized = false;
    call('mark read: no id', as('tokT', 'mark_notification_read', {}));
    call('delete: no id', as('tokA', 'delete_notification', {}));
    call('delete: unknown id', as('tokA', 'delete_notification', { notification_id: 'n_nope' }));
    call('bell: teacher after all that', as('tokT', 'get_notifications'));
    call('stats after all that', as('tokA', 'admin_notification_stats'));

    // ----- The newsletter -----
    call('newsletter: link not http', as('tokS', 'send_newsletter', { url: 'ftp://x', test_only: '1' }));
    call('newsletter: no link', as('tokS', 'send_newsletter', { test_only: '1' }));
    call('newsletter: not confirmed', as('tokS', 'send_newsletter', { url: 'https://hub/n' }));
    call('newsletter: test_only spelled true', as('tokS', 'send_newsletter', { url: 'HTTPS://hub/n', test_only: 'TRUE' }));
    call('newsletter: the real thing', as('tokS', 'send_newsletter', {
        url: 'https://hub/n', confirm: '1', subject: 'Issue 6', issue: 'Issue No. 6', headline: 'Big <news>',
        intro: 'Line one\nLine two', link_label: 'Read it',
        items: ['First, with a comma', '  ', null, 'Second', '3', '4', '5', '6', '7', '8', 'ninth is cut'] }));
    world.mailCfg.msPerSend = 61 * 1000;
    call('newsletter: the six-minute cap', as('tokS', 'send_newsletter', { url: 'https://hub/n', confirm: '1', items: 'one\r\n\ntwo' }));
    world.mailCfg.msPerSend = 0;
    world.mailCfg.quota = 0;
    call('newsletter: no quota left', as('tokS', 'send_newsletter', { url: 'https://hub/n', confirm: '1' }));
    world.mailCfg.quota = 100;

    // ----- The dashboard bundle -----
    call('bundle: parts, odd spelling', as('tokA', 'admin_dashboard', { parts: 'nope, OVERVIEW' }));
    call('bundle: survey part without an id', as('tokA', 'admin_dashboard', { parts: 'survey' }));
    const dwellTab = world.ss._sheets.dwell;
    const realGetRange = dwellTab.getRange;
    dwellTab.getRange = () => { throw new Error('Service Spreadsheets timed out while accessing document'); };
    call('bundle: one part throws, the rest arrive', as('tokA', 'admin_dashboard', { parts: 'overview,dwell', fresh: '1' }));
    dwellTab.getRange = realGetRange;

    call('sign out the nameless', as(nonameTok, 'sign_out'));
    call('ravi signs out', as('tokR', 'sign_out'));
    call('ravi is signed out', as('tokR', 'whoami'));
    return log;
}

/* A brand-new spreadsheet. Every tab the Hub uses is created on first use,
 * with its header row; the roster is the one tab it never creates. */
function emptyScenario(files, world) {
    const log = [];
    const call = (label, body) => { log.push([label, post(files, world, body)]); };
    const tool = (label, fn) => { log.push([label, runTool(files, world, fn)]); };
    const as = (tok, action, extra) => Object.assign({ action: action, session_token: tok }, extra || {});

    tool('audit before anything exists', 'auditHubData');
    tool('dwell migration with no dwell tab', 'migrateDwellToPerModule');
    call('first sign-in', { action: 'create_session', user_agent: 'ua', id_token: JSON.stringify({
        aud: OAUTH, hd: 'aisa.sch.ae', email_verified: 'true', exp: String(Math.floor(world.clock.t / 1000) + 3600),
        email: 'first@aisa.sch.ae', name: 'First Person' }) });
    const tok = log[log.length - 1][1].session_token;
    call('whoami', as(tok, 'whoami'));
    call('completions', as(tok, 'get_completions'));
    call('bell', as(tok, 'get_notifications'));
    call('mark all read, nothing to read', as(tok, 'mark_all_notifications_read'));
    call('mark one read', as(tok, 'mark_notification_read', { notification_id: 'n_x' }));
    call('line managers', as(tok, 'get_line_managers'));
    call('my submissions', as(tok, 'list_my_submissions'));
    call('review read', as(tok, 'get_form_submission', { submission_id: 's_1' }));
    call('review complete', as(tok, 'complete_form', { submission_id: 's_1' }));
    call('own answers', as(tok, 'get_module_response', { module_id: RESP_MODULE }));
    call('own goal', as(tok, 'get_survey_response', { survey_id: SURVEY }));
    call('event', as(tok, 'record_event', { module_id: 'm', event: 'completed', progress_pct: 100 }));
    call('pageview', as(tok, 'record_pageview', { page_path: '/' }));
    call('click', as(tok, 'record_click', { label: 'go' }));
    call('dwell', as(tok, 'record_dwell', { module_id: 'm', chapters: [{ seconds: 30 }] }));
    call('answers', as(tok, 'save_module_response', { module_id: RESP_MODULE, segment_id: 'a', notify_admins: true, data: { needs_before: 'help' } }));
    call('goal draft', as(tok, 'save_survey_response', { survey_id: SURVEY, data: { name: 'First' } }));
    call('review', as(tok, 'submit_form', { form_id: 'ta', manager_email: 'boss@aisa.sch.ae' }));
    call('newsletter status, not a sender', as(tok, 'newsletter_status'));

    // The owner adds them to the admins tab by hand; it shows once the
    // cached copy of that tab expires.
    world.ss._sheets.admins._sh.rows.push(['first@aisa.sch.ae', 'First', 'slt']);
    world.clock.t += 11 * MIN;
    call('overview, no roster tab', as(tok, 'admin_overview'));
    call('bundle, nearly empty', as(tok, 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
    call('notif stats, nearly empty', as(tok, 'admin_notification_stats'));
    call('tags, no roster tab', as(tok, 'admin_list_tags'));
    call('goals, no roster tab', as(tok, 'admin_survey_responses', { survey_id: SURVEY, roster_tag: 'secondary' }));
    call('post a broadcast', as(tok, 'post_notification', { title: 'Hello', body: 'Everyone' }));
    call('bell after the broadcast', as(tok, 'get_notifications'));
    call('delete it', as(tok, 'delete_notification', { notification_id: log[log.length - 2][1].id }));
    tool('audit once things exist', 'auditHubData');
    call('sign out', as(tok, 'sign_out'));
    call('signed out', as(tok, 'whoami'));
    return log;
}

/* The functions people run from the Apps Script editor. They return a
 * value (or throw) rather than answering a request. */
function runTool(files, world, fnName) {
    try {
        const v = execute(files, world, fnName, []);
        return v === undefined ? { returned: 'undefined' } : { returned: v };
    } catch (e) {
        return { threw: String(e && e.message || e) };
    }
}

function toolsScenario(files, world) {
    const log = [];
    const call = (label, body) => { log.push([label, post(files, world, body)]); };
    const tool = (label, fn) => { log.push([label, runTool(files, world, fn)]); };
    const as = (tok, action, extra) => Object.assign({ action: action, session_token: tok }, extra || {});

    tool('audit', 'auditHubData');
    tool('authorise mail', 'authorizeMail');
    call('dashboard, to fill the cache', as('tokA', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
    tool('flush the cache', 'flushHubCache');
    call('dashboard after the flush', as('tokA', 'admin_dashboard', { module_id: RESP_MODULE, survey_id: SURVEY }));
    world.clock.t = Date.parse('2026-09-23T05:00:00Z');   // 09:00 Abu Dhabi
    tool('warm the cache in school hours', 'warmHubCache');
    world.clock.t = Date.parse('2026-09-23T16:30:00Z');   // 20:30 Abu Dhabi
    tool('warm the cache after hours', 'warmHubCache');
    world.clock.t = Date.parse('2026-09-24T05:00:00Z');
    tool('migration on a migrated tab', 'migrateDwellToPerModule');

    // A dwell tab still on the old one-row-per-chapter layout.
    world.ss._sheets.dwell._sh.rows = legacyDwellRows();
    world.clock.t += 2 * 3600 * 1000;   // past the hour the layout check is remembered for
    call('record dwell refused before migrating', as('tokT', 'record_dwell', { module_id: 'ai-ethics', chapters: [{ seconds: 5 }] }));
    call('admin dwell refused before migrating', as('tokA', 'admin_dwell', { fresh: '1' }));
    call('bundle before migrating', as('tokA', 'admin_dashboard', { parts: 'dwell', fresh: '1' }));
    tool('audit before migrating', 'auditHubData');
    tool('migrate', 'migrateDwellToPerModule');
    tool('migrate again', 'migrateDwellToPerModule');
    call('admin dwell after migrating', as('tokA', 'admin_dwell', { fresh: '1' }));
    call('record dwell after migrating', as('tokT', 'record_dwell', { module_id: 'ai-ethics', chapters: [{ seconds: 5 }, { seconds: 7 }] }));
    tool('audit after migrating', 'auditHubData');
    return log;
}

const SUITES = [
    { name: 'main', seed: seed, scenario: (f, w) => scenario(f, w, { bundle: true }), cacheComparable: true },
    { name: 'edge cases', seed: seed, scenario: edgeScenario, cacheComparable: true },
    { name: 'empty spreadsheet', seed: () => ({}), scenario: emptyScenario, cacheComparable: true },
    /* Not compared cache on/off: flushHubCache is meant to throw when the
     * cache service is down, and the warmer is meant to do nothing. */
    { name: 'editor tools', seed: seed, scenario: toolsScenario, cacheComparable: false }
];

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
    const show = (x) => { const s = JSON.stringify(x); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; };
    return where + ': ' + show(a) + '  vs  ' + show(b);
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

/* Everything a run leaves behind, raw: nothing normalised, nothing sorted
 * that the backend did not sort itself. */
function strictDump(r) {
    const w = r.world;
    const tabs = Object.keys(w.ss._sheets);
    const raw = (v) => (v instanceof Date) ? { date: v.getTime() } : (v === undefined ? { undefined: true } : v);
    return {
        responses: r.log,
        tabs: tabs,
        cells: tabs.map((n) => [n, w.ss._sheets[n]._sh.rows.map((row) => (row || []).map(raw))]),
        mail: w.mail,
        log: w.logs,
        cache: Array.from(w.cache.store.entries()).map((e) => [e[0], e[1].v, e[1].exp])
            .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
        io: tabs.map((n) => {
            const st = w.ss._sheets[n]._stats;
            return [n, 'reads ' + st.reads, 'cells read ' + st.cellsRead, 'writes ' + st.writes];
        }),
        clock: w.clock.t,
        random: [w.random(), w.uuid]
    };
}

const STRICT_PARTS = [
    ['tabs', 'the same tabs, in the same order'],
    ['cells', 'every cell identical'],
    ['mail', 'every email identical (to, subject, text, HTML, reply-to)'],
    ['log', 'the editor log identical'],
    ['cache', 'the cache holds exactly the same entries'],
    ['io', 'the same sheet reads (and cells read) and writes, tab by tab'],
    ['clock', 'the clock in the same place'],
    ['random', 'the same random numbers and ids drawn']
];

function compareStrict(label, runA, runB) {
    const A = strictDump(runA), B = strictDump(runB);
    let bad = 0;
    const n = Math.max(A.responses.length, B.responses.length);
    for (let i = 0; i < n; i++) {
        const d = firstDiff(A.responses[i], B.responses[i]);
        if (d) { bad++; if (bad <= 4) check(label + ': response ' + (i + 1) + ' (' + (A.responses[i] || B.responses[i])[0] + ')', false, d); }
    }
    if (bad > 4) check(label + ': … and ' + (bad - 4) + ' more differing responses', false);
    if (!bad) check(label + ': all ' + n + ' responses identical, byte for byte', true);
    const fine = [];
    STRICT_PARTS.forEach((p) => {
        const d = firstDiff(A[p[0]], B[p[0]]);
        if (d) check(label + ': ' + p[1], false, d);
        else fine.push(p[0]);
    });
    if (fine.length === STRICT_PARTS.length) {
        check(label + ': ' + STRICT_PARTS.map((p) => p[0]).join(', ') + ' — all identical', true);
    }
}

function sheetReads(world) {
    return Object.keys(world.ss._sheets).reduce((n, k) => n + world.ss._sheets[k]._stats.reads, 0);
}

function runSuite(files, suite, opts) {
    const world = makeWorld(suite.seed(), opts);
    const log = suite.scenario(files, world);
    return { world: world, log: log, sheets: sheetDump(world), reads: sheetReads(world) };
}

/* The main scenario only, without the bundle: what the lenient baseline
 * comparison has always run, so a backend from before admin_dashboard
 * existed can still be compared. */
function run(files, opts) {
    const world = makeWorld(seed(), opts);
    const log = scenario(files, world, opts);
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

/* Who may do what. Checked directly rather than only through the
 * scenario comparisons, because a backend that refused nobody would still
 * agree with itself with the cache on and off. */
function permissions(files) {
    const as = (tok, action, extra) => Object.assign({ action: action, session_token: tok }, extra || {});
    const world = makeWorld(seed());
    /* A session's first request writes its last_used time, whatever it
     * asks for. Get that out of the way so "wrote nothing" means it. */
    post(files, world, as('tokT', 'whoami'));
    post(files, world, as('tokA', 'whoami'));
    const before = JSON.stringify(sheetDump(world));
    const allowed = [];
    ADMIN_ONLY.forEach((a) => {
        const r = post(files, world, as('tokT', a, {
            survey_id: SURVEY, notification_id: 'n2', title: 'x', body: 'y', fresh: '1'
        }));
        if (!(r.ok === false && r.error === 'not_admin')) allowed.push(a + ' → ' + JSON.stringify(r).slice(0, 80));
    });
    check('a teacher is refused all ' + ADMIN_ONLY.length + ' admin-only actions', !allowed.length, allowed.join('; '));
    const nl = post(files, world, as('tokA', 'send_newsletter', { url: 'https://hub/n', confirm: '1' }));
    check('an admin who is not a newsletter sender cannot mail the school',
          nl.ok === false && nl.error === 'not_newsletter_sender' && world.mail.length === 0, JSON.stringify(nl));
    check('…and none of those refusals wrote anything', JSON.stringify(sheetDump(world)) === before);
    const st = post(files, world, as('tokT', 'newsletter_status'));
    check('newsletter_status tells a non-sender only that', JSON.stringify(st) === '{"ok":true,"may_send":false}', JSON.stringify(st));
    const odd = ['toString', '__proto__', 'constructor', 'hasOwnProperty'].map((a) => post(files, world, as('tokT', a)).error);
    check('names inherited from Object are unknown actions, not handlers',
          odd.every((e) => e === 'unknown_action'), odd.join(', '));
    const listed = post(files, world, as('tokT', ['whoami'])).error;
    check('an action sent as a list is not an action', listed === 'unknown_action', listed);
}

/* ------------------------------------------------------------------ */

function describe(files) {
    const lines = files.reduce((n, f) => n + f.src.split('\n').length, 0);
    return files.length === 1 ? files[0].name + ' (' + lines + ' lines)'
                              : files.length + ' files, ' + lines + ' lines';
}

function main() {
    const args = process.argv.slice(2);
    const valueOf = (name) => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
    const files = loadBackend(valueOf('--backend') || BACKEND);
    const baselinePath = valueOf('--baseline');
    const strict = args.indexOf('--strict') !== -1;

    console.log('Apps Script backend simulator — ' + describe(files) + '\n');
    console.log('Same scenarios, cache working vs cache broken:');
    SUITES.filter((s) => s.cacheComparable).forEach((s) => {
        const on = runSuite(files, s, {});
        const off = runSuite(files, s, { cacheBroken: true });
        compareRuns(s.name + ': cache on', on, 'cache broken', off);
    });

    if (baselinePath) {
        const old = loadBackend(baselinePath);
        if (strict) {
            console.log('\nEvery scenario, this backend vs ' + baselinePath + ' (' + describe(old) + '), strictly:');
            SUITES.forEach((s) => compareStrict(s.name, runSuite(old, s, {}), runSuite(files, s, {})));
        } else {
            console.log('\nSame scenario, this backend vs ' + baselinePath + ':');
            const before = run(old, {});
            const now = run(files, {});
            compareRuns('baseline', before, 'this version', now, { baseline: true });
            console.log('  sheet range reads for the whole scenario: baseline ' + before.reads + ', this version ' + now.reads);
        }
    }

    console.log('\nCache-specific behaviour:');
    targeted(files);

    console.log('\nPermissions:');
    permissions(files);

    console.log('\n' + (failures ? failures + ' failure(s)' : 'all checks passed'));
    process.exit(failures ? 1 : 0);
}

/* Runnable on its own, and requireable for a browser-level test that wants
 * a simulated backend behind the real pages. */
if (require.main === module) main();
else module.exports = { makeWorld: makeWorld, seed: seed, execute: execute, post: post, loadBackend: loadBackend };
