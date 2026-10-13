#!/usr/bin/env node
/*
 * deploy.mjs — put the backend in this folder live, from a terminal.
 *
 *     node auth/apps-script/deploy.mjs                 upload and deploy
 *     node auth/apps-script/deploy.mjs --dry-run       check everything, change nothing
 *     node auth/apps-script/deploy.mjs --rollback 31   send the live Hub back to version 31
 *
 *   --yes              don't stop to ask before uploading
 *   --script <id|url>  which Apps Script project is the Hub's. Asked for the
 *                      first time and remembered in .deploy.json beside this
 *                      file, which git ignores.
 *
 * It drives clasp, Google's command line for Apps Script, at a pinned version
 * through npx: nothing is installed globally. Needs Node 18 or later.
 *
 * In order, stopping at the first thing that is not right:
 *
 *   1. tests/apps-script-sim.js must pass. Nothing that fails its own tests
 *      is uploaded.
 *   2. Sign in to Google. A browser opens the first time; use the account
 *      that owns the Hub spreadsheet.
 *   3. Download the project as it stands into a backup folder in your home
 *      folder. That copy is a complete clasp project: it can be pushed back.
 *   4. Check it is the Hub's project: the deployment whose URL is in
 *      auth/gate.js must be one of its own.
 *   5. Show what will change, and ask.
 *   6. Upload the .gs files in this folder with the project's own manifest,
 *      appsscript.json, unchanged: it holds the web app's access settings.
 *      One upload replaces every file at once, so the old Code.gs goes in the
 *      same instant the new files arrive.
 *   7. Download the project again and check it holds exactly those files.
 *   8. Make a new version and point the EXISTING deployment at it. The URL in
 *      auth/gate.js does not change. This script never creates a deployment:
 *      a new deployment means a new URL, and every page of the Hub would lose
 *      its backend.
 *   9. Open that URL and check it answers "all 15 present".
 *
 * tests/deploy-sim.js runs all of this against a fake clasp.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const CLASP_VERSION = '3.4.1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const CONFIG = path.join(HERE, '.deploy.json');
const BACKUPS = path.join(os.homedir(), 'aisa-hub-backend-backups');
const CLASP_HELP = 'npx @google/clasp@' + CLASP_VERSION;

class Stop extends Error {}
function stop(message) { throw new Stop(message); }

const argv = process.argv.slice(2);
const opts = { dryRun: false, yes: false, rollback: null, script: null };
for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--yes') opts.yes = true;
    else if (a === '--rollback') opts.rollback = argv[++i] || '';
    else if (a === '--script') opts.script = argv[++i] || '';
    else {
        console.error('Unknown option: ' + a + '\n\nUsage:\n' +
            '  node auth/apps-script/deploy.mjs [--dry-run] [--yes] [--script <id or editor URL>]\n' +
            '  node auth/apps-script/deploy.mjs --rollback <version number>');
        process.exit(2);
    }
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

let stepNo = 0;
function step(text) { stepNo++; console.log('\n' + stepNo + '. ' + text); }
function ok(text) { console.log('   ok   ' + text); }
function note(text) { console.log('        ' + text.split('\n').join('\n        ')); }
function warn(text) { console.log('   !!   ' + text.split('\n').join('\n        ')); }

async function ask(question) {
    if (!process.stdin.isTTY) stop('This needs an answer, but there is no terminal to ask in. Add --yes to go ahead without asking.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { return (await rl.question('        ' + question)).trim(); } finally { rl.close(); }
}

/* ------------------------------------------------------------------ */
/* clasp                                                               */
/* ------------------------------------------------------------------ */

/* Windows can only start npx.cmd through the shell, which then needs each
 * argument quoted. Nothing passed here contains a double quote. */
function winQuote(a) { return /^[A-Za-z0-9_@.:\\/=+-]+$/.test(a) ? a : '"' + a + '"'; }

/* Runs clasp. `interactive` hands it the terminal (only for signing in);
 * otherwise its output is captured, and its stdin is closed so a question
 * nobody expected fails at once instead of waiting for ever. AISA_CLASP
 * points at a fake clasp, for tests/deploy-sim.js. */
