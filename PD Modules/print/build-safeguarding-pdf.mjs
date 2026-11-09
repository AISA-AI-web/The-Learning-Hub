/*
 * The Child Protection, Safeguarding, and Drug Prevention training as one PDF, for ADEK evidence folders.
 *
 *   NODE_PATH=$(npm root -g) node "PD Modules/print/build-safeguarding-pdf.mjs"
 *
 * Writes `safeguarding-training.pdf` beside this file: every chapter of `../safeguarding-module.html`
 * end to end, in the order staff take them, with the knowledge checks' answer key (the right option ticked
 * and its explanation). It renders the real page, so edit the page and run this again; nothing here holds
 * the training's words.
 *
 * - The wizard (`training.js`), the sign-in gate and the translator are not loaded: the chapters are plain
 *   markup, so without the wizard they are all on the page, and no one's progress or answers are read.
 *   The tick boxes print empty.
 * - Tailwind is a CDN script on the page. It is built here from the page's own class names
 *   (tailwindcss 3, the page's `tailwind.config`) so the PDF looks like the page.
 * - The briefing video cannot play on paper: it is replaced by a box with its link.
 * - Links are made absolute against the Hub's address (SITE_BASE, or --base), as `AI Literacy Hub/build-pdf.mjs` does.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
// Playwright as in `AI Literacy Hub/build-pdf.mjs`: a local install, or a global one through NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, '..', 'safeguarding-module.html');
const OUT = path.join(HERE, 'safeguarding-training.pdf');
const argv = process.argv.slice(2);
const SITE_BASE = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : 'https://aisa-ai-web.github.io/The-Learning-Hub/';
const ON_SITE = new URL('PD%20Modules/safeguarding-module.html', SITE_BASE).href;

/* Tailwind from the page's own classes and config. */
const tmp = mkdtempSync(path.join(tmpdir(), 'sg-pdf-'));
writeFileSync(path.join(tmp, 'tailwind.config.cjs'), `module.exports = {
  content: [${JSON.stringify(PAGE)}],
  theme: { extend: { fontFamily: { heading: ['Poppins', 'sans-serif'] },
    colors: { primary: '#4338ca', secondary: '#6d28d9', accent: '#7c3aed' } } } };`);
