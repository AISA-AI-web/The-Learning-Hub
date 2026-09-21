/*
 * Build the printable / shareable PDF of the AI Literacy Hub.
 *
 *   NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs"
 *   NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs" --base https://example.org/hub/
 *
 * Needs Playwright's Chromium and one fetch of Google Fonts (cached in
 * .fontcache/ after the first run, which is gitignored).
 *
 * --------------------------------------------------------------------
 * WHY IT RENDERS THE REAL PAGE RATHER THAN A SEPARATE PRINT DOCUMENT
 *
 * A hand-written print copy is a second source of truth, and this repo
 * has already learned what those cost: two files saying the same thing
 * drift the moment one is edited. So this loads
 * ai-literacy-hub.html itself, strips the parts that only make sense in
 * a browser, and restyles what is left. Edit the page, re-run this, and
 * the PDF follows. It never needs editing in its own right.
 *
 * Tailwind is a CDN script on that page and is deliberately NOT loaded
 * here, which leaves a clean semantic DOM. The print stylesheet below
 * hooks onto the Tailwind class names that are written into the markup
 * ([class*="rounded-2xl"] and friends) — they are in the source file,
 * so they are stable whether or not the CDN ever answers.
 * --------------------------------------------------------------------
 *
 * THE ONE THING THAT IS HOST-SPECIFIC. Every link on the page is
 * relative, deliberately, so the Hub works wherever it is served from.
 * A PDF sitting in Google Drive has no origin to be relative to, so the
 * links have to be absolutised against a real host — the same exception
 * the newsletter note in CLAUDE.md calls out for an emailed issue.
 * That host is SITE_BASE below, and nothing else in the repo carries
 * it. Pass --base to override it; change it here if the Hub moves.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* require, not import: ESM resolution ignores NODE_PATH, so a globally
 * installed Playwright would not be found. This picks up either a local
 * node_modules or `NODE_PATH=$(npm root -g)`. */
const require = createRequire(import.meta.url);
let chromium;
try {
    ({ chromium } = require('playwright'));
} catch {
    console.error(
        'Playwright not found. Install it (npm i -D playwright) or run with\n' +
        '  NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs"'
    );
    process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, 'ai-literacy-hub.html');
const CACHE = path.join(HERE, '.fontcache');

const SITE_BASE = 'https://aisa-ai-web.github.io/The-Learning-Hub/';
const PAGE_PATH = 'AI Literacy Hub/ai-literacy-hub.html';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const base = argOf('--base', SITE_BASE);
const pageOnSite = new URL(encodeURI(PAGE_PATH), base).href;

/* ---------------- fonts ----------------
 * Inlined as base64 so the render needs no network once cached, and so
 * the PDF carries proper Arabic shaping rather than a fallback that
 * turns it into boxes. */
const FONT_CSS_URL =
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700' +
    '&family=Poppins:wght@600;800&family=Cairo:wght@400;700&display=swap';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

