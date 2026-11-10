/* tests/topbar-test.js — the shared top bar (auth/menu.js) in Chromium, on made-up data (10 Nov 2026).
 *
 *   node tests/topbar-test.js
 *
 * Serves the repository on a local port and runs the REAL gate.js and menu.js, signed in as a made-up person.
 * Checks: the bar fits its row at every width from 320 to 1600px (scrollWidth <= clientWidth on .aisa-topbar-inner),
 * for staff and for an admin, in English and in Arabic (CLAUDE.md, "Top bar"); the page's section is marked in the
 * nav; "More" and the account menu open, close with Escape, and list what they should; Admin is shown to an admin
 * only; the drawer replaces the nav below 1100px, groups its links and marks the current page; every page links
 * auth/hub.css; no console errors. Skips (exit 0) when Playwright is not installed. Made-up people only.
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

/* Every page that loads gate.js links the design system. */
function pagesMissingHubCss() {
    const out = [];
    (function walk(dir) {
        for (const name of fs.readdirSync(dir)) {
            if (name === '.git' || name === 'node_modules' || name === 'tests') continue;
            const f = path.join(dir, name);
            if (fs.statSync(f).isDirectory()) { walk(f); continue; }
            if (!/\.html$/.test(name)) continue;
            const s = fs.readFileSync(f, 'utf8');
            if (/auth\/gate\.js/.test(s) && !/auth\/hub\.css/.test(s)) out.push(path.relative(ROOT, f));
        }
    })(ROOT);
    return out;
}

/* Every inline <script> on every page still parses (a font name pasted into a
 * quoted JS string broke one once, 10 Nov 2026). */
function pagesWithBrokenScripts() {
    const vm = require('vm'), out = [];
    (function walk(dir) {
        for (const name of fs.readdirSync(dir)) {
            if (name === '.git' || name === 'node_modules' || name === 'tests') continue;
            const f = path.join(dir, name);
            if (fs.statSync(f).isDirectory()) { walk(f); continue; }
            if (!/\.html$/.test(name)) continue;
            const s = fs.readFileSync(f, 'utf8');
            const re = /<script(?![^>]*\bsrc=)(?![^>]*type="(?!text\/javascript|module)[^"]*")[^>]*>([\s\S]*?)<\/script>/g;
            let m;
            while ((m = re.exec(s))) {
                try { new vm.Script(m[1]); } catch (e) { out.push(path.relative(ROOT, f) + ' (' + e.message + ')'); }
            }
        }
    })(ROOT);
    return out;
}

