/*
 * Runs auth/apps-script/deploy.mjs against a fake clasp (tests/fake-clasp.js)
 * and a fake web app, end to end:
 *
 *     node tests/deploy-sim.js
 *
 * No dependencies, no network, no Google account. Exits 0 on pass, 1 on
 * failure. Run it after touching deploy.mjs.
 *
 * Each case starts from a pretend Apps Script project that looks like the
 * Hub's before the split: one Code.gs, a manifest with web app settings, and
 * three deployments, one of them the deployment whose URL is in auth/gate.js.
 * deploy.mjs runs from a throwaway copy of the repo, where
 * tests/apps-script-sim.js is replaced by a stub that passes or fails on
 * demand, so this tests the deploy and not the backend.
 *
 * The fake web app answers the /exec URL by running the real doGet() of
 * whichever version is deployed, through tests/apps-script-sim.js, so "all
 * 15 present" has to be earned.
 *
 * The rules it holds deploy.mjs to: never create a deployment (a new URL);
 * never touch any deployment but the one in auth/gate.js; never deploy what
 * failed its tests, what did not upload intact, or into a project that is not
 * the Hub's; keep the manifest byte for byte; leave a backup first.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const sim = require('./apps-script-sim.js');

const REPO = path.resolve(__dirname, '..');
const FAKE = path.join(__dirname, 'fake-clasp.js');
const GATE_ID = /macros\/s\/([A-Za-z0-9_-]+)\/exec/.exec(fs.readFileSync(path.join(REPO, 'auth', 'gate.js'), 'utf8'))[1];
const SCRIPT_ID = '1FakeHubScriptIdUsedOnlyByTests_abcdefghijklmnopq';
const OTHER_ID = 'AKfycbSomeOtherDeploymentOfTheProject';
const BACKEND = fs.readdirSync(path.join(REPO, 'auth', 'apps-script')).filter((n) => /\.gs$/.test(n)).sort();

let failures = 0;
function check(name, ok, detail) {
    console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || detail === undefined ? '' : '\n         ' + String(detail).slice(0, 1500)));
    if (!ok) failures++;
}

const OLD_BACKEND =
    "const OAUTH_CLIENT_ID = 'old';\n" +
    'function doGet(e) {\n' +
    "  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'aisa-learning-hub', version: 'v2' }))\n" +
    '    .setMimeType(ContentService.MimeType.JSON);\n' +
    '}\n';
const MANIFEST = '{\n  "timeZone": "Asia/Dubai",\n  "dependencies": {},\n  "exceptionLogging": "STACKDRIVER",\n' +
    '  "runtimeVersion": "V8",\n  "webapp": {\n    "executeAs": "USER_DEPLOYING",\n    "access": "ANYONE_ANONYMOUS"\n  }\n}\n';

function freshState(extraFiles) {
    const files = [{ name: 'Code', type: 'SERVER_JS', source: OLD_BACKEND }]
        .concat(extraFiles || [])
        .concat([{ name: 'appsscript', type: 'JSON', source: MANIFEST }]);
    return {
        loggedIn: true, email: 'owner@aisa.sch.ae', scriptId: SCRIPT_ID,
        files: files,
        versions: [{ versionNumber: 5, files: [] }, { versionNumber: 31, files: JSON.parse(JSON.stringify(files)) }],
        deployments: [
            { deploymentId: 'AKfycbTheHeadDeploymentOfTheProject', versionNumber: null, description: '' },
            { deploymentId: GATE_ID, versionNumber: 31, description: 'live' },
            { deploymentId: OTHER_ID, versionNumber: 5, description: 'other' }
        ],
        calls: [],
        inject: {}
    };
}

/* A world: a copy of the repo, a home folder for backups, the fake
 * project's state, and a fake web app serving the deployed version. */