writeFileSync(path.join(tmp, 'in.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
execFileSync('npx', ['-y', 'tailwindcss@3.4.17', '-c', path.join(tmp, 'tailwind.config.cjs'), '-i', path.join(tmp, 'in.css'), '-o', path.join(tmp, 'tw.css'), '--minify'],
  { stdio: 'ignore' });
const tailwindCss = readFileSync(path.join(tmp, 'tw.css'), 'utf8');

const PRINT_CSS = `
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff !important; }
  body > div:first-of-type { padding-top: 0 !important; padding-bottom: 0 !important; max-width: none !important; }
  /* Shadows, blur and animation mean nothing on paper. */
  * { box-shadow: none !important; animation: none !important; transition: none !important; backdrop-filter: none !important; }
  .ob-hero-orb, .ob-pulse { display: none !important; }
  /* The timeline rail and its round tick boxes are the reader's progress, not content. */
  .timeline-container::before { display: none !important; }
  [data-chapter] { padding-left: 0 !important; margin-bottom: 0 !important; break-before: page; }
  [data-chapter] > label.absolute, [data-chapter] > div.absolute { display: none !important; }
  [data-chapter] > div { border-width: 1px !important; }
  [data-chapter] .p-6, [data-chapter] .lg\\:p-8 { padding: 18px !important; }
  .aisa-quiz, .quiz-option, li, tr, figure, .print-video, [data-chapter] .p-6 > .rounded-xl:not(:has(ul)), [data-chapter] .rounded-xl:has(ol) { break-inside: avoid; }
  h3, h4 { break-after: avoid; }
  /* Side-by-side rows with a button (the guide's download) stack, so the written-out link has room. */
  [data-chapter] .sm\\:flex-row { flex-direction: column !important; align-items: stretch !important; }
  /* The answer key. */
  .quiz-option { cursor: default; }
  .quiz-option.print-correct { border: 2px solid #059669 !important; background: #ecfdf5 !important; }
  .quiz-option.print-correct > span:first-child { background: #059669 !important; color: #fff !important; }
  .print-answer-tag { margin-left: auto; font-size: 11px; font-weight: 800; color: #047857; white-space: nowrap; }
  .aisa-quiz-feedback { display: block !important; }
  .print-video, .print-contents, .print-meta { border: 1px solid #ddd6fe; background: #f5f3ff; border-radius: 12px; padding: 14px 16px; color: #3b0764; font-size: 13px; }
  a .print-url { color: inherit; opacity: .8; }
  .print-meta { margin-top: 14px; background: rgba(255,255,255,.12); border-color: rgba(255,255,255,.35); color: #ede9fe; font-size: 11.5px; }
  .print-meta a, .print-meta b { color: #fff; }
  .print-contents { margin: 0 0 6px; }
  .print-contents ol { columns: 2; margin: 6px 0 0 18px; list-style: decimal; }
  .print-contents li { margin: 0 0 2px; }
  .print-url { display: block; font: 10px/1.35 ui-monospace, monospace; color: #6b7280; word-break: break-all; margin-top: 3px; font-weight: 400; }
`;

function prepare({ onSite, meta }) {
  const d = document;
  // Reader furniture: the progress bar, the "return" button, the completion banner, hidden notes.
  d.getElementById('progress-bar')?.closest('.rounded-2xl')?.remove();
  d.querySelector('.ob-return')?.parentElement?.remove();
  d.getElementById('completion-banner')?.remove();
  d.querySelectorAll('.hidden, [hidden]').forEach((el) => el.remove());

  // Every link absolute, and written out under a button so a printed copy still works.
  d.querySelectorAll('a[href]').forEach((a) => {
    const h = a.getAttribute('href');
    if (!h || h.startsWith('#')) return;
    try { a.href = new URL(h, onSite).href; } catch {}
    a.removeAttribute('download');
    if (!a.closest('p, li')) {
      const u = d.createElement('span'); u.className = 'print-url';
      u.textContent = a.href.replace(/^https?:\/\//, '');
      a.style.flexDirection = 'column'; a.appendChild(u);
    }
  });

  // The video, as a link.
  d.querySelectorAll('iframe').forEach((f) => {
    const box = d.createElement('div'); box.className = 'print-video';
    const url = f.src.replace(/\/preview$/, '/view');
    box.innerHTML = '<strong>▶ Safeguarding briefing video</strong> (watched online during the training)<span class="print-url"></span>';
    box.querySelector('.print-url').textContent = url;
    const wrap = f.closest('.aspect-video, .relative') || f; wrap.replaceWith(box);
  });

  // Knowledge checks: the authored order, the right answer marked, its explanation shown.
  d.querySelectorAll('.aisa-quiz').forEach((q) => {
    q.querySelectorAll('.aisa-quiz-option[data-correct="true"]').forEach((o) => {
      o.classList.add('print-correct');
      const t = d.createElement('span'); t.className = 'print-answer-tag'; t.textContent = '✓ Correct answer'; o.appendChild(t);
    });
    const fb = q.querySelector('.aisa-quiz-feedback');
    if (fb) { fb.innerHTML = fb.getAttribute('data-correct-msg') || ''; fb.className = 'aisa-quiz-feedback correct show mt-4 text-sm rounded-xl p-4 bg-emerald-50 border border-emerald-200 text-emerald-900'; }
  });

  // Tick boxes and anything typeable print empty.
  d.querySelectorAll('input[type=checkbox]').forEach((i) => { i.checked = false; i.removeAttribute('checked'); });

  // Contents, and where this copy came from.
  const chapters = [...d.querySelectorAll('[data-chapter]')].map((c) => c.getAttribute('data-chapter-title'));
  const hero = d.querySelector('header.ob-hero .ob-hero-inner');
  const m = d.createElement('div'); m.className = 'print-meta'; m.innerHTML = meta; hero?.appendChild(m);
  const box = d.createElement('div'); box.className = 'print-contents';
  box.innerHTML = '<strong>Contents</strong><ol>' + chapters.map((t) => '<li></li>').join('') + '</ol>';
  box.querySelectorAll('li').forEach((li, i) => { li.textContent = chapters[i]; });
  d.querySelector('header.ob-hero')?.insertAdjacentElement('afterend', box);
  return chapters.length;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const empty = (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
await page.route('https://cdn.tailwindcss.com/**', empty);
await page.route('https://cdn.jsdelivr.net/**', empty);
await page.route(/\/(gate|training|onboarding-i18n|orientation-nav|safeguarding-ar)\.js/, empty);
await page.goto(pathToFileURL(PAGE).href, { waitUntil: 'load' });
await page.addStyleTag({ content: tailwindCss });
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
const n = await page.evaluate(prepare, {
  onSite: ON_SITE,
  meta: '<b>The full annual staff training, as every member of AISA staff takes it on the Learning Hub, with the answer key to its knowledge checks.</b> '
      + 'Required of all staff · 2 PD hours · completion recorded per person on the Hub. Printed ' + date + ' from ' + ON_SITE.replace(/^https:\/\//, ''),
});
await page.addStyleTag({ content: PRINT_CSS });
await page.evaluate(() => { document.title = 'AISA — Child Protection, Safeguarding, and Drug Prevention: Annual Staff Training'; });
await page.emulateMedia({ media: 'print' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
await page.pdf({
  path: OUT, format: 'A4', printBackground: true, displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font-size:7pt;color:#8d95ad;font-family:sans-serif;padding:0 12mm;display:flex;justify-content:space-between;">'
    + '<span>AISA · Child Protection, Safeguarding, and Drug Prevention — Annual Staff Training</span>'
    + '<span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' },
});
if (argv.includes('--png')) await page.screenshot({ path: OUT.replace(/\.pdf$/, '.png'), fullPage: true });
await browser.close();
console.log(`${path.basename(OUT)}: ${n} chapters` + (errors.length ? ` — page errors: ${errors.join(' | ')}` : ''));
