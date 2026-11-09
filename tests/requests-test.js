/* tests/requests-test.js — "Request or report" and the Requests inbox in Chromium, on made-up data (9 Nov 2026).
 *
 *   node tests/requests-test.js
 *
 * Serves the repository on a local port and runs the REAL auth/gate.js and menu.js, signed in as a made-up person
 * (a session in localStorage); the Hub's server is answered here, at the network, so every call goes through gate.js
 * as it would live. Checks: the menu's link carries the page; each kind's required answers block sending and are marked;
 * a training request sends what was asked (lists, "Other", the person's role, the page they came from) and is then shown
 * under "Your requests"; a draft survives a reload; a problem report fills in the page and offers the errors the tab
 * saw (and leaves them out when unticked); the inbox lists, filters and searches, writes the AI prompt with the rules and
 * every answer, and saves a status; a teacher is refused it; no sideways scroll at 390px; no console errors.
 * Skips (exit 0) when Playwright is not installed. Made-up people only (@school.example).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(cond, msg) { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed++; }

function serve() {
    return new Promise(resolve => {
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
        const srv = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split('?')[0]);
            const f = path.join(ROOT, u);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
            fs.createReadStream(f).pipe(res);
        }).listen(0, '127.0.0.1', () => resolve(srv));
    });
}

/* ---------- the server, made up ---------- */
const sent = [], updates = [];
let isAdmin = false;
const stored = [
    { id: 7, created_at: '2026-11-08T09:15:00+04:00', email: 'tia@school.example', name: 'Tia Teacher', kind: 'training', title: 'Feedback on lab reports with AI',
      details: { why: 'Marking takes a weekend.', outcomes: 'Set up a feedback bot\nUse our rubric', audience: ['Secondary teachers', 'Other'], audience_other: 'Science technicians',
                 format: ['Self-paced module on the Hub (like the PD modules)'], urgency: 'Urgent: people are stuck now', arabic: true, role: 'Teacher', teach: 'Grade 9 Science' },
      context: { came_from: '/PD%20Modules/pd.html', browser: 'Chrome 131', system: 'Windows' }, status: 'new', admin_note: '', updated_at: '', updated_by: '',
      person: { designation: 'Science Teacher', department: 'Secondary - Science', division: 'Secondary', tags: ['secondary'] }, is_admin: false },
    { id: 6, created_at: '2026-11-07T10:00:00+04:00', email: 'uma@school.example', name: 'Uma Support', kind: 'bug', title: 'Certificate is blank',
      details: { where: 'A certificate', what_happened: 'The PDF is empty.', steps: '1. Open My Dashboard\n2. Download' },
      context: { errors: ['10:01:02 /dashboard.html — TypeError: x is undefined (/auth/certificate.js:12)'] }, status: 'done', admin_note: 'Fixed.', updated_at: '2026-11-08T10:00:00+04:00',
      updated_by: 'ada@school.example', person: null, is_admin: false },
    { id: 5, created_at: '2026-11-06T10:00:00+04:00', email: 'vic@school.example', name: 'Vic Viewer', kind: 'idea', title: 'Dark mode',
      details: { problem: 'Bright at night.', priority: 'Nice to have' }, context: {}, status: 'planned', admin_note: '', updated_at: '', updated_by: '', person: null, is_admin: false }
];
function answer(body) {
    switch (body.action) {
        case 'record_pageview': case 'record_click': case 'record_dwell': return { ok: true };
        case 'whoami': return { ok: true, email: 'me@school.example', name: 'Made Up', is_admin: isAdmin };
        case 'get_notifications': return { ok: true, notifications: [], unread: 0 };
        case 'get_completions': return { ok: true, completions: [] };
        case 'submit_request':
            if (body.kind === 'boom') return { ok: false, error: 'server_error' };
            sent.push(body);
            return { ok: true, id: 40 + sent.length, notified: 1 };
        case 'my_requests':
            return { ok: true, requests: sent.map((b, i) => ({ id: 41 + i, created_at: '2026-11-09T10:00:00+04:00', kind: b.kind, title: b.title, details: b.details,
                status: i === 0 ? 'planned' : 'new', admin_note: i === 0 ? 'On the list for next week.' : '', updated_at: '' })) };
        case 'admin_requests':
            if (!isAdmin) return { ok: false, error: 'not_admin' };
            return { ok: true, generated_at: '2026-11-09T12:00:00+04:00', requests: stored, statuses: ['new', 'planned', 'in_progress', 'done', 'declined'],
                     counts: { new: 1, planned: 1, in_progress: 0, done: 1, declined: 0 } };
        case 'admin_request_update':
            if (!isAdmin) return { ok: false, error: 'not_admin' };
            updates.push(body);
            return { ok: true, id: body.id, status: body.status, status_before: 'new', told: body.notify !== false };
        default: return { ok: false, error: 'unknown_action' };
    }
}