async function makeWorld(state, opts) {
    opts = opts || {};
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deploy-sim-'));
    const repo = path.join(root, 'repo');
    fs.cpSync(path.join(REPO, 'auth'), path.join(repo, 'auth'), {
        recursive: true, filter: (src) => path.basename(src) !== '.deploy.json'
    });
    fs.mkdirSync(path.join(repo, 'tests'));
    fs.writeFileSync(path.join(repo, 'tests', 'apps-script-sim.js'),
                     opts.testsFail ? "console.log('  FAIL planted');\nprocess.exit(1);\n" : 'process.exit(0);\n');
    const home = path.join(root, 'home');
    fs.mkdirSync(home);
    const statePath = path.join(root, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    const server = http.createServer((req, res) => {
        const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (st.inject.webAppDown) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<html><body>Sorry, unable to open the file at this time.</body></html>');
            return;
        }
        const dep = st.deployments.find((d) => d.deploymentId === GATE_ID);
        const ver = st.versions.find((v) => v.versionNumber === dep.versionNumber);
        const files = ver.files.filter((f) => f.type === 'SERVER_JS').map((f) => ({ name: f.name + '.gs', src: f.source }));
        const out = sim.execute(files, sim.makeWorld({}), 'doGet', [{}]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(out.content);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    const world = {
        root, repo, home, statePath, server,
        state: () => JSON.parse(fs.readFileSync(statePath, 'utf8')),
        backups: () => {
            const dir = path.join(home, 'aisa-hub-backend-backups');
            return fs.existsSync(dir) ? fs.readdirSync(dir).map((n) => path.join(dir, n)) : [];
        },
        run: (args) => new Promise((resolve) => {
            const child = spawn(process.execPath, [path.join(repo, 'auth', 'apps-script', 'deploy.mjs')].concat(args), {
                env: Object.assign({}, process.env, {
                    AISA_CLASP: FAKE, FAKE_CLASP_STATE: statePath,
                    HOME: home, USERPROFILE: home,
                    AISA_HUB_EXEC_URL: 'http://127.0.0.1:' + server.address().port + '/exec',
                    AISA_DEPLOY_RETRY_MS: '10'
                }),
                stdio: ['ignore', 'pipe', 'pipe']
            });
            let output = '';
            child.stdout.on('data', (d) => { output += d; });
            child.stderr.on('data', (d) => { output += d; });
            child.on('close', (code) => resolve({ code: code, output: output }));
        }),
        close: () => { server.close(); fs.rmSync(root, { recursive: true, force: true }); }
    };
    return world;
}

const names = (st) => st.files.map((f) => (f.type === 'JSON' ? 'appsscript.json' : f.name + '.gs')).sort();
const deployment = (st, id) => st.deployments.find((d) => d.deploymentId === id);
const wrote = (st) => st.calls.filter((c) => /^(push|update-deployment|create-deployment|deploy)\b/.test(c));
const never = (st) => !st.calls.some((c) => /^(create-deployment|deploy)\b/.test(c));

async function main() {
    console.log('deploy.mjs against a fake clasp\n');

    /* The first deploy: one Code.gs becomes fifteen files. */
    {
        const w = await makeWorld(freshState());
        const r = await w.run(['--yes', '--script', 'https://script.google.com/home/projects/' + SCRIPT_ID + '/edit']);
        const st = w.state();
        check('first deploy: exits 0', r.code === 0, r.output);
        check('first deploy: the project holds exactly the ' + BACKEND.length + ' files and the manifest; Code.gs is gone',
              JSON.stringify(names(st)) === JSON.stringify(BACKEND.concat(['appsscript.json']).sort()), names(st).join(', '));
        check('first deploy: every file uploaded byte for byte', BACKEND.every((n) => {
            const f = st.files.find((x) => x.name === n.slice(0, -3));
            return f && f.source === fs.readFileSync(path.join(REPO, 'auth', 'apps-script', n), 'utf8');
        }));
        check('first deploy: the manifest (and with it the web app settings) is untouched, byte for byte',
              st.files.find((f) => f.type === 'JSON').source === MANIFEST);
        check('first deploy: the Hub\'s deployment moved to a new version, 32', deployment(st, GATE_ID).versionNumber === 32,
              JSON.stringify(st.deployments));
        check('first deploy: no other deployment touched, and no deployment created',
              deployment(st, OTHER_ID).versionNumber === 5 && st.deployments.length === 3 && never(st), st.calls.join(' | '));
        check('first deploy: the live web app answers "all ' + BACKEND.length + ' present"',
              r.output.indexOf('it says "all ' + BACKEND.length + ' present"') !== -1, r.output);
        const backup = w.backups()[0];
        check('first deploy: a backup of the old project, which can be pushed back as it is',
              w.backups().length === 1 && fs.readFileSync(path.join(backup, 'Code.gs'), 'utf8') === OLD_BACKEND &&
              fs.readFileSync(path.join(backup, 'appsscript.json'), 'utf8') === MANIFEST &&
              JSON.parse(fs.readFileSync(path.join(backup, '.clasp.json'), 'utf8')).scriptId === SCRIPT_ID,
              w.backups().join(', '));
        check('first deploy: names the old file as the old backend, and says how to undo',
              /remove: +Code\.gs \(the old single-file backend\)/.test(r.output) && r.output.indexOf('--rollback 31') !== -1, r.output);
        check('first deploy: remembers the script ID (from the editor\'s address) for next time',
              JSON.parse(fs.readFileSync(path.join(w.repo, 'auth', 'apps-script', '.deploy.json'), 'utf8')).scriptId === SCRIPT_ID);

        /* Roll back, then forward again. */
        const rb = await w.run(['--rollback', '31', '--yes']);
        const st2 = w.state();
        check('rollback: the Hub\'s deployment is on version 31 again, the other untouched',
              rb.code === 0 && deployment(st2, GATE_ID).versionNumber === 31 && deployment(st2, OTHER_ID).versionNumber === 5 && never(st2),
              rb.output);
        check('rollback: the web app answers from the old code', /"service":"aisa-learning-hub"/.test(rb.output) && !/all \d+ present/.test(rb.output), rb.output);
        const again = await w.run(['--yes']);
        const st3 = w.state();
        check('deploying again with nothing to upload makes a new version on the same deployment',
              again.code === 0 && /nothing to upload/.test(again.output) && deployment(st3, GATE_ID).versionNumber === 33 &&
              !st3.calls.slice(st2.calls.length).some((c) => /^push\b/.test(c)) && never(st3),
              again.output);
        w.close();
    }

    /* A project that is not the Hub's: no deployment with gate.js's URL. */
    {
        const s = freshState();
        s.deployments = s.deployments.filter((d) => d.deploymentId !== GATE_ID);
        const w = await makeWorld(s);
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        const st = w.state();
        check('not the Hub\'s project: stops, uploads nothing, deploys nothing',
              r.code === 1 && /not the one\s+the Hub uses/.test(r.output) && !wrote(st).length && JSON.stringify(st.files) === JSON.stringify(s.files),
              r.output);
        w.close();
    }

    /* The backend's own tests fail: nothing at all happens. */
    {
        const w = await makeWorld(freshState(), { testsFail: true });
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        check('failing tests: stops before signing in, and touches nothing',
              r.code === 1 && /simulator failed/.test(r.output) && w.state().calls.length === 0, r.output);
        w.close();
    }

    /* A dry run reads, backs up and shows the plan, and changes nothing. */
    {
        const s = freshState();
        const w = await makeWorld(s);
        const r = await w.run(['--dry-run', '--script', SCRIPT_ID]);
        const st = w.state();
        check('dry run: shows the plan and changes nothing',
              r.code === 0 && /Dry run: stopping here/.test(r.output) && /add: +00_settings\.gs/.test(r.output) &&
              !wrote(st).length && deployment(st, GATE_ID).versionNumber === 31, r.output);
        w.close();
    }

    /* The upload loses a file: caught before anything is deployed. */
    {
        const s = freshState();
        s.inject.dropOnPush = '41_surveys';
        const w = await makeWorld(s);
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        const st = w.state();
        check('an upload that lost a file: caught, and nothing deployed',
              r.code === 1 && /41_surveys\.gs is missing/.test(r.output) && deployment(st, GATE_ID).versionNumber === 31 &&
              !st.calls.some((c) => /^update-deployment\b/.test(c)), r.output);
        w.close();
    }

    /* A file in the project that the repo does not know about. */
    {
        const extra = [{ name: 'Utils', type: 'SERVER_JS', source: 'function helper() { return 1; }\n' }];
        const w = await makeWorld(freshState(extra));
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        check('a file the repo does not know: named in a warning, removed, and kept in the backup',
              r.code === 0 && /does not know about: Utils\.gs/.test(r.output) && !w.state().files.some((f) => f.name === 'Utils') &&
              fs.existsSync(path.join(w.backups()[0], 'Utils.gs')), r.output);
        w.close();
    }

    /* Signed out: clasp login runs, then the deploy carries on. */
    {
        const s = freshState();
        s.loggedIn = false;
        const w = await makeWorld(s);
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        const st = w.state();
        check('signed out: signs in once, then deploys',
              r.code === 0 && st.calls.filter((c) => c === 'login').length === 1 && deployment(st, GATE_ID).versionNumber === 32, r.output);
        w.close();
    }

    /* The Apps Script API switched off: says where to switch it on. */
    {
        const s = freshState();
        s.inject.apiDisabled = true;
        const w = await makeWorld(s);
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        check('Apps Script API off: stops and says where to turn it on',
              r.code === 1 && /script\.google\.com\/home\/usersettings/.test(r.output) && !wrote(w.state()).length, r.output);
        w.close();
    }

    /* The wrong thing pasted as the project. */
    {
        const w = await makeWorld(freshState());
        const a = await w.run(['--yes', '--script', 'https://docs.google.com/spreadsheets/d/1SheetIdNotAScriptId_abcdefghijkl/edit']);
        const b = await w.run(['--yes', '--script', GATE_ID]);
        const c = await w.run(['--yes', '--script', '1SomeOtherScriptIdThatDoesNotExist_abcdefghij']);
        check('the spreadsheet\'s address pasted by mistake: explained', a.code === 1 && /spreadsheet's address/.test(a.output), a.output);
        check('the deployment ID pasted by mistake: explained', b.code === 1 && /deployment address, not the project/.test(b.output), b.output);
        check('a script ID this account cannot see: explained', c.code === 1 && /could not find an Apps Script project/.test(c.output), c.output);
        check('…and none of the three changed anything', !wrote(w.state()).length);
        w.close();
    }

    /* No terminal to ask in, and no --yes: stops before uploading. */
    {
        const w = await makeWorld(freshState());
        const r = await w.run(['--script', SCRIPT_ID]);
        check('no terminal and no --yes: stops at the question, uploads nothing',
              r.code === 1 && /no terminal to ask in/.test(r.output) && !wrote(w.state()).length, r.output);
        w.close();
    }

    /* Deployed, but the web app does not confirm it. */
    {
        const s = freshState();
        s.inject.webAppDown = true;
        const w = await makeWorld(s);
        const r = await w.run(['--yes', '--script', SCRIPT_ID]);
        check('web app does not confirm: says so, exits 1, and gives the rollback',
              r.code === 1 && /did not confirm the new files/.test(r.output) && /--rollback 31/.test(r.output), r.output);
        w.close();
    }

    console.log('\n' + (failures ? failures + ' failure(s)' : 'all checks passed'));
    process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
