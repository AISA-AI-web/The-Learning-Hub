/*
 * Build the printable / shareable PDFs of the Hub's AI Literacy material.
 *
 *   NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs"
 *   NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs" --only module
 *   NODE_PATH=$(npm root -g) node "AI Literacy Hub/build-pdf.mjs" --base https://example.org/hub/
 *
 * Three documents, `--only <hub|aigt|module>` to build one:
 *
 *   hub     the AI Literacy hub, English and Arabic
 *   aigt    the AI Growth Test AI Lead & Proctor guide, every role's steps
 *   module  the Teacher Readiness training, all eight segments end to end
 *
 * The last two exist for ADEK evidence folders, which is why they are
 * built UNFILTERED and UNGATED: a guide showing only one role's steps,
 * or a module showing only the segment you happen to be on, evidences
 * nothing. Neither carries anybody's answers — see the note on the
 * module target below.
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

/* ---------------- what gets built ----------------
 * `page` is the file on disk; `pathOnSite` is where it lives when
 * served, which is what the links in the PDF are made absolute
 * against. `langs` drives one render per language. */
const TARGETS = {
    hub: {
        page: path.join(HERE, 'ai-literacy-hub.html'),
        pathOnSite: 'AI Literacy Hub/ai-literacy-hub.html',
        langs: ['en', 'ar'],
        out: { en: 'ai-literacy-hub-en.pdf', ar: 'ai-literacy-hub-ar.pdf' },
        title: { en: 'AISA — AI Literacy Hub', ar: 'AISA — مركز الثقافة في الذكاء الاصطناعي' },
    },
    aigt: {
        page: path.join(HERE, '..', 'Tools and Resources', 'ai-growth-test-guide.html'),
        pathOnSite: 'Tools and Resources/ai-growth-test-guide.html',
        langs: ['en'],
        out: { en: 'ai-growth-test-guide.pdf' },
        title: { en: 'AISA — AI Growth Test: AI Lead & Proctor Guide' },
        evidence: 'Operational guide for ADEK\u2019s Baseline AI Growth Test, as issued to AISA staff.',
    },
    module: {
        page: path.join(HERE, '..', 'PD Modules', 'ai-curriculum-readiness-module.html'),
        pathOnSite: 'PD Modules/ai-curriculum-readiness-module.html',
        query: '?preview=1',          // unlocks every segment and reveals the answers
        langs: ['en'],
        out: { en: 'ai-teacher-readiness-training.pdf' },
        title: { en: 'AISA — AI Literacy: Teacher Readiness Training' },
        evidence: 'The internal training every AISA teacher delivering the ADEK AI Literacy '
                + 'curriculum completed before teaching began, reproduced in full.',
    },
};

/* Extra CSS per target, on top of the shared print stylesheet. */
const EXTRA_CSS = {
    aigt: `
      /* The role filter hides the steps that are not yours. For evidence
         every step has to be on the page, so the filter goes and the
         steps all show. */
      .rolebar, .rolebar-hint { display: none !important; }
      .step { display: block !important; }
      .step[data-role] { break-inside: avoid; }
      figure.shot { break-inside: avoid; }
      figure.shot img { max-width: 100%; height: auto; }
      /* Tick boxes print as empty boxes, which is what a checklist is. */
      input[type="checkbox"] { width: 12px; height: 12px; }
    `,
    module: `
      /* The module's own print stylesheet is built for the teacher's
         one-pager: it hides every direct child of <body> except
         #onepager. That hides the chapters' ANCESTOR, so no rule on the
         chapters themselves can bring them back — this has to undo it at
         the same level. Scripts and styles are excluded by name, or
         forcing them to block prints their source. */
      @media print {
        body > *:not(#onepager):not(script):not(style):not(link):not(template) {
          display: block !important;
        }
        #onepager { display: none !important; }
      }

      /* training.js shows one [data-chapter] at a time. A document has to
         show all of them, in order. */
      .aisa-train-managed [data-chapter],
      [data-chapter] { display: block !important; animation: none !important; }
      [data-chapter] { break-before: page; break-inside: auto; }
      [data-chapter]:first-of-type { break-before: auto; }
      /* Reader chrome: the sidebar, the prev/next bar, the progress rail.
         None of it means anything on paper. */
      .aisa-train-nav, .aisa-train-chapter-list, .aisa-train-sidebar,
      #progress-bar, .video-slot, .completion-actions,
      .scope-float, .module-checkbox { display: none !important; }
      /* What teachers are asked to write. The boxes print empty and that
         is the point — this evidences the instrument, not a person. */
      textarea, input[type="text"], select {
        border: 1px solid #b9bed4 !important; border-radius: 4px;
        min-height: 46px; width: 100%; background: #fff !important;
      }
      .field { break-inside: avoid; }
      .aisa-quiz-option.is-correct { font-weight: 700; }
    `,
};

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

  /* Anything computed at page-load time that would be frozen wrong in a
     file — the session's "today / in 3 hours" pill. The date, time and
     venue beside it are static, so the block still reads correctly. */
  .no-print { display: none !important; }

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
 * signed-in, interactive page into a document that stands alone. *//* ---------------- DOM preparation ----------------
 * Runs inside the page. Turning a live, signed-in, interactive page
 * into a document that stands on its own. */