(async () => {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip (no playwright)'); return; }
    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(() => {
        if (!localStorage.getItem('aisa_auth_v2')) localStorage.setItem('aisa_auth_v2', JSON.stringify({
            email: 'me@school.example', name: 'Made Up', sessionToken: 'tok-test', expiresAt: Date.now() + 864e5 }));
    });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com/, r => r.abort());
    await ctx.route(/supabase\.co\/functions\/v1\/learning-hub/, async r => {
        const body = JSON.parse(r.request().postData() || '{}');
        await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer(body)) });
    });
    const errors = [];
    async function open(rel, viewport) {
        const page = await ctx.newPage();
        if (viewport) await page.setViewportSize(viewport);
        page.on('pageerror', e => errors.push(rel + ': ' + e));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(rel + ': ' + m.text()); });
        await page.goto(base + rel);
        return page;
    }
    const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

    try {
        /* ---------- the menu's link ---------- */
        let page = await open('PD%20Modules/pd.html');
        await page.waitForSelector('.aisa-menu-request', { state: 'attached', timeout: 15000 });
        const href = await page.getAttribute('.aisa-menu-request', 'href');
        ok(/request\.html\?from=%2FPD%2520Modules%2Fpd\.html$/.test(href), 'the menu links to the form with the page it is on: ' + href);
        /* a failed call is remembered for a problem report */
        await page.evaluate(() => window.aisaAuth.adminRoster('admin_roster_list').catch(() => {}));
        await page.evaluate(() => { setTimeout(() => { throw new Error('made-up crash'); }, 0); });
        await page.waitForTimeout(300);
        const remembered = await page.evaluate(() => window.aisaAuth.recentErrors());
        ok(remembered.some(e => /admin_roster_list failed: unknown_action/.test(e.msg)) && remembered.some(e => /made-up crash/.test(e.msg) && /pd\.html$/.test(e.page)),
            'gate.js remembers a refused call and a script error on the tab, with the page');
        ok(remembered.every(e => !/tok-test/.test(JSON.stringify(e))), 'and never the session token');
        errors.length = 0;   // that crash was on purpose

        /* ---------- a training request ---------- */
        await page.goto(base + href.replace(/^.*request\.html/, 'request.html'));
        await page.waitForSelector('.rq-kind');
        ok((await page.$$('.rq-kind')).length === 3, 'three kinds to choose from');
        ok(await page.isHidden('#rq-form'), 'the form waits for a choice');
        await page.click('.rq-kind:has(input[value=training])');
        ok(await page.isVisible('#rq-f-title') && await page.evaluate(() => document.activeElement && document.activeElement.id === 'rq-f-title'), 'choosing a training shows its questions, and the first one has the focus');
        await page.click('#rq-send');
        const bad = await page.$$eval('.rq-q.bad', qs => qs.map(q => q.dataset.key));
        ok(JSON.stringify(bad) === JSON.stringify(['title', 'why', 'outcomes', 'audience']), 'sending with nothing marks every required question: ' + bad);
        ok(sent.length === 0 && /required answers are missing/.test(await page.textContent('#rq-problem')), 'and sends nothing');
        await page.fill('#rq-f-title', 'Using AI to give feedback on lab reports');
        ok(!(await page.$('.rq-q.bad[data-key=title]')), 'an answer clears its mark');
        await page.fill('#rq-f-why', 'Marking 120 lab reports takes a weekend.');
        await page.fill('#rq-f-outcomes', 'Set up a feedback bot\nUse our rubric');
        await page.check('.rq-q[data-key=audience] input[value="Secondary teachers"]');
        await page.check('.rq-q[data-key=audience] input[value="Other"]');
        await page.fill('input[name=audience_other]', 'Science technicians');
        await page.check('.rq-q[data-key=format] input[value^="Self-paced"]');
        await page.check('.rq-q[data-key=urgency] input[value^="Soon"]');
        await page.check('#rq-f-arabic');
        await page.selectOption('#rq-f-role', 'Teacher');
        await page.fill('#rq-f-teach', 'Grade 9 Science');
        await page.waitForTimeout(700);
        /* a reload keeps the draft */
        await page.reload();
        await page.waitForSelector('#rq-f-title');
        ok(await page.inputValue('#rq-f-title') === 'Using AI to give feedback on lab reports' && await page.isChecked('input[name=audience][value=Other]') &&
           await page.inputValue('input[name=audience_other]') === 'Science technicians' && await page.inputValue('#rq-f-role') === 'Teacher',
           'a reload brings the draft back, ticks and "Other" included');
        await page.click('#rq-send');
        await page.waitForSelector('#rq-done:not([hidden])');
        const t = sent[0];
        ok(t && t.kind === 'training' && t.title === 'Using AI to give feedback on lab reports', 'the request is sent');
        ok(JSON.stringify(t.details.audience) === JSON.stringify(['Secondary teachers', 'Other']) && t.details.audience_other === 'Science technicians' &&
           t.details.arabic === true && t.details.urgency === 'Soon: this term' && t.details.role === 'Teacher' && t.details.teach === 'Grade 9 Science' &&
           t.details.outcomes === 'Set up a feedback bot\nUse our rubric' && !('title' in t.details), 'with every answer as asked (lists, Other, yes ticks, their role)');
        ok(t.context.came_from === '/PD Modules/pd.html' && /Chrome/.test(t.context.browser) && t.context.screen && !t.context.errors, 'and the page they came from and their browser (no errors with a training)');
        ok(/number 41/.test(await page.textContent('#rq-done-text')), 'the thank-you gives its number');
        await page.waitForSelector('.rq-item');
        ok(/Using AI to give feedback/.test(await page.textContent('#rq-mine')) && /Planned/.test(await page.textContent('#rq-mine')) &&
           /On the list for next week/.test(await page.textContent('#rq-mine')), '"Your requests" shows it, with its status and the team\'s note');
        await page.click('#rq-again');
        ok(await page.inputValue('#rq-f-title') === '' && await page.inputValue('#rq-f-role') === 'Teacher', '"Send another" starts a clean form, keeping who they are');

        /* ---------- a problem report ---------- */
        await page.goto(base + 'PD%20Modules/pd.html');
        await page.waitForSelector('.aisa-menu-request', { state: 'attached', timeout: 15000 });
        await page.evaluate(() => window.aisaAuth.adminRoster('admin_roster_list').catch(() => {}));
        await page.waitForTimeout(200);
        await page.goto(base + 'request.html?type=bug&from=' + encodeURIComponent('/dashboard.html#certificates'));
        await page.waitForSelector('#rq-f-what_happened');
        ok(await page.inputValue('#rq-f-page') === '/dashboard.html#certificates', '?type=bug opens a problem report with the page filled in');
        ok(await page.isVisible('#rq-errs-wrap') || await page.evaluate(() => !document.getElementById('rq-errs-wrap').hidden), 'it offers the errors this tab saw');
        await page.fill('#rq-f-title', 'Certificate is blank');
        await page.click('#rq-send');
        const badBug = await page.$$eval('.rq-q.bad', qs => qs.map(q => q.dataset.key));
        ok(JSON.stringify(badBug) === JSON.stringify(['where', 'what_happened']), 'a problem needs where and what happened: ' + badBug);
        await page.selectOption('#rq-f-where', 'A certificate');
        await page.fill('#rq-f-what_happened', 'The PDF is empty.');
        await page.click('#rq-send');
        await page.waitForSelector('#rq-done:not([hidden])');
        const b = sent[1];
        ok(b.kind === 'bug' && b.details.page === '/dashboard.html#certificates' && Array.isArray(b.context.errors) &&
           b.context.errors.some(e => /admin_roster_list failed/.test(e)), 'the report goes with the page and the errors');
        await page.click('#rq-again');
        await page.fill('#rq-f-title', 'Second report');
        await page.selectOption('#rq-f-where', 'Search');
        await page.fill('#rq-f-what_happened', 'No results.');
        await page.evaluate(() => { const c = document.getElementById('rq-errs-ok'); c.checked = false; c.dispatchEvent(new Event('change')); });
        await page.click('#rq-send');
        await page.waitForSelector('#rq-done:not([hidden])');
        ok(!sent[2].context.errors, 'unticked, the errors stay out');

        /* an idea, on a phone */
        const phone = await open('request.html?type=idea', { width: 390, height: 844 });
        await phone.waitForSelector('#rq-f-problem');
        ok(await noSideways(phone), 'no sideways scroll at 390px');
        await phone.close();
        await page.close();

        /* ---------- the inbox ---------- */
        const teacher = await open('admin-requests.html');
        await teacher.waitForSelector('#state-denied:not([hidden])');
        ok(true, 'a teacher is told the inbox is for admins');
        await teacher.close();

        isAdmin = true;
        const inbox = await open('admin-requests.html');
        await inbox.waitForSelector('.ri-req');
        await inbox.evaluate(() => localStorage.removeItem('aisa_requests_view_v1'));
        await inbox.reload();
        await inbox.waitForSelector('.ri-req');
        let ids = await inbox.$$eval('.ri-req', a => a.map(x => x.id));
        ok(JSON.stringify(ids) === JSON.stringify(['r7', 'r5']), 'it opens on the open requests: ' + ids);
        ok(/Urgent/.test(await inbox.textContent('#r7')) && /Science Teacher, Secondary - Science/.test(await inbox.textContent('#r7')), 'with who sent it, their job, and urgency');
        await inbox.click('.ri-pill:has-text("All")');
        ids = await inbox.$$eval('.ri-req', a => a.map(x => x.id));
        ok(ids.length === 3, 'All shows the done ones too');
        await inbox.selectOption('#ri-kind', 'bug');
        ok((await inbox.$$('.ri-req')).length === 1, 'the kind filter');
        await inbox.selectOption('#ri-kind', '');
        await inbox.fill('#ri-q', 'rubric');
        await inbox.waitForTimeout(250);
        ok(JSON.stringify(await inbox.$$eval('.ri-req', a => a.map(x => x.id))) === '["r7"]', 'search reads the answers');
        await inbox.fill('#ri-q', '');
        await inbox.waitForTimeout(250);

        const prompt = await inbox.evaluate(() => window.aisaRequestPrompt([7]));
        if (process.env.SHOW_PROMPT) console.log(prompt);
        ok(/AISA-AI-web\/The-Learning-Hub/.test(prompt) && /CLAUDE\.md/.test(prompt) && /PUBLIC/.test(prompt) && /pull request/.test(prompt), 'the prompt says where the code is and the rules');
        ok(/TRAINING REQUEST #7: Feedback on lab reports with AI/.test(prompt) && /What is prompting this\? What problem would it solve\? Marking takes a weekend\./.test(prompt) &&
           /Secondary teachers; Other: Science technicians/.test(prompt) && /It should be in Arabic as well as English: Yes/.test(prompt) &&
           /By the end, people should be able to…\n  Set up a feedback bot\n  Use our rubric/.test(prompt), 'every answer, under its question');
        ok(/Science Teacher, Secondary - Science/.test(prompt) && /never put this in the repository/.test(prompt), 'who sent it, marked as not for the repository');
        ok(/What to do with a training request/.test(prompt) && /MODULES/.test(prompt) && !/What to do with a problem report/.test(prompt), 'and what to do with a training (only)');
        const both = await inbox.evaluate(() => window.aisaRequestPrompt([7, 6]));
        ok(/THE 2 REQUESTS/.test(both) && /1\. TRAINING REQUEST #7/.test(both) && /2\. PROBLEM REPORT #6/.test(both) && /What to do with a problem report/.test(both) &&
           /Errors the Hub noticed on their tab:\n  10:01:02/.test(both), 'several at once: each request, its errors, and what to do with each kind');
        await inbox.check('#r7 input[type=checkbox]');
        ok(!(await inbox.isDisabled('#ri-sel-copy')) && /1 selected/.test(await inbox.textContent('#ri-sel-text')), 'ticking one offers one prompt for the selected');

        await inbox.click('#r7 summary');
        await inbox.selectOption('#ri-s-7', 'in_progress');
        await inbox.fill('#ri-n-7', 'Drafting it this week.');
        await inbox.click('#r7 .ri-side button');
        await inbox.waitForSelector('#r7 .msg.good');
        ok(updates.length === 1 && updates[0].id === 7 && updates[0].status === 'in_progress' && updates[0].note === 'Drafting it this week.' && updates[0].notify === true,
            'saving sends the status and note, and tells them');
        ok(/In progress/.test(await inbox.textContent('#r7 .ri-chips')) && /they have been told/.test(await inbox.textContent('#r7 .msg')), 'and the card shows it');
        ok(await noSideways(inbox), 'no sideways scroll on a laptop');
        await inbox.setViewportSize({ width: 390, height: 844 });
        ok(await noSideways(inbox), 'nor at 390px');
        await inbox.close();

        ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } catch (e) {
        failed++;
        console.log('FAIL ' + (e && e.stack || e));
    } finally {
        await browser.close();
        srv.close();
    }
    console.log(failed ? failed + ' failed' : 'all passed');
    process.exit(failed ? 1 : 0);
})();
