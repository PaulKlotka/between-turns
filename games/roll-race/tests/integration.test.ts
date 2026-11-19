import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { RaceService } from '../functions/src/service';
import type { CentralContext, Race } from '../functions/src/race';
import type { IntegrationGateway } from '../functions/src/integration-gateway';
initializeApp({projectId:'demo-between-turns'}); const db=getFirestore(getApp(), 'roll-race');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const ctx=(playerId:string):CentralContext=>({version:1,sessionId:'session',runId:'run',playerId,displayName:playerId,memberCount:1,expiresAt:Date.now()+3600000});
test('concurrent winning requests serialize and settlement retries without duplicate award',async()=>{
 let fail=true;let awards=0;let completes=0;let savedReceipt='';
 const gateway:IntegrationGateway={exchange:async()=>ctx('one'),context:async c=>c,activity:async()=>({accepted:true}),draw:async()=>({id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}}),settle:async()=>{if(!savedReceipt){awards++;savedReceipt='receipt';}if(fail){fail=false;throw Error('lost response');}return {receipt:savedReceipt};},complete:async()=>{completes++;return {ok:true};}};
 const service=new RaceService(db,gateway);const credentials=['A'.repeat(43),'B'.repeat(43)];
 for(let i=0;i<2;i++)await db.doc(`connections/${hash(credentials[i])}`).set({nonce:'nonce',expiresAt:Date.now()+3600000,context:ctx(i?'two':'one'),connecting:false});
 const ref=db.doc(`races/${hash('session/run')}`);const challenge={kind:'exact' as const,min:7,max:7,label:'Roll exactly 7'};
 const race:Race={sessionId:'session',runId:'run',challenges:[challenge,challenge,challenge],index:2,phase:'playing',offer:{id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}},revision:0,last:null,settlement:null};await ref.set(race);
 const results=await Promise.allSettled(credentials.map((credential,i)=>service.command(credential,{action:'roll',rolls:[7],requestId:`request${i}`})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const after=(await ref.get()).data() as Race;assert.ok(['one','two'].includes(after.settlement!.winnerId));assert.equal(after.last!.results.length,1);assert.equal(awards,1);
 await service.maintain();const finished=(await ref.get()).data() as Race;assert.equal(finished.phase,'complete');assert.equal(awards,1);assert.equal(completes,1);
 await assert.rejects(()=>service.command(credentials[1],{action:'roll',rolls:[7],requestId:'late'}));
});
test('submission receipts deduplicate retries and reject changed payloads',async()=>{
 const c={...ctx('p'),sessionId:'receipt-session',runId:'receipt-run'};
 const gateway:IntegrationGateway={exchange:async()=>c,context:async()=>c,activity:async()=>({accepted:true}),draw:async()=>({id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}}),settle:async()=>({receipt:'receipt'}),complete:async()=>({ok:true})};
 const service=new RaceService(db,gateway); const credential='C'.repeat(43);await db.doc(`connections/${hash(credential)}`).set({nonce:'nonce',expiresAt:Date.now()+3600000,context:c,connecting:false});
 const ref=db.doc(`races/${hash('receipt-session/receipt-run')}`);const ch={kind:'exact' as const,min:1,max:1,label:'Roll exactly 1'};
 await ref.set({sessionId:c.sessionId,runId:c.runId,challenges:[ch,ch,ch],index:0,phase:'playing',offer:{id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}},revision:0,last:null,settlement:null} satisfies Race);
 await Promise.all([service.command(credential,{action:'roll',rolls:[1],requestId:'same'}),service.command(credential,{action:'roll',rolls:[1],requestId:'same'})]);
 assert.equal((await ref.get()).get('index'),1);await assert.rejects(()=>service.command(credential,{action:'roll',rolls:[2],requestId:'same'}));assert.equal((await ref.get()).get('index'),1);
});

