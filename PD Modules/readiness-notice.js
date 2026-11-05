/* readiness-notice.js — the pop-up on the AI Literacy: Teacher Readiness module
 * that tells whoever opens it whether the training is required of them.
 *
 * Why: the module is required only of the teachers on AISA's ADEK
 * Implementation Form (AI_LITERACY_COHORT in admin-dashboard.html). Everyone
 * else on the Hub can open it, so without a clear answer on arrival people
 * spend an hour on training nobody is chasing them for.
 *
 * Four answers, decided in the browser from the signed-in address:
 *   req  — on the list and not finished yet      "Required"
 *   done — on the list and already finished       "Nothing more to do"
 *   not  — not on the list                        "Not required"
 *   unk  — could not check (no address, no crypto) "Couldn't check"
 *
 * It decides what a card SAYS. It is not a permission gate and must never be
 * used as one: the module stays open to everyone ("not required" says they may
 * carry on), and nothing is stored or sent anywhere.
 *
 * KEEP IN STEP: the cohort lives in ai-literacy-cohort.js (loaded first), the same list
 * as the hashes in Media Hub/sep18.html and AI_LITERACY_COHORT in admin-dashboard.html.
 * `node tests/readiness-notice-test.js` fails when any of them drifts.
 * To regenerate, from the repo root:
 *
 *   python3 -c "
 *   import io,re,hashlib
 *   s=io.open('admin-dashboard.html',encoding='utf-8').read()
 *   m=re.search(r'const AI_LITERACY_COHORT = \[(.*?)\n        \];', s, re.S)
 *   for h in sorted(hashlib.sha256(e.strip().lower().encode()).hexdigest()[:16]
 *                   for e in re.findall(r'email:\s*\"([^\"]+)\"', m.group(1))):
 *       print(h)"
 *
 * Stored as truncated SHA-256 of the lower-cased address, not the addresses:
 * this repository is public. Tidiness, not security (the addresses are
 * first-initial-plus-surname, so anyone determined could hash their way
 * through them).
 */
