/* tests/admin-dashboard-test.js — the admin console in Chromium, on made-up data (9 Nov 2026).
 *
 *   node tests/admin-dashboard-test.js
 *
 * Serves the repository on a local port, replaces auth/gate.js with a stand-in that answers admin_dashboard and the People
 * tab's requests with invented staff (@school.example), and checks: the tabs and their addresses (old ones too), the
 * Overview's "needs attention" and its status colours, the tracker (default filter, pages, select-all → remind, both
 * views), engagement's per-module thresholds, the surveys list, the People sub-tabs and ⋯ menu, no sideways scroll on a
 * phone, and no console errors. Skips (exit 0) when Playwright is not installed.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
function ok(cond, msg) { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failed++; }

/* ---------- made-up data ---------- */
const REQ = ['ai-ethics', 'return-to-school', 'safeguarding', 'sustainability'];
const REC = ['ai-and-assessment', 'notebooklm', 'chalkie'];
function person(i) {
    const n = String(i).padStart(3, '0');
    return { email: 't' + n + '@school.example', name: 'Teacher ' + n, last_seen: i % 9 === 0 ? '' : '2026-11-0' + (1 + i % 8) + 'T08:00:00Z',
             division: i % 3 === 0 ? 'Secondary' : (i % 3 === 1 ? 'Primary' : 'Early Years'), department: 'Dept ' + (i % 4), designation: i % 2 ? 'Teacher' : 'Assistant' };
}
const people = Array.from({ length: 60 }, (_, i) => person(i + 1));
/* Staff outside the 60 teachers, for the division groups and the teams (9 Nov 2026). The two @aisa.sch.ae addresses are
 * the SLT's named members in admin-dashboard.js (SLT_EMAILS); everything else about them here is made up. */
const extras = [
    ['x01@school.example', 'Pat Principal', 'Secondary Principal', 'Administrator'],
    ['x02@school.example', 'Ann Deputy', 'Primary Assistant Principal', 'Administrator'],
    ['x03@school.example', 'Fin Manager', 'Finance Manager', 'Administrator'],
    ['atorris@aisa.sch.ae', 'Made-up Director', 'School Director', 'Leadership'],
    ['aturabi@aisa.sch.ae', 'Made-up Curriculum', 'Curriculum Coordinator', 'Leadership'],
    ['x06@school.example', 'Lee Leader', 'Head of Inclusion', 'Leadership'],
    ['x07@school.example', 'Hr Person', 'PRO', 'HR Office'],
    ['x08@school.example', 'Dee Driver', 'Driver', 'Transport'],
    ['x09@school.example', 'Sam Support', 'Lifeguard', 'Support Staff'],
    ['x10@school.example', 'Mo Monitor', 'Hallway / Bus Monitor', 'Hallway / Bus Monitor'],
    ['x11@school.example', 'Ta Monitor', 'Teacher Assistant', ' hallway monitor'],
    ['x12@school.example', 'Les Support', 'Secondary Learning Support Teacher', 'Learning Support'],
    ['x13@school.example', 'Pia Support', 'Primary Learning Support', 'Learning Support'],
    ['x14@school.example', 'Kim Helper', 'KG Teacher Assistant', 'Early Years'],
    ['x15@school.example', 'Juan Pierre Fakename', 'Primary Homeroom Teacher', 'Primary'],
    ['x16@school.example', 'Natasha Testa', 'Primary Homeroom Teacher', 'Primary'],
    ['x17@school.example', 'Kate Samename', 'Primary Homeroom Teacher', 'Primary'],
    ['x18@school.example', 'Juan Samename', 'Primary Homeroom Teacher', 'Primary']
].map(([email, name, designation, division]) => ({ email, name, designation, division, department: division, last_seen: '2026-11-02T08:00:00Z' }));
/* Departments shaped like HR's ("Phase - detail"), for the grouped Department select. */
const DEPTS = { 'x15@school.example': 'Primary - Grade 4', 'x16@school.example': 'Early Years - KG1', 'x17@school.example': 'Primary Arabic',
                'x18@school.example': 'Secondary - PE', 'x12@school.example': 'Secondary', 'x13@school.example': 'Primary - Grade 10' };