(async () => {
    const broken = pagesWithBrokenScripts();
    ok(broken.length === 0, 'every inline script on every page parses' + (broken.length ? ': ' + broken.join(', ') : ''));
    const missing = pagesMissingHubCss();
    ok(missing.length === 0, 'every page with gate.js links auth/hub.css' + (missing.length ? ': ' + missing.join(', ') : ''));

    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip browser checks (no playwright)'); process.exit(failed ? 1 : 0); }
    const srv = await serve();
    const base = 'http://127.0.0.1:' + srv.address().port + '/';
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const errors = [];

    async function context(admin, lang) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await ctx.addInitScript(([admin, lang]) => {
            try {
                localStorage.setItem('aisa_auth_v2', JSON.stringify({ email: 'ada@school.example', name: 'Ada Lovelace', sessionToken: 'tok-test', expiresAt: Date.now() + 864e5 }));
                localStorage.setItem('aisa_is_admin_v1', JSON.stringify({ email: 'ada@school.example', is_admin: admin, checked_at: Date.now() }));
                localStorage.setItem('aisa-newsletter-lang', lang);
            } catch (e) {}
        }, [admin, lang]);
        /* No network: the pages' Tailwind and fonts are not what is being tested. */
        await ctx.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.tailwind={};' }));
        await ctx.route(/fonts\.(googleapis|gstatic)\.com|accounts\.google\.com|google\.com\/s2/, r => r.abort());
        await ctx.route(/supabase\.co\/functions\/v1\/learning-hub/, r => {
            const body = JSON.parse(r.request().postData() || '{}');
            const a = body.action === 'whoami' ? { ok: true, email: 'ada@school.example', name: 'Ada Lovelace', is_admin: admin }
                : body.action === 'get_notifications' ? { ok: true, notifications: [], unread: 0 }
                : body.action === 'get_completions' ? { ok: true, completions: [] } : { ok: true };
            r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(a) });
        });
        return ctx;
    }
    async function open(ctx, rel) {
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(rel + ': ' + e));
        page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push(rel + ': ' + m.text()); });
        await page.goto(base + rel);
        await page.waitForSelector('.aisa-topbar', { timeout: 15000 });
        await page.waitForTimeout(300);
        return page;
    }

    try {
        const WIDTHS = [320, 340, 360, 375, 390, 414, 430, 480, 540, 600, 640, 641, 700, 720, 768, 820, 900, 1000, 1024, 1099, 1100, 1140, 1180, 1239, 1240, 1280, 1359, 1360, 1440, 1600];
        for (const admin of [false, true]) {
            for (const lang of ['en', 'ar']) {
                const ctx = await context(admin, lang);
                const page = await open(ctx, 'PD%20Modules/pd.html');
                if (admin) await page.waitForSelector('.aisa-tb-adminnav.show', { timeout: 5000 }).catch(() => {});
                const bad = [];
                for (const w of WIDTHS) {
                    await page.setViewportSize({ width: w, height: 800 });
                    await page.waitForTimeout(30);
                    const fit = await page.evaluate(() => {
                        const el = document.querySelector('.aisa-topbar-inner');
                        const right = Array.from(el.children).reduce((m, c) => Math.max(m, c.getBoundingClientRect().right), 0);
                        const left = Array.from(el.children).reduce((m, c) => Math.min(m, c.getBoundingClientRect().left), Infinity);
                        return el.scrollWidth <= el.clientWidth && right <= innerWidth + 0.5 && left >= -0.5;
                    });
                    if (!fit) bad.push(w);
                }
                ok(!bad.length, 'the bar fits at every width, ' + (admin ? 'admin' : 'staff') + ', ' + lang + (bad.length ? ' (overflows at ' + bad.join(', ') + ')' : ''));
                await ctx.close();
            }
        }

        /* Staff, English, wide */
        let ctx = await context(false, 'en');
        let page = await open(ctx, 'PD%20Modules/pd.html');
        await page.setViewportSize({ width: 1440, height: 900 });
        ok(await page.isVisible('.aisa-tb-nav'), 'the nav links are in the bar at 1440px');
        ok(!(await page.isVisible('.aisa-tb-menu')), 'and the menu button is not');
        const current = await page.$$eval('.aisa-tb-link.is-current', els => els.map(e => e.textContent.trim()));
        ok(current.length === 1 && current[0] === 'PD Modules', 'PD Modules is marked as the current section: ' + JSON.stringify(current));
        ok(await page.getAttribute('.aisa-tb-link.is-current', 'aria-current') === 'page', 'with aria-current');
        ok(!(await page.isVisible('.aisa-tb-adminnav')), 'no Admin menu for staff');
        ok(/AL/.test(await page.textContent('.aisa-tb-avatar')), 'the account button shows the initials');

        await page.click('.aisa-tb-more');
        await page.waitForTimeout(200);
        const moreLinks = await page.$$eval('.aisa-tb-pop-more.open a', els => els.map(e => e.textContent));
        ok(moreLinks.some(t => /Orientation/.test(t)) && moreLinks.some(t => /Committees/.test(t)) && moreLinks.some(t => /Library/.test(t)), 'More lists Orientation, Library, Committees');
        ok(await page.getAttribute('.aisa-tb-more', 'aria-expanded') === 'true', 'More says it is open');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        ok(!(await page.$('.aisa-tb-pop-more.open')), 'Escape closes it');

        await page.click('.aisa-tb-avatar');
        await page.waitForTimeout(200);
        const acct = await page.textContent('.aisa-tb-pop-account');
        ok(/Ada Lovelace/.test(acct) && /ada@school\.example/.test(acct) && /My Dashboard/.test(acct) && /Sign out/.test(acct), 'the account menu: name, address, My Dashboard, Sign out');
        ok(!(await page.isVisible('.aisa-tb-pop-account a[href*="admin-dashboard"]')), 'and no admin links for staff');
        await page.mouse.click(700, 600);
        await page.waitForTimeout(200);
        ok(!(await page.$('.aisa-tb-pop-account.open')), 'a click elsewhere closes it');

        /* Narrow: the drawer */
        await page.setViewportSize({ width: 390, height: 800 });
        ok(!(await page.isVisible('.aisa-tb-nav')) && await page.isVisible('.aisa-tb-menu'), 'at 390px the nav goes into the drawer');
        await page.click('.aisa-tb-menu');
        await page.waitForTimeout(400);
        const groups = await page.$$eval('.aisa-menu-drawer .aisa-menu-group', els => els.filter(e => e.offsetParent).map(e => e.textContent));
        ok(JSON.stringify(groups) === JSON.stringify(['You', 'Learn', 'Resources']), 'the drawer has its groups: ' + JSON.stringify(groups));
        ok(/PD Modules/.test(await page.textContent('.aisa-menu-drawer a.is-current')), 'and marks the current page');
        await page.click('.aisa-menu-close');
        await page.waitForTimeout(400);
        ok(!(await page.$('.aisa-menu-drawer.open')), 'the close button closes it');
        ok(await page.evaluate(() => getComputedStyle(document.querySelector('.aisa-menu-drawer')).visibility) === 'hidden', 'a closed drawer casts no shadow on the page (hidden)');
        await ctx.close();

        /* Admin */
        ctx = await context(true, 'en');
        page = await open(ctx, 'index.html');
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForSelector('.aisa-tb-adminnav.show', { timeout: 5000 });
        ok(await page.isVisible('.aisa-tb-adminnav'), 'an admin sees the Admin menu');
        await page.click('.aisa-tb-adminbtn');
        await page.waitForTimeout(200);
        const adminLinks = await page.$$eval('.aisa-tb-pop-admin.open a', els => els.map(e => e.textContent));
        ok(['Admin Dashboard', 'Hub Analytics', 'Requests inbox', 'Send notifications'].every(t => adminLinks.some(x => x.indexOf(t) !== -1)), 'listing the four admin pages');
        ok(!(await page.$('.aisa-tb-link.is-current')), 'on the home page no section is marked');
        ok(/Good (morning|afternoon|evening), Ada\./.test(await page.textContent('h1')), 'the home page greets by first name');
        await ctx.close();

        /* Arabic: the language button says the language it switches to */
        ctx = await context(false, 'ar');
        page = await open(ctx, 'index.html');
        ok(await page.getAttribute('html', 'dir') === 'rtl' && (await page.textContent('.aisa-tb-lang-label')).trim() === 'EN', 'in Arabic the page is right to left and the button offers EN');
        await page.click('.aisa-tb-lang');
        ok(await page.getAttribute('html', 'dir') === 'ltr' && (await page.textContent('.aisa-tb-lang-label')).trim() === 'العربية', 'and switches back to English');
        await ctx.close();

        ok(!errors.length, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
    } catch (e) {
        ok(false, 'threw: ' + (e && e.stack || e));
    } finally {
        await browser.close();
        srv.close();
    }
    console.log(failed ? failed + ' failed' : 'all passed');
    process.exit(failed ? 1 : 0);
})();
