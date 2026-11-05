/* node tests/readiness-notice-test.js
 * 1. The cohort hashes in PD Modules/readiness-notice.js, in Media Hub/sep18.html and
 *    AI_LITERACY_COHORT in admin-dashboard.html are the same 62 people.
 * 2. In Chromium (if Playwright is installed), the module page shows the right pop-up
 *    for a required teacher, one who has finished, someone not on the list, no address,
 *    in English and Arabic, once per tab session, and closes with Escape.
 * No dependencies beyond Playwright for part 2; part 1 alone is enough if it is missing. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
let failed = 0;
const ok = (c, m) => { if (!c) { failed++; console.error('FAIL', m); } else console.log('ok  ', m); };

const hash = e => crypto.createHash('sha256').update(e.trim().toLowerCase()).digest('hex').slice(0, 16);
const dash = read('admin-dashboard.html');
const block = dash.match(/const AI_LITERACY_COHORT = \[([\s\S]*?)\n        \];/)[1];
const truth = [...block.matchAll(/email:\s*"([^"]+)"/g)].map(m => hash(m[1])).sort();
const hashesIn = f => [...read(f).matchAll(/'([0-9a-f]{16})'/g)].map(m => m[1]).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
ok(truth.length > 0, 'cohort read from admin-dashboard.html (' + truth.length + ')');
ok(same(truth, hashesIn('PD Modules/readiness-notice.js')), 'readiness-notice.js has the same cohort');
ok(same(truth, hashesIn('Media Hub/sep18.html')), 'sep18.html has the same cohort');
ok(/readiness-notice\.js\?v=1/.test(read('PD Modules/ai-curriculum-readiness-module.html')), 'module page loads the notice');

(async () => {
  let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser part (no playwright)'); return; }
  const http = require('http');
  const server = http.createServer((q, r) => {
    const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.statusCode = 404; return r.end(); }
    const t = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream';
    r.setHeader('content-type', t); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + server.address().port + '/PD%20Modules/ai-curriculum-readiness-module.html';
  const browser = await chromium.launch();
  /* A stand-in for gate.js: signed in as `who`, with `done` completions. */
  const stub = (who, done) => `window.aisaAuth={getUser:()=>${who ? `({email:${JSON.stringify(who)}})` : 'null'},
    getCompletionsCached:()=>null,getCompletions:()=>Promise.resolve(${JSON.stringify(done)})};
    window.aisaReady=function(cb){cb(window.aisaAuth)};`;
  async function open(who, done, opts = {}) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route('**/auth/gate.js*', r => r.fulfill({ contentType: 'text/javascript', body: stub(who, done) }));
    await page.route('**/auth/training.js*', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    if (opts.ar) await page.addInitScript(() => { try { localStorage.setItem('aisa-newsletter-lang', 'ar'); } catch (e) {} });
    await page.goto(base);
    return { page, ctx };
  }
  // pick a real cohort address by brute force from the dashboard's own list
  const real = [...block.matchAll(/email:\s*"([^"]+)"/g)].map(m => m[1])[0];
  const text = async page => (await page.locator('#rn-card').innerText());

  let { page, ctx } = await open(real, []);
  await page.waitForSelector('#rn-card');
  ok(/Required for you/i.test(await text(page)) && /complete this training/.test(await text(page)), 'required teacher sees "Required"');
  ok(await page.locator('#rn-card.is-req').count() === 1, 'required styling');
  ok((await text(page)).includes(real.toLowerCase()), 'shows the address it checked');
  await page.keyboard.press('Escape');
  ok(await page.locator('#rn-overlay').count() === 0, 'Escape closes it');
  await page.reload(); await page.waitForTimeout(600);
  ok(await page.locator('#rn-overlay').count() === 0, 'not shown again on reload in the same tab session');
  await ctx.close();

  ({ page, ctx } = await open(real, [{ module_id: 'ai-curriculum-readiness' }]));
  await page.waitForSelector('#rn-card');
  ok(/already finished/.test(await text(page)), 'teacher who finished sees "already finished"');
  await ctx.close();

  ({ page, ctx } = await open('someone.else@aisa.sch.ae', []));
  await page.waitForSelector('#rn-card');
  ok(/Not required for you/i.test(await text(page)) && /do not need to do this training/.test(await text(page)), 'other staff see "Not required"');
  const hubHref = await page.locator('#rn-card a.primary').getAttribute('href');
  ok(/AI%20Literacy%20Hub/.test(hubHref), 'not-required offers the AI Literacy Hub');
  await page.locator('#rn-card button.secondary').click();
  ok(await page.locator('#rn-overlay').count() === 0, '"Look through it anyway" closes the pop-up');
  await ctx.close();

  ({ page, ctx } = await open(null, []));
  await page.waitForSelector('#rn-card');
  ok(/check/.test(await text(page)) && /Couldn.t check/i.test(await text(page)), 'no address: "Couldn\'t check"');
  await ctx.close();

  ({ page, ctx } = await open('someone.else@aisa.sch.ae', [], { ar: true }));
  await page.waitForSelector('#rn-card');
  await page.evaluate(() => document.body.classList.add('lang-ar'));
  const t = await text(page);
  ok(/غير مطلوب/.test(t) && !/Not required/.test(t), 'Arabic shows Arabic only');
  ok(await page.evaluate(() => getComputedStyle(document.getElementById('rn-card')).direction) === 'rtl', 'Arabic is right-to-left');
  await ctx.close();

  await browser.close(); server.close();
})().then(() => { if (failed) { console.error(failed + ' failed'); process.exit(1); } console.log('all passed'); },
        e => { console.error(e); process.exit(1); });
