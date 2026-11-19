import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {getApp,initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
import {createHash,randomUUID} from 'node:crypto';
import {RaceService} from '../functions/src/service';
import {makeRace,syncMembers,type CentralContext,type Race} from '../functions/src/race';
import type {IntegrationGateway} from '../functions/src/integration-gateway';
import {HubService} from '../../../apps/hub/functions/src/service';
import {MemoryStore} from '../../../apps/hub/tests/helpers';
import {IntegratedRewards} from '../../../apps/rpg-rewards/functions/src/integrated-service';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Integration tests require the local Firestore emulator.');
initializeApp({projectId:'demo-between-turns'});const db=getFirestore(getApp(), 'horse-race');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function setup(label:string,hits=0){
 label+='-'+randomUUID();
 let now=1000,failSettlement=false,awards=0,completions=0,connected=true,accountId:string|null=null;
 let members=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];const c:CentralContext={version:1,sessionId:label,runId:label,playerId:'c',displayName:'C',expiresAt:999999,memberCount:3,members,accountId:null};
 const winnerCalls:string[][]=[];let receipt='';
 const gateway:IntegrationGateway={exchange:async()=>c,context:async original=>{if(!connected)throw Object.assign(Error('ended'),{code:'permission-denied'});return {...original,accountId,members,memberCount:members.length};},activity:async()=>({accepted:true}),draw:async()=>({id:'offer-'+label,reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}}),settle:async(_c,_id,ids)=>{winnerCalls.push(ids);if(!receipt){awards+=ids.length;receipt='receipt';}if(failSettlement){failSettlement=false;throw Error('response lost');}return {receipt};},complete:async()=>{completions++;return {accepted:true};}};
 const service=new RaceService(db,gateway,()=>now),credentials=['A'.repeat(43),'B'.repeat(43),'C'.repeat(43)].map(s=>s.slice(0,40)+label.slice(0,3).padEnd(3,'x'));
 for(let i=0;i<3;i++)await db.doc(`horseConnections/${hash(credentials[i])}`).set({nonce:'nonce',expiresAt:999999,context:{...c,playerId:members[i].id,displayName:members[i].name},connecting:false});
 const ref=db.doc(`horseRaces/${hash(`${label}/${label}`)}`);let race=syncMembers(makeRace(label,label),members,()=>0);race.players[0].hits=hits;race.players[1].hits=hits;race.players[2].numbers=[10,11,12,13];race.offer=await gateway.draw(c);await ref.set(race);
 return {service,credentials,ref,c,winnerCalls,get awards(){return awards},get completions(){return completions},set now(n:number){now=n},set failSettlement(f:boolean){failSettlement=f},set connected(b:boolean){connected=b},set accountId(s:string|null){accountId=s},set members(m:typeof members){members=m}};
}
test('concurrent shared winning rolls freeze one result and durable reward retries preserve both winners',async()=>{const f=await setup('winning',9);f.failSettlement=true;const results=await Promise.all(f.credentials.map((credential,i)=>f.service.command(credential,{action:'roll',rolls:[1],requestId:`win${i}`})));assert.ok(results.every(r=>r.phase==='review'));let r=(await f.ref.get()).data() as Race;assert.deepEqual(r.players.map(p=>p.hits),[10,10,0]);assert.deepEqual(r.settlement?.winnerIds,['a','b']);assert.equal(f.awards,0);f.now=16000;await assert.rejects(()=>f.service.progress(f.c));assert.equal(f.awards,2);await f.service.maintain();r=(await f.ref.get()).data() as Race;assert.equal(r.phase,'complete');assert.equal(f.awards,2);assert.equal(f.completions,1);assert.ok(f.winnerCalls.every(ids=>JSON.stringify(ids)==='["a","b"]'));});
test('concurrent duplicate commands award each matching horse once; changed payload rejected',async()=>{const f=await setup('receipts');const command={action:'roll',rolls:[1],requestId:'same'};await Promise.all([f.service.command(f.credentials[2],command),f.service.command(f.credentials[2],command)]);assert.deepEqual((await f.ref.get()).get('players').map((p:{hits:number})=>p.hits),[1,1,0]);await assert.rejects(()=>f.service.command(f.credentials[2],{...command,rolls:[2]}));});
test('undo and a peer roll serialize without losing later hits',async()=>{const f=await setup('undo');await f.service.command(f.credentials[0],{action:'roll',rolls:[1],requestId:'first'});const results=await Promise.allSettled([f.service.command(f.credentials[0],{action:'undo',requestId:'undo'}),f.service.command(f.credentials[2],{action:'roll',rolls:[1],requestId:'peer'})]);assert.equal(results[1].status,'fulfilled');const r=(await f.ref.get()).data() as Race;assert.equal(r.last?.playerId,'c');assert.equal(r.players[0].hits,results[0].status==='fulfilled'?1:2);assert.equal(r.players[1].hits,r.players[0].hits);});
test('refresh retains numbers; late roster members are added without opening the game',async()=>{const f=await setup('roster');const before=(await f.ref.get()).get('players');f.members=[...f.c.members!,{id:'late',name:'Late'}];const v=await f.service.command(f.credentials[2],{action:'view'});assert.equal(v.players.length,4);assert.deepEqual(v.players.slice(0,3),before);const late=v.players.find(p=>p.id==='late')!;await f.service.command(f.credentials[2],{action:'roll',rolls:[late.numbers[0]],requestId:'roll'});assert.equal((await f.ref.get()).get('players').find((p:{id:string})=>p.id==='late').hits,1);});
test('identity changes, ended runs and expired connections cannot submit',async()=>{const f=await setup('auth');f.accountId='changed';await assert.rejects(()=>f.service.command(f.credentials[2],{action:'view'}),/Identity changed/);f.accountId=null;f.connected=false;await assert.rejects(()=>f.service.command(f.credentials[2],{action:'view'}),/ended/);f.connected=true;f.now=1000000;await assert.rejects(()=>f.service.command(f.credentials[2],{action:'view'}),/reconnect/);});
test('server-bound connection exchanges once and refuses mismatched nonce',async()=>{const f=await setup('connect');const {credential}=await f.service.begin('nonce');await assert.rejects(()=>f.service.connect(credential,'wrong','grant'));const view=await f.service.connect(credential,'nonce','grant');assert.equal(view.players.length,3);await assert.rejects(()=>f.service.connect(credential,'nonce','grant'));});
test('real hub and Rewards services record two tied awards, account ownership, history and next-game transition',async()=>{
 let now=Date.now();const store=new MemoryStore();
 const hub=new HubService(store,[{id:'horse-race',name:'Horse Race',description:'Race',ready:true,embedUrl:'https://horse-race-paul.web.app/embed'}],[{id:'horse-race',kind:'game',origin:'https://horse-race-paul.web.app'},{id:'rpg-rewards',kind:'rewards',origin:'https://rpg-rewards-paul.web.app'}],()=>now,()=>0);
 const created:any=await hub.player('a',{action:'create',name:'A',requestId:randomUUID()});
 for(const playerId of ['b','c'])await hub.player(playerId,{action:'join',name:playerId.toUpperCase(),code:created.session.code,requestId:randomUUID()});
 store.data.set('identities/a',{accountId:'verified-google-account',displayName:'A',photoURL:null,version:1});
 const started:any=await hub.player('a',{action:'start',sessionId:created.session.id,requestId:randomUUID()});const sessionId=created.session.id,runId=started.session.run.id;
 const rewardsDb = getFirestore(getApp(), 'rpg-rewards');
 const rewards=new IntegratedRewards(rewardsDb,{
  exchange:async(token,nonce)=>hub.game('rpg-rewards',{action:'exchange',token,nonce}) as any,
  context:async(s,p,r,g)=>hub.game('rpg-rewards',{action:'context',sessionId:s,playerId:p,...(r?{runId:r,gameId:g}: {})}) as any,
  activity:async(s,p,eventId)=>hub.game('rpg-rewards',{action:'activity',sessionId:s,playerId:p,eventId}),
 },()=>now,()=>0);
 const gateway:IntegrationGateway={
  exchange:async(token,nonce)=>hub.game('horse-race',{action:'exchange',token,nonce}) as any,
  context:async(c)=>hub.game('horse-race',{action:'context',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId}) as any,
  activity:async(c,eventId)=>hub.game('horse-race',{action:'activity',sessionId,playerId:c.playerId,runId,eventId}),
  draw:async(c)=>rewards.game('horse-race',{action:'draw',sessionId,runId,playerId:c.playerId,requestId:hash(`draw/${c.playerId}/${runId}`)}) as any,
  settle:async(_c,offerId,winnerIds)=>rewards.game('horse-race',{action:'settle',sessionId,runId,offerId,winnerIds,requestId:hash(`settle/${runId}`)}) as any,
  complete:async(_c,eventId,winnerIds,rewardsReceipt)=>hub.game('horse-race',{action:'complete',sessionId,runId,eventId,winnerIds,rewardsReceipt}),
 };
 const service=new RaceService(db,gateway,()=>now),nonce='test-nonce';const grant:any=await hub.player('c',{action:'connect',sessionId,runId,appId:'horse-race',nonce});const {credential}=await service.begin(nonce);
 const initial=await service.connect(credential,nonce,grant.token);assert.deepEqual(initial.players.map(p=>p.id).sort(),['a','b','c']);
 const ref=db.doc(`horseRaces/${hash(`${sessionId}/${runId}`)}`);const seeded=(await ref.get()).data() as Race;seeded.players=seeded.players.map(p=>({...p,numbers:p.id==='c'?[10,11,12,13]:[1,2,3,4]}));await ref.set(seeded);
 for(let i=0;i<10;i++)await service.command(credential,{action:'roll',rolls:[1],requestId:randomUUID()});
 assert.equal((await ref.get()).get('phase'),'review');now+=15000;await service.maintain();assert.equal((await ref.get()).get('phase'),'complete');
 const awards=await rewardsDb.collection(`centralSessions/${sessionId}/awards`).get();assert.equal(awards.size,2);assert.deepEqual(awards.docs.map((d:any)=>d.get('playerId')).sort(),['a','b']);assert.equal(awards.docs.find((d:any)=>d.get('playerId')==='a')?.get('accountId'),'verified-google-account');assert.equal(awards.docs.find((d:any)=>d.get('playerId')==='b')?.get('accountId'),null);
 const after:any=await hub.player('c',{action:'current'});assert.deepEqual(after.session.history[0].winnerIds,['a','b']);assert.equal(after.session.history[0].gameId,'horse-race');assert.notEqual(after.session.run.id,runId);
 await assert.rejects(()=>service.command(credential,{action:'view'}),/ended/);
});


