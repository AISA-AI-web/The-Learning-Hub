#!/usr/bin/env python3
"""Check a draft Digital Lion issue before anyone sees it.

    python3 "Media Hub/newsletter-harvester/check-issue.py" "Media Hub/oct19.html"

Exits non-zero if anything is wrong. FAIL lines must be fixed. WARN lines
need a look. CHECK lines are the <!-- CHECK: ... --> notes left for
Brandon to verify, and they must come out before the issue is published.

Checks:
  - no {{placeholders}} and no template instructions left in
  - every lang-en span is followed by its lang-ar twin, and neither is
    empty
  - every relative link and image points to a file that exists in the repo
  - no link to a module that is still in preview or admin-only on pd.html
  - the gate.js ?v= pin matches the one the rest of the Hub uses
  - the mail-out block (ISSUE, HEADLINE, ITEMS) is filled in and names the
    same issue number as the page
  - no hardcoded production host and no Google ouid= parameter
  - tags balance

No dependencies beyond the standard library.
"""
import collections
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'source', 'track', 'wbr', 'path'}
ARABIC = re.compile(r'[؀-ۿ]')


class Walk(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.langs = []          # (lang, line) in document order
        self.links = []          # (attr value, line)
        self.stack = []          # (tag, line, lang-or-None)
        self.lang_text = {}      # index in self.langs -> collected text
        self.open_lang = []      # indices of lang spans currently open
        self.unbalanced = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        line = self.getpos()[0]
        for key in ('href', 'src'):
            if a.get(key):
                self.links.append((a[key], line))
        if tag in VOID:
            return
        classes = (a.get('class') or '').split()
        lang = 'en' if 'lang-en' in classes else 'ar' if 'lang-ar' in classes else None
        if lang:
            self.langs.append((lang, line))
            self.open_lang.append(len(self.langs) - 1)
            self.lang_text[len(self.langs) - 1] = ''
        self.stack.append((tag, line, lang))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID and self.stack and self.stack[-1][0] == tag:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1][0] != tag:
            want = self.stack[-1] if self.stack else None
            self.unbalanced.append((tag, self.getpos()[0], want))
            # recover: pop to the matching tag if it is open at all
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    for t in self.stack[i:]:
                        if t[2]:
                            self.open_lang.pop()
                    del self.stack[i:]
                    break
            return
        t = self.stack.pop()
        if t[2]:
            self.open_lang.pop()

    def handle_data(self, data):
        for i in self.open_lang:
            self.lang_text[i] += data


def hub_gate_pin():
    pins = collections.Counter()
    for root, dirs, files in os.walk(REPO):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d != 'node_modules']
        for f in files:
            if f.endswith('.html'):
                try:
                    s = open(os.path.join(root, f), encoding='utf-8').read()
                except (OSError, UnicodeDecodeError):
                    continue
                for m in re.findall(r'gate\.js\?v=(\d+)', s):
                    pins[m] += 1
    return pins.most_common(1)[0][0] if pins else None


def unreleased_modules():
    """Files linked from pd.html cards that are still preview or admin-only."""
    path = os.path.join(REPO, 'PD Modules', 'pd.html')
    try:
        s = open(path, encoding='utf-8').read()
    except OSError:
        return set()
    out = set()
    for tag in re.findall(r'<a\b[^>]*>', s):
        if 'data-preview-for' in tag or 'data-admin-only' in tag:
            m = re.search(r'href="([^"#]+)"', tag)
            if m:
                out.add(os.path.normpath(os.path.join(REPO, 'PD Modules', unquote(m.group(1)))))
    return out