function prepare({ target, lang, pageOnSite, strings }) {
    const doc = document;
    doc.documentElement.setAttribute('lang', lang);
    doc.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    let sectionNames = [];

    if (target === 'hub') {
        /* Keep one language only — the other is not merely hidden, it is
         * gone, so it cannot be selected, searched or extracted out of
         * the PDF as invisible text. */
        doc.querySelectorAll(lang === 'ar' ? '.lang-en' : '.lang-ar').forEach((el) => el.remove());

        /* The status strip reads a signed-in teacher's own training
         * record, which is meaningless in a file passed around. */
        doc.getElementById('status-strip')?.remove();
        const jump = doc.querySelector('nav.jump-strip');
        sectionNames = jump ? [...jump.querySelectorAll('a')].map((a) => a.textContent.trim()) : [];
        jump?.remove();
    }

    if (target === 'aigt') {
        /* Every role's steps, not the reader's. The filter is gone (CSS)
         * but the buttons also carry counts that would now be wrong. */
        doc.querySelectorAll('.rolebar, .rolebar-hint').forEach((el) => el.remove());
        sectionNames = [...doc.querySelectorAll('h2')].slice(0, 9).map((h) => h.textContent.trim());
    }

    if (target === 'module') {
        /* The reader chrome training.js injects. The chapters themselves
         * are unhidden by CSS, so they print in order. */
        doc.querySelectorAll('.aisa-train-nav, .aisa-train-chapter-list, .aisa-train-sidebar')
           .forEach((el) => el.remove());
        /* Review-mode's own banner explains a URL flag, which means
         * nothing in a document. */
        [...doc.querySelectorAll('.callout')]
            .filter((el) => /Review mode is on/i.test(el.textContent))
            .forEach((el) => el.remove());
        sectionNames = [...doc.querySelectorAll('[data-chapter]')]
            .map((el) => el.getAttribute('data-chapter-title')).filter(Boolean);

        /* Belt and braces on the promise made in the reply: if anything
         * ever did load a teacher's saved answers, this empties them
         * before the page is rendered. */
        doc.querySelectorAll('textarea').forEach((t) => { t.value = ''; t.textContent = ''; });
        doc.querySelectorAll('input[type="text"]').forEach((i) => { i.value = ''; });
        doc.querySelectorAll('select').forEach((sel) => { sel.selectedIndex = 0; });
    }

    doc.querySelectorAll('[hidden]').forEach((el) => el.remove());

    /* Relative on the web, absolute in a file with no origin. */
    doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.getAttribute('href');
        if (!href || /^(mailto:|https?:)/i.test(href)) return;
        if (href.startsWith('#')) { a.removeAttribute('href'); return; }
        try { a.href = new URL(href, pageOnSite).href; } catch {}
    });

    const first = doc.querySelector('main > header') || doc.querySelector('header') || doc.body.firstElementChild;

    if (sectionNames.length) {
        const box = doc.createElement('div');
        box.className = 'print-contents';
        box.innerHTML = '<strong>' + strings.contents + '</strong>' + sectionNames.join(' · ');
        first?.insertAdjacentElement('afterend', box);
    }

    /* Provenance, so a copy found in a shared folder in six months says
     * what it is, where it came from and how old it is. */
    const meta = doc.createElement('p');
    meta.className = 'print-meta';
    meta.innerHTML = strings.meta;
    if (first) first.appendChild(meta);

    /* Show the URL under standalone links, and collect every link for
     * the index at the back. */
    const index = [];
    const seen = new Set();
    doc.querySelectorAll('a[href]').forEach((a) => {
        const href = a.href;
        const raw = (a.querySelector('h3') || a).textContent.replace(/\s+/g, ' ').trim();
        const text = raw.length > 72 ? raw.slice(0, 71).trimEnd() + '…' : raw;
        if (!text) return;
        if (!seen.has(href)) { seen.add(href); index.push({ text, href }); }

        if (a.closest('p:not(.print-meta), li, td, figcaption') || href.startsWith('mailto:')) return;
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
    (doc.querySelector('main') || doc.body).appendChild(sec);

    return index.length;
}

const BASE_STRINGS = {
    en: {
        contents: 'In this document',
        indexTitle: 'Every link in this document',
        indexLede: 'In the order they appear. The links above are clickable; these are written out so a printed copy is still usable.',
        metaTail: 'The Hub is the live version — check it before relying on a date in this file.',
    },
    ar: {
        contents: 'في هذه الوثيقة',
        indexTitle: 'كل الروابط الواردة في هذه الوثيقة',
        indexLede: 'بترتيب ورودها. الروابط أعلاه قابلة للنقر، وهذه مكتوبة بالكامل ليبقى النسخة المطبوعة صالحة للاستخدام.',
        metaTail: 'والنسخة الحيّة هي المرجع — راجعوها قبل الاعتماد على أي تاريخ في هذا الملف.',
    },
};

function stringsFor(name, spec, lang, url, date) {
    const s = { ...BASE_STRINGS[lang] };
    const head = lang === 'ar'
        ? 'التعليم والتعلّم في AISA · مطبوعة من مركز التعلم. '
        : 'AISA Teaching &amp; Learning &middot; printed from the Learning Hub. ';
    s.meta = head + (spec.evidence ? '<b>' + spec.evidence + '</b> ' : '') + s.metaTail
        + '<br><span style="word-break:break-all' + (lang === 'ar' ? ';direction:ltr;display:inline-block' : '') + '">'
        + url + '</span> &middot; '
        + (lang === 'ar' ? 'صدرت بتاريخ ' : 'generated ') + date;
    s.file = spec.out[lang];
    s.title = spec.title[lang];
    return s;
}

/* ---------------- run ---------------- */
const only = argOf('--only', null);
const names = only ? [only] : Object.keys(TARGETS);
for (const n of names) {
    if (!TARGETS[n]) { console.error(`unknown target "${n}" — one of: ${Object.keys(TARGETS).join(', ')}`); process.exit(1); }
}

const css = await fontCss();
const browser = await chromium.launch();

for (const name of names) {
    const spec = TARGETS[name];
    const onSite = new URL(encodeURI(spec.pathOnSite), base).href;

    for (const lang of spec.langs) {
        const page = await browser.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e)));

        /* The pages expect the sign-in gate. Stub it so they settle
         * instead of polling for a session that will never arrive — and
         * so NOTHING a teacher has saved is ever fetched into a file
         * that goes in an evidence folder. */
        await page.addInitScript(() => {
            window.aisaAuth = {
                isConfigured: () => false,
                getCompletionsCached: () => null,
                getCompletions: () => Promise.resolve([]),
                getModuleResponse: () => Promise.resolve({}),
                saveModuleResponse: () => Promise.resolve({}),
                recordEvent: () => Promise.resolve({}),
                wireModule: () => {},
                trackPageView: () => {},
                trackClick: () => {},
            };
            window.aisaReady = (cb) => cb(window.aisaAuth);
        });
        await page.route('**/auth/gate.js*', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
        await page.goto(pathToFileURL(spec.page).href + (spec.query || ''), { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);

        const today = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-GB',
            { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
        const s = stringsFor(name, spec, lang, onSite, today);

        const links = await page.evaluate(prepare, { target: name, lang, pageOnSite: onSite, strings: s });
        await page.addStyleTag({ content: css });
        await page.addStyleTag({ content: printCss(lang) });
        if (EXTRA_CSS[name]) await page.addStyleTag({ content: EXTRA_CSS[name] });
        await page.evaluate((t) => { document.title = t; }, s.title);
        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(500);

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
                '<span>' + s.title.replace(/&/g, '&amp;') + '</span>' +
                '<span class="pageNumber"></span></div>',
            margin: { top: '14mm', bottom: '16mm', left: '14mm', right: '14mm' },
        });

        if (argv.includes('--png')) {
            await page.setViewportSize({ width: 794, height: 1123 });
            await page.screenshot({ path: out.replace(/\.pdf$/, '.png'), fullPage: true });
        }

        console.log(`${s.file}: ${links} links` + (errs.length ? ` — page errors: ${errs.join(' | ')}` : ''));
        await page.close();
    }
}

await browser.close();