function clasp(args, options) {
    const o = options || {};
    const fake = process.env.AISA_CLASP;
    const win = process.platform === 'win32' && !fake;
    const cmd = fake ? process.execPath : (win ? 'npx.cmd' : 'npx');
    let full = (fake ? [fake] : ['--yes', '@google/clasp@' + CLASP_VERSION])
        .concat(o.json ? ['--json'] : [], args);
    if (win) full = full.map(winQuote);
    const res = spawnSync(cmd, full, {
        cwd: o.cwd || process.cwd(),
        shell: win,
        encoding: 'utf8',
        stdio: o.interactive ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });
    if (res.error) {
        stop('Could not start clasp (' + res.error.message + '). Is Node.js installed, with npx? ' +
             'Get it from https://nodejs.org (the LTS version), then run this again.');
    }
    const out = (res.stdout || '').trim();
    const err = (res.stderr || '').trim();
    return { ok: res.status === 0, out: out, text: [out, err].filter(Boolean).join('\n') };
}

function parseJson(text, what) {
    const start = text.search(/[[{]/);
    try { return JSON.parse(text.slice(start)); }
    catch (e) { stop('clasp answered ' + what + ' with something that was not JSON:\n' + text.slice(0, 500)); }
}

/* clasp's errors are Google's, which rarely say what to do. These are the
 * ones a first run meets. */
function explain(text, scriptId) {
    if (/Apps Script API|usersettings|script\.googleapis\.com/i.test(text)) {
        return 'Google refused: the Apps Script API is switched off for this account. Turn it on at\n' +
               'https://script.google.com/home/usersettings (Google Apps Script API → On), wait a minute,\n' +
               'and run this again.\n\n' + text;
    }
    if (/not found|NOT_FOUND|404/i.test(text)) {
        return 'Google could not find an Apps Script project with the ID ' + scriptId + ' for this account.\n' +
               'Either the ID is wrong (run again with --script and the address of the Apps Script tab),\n' +
               'or you signed in with a Google account that cannot open the project. To sign in again:\n' +
               CLASP_HELP + ' logout\n\n' + text;
    }
    if (/permission|PERMISSION_DENIED|403|forbidden/i.test(text)) {
        return 'Google says this account may not change that project. Sign in as the account that owns\n' +
               'the Hub spreadsheet: ' + CLASP_HELP + ' logout, then run this again.\n\n' + text;
    }
    if (/credentials|invalid_grant|unauthenticated|401|login/i.test(text)) {
        return 'Your Google sign-in has expired. Run ' + CLASP_HELP + ' logout, then run this again.\n\n' + text;
    }
    return text;
}

/* A staging folder is a clasp project of its own: a .clasp.json naming the
 * script, with .gs (not clasp's default .js) as the name for script files. */
function stage(dir, scriptId) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({
        scriptId: scriptId, scriptExtensions: ['.gs', '.js'], htmlExtensions: ['.html']
    }, null, 2) + '\n');
    return dir;
}

function claspIn(dir, args, options) {
    return clasp(['-P', path.join(dir, '.clasp.json')].concat(args), Object.assign({ cwd: dir }, options));
}

/* Every file in a downloaded project: scripts and HTML by their name in the
 * editor (folders included, as "folder/name"), and the manifest. */
function readProject(dir) {
    const project = { scripts: {}, html: {}, manifest: null };
    (function walk(rel) {
        for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
            const relPath = rel ? rel + '/' + entry.name : entry.name;
            if (entry.isDirectory()) { walk(relPath); continue; }
            const src = fs.readFileSync(path.join(dir, relPath), 'utf8');
            const m = /^(.*)\.(gs|js|html)$/.exec(relPath);
            if (relPath === 'appsscript.json') project.manifest = src;
            else if (m && m[2] === 'html') project.html[m[1]] = src;
            else if (m) project.scripts[m[1]] = src;
        }
    })('');
    return project;
}

function download(dir, scriptId) {
    stage(dir, scriptId);
    const r = claspIn(dir, ['pull'], { json: true });
    if (!r.ok) stop(explain(r.text, scriptId));
    return readProject(dir);
}