test('review ignores other submissions and winner undo prevents settlement',async()=>{
 const base={...ctx('a'),sessionId:'review-session',runId:'review-run',memberCount:2};let now=1000,awards=0,completes=0;
 const gateway:IntegrationGateway={exchange:async()=>base,context:async c=>({...c,memberCount:2}),activity:async()=>({accepted:true}),draw:async()=>({id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}}),settle:async()=>{awards++;return {receipt:'receipt'};},complete:async()=>{completes++;return {ok:true}}};
 const service=new RaceService(db,gateway,()=>now),credentials=['D'.repeat(43),'E'.repeat(43)];
 for(let i=0;i<2;i++)await db.doc(`connections/${hash(credentials[i])}`).set({nonce:'nonce',expiresAt:999999,context:{...base,playerId:i?'b':'a'},connecting:false});
 const ref=db.doc(`races/${hash('review-session/review-run')}`),ch={kind:'exact' as const,min:7,max:7,label:'Roll exactly 7'};
 await ref.set({sessionId:base.sessionId,runId:base.runId,challenges:[ch,ch,ch],index:2,phase:'playing',offer:{id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}},revision:0,last:null,settlement:null} satisfies Race);
 const win=await service.command(credentials[0],{action:'roll',rolls:[7],requestId:'win'});assert.equal(win.phase,'review');assert.equal(win.canUndo,true);assert.equal(win.last?.results.length,1);
 const ignored=await service.command(credentials[1],{action:'roll',rolls:[7],requestId:'ignored'});assert.equal(ignored.phase,'review');assert.equal(awards,0);
 const restored=await service.command(credentials[0],{action:'undo',requestId:'undo'});assert.equal(restored.phase,'playing');assert.equal((await ref.get()).get('index'),2);assert.equal(awards,0);
 await service.command(credentials[1],{action:'roll',rolls:[7],requestId:'ignored'});assert.equal((await ref.get()).get('index'),2);
 const wonAgain=await service.command(credentials[1],{action:'roll',rolls:[7],requestId:'win2'});assert.equal(wonAgain.phase,'review');now=15999;await service.progress(base);assert.equal(awards,0);now=16000;await service.progress(base);assert.equal(awards,1);assert.equal(completes,1);
});

test('undo and another player roll are serialized without reversing a later roll',async()=>{
 const base={...ctx('a'),sessionId:'race-condition',runId:'race-condition-run',memberCount:2};const gateway:IntegrationGateway={exchange:async()=>base,context:async c=>({...c,memberCount:2}),activity:async()=>({accepted:true}),draw:async()=>({id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}}),settle:async()=>({receipt:'receipt'}),complete:async()=>({ok:true})};
 const service=new RaceService(db,gateway),credentials=['F'.repeat(43),'G'.repeat(43)];for(let i=0;i<2;i++)await db.doc(`connections/${hash(credentials[i])}`).set({nonce:'nonce',expiresAt:Date.now()+3600000,context:{...base,playerId:i?'b':'a'},connecting:false});
 const ref=db.doc(`races/${hash('race-condition/race-condition-run')}`),ch=(n:number)=>({kind:'exact' as const,min:n,max:n,label:`Roll exactly ${n}`});await ref.set({sessionId:base.sessionId,runId:base.runId,challenges:[ch(1),ch(2),ch(3)],index:0,phase:'playing',offer:{id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use'}},revision:0,last:null,settlement:null} satisfies Race);
 await service.command(credentials[0],{action:'roll',rolls:[1],requestId:'first'});const results=await Promise.allSettled([service.command(credentials[0],{action:'undo',requestId:'undo'}),service.command(credentials[1],{action:'roll',rolls:[2],requestId:'next'})]);const state=(await ref.get()).data() as Race;assert.equal(results[1].status,'fulfilled');assert.equal(state.last?.playerId,'b');if(results[0].status==='fulfilled'){assert.equal(state.index,0);assert.equal(state.last?.results[0].success,false);}else{assert.equal(state.index,2);assert.equal(state.last?.results[0].success,true);}
});
