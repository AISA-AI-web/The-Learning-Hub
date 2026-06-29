/* =========================================================================
   AISA — New-Staff Onboarding: English ↔ Arabic translation engine.

   Loaded on the three onboarding modules alongside a per-page dictionary
   (window.AR_DICT, defined in <slug>-ar.js). Provides:
     - An in-page language toggle (no network calls)
     - Text-node + attribute translation using the dictionary
     - A MutationObserver so dynamically-built chrome (the training wizard
       sidebar / nav, the completion certificate modal, toasts) also
       translates while Arabic is active
     - RTL handling + localStorage persistence across pages
   Falls back to English for anything not in the dictionary.
   ========================================================================= */
(function () {
    'use strict';

    /* Shared chrome / framework / certificate strings (identical on all
       three modules). Page-specific content lives in window.AR_DICT. */
    var BASE = {
        // Training-wizard chrome (auth/training.js)
        "Chapters": "الفصول",
        "Progress": "التقدّم",
        "Previous": "السابق",
        "Next chapter": "الفصل التالي",
        "Finish training": "إنهاء التدريب",
        "Answer the knowledge check to continue": "أجب عن اختبار الفهم للمتابعة",
        "Correct!": "إجابة صحيحة!",
        "You can now move on.": "يمكنك المتابعة الآن.",
        "Module Progress": "تقدّم الوحدة",
        "0% Done": "0% مكتمل",
        "Return to Modules": "العودة إلى الوحدات",
        "Completion saved": "تم حفظ الإكمال",
        // Completion certificate modal (auth/certificate.js)
        "Module Complete": "اكتملت الوحدة",
        "Module complete": "اكتملت الوحدة",
        "Congratulations!": "تهانينا!",
        "You’ve completed": "لقد أكملت",
        "of PD).": "من التطوير المهني).",
        "Download your certificate, then head back to choose your next module.":
            "نزّل شهادتك، ثم عُد لاختيار وحدتك التالية.",
        "🎓 Download Certificate": "🎓 تنزيل الشهادة",
        "Download Certificate": "تنزيل الشهادة",
        "Download Your Certificate": "تنزيل شهادتك",
        "Back to Modules": "العودة إلى الوحدات",
        "← Back to Modules": "→ العودة إلى الوحدات",
        "Stay on this page": "البقاء في هذه الصفحة",
        "Your certificate opened in a new tab — use": "فُتحت شهادتك في علامة تبويب جديدة — استخدم",
        "Print → Save as PDF": "طباعة ← حفظ بصيغة PDF",
        "there to keep it.": "هناك للاحتفاظ بها.",
        "1 hour": "ساعة واحدة",
        "2 hours": "ساعتان",
        "Close": "إغلاق",
        // Auth gate (auth/gate.js)
        "Sign in required": "تسجيل الدخول مطلوب",
        "Loading sign-in": "جارٍ تحميل تسجيل الدخول"
    };

    var DICT = {};
    function buildDict() {
        DICT = {};
        var k;
        for (k in BASE) if (BASE.hasOwnProperty(k)) DICT[k] = BASE[k];
        if (window.AR_DICT) for (k in window.AR_DICT) if (window.AR_DICT.hasOwnProperty(k)) DICT[k] = window.AR_DICT[k];
    }

    /* Dynamic patterns the framework generates with live numbers. */
    function patternTranslate(t) {
        var m;
        if ((m = /^Chapter (\d+) of (\d+)$/.exec(t))) return 'الفصل ' + m[1] + ' من ' + m[2];
        if ((m = /^Chapter (\d+)$/.exec(t)))          return 'الفصل ' + m[1];
        if ((m = /^Section (\d+)$/.exec(t)))          return 'القسم ' + m[1];
        return null;
    }

    function trans(en) {
        if (en == null) return en;
        var trimmed = en.trim();
        if (!trimmed) return en;
        var ar = DICT[trimmed];
        if (ar === undefined) { var p = patternTranslate(trimmed); if (p !== null) ar = p; }
        if (ar === undefined) return en;            // keep English
        var lead = en.match(/^\s*/)[0], trail = en.match(/\s*$/)[0];
        return lead + ar + trail;
    }

    var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, KBD: 1, TEXTAREA: 1 };
    var ATTRS = ['title', 'alt', 'placeholder', 'aria-label'];
    var lang = 'en';
    var observer = null;

    function setText(node, toAr) {
        if (node.__obEn === undefined) node.__obEn = node.nodeValue;
        node.nodeValue = toAr ? trans(node.__obEn) : node.__obEn;
    }
    function setAttr(el, a, toAr) {
        var key = '__obEn_' + a;
        if (el[key] === undefined) el[key] = el.getAttribute(a);
        el.setAttribute(a, toAr ? trans(el[key]) : el[key]);
    }

    function eachTextNode(root, fn) {
        if (root.nodeType === 3) { fn(root); return; }
        if (!root.querySelectorAll) return;
        var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                var p = n.parentElement;
                if (!p) return NodeFilter.FILTER_REJECT;
                if (SKIP[p.tagName]) return NodeFilter.FILTER_REJECT;
                if (p.closest('[data-no-translate]')) return NodeFilter.FILTER_REJECT;
                if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var n; while ((n = w.nextNode())) fn(n);
    }
    function eachAttr(root, fn) {
        var els = [];
        if (root.nodeType === 1) els.push(root);
        if (root.querySelectorAll) els = els.concat([].slice.call(root.querySelectorAll('*')));
        els.forEach(function (el) {
            if (SKIP[el.tagName]) return;
            ATTRS.forEach(function (a) {
                if (el.hasAttribute && el.hasAttribute(a)) {
                    var v = el.getAttribute(a);
                    if (v && v.trim()) fn(el, a);
                }
            });
        });
    }
    function applyTo(root, toAr) {
        eachTextNode(root, function (n) { setText(n, toAr); });
        eachAttr(root, function (el, a) { setAttr(el, a, toAr); });
    }

    /* Translate nodes the framework / certificate inject after load. */
    function startObserver() {
        if (observer) return;
        observer = new MutationObserver(function (muts) {
            if (lang !== 'ar') return;
            observer.disconnect();
            try {
                muts.forEach(function (m) {
                    if (m.type === 'characterData') {
                        var n = m.target;
                        if (n.nodeType === 3 && n.parentElement && !SKIP[n.parentElement.tagName]
                            && n.nodeValue && n.nodeValue.trim()) {
                            n.__obEn = n.nodeValue;      // framework just wrote fresh English
                            setText(n, true);
                        }
                    } else if (m.type === 'childList') {
                        m.addedNodes.forEach(function (nd) {
                            if (nd.nodeType === 3) {
                                if (nd.parentElement && !SKIP[nd.parentElement.tagName]
                                    && nd.nodeValue && nd.nodeValue.trim()) {
                                    nd.__obEn = nd.nodeValue;
                                    setText(nd, true);
                                }
                            } else if (nd.nodeType === 1) {
                                applyTo(nd, true);
                            }
                        });
                    }
                });
            } finally {
                observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    }

    function isArabic() { return lang === 'ar'; }

    function setLang(next) {
        lang = (next === 'ar') ? 'ar' : 'en';
        var ar = lang === 'ar';
        var html = document.documentElement;
        html.setAttribute('lang', ar ? 'ar' : 'en');
        html.setAttribute('dir', ar ? 'rtl' : 'ltr');
        document.body.classList.add('lang-switching');
        buildDict();
        applyTo(document.body, ar);
        document.body.classList.toggle('lang-ar', ar);
        if (ar) startObserver();
        try { localStorage.setItem('aisa_onboarding_lang', lang); } catch (e) {}
        updateButtons();
        setTimeout(function () { document.body.classList.remove('lang-switching'); }, 450);
    }
    function toggleLang() { setLang(isArabic() ? 'en' : 'ar'); }

    function updateButtons() {
        document.querySelectorAll('.ob-lang-text').forEach(function (el) {
            el.textContent = isArabic() ? 'English' : 'العربية';
        });
        document.querySelectorAll('.ob-lang').forEach(function (b) {
            b.setAttribute('aria-label', isArabic() ? 'Switch language to English' : 'تبديل اللغة إلى العربية');
            b.setAttribute('title', isArabic() ? 'Click here for English' : 'اضغط هنا للعربية — Click here for Arabic');
        });
    }

    var GLOBE = '<span class="ob-lang-globe" aria-hidden="true">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>' +
        '</span>';

    function injectButton() {
        if (document.querySelector('.ob-lang')) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ob-lang';
        btn.innerHTML = GLOBE + '<span class="ob-lang-text">العربية</span>';
        btn.addEventListener('click', toggleLang);
        var host = document.querySelector('.ob-hero .ob-actions');
        if (host) {
            host.insertBefore(btn, host.firstChild);
        } else {
            btn.classList.add('ob-lang-floating');
            document.body.appendChild(btn);
        }
    }

    window.AISA_setLang = setLang;
    window.AISA_toggleLang = toggleLang;

    function init() {
        injectButton();
        var saved = null;
        try { saved = localStorage.getItem('aisa_onboarding_lang'); } catch (e) {}
        if (saved === 'ar') {
            setLang('ar');
        } else {
            updateButtons();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
