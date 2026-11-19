import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {HubService} from '../../../apps/hub/functions/src/service';
import {FirestoreStore} from '../../../apps/hub/functions/src/store';
import {Identities} from '../../../apps/hub/functions/src/identity';
import {IntegratedRewards} from '../../../apps/rpg-rewards/functions/src/integrated-service';
import {RaceService} from '../functions/src/service';
import type {IntegrationGateway} from '../functions/src/integration-gateway';
import type {CentralContext} from '../functions/src/race';
import type {SessionView,Grant} from '../../../apps/hub/shared/types';
const require=createRequire(new URL('../../../apps/hub/functions/package.json',import.meta.url));
const {getApp,initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const db=getFirestore(initializeApp({projectId:'demo-between-turns'}), 'push-your-luck');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function fixture(){
 let now=Date.now(),loseSettlement=true,loseCompletion=true;
 const apps=[{id:'push-your-luck',kind:'game' as const,origin:'https://luck.example'},{id:'rpg-rewards',kind:'rewards' as const,origin:'https://rewards.example',embedUrl:'https://rewards.example/embed'}];
 const hub=new HubService(new FirestoreStore(),[{id:'push-your-luck',name:'Push Your Luck',description:'Treasure race',ready:true,embedUrl:'https://luck.example/embed'}],apps,()=>now);
 const rh={exchange:async(token:string,nonce:string)=>hub.game('rpg-rewards',{action:'exchange',token,nonce}) as any,context:async(sessionId:string,playerId:string,runId?:string,gameId?:string)=>hub.game('rpg-rewards',{action:'context',sessionId,playerId,...(runId?{runId,gameId}:{})}) as any,activity:async(sessionId:string,playerId:string,eventId:string)=>hub.game('rpg-rewards',{action:'activity',sessionId,playerId,eventId})};
 const rewards=new IntegratedRewards(getFirestore(getApp(), 'rpg-rewards'),rh,()=>now);
 const gateway:IntegrationGateway={exchange:async(token,nonce)=>hub.game('push-your-luck',{action:'exchange',token,nonce}) as Promise<CentralContext>,context:async c=>hub.game('push-your-luck',{action:'context',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId}) as Promise<CentralContext>,activity:async(c,eventId)=>hub.game('push-your-luck',{action:'activity',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId,eventId}),draw:async c=>rewards.game('push-your-luck',{action:'draw',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId,requestId:hash(`offer/${c.playerId}/${c.runId}`)}) as any,settle:async(c,offerId,winnerIds)=>{const result=await rewards.game('push-your-luck',{action:'settle',sessionId:c.sessionId,runId:c.runId,offerId,winnerIds,requestId:hash(`settle/${c.runId}`)}) as {receipt:string};if(loseSettlement){loseSettlement=false;throw Error('lost settlement');}return result;},complete:async(c,eventId,winnerIds,rewardsReceipt)=>{const result=await hub.game('push-your-luck',{action:'complete',sessionId:c.sessionId,runId:c.runId,eventId,winnerIds,rewardsReceipt});if(loseCompletion){loseCompletion=false;throw Error('lost completion');}return result;}};
 const service=new RaceService(db,gateway,()=>now),player=`player-${randomUUID()}`;
 const created=await hub.player(player,{action:'create',name:'Player',requestId:randomUUID()}) as SessionView;const sid=created.session.id;
 await hub.player(player,{action:'presence',sessionId:sid,connectionId:'tab',connected:true});
 await hub.player(player,{action:'start',sessionId:sid,requestId:randomUUID()});const runId=((await hub.player(player,{action:'current'})) as SessionView).session.run!.id;
 async function connect(uid=player){const nonce=randomUUID(),begin=await service.begin(nonce),grant=await hub.player(uid,{action:'connect',sessionId:sid,appId:'push-your-luck',runId,nonce}) as Grant;await service.connect(begin.credential,nonce,grant.token);return begin.credential;}
 const credential=await connect();
 return {hub,service,connect,player,sid,runId,credential,ref:db.doc(`races/${hash(`${sid}/${runId}`)}`),advance:()=>now+=15000,db};
}
test('real hub handoff and account Rewards settlement survive lost responses and advance game once',async()=>{
 const f=await fixture(),identities=new Identities(new FirestoreStore(),()=>Date.now());const claim=await identities.prepare(f.player),accountId='google-'+f.player;
 await identities.signIn('signed-'+f.player,{accountId,displayName:'Google Player',photoURL:null},claim.token);
 await assert.rejects(()=>f.service.command(f.credential,{action:'view'}),/Identity changed/);
 const credential=await f.connect();await f.ref.update({'players':{[f.player]:{id:f.player,name:'Google Player',banked:0,atRisk:110,skipNext:false}}});
 const result=await f.service.command(credential,{action:'bank',requestId:'win'});assert.equal(result.phase,'review');
 f.advance();await f.service.maintain();assert.equal(((await f.hub.player(f.player,{action:'current'})) as SessionView).session.run?.id,f.runId);
 const awards=await db.collection(`centralSessions/${f.sid}/awards`).get();assert.equal(awards.size,1);assert.equal(awards.docs[0].get('accountId'),accountId);
 await f.service.maintain();await f.service.maintain();const current=await f.hub.player(f.player,{action:'current'}) as SessionView;
 assert.notEqual(current.session.run?.id,f.runId);assert.deepEqual(current.session.history.at(-1)?.winnerIds,[f.player]);assert.equal((await db.collection(`centralSessions/${f.sid}/awards`).get()).size,1);assert.equal((await f.ref.get()).get('phase'),'complete');
});
test('late member starts zero, mode upgrades and exact tied winners get same real reward',async()=>{
 const f=await fixture();await f.service.command(f.credential,{action:'roll',roll:8,requestId:'first'});
 const other='other-'+randomUUID();const state=await f.hub.player(f.player,{action:'current'}) as SessionView;
 await f.hub.player(other,{action:'join',code:state.session.code,name:'Other',requestId:randomUUID()});
 await f.hub.player(other,{action:'presence',sessionId:f.sid,connectionId:'other-tab',connected:true});const second=await f.connect(other);
 const joined=await f.service.command(second,{action:'view'});assert.equal(joined.mode,'multiplayer');assert.equal(joined.players.find(p=>p.id===other)?.atRisk,0);
 await f.ref.update({[`players.${f.player}.atRisk`]:90,[`players.${other}.atRisk`]:90});
 const won=await f.service.command(second,{action:'roll',roll:20,requestId:'win'});assert.deepEqual(won.winnerIds,[f.player,other].sort());f.advance();
 await f.service.maintain();await f.service.maintain();await f.service.maintain();
 const awards=await db.collection(`centralSessions/${f.sid}/awards`).get();assert.equal(awards.size,2);assert.equal(new Set(awards.docs.map((d:any)=>d.get('reward.id'))).size,1);
 const current=await f.hub.player(f.player,{action:'current'}) as SessionView;assert.deepEqual([...current.session.history.at(-1)!.winnerIds].sort(),[f.player,other].sort());
});
test('solo failure completes through real hub without granting a reward',async()=>{
 const f=await fixture();await f.ref.update({rollCount:9});const loss=await f.service.command(f.credential,{action:'roll',roll:2,requestId:'last'});assert.equal(loss.phase,'review');assert.deepEqual(loss.winnerIds,[]);f.advance();await f.service.maintain();await f.service.maintain();
 assert.equal((await db.collection(`centralSessions/${f.sid}/awards`).get()).size,0);const state=await f.hub.player(f.player,{action:'current'}) as SessionView;assert.deepEqual(state.session.history.at(-1)?.winnerIds,[]);assert.notEqual(state.session.run?.id,f.runId);
});
