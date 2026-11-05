/* node tests/analytics-cohort-test.js  (needs Playwright)
 * The analytics page counts AI Literacy: Teacher Readiness against the 62 teachers it is
 * required of, not against every Hub user. Synthetic data only: a few real cohort
 * addresses (from admin-dashboard.html) and made-up other staff. */
const fs = require('fs'), path = require('path'), http = require('http');
const root = path.join(__dirname, '..');
let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error('FAIL', m); } else console.log('ok  ', m); };
const dash = fs.readFileSync(path.join(root, 'admin-dashboard.html'), 'utf8');
const block = dash.match(/const AI_LITERACY_COHORT = \[([\s\S]*?)\n        \];/)[1];
const cohort = [...block.matchAll(/email:\s*"([^"]+)"/g)].map(m => m[1].toLowerCase());
const others = Array.from({ length: 20 }, (_, i) => 'other.staff' + i + '@aisa.sch.ae');
const iso = d => new Date(Date.UTC(2026, 10, d, 6)).toISOString();

(async () => {
  const { chromium } = require('playwright');
  const server = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream');
    r.end(fs.readFileSync(f));
  }).listen(0);
  const browser = await chromium.launch();
  /* 5 of the 62 finished; 15 other staff finished it too (they are not required to). */
  const done = cohort.slice(0, 5).concat(others.slice(0, 15));
  const people = cohort.slice(0, 10).concat(others).map(e => ({ email: e, name: e.split('@')[0], last_seen: iso(3) }));
  const raw = { ok: true, overview: { ok: true, people, completions: done.map(e => ({ email: e, module_id: 'ai-curriculum-readiness', completed_at: iso(2) })) } };
  const stub = `window.aisaAuth={isConfigured:()=>true,getUser:()=>({email:'bbaki@aisa.sch.ae'}),
    adminDashboard:()=>Promise.resolve(${JSON.stringify(raw)})};
    window.aisaReady=function(cb){cb(window.aisaAuth)};`;
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { try { localStorage.setItem('aisa_analytics_view_v1', JSON.stringify({ spot: 'ai-curriculum-readiness' })); } catch (e) {} });
  await page.route('**/auth/gate.js*', r => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await page.route('**/auth/menu.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.route(/fonts\.(googleapis|gstatic)\.com|cdn\./, r => r.abort());
  await page.goto('http://localhost:' + server.address().port + '/admin-analytics.html');
  await page.waitForSelector('#ins-bad li');
  const lede = await page.locator('#lede').innerText();
  const bad = await page.locator('#ins-bad').innerText();
  const total = cohort.length;
  ok(new RegExp('complete for the ' + total + ' teachers it is required of').test(lede), 'lede counts the ' + total + ' it is required of: ' + lede.slice(0, 160));
  ok(new RegExp('of the ' + total + ' teachers it is required of').test(bad) && new RegExp('\\b' + (total - 5) + '\\b').test(bad), 'insight says ' + (total - 5) + ' of ' + total + ' still to finish (the 15 others who finished do not count)');
  ok(!/staff \(\d+%\) still have not finished AI Literacy/.test(bad), 'no whole-school "still have not finished"');
  ok(/9\d?%|8\d%|[1-9]%/.test(await page.locator('body').innerText()) && /5 of 62 required teachers/.test(await page.locator('body').innerText()), 'tile reads "5 of 62 required teachers"');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  await browser.close(); server.close();
})().then(() => { if (failed) { console.error(failed + ' failed'); process.exit(1); } console.log('all passed'); }, e => { console.error(e); process.exit(1); });
