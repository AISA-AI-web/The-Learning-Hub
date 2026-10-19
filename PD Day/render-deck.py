#!/usr/bin/env python3
"""Turn a slide deck into what the PD Day page's slide viewer reads.

    python3 "PD Day/render-deck.py" DECK.pptx "PD Day/assets/october-2026/<id>" --name <file-stem>
    python3 "PD Day/render-deck.py" DECK.pdf  "PD Day/assets/october-2026/<id>" --name <file-stem>

Writes, into the session's assets folder:
    slides/slide-01.webp …   1600 px wide, for the viewer
    thumbs/slide-01.webp …   400 px wide, for the thumbnail strip
    <file-stem>.pdf          the download (and <file-stem>.pptx, given a .pptx,
                             unless --no-pptx)

then prints a DECKS entry for the page script, with each slide's caption
and alt text filled from the slide's own words. Read those before you
commit: they are a starting point, and slide text comes out of a PDF in
whatever order the PDF holds it.

Hidden slides are left out, as they were when the deck was presented;
the script names them so you can check that is what the presenter meant.

A .pptx is converted with LibreOffice, so the deck's fonts must be
installed or LibreOffice substitutes wider ones and titles run into the
text below them. The script checks first and stops if one is missing.
Set SOFFICE to the command that runs LibreOffice if `soffice` alone does
not (in Claude's sandbox: "python3 <pptx skill>/scripts/office/soffice.py").

Needs: LibreOffice (for .pptx), poppler-utils (pdftoppm, pdftotext),
Pillow.
"""
import argparse
import glob
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import zipfile

from PIL import Image

SLIDE_W, THUMB_W = 1600, 400
# Fonts Office decks name that Linux ships under another, metric-compatible name.
ALIASES = {
    'calibri': 'carlito', 'cambria': 'caladea', 'arial': 'liberation sans',
    'helvetica': 'liberation sans', 'times new roman': 'liberation serif',
    'courier new': 'liberation mono',
}


def deck_fonts(pptx):
    """Latin fonts the slides actually use, plus the theme's heading/body pair."""
    names = set()
    with zipfile.ZipFile(pptx) as z:
        for n in z.namelist():
            if re.match(r'ppt/(slides|slideLayouts|slideMasters)/[^/]+\.xml$', n):
                names.update(re.findall(r'<a:latin typeface="([^"]*)"', z.read(n).decode('utf8', 'replace')))
            elif re.match(r'ppt/theme/[^/]+\.xml$', n):
                xml = z.read(n).decode('utf8', 'replace')
                for part in ('majorFont', 'minorFont'):
                    m = re.search(r'<a:%s>\s*<a:latin typeface="([^"]*)"' % part, xml)
                    if m:
                        names.add(m.group(1))
    return sorted(f for f in names if f and not f.startswith('+'))


def hidden_slides(pptx):
    """1-based positions and titles of slides marked hidden, in deck order."""
    with zipfile.ZipFile(pptx) as z:
        pres = z.read('ppt/presentation.xml').decode('utf8', 'replace')
        rels = z.read('ppt/_rels/presentation.xml.rels').decode('utf8', 'replace')
        target = {}
        for rel in re.findall(r'<Relationship [^>]*>', rels):
            rid, tgt = re.search(r'Id="([^"]+)"', rel), re.search(r'Target="([^"]+)"', rel)
            if rid and tgt:
                target[rid.group(1)] = tgt.group(1).lstrip('/').replace('ppt/', '', 1)
        out = []
        for n, rid in enumerate(re.findall(r'<p:sldId [^>]*r:id="([^"]+)"', pres), 1):
            xml = z.read('ppt/' + target[rid]).decode('utf8', 'replace')
            if re.search(r'<p:sld\b[^>]*\bshow="0"', xml):
                words = [w.strip() for w in re.findall(r'<a:t>([^<]*)</a:t>', xml) if w.strip()]
                out.append('%d (%s)' % (n, words[0] if words else 'no text'))
        return out


def missing_fonts(fonts):
    out = []
    for f in fonts:
        got = subprocess.run(['fc-match', '-f', '%{family}', f], capture_output=True, text=True).stdout
        got = [g.strip().lower() for g in got.split(',')]
        want = f.lower()
        if want not in got and ALIASES.get(want) not in got:
            out.append('%s (LibreOffice would use %s)' % (f, got[0] if got else '?'))
    return out