(function () {
    'use strict';

    var MODULE_ID = 'ai-curriculum-readiness';
    var HUB_URL   = '../AI%20Literacy%20Hub/ai-literacy-hub.html';
    var SEEN_KEY  = 'aisa_readiness_notice_v1';   // sessionStorage: once per tab session
    var DONE_WAIT = 2500;                          // ms to wait for the completions list

    var COHORT = window.AISA_AI_LITERACY_COHORT || [];   // ai-literacy-cohort.js, loaded first

    /* Every phrase, both languages. Plain text only: the page's own
       dictionary translator never sees these (the English and Arabic are both
       in the markup, and CSS shows the one that matches body.lang-ar). */
    var COPY = {
        req: {
            tone: 'req',
            badge:  { en: 'Required for you', ar: 'مطلوب منكم' },
            title:  { en: 'You need to complete this training',
                      ar: 'عليكم إكمال هذا التدريب' },
            body:   { en: 'You are one of the teachers named on AISA’s ADEK Implementation Form for the AI Literacy curriculum, so the Teacher Readiness module is required of you. It takes about an hour, and your answers save as you go, so you can stop and carry on later.',
                      ar: 'أنتم من بين المعلّمين المذكورين في استمارة التطبيق الخاصة بـ AISA لدى دائرة التعليم والمعرفة لمنهج الثقافة في الذكاء الاصطناعي، لذا فإنّ وحدة الجاهزية مطلوبة منكم. تستغرق نحو ساعة، وتُحفَظ إجاباتكم أولًا بأول، فبإمكانكم التوقّف والمتابعة لاحقًا.' },
            primary:   { en: 'Start the training', ar: 'ابدؤوا التدريب' },
            secondary: null
        },
        done: {
            tone: 'done',
            badge:  { en: 'Already complete', ar: 'مكتمل بالفعل' },
            title:  { en: 'You have already finished this training',
                      ar: 'لقد أنهيتم هذا التدريب بالفعل' },
            body:   { en: 'This module is required of you, and the Hub shows you have completed it. There is nothing more to do. You are welcome to look back through it.',
                      ar: 'هذه الوحدة مطلوبة منكم، وتُظهر المنصّة أنكم أكملتموها. لا يلزمكم أي إجراء آخر. ويمكنكم مراجعتها متى شئتم.' },
            primary:   { en: 'Back to the AI Literacy Hub', ar: 'العودة إلى مركز الثقافة في الذكاء الاصطناعي', href: HUB_URL },
            secondary: { en: 'Look through the module', ar: 'تصفّح الوحدة' }
        },
        not: {
            tone: 'not',
            badge:  { en: 'Not required for you', ar: 'غير مطلوب منكم' },
            title:  { en: 'You do not need to do this training',
                      ar: 'لا يلزمكم إكمال هذا التدريب' },
            body:   { en: 'You are not on the list of teachers delivering the AI Literacy curriculum, so the Teacher Readiness module is not required of you, and nobody is chasing you for it. Please do not spend your time on it unless you want to. If you think you should be on the list, tell the AI team.',
                      ar: 'لستم ضمن قائمة المعلّمين الذين يدرّسون منهج الثقافة في الذكاء الاصطناعي، لذا فإنّ وحدة الجاهزية غير مطلوبة منكم، ولا أحد ينتظرها منكم. يُرجى عدم قضاء وقتكم فيها إلا إن رغبتم في ذلك. وإن كنتم ترون أنه ينبغي أن تكونوا ضمن القائمة، فأخبروا فريق الذكاء الاصطناعي.' },
            primary:   { en: 'Back to the AI Literacy Hub', ar: 'العودة إلى مركز الثقافة في الذكاء الاصطناعي', href: HUB_URL },
            secondary: { en: 'Look through it anyway', ar: 'تصفّحها على أي حال' }
        },
        unk: {
            tone: 'unk',
            badge:  { en: 'Couldn’t check', ar: 'تعذّر التحقّق' },
            title:  { en: 'We could not check if this is required for you',
                      ar: 'تعذّر التحقّق مما إذا كان هذا مطلوبًا منكم' },
            body:   { en: 'Your status could not be checked in this browser. If you are delivering the AI Literacy curriculum this year, this module is required of you. If you are not, it is not. If you are unsure, ask the AI team before you start.',
                      ar: 'تعذّر التحقّق من حالتكم في هذا المتصفّح. إن كنتم تدرّسون منهج الثقافة في الذكاء الاصطناعي هذا العام، فهذه الوحدة مطلوبة منكم. وإن لم تكونوا كذلك فهي غير مطلوبة. وإن لم تكونوا متأكدين، فاسألوا فريق الذكاء الاصطناعي قبل أن تبدؤوا.' },
            primary:   { en: 'Continue', ar: 'متابعة' },
            secondary: null
        }
    };

    var CSS = [
        '#rn-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;',
        '  padding:1rem;background:rgba(33,7,108,.62);overflow-y:auto;}',
        '#rn-card{background:#fff;color:#1a1a1a;max-width:34rem;width:100%;border-radius:14px;',
        '  border-top:8px solid #D8B664;box-shadow:0 20px 60px rgba(0,0,0,.35);padding:1.75rem 1.75rem 1.5rem;',
        '  font-family:"DM Sans",sans-serif;line-height:1.55;}',
        '#rn-card.is-req{border-top-color:#f59e0b;}',
        '#rn-card.is-done{border-top-color:#10b981;}',
        '#rn-card.is-not{border-top-color:#10b981;}',
        '#rn-card.is-unk{border-top-color:#94a3b8;}',
        '.rn-badge{display:inline-block;font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;',
        '  padding:.3rem .75rem;border-radius:999px;border:1px solid;margin-bottom:.8rem;}',
        '.is-req .rn-badge{background:#fef3c7;color:#92400e;border-color:#f59e0b;}',
        '.is-done .rn-badge,.is-not .rn-badge{background:#d1fae5;color:#065f46;border-color:#10b981;}',
        '.is-unk .rn-badge{background:#f1f5f9;color:#475569;border-color:#94a3b8;}',
        '#rn-title{font-size:1.45rem;font-weight:700;color:#21076C;line-height:1.25;margin:0 0 .7rem;}',
        '#rn-body{margin:0 0 .6rem;font-size:1rem;}',
        '#rn-who{margin:0 0 1.2rem;font-size:.82rem;color:#555;word-break:break-all;}',
        '.rn-actions{display:flex;flex-wrap:wrap;gap:.6rem;}',
        '.rn-btn{font:inherit;font-weight:700;font-size:.95rem;padding:.7rem 1.3rem;border-radius:999px;cursor:pointer;',
        '  text-decoration:none;border:2px solid #21076C;display:inline-block;text-align:center;}',
        '.rn-btn.primary{background:#21076C;color:#fff;}',
        '.rn-btn.primary:hover{background:#4A2E9B;border-color:#4A2E9B;}',
        '.rn-btn.secondary{background:#fff;color:#21076C;}',
        '.rn-btn.secondary:hover{background:#F2EFFA;}',
        '.rn-btn:focus-visible{outline:3px solid #D8B664;outline-offset:2px;}',
        '#rn-overlay .rn-ar{display:none;}',
        'body.lang-ar #rn-overlay .rn-en{display:none;}',
        'body.lang-ar #rn-overlay .rn-ar{display:inline;}',
        'body.lang-ar #rn-card{direction:rtl;text-align:right;font-family:"Tajawal","DM Sans",sans-serif;}',
        'body.lang-ar #rn-who{direction:ltr;text-align:right;}',
        'html.rn-open{overflow:hidden;}'
    ].join('\n');

    function el(tag, attrs, children) {
        var node = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k]; else node.setAttribute(k, attrs[k]);
        });
        (children || []).forEach(function (c) { node.appendChild(c); });
        return node;
    }

    /* A phrase in both languages: two spans, CSS shows one. */
    function bi(pair) {
        var frag = document.createDocumentFragment();
        frag.appendChild(el('span', { 'class': 'rn-en', text: pair.en }));
        frag.appendChild(el('span', { 'class': 'rn-ar', lang: 'ar', text: pair.ar }));
        return frag;
    }
    function fill(node, pair) { node.appendChild(bi(pair)); return node; }

    function remember() { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) {} }
    function seen() { try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } }

    /* The pop-up. Exposed as window.aisaReadinessNotice.show(which, email) so
       it can be checked in a browser without signing in as someone else. */
    function show(which, email) {
        if (document.getElementById('rn-overlay')) return;
        var c = COPY[which] || COPY.unk;

        if (!document.getElementById('rn-style')) {
            var style = el('style', { id: 'rn-style' });
            style.textContent = CSS;
            document.head.appendChild(style);
        }

        var badge = fill(el('span', { 'class': 'rn-badge' }), c.badge);
        var title = fill(el('h2', { id: 'rn-title' }), c.title);
        var body  = fill(el('p', { id: 'rn-body' }), c.body);
        var who   = el('p', { id: 'rn-who' });
        if (email) {
            who.appendChild(fill(el('span', {}), { en: 'Checked for: ', ar: 'تم التحقّق لـ: ' }));
            who.appendChild(el('span', { text: email }));   // textContent only
        }

        var actions = el('div', { 'class': 'rn-actions' });
        var primary;
        if (c.primary.href) {
            primary = fill(el('a', { 'class': 'rn-btn primary', href: c.primary.href }), c.primary);
            primary.addEventListener('click', remember);
        } else {
            primary = fill(el('button', { type: 'button', 'class': 'rn-btn primary' }), c.primary);
        }
        actions.appendChild(primary);
        var secondary = null;
        if (c.secondary) {
            secondary = fill(el('button', { type: 'button', 'class': 'rn-btn secondary' }), c.secondary);
            actions.appendChild(secondary);
        }

        var card = el('div', {
            id: 'rn-card', 'class': 'is-' + c.tone, role: 'dialog',
            'aria-modal': 'true', 'aria-labelledby': 'rn-title', 'aria-describedby': 'rn-body'
        }, [badge, title, body, who, actions]);
        var overlay = el('div', { id: 'rn-overlay' }, [card]);

        var opener = document.activeElement;
        function close() {
            remember();
            document.removeEventListener('keydown', onKey, true);
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            document.documentElement.classList.remove('rn-open');
            if (opener && opener.focus) { try { opener.focus(); } catch (e) {} }
        }
        function onKey(e) {
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key !== 'Tab') return;
            /* keep Tab inside the dialog */
            var f = card.querySelectorAll('a[href],button');
            if (!f.length) return;
            var first = f[0], last = f[f.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            else if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
        }

        /* Buttons that stay on the page just close the pop-up. */
        if (!c.primary.href) primary.addEventListener('click', close);
        if (secondary) secondary.addEventListener('click', close);

        document.documentElement.classList.add('rn-open');
        document.body.appendChild(overlay);
        document.addEventListener('keydown', onKey, true);
        primary.focus();
    }

    /* SHA-256 needs a secure context; over file:// or an old browser
       crypto.subtle is absent. Say "couldn't check" rather than guess. */
    function sha256Hex(text) {
        if (!(window.crypto && window.crypto.subtle && window.TextEncoder)) {
            return Promise.reject(new Error('no subtle crypto'));
        }
        return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
            return Array.prototype.map.call(new Uint8Array(buf), function (b) {
                return ('0' + b.toString(16)).slice(-2);
            }).join('');
        });
    }

    function hasCompleted(items) {
        return (items || []).some(function (i) { return i && i.module_id === MODULE_ID; });
    }

    /* Has this person already finished the module? Cached list first
       (instant), then the server, but never wait long: if the answer is slow
       the pop-up says "Required", which is still true. */
    function alreadyDone(auth) {
        var cached = null;
        try { cached = auth.getCompletionsCached ? auth.getCompletionsCached() : null; } catch (e) {}
        if (hasCompleted(cached)) return Promise.resolve(true);
        if (!auth.getCompletions) return Promise.resolve(false);
        return new Promise(function (resolve) {
            var timer = setTimeout(function () { resolve(false); }, DONE_WAIT);
            auth.getCompletions().then(function (items) {
                clearTimeout(timer); resolve(hasCompleted(items));
            }, function () { clearTimeout(timer); resolve(false); });
        });
    }

    function decide(auth) {
        var user  = (auth && auth.getUser) ? auth.getUser() : null;
        var email = (user && user.email ? String(user.email) : '').trim().toLowerCase();
        /* no list loaded must never read as "not on the list" */
        if (!email || !COHORT.length) return Promise.resolve({ which: 'unk' });
        return sha256Hex(email).then(function (hex) {
            if (COHORT.indexOf(hex.slice(0, 16)) === -1) return { which: 'not', email: email };
            return alreadyDone(auth).then(function (done) {
                return { which: done ? 'done' : 'req', email: email };
            });
        }).catch(function () { return { which: 'unk' }; });
    }

    window.aisaReadinessNotice = { show: show, decide: decide, COHORT: COHORT.slice() };

    function start() {
        if (seen()) return;     // already shown in this tab session: not again on every reload
        if (!window.aisaReady) { show('unk'); return; }
        window.aisaReady(function (auth) {
            decide(auth).then(function (r) { if (!seen()) show(r.which, r.email); });
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
