/*
 * A fake clasp, for tests/deploy-sim.js. auth/apps-script/deploy.mjs runs
 * this instead of the real one when AISA_CLASP points at it.
 *
 * It keeps a pretend Apps Script project in the JSON file named by
 * FAKE_CLASP_STATE: its files, its versions, its deployments, who is signed
 * in, and a log of every command. It does what the real clasp 3.4.1 does
 * with the commands deploy.mjs uses, including the parts that matter:
 *
 *   - push uploads only if some local file is new or changed, and then
 *     REPLACES every file in the project (the Apps Script API's
 *     updateContent), so a file that exists only in the project goes;
 *   - update-deployment without --versionNumber makes a new version first;
 *   - create-deployment is refused and logged, because deploy.mjs must
 *     never call it: a new deployment is a new URL.
 *
 * `inject` in the state file makes Google misbehave: apiDisabled (pull and
 * list-deployments fail as they do when the Apps Script API is switched off)
 * and dropOnPush (a file name the upload quietly loses).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const statePath = process.env.FAKE_CLASP_STATE;
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

const args = process.argv.slice(2);
let json = false, projectFile = null;
const rest = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') json = true;
    else if (args[i] === '-P') projectFile = args[++i];
    else rest.push(args[i]);
}
const command = rest[0];
state.calls.push(rest.join(' '));
save();

function fail(message) { process.stderr.write(message + '\n'); process.exit(1); }
function out(value) { process.stdout.write((json ? JSON.stringify(value, null, 2) : String(value)) + '\n'); }
function flag(name) { const i = rest.indexOf(name); return i === -1 ? undefined : rest[i + 1]; }

function project() {
    const file = projectFile || path.join(process.cwd(), '.clasp.json');
    if (!fs.existsSync(file)) fail('Project settings not found.');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!state.loggedIn) fail('No credentials found.');
    if (state.inject.apiDisabled) {
        fail('User has not enabled the Apps Script API. Enable it by visiting ' +
             'https://script.google.com/home/usersettings then retry.');
    }
    if (cfg.scriptId !== state.scriptId) fail('Requested entity was not found.');
    return { dir: path.dirname(file), ext: (cfg.scriptExtensions || ['.js'])[0] };
}

function localFiles(dir) {
    return fs.readdirSync(dir).map((n) => {
        const src = fs.readFileSync(path.join(dir, n), 'utf8');
        if (n === 'appsscript.json') return { name: 'appsscript', type: 'JSON', source: src };
        const m = /^(.*)\.(gs|js|html)$/.exec(n);
        if (!m) return null;
        return { name: m[1], type: m[2] === 'html' ? 'HTML' : 'SERVER_JS', source: src };
    }).filter(Boolean);
}

switch (command) {
    case 'show-authorized-user':
        out(state.loggedIn ? { loggedIn: true, email: state.email } : { loggedIn: false });
        break;

    case 'login':
        state.loggedIn = true;
        save();
        out('You are logged in as ' + state.email + '.');
        break;

    case 'pull': {
        const p = project();
        const pulled = state.files.map((f) => {
            const file = f.type === 'JSON' ? 'appsscript.json' : f.name + (f.type === 'HTML' ? '.html' : p.ext);
            fs.writeFileSync(path.join(p.dir, file), f.source);
            return file;
        });
        out(json ? { pulledFiles: pulled, deletedFiles: [] } : 'Pulled ' + pulled.length + ' files.');
        break;
    }

    case 'push': {
        const p = project();
        const local = localFiles(p.dir);
        const changed = local.filter((f) => {
            const remote = state.files.find((r) => r.name === f.name && r.type === f.type);
            return !remote || remote.source !== f.source;
        });
        if (!changed.length) { out(json ? [] : 'Script is already up to date.'); break; }
        if (changed.some((f) => f.type === 'JSON') && rest.indexOf('--force') === -1) {
            fail('Manifest file has been updated. Do you want to push and overwrite? (fake: refused without --force)');
        }
        state.files = local.filter((f) => f.name !== state.inject.dropOnPush);
        save();
        out(json ? local.map((f) => f.name) : 'Pushed ' + local.length + ' files.');
        break;
    }

    case 'list-deployments':
        project();
        out(state.deployments.map((d) => ({ deploymentId: d.deploymentId, versionNumber: d.versionNumber, description: d.description })));
        break;

    case 'update-deployment': {
        project();
        const id = rest[1];
        const dep = state.deployments.find((d) => d.deploymentId === id);
        if (!dep) fail('Requested entity was not found.');
        let version = flag('--versionNumber');
        if (version === undefined) {
            version = state.versions.reduce((m, v) => Math.max(m, v.versionNumber), 0) + 1;
            state.versions.push({ versionNumber: version, files: JSON.parse(JSON.stringify(state.files)) });
        } else {
            version = Number(version);
            if (!state.versions.some((v) => v.versionNumber === version)) fail('Version ' + version + ' not found.');
        }
        dep.versionNumber = version;
        dep.description = flag('--description') || '';
        save();
        out({ deploymentId: id, versionNumber: version, description: dep.description });
        break;
    }

    case 'create-deployment':
    case 'deploy':
        fail('fake clasp: create-deployment called. deploy.mjs must never make a new deployment.');
        break;

    default:
        fail('fake clasp: unexpected command ' + rest.join(' '));
}