def to_pdf(pptx, tmp):
    cmd = shlex.split(os.environ.get('SOFFICE', 'soffice'))
    subprocess.run(cmd + ['--headless', '--convert-to', 'pdf', '--outdir', tmp, pptx],
                   check=True, stdout=subprocess.DEVNULL, timeout=600)
    pdf = os.path.join(tmp, os.path.splitext(os.path.basename(pptx))[0] + '.pdf')
    if not os.path.exists(pdf):
        sys.exit('LibreOffice did not write %s' % pdf)
    return pdf


def page_text(pdf, n):
    txt = subprocess.run(['pdftotext', '-f', str(n), '-l', str(n), '-raw', pdf, '-'],
                         capture_output=True, text=True).stdout
    return [re.sub(r'\s+', ' ', l).strip() for l in txt.splitlines() if l.strip()]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('deck', help='.pptx or .pdf')
    ap.add_argument('out', help='the session assets folder, e.g. "PD Day/assets/october-2026/<id>"')
    ap.add_argument('--name', required=True, help='file stem for the downloads, e.g. my-session-slides')
    ap.add_argument('--ignore-fonts', action='store_true', help='render even if a deck font is missing')
    ap.add_argument('--no-pptx', action='store_true',
                    help='offer the PDF only: for decks too big for the repo, or with speaker notes not to publish')
    a = ap.parse_args()

    ext = os.path.splitext(a.deck)[1].lower()
    if ext not in ('.pptx', '.pdf'):
        sys.exit('Give a .pptx or a .pdf (export Google Slides as either).')
    os.makedirs(a.out, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        if ext == '.pptx':
            fonts = deck_fonts(a.deck)
            gone = missing_fonts(fonts)
            print('Deck fonts: ' + (', '.join(fonts) or 'none named'))
            if gone and not a.ignore_fonts:
                sys.exit('Install these first, or pass --ignore-fonts:\n  ' + '\n  '.join(gone))
            hidden = hidden_slides(a.deck)
            if hidden:
                print('Hidden, so left out: slide ' + ', '.join(hidden))
            pdf = to_pdf(os.path.abspath(a.deck), tmp)
        else:
            pdf = a.deck

        subprocess.run(['pdftoppm', '-png', '-scale-to', str(SLIDE_W), pdf, os.path.join(tmp, 'p')], check=True)
        pages = sorted(glob.glob(os.path.join(tmp, 'p-*.png')), key=lambda p: int(re.findall(r'(\d+)\.png$', p)[0]))
        if not pages:
            sys.exit('No pages rendered from %s' % pdf)

        # A shorter deck must not leave the old deck's last slides behind.
        for d in ('slides', 'thumbs'):
            os.makedirs(os.path.join(a.out, d), exist_ok=True)
            for old in glob.glob(os.path.join(a.out, d, 'slide-*.webp')):
                os.remove(old)

        entries = []
        for i, png in enumerate(pages, 1):
            im = Image.open(png).convert('RGB')
            im.save(os.path.join(a.out, 'slides', 'slide-%02d.webp' % i), 'WEBP', quality=86, method=6)
            th = im.resize((THUMB_W, round(im.height * THUMB_W / im.width)), Image.LANCZOS)
            th.save(os.path.join(a.out, 'thumbs', 'slide-%02d.webp' % i), 'WEBP', quality=80, method=6)
            lines = page_text(pdf, i)
            entries.append({'t': lines[0] if lines else 'Slide %d' % i,
                            'alt': ' '.join(lines) or 'Slide %d (no text).' % i})

        for src, dst in ((pdf, a.name + '.pdf'), (a.deck if ext == '.pptx' and not a.no_pptx else None, a.name + '.pptx')):
            dst = os.path.join(a.out, dst)
            if src and not (os.path.exists(dst) and os.path.samefile(src, dst)):
                shutil.copyfile(src, dst)

    key = os.path.basename(os.path.normpath(a.out))
    base = os.path.relpath(a.out, os.path.dirname(os.path.abspath(__file__))).replace(os.sep, '/') + '/'
    print('\n%d slides written to %s\n' % (len(entries), a.out))
    print('DECKS entry (check every caption and alt text before committing):\n')
    print("            '%s': {" % key)
    print("                base: '%s'," % base)
    print("                name: { en: 'SESSION TITLE', ar: 'عنوان الجلسة' },")
    print('                slides: [')
    for e in entries:
        print('                    { t: %s, alt: %s },' % (json.dumps(e['t'], ensure_ascii=False), json.dumps(e['alt'], ensure_ascii=False)))
    print('                ]')
    print('            },')
    print('\nPlaceholder for the session section:  <div class="mt-4" data-sv="%s"></div>' % key)


if __name__ == '__main__':
    main()
