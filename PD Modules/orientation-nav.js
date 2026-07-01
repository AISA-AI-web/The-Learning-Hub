/* =========================================================================
   AISA — Orientation module navigation.

   Loaded only on the orientation async trainings. When a module is opened
   from the Orientation Hub (?from=orientation), this:
     - sends "Return to Modules" and the completion certificate pop-up back
       to the Orientation Hub's modules section (not the PD hub);
     - offers a "Next orientation module →" button that points at the next
       INCOMPLETE orientation training, until all are done;
     - rewrites the post-completion certificate modal so the finish step is
       a clear "next module / back to hub" choice instead of "Back to Modules".
   Completion tracking is untouched (same moduleId), so it stays unified.
   ========================================================================= */
(function () {
    'use strict';
    if (new URLSearchParams(location.search).get('from') !== 'orientation') return;

    var HUB = '../Orientation%20Hub/orientation-hub.html#orientation-modules';
    var ORDER = [
        { id: 'payroll-prf',      file: 'payroll-prf-module.html',      title: 'Payroll & Purchase Requisitions' },
        { id: 'visa-emirates-id', file: 'visa-emirates-id-module.html', title: 'Employment Visa & Emirates ID' },
        { id: 'campus-safety',    file: 'campus-safety-module.html',    title: 'Campus Layout, Safety & Security' },
        { id: 'safeguarding',     file: 'safeguarding-module.html',     title: 'Child Safeguarding & Protection' },
        { id: 'sharepoint-workflows', file: 'sharepoint-workflows-module.html', title: 'SharePoint WorkFlows' }
    ];
    var currentFile = location.pathname.split('/').pop();
    var currentId = (ORDER.filter(function (m) { return m.file === currentFile; })[0] || {}).id;

    /* certificate.js "Back to Modules" destination (read at modal time). */
    window.AISA_MODULES_URL = HUB;

    var next = null;   /* { url, title } of the next incomplete module */

    function computeNext(completedIds) {
        var done = {};
        (completedIds || []).forEach(function (id) { done[id] = true; });
        done[currentId] = true;                       /* current counts as complete */
        var rem = ORDER.filter(function (m) { return m.id !== currentId && !done[m.id]; });
        next = rem.length ? { url: rem[0].file + '?from=orientation', title: rem[0].title } : null;
        render();
    }

    /* ---- In-page nav (completion banner) ---- */
    function bannerHtml() {
        var h = '';
        if (next) {
            h += '<a href="' + next.url + '" class="ori-nav-btn ori-nav-primary">Next orientation module &rarr;</a>';
        }
        h += '<a href="' + HUB + '" class="ori-nav-btn ' + (next ? 'ori-nav-ghost' : 'ori-nav-primary') + '">Back to Orientation Hub</a>';
        return h;
    }

    function render() {
        var slot = document.getElementById('ori-nav-slot');
        if (slot) slot.innerHTML = bannerHtml();
        var overlay = document.querySelector('.aisa-cert-modal-overlay');
        if (overlay) customizeModal(overlay);
    }

    /* ---- Certificate modal rewrite ---- */
    function customizeModal(overlay) {
        var text = overlay.querySelector('.aisa-cert-modal-text');
        if (text) {
            text.innerHTML = next
                ? 'Nice work &mdash; on to the next one. You’re building toward your AISA Onboarding certificate.'
                : 'That’s every orientation training done! Head back to the hub to download your AISA Onboarding certificate.';
        }
        var actions = overlay.querySelector('.aisa-cert-modal-actions');
        if (actions) {
            actions.innerHTML =
                (next ? '<a class="aisa-cert-modal-btn primary" href="' + next.url + '">Next orientation module &rarr;</a>' : '') +
                '<a class="aisa-cert-modal-btn ' + (next ? 'ghost' : 'primary') + '" href="' + HUB + '">Back to Orientation Hub</a>';
        }
    }

    var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var n = added[j];
                if (n.nodeType === 1 && n.classList && n.classList.contains('aisa-cert-modal-overlay')) {
                    customizeModal(n);
                }
            }
        }
    });

    function init() {
        /* Inject a nav slot into the completion banner. */
        var banner = document.getElementById('completion-banner');
        if (banner && !document.getElementById('ori-nav-slot')) {
            var slot = document.createElement('div');
            slot.id = 'ori-nav-slot';
            slot.className = 'ori-nav';
            slot.innerHTML = bannerHtml();
            banner.appendChild(slot);
        }
        /* Repoint + relabel the bottom "Return to Modules" button. */
        Array.prototype.forEach.call(document.querySelectorAll('button[onclick*="pd.html"]'), function (b) {
            b.setAttribute('onclick', "window.location.href='" + HUB + "'");
            b.textContent = 'Back to Orientation Hub';
        });
        mo.observe(document.body, { childList: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    /* Decide the "next incomplete" module from the shared completion state. */
    function run(auth) {
        if (!auth.isConfigured || !auth.isConfigured()) { computeNext([]); return; }
        var cached = auth.getCompletionsCached && auth.getCompletionsCached();
        if (cached) computeNext(cached.map(function (i) { return i.module_id; }));
        auth.getCompletions().then(function (items) {
            computeNext((items || []).map(function (i) { return i.module_id; }));
        }).catch(function () { if (!cached) computeNext([]); });
    }
    if (window.aisaReady) window.aisaReady(run);
    else if (window.aisaAuth) run(window.aisaAuth);
})();
