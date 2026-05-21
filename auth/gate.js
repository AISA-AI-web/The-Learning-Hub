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

    /* ------------------------------------------------------------------
     * AISA backend URL. Paste the Apps Script Web App URL here after
     * deploying auth/apps-script.gs. While this is blank, the gate
     * still works — record/getCompletions just resolve to no-ops so
     * pages don't break.
     * ------------------------------------------------------------------ */
    var API_URL = '';

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

    function writeSession(payload, rawIdToken) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            email: payload.email,
            name: payload.name || '',
            picture: payload.picture || '',
            domain: payload.hd || '',
            idToken: rawIdToken || '',
            idTokenExpiresAt: Number(payload.exp || 0) * 1000,
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

    function buildGate() {
        var style = document.createElement('style');
        style.id = 'aisa-gate-style';
        style.textContent = [
            '#aisa-auth-gate{position:fixed;inset:0;z-index:2147483647;',
            'background:linear-gradient(135deg,#0c4a6e 0%,#1e3a8a 50%,#312e81 100%);',
            'display:flex;align-items:center;justify-content:center;',
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;',
            'color:#f8fafc;padding:1rem;}',
            '#aisa-auth-gate .aisa-card{background:#fff;color:#0f172a;max-width:440px;',
            'width:100%;padding:2.5rem 2rem;border-radius:1.25rem;',
            'box-shadow:0 25px 50px -12px rgba(0,0,0,.5);text-align:center;}',
            '#aisa-auth-gate .aisa-logo{font-size:2.5rem;margin-bottom:.5rem;line-height:1;}',
            '#aisa-auth-gate h1{margin:.25rem 0 .5rem;font-size:1.5rem;font-weight:800;',
            'letter-spacing:-.01em;color:#0f172a;}',
            '#aisa-auth-gate .aisa-sub{margin:0 0 1.5rem;color:#475569;font-size:.95rem;',
            'line-height:1.5;}',
            '#aisa-auth-gate .aisa-domain{display:inline-block;background:#f1f5f9;',
            'color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;',
            'font-size:.85rem;padding:2px 8px;border-radius:6px;}',
            '#aisa-auth-gate .aisa-btn-wrap{display:flex;justify-content:center;',
            'min-height:44px;margin-top:.5rem;}',
            '#aisa-auth-gate .aisa-error{margin-top:1.25rem;padding:.75rem 1rem;',
            'border-radius:.5rem;background:#fef2f2;color:#991b1b;font-size:.85rem;',
            'border:1px solid #fecaca;display:none;text-align:left;}',
            '#aisa-auth-gate .aisa-error.show{display:block;}',
            '#aisa-auth-gate .aisa-foot{margin-top:1.5rem;font-size:.75rem;color:#94a3b8;}',
            '#aisa-auth-gate .aisa-spinner{display:inline-block;width:18px;height:18px;',
            'border:2px solid #cbd5e1;border-top-color:#0f172a;border-radius:50%;',
            'animation:aisa-spin .8s linear infinite;}',
            '@keyframes aisa-spin{to{transform:rotate(360deg)}}'
        ].join('');
        document.head.appendChild(style);

        var gate = document.createElement('div');
        gate.id = 'aisa-auth-gate';
        gate.setAttribute('role', 'dialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-label', 'Sign in required');
        gate.innerHTML =
            '<div class="aisa-card">' +
                '<div class="aisa-logo" aria-hidden="true">&#129409;</div>' +
                '<h1>The Learning Hub</h1>' +
                '<p class="aisa-sub">Sign in with your ' +
                    '<span class="aisa-domain">@' + ALLOWED_DOMAIN + '</span> ' +
                    'Google account to continue.</p>' +
                '<div class="aisa-btn-wrap" id="aisa-gsi-button">' +
                    '<span class="aisa-spinner" aria-label="Loading sign-in"></span>' +
                '</div>' +
                '<div class="aisa-error" id="aisa-error" role="alert"></div>' +
                '<div class="aisa-foot">AISA staff &amp; faculty access only.</div>' +
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
            writeSession(payload, response.credential);
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

    /* ------------------------------------------------------------------
     * Backend API helpers — talk to the Apps Script web app.
     *
     * The Apps Script endpoint can't respond to CORS preflight, so we
     * deliberately send `Content-Type: text/plain` to keep the request
     * simple. The server parses the body as JSON itself.
     * ------------------------------------------------------------------ */

    function apiCall(action, extra) {
        return new Promise(function (resolve, reject) {
            if (!API_URL) {
                reject(new Error('aisa_api_not_configured'));
                return;
            }
            var session = readSession();
            if (!session || !session.idToken) {
                reject(new Error('not_signed_in'));
                return;
            }
            if (session.idTokenExpiresAt && Date.now() > session.idTokenExpiresAt) {
                /* Google ID tokens expire ~1 hour after sign-in. The gate
                 * session can be longer, so we need the user to re-sign-in
                 * before we can talk to the backend again. */
                try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}
                reject(new Error('id_token_expired'));
                return;
            }

            var body = { action: action, id_token: session.idToken };
            if (extra) {
                for (var k in extra) {
                    if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];
                }
            }

            fetch(API_URL, {
                method: 'POST',
                mode: 'cors',
                redirect: 'follow',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(body)
            }).then(function (r) {
                return r.json();
            }).then(function (json) {
                if (json && json.ok) resolve(json);
                else reject(new Error((json && json.error) || 'api_error'));
            }).catch(reject);
        });
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
            },
            isConfigured: function () {
                return !!API_URL;
            },

            /* Record a single event for a module. The `event` is a
             * free-form string — common values are 'started', 'progress',
             * and 'completed'. progressPct is optional (defaults to 0). */
            recordEvent: function (moduleId, event, progressPct, version) {
                return apiCall('record_event', {
                    module_id:    moduleId,
                    event:        event || 'progress',
                    progress_pct: typeof progressPct === 'number' ? progressPct : 0,
                    version:      version || 'v1',
                    user_agent:   (typeof navigator !== 'undefined' && navigator.userAgent) || ''
                });
            },

            /* Returns a promise resolving to an array of
             *   { module_id, completed_at, version }
             * for every module this user has completed at least once. */
            getCompletions: function () {
                return apiCall('get_completions').then(function (r) {
                    return r.completions || [];
                });
            },

            /* Round-trip health check: confirms the server can verify
             * the current ID token and returns the email it sees. */
            whoami: function () {
                return apiCall('whoami');
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