function listDeployments(dir, scriptId) {
    const r = claspIn(dir, ['list-deployments'], { json: true });
    if (!r.ok) stop(explain(r.text, scriptId));
    return parseJson(r.out, 'the list of deployments');
}

/* ------------------------------------------------------------------ */
/* The pieces                                                          */
/* ------------------------------------------------------------------ */

/* The deployment the Hub talks to, from auth/gate.js: the /exec URL is
 * https://script.google.com/macros/s/<deployment id>/exec. */
function readGate() {
    const src = fs.readFileSync(path.join(REPO, 'auth', 'gate.js'), 'utf8');
    const m = /var API_URL = '(https:\/\/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]+)\/exec)'/.exec(src);
    if (!m) stop('Could not find API_URL in auth/gate.js, so there is no deployment to update.');
    return { url: m[1], deploymentId: m[2] };
}

function localFiles() {
    const names = fs.readdirSync(HERE).filter((n) => /\.gs$/.test(n)).sort();
    if (!names.length) stop('There are no .gs files in ' + HERE + '.');
    return names.map((n) => ({ name: n.slice(0, -3), file: n, src: fs.readFileSync(path.join(HERE, n), 'utf8') }));
}

function runTests() {
    const res = spawnSync(process.execPath, [path.join(REPO, 'tests', 'apps-script-sim.js')],
                          { cwd: REPO, encoding: 'utf8' });
    if (res.status !== 0) {
        console.log(res.stdout || '');
        console.log(res.stderr || '');
        stop('The backend simulator failed, so nothing was uploaded. The failures are listed above.');
    }
}

function signedInAs() {
    const r = clasp(['show-authorized-user'], { json: true });
    if (!r.ok) stop('clasp could not check who is signed in:\n' + r.text);
    return parseJson(r.out, 'who is signed in');
}

function signIn() {
    let who = signedInAs();
    if (!who.loggedIn) {
        note('A browser will open. Sign in with the Google account that owns the Hub spreadsheet,\n' +
             'and allow access. (The first run also downloads clasp, which takes a moment.)');
        const r = clasp(['login'], { interactive: true });
        if (!r.ok) stop('Signing in did not finish. Run this again to retry.');
        who = signedInAs();
        if (!who.loggedIn) stop('Still not signed in. Run this again to retry.');
    }
    return who.email || 'an account clasp could not name';
}

function scriptIdFrom(raw) {
    const s = String(raw || '').trim();
    if (/docs\.google\.com\/spreadsheets/.test(s)) {
        stop('That is the spreadsheet\'s address. From the spreadsheet, open Extensions → Apps Script\n' +
             'and copy the address of THAT tab instead.');
    }
    if (/^AKfycb/.test(s) || /\/macros\/s\//.test(s)) {
        stop('That is the web app\'s deployment address, not the project. In the Apps Script editor,\n' +
             'copy the address bar, or ⚙ Project Settings → Script ID.');
    }
    const m = /\/(?:projects|d)\/([A-Za-z0-9_-]{20,})/.exec(s);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
    stop('That does not look like an Apps Script address or Script ID: ' + (s || '(nothing)'));
}

async function scriptId() {
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(CONFIG, 'utf8')).scriptId; } catch (e) { /* first run */ }
    if (opts.script === null && saved) return saved;
    let raw = opts.script;
    if (!raw) {
        note('Which Apps Script project is the Hub\'s? Open the Hub spreadsheet, then\n' +
             'Extensions → Apps Script, and copy the address of that tab.');
        raw = await ask('Paste it here: ');
    }
    const id = scriptIdFrom(raw);
    fs.writeFileSync(CONFIG, JSON.stringify({ scriptId: id }, null, 2) + '\n');
    return id;
}

/* Line endings and a trailing newline are not differences worth stopping
 * for; anything else is. */
function same(a, b) {
    const n = (s) => String(s).replace(/\r\n/g, '\n').replace(/\s+$/, '');
    return n(a) === n(b);
}

function canonicalJson(text) {
    const sort = (v) => Array.isArray(v) ? v.map(sort)
        : (v && typeof v === 'object') ? Object.keys(v).sort().reduce((o, k) => { o[k] = sort(v[k]); return o; }, {})
        : v;
    return JSON.stringify(sort(JSON.parse(text)));
}

