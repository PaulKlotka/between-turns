import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));
const apps = readJson('scripts/apps.json');
const firebase = readJson('firebase.json');
const cli = resolve(root, 'apps/hub/node_modules/firebase-tools/lib/bin/firebase.js');
const project = 'between-turns-paul';
const demo = 'demo-between-turns';

function selectedApps(id) {
  if (id === 'all') return Object.entries(apps);
  if (!Object.hasOwn(apps, id)) throw new Error('Unknown app: ' + id);
  return [[id, apps[id]]];
}

export function deploymentTargets(id, scope) {
  if (scope === 'data' && id === 'all') return ['firestore:rules', 'firestore:indexes'];
  if (!['all', 'functions', 'hosting'].includes(scope)) throw new Error('Use functions, hosting, all, or all data.');
  return selectedApps(id).flatMap(([name, app]) => {
    const codebase = firebase.functions.find(item => item.source === app.dir + '/functions').codebase;
    return [
      ...(scope !== 'hosting' ? ['functions:' + codebase] : []),
      ...(scope !== 'functions' ? ['hosting:' + name] : []),
    ];
  });
}

function run(script, args, cwd = root, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function npm(app, args, env) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this command through npm.');
  run(npmCli, args, resolve(root, app.dir), env);
}

function requireLoopback() {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
    throw new Error('Run integration tests through npm run verify:emulators or set FIRESTORE_EMULATOR_HOST to a local emulator.');
  }
}

async function loadEmulatorRules() {
  requireLoopback();
  const endpoint = 'http://' + process.env.FIRESTORE_EMULATOR_HOST + '/emulator/v1/projects/' + demo + ':securityRules';
  for (const { database, rules } of firebase.firestore) {
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: 'projects/' + demo + '/databases/' + database,
        rules: { files: [{ name: 'firestore.rules', content: readFileSync(resolve(root, rules), 'utf8') }] },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error('Could not load ' + database + ' emulator rules: ' + await response.text());
  }
}

