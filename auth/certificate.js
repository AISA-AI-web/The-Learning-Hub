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
        btn.addEventListener('click', openCertificate);

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

    function openCertificate() {
        var html = buildCertHtml(getUserName(), getModuleTitle(), todayString(), getLogoUrl());
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

    function buildCertHtml(name, title, date, logo) {
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
                    '<span class="module">' + esc(title) + '</span>.</div>' +
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

    /* Wait for auth, then wire up once the DOM is ready. */
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