function gitCommit() {
    const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' });
    if (r.status !== 0) return { sha: '', dirty: false };
    const st = spawnSync('git', ['status', '--porcelain', '--', 'auth/apps-script'], { cwd: REPO, encoding: 'utf8' });
    return { sha: r.stdout.trim(), dirty: st.status === 0 && /\.gs$/m.test(st.stdout) };
}

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '_' +
           p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

/* GET on the /exec URL runs doGet(), which says whether every file is in. A
 * new version can take a few seconds to reach every Google server. */
async function checkLive(url, expectFiles) {
    const target = process.env.AISA_HUB_EXEC_URL || url;
    const wait = Number(process.env.AISA_DEPLOY_RETRY_MS || 5000);
    let last = '';
    for (let i = 0; i < 6; i++) {
        try {
            const res = await fetch(target, { redirect: 'follow' });
            const text = await res.text();
            let body = null;
            try { body = JSON.parse(text); } catch (e) { /* an HTML error page */ }
            if (body && (expectFiles === null || body.files === expectFiles)) return { ok: true, body: body };
            last = body ? JSON.stringify(body) : 'HTTP ' + res.status + ': ' + text.replace(/\s+/g, ' ').slice(0, 160);
        } catch (e) {
            last = String(e && e.message || e);
        }
        await new Promise((r) => setTimeout(r, wait));
    }
    return { ok: false, last: last };
}

/* ------------------------------------------------------------------ */
/* Deploy                                                              */
/* ------------------------------------------------------------------ */