extras.forEach(p => { if (DEPTS[p.email]) p.department = DEPTS[p.email]; });
const everyone = people.concat(extras);
/* Stands in for admin-teams.js: a nickname, a near spelling, two people with one surname, someone not on the Hub, and
 * members given by address. */
const TEAMS_STUB = `window.AISA_TEAMS = [
  { id: 'g4', label: 'Grade 4', area: 'elem', homeroom: true, members: [['JP Fakename', '', 'GLL'], ['Natashia Testa'], ['Kate Samename'], ['Ghost Person']] },
  { id: 'elem-x', label: 'Elementary specialists', area: 'elem', members: [['Juan Samename']] },
  { id: 'hs-math', label: 'HS Math', area: 'hs', members: [['Teacher 004', 't004@school.example', 'HOD'], ['Teacher 005', 't005@school.example']] }
];
window.AISA_TEAM_AREAS = [
  { id: 'elem', label: 'KG & Elementary', all: 'All KG–Grade 5 homeroom teams', homeroomOnly: true },
  { id: 'hs', label: 'High School', all: 'All High School departments' }
];`;

const completions = [];
people.forEach((p, i) => {
    // ai-ethics ~95%, return-to-school ~75%, safeguarding ~50%, sustainability ~92%: one of each colour
    if (i % 20 !== 0) completions.push({ email: p.email, module_id: 'ai-ethics', completed_at: '2026-10-01T09:00:00Z' });
    if (i % 4 !== 0) completions.push({ email: p.email, module_id: 'return-to-school', completed_at: '2026-10-02T09:00:00Z' });
    if (i % 2 === 0) completions.push({ email: p.email, module_id: 'safeguarding', completed_at: '2026-10-03T09:00:00Z' });
    if (i % 12 !== 0) completions.push({ email: p.email, module_id: 'sustainability', completed_at: '2026-10-04T09:00:00Z' });
    if (i % 3 === 0) completions.push({ email: p.email, module_id: REC[i % 3], completed_at: '2026-10-05T09:00:00Z' });
    if (i % 5 === 0) completions.push({ email: p.email, module_id: 'survey', completed_at: '2026-10-05T09:00:00Z' });
});
extras.forEach(p => ['ai-ethics', 'sustainability', 'return-to-school'].forEach(m => completions.push({ email: p.email, module_id: m, completed_at: '2026-10-06T09:00:00Z' })));
const dwell = [];
people.slice(0, 30).forEach((p, i) => {
    dwell.push({ email: p.email, name: p.name, module_id: 'safeguarding', total_seconds: 900 + i * 10, chapters_seen: 6, avg_secs_per_chapter: i < 3 ? 8 : 150 + i });
    dwell.push({ email: p.email, name: p.name, module_id: 'ai-ethics', total_seconds: 400, chapters_seen: 5, avg_secs_per_chapter: 80 });
});
const goals = people.filter((_, i) => i % 3 === 0).slice(0, 8).map((p, i) => ({
    email: p.email, name: p.name, status: i < 6 ? 'submitted' : 'draft', revision: 1, submitted_at: '2026-10-10T10:00:00Z', updated_at: '2026-10-10T10:00:00Z',
    data: { name: p.name, department: 'Science', focus_area: i % 2 ? 'Assessment for learning' : 'Questioning', goal: 'A made-up goal ' + i, if_then: 'If X then Y' }
}));
const outstanding = people.filter((_, i) => i % 3 === 0).slice(6, 16).map(p => ({ email: p.email, name: p.name, tags: ['secondary'] }));
const bundle = {
    ok: true,
    overview: { ok: true, generated_at: '2026-11-09T08:02:00Z', people: everyone, completions },
    dwell: { ok: true, rows: dwell },
    module_responses: { ok: true, module_id: 'ai-curriculum-readiness', responses: [
        { email: 'x1@school.example', name: 'Outside Cohort', updated_at: '2026-09-15T10:00:00Z', data: { lesson: { needs_before: 'Help please' } } }] },
    survey: { ok: true, survey_id: 'secondary-teacher-goal-2026-27', responses: goals, fields: [], outstanding, roster_tags: ['secondary'] }
};
const roster = people.map(p => ({ email: p.email, name: p.name, tags: p.division === 'Secondary' ? ['secondary'] : [], department: p.department, designation: p.designation, division: p.division }));

