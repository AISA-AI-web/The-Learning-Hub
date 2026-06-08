/*
 * AISA Learning Hub — Google sign-in gate.
 *
 * Client-side only. This is a speed bump, not a security boundary:
 * any determined visitor with devtools can bypass it. Use Cloudflare
 * Access or a real backend if the content needs true protection.
 */
(function () {
    'use strict';

    /* Expose a helper that runs a callback once window.aisaAuth is
     * ready (i.e. after sign-in). If the user already has a session
     * this fires immediately; otherwise it polls until sign-in
     * completes. Module pages use this to wire completion tracking
     * without worrying about race conditions with the gate. */
    window.aisaReady = function (cb) {
        if (typeof cb !== 'function') return;
        if (window.aisaAuth) { cb(window.aisaAuth); return; }
        var attempts = 0;
        var timer = setInterval(function () {
            attempts++;
            if (window.aisaAuth) {
                clearInterval(timer);
                cb(window.aisaAuth);
            } else if (attempts > 600) {
                clearInterval(timer);
                console.warn('AISA: aisaAuth never became available');
            }
        }, 100);
    };

    var CLIENT_ID = '719019551782-h9pdg57s6oq4jpo884a53o0d1pgel1u6.apps.googleusercontent.com';
    var ALLOWED_DOMAIN = 'aisa.sch.ae';
    var STORAGE_KEY = 'aisa_auth_v2';

    /* ------------------------------------------------------------------
     * AISA backend URL. Paste the Apps Script Web App URL here after
     * deploying auth/apps-script.gs. While this is blank, the gate
     * still works — record/getCompletions just resolve to no-ops so
     * pages don't break.
     * ------------------------------------------------------------------ */
    var API_URL = 'https://script.google.com/macros/s/AKfycbwVifM6VRrov0jR5p0sQ27WcMd4-uZvUDdMkf4j7sieJmo88BMj7xMLx4R3Tpk9iuTa/exec';

    function readSession() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var s = JSON.parse(raw);
            if (!s || !s.email || !s.sessionToken || !s.expiresAt) return null;
            if (Date.now() > s.expiresAt) {
                localStorage.removeItem(STORAGE_KEY);
                return null;
            }
            return s;
        } catch (e) {
            return null;
        }
    }

    function writeSession(payload, sessionToken, expiresAtIso) {
        var expiresAtMs = expiresAtIso ? new Date(expiresAtIso).getTime() : 0;
        if (!expiresAtMs || isNaN(expiresAtMs)) {
            /* Server didn't give us an explicit expiry; default to 1 year. */
            expiresAtMs = Date.now() + 365 * 24 * 60 * 60 * 1000;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            email:        payload.email,
            name:         payload.name || '',
            picture:      payload.picture || '',
            domain:       payload.hd || '',
            sessionToken: sessionToken,
            expiresAt:    expiresAtMs
        }));
    }

    function clearSession() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
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

    /* One-time setup that should run as soon as aisaAuth is available,
     * whether the user had an existing session or just signed in:
     *   - Fire one pageview to the backend.
     *   - Delegate clicks on [data-track="..."] elements so tagged
     *     interactions land in the clicks sheet automatically.
     * Idempotent — guarded by a flag so we don't double-wire after
     * re-auth or programmatic sign-ins. */
    /* The first-login tutorial + survey gate live in auth/onboarding.js.
     * We auto-load that file here so individual pages don't each need
     * a second <script> tag. The URL is derived from gate.js's own
     * <script> src, which works regardless of how the page included
     * it ('auth/gate.js', '../auth/gate.js', etc.).
     *
     * Capture the script src now, at parse time, because
     * document.currentScript becomes null once we're inside async
     * callbacks like fetch().then(). */
    var GATE_SCRIPT_SRC = (document.currentScript && document.currentScript.src) || (function () {
        var s = document.querySelector('script[src*="auth/gate.js"]');
        return s ? s.src : '';
    })();
    var auxLoaded = false;
    function loadOnboarding() {
        /* Name kept for back-compat; loads all sibling auth helpers
         * (first-login tutorial/survey gate + completion certificate). */
        if (auxLoaded) return;
        auxLoaded = true;
        if (!GATE_SCRIPT_SRC) return;
        ['onboarding.js?v=1', 'certificate.js?v=2', 'menu.js?v=3'].forEach(function (name) {
            var url = GATE_SCRIPT_SRC.replace(/gate\.js(\?.*)?$/, name);
            if (url === GATE_SCRIPT_SRC) return;  // pattern didn't match — skip safely
            var s = document.createElement('script');
            s.src   = url;
            s.async = true;
            document.head.appendChild(s);
        });
    }

    var autoTrackingWired = false;
    function wireAutoTracking() {
        if (autoTrackingWired) return;
        if (!window.aisaAuth) return;
        autoTrackingWired = true;

        try { window.aisaAuth.trackPageView(); } catch (e) {}

        document.addEventListener('click', function (e) {
            var el = e.target;
            for (var depth = 0; el && el !== document && depth < 12; depth++) {
                if (el.dataset) {
                    /* Explicit tag wins. */
                    if (el.dataset.track) {
                        try { window.aisaAuth.trackClick(el.dataset.track); } catch (_) {}
                        return;
                    }
                    /* Implicit: PD module cards already carry data-module-id
                     * for the completion machinery, so we reuse that as a
                     * click label without having to tag them twice. */
                    if (el.dataset.moduleId) {
                        try { window.aisaAuth.trackClick('module-card:' + el.dataset.moduleId); } catch (_) {}
                        return;
                    }
                }
                el = el.parentNode;
            }
        });
    }

    var existing = readSession();
    if (existing) {
        window.aisaAuth = buildPublicApi();
        wireAutoTracking();
        loadOnboarding();
        return;
    }

    var preLockStyle = document.createElement('style');
    preLockStyle.id = 'aisa-prelock';
    preLockStyle.textContent =
        'body{visibility:hidden!important}' +
        '#aisa-auth-gate,#aisa-auth-gate *{visibility:visible!important}';
    (document.head || document.documentElement).appendChild(preLockStyle);

    function buildGate(isReAuth) {
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
        var heading  = isReAuth ? 'Sign in to save your progress' : 'The Learning Hub';
        var subBody  = isReAuth
            ? 'Your session has expired. Sign back in with your ' +
              '<span class="aisa-domain">@' + ALLOWED_DOMAIN + '</span> account to keep going.'
            : 'Sign in with your ' +
              '<span class="aisa-domain">@' + ALLOWED_DOMAIN + '</span> ' +
              'Google account to continue.';
        gate.innerHTML =
            '<div class="aisa-card">' +
                '<div class="aisa-logo" aria-hidden="true">&#129409;</div>' +
                '<h1>' + heading + '</h1>' +
                '<p class="aisa-sub">' + subBody + '</p>' +
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

    /* Queue of resolvers waiting for a successful (re-)sign-in. Each entry
     * is a function that gets called once handleCredential completes. */
    var pendingReAuthResolvers = [];

    /* Re-show the gate UI in "session expired" mode and return a promise
     * that resolves once the user signs back in successfully. If the gate
     * is already on screen for any reason, just queue up to wait. */
    function triggerReAuth() {
        return new Promise(function (resolve) {
            pendingReAuthResolvers.push(resolve);
            if (document.getElementById('aisa-auth-gate')) return;

            if (!document.getElementById('aisa-prelock')) {
                var preLockStyle = document.createElement('style');
                preLockStyle.id = 'aisa-prelock';
                preLockStyle.textContent =
                    'body{visibility:hidden!important}' +
                    '#aisa-auth-gate,#aisa-auth-gate *{visibility:visible!important}';
                (document.head || document.documentElement).appendChild(preLockStyle);
            }
            buildGate(true);
            loadGsi();
        });
    }

    function handleCredential(response) {
        var payload;
        try {
            payload = decodeJwt(response.credential);
        } catch (e) {
            showError('Sign-in failed. Please try again.');
            return;
        }
        if (!payload.email_verified) {
            showError('Your Google account email is not verified.');
            return;
        }
        if (payload.hd !== ALLOWED_DOMAIN) {
            showError('Please sign in with your @' + ALLOWED_DOMAIN + ' account, not a personal Google account.');
            try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
            return;
        }

        if (!API_URL) {
            /* No backend configured — keep the gate working in standalone
             * mode by treating the Google token as a short-lived local
             * session. Backend-dependent calls will simply no-op. */
            writeSession(payload, '', null);
            window.aisaAuth = buildPublicApi();
            unlock();
            drainReAuthResolvers();
            wireAutoTracking();
            loadOnboarding();
            return;
        }

        /* Exchange the freshly-minted Google ID token for a long-lived
         * session token. After this, the Google token is discarded — we
         * use the session token for every subsequent request. */
        fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'create_session',
                id_token: response.credential,
                user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
            })
        }).then(function (r) {
            return r.json();
        }).then(function (json) {
            if (!json || !json.ok || !json.session_token) {
                throw new Error((json && json.error) || 'session_create_failed');
            }
            writeSession(payload, json.session_token, json.expires_at);
            window.aisaAuth = buildPublicApi();
            unlock();
            drainReAuthResolvers();
            wireAutoTracking();
            loadOnboarding();
        }).catch(function (err) {
            console.warn('AISA: create_session failed', err);
            showError('Could not start your session. Please try signing in again.');
        });
    }

    function drainReAuthResolvers() {
        var resolvers = pendingReAuthResolvers;
        pendingReAuthResolvers = [];
        for (var i = 0; i < resolvers.length; i++) {
            try { resolvers[i](); } catch (e) {}
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

    /* Tiny floating toast for transient save feedback. Fire-and-forget;
     * stacks multiple messages and auto-dismisses each. */
    function ensureToastHost() {
        var host = document.getElementById('aisa-toast-host');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'aisa-toast-host';
        host.setAttribute('aria-live', 'polite');
        host.style.cssText = 'position:fixed;bottom:1.25rem;right:1.25rem;z-index:2147483646;' +
            'display:flex;flex-direction:column;gap:.5rem;pointer-events:none;' +
            'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
        document.body.appendChild(host);
        return host;
    }
    function showToast(message, kind) {
        var host = ensureToastHost();
        var bg = kind === 'error' ? '#b91c1c' : '#065f46';
        var t = document.createElement('div');
        t.style.cssText = 'background:' + bg + ';color:#fff;padding:.7rem 1rem;border-radius:.6rem;' +
            'box-shadow:0 10px 25px -5px rgba(0,0,0,.3);font-size:.875rem;font-weight:600;' +
            'max-width:320px;opacity:0;transform:translateY(8px);transition:opacity .25s,transform .25s;';
        t.textContent = message;
        host.appendChild(t);
        requestAnimationFrame(function () {
            t.style.opacity = '1';
            t.style.transform = 'translateY(0)';
        });
        setTimeout(function () {
            t.style.opacity = '0';
            t.style.transform = 'translateY(8px)';
            setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
        }, kind === 'error' ? 5000 : 2600);
    }

    function apiCall(action, extra) {
        if (!API_URL) {
            return Promise.reject(new Error('aisa_api_not_configured'));
        }

        var session = readSession();
        if (!session || !session.sessionToken) {
            return triggerReAuth().then(function () { return apiCall(action, extra); });
        }

        var body = { action: action, session_token: session.sessionToken };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];
            }
        }

        return fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json();
        }).then(function (json) {
            if (json && json.ok) return json;
            /* Server rejected our session (revoked, expired on its end,
             * or someone tampered with localStorage). Wipe and re-auth. */
            if (json && (json.error === 'invalid_session' || json.error === 'invalid_token')) {
                clearSession();
                return triggerReAuth().then(function () { return apiCall(action, extra); });
            }
            throw new Error((json && json.error) || 'api_error');
        });
    }

    /* ------------------------------------------------------------------
     * Completions cache.
     *
     * Stale-while-revalidate: every successful getCompletions call
     * writes the result to localStorage. Pages can synchronously read
     * the cached value at load time so the UI starts in the correct
     * state instead of flashing through "nothing completed" first.
     * ------------------------------------------------------------------ */
    var COMPLETIONS_CACHE_KEY = 'aisa_completions_v1';

    function readCachedCompletions() {
        try {
            var session = readSession();
            if (!session) return null;
            var raw = localStorage.getItem(COMPLETIONS_CACHE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            if (!parsed || parsed.email !== session.email) return null;
            return Array.isArray(parsed.completions) ? parsed.completions : null;
        } catch (e) {
            return null;
        }
    }

    function writeCachedCompletions(items) {
        try {
            var session = readSession();
            if (!session) return;
            localStorage.setItem(COMPLETIONS_CACHE_KEY, JSON.stringify({
                email:       session.email,
                completions: items || [],
                cachedAt:    Date.now()
            }));
        } catch (e) {}
    }

    function clearCachedCompletions() {
        try { localStorage.removeItem(COMPLETIONS_CACHE_KEY); } catch (e) {}
    }

    function addCompletionToCache(moduleId, version) {
        try {
            var session = readSession();
            if (!session) return;
            var raw = localStorage.getItem(COMPLETIONS_CACHE_KEY);
            var cache = raw ? JSON.parse(raw) : null;
            if (!cache || cache.email !== session.email) {
                cache = { email: session.email, completions: [], cachedAt: Date.now() };
            }
            var exists = cache.completions.some(function (c) { return c.module_id === moduleId; });
            if (!exists) {
                cache.completions.push({
                    module_id:    moduleId,
                    completed_at: new Date().toISOString(),
                    version:      version || 'v1'
                });
                cache.cachedAt = Date.now();
                localStorage.setItem(COMPLETIONS_CACHE_KEY, JSON.stringify(cache));
            }
        } catch (e) {}
    }

    function buildPublicApi() {
        return {
            signOut: function () {
                var session = readSession();
                /* Best-effort revocation on the server. We don't wait for
                 * the response — local cleanup happens regardless. */
                if (session && session.sessionToken && API_URL) {
                    try {
                        fetch(API_URL, {
                            method: 'POST',
                            mode: 'cors',
                            redirect: 'follow',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({
                                action: 'sign_out',
                                session_token: session.sessionToken
                            })
                        }).catch(function () {});
                    } catch (e) {}
                }
                clearSession();
                clearCachedCompletions();
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
                }).then(function (r) {
                    /* Mirror the new completion into the local cache so
                     * the next page load reflects it immediately, without
                     * waiting on the server roundtrip. */
                    if (event === 'completed') addCompletionToCache(moduleId, version);
                    return r;
                });
            },

            /* Returns a promise resolving to an array of
             *   { module_id, completed_at, version }
             * for every module this user has completed at least once.
             * Also refreshes the local cache for instant rendering on
             * the next page load. */
            getCompletions: function () {
                return apiCall('get_completions').then(function (r) {
                    var items = r.completions || [];
                    writeCachedCompletions(items);
                    return items;
                });
            },

            /* Synchronous read of the most recent completions known to
             * this device. Returns null if there's no cached data for
             * the current user. Pages use this to render the correct
             * state before paint, then call getCompletions() to refresh
             * the cache in the background. */
            getCompletionsCached: function () {
                return readCachedCompletions();
            },

            /* Round-trip health check: confirms the server can verify
             * the current ID token and returns the email it sees (plus
             * whether that email is an admin). */
            whoami: function () {
                return apiCall('whoami');
            },

            /* Admin-only: aggregate completion/compliance data for every
             * staff member. Rejects with 'not_admin' for non-admins. */
            adminOverview: function () {
                return apiCall('admin_overview');
            },

            /* ----- Notifications ----- */
            getNotifications: function () {
                return apiCall('get_notifications');
            },
            markNotificationRead: function (id) {
                return apiCall('mark_notification_read', { notification_id: id });
            },
            markAllNotificationsRead: function () {
                return apiCall('mark_all_notifications_read');
            },
            postNotification: function (title, body, targetTags, targetEmails) {
                return apiCall('post_notification', {
                    title:         title || '',
                    body:          body  || '',
                    target_tags:   Array.isArray(targetTags)   ? targetTags.join(',')   : (targetTags   || ''),
                    target_emails: Array.isArray(targetEmails) ? targetEmails.join(',') : (targetEmails || '')
                });
            },
            deleteNotification: function (id) {
                return apiCall('delete_notification', { notification_id: id });
            },
            adminNotificationStats: function () {
                return apiCall('admin_notification_stats');
            },
            adminListTags: function () {
                return apiCall('admin_list_tags');
            },

            /* Resolve to true/false for whether the current user is an
             * admin. Caches the answer in localStorage so admin-only UI
             * (e.g. the menu link) can render without flashing. */
            isAdmin: function () {
                var session = readSession();
                var cacheKey = 'aisa_is_admin_v1';
                var cached = null;
                try {
                    var raw = localStorage.getItem(cacheKey);
                    if (raw) {
                        var parsed = JSON.parse(raw);
                        if (parsed && session && parsed.email === session.email) {
                            cached = !!parsed.is_admin;
                        }
                    }
                } catch (e) {}
                var refresh = this.whoami().then(function (r) {
                    var val = !!(r && r.is_admin);
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify({
                            email: session ? session.email : '', is_admin: val
                        }));
                    } catch (e) {}
                    return val;
                }).catch(function () { return cached === null ? false : cached; });
                /* Return cached synchronously-ish via a resolved promise
                 * when we have it, but still refresh in the background. */
                if (cached !== null) {
                    refresh.catch(function () {});
                    return Promise.resolve(cached);
                }
                return refresh;
            },

            /* Fire-and-forget: log one page view to the backend's
             * `pageviews` tab. Failures are swallowed so analytics never
             * interferes with the user-facing flow. */
            trackPageView: function () {
                if (!API_URL) return Promise.resolve();
                return apiCall('record_pageview', {
                    page_path:  location.pathname + location.search + location.hash,
                    page_title: document.title || '',
                    referrer:   document.referrer || '',
                    user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
                }).catch(function (err) {
                    console.warn('AISA: pageview failed', err);
                });
            },

            /* Fire-and-forget: log one named click to the backend's
             * `clicks` tab. Called automatically when any element with
             * a data-track="..." attribute is clicked. */
            trackClick: function (label) {
                if (!API_URL || !label) return Promise.resolve();
                return apiCall('record_click', {
                    label:      String(label).slice(0, 200),
                    page_path:  location.pathname + location.search + location.hash,
                    user_agent: (typeof navigator !== 'undefined' && navigator.userAgent) || ''
                }).catch(function (err) {
                    console.warn('AISA: click failed', err);
                });
            },

            /* One-call hook for PD module pages.
             *
             * Watches the page's progress checkboxes; when 100% are
             * checked, records a 'completed' event to the backend
             * exactly once. On load, if the backend already has a
             * completion for this user × module, all the checkboxes
             * get ticked silently so the page shows the completed
             * state without re-firing confetti.
             *
             * config = {
             *   moduleId: 'ai-ethics',
             *   checkboxSelector: '.module-checkbox',
             *   refreshUI: function() {...},   // the module's own progress fn
             *   version: 'v1'                  // optional, defaults to v1
             * }
             */
            wireModule: function (config) {
                if (!config || !config.moduleId) {
                    console.warn('AISA: wireModule called without moduleId');
                    return;
                }
                var api = this;
                var moduleId = config.moduleId;
                var version  = config.version || 'v1';
                var selector = config.checkboxSelector || '.module-checkbox';
                var refresh  = typeof config.refreshUI === 'function' ? config.refreshUI : null;
                var recorded = false;

                function currentPct() {
                    var boxes = document.querySelectorAll(selector);
                    if (!boxes.length) return 0;
                    var checked = 0;
                    for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) checked++;
                    return Math.round((checked / boxes.length) * 100);
                }

                function maybeRecord() {
                    if (recorded) return;
                    if (currentPct() !== 100) return;
                    if (!api.isConfigured()) return;
                    recorded = true;
                    /* Announce a genuine, user-driven completion so shared
                     * helpers (the certificate popup) can react. This fires
                     * once per session and NOT on silent rehydration, because
                     * applyDone() sets `recorded` without calling maybeRecord. */
                    try {
                        document.dispatchEvent(new CustomEvent('aisa:module-completed', {
                            detail: { moduleId: moduleId, version: version }
                        }));
                    } catch (e) {}
                    api.recordEvent(moduleId, 'completed', 100, version).then(function () {
                        showToast('Completion saved');
                    }).catch(function (err) {
                        recorded = false;
                        console.warn('AISA: could not record completion for ' + moduleId, err);
                        showToast("Couldn't save your completion. Tick a box to retry.", 'error');
                    });
                }

                function applyDone() {
                    recorded = true;
                    var boxes = document.querySelectorAll(selector);
                    for (var i = 0; i < boxes.length; i++) boxes[i].checked = true;
                    if (!refresh) return;
                    /* Silence confetti for the silent rehydration so
                     * returning visitors don't get a celebration animation
                     * every time they revisit a completed module. */
                    var origConfetti = window.confetti;
                    window.confetti = function () {};
                    try { refresh(); } finally { window.confetti = origConfetti; }
                }

                function hydrate() {
                    if (!api.isConfigured()) return;

                    /* Step 1: synchronously apply the cached state so the
                     * page never flashes through the un-checked version. */
                    var cached = api.getCompletionsCached();
                    if (cached && cached.some(function (c) { return c.module_id === moduleId; })) {
                        applyDone();
                    }

                    /* Step 2: refresh from the server in the background. */
                    api.getCompletions().then(function (items) {
                        var done = (items || []).some(function (c) { return c.module_id === moduleId; });
                        if (done && !recorded) applyDone();
                    }).catch(function (err) {
                        console.warn('AISA: could not load completion status for ' + moduleId, err);
                    });
                }

                document.addEventListener('change', function (e) {
                    var t = e.target;
                    if (t && typeof t.matches === 'function' && t.matches(selector)) {
                        maybeRecord();
                    }
                });

                /* Keyboard shortcut: Cmd/Ctrl + Shift + Enter marks
                 * the current module complete. Useful for admins or
                 * for quickly testing the recording pipeline. */
                document.addEventListener('keydown', function (e) {
                    var modOk = (e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey;
                    if (!modOk) return;
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    var boxes = document.querySelectorAll(selector);
                    if (!boxes.length) return;
                    for (var i = 0; i < boxes.length; i++) boxes[i].checked = true;
                    if (refresh) refresh();
                    maybeRecord();
                });

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', hydrate);
                } else {
                    hydrate();
                }
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
