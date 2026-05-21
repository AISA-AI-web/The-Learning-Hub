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

    var preLockStyle = document.createElement('style');
    preLockStyle.id = 'aisa-prelock';
    preLockStyle.textContent =
        'body{visibility:hidden!important}' +
        '#aisa-auth-gate,#aisa-auth-gate *{visibility:visible!important}';
    (document.head || document.documentElement).appendChild(preLockStyle);

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
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
        fontLink.setAttribute('data-aisa-fonts', '1');
        document.head.appendChild(fontLink);
    }

    function buildGate() {
        var style = document.createElement('style');
        style.id = 'aisa-gate-style';
        style.textContent = [
            '#aisa-auth-gate{position:fixed;inset:0;z-index:2147483647;',
            'background:#ffffff;color:#0f172a;',
            'font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
            '-webkit-font-smoothing:antialiased;',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;',
            'padding:2.5rem 1.5rem;overflow:auto;}',

            '#aisa-auth-gate .aisa-shell{width:100%;max-width:520px;display:flex;',
            'flex-direction:column;align-items:center;text-align:center;}',

            '#aisa-auth-gate .aisa-logo{width:96px;height:96px;object-fit:contain;',
            'margin-bottom:2rem;}',

            '#aisa-auth-gate h1{margin:0 0 .75rem;font-size:2.25rem;font-weight:700;',
            'letter-spacing:-.02em;color:#0f172a;line-height:1.15;}',
            '#aisa-auth-gate .aisa-sub{margin:0 0 2.5rem;color:#475569;font-size:1.0625rem;',
            'line-height:1.55;max-width:440px;}',

            '#aisa-auth-gate .aisa-btn-wrap{display:flex;justify-content:center;',
            'min-height:48px;width:100%;}',
            /* Scale up the Google button itself — GIS caps width at 400px,
             * so we use CSS transform to enlarge it without going outside spec. */
            '#aisa-auth-gate .aisa-btn-wrap > div{transform:scale(1.15);',
            'transform-origin:center;}',

            '#aisa-auth-gate .aisa-error{margin-top:1.25rem;font-size:.9375rem;color:#b91c1c;',
            'line-height:1.45;display:none;max-width:400px;}',
            '#aisa-auth-gate .aisa-error.show{display:block;}',

            '#aisa-auth-gate .aisa-divider{width:100%;max-width:320px;height:1px;',
            'background:#e2e8f0;margin:3rem 0 1.75rem;}',

            '#aisa-auth-gate .aisa-strip-label{font-size:.75rem;font-weight:600;',
            'letter-spacing:.14em;text-transform:uppercase;color:#94a3b8;',
            'margin:0 0 1.25rem;}',
            '#aisa-auth-gate .aisa-strip{display:flex;align-items:center;justify-content:center;',
            'gap:2.25rem;flex-wrap:wrap;}',
            '#aisa-auth-gate .aisa-strip img{height:32px;width:auto;max-width:110px;',
            'object-fit:contain;opacity:.55;filter:grayscale(100%);',
            'transition:opacity .2s ease,filter .2s ease;}',
            '#aisa-auth-gate .aisa-strip img:hover{opacity:1;filter:grayscale(0);}',

            '#aisa-auth-gate .aisa-foot{margin-top:2.75rem;font-size:.8125rem;color:#94a3b8;}',

            '#aisa-auth-gate .aisa-spinner{display:inline-block;width:22px;height:22px;',
            'border:2px solid #e2e8f0;border-top-color:#64748b;border-radius:50%;',
            'animation:aisa-spin .8s linear infinite;}',
            '@keyframes aisa-spin{to{transform:rotate(360deg)}}',

            '@media (max-width:480px){',
            '#aisa-auth-gate{padding:2rem 1.25rem;}',
            '#aisa-auth-gate .aisa-logo{width:80px;height:80px;margin-bottom:1.5rem;}',
            '#aisa-auth-gate h1{font-size:1.75rem;}',
            '#aisa-auth-gate .aisa-sub{font-size:1rem;margin-bottom:2rem;}',
            '#aisa-auth-gate .aisa-btn-wrap > div{transform:scale(1);}',
            '#aisa-auth-gate .aisa-strip{gap:1.5rem;}',
            '#aisa-auth-gate .aisa-strip img{height:26px;}',
            '}'
        ].join('');
        document.head.appendChild(style);

        var gate = document.createElement('div');
        gate.id = 'aisa-auth-gate';
        gate.setAttribute('role', 'dialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-label', 'Sign in required');
        gate.innerHTML =
            '<div class="aisa-shell">' +
                '<img class="aisa-logo" src="' + LOGOS.aisa + '" alt="AISA" ' +
                    'onerror="this.style.display=\'none\'">' +
                '<h1>Sign in to the Learning Hub</h1>' +
                '<p class="aisa-sub">Use your AISA Google account ' +
                    '(<strong style="color:#0f172a;font-weight:600">@' + ALLOWED_DOMAIN + '</strong>) to continue.</p>' +
                '<div class="aisa-btn-wrap" id="aisa-gsi-button">' +
                    '<span class="aisa-spinner" aria-label="Loading sign-in"></span>' +
                '</div>' +
                '<div class="aisa-error" id="aisa-error" role="alert"></div>' +
                '<div class="aisa-divider" aria-hidden="true"></div>' +
                '<p class="aisa-strip-label">Inside</p>' +
                '<div class="aisa-strip">' +
                    '<img src="' + LOGOS.lion + '" alt="The Digital Lion" ' +
                        'onerror="this.style.display=\'none\'">' +
                    '<img src="' + LOGOS.wired + '" alt="Wired Wednesdays" ' +
                        'onerror="this.style.display=\'none\'">' +
                    '<img src="' + LOGOS.notebook + '" alt="NotebookLM" ' +
                        'onerror="this.style.display=\'none\'">' +
                '</div>' +
                '<p class="aisa-foot">AISA staff &amp; faculty access only</p>' +
            '</div>';
        document.body.appendChild(gate);
    }

    function showError(msg) {
        var err = document.getElementById('aisa-error');
        if (!err) return;
        err.textContent = msg;
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
                theme: 'outline',
                size: 'large',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width: 400
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
