/* tests/admin-notes-test.js — the Notes panel on Hub Analytics (admin-notes.js), in Chromium, on made-up data (9 Nov 2026).
 *
 *   node tests/admin-notes-test.js
 *
 * Stands in for gate.js with a small in-memory version of the server's note actions (the server itself is tested in
 * AISA-AI-web/AI-Lessons, supabase/test/learning-hub-notes.test.mjs). Checks: the button and its count, writing a note
 * with a topic, the open/done filters, a reply showing, only the writer's own notes have Edit and Delete, editing,
 * deleting, Escape closing the panel, the "server not updated" message, and no console errors. Skips without Playwright.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(c, m) { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; }

const now = new Date(Date.now() - 3600e3).toISOString();
const ME = 'ada.admin@school.example';
function stub(opts) {
    return `(function () {
  var ME = ${JSON.stringify(ME)}, seq = 10, notes = ${JSON.stringify([
        { id: 1, page: 'analytics', topic: 'Newsletter', body: 'Bo asks: why is reach so low?', author_email: 'bo.admin@school.example', author_name: 'Bo Admin',
          status: 'done', reply: 'The 30 Oct issue was held for release.', reply_by: 'claude', created_at: now, updated_at: now, done_at: now }
    ])};
  var unknown = ${!!(opts && opts.unknown)};
  var bundle = { ok: true, overview: { ok: true, generated_at: ${JSON.stringify(now)}, people: [{ email: ME, name: 'Ada Admin', last_seen: ${JSON.stringify(now)} }], completions: [] },
                 dwell: { ok: true, rows: [] }, module_responses: { ok: true, responses: [] }, survey: { ok: true, responses: [], outstanding: [], fields: [] } };
  window.__notes = notes;
  var auth = {
    isConfigured: function () { return true; },
    whoami: function () { return Promise.resolve({ email: ME }); },
    adminDashboard: function () { return Promise.resolve(JSON.parse(JSON.stringify(bundle))); },
    adminRoster: function (action, p) {
      if (unknown) return Promise.reject(new Error('unknown_action'));
      var live = function () { return notes.filter(function (n) { return !n.deleted; }); };
      var find = function (id) { return live().filter(function (n) { return n.id === id; })[0]; };
      if (action === 'admin_notes_list') return Promise.resolve({ ok: true, notes: JSON.parse(JSON.stringify(live().filter(function (n) { return n.page === p.page; }))) });
      if (action === 'admin_note_save') {
        if (!String(p.body || '').trim()) return Promise.resolve({ ok: false, error: 'empty_note' });
        if (p.id) { var n = find(p.id); if (!n || n.author_email !== ME) return Promise.resolve({ ok: false, error: 'not_yours' }); n.body = p.body.trim(); n.updated_at = new Date().toISOString(); return Promise.resolve({ ok: true, id: n.id }); }
        var t = new Date().toISOString();
        notes.push({ id: ++seq, page: p.page, topic: p.topic || '', body: p.body.trim(), author_email: ME, author_name: 'Ada Admin', status: 'open', reply: '', reply_by: '', created_at: t, updated_at: t, done_at: null });
        return Promise.resolve({ ok: true, id: seq, created: true });
      }
      if (action === 'admin_note_status') { var m = find(p.id); m.status = p.status; m.done_at = p.status === 'done' ? new Date().toISOString() : null; return Promise.resolve({ ok: true }); }
      if (action === 'admin_note_delete') { var d = find(p.id); if (d.author_email !== ME) return Promise.resolve({ ok: false, error: 'not_yours' }); d.deleted = true; return Promise.resolve({ ok: true }); }
      return Promise.reject(new Error('unknown_action'));
    }
  };
  window.aisaAuth = auth;
  window.aisaReady = function (cb) { cb(auth); };
})();`;
}

function serve(opts) {
    return new Promise(resolve => {
        const srv = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split('?')[0]);
            if (u === '/auth/gate.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(stub(opts)); return; }
            const f = path.join(ROOT, u);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : (f.endsWith('.html') ? 'text/html' : 'application/octet-stream') });
            fs.createReadStream(f).pipe(res);
        }).listen(0, '127.0.0.1', () => resolve(srv));
    });
}

(async () => {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip (no playwright)'); return; }
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const errors = [];
    async function open(opts) {
        const srv = await serve(opts);
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.on('pageerror', e => errors.push(String(e)));
        await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
        page.on('dialog', d => d.accept());
        await page.goto('http://127.0.0.1:' + srv.address().port + '/admin-analytics.html');
        await page.waitForSelector('#f-notes');
        return { page, srv };
    }
    try {
        let { page, srv } = await open();
        ok(await page.isVisible('#f-notes'), 'a Notes button in the page’s actions');
        await page.click('#f-notes');
        ok(await page.isVisible('.hn-panel'), 'it opens the notes panel');
        ok((await page.textContent('.hn-list')).includes('No open notes'), 'it opens on the open notes (none yet)');
        await page.click('.hn-filter button[data-f="done"]');
        const done = await page.textContent('.hn-list');
        ok(done.includes('why is reach so low') && done.includes('Reply from Claude') && done.includes('held for release'), 'a done note shows with Claude’s reply');
        ok(!(await page.$('.hn-note .hn-btn.danger')), 'someone else’s note has no Delete');
        await page.click('.hn-btn.primary');
        ok((await page.textContent('.hn-msg')).includes('Write something'), 'an empty note is refused');
        await page.selectOption('.hn-form select', 'AI Literacy readiness');
        await page.fill('.hn-form textarea', 'Measure AI Literacy against the 62 only.');
        await page.click('.hn-btn.primary');
        await page.waitForFunction(() => document.querySelector('.hn-list').textContent.includes('against the 62'));
        const open1 = await page.textContent('.hn-list');
        ok(open1.includes('AI Literacy readiness') && open1.includes('Ada Admin') && open1.includes('Open'), 'a new note shows, open, with its topic and writer');
        ok((await page.textContent('#f-notes .hn-count')).trim() === '1', 'the button counts the open notes');
        await page.click('.hn-note .hn-btn:has-text("Edit")');
        await page.fill('.hn-edit textarea', 'Measure AI Literacy against the 62 assigned teachers only.');
        await page.click('.hn-note .hn-btn.primary:has-text("Save")');
        await page.waitForFunction(() => document.querySelector('.hn-list').textContent.includes('assigned teachers only'));
        ok(true, 'the writer edits their note');
        await page.click('.hn-note .hn-btn:has-text("Mark done")');
        await page.waitForFunction(() => document.querySelector('.hn-list').textContent.includes('No open notes'));
        ok(await page.$eval('#f-notes .hn-count', el => el.hidden), 'marking it done clears the count');
        await page.click('.hn-filter button[data-f="all"]');
        ok((await page.$$('.hn-note')).length === 2, 'All shows both');
        await page.click('.hn-note:has-text("assigned teachers only") .hn-btn.danger');
        await page.waitForFunction(() => document.querySelectorAll('.hn-note').length === 1);
        ok(await page.evaluate(() => window.__notes.filter(n => n.deleted).length === 1), 'the writer deletes their note');
        await page.keyboard.press('Escape');
        ok(!(await page.isVisible('.hn-panel')), 'Escape closes the panel');
        ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-notes'), 'and focus goes back to the button');
        await page.close(); srv.close();

        ({ page, srv } = await open({ unknown: true }));
        await page.click('#f-notes');
        await page.waitForFunction(() => /server update/.test(document.querySelector('.hn-list').textContent));
        ok(true, 'before the server update the panel says so');
        await page.close(); srv.close();

        ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } finally { await browser.close(); }
    console.log(failed ? failed + ' failed' : 'all passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
