import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HubService } from '../../between-turns/functions/src/service';
import { FirestoreStore } from '../../between-turns/functions/src/store';
import { Identities } from '../../between-turns/functions/src/identity';
import { IntegratedRewards } from '../../rpg-rewards/functions/src/integrated-service';
import { RaceService } from '../functions/src/service';
import type { IntegrationGateway } from '../functions/src/integration-gateway';
import type { CentralContext, Race } from '../functions/src/race';
import type { Grant, SessionView } from '../../between-turns/shared/types';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const app=initializeApp({projectId:'demo-roll-race'});const db=getFirestore(app);
const hubRequire=createRequire(new URL('../../between-turns/functions/package.json', import.meta.url));hubRequire('firebase-admin/app').initializeApp({projectId:'demo-roll-race'});
test('hub grant, actual rewards settlement and central next-game selection',async()=>{
 const apps=[{id:'roll-race',kind:'game' as const,origin:'https://race.example'},{id:'rpg-rewards',kind:'rewards' as const,origin:'https://rewards.example',embedUrl:'https://rewards.example/embed'}];
 const hub=new HubService(new FirestoreStore(),[{id:'roll-race',name:'Race',description:'Race',ready:true,embedUrl:'https://race.example/embed'}],apps);
 const rh={exchange:async(token:string,nonce:string)=>hub.game('rpg-rewards',{action:'exchange',token,nonce}) as any,context:async(sessionId:string,playerId:string,runId?:string,gameId?:string)=>hub.game('rpg-rewards',{action:'context',sessionId,playerId,...(runId?{runId,gameId}:{})}) as any,activity:async(sessionId:string,playerId:string,eventId:string)=>hub.game('rpg-rewards',{action:'activity',sessionId,playerId,eventId})};
 const rewards=new IntegratedRewards(db,rh);let lose=true;let loseCompletion=true;
 const gateway:IntegrationGateway={exchange:async(token,nonce)=>hub.game('roll-race',{action:'exchange',token,nonce}) as Promise<CentralContext>,context:async c=>hub.game('roll-race',{action:'context',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId}) as Promise<CentralContext>,activity:async(c,eventId)=>hub.game('roll-race',{action:'activity',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId,eventId}),draw:async c=>rewards.game('roll-race',{action:'draw',sessionId:c.sessionId,playerId:c.playerId,runId:c.runId,requestId:hash(`offer/${c.playerId}/${c.runId}`)}) as any,settle:async(c,offerId,winnerIds)=>{const result=await rewards.game('roll-race',{action:'settle',sessionId:c.sessionId,runId:c.runId,offerId,winnerIds,requestId:hash(`settle/${c.runId}`)}) as {receipt:string};if(lose){lose=false;throw Error('Lost settlement response');}return result;},complete:async(c,eventId,winnerIds,rewardsReceipt)=>{const result=await hub.game('roll-race',{action:'complete',sessionId:c.sessionId,runId:c.runId,eventId,winnerIds,rewardsReceipt});if(loseCompletion){loseCompletion=false;throw Error('Lost completion response');}return result;}};
 const service=new RaceService(db,gateway),player=`player-${randomUUID()}`;
 const created=await hub.player(player,{action:'create',name:'Player',requestId:randomUUID()}) as SessionView; const sessionId=created.session.id;
 await hub.player(player,{action:'start',sessionId,requestId:randomUUID()});const runId=((await hub.player(player,{action:'current'})) as SessionView).session.run!.id;
 const nonce=randomUUID(),begin=await service.begin(nonce),grant=await hub.player(player,{action:'connect',sessionId,appId:'roll-race',runId,nonce}) as Grant; let credential=begin.credential;
 const initial=await service.connect(credential,nonce,grant.token);assert.equal(initial.phase,'playing');assert.ok(initial.offer);assert.ok(!JSON.stringify(initial).includes('challenges'));
 const identities=new Identities(new FirestoreStore()); const claim=await identities.prepare(player); const accountId='google-'+player; await identities.signIn('signed-'+player,{accountId,displayName:'Google Player',photoURL:null},claim.token);
 await assert.rejects(()=>service.command(credential,{action:'view'}),/Identity changed/); const nonce2=randomUUID(),begin2=await service.begin(nonce2),grant2=await hub.player(player,{action:'connect',sessionId,appId:'roll-race',runId,nonce:nonce2}) as Grant; credential=begin2.credential; await service.connect(credential,nonce2,grant2.token);
 const ref=db.doc(`races/${hash(`${sessionId}/${runId}`)}`);const race=(await ref.get()).data() as Race;const challenge={kind:'exact' as const,min:7,max:7,label:'Roll exactly 7'};
 await ref.update({challenges:[challenge,challenge,challenge],index:2});
 const result=await service.command(credential,{action:'roll',rolls:[7],requestId:'winning'});assert.equal(result.phase,'settling');assert.equal(result.last?.results.length,1);
 assert.equal(((await hub.player(player,{action:'current'})) as SessionView).session.run?.id,runId);
 const awards=await db.collection(`centralSessions/${sessionId}/awards`).get(); assert.equal(awards.size,1); assert.equal(awards.docs[0].get('accountId'),accountId);
 const context={version:1 as const,playerId:player,displayName:'Player',sessionId,runId,expiresAt:Date.now()+100000};
 await assert.rejects(()=>service.progress(context),/Lost completion/);
 await service.progress(context);
 const current=await hub.player(player,{action:'current'}) as SessionView;assert.notEqual(current.session.run?.id,runId);assert.equal(current.session.history.at(-1)?.winnerIds[0],player);
 const finalAwards=await db.collection(`centralSessions/${sessionId}/awards`).get(); assert.equal(finalAwards.size,1); assert.equal(finalAwards.docs[0].get('accountId'),accountId);assert.equal((await ref.get()).get('phase'),'complete');
});







