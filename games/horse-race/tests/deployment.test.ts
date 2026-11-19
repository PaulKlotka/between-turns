import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
test('deployment targets only the dedicated project and runtime',()=>{
 const project=JSON.parse(readFileSync('.firebaserc','utf8'));
 assert.equal(project.projects.default,'horse-race-paul');
 const env=readFileSync('functions/.env.example','utf8');
 assert.match(env,/HORSE_RACE_RUNTIME_SERVICE_ACCOUNT=horse-race-runtime@horse-race-paul\.iam\.gserviceaccount\.com/);
 assert.doesNotMatch(env,/roll-race-paul/);
 assert.equal(existsSync('firebase.shared-project.json'),false);
 const config=JSON.parse(readFileSync('firebase.json','utf8'));
 assert.ok(config.functions[0].predeploy.includes('node scripts/check-project.mjs'));
 assert.ok(config.hosting.predeploy.includes('node scripts/check-project.mjs'));
});
test('deployment hook rejects other projects and unspecified targets',()=>{
 for(const selected of ['roll-race-paul','between-turns-paul','rpg-rewards-paul','']){
  const run=spawnSync(process.execPath,['scripts/check-project.mjs'],{env:{...process.env,GCLOUD_PROJECT:selected},encoding:'utf8'});
  assert.equal(run.status,1);assert.match(run.stderr,/requires dedicated project/);
 }
 const run=spawnSync(process.execPath,['scripts/check-project.mjs'],{env:{...process.env,GCLOUD_PROJECT:'horse-race-paul'},encoding:'utf8'});
 assert.equal(run.status,0);
});
