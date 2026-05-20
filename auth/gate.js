/*
 * AISA Learning Hub — Google sign-in gate.
 *
 * Client-side only. This is a speed bump, not a security boundary:
 * any determined visitor with devtools can bypass it. Use Cloudflare
 * Access or a real backend if the content needs true protection.
 */
(function () {
    'use strict';

    var CLIENT_ID = '719019551782-h9pdg57s6oq4jpo884a53o0d1pgel1u6.apps.googleusercontent.com';
    var ALLOWED_DOMAIN = 'aisa.sch.ae';
    var STORAGE_KEY = 'aisa_auth_v1';
    var SESSION_HOURS = 8;

    // Compute the site root from this script's own URL, so the gate can
    // reference logos no matter how deep the current page is.
    function computeSiteRoot() {
        var thisScript = document.currentScript ||
            (function () {
                var scripts = document.getElementsByTagName('script');
                for (var i = scripts.length - 1; i >= 0; i--) {
                    if (scripts[i].src && /auth\/gate\.js/.test(scripts[i].src)) return scripts[i];
                }
                return null;
            })();
        if (!thisScript || !thisScript.src) return '';
        return thisScript.src.replace(/\/auth\/gate\.js.*$/, '/');
    }
    var SITE_ROOT = computeSiteRoot();

    var LOGOS = {
        aisa:     SITE_ROOT + 'AISA_logo.png',
        lion:     SITE_ROOT + 'Media%20Hub/the_digital_lion_logo.png',
        wired:    SITE_ROOT + 'wired-wednesdays-logo.png',
        notebook: SITE_ROOT + 'notebookLM_logo.svg'
    };

    function readSession() {
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var s = JSON.parse(raw);
            if (!s || !s.email || !s.expiresAt) return null;
            if (Date.now() > s.expiresAt) {
                sessionStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return s;
        } catch (e) {
            return null;
        }
    }

    function writeSession(payload) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            email: payload.email,
            name: payload.name || '',
            picture: payload.picture || '',
            domain: payload.hd || '',
            expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000
        }));
    }

    function decodeJwt(token) {
        var parts = token.split('.');
        if (parts.length !== 3) throw new Error('Malformed JWT');
        var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        var pad = b64.length % 4;
        if (pad) b64 += new Array(5 - pad).join('=');
        var json = decodeURIComponent(
            atob(b64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join('')
        );
        return JSON.parse(json);
    }

    var existing = readSession();
    if (existing) {
        window.aisaAuth = buildPublicApi();
        return;
    }

    // Hide body content immediately to avoid flash-of-content
    // while the rest of the gate boots up.
    var preLockStyle = document.createElement('style');
    preLockStyle.id = 'aisa-prelock';
    preLockStyle.textContent =
        'body{visibility:hidden!important}' +
        '#aisa-auth-gate,#aisa-auth-gate *{visibility:visible!important}';
    (document.head || document.documentElement).appendChild(preLockStyle);

    // Pre-load the fonts used by the rest of the site so the gate
    // matches even on pages that don't import them.
    if (!document.querySelector('link[data-aisa-fonts]')) {
        var preconn1 = document.createElement('link');
        preconn1.rel = 'preconnect';
        preconn1.href = 'https://fonts.googleapis.com';
        preconn1.setAttribute('data-aisa-fonts', '1');
        document.head.appendChild(preconn1);

        var preconn2 = document.createElement('link');
        preconn2.rel = 'preconnect';
        preconn2.href = 'https://fonts.gstatic.com';
        preconn2.crossOrigin = '';
        preconn2.setAttribute('data-aisa-fonts', '1');
        document.head.appendChild(preconn2);

        var fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Poppins:wght@600;700;800;900&display=swap';
        fontLink.setAttribute('data-aisa-fonts', '1');
        document.head.appendChild(fontLink);
    }

    function buildGate() {
        var style = document.createElement('style');
        style.id = 'aisa-gate-style';
        style.textContent = [
            /* ---------- backdrop ---------- */
            '#aisa-auth-gate{position:fixed;inset:0;z-index:2147483647;',
            'background-color:#0b1533;',
            'background-image:radial-gradient(ellipse at top left,rgba(59,130,246,.28),transparent 55%),',
            'radial-gradient(ellipse at bottom right,rgba(139,92,246,.25),transparent 55%),',
            'radial-gradient(ellipse at center,rgba(14,165,233,.14),transparent 60%);',
            'display:flex;align-items:center;justify-content:center;',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
            'color:#f8fafc;padding:1.5rem;overflow:hidden;',
            'animation:aisa-fade .6s ease-out both;}',

            /* animated blob orbs */
            '#aisa-auth-gate .aisa-orbs{position:absolute;inset:0;overflow:hidden;pointer-events:none;}',
            '#aisa-auth-gate .aisa-orb{position:absolute;border-radius:50%;filter:blur(80px);opacity:.55;',
            'animation:aisa-blob 14s ease-in-out infinite;}',
            '#aisa-auth-gate .aisa-orb-1{top:-120px;left:-100px;width:460px;height:460px;background:#3b82f6;}',
            '#aisa-auth-gate .aisa-orb-2{top:30%;right:-130px;width:500px;height:500px;background:#8b5cf6;animation-delay:3s;}',
            '#aisa-auth-gate .aisa-orb-3{bottom:-160px;left:25%;width:420px;height:420px;background:#06b6d4;animation-delay:6s;opacity:.45;}',

            /* card */
            '#aisa-auth-gate .aisa-card{position:relative;z-index:1;max-width:560px;width:100%;',
            'background:rgba(15,23,42,.55);backdrop-filter:blur(24px) saturate(150%);',
            '-webkit-backdrop-filter:blur(24px) saturate(150%);',
            'border:1px solid rgba(255,255,255,.12);border-radius:1.75rem;',
            'box-shadow:0 30px 60px -15px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04) inset;',
            'padding:2.5rem 2rem 2rem;text-align:center;',
            'animation:aisa-card-in .7s cubic-bezier(.22,1,.36,1) both;}',

            /* badge */
            '#aisa-auth-gate .aisa-badge{display:inline-flex;align-items:center;gap:.4rem;',
            'background:rgba(59,130,246,.18);border:1px solid rgba(96,165,250,.35);',
            'color:#bfdbfe;font-size:.7rem;font-weight:700;letter-spacing:.12em;',
            'text-transform:uppercase;padding:.35rem .8rem;border-radius:9999px;margin-bottom:1.25rem;}',
            '#aisa-auth-gate .aisa-badge .dot{width:6px;height:6px;border-radius:50%;background:#34d399;',
            'box-shadow:0 0 0 0 rgba(52,211,153,.7);animation:aisa-pulse 2s ease-out infinite;}',

            /* AISA hero logo */
            '#aisa-auth-gate .aisa-logo-wrap{position:relative;display:inline-block;margin-bottom:1rem;}',
            '#aisa-auth-gate .aisa-logo-wrap::before{content:"";position:absolute;inset:-12px;',
            'background:radial-gradient(circle,rgba(96,165,250,.5),transparent 70%);filter:blur(20px);z-index:-1;}',
            '#aisa-auth-gate .aisa-logo{width:88px;height:88px;border-radius:22px;',
            'background:#ffffff;padding:10px;object-fit:contain;',
            'box-shadow:0 12px 30px -10px rgba(59,130,246,.6),0 0 0 1px rgba(255,255,255,.2);',
            'animation:aisa-logo-float 5s ease-in-out infinite;}',

            /* headline */
            '#aisa-auth-gate h1{margin:0 0 .5rem;font-family:Poppins,Inter,system-ui,sans-serif;',
            'font-size:2rem;font-weight:800;letter-spacing:-.02em;color:#ffffff;line-height:1.1;}',
            '#aisa-auth-gate .aisa-tagline{margin:0 0 1.5rem;color:#cbd5e1;font-size:.95rem;line-height:1.5;}',
            '#aisa-auth-gate .aisa-tagline .aisa-domain{display:inline-block;background:rgba(255,255,255,.08);',
            'color:#e0f2fe;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85rem;',
            'padding:2px 8px;border-radius:6px;border:1px solid rgba(255,255,255,.12);}',

            /* preview strip */
            '#aisa-auth-gate .aisa-preview-label{font-size:.65rem;font-weight:700;letter-spacing:.2em;',
            'text-transform:uppercase;color:#94a3b8;margin:0 0 .85rem;}',
            '#aisa-auth-gate .aisa-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem;',
            'margin-bottom:1.75rem;}',
            '#aisa-auth-gate .aisa-chip{display:inline-flex;align-items:center;gap:.45rem;',
            'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);',
            'color:#e2e8f0;font-size:.78rem;font-weight:600;padding:.4rem .75rem;border-radius:9999px;',
            'transition:transform .2s ease,background-color .2s ease,border-color .2s ease;',
            'animation:aisa-chip-in .6s cubic-bezier(.22,1,.36,1) both;}',
            '#aisa-auth-gate .aisa-chip:hover{background:rgba(255,255,255,.13);',
            'border-color:rgba(255,255,255,.25);transform:translateY(-2px);}',
            '#aisa-auth-gate .aisa-chip img{width:18px;height:18px;border-radius:5px;object-fit:cover;',
            'background:#fff;}',
            '#aisa-auth-gate .aisa-chip .aisa-chip-emoji{font-size:1rem;line-height:1;}',
            '#aisa-auth-gate .aisa-chip:nth-child(1){animation-delay:.15s}',
            '#aisa-auth-gate .aisa-chip:nth-child(2){animation-delay:.22s}',
            '#aisa-auth-gate .aisa-chip:nth-child(3){animation-delay:.29s}',
            '#aisa-auth-gate .aisa-chip:nth-child(4){animation-delay:.36s}',
            '#aisa-auth-gate .aisa-chip:nth-child(5){animation-delay:.43s}',
            '#aisa-auth-gate .aisa-chip:nth-child(6){animation-delay:.50s}',

            /* sign-in section */
            '#aisa-auth-gate .aisa-signin{padding-top:1.25rem;border-top:1px solid rgba(255,255,255,.08);}',
            '#aisa-auth-gate .aisa-signin-prompt{margin:0 0 .9rem;font-size:.9rem;color:#e2e8f0;}',
            '#aisa-auth-gate .aisa-btn-wrap{display:flex;justify-content:center;min-height:44px;}',
            '#aisa-auth-gate .aisa-error{margin-top:1rem;padding:.75rem 1rem;border-radius:.65rem;',
            'background:rgba(239,68,68,.12);color:#fecaca;font-size:.85rem;',
            'border:1px solid rgba(248,113,113,.3);display:none;text-align:left;}',
            '#aisa-auth-gate .aisa-error.show{display:block;animation:aisa-shake .35s ease-out;}',
            '#aisa-auth-gate .aisa-foot{margin-top:1.5rem;font-size:.72rem;color:#94a3b8;',
            'letter-spacing:.08em;text-transform:uppercase;}',

            /* spinner */
            '#aisa-auth-gate .aisa-spinner{display:inline-block;width:20px;height:20px;',
            'border:2px solid rgba(203,213,225,.3);border-top-color:#cbd5e1;border-radius:50%;',
            'animation:aisa-spin .8s linear infinite;}',

            /* keyframes */
            '@keyframes aisa-fade{from{opacity:0}to{opacity:1}}',
            '@keyframes aisa-card-in{from{opacity:0;transform:translateY(20px) scale(.97)}',
            'to{opacity:1;transform:translateY(0) scale(1)}}',
            '@keyframes aisa-chip-in{from{opacity:0;transform:translateY(8px)}',
            'to{opacity:1;transform:translateY(0)}}',
            '@keyframes aisa-logo-float{0%,100%{transform:translateY(0) rotate(-1deg)}',
            '50%{transform:translateY(-5px) rotate(1deg)}}',
            '@keyframes aisa-pulse{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}',
            '70%{box-shadow:0 0 0 10px rgba(52,211,153,0)}',
            '100%{box-shadow:0 0 0 0 rgba(52,211,153,0)}}',
            '@keyframes aisa-blob{0%,100%{transform:translate(0,0) scale(1)}',
            '33%{transform:translate(30px,-40px) scale(1.08)}',
            '66%{transform:translate(-20px,20px) scale(.95)}}',
            '@keyframes aisa-spin{to{transform:rotate(360deg)}}',
            '@keyframes aisa-shake{0%,100%{transform:translateX(0)}',
            '25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}',

            /* small screens */
            '@media (max-width:480px){',
            '#aisa-auth-gate{padding:.75rem;}',
            '#aisa-auth-gate .aisa-card{padding:1.75rem 1.25rem 1.5rem;border-radius:1.25rem;}',
            '#aisa-auth-gate h1{font-size:1.5rem;}',
            '#aisa-auth-gate .aisa-logo{width:72px;height:72px;}',
            '}',

            '@media (prefers-reduced-motion:reduce){',
            '#aisa-auth-gate,#aisa-auth-gate *{animation:none!important;}',
            '}'
        ].join('');
        document.head.appendChild(style);

        var gate = document.createElement('div');
        gate.id = 'aisa-auth-gate';
        gate.setAttribute('role', 'dialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-label', 'Sign in required');
        gate.innerHTML =
            '<div class="aisa-orbs" aria-hidden="true">' +
                '<div class="aisa-orb aisa-orb-1"></div>' +
                '<div class="aisa-orb aisa-orb-2"></div>' +
                '<div class="aisa-orb aisa-orb-3"></div>' +
            '</div>' +
            '<div class="aisa-card">' +
                '<div class="aisa-badge"><span class="dot"></span>AISA Staff Portal</div>' +
                '<div class="aisa-logo-wrap">' +
                    '<img class="aisa-logo" src="' + LOGOS.aisa + '" alt="AISA logo" ' +
                        'onerror="this.style.display=\'none\'">' +
                '</div>' +
                '<h1>The Learning Hub</h1>' +
                '<p class="aisa-tagline">A space for AISA teachers, by AISA teachers. ' +
                    'Sign in with your <span class="aisa-domain">@' + ALLOWED_DOMAIN + '</span> account to step inside.</p>' +
                '<p class="aisa-preview-label">A peek at what\'s inside</p>' +
                '<div class="aisa-chips">' +
                    chip('img', LOGOS.lion,     'The Digital Lion') +
                    chip('img', LOGOS.wired,    'Wired Wednesdays') +
                    chip('img', LOGOS.notebook, 'NotebookLM') +
                    chip('emoji', '🎓', 'PD Modules') +
                    chip('emoji', '📚', 'Library Hub') +
                    chip('emoji', '🌍', 'Orientation') +
                '</div>' +
                '<div class="aisa-signin">' +
                    '<p class="aisa-signin-prompt">Continue with your AISA Google account</p>' +
                    '<div class="aisa-btn-wrap" id="aisa-gsi-button">' +
                        '<span class="aisa-spinner" aria-label="Loading sign-in"></span>' +
                    '</div>' +
                    '<div class="aisa-error" id="aisa-error" role="alert"></div>' +
                '</div>' +
                '<div class="aisa-foot">AISA staff &amp; faculty access only</div>' +
            '</div>';
        document.body.appendChild(gate);
    }

    function chip(kind, srcOrEmoji, label) {
        if (kind === 'img') {
            return '<span class="aisa-chip">' +
                '<img src="' + srcOrEmoji + '" alt="" onerror="this.style.display=\'none\'">' +
                escapeHtml(label) + '</span>';
        }
        return '<span class="aisa-chip">' +
            '<span class="aisa-chip-emoji" aria-hidden="true">' + srcOrEmoji + '</span>' +
            escapeHtml(label) + '</span>';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
        });
    }

    function showError(msg) {
        var err = document.getElementById('aisa-error');
        if (!err) return;
        err.textContent = msg;
        err.classList.remove('show');
        /* re-trigger animation */
        void err.offsetWidth;
        err.classList.add('show');
    }

    function unlock() {
        var gate = document.getElementById('aisa-auth-gate');
        if (gate) gate.remove();
        var lock = document.getElementById('aisa-prelock');
        if (lock) lock.remove();
        var style = document.getElementById('aisa-gate-style');
        if (style) style.remove();
    }

    function handleCredential(response) {
        try {
            var payload = decodeJwt(response.credential);
            if (!payload.email_verified) {
                showError('Your Google account email is not verified.');
                return;
            }
            if (payload.hd !== ALLOWED_DOMAIN) {
                showError('Please sign in with your @' + ALLOWED_DOMAIN + ' account, not a personal Google account.');
                try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
                return;
            }
            writeSession(payload);
            window.aisaAuth = buildPublicApi();
            unlock();
        } catch (e) {
            showError('Sign-in failed. Please try again.');
        }
    }

    function renderGsiButton() {
        var slot = document.getElementById('aisa-gsi-button');
        if (slot) slot.innerHTML = '';
        try {
            window.google.accounts.id.initialize({
                client_id: CLIENT_ID,
                callback: handleCredential,
                hd: ALLOWED_DOMAIN,
                ux_mode: 'popup',
                auto_select: false,
                cancel_on_tap_outside: false
            });
            window.google.accounts.id.renderButton(slot, {
                theme: 'filled_blue',
                size: 'large',
                text: 'signin_with',
                shape: 'pill',
                width: 280
            });
        } catch (e) {
            showError('Could not load Google sign-in. Check your connection and reload.');
        }
    }

    function waitForGsiAndRender(attempts) {
        attempts = attempts || 0;
        if (window.google && window.google.accounts && window.google.accounts.id) {
            renderGsiButton();
            return;
        }
        if (attempts > 80) {
            showError('Google sign-in did not load. Please reload the page.');
            return;
        }
        setTimeout(function () { waitForGsiAndRender(attempts + 1); }, 100);
    }

    function loadGsi() {
        if (document.querySelector('script[data-aisa-gsi]')) {
            waitForGsiAndRender();
            return;
        }
        var script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.setAttribute('data-aisa-gsi', '1');
        script.onload = waitForGsiAndRender;
        script.onerror = function () {
            showError('Could not reach Google sign-in. Are you offline?');
        };
        document.head.appendChild(script);
    }

    function buildPublicApi() {
        return {
            signOut: function () {
                try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
                try {
                    if (window.google && window.google.accounts && window.google.accounts.id) {
                        window.google.accounts.id.disableAutoSelect();
                    }
                } catch (e) {}
                location.reload();
            },
            getUser: function () {
                return readSession();
            }
        };
    }

    function start() {
        buildGate();
        loadGsi();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