def main(path):
    src = open(path, encoding='utf-8').read()
    base = os.path.dirname(os.path.abspath(path))
    fails, warns = [], []

    def line_of(idx):
        return src.count('\n', 0, idx) + 1

    # 1. leftovers from the template
    for m in re.finditer(r'\{\{.*?\}\}', src, re.S):
        fails.append('line %d: placeholder left in: %s' % (line_of(m.start()), m.group(0)[:70]))
    if 'DIGITAL LION ISSUE TEMPLATE' in src:
        fails.append('the template instructions comment is still at the top; delete it')
    for m in re.finditer(r'COMPONENT:', src):
        warns.append('line %d: a "COMPONENT:" comment is left in; delete the template comments'
                     % line_of(m.start()))

    w = Walk()
    w.feed(src)

    # 2. bilingual pairing
    prev = None
    for i, (lang, line) in enumerate(w.langs):
        if lang == 'ar' and prev != 'en':
            fails.append('line %d: lang-ar span with no lang-en span before it' % line)
        if lang == 'en' and prev == 'en':
            fails.append('line %d: lang-en span with no lang-ar twin after it' % w.langs[i - 1][1])
        text = w.lang_text.get(i, '').strip()
        if not text:
            fails.append('line %d: empty lang-%s span' % (line, lang))
        elif lang == 'ar' and not ARABIC.search(text):
            warns.append('line %d: lang-ar span has no Arabic in it: %r' % (line, text[:60]))
        prev = lang
    if w.langs and w.langs[-1][0] == 'en':
        fails.append('line %d: lang-en span with no lang-ar twin after it' % w.langs[-1][1])

    # 3. links
    blocked = unreleased_modules()
    for value, line in w.links:
        if 'ouid=' in value:
            fails.append('line %d: link carries a Google ouid= (owner id); strip it' % line)
        if 'github.io' in value:
            fails.append('line %d: hardcoded production host %s; use a relative link' % (line, value))
        parts = urlsplit(value)
        if parts.scheme or value.startswith(('#', '//', 'mailto:', 'tel:', 'javascript:')):
            continue
        target = os.path.normpath(os.path.join(base, unquote(parts.path)))
        if parts.path and not os.path.exists(target):
            fails.append('line %d: link to a file that does not exist: %s' % (line, value))
        if target in blocked:
            fails.append('line %d: links to a module that is not released yet: %s' % (line, value))

    # 4. gate.js pin
    pin = hub_gate_pin()
    mine = re.findall(r'gate\.js\?v=(\d+)', src)
    if not mine:
        fails.append('no ../auth/gate.js?v=N include; the page would skip the sign-in gate')
    elif pin and any(p != pin for p in mine):
        fails.append('gate.js?v=%s, but the rest of the Hub is on ?v=%s' % (mine[0], pin))

    # 5. mail-out block
    issue = re.search(r"var ISSUE\s*=\s*'Issue No\. (\d+)", src)
    hero = re.search(r'<span class="lang-en">Issue No\. (\d+)', src)
    if not re.search(r'var ITEMS\s*=\s*\[\s*[\'"]', src):
        fails.append('the mail-out ITEMS list is missing or empty')
    if not issue:
        fails.append('the mail-out ISSUE line is missing or not "Issue No. N ..."')
    elif hero and issue.group(1) != hero.group(1):
        fails.append('mail-out says Issue No. %s but the page says Issue No. %s'
                     % (issue.group(1), hero.group(1)))
    for name in ('Do you have to do the training', 'status-card', 'var COHORT'):
        if name in src:
            warns.append('"%s" is from Issue No. 5\'s cohort check; remove it unless this issue '
                         'deliberately repeats that card' % name)

    # 6. structure
    for tag, line, want in w.unbalanced[:10]:
        fails.append('line %d: </%s> does not match the open <%s> from line %s'
                     % (line, tag, want[0] if want else '-', want[1] if want else '-'))
    for tag, line, _ in w.stack:
        if tag not in ('html', 'body', 'head'):
            fails.append('line %d: <%s> is never closed' % (line, tag))

    # 7. other people's addresses
    for addr in sorted(set(re.findall(r'[\w.+-]+@aisa\.sch\.ae', src)) - {'bbaki@aisa.sch.ae'}):
        warns.append('mentions %s; staff addresses are personal data, keep only if essential' % addr)

    checks = [(line_of(m.start()), m.group(1).strip())
              for m in re.finditer(r'<!--\s*CHECK:(.*?)-->', src, re.S)]

    for f in fails:
        print('FAIL  ' + f)
    for x in warns:
        print('WARN  ' + x)
    for line, text in checks:
        print('CHECK line %d: %s' % (line, text))
    en = sum(1 for l, _ in w.langs if l == 'en')
    print('%s · %d bilingual pairs · %d links · %d to verify · %d warnings · %d failures'
          % (os.path.basename(path), en, len(w.links), len(checks), len(warns), len(fails)))
    return 1 if fails else 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
