/*
 * AISA Learning Hub — completion certificate.
 *
 * Auto-loaded by auth/gate.js once the user is signed in. On any page
 * that has a #completion-banner, it injects a "Download Certificate"
 * button. When the module is finished (the banner is revealed) the
 * button is right there; clicking it generates a real PDF in the
 * browser, downloads it to the user's Downloads folder, and emails a
 * copy to the teacher's @aisa.sch.ae address.
 *
 * Pipeline:
 *   1. Lazy-load jsPDF + html2canvas from cdnjs on first click.
 *   2. Render the certificate in an off-screen iframe so its fonts
 *      and CSS stay isolated from the host page.
 *   3. html2canvas captures the .sheet at 2× scale.
 *   4. jsPDF embeds the canvas as a JPEG into an A4 landscape page
 *      and triggers a Blob download (no pop-up, no print dialog —
 *      shows up directly in Chrome's downloads bar).
 *   5. The same base64 PDF is POSTed to the backend, which emails
 *      it as an attachment via aisaAuth.emailCertificate(). The
 *      server dedups so repeated clicks don't spam the user.
 *
 * The certificate template (name, module title, date, signatures,
 * decorative frame + seal) is the same as before — only the
 * delivery mechanism changed.
 */
(function () {
    'use strict';

    var DIRECTOR   = { name: 'Dr. Andrew Torris', title: 'Director' };
    var CURRICULUM = { name: 'Amira El Turabi',  title: 'Head of Curriculum, Teaching and Learning' };

    /* CDN libraries for client-side PDF generation. Pinned to specific
     * versions so the certificate output is reproducible. */
    var JSPDF_URL       = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    var HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

    var injected      = false;
    var libsPromise   = null;

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
        wrap.style.cssText = 'margin-top:1.25rem;display:flex;flex-direction:column;align-items:center;gap:.5rem;';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aisa-cert-btn';
        btn.innerHTML =
            '<span aria-hidden="true" style="font-size:1.15em;line-height:1">\u{1F393}</span>' +
            '<span class="label">Download Your Certificate</span>';
        btn.style.cssText = [
            'display:inline-flex;align-items:center;gap:.6rem;cursor:pointer;',
            'font-family:inherit;font-size:1rem;font-weight:800;color:#0f172a;',
            'background:#ffffff;border:none;padding:.85rem 1.6rem;border-radius:9999px;',
            'box-shadow:0 10px 25px -8px rgba(0,0,0,.35);transition:transform .15s,box-shadow .15s;'
        ].join('');
        btn.addEventListener('mouseenter', function () {
            if (btn.disabled) return;
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 14px 30px -8px rgba(0,0,0,.45)';
        });
        btn.addEventListener('mouseleave', function () {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 10px 25px -8px rgba(0,0,0,.35)';
        });

        var status = document.createElement('div');
        status.className = 'aisa-cert-btn-status';
        status.style.cssText = 'font-size:.8rem;font-weight:600;color:#fff;opacity:.85;min-height:1em;text-align:center;';

        btn.addEventListener('click', function () {
            openCertificate({ button: btn, status: status });
        });

        wrap.appendChild(btn);
        wrap.appendChild(status);
        banner.appendChild(wrap);
    }

    /* -------- data helpers -------- */

    function getUser() {
        try {
            return window.aisaAuth && window.aisaAuth.getUser ? window.aisaAuth.getUser() : null;
        } catch (e) { return null; }
    }

    function getUserName() {
        var u = getUser();
        if (u && u.name && u.name.trim()) return u.name.trim();
        if (u && u.email) return titleCaseFromEmail(u.email);
        return 'AISA Educator';
    }

    function getUserEmail() {
        var u = getUser();
        return (u && u.email) ? u.email : '';
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
        return t.replace(/^\s*AISA\s*[|\-–—:]\s*/i, '').trim() || 'Professional Development Module';
    }

    function getModuleId() {
        var banner = document.getElementById('completion-banner');
        if (banner && banner.dataset && banner.dataset.moduleId) return banner.dataset.moduleId;
        if (window.AISA_MODULE_ID) return window.AISA_MODULE_ID;
        return '';
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

    function safeFilenamePart(s) {
        return String(s || '')
            .replace(/[\\/:*?"<>|]+/g, '')   // strip filesystem-unsafe chars
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);
    }

    /* -------- CDN library loading -------- */

    function loadScript(src) {
        return new Promise(function (resolve, reject) {
            var existing = document.querySelector('script[data-aisa-cert-lib="' + src + '"]');
            if (existing) {
                if (existing.dataset.loaded === '1') resolve();
                else { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); }
                return;
            }
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.setAttribute('data-aisa-cert-lib', src);
            s.addEventListener('load', function () { s.dataset.loaded = '1'; resolve(); });
            s.addEventListener('error', function () { reject(new Error('Could not load ' + src)); });
            document.head.appendChild(s);
        });
    }

    function loadLibs() {
        if (libsPromise) return libsPromise;
        libsPromise = Promise.all([
            loadScript(JSPDF_URL),
            loadScript(HTML2CANVAS_URL)
        ]).catch(function (err) {
            libsPromise = null;  // allow retry on transient CDN failure
            throw err;
        });
        return libsPromise;
    }

    /* -------- certificate template (capture-friendly) -------- */

    /* Build a complete HTML document containing just the certificate
     * sheet, no toolbar, no auto-print. Loaded into the off-screen
     * iframe used for html2canvas capture. */
    function buildCaptureHtml(name, title, date, logo) {
        var logoTag = logo
            ? '<img src="' + esc(logo) + '" alt="AISA" class="logo" crossorigin="anonymous" />'
            : '<div class="logo-fallback">AISA</div>';

        return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
            '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
            '<link rel="preconnect" href="https://fonts.googleapis.com">' +
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
            '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Great+Vibes&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
            '<style>' +
            '*{box-sizing:border-box;}' +
            'html,body{margin:0;padding:0;background:transparent;}' +
            'body{font-family:"Inter",system-ui,sans-serif;}' +
            '.sheet{position:relative;width:1122px;height:794px;' +
                'background:#fffdf8;padding:54px 64px;overflow:hidden;}' +
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
            '.meta{margin-top:14px;font-size:14px;color:#64748b;}' +
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
                'border:3px solid #fffdf8;}' +
            '.seal b{font-size:13px;letter-spacing:.14em;}' +
            '.seal span{font-size:9px;letter-spacing:.18em;text-transform:uppercase;margin-top:2px;}' +
            '</style></head><body>' +
            '<div class="sheet"><div class="frame"></div><div class="inner">' +
                logoTag +
                '<div class="org">American International School in Abu Dhabi</div>' +
                '<div class="cert-title">Certificate of Completion</div>' +
                '<div class="cert-sub">Professional Development</div>' +
                '<div class="awarded">This certificate is proudly presented to</div>' +
                '<div class="name">' + esc(name) + '</div>' +
                '<div class="name-rule"></div>' +
                '<div class="body-text">for successfully completing the professional development module ' +
                    '<span class="module">' + esc(title) + '</span>.</div>' +
                '<div class="meta">Completed on ' + esc(date) + '</div>' +
                '<div class="spacer"></div>' +
                '<div class="sigs">' +
                    signatureBlock(DIRECTOR) +
                    signatureBlock(CURRICULUM) +
                '</div>' +
                '<div class="seal"><b>AISA</b><span>Certified</span></div>' +
            '</div></div>' +
            '</body></html>';
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

    /* -------- PDF generation -------- */

    /* Render the certificate inside an off-screen iframe at its natural
     * pixel size, wait for fonts + the logo to load, then html2canvas
     * the sheet and embed it in an A4-landscape jsPDF. Returns the
     * jsPDF instance so the caller can `.save()` it and grab base64. */
    function generateCertPdf(name, title, date, logo) {
        var iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.setAttribute('tabindex', '-1');
        iframe.style.cssText = [
            'position:fixed;left:-100000px;top:0;',
            'width:1122px;height:794px;',
            'border:0;opacity:0;pointer-events:none;'
        ].join('');
        document.body.appendChild(iframe);

        var doc = iframe.contentDocument;
        doc.open();
        doc.write(buildCaptureHtml(name, title, date, logo));
        doc.close();

        function waitForAssets() {
            return new Promise(function (resolve) {
                var fontsReady = (doc.fonts && doc.fonts.ready) || Promise.resolve();
                var logoImg = doc.querySelector('img.logo');
                var imgReady = (!logoImg || logoImg.complete)
                    ? Promise.resolve()
                    : new Promise(function (r) {
                        logoImg.onload = r;
                        logoImg.onerror = r;
                    });
                Promise.all([fontsReady, imgReady]).then(function () {
                    /* Settle one paint frame so layout is stable. */
                    requestAnimationFrame(function () { setTimeout(resolve, 60); });
                });
            });
        }

        return waitForAssets().then(function () {
            var sheet = doc.querySelector('.sheet');
            return window.html2canvas(sheet, {
                scale: 2,
                backgroundColor: '#fffdf8',
                useCORS: true,
                logging: false,
                windowWidth:  1122,
                windowHeight: 794
            });
        }).then(function (canvas) {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            var jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
            if (!jsPDFCtor) throw new Error('jsPDF not available');
            var pdf = new jsPDFCtor({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
            var imgData = canvas.toDataURL('image/jpeg', 0.92);
            pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
            return pdf;
        }).catch(function (err) {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            throw err;
        });
    }

    /* -------- public open() flow -------- */

    /* opts:
     *   name, title, moduleId  — overrides for cert content
     *   button, status         — DOM elements to reflect progress in
     *                            (used by the inline banner button)
     *   onStatus(state, msg)   — optional callback for the completion
     *                            modal so it can update its own copy
     */
    function openCertificate(opts) {
        opts = (opts && typeof opts === 'object' && opts.nodeType === undefined) ? opts : {};
        var name     = opts.name     || getUserName();
        var title    = opts.title    || getModuleTitle();
        var moduleId = opts.moduleId || getModuleId();
        var date     = todayString();
        var filename = 'AISA Certificate - ' + safeFilenamePart(title) + ' - ' + safeFilenamePart(name) + '.pdf';

        var button     = opts.button || null;
        var statusEl   = opts.status || null;
        var onStatus   = typeof opts.onStatus === 'function' ? opts.onStatus : null;

        function setStatus(state, msg) {
            if (statusEl) statusEl.textContent = msg || '';
            if (button) {
                var label = button.querySelector('.label');
                if (state === 'preparing') {
                    button.disabled = true;
                    button.style.opacity = '.85';
                    if (label) label.textContent = 'Preparing your certificate…';
                } else if (state === 'done' || state === 'emailed' || state === 'downloaded-only') {
                    button.disabled = false;
                    button.style.opacity = '1';
                    if (label) label.textContent = 'Download Again';
                } else if (state === 'error') {
                    button.disabled = false;
                    button.style.opacity = '1';
                    if (label) label.textContent = 'Try Again';
                }
            }
            if (onStatus) onStatus(state, msg);
        }

        setStatus('preparing', 'Generating your certificate…');

        loadLibs()
            .then(function () { return generateCertPdf(name, title, date, getLogoUrl()); })
            .then(function (pdf) {
                /* 1) Real download — fires the Chrome download bar. */
                pdf.save(filename);

                /* 2) Email a copy via the backend. Fire-and-forget so
                 *    a network blip doesn't undo the local download. */
                var base64 = '';
                try {
                    var dataUri = pdf.output('datauristring');
                    base64 = dataUri.split(',')[1] || '';
                } catch (e) {}

                if (!base64 || !window.aisaAuth || typeof window.aisaAuth.emailCertificate !== 'function') {
                    setStatus('downloaded-only', 'Saved to your downloads.');
                    return;
                }

                setStatus('preparing', 'Emailing you a copy…');
                return window.aisaAuth.emailCertificate({
                    module_id:    moduleId || '',
                    module_title: title,
                    filename:     filename,
                    pdf_base64:   base64
                }).then(function (r) {
                    var email = getUserEmail();
                    if (r && r.already_sent) {
                        setStatus('emailed', email
                            ? 'Saved. A copy was already emailed to ' + email + '.'
                            : 'Saved. A copy was already emailed to you.');
                    } else {
                        setStatus('emailed', email
                            ? 'Saved. Also emailed to ' + email + '.'
                            : 'Saved. Also emailed to you.');
                    }
                }).catch(function (err) {
                    console.warn('AISA: certificate email failed', err);
                    setStatus('downloaded-only', 'Saved to your downloads (email failed — try again).');
                });
            })
            .catch(function (err) {
                console.warn('AISA: certificate generation failed', err);
                setStatus('error', 'Could not generate the certificate. Please try again.');
            });
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
            '.aisa-cert-modal-btn.primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 12px 24px -8px rgba(6,182,212,.5);}',
            '.aisa-cert-modal-btn.primary:disabled{opacity:.75;cursor:default;}',
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
                '<p class="aisa-cert-modal-text">You’ve completed <b>' + esc(getModuleTitle()) + '</b>.<br>' +
                    'Download your certificate — we’ll also email you a copy.</p>' +
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

        var textEl    = overlay.querySelector('.aisa-cert-modal-text');
        var actionsEl = overlay.querySelector('.aisa-cert-modal-actions');
        var btn       = overlay.querySelector('[data-action="download"]');

        overlay.querySelector('.aisa-cert-modal-close').addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();  // click backdrop to dismiss
        });
        overlay.querySelector('[data-action="back"]').addEventListener('click', function (e) {
            e.preventDefault(); goBack();
        });

        btn.addEventListener('click', function () {
            openCertificate({
                button: null,
                status: null,
                onStatus: function (state, msg) {
                    if (state === 'preparing') {
                        btn.disabled = true;
                        btn.innerHTML = '<span aria-hidden="true">\u{231B}</span> ' + esc(msg || 'Preparing…');
                    } else if (state === 'emailed' || state === 'downloaded-only') {
                        btn.disabled = false;
                        btn.innerHTML = '\u{1F393} Download Again';
                        if (textEl) textEl.textContent = msg || 'Saved to your downloads.';
                        /* Pivot CTAs once the certificate is in hand. */
                        var backBtn = document.createElement('button');
                        backBtn.type = 'button';
                        backBtn.className = 'aisa-cert-modal-btn ghost';
                        backBtn.textContent = '← Back to Modules';
                        backBtn.addEventListener('click', goBack);
                        actionsEl.appendChild(backBtn);
                    } else if (state === 'error') {
                        btn.disabled = false;
                        btn.innerHTML = '\u{1F504} Try Again';
                        if (textEl) textEl.textContent = msg || 'Something went wrong. Please try again.';
                    }
                }
            });
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
     *   open(opts)   — generate + download the certificate (opts.title
     *                  to override the module name; used by dashboards).
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
