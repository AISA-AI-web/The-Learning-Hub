/*
 * AISA Learning Hub — completion certificate.
 *
 * Auto-loaded by auth/gate.js once the user is signed in. On any page
 * that has a #completion-banner, it injects a "Download Certificate"
 * button. When the module is finished (the banner is revealed) the
 * button is right there; clicking it opens a print-ready certificate
 * in a new tab, pre-filled with:
 *
 *   - the signed-in teacher's name (from the Google session, falling
 *     back to a title-cased version of their email),
 *   - the module title (from #completion-banner[data-cert-title], or
 *     window.AISA_CERT_TITLE, or a cleaned document.title),
 *   - the PD hours awarded (from #completion-banner[data-cert-hours] or
 *     window.AISA_CERT_HOURS; defaults to the school minimum of 1 hour),
 *     stated explicitly so teachers can log them as ADEK PD hours,
 *   - today's date,
 *   - two fixed signatures: the Director and the Head of Curriculum.
 *
 * The certificate is produced via the browser's native print-to-PDF,
 * so there are no external dependencies — it works even when CDN
 * scripts are blocked.
 */
(function () {
    'use strict';

    var DIRECTOR   = { name: 'Dr. Andrew Torris', title: 'Director' };
    var CURRICULUM = { name: 'Amira El Turabi',  title: 'Head of Curriculum, Teaching and Learning' };

    var injected = false;

    function init() {
        if (injected) return;
        var banner = document.getElementById('completion-banner');
        if (!banner) return;
        injected = true;
        injectButton(banner);
    }

    function injectButton(banner) {
        if (banner.querySelector('.aisa-cert-btn')) return;
        var wrap = document.createElement('div');
        wrap.className = 'aisa-cert-btn-wrap no-print';
        wrap.style.cssText = 'margin-top:1.25rem;display:flex;justify-content:center;';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aisa-cert-btn';
        btn.innerHTML =
            '<span aria-hidden="true" style="font-size:1.15em;line-height:1">\u{1F393}</span>' +
            '<span>Download Your Certificate</span>';
        btn.style.cssText = [
            'display:inline-flex;align-items:center;gap:.6rem;cursor:pointer;',
            'font-family:inherit;font-size:1rem;font-weight:800;color:#0f172a;',
            'background:#ffffff;border:none;padding:.85rem 1.6rem;border-radius:9999px;',
            'box-shadow:0 10px 25px -8px rgba(0,0,0,.35);transition:transform .15s,box-shadow .15s;'
        ].join('');
        btn.addEventListener('mouseenter', function () {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 14px 30px -8px rgba(0,0,0,.45)';
        });
        btn.addEventListener('mouseleave', function () {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 10px 25px -8px rgba(0,0,0,.35)';
        });
        btn.addEventListener('click', function () { openCertificate(); });

        wrap.appendChild(btn);
        banner.appendChild(wrap);
    }

    /* -------- data helpers -------- */

    function getUserName() {
        try {
            var u = window.aisaAuth && window.aisaAuth.getUser ? window.aisaAuth.getUser() : null;
            if (u && u.name && u.name.trim()) return u.name.trim();
            if (u && u.email) return titleCaseFromEmail(u.email);
        } catch (e) {}
        return 'AISA Educator';
    }

    function titleCaseFromEmail(email) {
        var local = String(email).split('@')[0];
        var parts = local.split(/[._\-]+/).filter(Boolean).map(function (p) {
            return p.charAt(0).toUpperCase() + p.slice(1);
        });
        return parts.length ? parts.join(' ') : 'AISA Educator';
    }

    function getModuleTitle() {
        var banner = document.getElementById('completion-banner');
        if (banner && banner.dataset && banner.dataset.certTitle) return banner.dataset.certTitle;
        if (window.AISA_CERT_TITLE) return window.AISA_CERT_TITLE;
        var t = document.title || 'Professional Development Module';
        /* Strip a leading "AISA | " / "AISA - " style site prefix. */
        return t.replace(/^\s*AISA\s*[|\-–—:]\s*/i, '').trim() || 'Professional Development Module';
    }

    /* PD hours awarded for this module — printed on the certificate so it
     * can be logged toward ADEK professional-development requirements.
     * Source order: banner data-attr, global override, then the school's
     * minimum of 1 hour per module. */
    function getModuleHours() {
        var raw = null;
        var banner = document.getElementById('completion-banner');
        if (banner && banner.dataset && banner.dataset.certHours != null && banner.dataset.certHours !== '') {
            raw = banner.dataset.certHours;
        } else if (window.AISA_CERT_HOURS != null && window.AISA_CERT_HOURS !== '') {
            raw = window.AISA_CERT_HOURS;
        }
        var n = parseFloat(raw);
        if (!isFinite(n) || n <= 0) n = 1;   /* school minimum: 1 PD hour */
        return Math.round(n * 100) / 100;     /* tidy any float noise */
    }

    /* "1 hour", "1.5 hours", "2 hours" — singular only for exactly one. */
    function hoursLabel(n) {
        return numberLabel(n) + ' ' + (n === 1 ? 'hour' : 'hours');
    }

    /* Bare numeral, no trailing ".0": 1 → "1", 1.5 → "1.5". */
    function numberLabel(n) {
        return (n % 1 === 0) ? String(n) : String(n);
    }

    /* Where "Back to Modules" should go from the completion modal.
     * All PD modules live alongside pd.html, so a relative link works;
     * overridable per page. */
    function getModulesUrl() {
        var banner = document.getElementById('completion-banner');
        if (banner && banner.dataset && banner.dataset.modulesUrl) return banner.dataset.modulesUrl;
        if (window.AISA_MODULES_URL) return window.AISA_MODULES_URL;
        return 'pd.html';
    }

    function getLogoUrl() {
        var img = document.querySelector('img[src*="AISA_logo"]') ||
                  document.querySelector('img[alt*="AISA" i]');
        return img ? img.src : '';
    }

    function todayString() {
        try {
            return new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {
            return new Date().toDateString();
        }
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    /* -------- certificate window -------- */

    function openCertificate(opts) {
        opts = (opts && typeof opts === 'object' && opts.nodeType === undefined) ? opts : {};
        var name  = opts.name  || getUserName();
        var title = opts.title || getModuleTitle();
        var hours = (opts.hours != null) ? opts.hours : getModuleHours();
        var html = buildCertHtml(name, title, todayString(), getLogoUrl(), hours);
        var w = window.open('', '_blank');
        if (!w) {
            alert('Please allow pop-ups for this site to download your certificate.');
            return;
        }
        w.document.open();
        w.document.write(html);
        w.document.close();
    }

    function signatureBlock(person) {
        return '' +
            '<div class="sig">' +
                '<div class="sig-name">' + esc(person.name) + '</div>' +
                '<div class="sig-rule"></div>' +
                '<div class="sig-person">' + esc(person.name) + '</div>' +
                '<div class="sig-title">' + esc(person.title) + '</div>' +
            '</div>';
    }

    function buildCertHtml(name, title, date, logo, hours) {
        var h = parseFloat(hours);
        if (!isFinite(h) || h <= 0) h = 1;
        h = Math.round(h * 100) / 100;

        var logoTag = logo
            ? '<img src="' + esc(logo) + '" alt="AISA" class="logo" />'
            : '<div class="logo-fallback">AISA</div>';

        return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
            '<title>Certificate of Completion — ' + esc(name) + '</title>' +
            '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
            '<link rel="preconnect" href="https://fonts.googleapis.com">' +
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
            '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Great+Vibes&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
            '<style>' +
            '@page{size:A4 landscape;margin:0;}' +
            '*{box-sizing:border-box;}' +
            'html,body{margin:0;padding:0;}' +
            'body{font-family:"Inter",system-ui,sans-serif;background:#475569;' +
                'display:flex;flex-direction:column;align-items:center;padding:24px;}' +
            '.toolbar{display:flex;gap:.75rem;margin-bottom:18px;}' +
            '.toolbar button{font:inherit;font-weight:700;cursor:pointer;border:none;' +
                'padding:.7rem 1.4rem;border-radius:9999px;}' +
            '.toolbar .print{background:#0f172a;color:#fff;}' +
            '.toolbar .close{background:#e2e8f0;color:#0f172a;}' +
            '.sheet{position:relative;width:1122px;max-width:100%;aspect-ratio:1.414/1;' +
                'background:#fffdf8;box-shadow:0 30px 60px -20px rgba(0,0,0,.5);' +
                'padding:54px 64px;overflow:hidden;}' +
            '.frame{position:absolute;inset:18px;border:2px solid #c8a24a;}' +
            '.frame:before{content:"";position:absolute;inset:7px;border:1px solid #d8c081;}' +
            '.inner{position:relative;height:100%;display:flex;flex-direction:column;' +
                'align-items:center;text-align:center;padding:26px 30px;}' +
            '.logo{height:74px;width:auto;object-fit:contain;margin-bottom:8px;}' +
            '.logo-fallback{font-weight:800;font-size:34px;color:#0b2545;letter-spacing:.12em;margin-bottom:8px;}' +
            '.org{font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:#7c6320;font-weight:700;}' +
            '.cert-title{font-family:"Cormorant Garamond",serif;font-weight:700;' +
                'font-size:46px;color:#0b2545;letter-spacing:.02em;margin:14px 0 2px;}' +
            '.cert-sub{font-size:13px;letter-spacing:.28em;text-transform:uppercase;color:#64748b;margin-bottom:18px;}' +
            '.awarded{font-size:15px;color:#475569;margin-bottom:6px;}' +
            '.name{font-family:"Great Vibes",cursive;font-size:64px;line-height:1.05;' +
                'color:#0b2545;margin:2px 0 6px;}' +
            '.name-rule{width:60%;max-width:520px;height:1px;background:#c8a24a;margin:0 auto 18px;}' +
            '.body-text{font-family:"Cormorant Garamond",serif;font-size:21px;color:#334155;' +
                'max-width:760px;line-height:1.5;margin:0 auto;}' +
            '.body-text .module{font-weight:700;color:#0b2545;}' +
            '.body-text .hours{font-weight:700;color:#0b2545;white-space:nowrap;}' +
            '.meta{margin-top:14px;font-size:14px;color:#64748b;}' +
            '.pd-hours{margin-top:8px;display:inline-flex;align-items:center;gap:.5rem;' +
                'font-size:13px;font-weight:700;color:#7c6320;letter-spacing:.06em;' +
                'background:#fbf3da;border:1px solid #e7d8a8;border-radius:9999px;padding:5px 14px;' +
                '-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
            '.spacer{flex:1;}' +
            '.sigs{display:flex;justify-content:center;gap:120px;width:100%;margin-top:8px;}' +
            '.sig{display:flex;flex-direction:column;align-items:center;min-width:240px;}' +
            '.sig-name{font-family:"Great Vibes",cursive;font-size:30px;color:#0b2545;height:34px;line-height:34px;}' +
            '.sig-rule{width:230px;height:1px;background:#94a3b8;margin:4px 0 7px;}' +
            '.sig-person{font-weight:700;font-size:14px;color:#0f172a;}' +
            '.sig-title{font-size:12px;color:#64748b;margin-top:2px;max-width:240px;}' +
            '.seal{position:absolute;right:64px;bottom:58px;width:96px;height:96px;border-radius:50%;' +
                'background:radial-gradient(circle at 50% 40%,#e7c873,#c8a24a);color:#0b2545;' +
                'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                'box-shadow:0 6px 14px -4px rgba(0,0,0,.4);border:3px solid #fffdf8;}' +
            '.seal b{font-size:13px;letter-spacing:.14em;}' +
            '.seal span{font-size:9px;letter-spacing:.18em;text-transform:uppercase;margin-top:2px;}' +
            '@media print{body{background:#fff;padding:0;}.toolbar{display:none;}' +
                '.sheet{box-shadow:none;width:100%;height:100vh;max-width:none;}}' +
            '</style></head><body>' +
            '<div class="toolbar">' +
                '<button class="print" onclick="window.print()">\u{1F4BE} Print / Save as PDF</button>' +
                '<button class="close" onclick="window.close()">Close</button>' +
            '</div>' +
            '<div class="sheet"><div class="frame"></div><div class="inner">' +
                logoTag +
                '<div class="org">American International School in Abu Dhabi</div>' +
                '<div class="cert-title">Certificate of Completion</div>' +
                '<div class="cert-sub">Professional Development</div>' +
                '<div class="awarded">This certificate is proudly presented to</div>' +
                '<div class="name">' + esc(name) + '</div>' +
                '<div class="name-rule"></div>' +
                '<div class="body-text">for successfully completing the professional development module ' +
                    '<span class="module">' + esc(title) + '</span>, representing ' +
                    '<span class="hours">' + esc(hoursLabel(h)) + '</span> of professional development.</div>' +
                '<div class="pd-hours">\u{1F4DA} Professional Development Hours: ' + esc(numberLabel(h)) + '</div>' +
                '<div class="meta">Completed on ' + esc(date) + '</div>' +
                '<div class="spacer"></div>' +
                '<div class="sigs">' +
                    signatureBlock(DIRECTOR) +
                    signatureBlock(CURRICULUM) +
                '</div>' +
                '<div class="seal"><b>AISA</b><span>Certified</span></div>' +
            '</div></div>' +
            '<script>window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}} ,400);});<\/script>' +
            '</body></html>';
    }

    /* -------- completion celebration modal -------- */

    var modalShown = false;
    var modalStylesInjected = false;

    function injectModalStyles() {
        if (modalStylesInjected) return;
        modalStylesInjected = true;
        var s = document.createElement('style');
        s.id = 'aisa-cert-modal-style';
        s.textContent = [
            '.aisa-cert-modal-overlay{position:fixed;inset:0;z-index:2147483600;',
            'display:flex;align-items:center;justify-content:center;padding:1rem;',
            'background:rgba(15,23,42,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
            'animation:aisa-cert-fade .25s ease-out;}',
            '@keyframes aisa-cert-fade{from{opacity:0}to{opacity:1}}',
            '.aisa-cert-modal-card{position:relative;background:#fff;color:#0f172a;width:100%;',
            'max-width:440px;border-radius:1.25rem;padding:2.25rem 2rem 1.75rem;text-align:center;',
            'box-shadow:0 25px 50px -12px rgba(0,0,0,.45);',
            'animation:aisa-cert-pop .4s cubic-bezier(.22,1,.36,1) both;}',
            '@keyframes aisa-cert-pop{from{opacity:0;transform:translateY(12px) scale(.97)}',
            'to{opacity:1;transform:translateY(0) scale(1)}}',
            '.aisa-cert-modal-emoji{font-size:3.25rem;line-height:1;margin-bottom:.25rem;}',
            '.aisa-cert-modal-badge{display:inline-block;background:#fef3c7;color:#92400e;',
            'font-size:.7rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;',
            'padding:.25rem .7rem;border-radius:9999px;margin-bottom:.75rem;}',
            '.aisa-cert-modal-title{font-size:1.6rem;font-weight:800;margin:.25rem 0 .5rem;letter-spacing:-.01em;}',
            '.aisa-cert-modal-text{color:#475569;font-size:1rem;line-height:1.55;margin:0 0 1.5rem;}',
            '.aisa-cert-modal-text b{color:#0f172a;}',
            '.aisa-cert-modal-actions{display:flex;flex-direction:column;gap:.6rem;}',
            '.aisa-cert-modal-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;',
            'font:inherit;font-weight:800;cursor:pointer;border:1px solid transparent;',
            'padding:.85rem 1.25rem;border-radius:.75rem;transition:all .15s;}',
            '.aisa-cert-modal-btn.primary{background:linear-gradient(135deg,#10b981,#06b6d4);color:#fff;}',
            '.aisa-cert-modal-btn.primary:hover{transform:translateY(-1px);box-shadow:0 12px 24px -8px rgba(6,182,212,.5);}',
            '.aisa-cert-modal-btn.ghost{background:transparent;color:#64748b;font-weight:600;}',
            '.aisa-cert-modal-btn.ghost:hover{color:#0f172a;}',
            '.aisa-cert-modal-close{position:absolute;top:.75rem;right:.75rem;background:transparent;',
            'border:none;cursor:pointer;color:#94a3b8;font-size:1.5rem;line-height:1;width:2rem;height:2rem;',
            'display:flex;align-items:center;justify-content:center;border-radius:.5rem;}',
            '.aisa-cert-modal-close:hover{background:#f1f5f9;color:#0f172a;}'
        ].join('');
        document.head.appendChild(s);
    }

    function showCertificateModal(force) {
        /* Never stack two; and only auto-show once per session unless
         * explicitly forced (e.g. the "Finish training" button). */
        if (document.querySelector('.aisa-cert-modal-overlay')) return;
        if (modalShown && !force) return;
        modalShown = true;
        injectModalStyles();

        var modulesUrl = getModulesUrl();

        var overlay = document.createElement('div');
        overlay.className = 'aisa-cert-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Module complete');
        overlay.innerHTML =
            '<div class="aisa-cert-modal-card">' +
                '<button class="aisa-cert-modal-close" type="button" aria-label="Close">&times;</button>' +
                '<div class="aisa-cert-modal-emoji" aria-hidden="true">\u{1F389}</div>' +
                '<div class="aisa-cert-modal-badge">Module Complete</div>' +
                '<h2 class="aisa-cert-modal-title">Congratulations!</h2>' +
                '<p class="aisa-cert-modal-text">You’ve completed <b>' + esc(getModuleTitle()) + '</b> ' +
                    '(<b>' + esc(hoursLabel(getModuleHours())) + '</b> of PD).<br>' +
                    'Download your certificate, then head back to choose your next module.</p>' +
                '<div class="aisa-cert-modal-actions">' +
                    '<button class="aisa-cert-modal-btn primary" type="button" data-action="download">' +
                        '\u{1F393} Download Certificate</button>' +
                    '<a class="aisa-cert-modal-btn ghost" data-action="back" href="' + esc(modulesUrl) + '">Back to Modules</a>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        function close() {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }
        function goBack() { window.location.href = modulesUrl; }

        overlay.querySelector('.aisa-cert-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();  // click backdrop to dismiss
        });
        overlay.querySelector('[data-action="back"]').addEventListener('click', function (e) {
            e.preventDefault(); goBack();
        });
        overlay.querySelector('[data-action="download"]').addEventListener('click', function () {
            openCertificate();
            /* After the cert opens in its own tab, make returning to the
             * module list the clear, prominent next step. */
            var actions = overlay.querySelector('.aisa-cert-modal-actions');
            var text = overlay.querySelector('.aisa-cert-modal-text');
            if (text) text.innerHTML = 'Your certificate opened in a new tab — use ' +
                '<b>Print → Save as PDF</b> there to keep it.';
            actions.innerHTML =
                '<button class="aisa-cert-modal-btn primary" type="button" data-action="back2">' +
                    '← Back to Modules</button>' +
                '<button class="aisa-cert-modal-btn ghost" type="button" data-action="stay">Stay on this page</button>';
            actions.querySelector('[data-action="back2"]').addEventListener('click', goBack);
            actions.querySelector('[data-action="stay"]').addEventListener('click', close);
        });
    }

    /* Pop the certificate modal the moment a module is genuinely
     * completed in this session — gate.js fires this once, and never
     * on silent rehydration when a returning user reopens a finished
     * module. Deferred slightly so the module's own completion banner
     * and confetti land first, then the modal rises over them. */
    document.addEventListener('aisa:module-completed', function () {
        setTimeout(function () { showCertificateModal(false); }, 350);
    });

    /* Public API:
     *   open(opts)   — open the print certificate directly (opts.title to
     *                  override the module name; used by dashboards).
     *   celebrate()  — force the completion modal (used by "Finish
     *                  training" so it always does something, even on a
     *                  revisit where the backend event won't re-fire). */
    window.AisaCertificate = {
        open:      openCertificate,
        celebrate: function () { showCertificateModal(true); }
    };

    /* Wait for auth, then wire up the banner button once the DOM is ready. */
    if (typeof window.aisaReady === 'function') {
        window.aisaReady(function () {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
        });
    } else {
        console.warn('AISA: certificate.js loaded without gate.js — skipping');
    }
})();
