import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { deploymentTargets } from './project.mjs';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const config = JSON.parse(read('firebase.json'));
const aliases = JSON.parse(read('.firebaserc'));
const apps = JSON.parse(read('scripts/apps.json'));

test('deploy selectors isolate each component and keep database changes explicit', () => {
  assert.equal(aliases.projects.default, 'demo-between-turns');
  assert.equal(aliases.projects.production, 'between-turns-paul');
  assert.deepEqual(deploymentTargets('horse-race', 'all'), ['functions:horse-race', 'hosting:horse-race']);
  assert.deepEqual(deploymentTargets('rpg-rewards', 'functions'), ['functions:rewards']);
  assert.deepEqual(deploymentTargets('all', 'data'), ['firestore:rules', 'firestore:indexes']);
  assert.throws(() => deploymentTargets('another-project', 'all'));
  assert.throws(() => deploymentTargets('horse-race', 'data'));
});

test('Firestore, Hosting, and Functions remain isolated by component', () => {
  assert.equal(new Set(config.firestore.map(config => config.database)).size, Object.keys(apps).length);
  assert.equal(new Set(config.functions.map(config => config.codebase)).size, Object.keys(apps).length);
  assert.equal(new Set(Object.values(aliases.targets['between-turns-paul'].hosting).flat()).size, Object.keys(apps).length);
  const exports = new Set();
  for (const [id, app] of Object.entries(apps)) {
    const source = read(app.dir + '/functions/src/index.ts');
    const hosting = config.hosting.find(site => site.target === id);
    const database = id === 'hub' ? '(default)' : id;
    assert.equal(hosting.public, app.dir + '/dist');
    assert.equal(config.firestore.find(item => item.database === database).rules, app.dir + '/firestore.rules');
    if (id !== 'hub') assert.ok(source.includes("getFirestore(getApp(), '" + id + "')"));
    const names = [...source.matchAll(/export const (\w+)\s*=\s*on(?:Call|Request|Schedule)\(/g)].map(match => match[1]);
    assert.ok(names.length > 0, id);
    for (const name of names) {
      assert.ok(!exports.has(name), name + ' is deployed by more than one codebase');
      exports.add(name);
    }
    for (const entry of hosting.rewrites) {
      if (entry.function) assert.ok(names.includes(entry.function.functionId), entry.function.functionId);
    }
  }
});