async function deploy(work) {
    const gate = readGate();
    const files = localFiles();
    const commit = gitCommit();
    const expect = 'all ' + files.length + ' present';

    step('Testing the backend (tests/apps-script-sim.js)');
    runTests();
    ok('all checks passed');

    step('Signing in to Google');
    ok('signed in as ' + signIn());
    const sid = await scriptId();

    step('Downloading the project as it is now, as a backup');
    const liveDir = path.join(work, 'live');
    const live = download(liveDir, sid);
    const backupDir = path.join(BACKUPS, stamp() + '-before-deploy');
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.cpSync(liveDir, backupDir, { recursive: true });
    ok('saved to ' + backupDir);
    note('That folder is a complete copy, which can be uploaded back unchanged:\n' +
         'cd "' + backupDir + '" && ' + CLASP_HELP + ' push --force');

    step('Checking this is the Hub\'s project');
    const deployments = listDeployments(liveDir, sid);
    const ours = deployments.find((d) => d.deploymentId === gate.deploymentId);
    if (!ours) {
        stop('This project has no deployment with the URL in auth/gate.js, so it is not the one\n' +
             'the Hub uses. Nothing was changed. Run again with --script and the address of the\n' +
             'Apps Script tab opened from the Hub spreadsheet (Extensions → Apps Script).');
    }
    const before = ours.versionNumber;
    if (!live.manifest) stop('The project has no appsscript.json manifest. Nothing was changed.');
    let manifest;
    try { manifest = JSON.parse(live.manifest); } catch (e) { stop('The project\'s appsscript.json is not valid JSON. Nothing was changed.'); }
    if (manifest.runtimeVersion !== 'V8') {
        stop('The project runs on the old Rhino runtime (runtimeVersion is "' + manifest.runtimeVersion + '"),\n' +
             'and this backend needs V8. Nothing was changed.');
    }
    ok('the Hub\'s web app is deployment ' + gate.deploymentId.slice(0, 12) + '…, now on version ' + (before || 'HEAD'));
    if (manifest.webapp) {
        ok('web app settings, kept exactly as they are: runs as ' + manifest.webapp.executeAs +
           ', open to ' + manifest.webapp.access);
    }

    step('What will change');
    const plan = { add: [], replace: [], same: [], remove: [] };
    files.forEach((f) => {
        if (!(f.name in live.scripts)) plan.add.push(f.file);
        else if (same(live.scripts[f.name], f.src)) plan.same.push(f.file);
        else plan.replace.push(f.file);
    });
    Object.keys(live.scripts).forEach((n) => {
        if (files.some((f) => f.name === n)) return;
        const oldBackend = /aisa-learning-hub/.test(live.scripts[n]);
        plan.remove.push(n + '.gs' + (oldBackend ? ' (the old single-file backend)' : ''));
    });
    Object.keys(live.html).forEach((n) => plan.remove.push(n + '.html'));
    const list = (xs) => xs.length ? xs.join(', ') : 'none';
    note('remove:     ' + list(plan.remove));
    note('add:        ' + list(plan.add));
    note('replace:    ' + list(plan.replace));
    note('unchanged:  ' + list(plan.same));
    note('then: a new version, and the existing deployment moved onto it. Same URL.');
    if (commit.sha) note('code from commit ' + commit.sha + (commit.dirty ? ', plus .gs changes not yet committed' : ''));
    const strangers = plan.remove.filter((r) => !/old single-file backend/.test(r));
    if (strangers.length) {
        warn('The project has file(s) this repo does not know about: ' + strangers.join(', ') + '.\n' +
             'They will be removed. Their contents are in the backup above.');
    }
    const changes = plan.add.length + plan.replace.length + plan.remove.length;

    if (opts.dryRun) {
        console.log('\nDry run: stopping here. Nothing was uploaded or deployed.');
        return;
    }
    if (!opts.yes) {
        const answer = await ask('Upload and deploy? Type yes to go ahead: ');
        if (answer.toLowerCase() !== 'yes') { console.log('\nStopped. Nothing was uploaded or deployed.'); return; }
    }

    step('Uploading');
    const pushDir = stage(path.join(work, 'push'), sid);
    fs.writeFileSync(path.join(pushDir, 'appsscript.json'), live.manifest);
    files.forEach((f) => fs.writeFileSync(path.join(pushDir, f.file), f.src));
    if (plan.add.length || plan.replace.length) {
        const r = claspIn(pushDir, ['push', '--force'], { json: true });
        if (!r.ok) {
            stop(explain(r.text, sid) + '\n\nThe live Hub is unaffected: it still runs version ' + (before || 'HEAD') + '.');
        }
        ok('uploaded ' + files.length + ' files and the manifest, in one go');
    } else if (changes) {
        stop('Every file here is already in the project, but so is ' + list(plan.remove) + ', and clasp will not\n' +
             'remove a file on its own when nothing else changed. Delete it in the editor\n' +
             '(⋮ next to its name → Delete), then run this again. Nothing was deployed.');
    } else {
        ok('the project already holds exactly these files; nothing to upload');
    }

    step('Checking the project now holds exactly these files');
    const after = download(path.join(work, 'verify'), sid);
    const problems = [];
    files.forEach((f) => {
        if (!(f.name in after.scripts)) problems.push(f.file + ' is missing');
        else if (!same(after.scripts[f.name], f.src)) problems.push(f.file + ' is not what was uploaded');
    });
    Object.keys(after.scripts).forEach((n) => {
        if (!files.some((f) => f.name === n)) problems.push(n + '.gs is still there');
    });
    Object.keys(after.html).forEach((n) => problems.push(n + '.html is still there'));
    if (!after.manifest || canonicalJson(after.manifest) !== canonicalJson(live.manifest)) {
        problems.push('appsscript.json changed');
    }
    if (problems.length) {
        stop('The project does not hold what was uploaded: ' + problems.join('; ') + '.\n' +
             'Nothing was deployed: the live Hub still runs version ' + (before || 'HEAD') + '. Run this again;\n' +
             'or, to put the editor back as it was: cd "' + backupDir + '" && ' + CLASP_HELP + ' push --force');
    }
    ok(files.length + ' files and the manifest, byte for byte');

    step('Deploying: a new version, on the existing deployment');
    const description = ('Hub backend ' + (commit.sha || '') + ' ' + stamp().slice(0, 10)).replace(/\s+/g, ' ');
    const d = claspIn(pushDir, ['update-deployment', gate.deploymentId, '--description', description], { json: true });
    if (!d.ok) stop(explain(d.text, sid) + '\n\nThe live Hub still runs version ' + (before || 'HEAD') + '.');
    const deployed = parseJson(d.out, 'the deployment');
    if (deployed.deploymentId !== gate.deploymentId) {
        stop('clasp reports updating deployment ' + deployed.deploymentId + ', which is not the one in auth/gate.js.\n' +
             'Check Deploy → Manage deployments in the editor.');
    }
    ok('version ' + deployed.versionNumber + ' is live (it was ' + (before || 'HEAD') + '); the URL has not changed');

    step('Asking the live web app');
    const check = await checkLive(gate.url, expect);
    if (check.ok) {
        ok('it says "' + check.body.files + '"');
    } else {
        warn('The web app did not confirm the new files. Its last answer: ' + check.last + '\n' +
             'Open ' + gate.url + ' in a browser. If it does not say "' + expect + '",\n' +
             'put the old version back with: node auth/apps-script/deploy.mjs --rollback ' + (before || '<version>'));
    }

    console.log('\nDone. The Hub\'s backend is now version ' + deployed.versionNumber + '.');
    console.log('  Backup of what was there:  ' + backupDir);
    if (before) console.log('  To undo:                   node auth/apps-script/deploy.mjs --rollback ' + before);
    if (!check.ok) process.exitCode = 1;
}

