import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { applyRolls, finishReview, makeRace, publicView, undoRoll, type CentralContext, type Race } from './race';
import type { IntegrationGateway } from './integration-gateway';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const id = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(s);
function ensure(c: unknown, message: string): asserts c { if (!c) throw new HttpsError('failed-precondition', message); }
type Connection = { nonce: string; expiresAt: number; context: CentralContext | null; connecting: boolean };
export class RaceService {
 constructor(private db: Firestore, private gateway: IntegrationGateway, private now = Date.now) {}
 private ref(c: CentralContext) { return this.db.doc(`races/${hash(`${c.sessionId}/${c.runId}`)}`); }
 async begin(nonce: unknown) { ensure(id(nonce), 'Invalid frame connection.'); const credential = randomBytes(32).toString('base64url'); await this.db.doc(`connections/${hash(credential)}`).create({nonce,expiresAt:this.now()+60000,context:null,connecting:false}); return {credential}; }
 async connect(credential: string, nonce: unknown, grant: unknown) {
  ensure(id(nonce) && typeof grant === 'string' && grant.length > 0 && grant.length <= 1024, 'Invalid connection.');
  const ref=this.db.doc(`connections/${hash(credential)}`);
  await this.db.runTransaction(async tx => { const c=(await tx.get(ref)).data() as Connection | undefined; ensure(c && c.nonce===nonce && c.expiresAt>this.now() && !c.context && !c.connecting,'Refresh to reconnect.'); tx.update(ref,{connecting:true}); });
  const context=await this.gateway.exchange(grant,nonce);
  ensure(context.version===1 && id(context.sessionId) && id(context.runId) && id(context.playerId) && context.expiresAt>this.now(),'Invalid central context.');
  await ref.update({context,connecting:false,expiresAt:Math.min(context.expiresAt,this.now()+3600000)});
  return this.command(credential,{action:'view'});
 }
 private async authorize(credential: string) {
  ensure(/^[A-Za-z0-9_-]{43}$/.test(credential),'Connect through Between Turns.');
  const connection=(await this.db.doc(`connections/${hash(credential)}`).get()).data() as Connection | undefined;
  ensure(connection?.context && connection.expiresAt>this.now(),'Refresh to reconnect.');
  let c: CentralContext; try { c=await this.gateway.context(connection.context); } catch (error) { const e=error as {code?:string;response?:{data?:{error?:{code?:string}}}}; const code=e.response?.data?.error?.code ?? e.code; if (['permission-denied','failed-precondition','not-found'].includes(code ?? '')) throw new HttpsError('failed-precondition','This race has ended or your session changed. Return to Between Turns.'); throw error; }
  ensure((c.accountId ?? null)===(connection.context.accountId ?? null),'Identity changed. Reconnect.'); return c;
 }
 private async ensureRace(c: CentralContext) {
  const ref=this.ref(c);
  await this.db.runTransaction(async tx => { const snap=await tx.get(ref); if (!snap.exists) tx.create(ref,makeRace(c.sessionId,c.runId,max=>randomInt(max))); });
  if (!(await ref.get()).get('offer')) {
   const offer=await this.gateway.draw(c); ensure(id(offer.id) && typeof offer.reward?.name==='string','Invalid reward offer.');
   await this.db.runTransaction(async tx=>{ const snap=await tx.get(ref); if (!snap.get('offer')) tx.update(ref,{offer}); });
  }
 }
 async command(credential: string, input: Record<string,unknown>) {
  const c=await this.authorize(credential); ensure(Number.isInteger(c.memberCount) && c.memberCount! >= 1 && c.memberCount! <= 32, 'Session membership is unavailable. Please retry.'); ensure(input.action==='view' || input.action==='roll' || input.action==='undo','Unknown command.'); await this.ensureRace(c);
  const ref=this.ref(c);
  if (input.action!=='view') {
   ensure(id(input.requestId) && (input.action==='undo' || (Array.isArray(input.rolls) && input.rolls.length===1 && input.rolls.every(n=>Number.isInteger(n) && n>=1 && n<=20))), 'Enter one whole number from 1 to 20.');
   const rolls=input.rolls as number[]; const eventId=hash(`${c.runId}/${c.playerId}/${input.requestId}`); const receipt=ref.collection('commands').doc(eventId); const fingerprint=JSON.stringify([input.action,input.action==='roll' ? rolls : null]);
   await this.db.runTransaction(async tx=>{
    const prior=await tx.get(receipt); const race=(await tx.get(ref)).data() as Race;
    if (prior.exists) { ensure(prior.get('fingerprint')===fingerprint,'Request ID already used for another submission.'); return; }
    if (input.action==='roll' && race.phase==='review') { const next=finishReview(race,this.now()); if(next!==race) tx.set(ref,next); tx.create(receipt,{fingerprint}); return; }
    let next: Race; try { next=input.action==='undo' ? undoRoll(race,c.playerId,c.memberCount!,this.now()) : applyRolls(race,c.playerId,c.displayName,rolls,hash("complete/" + c.runId),c.memberCount!,this.now()); } catch(e) { throw new HttpsError('failed-precondition',(e as Error).message); }
    tx.set(ref,next); tx.create(receipt,{fingerprint}); tx.create(ref.collection('activity').doc(eventId),{context:c,eventId,revision:next.revision});
   });
  }
  try { await this.progress(c); } catch { /* Persisted work is retried by polling and maintenance. */ }
  return publicView((await ref.get()).data() as Race,c.playerId,c.memberCount!,this.now());
 }
 async progress(c: CentralContext) {
  const ref=this.ref(c);
  await this.db.runTransaction(async tx=>{const race=(await tx.get(ref)).data() as Race | undefined; if(race){const next=finishReview(race,this.now()); if(next!==race) tx.set(ref,next);}});
  const events=await ref.collection('activity').orderBy('revision').get();
  for (const event of events.docs) { const data=event.data() as {context:CentralContext;eventId:string}; try { await this.gateway.activity(data.context,data.eventId); } catch (error) { const e=error as {code?:string;response?:{data?:{error?:{code?:string}}}}; const code=e.response?.data?.error?.code ?? e.code; if (!['permission-denied','failed-precondition','not-found'].includes(code ?? '')) throw error; } await event.ref.delete(); }
  let race=(await ref.get()).data() as Race | undefined;
  if (!race || race.phase!=='settling' || !race.offer || !race.settlement) return;
  if (!race.settlement.receipt) {
   const result=await this.gateway.settle(c,race.offer.id,[race.settlement.winnerId]); ensure(id(result.receipt),'Invalid settlement receipt.');
   await ref.update({'settlement.receipt':result.receipt}); race=(await ref.get()).data() as Race;
  }
  await this.gateway.complete(c,race.settlement!.eventId,[race.settlement!.winnerId],race.settlement!.receipt!);
  await ref.update({phase:'complete'});
 }
 async maintain() {
  for (const phase of ['review','settling']) { const races=await this.db.collection('races').where('phase','==',phase).limit(100).get();
  for (const doc of races.docs) { const race=doc.data() as Race; const c:CentralContext={version:1,sessionId:race.sessionId,runId:race.runId,playerId:race.settlement!.winnerId,displayName:'',expiresAt:0}; try { await this.progress(c); } catch { /* Preserve outbox for retry. */ } } }
  const expired=await this.db.collection('connections').where('expiresAt','<=',this.now()).limit(300).get(); if (!expired.empty) {const batch=this.db.batch(); expired.docs.forEach(d=>batch.delete(d.ref)); await batch.commit();}
 }
}