function runTests(id, kind) {
  if (kind === 'integration') requireLoopback();
  for (const [, app] of selectedApps(id)) {
    for (const script of app[kind] ?? []) npm(app, ['run', script], { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true' });
  }
}

function deploy(id, scope, options) {
  const targets = deploymentTargets(id, scope);
  const args = ['deploy', '--config', 'firebase.json', '--project', project, '--non-interactive', '--only', targets.join(',')];
  if (options.length === 1 && options[0] === '--dry-run') {
    console.log('firebase ' + args.join(' '));
    return;
  }
  if (options.length !== 1 || options[0] !== '--apply') {
    throw new Error('Use --dry-run to see targets or --apply after the production preflight.');
  }
  if (scope !== 'data') for (const [name, app] of selectedApps(id)) {
    if (scope !== 'hosting') checkRuntimeEnvironment(name, app);
    if (scope !== 'functions') {
      checkWebEnvironment(name, app);
      npm(app, ['run', 'build'], { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'false' });
    }
  }
  run(cli, args);
}

function readSettings(file) {
  const fullPath = resolve(root, file);
  if (!existsSync(fullPath)) throw new Error('Missing deployment settings: ' + file);
  return parseEnv(readFileSync(fullPath, 'utf8'));
}

function checkRuntimeEnvironment(name, app) {
  const env = readSettings(app.dir + '/functions/.env.' + project);
  const runtime = env[app.runtime + '_RUNTIME_SERVICE_ACCOUNT'];
  if (!/^[a-z][a-z0-9-]+@between-turns-paul\.iam\.gserviceaccount\.com$/.test(runtime ?? '')) {
    throw new Error(name + ' requires a dedicated runtime in ' + project);
  }
  if (!['true', 'false'].includes(env.CUTOVER_WRITES_ENABLED)) throw new Error(name + ' requires an explicit CUTOVER_WRITES_ENABLED value.');
  const outbound = name === 'hub' ? ['GAME_API_AUDIENCE'] :
    name === 'rpg-rewards' ? ['BETWEEN_TURNS_API_URL', 'GAME_API_AUDIENCE'] : ['BETWEEN_TURNS_API_URL', 'REWARDS_GAME_API_URL'];
  for (const key of outbound) {
    if (!env[key] || new URL(env[key]).protocol !== 'https:') throw new Error(name + ' requires the verified HTTPS value for ' + key);
  }
  if (name !== 'hub') {
    const sites = readJson('.firebaserc').targets[project].hosting[name];
    const expected = 'https://' + sites[0] + '.web.app';
    if (!env[app.runtime + '_BROWSER_ORIGINS']?.split(',').map(s => s.trim()).includes(expected)) {
      throw new Error(name + ' must allow its configured Hosting origin ' + expected);
    }
  }
}

function checkWebEnvironment(name, app) {
  if (name !== 'hub' && name !== 'rpg-bingo') return;
  const env = readSettings(app.dir + '/.env.production.local');
  if (name === 'hub') {
    if (env.VITE_FIREBASE_PROJECT_ID !== project || !env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_APP_ID || !env.VITE_APPCHECK_SITE_KEY) {
      throw new Error('Hub requires its existing production Firebase Web App and App Check configuration.');
    }
  } else {
    const config = JSON.parse(env.VITE_FIREBASE_CONFIG ?? '{}');
    if (config.projectId !== project || !config.apiKey || !config.appId || !env.VITE_FIREBASE_APPCHECK_SITE_KEY) {
      throw new Error('Bingo requires a production Firebase Web App and App Check configuration in ' + project);
    }
  }
}

function emulate(suite, id) {
  selectedApps(id);
  for (const [, app] of selectedApps('all')) {
    if (suite === 'browser' || suite === null) npm(app, ['run', 'build'], { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true' });
    else npm(app, ['--prefix', 'functions', 'run', 'build']);
  }
  const env = {
    ...process.env,
    NODE_USE_SYSTEM_CA: '1',
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? resolve(root, '.firebase-config'),
    FIREBASE_EMULATORS_PATH: process.env.FIREBASE_EMULATORS_PATH ?? resolve(root, '.emulator-cache'),
  };
  const bundledJava = 'C:/Program Files/Android/Android Studio/jbr/bin';
  if (process.platform === 'win32' && existsSync(bundledJava + '/java.exe') && !process.env.JAVA_HOME) {
    env.PATH = bundledJava + ';' + env.PATH;
  }
  const only = suite ? 'auth,firestore,functions' : 'auth,firestore,functions,hosting';
  const args = ['emulators:exec', '--project', demo, '--only', only,
    'node scripts/project.mjs emulator-session ' + id + ' ' + (suite ?? 'serve')];
  run(cli, args, root, env);
}

async function main([task, id = 'all', scope = 'all', ...options]) {
  if (task === 'emulator-session') {
    await loadEmulatorRules();
    if (scope === 'serve') {
      console.log('All database rules loaded. Press Ctrl+C to stop the local emulators.');
      return new Promise(resolve => {
        process.stdin.resume();
        for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { process.stdin.pause(); resolve(); });
      });
    }
    return runTests(id, scope);
  }
  if (task === 'deploy') return deploy(id, scope, options);
  if (['emulators', 'verify', 'verify-browser'].includes(task)) {
    return emulate(task === 'verify-browser' ? 'browser' : task === 'verify' ? 'integration' : null, id);
  }
  if (task === 'integration' || task === 'browser') return runTests(id, task);
  for (const [, app] of selectedApps(id)) {
    if (task === 'install') {
      npm(app, ['ci']);
      npm(app, ['--prefix', 'functions', 'ci']);
    } else if (task === 'build' || task === 'test') {
      const env = task === 'build' ? { ...process.env, VITE_USE_FIREBASE_EMULATORS: 'true' } : process.env;
      npm(app, ['run', task], env);
    } else {
      throw new Error('Unknown task: ' + task);
    }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
