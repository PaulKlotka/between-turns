export interface Member { id: string; name: string; connected: boolean }
export interface CentralContext { version: 1; playerId: string; displayName: string; sessionId: string; runId: string; expiresAt: number; memberCount?: number; connectedCount?: number; members?: Member[]; accountId?: string | null; photoURL?: string | null }
export interface RewardOffer { id: string; reward: { id: string; name: string; qualifyingRoll: string } }
export interface Treasure { id: string; name: string; banked: number; atRisk: number; skipNext: boolean }
export interface LastRoll { playerId: string; name: string; roll: number }
interface RollUndo { playerId: string; players: Record<string, Treasure>; rollCount: number; last: LastRoll | null }
interface BankUndo { treasure: Treasure; rollCount: number }
export interface Race {
 sessionId: string; runId: string; mode: 'solo' | 'multiplayer'; phase: 'playing' | 'review' | 'settling' | 'complete';
 players: Record<string, Treasure>; rollCount: number; last: LastRoll | null; offer: RewardOffer | null; revision: number;
 rollUndo: RollUndo | null; bankUndos: Record<string, BankUndo>; reviewUntil: number | null;
 reviewAction: { kind: 'roll' | 'bank'; playerId: string } | null;
 settlement: { winnerIds: string[]; eventId: string; receipt: string | null; actorId: string } | null;
}
export const TARGET = 100, SOLO_ROLL_LIMIT = 15, REVIEW_MS = 15000;
const copy = <T>(x: T): T => structuredClone(x);
export function makeRace(sessionId: string, runId: string): Race {
 return {sessionId, runId, mode:'solo', phase:'playing', players:{}, rollCount:0, last:null, offer:null, revision:0, rollUndo:null, bankUndos:{}, reviewUntil:null, reviewAction:null, settlement:null};
}
export function syncMembers(race: Race, members: Member[], connectedCount: number): Race {
 const next=copy(race);
 for (const id of Object.keys(next.players)) if (!members.some(m=>m.id===id)) { delete next.players[id]; delete next.bankUndos[id]; }
 for (const m of members) { if (!m.connected && !next.players[m.id]) continue; next.players[m.id]=next.players[m.id] ? {...next.players[m.id],name:m.name} : {id:m.id,name:m.name,banked:0,atRisk:0,skipNext:false}; }
 if (next.mode==='solo' && (connectedCount>1 || Object.keys(next.players).length>1) && next.phase==='playing') next.mode='multiplayer';
 return next;
}
function playing(race: Race, playerId: string) {
 if (race.phase!=='playing' || !race.offer) throw new Error('Wait for the current result to finish.');
 if (!race.players[playerId]) throw new Error('Join this session through Between Turns.');
}
function review(race: Race, actorId: string, kind: 'roll' | 'bank', eventId: string, now: number): Race {
 const eligible=Object.values(race.players).filter(p=>p.banked>=TARGET);
 const highest=Math.max(0,...eligible.map(p=>p.banked));
 const winnerIds=eligible.filter(p=>p.banked===highest).map(p=>p.id).sort();
 const ended=race.mode==='solo' && race.rollCount>=SOLO_ROLL_LIMIT;
 if (!winnerIds.length && !ended) return race;
 return {...race,phase:'review',reviewUntil:now+REVIEW_MS,reviewAction:{kind,playerId:actorId},settlement:{winnerIds,eventId,receipt:null,actorId}};
}
export function applyRoll(race: Race, playerId: string, roll: number, eventId: string, connectedCount: number, now: number): Race {
 playing(race,playerId);
 if (!Number.isInteger(roll) || roll<1 || roll>20) throw new Error('Enter one whole number from 1 to 20.');
 if (connectedCount>1 && race.last?.playerId===playerId) throw new Error('Wait for another player to enter a roll.');
 const next=copy(race);
 next.rollUndo={playerId,players:copy(race.players),rollCount:race.rollCount,last:race.last};
 next.bankUndos={}; next.rollCount++; next.last={playerId,name:race.players[playerId].name,roll}; next.revision++;
 for (const p of Object.values(next.players)) {
  if (p.skipNext) { p.skipNext=false; continue; }
  if (roll===1) p.atRisk=0;
  else { p.atRisk+=roll; if (roll===20) { p.banked+=p.atRisk; p.atRisk=0; } }
 }
 if (next.mode==='solo' && next.rollCount===SOLO_ROLL_LIMIT) for (const p of Object.values(next.players)) {p.banked+=p.atRisk;p.atRisk=0;}
 return review(next,playerId,'roll',eventId,now);
}
export function bank(race: Race, playerId: string, eventId: string, now: number): Race {
 playing(race,playerId);
 const p=race.players[playerId];
 if (p.skipNext || p.atRisk===0) throw new Error('There is no treasure to bank.');
 const next=copy(race);
 next.bankUndos[playerId]={treasure:copy(p),rollCount:race.rollCount};
 next.players[playerId]={...p,banked:p.banked+p.atRisk,atRisk:0,skipNext:true}; next.revision++;
 return review(next,playerId,'bank',eventId,now);
}
function undoAllowed(race: Race, playerId: string, kind: 'roll' | 'bank', now: number) {
 if (!['playing','review'].includes(race.phase) || (race.phase==='review' && (now >= (race.reviewUntil ?? 0) || race.reviewAction?.kind!==kind || race.reviewAction.playerId!==playerId))) throw new Error('This action can no longer be undone.');
}
export function undoRoll(race: Race, playerId: string, now: number): Race {
 undoAllowed(race,playerId,'roll',now);
 if (race.rollUndo?.playerId!==playerId) throw new Error('Only the latest roll submitter can undo it.');
 const next=copy(race), snapshot=next.rollUndo!;
 // Restore only current members; late arrivals retain their zero-point state.
 for (const id of Object.keys(next.players)) if (snapshot.players[id]) next.players[id]={...snapshot.players[id],name:next.players[id].name};
 next.rollCount=snapshot.rollCount; next.last=snapshot.last; next.rollUndo=null; next.bankUndos={};
 next.phase='playing'; next.settlement=null; next.reviewAction=null; next.reviewUntil=null; next.revision++;
 return next;
}
export function undoBank(race: Race, playerId: string, now: number): Race {
 undoAllowed(race,playerId,'bank',now);
 const snapshot=race.bankUndos[playerId];
 if (!snapshot || snapshot.rollCount!==race.rollCount || !race.players[playerId]) throw new Error('This bank can no longer be undone.');
 const next=copy(race); next.players[playerId]={...snapshot.treasure,name:next.players[playerId].name}; delete next.bankUndos[playerId];
 next.phase='playing'; next.settlement=null; next.reviewAction=null; next.reviewUntil=null; next.revision++;
 return next;
}
export function finishReview(race: Race, now: number): Race {
 return race.phase==='review' && now >= (race.reviewUntil ?? Infinity) ? {...race,phase:'settling',rollUndo:null,bankUndos:{},reviewAction:null,reviewUntil:null,revision:race.revision+1} : race;
}
export function publicView(race: Race, playerId: string, connectedCount: number, now: number) {
 const inTime=race.phase==='playing' || (race.phase==='review' && now<(race.reviewUntil ?? 0));
 const mayUndo=(kind:'roll'|'bank')=>inTime && (race.phase==='playing' || (race.reviewAction?.kind===kind && race.reviewAction.playerId===playerId));
 return {playerId,mode:race.mode,phase:race.phase,target:TARGET,rollLimit:race.mode==='solo'?SOLO_ROLL_LIMIT:null,rollCount:race.rollCount,
  players:Object.values(race.players).sort((a,b)=>b.banked-a.banked || b.atRisk-a.atRisk || a.name.localeCompare(b.name)),last:race.last,offer:race.offer,
  winnerIds:race.settlement?.winnerIds ?? [],connectedCount,revision:race.revision,reviewUntil:race.reviewUntil,reviewAction:race.reviewAction,serverNow:now,
  canRoll:race.phase==='playing' && (connectedCount<=1 || race.last?.playerId!==playerId),
  canBank:race.phase==='playing' && !!race.players[playerId]?.atRisk && !race.players[playerId].skipNext,
  canUndoRoll:mayUndo('roll') && race.rollUndo?.playerId===playerId,canUndoBank:mayUndo('bank') && !!race.bankUndos[playerId]};
}