async function cached(url, asText) {
    await mkdir(CACHE, { recursive: true });
    const file = path.join(CACHE, createHash('sha1').update(url).digest('hex') + (asText ? '.css' : '.woff2'));
    try {
        await access(file);
        return asText ? readFile(file, 'utf8') : readFile(file);
    } catch {}
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`font fetch ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(file, buf);
    return asText ? buf.toString('utf8') : buf;
}

async function fontCss() {
    let css = await cached(FONT_CSS_URL, true);
    const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2/g) || [])];
    for (const u of urls) {
        const b64 = (await cached(u, false)).toString('base64');
        css = css.split(u).join(`data:font/woff2;base64,${b64}`);
    }
    return css;
}

/* ---------------- print stylesheet ---------------- */
const printCss = (lang) => `
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  html, body {
    background: #fff !important; color: #17203a;
    font-family: ${lang === 'ar' ? "'Cairo'" : "'Inter'"}, sans-serif;
    font-size: 10.2pt; line-height: 1.5; margin: 0; padding: 0;
  }
  main { max-width: none !important; margin: 0 !important; padding: 0 !important; }

  h1, h2, h3, h4, .font-heading { font-family: ${lang === 'ar' ? "'Cairo'" : "'Poppins'"}, sans-serif; }
  h1 { font-size: 27pt; line-height: 1.1; margin: 0 0 6pt; font-weight: 800; letter-spacing: -0.4pt; }
  h2 { font-size: 15pt; margin: 0 0 3pt; font-weight: 800; color: #2c2a86; }
  h3 { font-size: 11.4pt; margin: 0 0 3pt; font-weight: 700; }
  p  { margin: 0 0 5pt; }
  ul, ol { margin: 4pt 0 0; padding-inline-start: 16pt; }
  li { margin-bottom: 3pt; }
  strong { font-weight: 700; }

  /* The hero: a solid band rather than the page's gradient, which
     prints muddy and eats toner. */
  body > main > header {
    background: #2c2a86 !important; color: #fff !important;
    border-radius: 10pt; padding: 14pt 16pt !important; margin-bottom: 12pt;
    break-inside: avoid;
  }
  body > main > header p { color: #d4d2f4 !important; }
  body > main > header > p:first-child {
    font-size: 7.6pt; font-weight: 700; letter-spacing: 1pt; text-transform: uppercase;
  }
  body > main > header h1 { color: #fff !important; }

  section { margin: 0 0 12pt; break-inside: auto; }
  section > h2 + p { color: #55607d; margin-bottom: 7pt; }

  /* Cards. The hooks are the Tailwind utility names written into the
     page source, so they hold whether or not the CDN ever loads. */
  [class*="rounded-2xl"], [class*="rounded-xl"] {
    border: 0.6pt solid #d9dced; border-radius: 8pt;
    padding: 9pt 11pt !important; margin: 0; background: #fff;
    break-inside: avoid; display: block;
  }
  [class*="bg-amber-50"]  { background: #fffaeb !important; border-color: #f2d68a !important; }
  [class*="bg-rose-50"]   { background: #fff5f5 !important; border-color: #f4c2c2 !important; }
  [class*="bg-slate-100"] { background: #f5f6fa !important; border-color: #dfe2ee !important; }
  [class*="bg-slate-900"] { background: #17203a !important; color: #fff !important; border-color: #17203a !important; }
  [class*="bg-slate-900"] p, [class*="bg-slate-900"] h3 { color: #fff !important; }
  [class*="bg-slate-900"] [class*="text-slate-300"],
  [class*="bg-slate-900"] [class*="text-slate-400"] { color: #b9c0d6 !important; }

  /* Two-up where the page is two-up, single column on the three-card row
     so nothing is squeezed to unreadable. */
  [class*="md:grid-cols-2"] { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt; }
  [class*="lg:grid-cols-3"] { display: grid; grid-template-columns: 1fr; gap: 7pt; }
  [class*="sm:grid-cols-2"] { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; }
  [class*="md:col-span-2"] { grid-column: span 2; }

  /* Badges and chips: legible, not decorative blobs. */
  [class*="rounded-full"] {
    display: inline-block; border: 0.5pt solid #cfd4e6; border-radius: 20pt;
    padding: 1pt 6pt !important; font-size: 7.4pt; font-weight: 700;
    background: #f2f3fa; color: #3a3f57; margin: 0 3pt 3pt 0;
  }
  [class*="bg-amber-100"] { background: #fdf0d0 !important; border-color: #eccf8d !important; color: #7a5310 !important; }
  ul[class*="flex"] { list-style: none; padding: 0; margin: 4pt 0 0; }
  ul[class*="flex"] li { display: inline-block; margin: 0 3pt 3pt 0; }

  a { color: #2c2a86; text-decoration: none; font-weight: 600; }
  p a, li a { text-decoration: underline; }
  [class*="bg-slate-900"] a { color: #a9b0ff !important; }

  /* The URL under a call-to-action link, so a printed copy is usable. */
  .print-url {
    display: block; font-family: 'DejaVu Sans Mono', monospace;
    font-size: 6.9pt; color: #77809b; font-weight: 400;
    word-break: break-all; line-height: 1.35; margin-top: 1pt;
    direction: ltr; text-align: ${lang === 'ar' ? 'right' : 'left'};
  }
  [class*="bg-slate-900"] .print-url { color: #9aa2bd !important; }

  svg { display: none !important; }

  /* The round icon tiles are decoration, and my card rule above turns
     them into empty bordered boxes. Out. The inline emoji in callouts
     and list bullets are untouched — they carry meaning. */
  [class*="h-12"][class*="w-12"], [class*="h-10"][class*="w-10"] { display: none !important; }

  /* Print furniture the page itself has no need of. */
  .print-meta {
    border-top: 0.6pt solid #d9dced; margin-top: 4pt; padding-top: 7pt;
    font-size: 8pt; color: #6b7490;
  }
  .print-contents {
    background: #f5f6fa; border: 0.6pt solid #dfe2ee; border-radius: 8pt;
    padding: 8pt 11pt; margin: 0 0 12pt; font-size: 9pt; break-inside: avoid;
  }
  .print-contents strong { display: block; margin-bottom: 2pt; font-family: ${lang === 'ar' ? "'Cairo'" : "'Poppins'"}, sans-serif; }
  .link-index { break-before: page; }
  .link-index h2 { margin-bottom: 6pt; }
  .link-index ol { padding-inline-start: 14pt; }
  .link-index li { margin-bottom: 5pt; font-size: 9pt; break-inside: avoid; }
  .link-index .t { font-weight: 700; display: block; }
  .link-index .u {
    font-family: 'DejaVu Sans Mono', monospace; font-size: 7.4pt; color: #55607d;
    word-break: break-all; direction: ltr; display: block;
    text-align: ${lang === 'ar' ? 'right' : 'left'};
  }
  footer { display: none !important; }
`;

/* ---------------- DOM preparation ----------------
 * Runs inside the page. Everything here is about turning a live,
 * signed-in, interactive page into a document that stands alone. */
function prepare({ lang, base, pageOnSite, strings }) {
    const doc = document;
    doc.documentElement.setAttribute('lang', lang);
    doc.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    /* Keep one language only — the other is not merely hidden, it is
     * gone, so it cannot be selected, searched or extracted out of the
     * PDF as invisible text. */
    const drop = lang === 'ar' ? '.lang-en' : '.lang-ar';
    doc.querySelectorAll(drop).forEach((el) => el.remove());

    /* Browser-only furniture. The status strip reads a signed-in
     * teacher's own training record, which is meaningless in a file
     * passed around, and the jump strip is replaced by a contents box. */
    doc.getElementById('status-strip')?.remove();
    const jump = doc.querySelector('nav.jump-strip');
    const sectionNames = jump ? [...jump.querySelectorAll('a')].map((a) => a.textContent.trim()) : [];
    jump?.remove();
    doc.querySelectorAll('[hidden]').forEach((el) => el.remove());

    /* Relative on the web, absolute in a file with no origin. */
    doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || /^(mailto:|https?:)/i.test(href)) return;
        if (href.startsWith('#')) { a.removeAttribute('href'); return; }
        try { a.href = new URL(href, pageOnSite).href; } catch {}
    });

    /* Contents, from the strip that was just removed. */
    if (sectionNames.length) {
        const box = doc.createElement('div');
        box.className = 'print-contents';
        box.innerHTML = '<strong>' + strings.contents + '</strong>' + sectionNames.join(' · ');
        doc.querySelector('main > header')?.insertAdjacentElement('afterend', box);
    }

    /* Provenance, so a copy found on a shared drive in six months says
     * where it came from and how old it is. */
    const meta = doc.createElement('p');
    meta.className = 'print-meta';
    meta.innerHTML = strings.meta;
    doc.querySelector('main > header')?.appendChild(meta);

    /* Show the URL under standalone links (the calls to action), and
     * collect every link for the index at the back. */
    const index = [];
    const seen = new Set();
    doc.querySelectorAll('main a[href]').forEach((a) => {
        const href = a.href;
        /* Several links wrap a whole card, so a.textContent is the
         * card's entire prose. The heading is the name of the thing. */
        const raw = (a.querySelector('h3') || a).textContent.replace(/\s+/g, ' ').trim();
        const text = raw.length > 72 ? raw.slice(0, 71).trimEnd() + '…' : raw;
        if (!text) return;
        if (!seen.has(href)) { seen.add(href); index.push({ text, href }); }

        const inProse = !!a.closest('p:not(.print-meta), li');
        if (inProse || href.startsWith('mailto:')) return;
        const u = doc.createElement('span');
        u.className = 'print-url';
        u.textContent = href.replace(/^https?:\/\//, '');
        a.appendChild(u);
    });

    const sec = doc.createElement('section');
    sec.className = 'link-index';
    sec.innerHTML =
        '<h2>' + strings.indexTitle + '</h2>' +
        '<p>' + strings.indexLede + '</p><ol>' +
        index.map((i) =>
            '<li><span class="t">' + i.text.replace(/</g, '&lt;') + '</span>' +
            '<span class="u">' + i.href.replace(/</g, '&lt;') + '</span></li>').join('') +
        '</ol>';
    doc.querySelector('main')?.appendChild(sec);

    return index.length;
}

const STRINGS = {
    en: {
        contents: 'In this document',
        indexTitle: 'Every link in this document',
        indexLede: 'In the order they appear. The links above are clickable; these are written out so a printed copy is still usable.',
        meta:
            'AISA Teaching &amp; Learning &middot; printed from the AI Literacy Hub on the Learning Hub. ' +
            'The Hub is the live version — check it before relying on a date in this file.<br>' +
            '<span style="word-break:break-all">' + '{{url}}' + '</span> &middot; generated {{date}}',
        file: 'ai-literacy-hub-en.pdf',
        title: 'AISA — AI Literacy Hub',
    },
    ar: {
        contents: 'في هذه الوثيقة',
        indexTitle: 'كل الروابط الواردة في هذه الوثيقة',
        indexLede: 'بترتيب ورودها. الروابط أعلاه قابلة للنقر، وهذه مكتوبة بالكامل ليبقى النسخة المطبوعة صالحة للاستخدام.',
        meta:
            'التعليم والتعلّم في AISA · مطبوعة من مركز الثقافة في الذكاء الاصطناعي على مركز التعلم. ' +
            'والنسخة الحيّة هي المرجع — راجعوها قبل الاعتماد على أي تاريخ في هذا الملف.<br>' +
            '<span style="word-break:break-all;direction:ltr;display:inline-block">' + '{{url}}' + '</span> · صدرت بتاريخ {{date}}',
        file: 'ai-literacy-hub-ar.pdf',
        title: 'AISA — مركز الثقافة في الذكاء الاصطناعي',
    },
};

/* ---------------- run ---------------- */
const css = await fontCss();
const browser = await chromium.launch();

for (const lang of ['en', 'ar']) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));

    /* The page's own scripts expect the sign-in gate. Stub it so it
     * settles instead of polling for a session that will never arrive;
     * the strip it feeds is removed anyway. */
    await page.addInitScript(() => {
        window.aisaAuth = {
            isConfigured: () => false,
            getCompletionsCached: () => null,
            getCompletions: () => Promise.resolve([]),
        };
        window.aisaReady = (cb) => cb(window.aisaAuth);
    });
    await page.route('**/auth/gate.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await page.goto(pathToFileURL(PAGE).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const s = { ...STRINGS[lang] };
    const today = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
    s.meta = s.meta.replace('{{url}}', pageOnSite).replace('{{date}}', today);

    const links = await page.evaluate(prepare, { lang, base, pageOnSite, strings: s });
    await page.addStyleTag({ content: css });
    await page.addStyleTag({ content: printCss(lang) });
    await page.evaluate((t) => { document.title = t; }, s.title);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(400);

    const out = path.join(HERE, s.file);
    await page.pdf({
        path: out,
        format: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
            '<div style="width:100%;font-size:7pt;color:#8d95ad;font-family:sans-serif;' +
            'padding:0 14mm;display:flex;justify-content:space-between;">' +
            '<span>' + (lang === 'ar' ? 'مركز الثقافة في الذكاء الاصطناعي — AISA' : 'AI Literacy Hub — AISA') + '</span>' +
            '<span class="pageNumber"></span></div>',
        margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
    });
    /* --png also writes a full-height screenshot of the same prepared
     * DOM. A PDF viewer is not always to hand (the container this was
     * built in had none), and this is the only way to actually look at
     * the layout rather than trust the byte count. */
    if (argv.includes('--png')) {
        await page.setViewportSize({ width: 794, height: 1123 });   // A4 at 96dpi
        await page.screenshot({ path: out.replace(/\.pdf$/, '.png'), fullPage: true });
    }

    console.log(`${s.file}: ${links} links` + (errs.length ? ` — page errors: ${errs.join(' | ')}` : ''));
    await page.close();
}

await browser.close();