function stub() {
    return `(function(){
  var calls = window.__calls = [];
  var bundle = ${JSON.stringify(bundle)};
  var roster = ${JSON.stringify(roster)};
  var auth = {
    isConfigured: function(){ return true; },
    whoami: function(){ return Promise.resolve({ email: 'admin@school.example' }); },
    adminDashboard: function(o){ calls.push(['admin_dashboard', o]); return Promise.resolve(JSON.parse(JSON.stringify(bundle))); },
    readAdminSnapshot: function(){ return null; }, saveAdminSnapshot: function(){}, clearAdminSnapshot: function(){},
    postNotification: function(t, b, tags, emails, opts){ calls.push(['post_notification', emails.length]); return Promise.resolve({ ok: true, email: { sent: emails.length } }); },
    adminRoster: function(action){
      calls.push([action]);
      if (action === 'admin_roster_list') return Promise.resolve({ ok: true, roster: roster, admins: [{ email: 'admin@school.example', name: 'Admin', role: 'SLT' }, { email: 'a2@school.example', name: 'Second', role: 'AI lead' }] });
      if (action === 'admin_removed_list') return Promise.resolve({ ok: true, removed: [{ email: 'gone@school.example', name: 'Gone Person', removed_at: '2026-11-05' }] });
      return Promise.resolve({ ok: true });
    }
  };
  window.aisaAuth = auth;
  window.aisaReady = function(cb){ cb(auth); };
})();`;
}

function serve() {
    return new Promise(resolve => {
        const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
        const srv = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split('?')[0]);
            if (u === '/auth/gate.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(stub()); return; }
            if (u === '/admin-teams.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(TEAMS_STUB); return; }
            const f = path.join(ROOT, u);
            if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
            fs.createReadStream(f).pipe(res);
        }).listen(0, '127.0.0.1', () => resolve(srv));
    });
}

