import { createHash, randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { applyRoll, bank, finishReview, makeRace, publicView, syncMembers, undoBank, undoRoll, type CentralContext, type Race } from './race';
import type { IntegrationGateway } from './integration-gateway';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const id=(s:unknown):s is string=>typeof s==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
function ensure(c:unknown,message:string):asserts c {if(!c)throw new HttpsError('failed-precondition',message);}
type Connection={nonce:string;expiresAt:number;context:CentralContext|null;connecting:boolean};
export class RaceService {
 constructor(private db:Firestore,private gateway:IntegrationGateway,private now=Date.now){}
 private ref(c:CentralContext){return this.db.doc(`races/${hash(`${c.sessionId}/${c.runId}`)}`);}
 async begin(nonce:unknown){ensure(id(nonce),'Invalid frame connection.');const credential=randomBytes(32).toString('base64url');await this.db.doc(`connections/${hash(credential)}`).create({nonce,expiresAt:this.now()+60000,context:null,connecting:false});return {credential};}
 async connect(credential:string,nonce:unknown,grant:unknown){
  ensure(/^[A-Za-z0-9_-]{43}$/.test(credential) && id(nonce) && typeof grant==='string' && grant.length>0 && grant.length<=1024,'Invalid connection.');
  const ref=this.db.doc(`connections/${hash(credential)}`);
  await this.db.runTransaction(async tx=>{const c=(await tx.get(ref)).data() as Connection|undefined;ensure(c && c.nonce===nonce && c.expiresAt>this.now() && !c.context && !c.connecting,'Refresh to reconnect.');tx.update(ref,{connecting:true});});
  const context=await this.gateway.exchange(grant,nonce);
  ensure(context.version===1 && id(context.sessionId) && id(context.runId) && id(context.playerId) && context.expiresAt>this.now(),'Invalid central context.');
  await ref.update({context,connecting:false,expiresAt:Math.min(context.expiresAt,this.now()+3600000)});
  return this.command(credential,{action:'view'});
 }
 private async authorize(credential:string){
  ensure(/^[A-Za-z0-9_-]{43}$/.test(credential),'Connect through Between Turns.');
  const connection=(await this.db.doc(`connections/${hash(credential)}`).get()).data() as Connection|undefined;
  ensure(connection?.context && connection.expiresAt>this.now(),'Refresh to reconnect.');
  let c:CentralContext;
  try{c=await this.gateway.context(connection.context);}catch(error){const e=error as {code?:string;response?:{data?:{error?:{code?:string}}}};const code=e.response?.data?.error?.code ?? e.code;if(['permission-denied','failed-precondition','not-found'].includes(code ?? ''))throw new HttpsError('failed-precondition','This race has ended or your session changed. Return to Between Turns.');throw error;}
  ensure((c.accountId ?? null)===(connection.context.accountId ?? null),'Identity changed. Reconnect.');
  ensure(c.sessionId===connection.context.sessionId && c.runId===connection.context.runId && c.playerId===connection.context.playerId && c.expiresAt>this.now(),'Session changed. Reconnect.');
  ensure(Array.isArray(c.members) && c.members.length>=1 && c.members.length<=32 && c.members.every(m=>id(m.id) && typeof m.name==='string' && typeof m.connected==='boolean') && c.members.some(m=>m.id===c.playerId),'The hub roster integration is unavailable.');
  ensure(Number.isInteger(c.connectedCount) && c.connectedCount!>=0 && c.connectedCount!<=c.members.length,'The hub presence integration is unavailable.');
  return c;
 }
 private async ensureRace(c:CentralContext){
  const ref=this.ref(c);
  await this.db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists)tx.create(ref,{...makeRace(c.sessionId,c.runId),expiresAt:c.expiresAt});});
  if(!(await ref.get()).get('offer')){
   const offer=await this.gateway.draw(c);ensure(id(offer.id) && typeof offer.reward?.name==='string','Invalid reward offer.');
   await this.db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.get('offer'))tx.update(ref,{offer});});
  }
 }
 async command(credential:string,input:Record<string,unknown>){
  const c=await this.authorize(credential);
  ensure(['view','roll','bank','undo-roll','undo-bank'].includes(String(input.action)),'Unknown command.');
  if(input.action!=='view')ensure(id(input.requestId) && (input.action!=='roll' || (typeof input.roll==='number' && Number.isInteger(input.roll) && input.roll>=1 && input.roll<=20)),'Enter one whole number from 1 to 20.');
  await this.ensureRace(c);const ref=this.ref(c);
  const eventId=hash(`${c.runId}/${c.playerId}/${input.requestId}`),receipt=ref.collection('commands').doc(eventId);
  const fingerprint=JSON.stringify([input.action,input.action==='roll'?input.roll:null,input.expectedRollCount ?? null]);
  await this.db.runTransaction(async tx=>{
   const prior=input.action==='view'?null:await tx.get(receipt);
   const stored=(await tx.get(ref)).data() as Race;
   if(prior?.exists){ensure(prior.get('fingerprint')===fingerprint,'Request ID already used for another action.');return;}
   if(input.action!=='view' && input.action!=='roll' && input.expectedRollCount!==undefined)ensure(Number.isInteger(input.expectedRollCount) && input.expectedRollCount===stored.rollCount,'A new roll was recorded. Check your treasure and try again.');
   let race=finishReview(stored,this.now());
   if(race.phase==='playing')race=syncMembers(race,c.members!.map(m=>m.id===c.playerId?{...m,connected:true}:m),Math.max(1,c.connectedCount!));
   if(input.action==='view'){tx.set(ref,{...race,expiresAt:c.expiresAt});return;}
   // Commands arriving during review are receipted as ignored, so a lost response
   // cannot turn a paused submission into a later move after an undo.
   if(race.phase!=='playing' && !String(input.action).startsWith('undo-')){tx.set(ref,{...race,expiresAt:c.expiresAt});tx.create(receipt,{fingerprint,ignored:true});return;}
   let next:Race;
   try{
    switch(input.action){
     case 'roll':next=applyRoll(race,c.playerId,input.roll as number,hash(`complete/${c.runId}`),c.connectedCount!,this.now());break;
     case 'bank':next=bank(race,c.playerId,hash(`complete/${c.runId}`),this.now());break;
     case 'undo-roll':next=undoRoll(race,c.playerId,this.now());break;
     default:next=undoBank(race,c.playerId,this.now());
    }
   }catch(e){throw new HttpsError('failed-precondition',(e as Error).message);}
   tx.set(ref,{...next,expiresAt:c.expiresAt});tx.create(receipt,{fingerprint});
   tx.create(ref.collection('activity').doc(eventId),{context:c,eventId,revision:next.revision});
  });
  try{await this.progress(c);}catch{/* Durable work is retried by polling and maintenance. */}
  return publicView((await ref.get()).data() as Race,c.playerId,c.connectedCount!,this.now());
 }
 async progress(c:CentralContext){
  const ref=this.ref(c);
  await this.db.runTransaction(async tx=>{const race=(await tx.get(ref)).data() as Race|undefined;if(race){const next=finishReview(race,this.now());if(next!==race)tx.update(ref,next);}});
  const events=await ref.collection('activity').orderBy('revision').get();
  for(const event of events.docs){const data=event.data() as {context:CentralContext;eventId:string};try{await this.gateway.activity(data.context,data.eventId);}catch(error){const e=error as {code?:string;response?:{data?:{error?:{code?:string}}}};if(!['permission-denied','failed-precondition','not-found'].includes(e.response?.data?.error?.code ?? e.code ?? ''))throw error;}await event.ref.delete();}
  let race=(await ref.get()).data() as Race|undefined;
  if(!race || race.phase!=='settling' || !race.offer || !race.settlement)return;
  if(!race.settlement.receipt){
   // A solo loss has no Rewards settlement. The hub accepts an empty winner list.
   const receipt=race.settlement.winnerIds.length ? (await this.gateway.settle(c,race.offer.id,race.settlement.winnerIds)).receipt : hash(`no-award/${c.runId}`);
   ensure(id(receipt),'Invalid settlement receipt.');await ref.update({'settlement.receipt':receipt});race=(await ref.get()).data() as Race;
  }
  await this.gateway.complete(c,race.settlement!.eventId,race.settlement!.winnerIds,race.settlement!.receipt!);
  await ref.update({phase:'complete'});
 }
 async maintain(){
  const pending=new Map<string,Race>();
  for(const phase of ['playing','review','settling']){
   const races=await this.db.collection('races').where('phase','==',phase).limit(100).get();
   for(const doc of races.docs)pending.set(doc.id,doc.data() as Race);
  }
  for(const race of pending.values()){
   const c:CentralContext={version:1,sessionId:race.sessionId,runId:race.runId,playerId:race.settlement?.actorId ?? Object.keys(race.players)[0] ?? '',displayName:'',expiresAt:0};
   try{await this.progress(c);}catch{/* Preserve settlement for retry. */}
  }
  const expired=await this.db.collection('connections').where('expiresAt','<=',this.now()).limit(300).get();
  if(!expired.empty){const batch=this.db.batch();expired.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}
  // Finished game state is disposable; reward ownership stays in RPG Rewards.
  const old=await this.db.collection('races').where('expiresAt','<=',this.now()-7*86400000).limit(30).get();
  for(const doc of old.docs)await this.db.recursiveDelete(doc.ref);
 }
}