/* ------------------------------------------------------------------ */
/* Roll back                                                           */
/* ------------------------------------------------------------------ */

/* Points the live deployment at an earlier version. The editor keeps the
 * current files; only what the Hub runs changes. Deploying again moves it
 * forward. */
async function rollback(work, version) {
    if (!/^\d+$/.test(version)) stop('--rollback needs a version number, for example --rollback 31.');
    const gate = readGate();

    step('Signing in to Google');
    ok('signed in as ' + signIn());
    const sid = await scriptId();

    step('Checking this is the Hub\'s project');
    const dir = stage(path.join(work, 'rollback'), sid);
    const ours = listDeployments(dir, sid).find((d) => d.deploymentId === gate.deploymentId);
    if (!ours) stop('This project has no deployment with the URL in auth/gate.js. Nothing was changed.');
    ok('the Hub\'s web app is on version ' + (ours.versionNumber || 'HEAD'));
    if (String(ours.versionNumber) === version) { console.log('\nIt is already on version ' + version + '. Nothing to do.'); return; }

    if (!opts.yes) {
        const answer = await ask('Point the live Hub at version ' + version + '? Type yes to go ahead: ');
        if (answer.toLowerCase() !== 'yes') { console.log('\nStopped. Nothing was changed.'); return; }
    }

    step('Rolling back');
    const r = claspIn(dir, ['update-deployment', gate.deploymentId, '--versionNumber', version,
                            '--description', 'Rolled back to version ' + version], { json: true });
    if (!r.ok) stop(explain(r.text, sid));
    const deployed = parseJson(r.out, 'the deployment');
    if (deployed.deploymentId !== gate.deploymentId || String(deployed.versionNumber) !== version) {
        stop('clasp reports ' + JSON.stringify(deployed) + '. Check Deploy → Manage deployments in the editor.');
    }
    ok('the live Hub runs version ' + version + ' again; the URL has not changed');

    const check = await checkLive(gate.url, null);
    if (check.ok) ok('the web app answers: ' + JSON.stringify(check.body));
    else warn('The web app did not answer as expected: ' + check.last);
    console.log('\nDone. The editor still shows the newer files; running this script again deploys them.');
}

/* ------------------------------------------------------------------ */

async function main() {
    const major = Number(process.versions.node.split('.')[0]);
    if (major < 18) stop('This needs Node.js 18 or later (you have ' + process.version + '). Get it from https://nodejs.org');
    console.log('AISA Learning Hub — ' + (opts.rollback !== null ? 'roll back' : 'deploy') + ' the Apps Script backend');
    const work = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'aisa-hub-deploy-')));
    try {
        if (opts.rollback !== null) await rollback(work, opts.rollback);
        else await deploy(work);
    } finally {
        fs.rmSync(work, { recursive: true, force: true });
    }
}

main().catch((e) => {
    if (e instanceof Stop) {
        console.error('\nStopped: ' + e.message);
        process.exit(1);
    }
    console.error(e);
    process.exit(1);
});