(async () => {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip (no playwright)'); return; }
    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/admin-dashboard.html';
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const errors = [];
    async function open(hash, viewport) {
        const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
        page.on('pageerror', e => errors.push(String(e)));
        /* The fonts are blocked on purpose (no network needed); any other failed request is an error. */
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
        page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)\.com/.test(r.url())) errors.push('request failed: ' + r.url()); });
        await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
        await page.goto(base + (hash || ''));
        await page.waitForSelector('#state-ready:not(.hidden)');
        return page;
    }
    const visible = (page, sel) => page.$eval(sel, el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));

    try {
        /* ---------- Overview ---------- */
        let page = await open('');
        ok(await visible(page, '#panel-overview'), 'opens on the Overview');
        ok(/Data as of 9 Nov, \d\d:\d\d/.test(await page.textContent('#data-status-msg')), 'header says "Data as of 9 Nov, hh:mm"');
        ok(await page.$eval('html', el => getComputedStyle(el).scrollbarGutter === 'stable'), 'scrollbar space is kept (scrollbar-gutter: stable)');
        const tabs = await page.$$eval('[role="tab"]', els => els.map(e => [e.id, e.getAttribute('aria-selected'), e.getAttribute('aria-controls')]));
        ok(tabs.every(t => (t[1] === 'true' || t[1] === 'false') && t[2]), 'every tab has role, aria-selected and aria-controls (' + tabs.length + ')');
        const bars = await page.$$eval('#required-bars .ad-bar', els => els.map(e => e.className));
        ok(bars.length === 5, 'five required modules');
        ok(bars.some(c => /good/.test(c)) && bars.some(c => /warn/.test(c)) && bars.some(c => /bad/.test(c)), 'required bars are green, amber and red by %');
        const rec = await page.$$eval('#recommended-bars .ad-bar', els => els.map(e => e.className.trim()));
        ok(rec.length > 0 && rec.every(c => c === 'ad-bar'), 'recommended bars are neutral, never a status colour');
        const attn = await page.$$eval('#attention li', els => els.map(e => e.textContent));
        ok(attn.some(t => /staff outstanding on/.test(t)), 'needs attention: a module with people outstanding');
        ok(attn.some(t => /required modules? (is|are) under 60%/.test(t)), 'needs attention: required modules under 60%');
        ok(attn.some(t => /never signed in/.test(t)), 'needs attention: staff who never signed in');
        ok(attn.some(t => /owe a personal goal/.test(t)), 'needs attention: goals outstanding');
        ok(attn.some(t => /skimmed/.test(t)), 'needs attention: skimming');
        const sg = (await page.$$('#attention li')).length;
        // Remind on the Safeguarding item
        const li = await page.$('#attention li:has-text("Child Protection")');
        const want = Number((await li.$eval('strong', e => e.textContent)));
        await li.$eval('button', b => b.click());
        ok(await visible(page, '#notify-modal'), 'Remind opens the reminder dialog');
        ok((await page.$$('#notify-recipients > div')).length === want, 'the dialog lists the ' + want + ' outstanding');
        await page.click('#notify-send');
        await page.waitForFunction(() => (window.__calls || []).some(c => c[0] === 'post_notification'));
        ok(true, 'sending posts the notification');
        await page.keyboard.press('Escape');
        await page.waitForSelector('#notify-modal.hidden', { state: 'attached' });

        /* ---------- tabs and the address ---------- */
        await page.click('#tab-training');
        ok(page.url().endsWith('#training'), 'Training tab sets #training');
        ok(await page.getAttribute('#tab-training', 'aria-selected') === 'true', 'Training tab is selected');
        await page.goBack();
        await page.waitForFunction(() => !document.getElementById('panel-overview').classList.contains('hidden'));
        ok(true, 'Back returns to the Overview');
        await page.focus('#tab-overview');
        await page.keyboard.press('ArrowRight');
        ok(await page.evaluate(() => document.activeElement.id) === 'tab-training', 'arrow keys move along the tabs');

        /* ---------- Training ---------- */
        ok(await page.inputValue('#tracker-status') === 'pending', 'tracker defaults to Not completed');
        ok(await page.inputValue('#tracker-cols') === 'required', 'tracker defaults to the required modules');
        const heads = await page.$$eval('#matrix-head th', els => els.length);
        ok(heads === 1 + 1 + 5 + 1 + 1, 'By person: a column per required module (' + heads + ' headings)');
        const rowsN = await page.$$eval('#matrix-body tr', els => els.length);
        ok(rowsN > 0 && rowsN <= 25, 'tracker shows one page (' + rowsN + ' rows)');
        ok((await page.textContent('#tracker-pager')).includes('of'), 'tracker has a pager');
        ok(/Training tracker · \d+ outstanding/.test((await page.textContent('#panel-training .ad-h2')).replace(/\s+/g, ' ')), 'title says how many are outstanding');
        ok(await page.$eval('#matrix thead th', th => getComputedStyle(th).position === 'sticky'), 'table header is sticky');
        ok(await page.$eval('#matrix tbody td.r', td => getComputedStyle(td).textAlign === 'right'), 'numbers are right-aligned');
        await page.check('#tracker-all');
        const bulk = await page.textContent('#tracker-bulk-n');
        ok(/selected/.test(bulk) && await visible(page, '#tracker-bulk'), 'select all shows the bulk bar: ' + bulk.trim());
        await page.click('#tracker-bulk-remind');
        const sel = Number(bulk.match(/\d+/)[0]);
        ok((await page.$$('#notify-recipients > div')).length === sel, 'Remind selected lists everyone selected across pages (' + sel + ')');
        await page.click('#notify-cancel');
        await page.click('#tracker-bulk-clear');
        ok(await page.isHidden('#tracker-bulk'), 'clear selection hides the bulk bar');
        ok(await page.isHidden('#tracker-division') || !(await visible(page, '#more-filters')), 'designation and the rest are inside More filters');
        await page.click('#more-filters-btn');
        ok(await visible(page, '#tracker-designation'), 'More filters opens with Designation');
        await page.selectOption('#tracker-division', 'Secondary');
        await page.keyboard.press('Escape');
        ok((await page.textContent('#more-filters-n')).trim() === '1', 'More filters shows how many are set');
        await page.click('#view-training');
        ok(await visible(page, '#tracker-module'), 'By training shows the training picker');
        const th2 = await page.$$eval('#matrix-head th', els => els.map(e => e.textContent));
        ok(th2.some(t => /Completed on/.test(t)), 'By training shows the completion date');

        /* ---------- Engagement ---------- */
        await page.click('#tab-engagement');
        const sum = await page.$$eval('#eng-summary tr', els => els.length);
        ok(sum === 2, 'engagement summary: a row per module (' + sum + ')');
        const flagged = await page.$$eval('#dwell-body tr', els => els.length);
        ok(flagged === 3, 'flagged only: the three skimmers (' + flagged + ')');
        await page.fill('#eng-summary input[data-thr="ai-ethics"]', '90');
        await page.dispatchEvent('#eng-summary input[data-thr="ai-ethics"]', 'change');
        const after = (await page.textContent('#eng-flag-count')).trim();
        ok(after === '· 30 flagged', 'a per-module threshold changes who is flagged (' + after + ')');
        ok((await page.$$('#dwell-body tr')).length === 20, 'the by-person table shows 20 to a page');
        ok(await page.$('#eng-summary [data-thr-reset="ai-ethics"]') !== null, 'a changed threshold can be reset');
        await page.click('#eng-summary [data-thr-reset="ai-ethics"]');

        /* ---------- Surveys ---------- */
        await page.click('#tab-surveys');
        ok(page.url().endsWith('#surveys/goals'), 'Surveys opens on goals (#surveys/goals)');
        ok(await page.$$eval('#goal-list details.ad-goal', els => els.length === 6 && els.every(d => !d.open)), 'goals are one line each, closed');
        await page.click('#goal-list details.ad-goal summary');
        ok(await page.$eval('#goal-list details.ad-goal', d => d.open), 'a goal opens on click');
        ok(await visible(page, '#goal-focus-wrap'), 'focus-area chart is shown');
        await page.click('#sv-tab-readiness');
        ok(page.url().endsWith('#surveys/readiness') && await visible(page, '#resp-stats'), 'readiness is listed, archived');
        ok(await page.$eval('#resp-details', d => !d.open), 'readiness responses are collapsed');
        ok((await page.textContent('#resp-stats')).includes('0 / 62'), 'readiness counts the cohort only (someone outside it is not "started")');
        await page.click('#sv-tab-innovation');
        ok((await page.textContent('#innov-title-count')).includes('of ' + everyone.length), 'AI & Innovation Survey shows done of staff');

        /* ---------- People ---------- */
        await page.click('#tab-people');
        await page.waitForSelector('#rs-rows tr');
        ok((await page.$$('#rs-rows tr')).length === 50, 'staff list shows 50 to a page');
        ok((await page.textContent('#pp-staff-n')).trim() === '60', 'Staff list sub-tab shows the count');
        const h = await page.$eval('#rs-rows tr', tr => tr.getBoundingClientRect().height);
        ok(h <= 56, 'staff rows are compact (' + Math.round(h) + 'px)');
        await page.click('#rs-rows tr .rs-more');
        const items = await page.$$eval('#rs-rows [role="menuitem"]', els => els.map(e => e.textContent));
        ok(items.length === 3 && /Edit/.test(items[0]), 'the ⋯ menu has Edit, Mark complete and Remove');
        await page.keyboard.press('Escape');
        await page.click('#rs-rows tr input[type=checkbox]');
        ok(await visible(page, '#rs-bulk'), 'ticking a row shows the bulk-action bar');
        await page.click('#pp-tab-admins');
        ok(page.url().endsWith('#people/admins') && await visible(page, '#rs-admin-rows'), 'Admins sub-tab (#people/admins)');
        await page.click('#pp-tab-removed');
        ok((await page.textContent('#rs-rm-rows')).includes('Gone Person'), 'Removed sub-tab lists the removed');
        await page.click('#pp-tab-sync');
        ok(await visible(page, '#rs-sc-h') && !(await visible(page, '#rs-rows')), 'Sync with HR sub-tab');

        /* ---------- Division groups and teams ---------- */
        await page.click('#tab-training');
        await page.click('#view-person');
        await page.selectOption('#tracker-status', '');
        const divOpts = await page.$$eval('#tracker-division option', els => Object.fromEntries(els.map(o => [o.value, o.textContent])));
        const n = v => Number(((divOpts[v] || '').match(/\((\d+)\)$/) || [])[1]);
        ok(n('__teach') === 36 && n('__teach_elem') === 25 && n('__teach_sec') === 11,
            'teaching staff: all 36, KG & Primary 25, Secondary 11 (assistants out, Learning Support in)');
        ok(n('__slt') === 4, 'SLT: a Principal, an Assistant Principal and the two named addresses (' + n('__slt') + ')');
        ok(n('__admin') === 2 && n('__facilities') === 2 && n('__monitors') === 2, 'admin & finance, facilities and monitors groups have 2 each');
        ok(n('Leadership') === 1 && n('Learning Support') === 2, 'Leadership leaves out the SLT; Learning Support stays a division');
        ok(['Administrator', 'HR Office', 'Transport', 'Support Staff', 'Hallway Monitor', ' hallway monitor', 'Hallway / Bus Monitor'].every(v => !(v in divOpts)),
            'divisions taken into a group are not listed on their own');
        const groupLabels = await page.$$eval('#tracker-division optgroup', els => els.map(g => g.label));
        ok(groupLabels.join('|') === 'Teaching staff|Groups|Divisions', 'three headings: teaching staff, groups, divisions');
        async function shownNames() {
            return page.$$eval('#matrix-body td.main b', els => els.map(e => e.textContent).sort());
        }
        await page.click('#more-filters-btn');
        await page.selectOption('#tracker-division', '__admin');
        ok(JSON.stringify(await shownNames()) === JSON.stringify(['Fin Manager', 'Hr Person']), 'Administration & finance narrows the table to exactly those two');
        await page.selectOption('#tracker-division', '__slt');
        ok((await shownNames()).length === 4, 'SLT narrows the table to the four');
        await page.selectOption('#tracker-division', '__teach_elem');
        ok(!(await shownNames()).some(x => /Helper|Teacher 002\b/.test(x)), 'KG & Primary teaching staff leaves out Teacher Assistants');
        await page.selectOption('#tracker-division', '');
        const teamOpts = await page.$$eval('#tracker-team option', els => Object.fromEntries(els.map(o => [o.value, o.textContent])));
        const tn = v => Number(((teamOpts[v] || '').match(/\((\d+)\)$/) || [])[1]);
        ok(tn('team:g4') === 3, 'Grade 4 matches a nickname (JP), a near spelling and the right one of two Samenames (' + tn('team:g4') + ')');
        ok(tn('team:elem-x') === 1 && tn('team:hs-math') === 2 && tn('area:hs') === 2, 'teams by name and by address');
        ok(tn('area:elem') === 3, 'All homeroom teams counts the homeroom teams only');
        ok(tn('__leads') === 2, 'team leaders: the GLL and the HOD');
        ok((await page.textContent('#team-unmatched')).includes('Ghost Person (Grade 4)'), 'a name not on the staff list is listed under the filter');
        await page.selectOption('#tracker-team', 'team:g4');
        ok(JSON.stringify(await shownNames()) === JSON.stringify(['Juan Pierre Fakename', 'Kate Samename', 'Natasha Testa']), 'the Team filter narrows the table to Grade 4');
        ok((await page.textContent('#more-filters-n')).trim() === '1', 'More filters counts the team filter');
        await page.selectOption('#tracker-team', '');
        const deptGroups = await page.$$eval('#tracker-department optgroup', els => els.map(g => [g.label, Array.from(g.children).map(o => o.textContent)]));
        ok(deptGroups.map(g => g[0]).join('|') === 'Early Years & Primary|Secondary|Support & other departments', 'departments under three headings');
        ok(JSON.stringify(deptGroups[0][1]) === JSON.stringify(['All Early Years & Primary (5)', 'KG1 (1)', 'Grade 4 (1)', 'Grade 10 (1)', 'Arabic (1)', 'Early Years, no grade given (1)']),
            'Early Years & Primary: all, then KG, grades in order, Arabic, and the ones with no grade (' + deptGroups[0][1].join(', ') + ')');
        ok(JSON.stringify(deptGroups[1][1]) === JSON.stringify(['All Secondary (2)', 'PE (1)', 'Secondary, no subject given (1)']), 'Secondary: all, then each subject');
        ok(deptGroups[2][1][0] === 'Administration & finance (4)' && deptGroups[2][1].includes('Hallway & bus monitors (2)') && !deptGroups[2][1].some(t => /^(Administrator|HR Office|Transport) \(/.test(t)),
            'support offices merged as in the Division groups');
        await page.selectOption('#tracker-department', '__dep_elem');
        ok((await shownNames()).length === 5, 'All Early Years & Primary narrows the table to those 5');
        await page.selectOption('#tracker-department', '');
        await page.keyboard.press('Escape');
        await page.click('#tab-overview');
        await page.selectOption('#ov-division', '__teach_sec');
        await page.click('#required-bars [data-goto-module]');
        ok(await page.inputValue('#tracker-division') === '__teach_sec', 'Overview → tracker keeps a group (Secondary teaching staff)');
        await page.click('#tab-overview');
        await page.selectOption('#ov-division', '');

        /* ---------- Tools ---------- */
        await page.click('#tools-btn');
        const tools = await page.$$eval('#tools-menu a', els => els.map(e => e.getAttribute('href')));
        ok(tools.includes('admin-notifications.html') && tools.includes('admin-analytics.html') && tools.length === 6, 'Tools menu has the admin links');
        await page.close();

        /* SHOTS=<folder>: a picture of each tab on a laptop screen, to look at. */
        if (process.env.SHOTS) {
            for (const t of ['overview', 'training', 'engagement', 'surveys', 'people']) {
                const p4 = await open('#' + t, { width: 1280, height: 900 });
                if (t === 'people') await p4.waitForSelector('#rs-rows tr');
                await p4.screenshot({ path: path.join(process.env.SHOTS, 'laptop-' + t + '.png'), fullPage: t !== 'people' && t !== 'training' });
                await p4.close();
            }
        }

        /* ---------- old addresses ---------- */
        for (const [h0, tab, sub] of [['#goals', 'surveys', 'sv-goals'], ['#roster', 'people', 'pp-staff'], ['#pd', 'overview', null], ['#responses', 'surveys', 'sv-readiness']]) {
            const p2 = await open(h0);
            const okTab = await visible(p2, '#panel-' + tab) && (!sub || await visible(p2, '#' + sub));
            ok(okTab, h0 + ' opens ' + tab + (sub ? ' › ' + sub : ''));
            await p2.close();
        }

        /* ---------- a phone ---------- */
        for (const t of ['overview', 'training', 'engagement', 'surveys', 'people']) {
            const p3 = await open('#' + t, { width: 390, height: 844 });
            if (t === 'people') await p3.waitForSelector('#rs-rows tr');
            if (process.env.SHOTS) await p3.screenshot({ path: path.join(process.env.SHOTS, 'phone-' + t + '.png'), fullPage: true });
            const wide = await p3.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            let culprit = '';
            if (wide > 0) {
                culprit = await p3.evaluate(() => Array.prototype.filter.call(document.querySelectorAll('.ad-main *'),
                    e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
                    .slice(-3).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).replace(/\s+/g, '.')).join(', '));
            }
            ok(wide <= 0, 'no sideways scroll at 390px on ' + t + (wide > 0 ? ' (' + wide + 'px: ' + culprit + ')' : ''));
            if (t === 'overview') ok(await p3.$eval('.ad-stats', el => getComputedStyle(el).gridTemplateColumns.split(' ').length === 2), 'stat cards two to a row on a phone');
            if (t === 'training') ok(await p3.$eval('#matrix thead', el => getComputedStyle(el).display === 'none'), 'the tracker is a card list on a phone');
            await p3.close();
        }

        ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    } finally {
        await browser.close();
        srv.close();
    }
    console.log(failed ? failed + ' failed' : 'all passed');
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
