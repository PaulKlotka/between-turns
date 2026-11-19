export interface CentralContext { version: 1; playerId: string; displayName: string; sessionId: string; runId: string; expiresAt: number; memberCount?: number; accountId?: string | null; photoURL?: string | null }
export interface RewardOffer { id: string; reward: { id: string; name: string; qualifyingRoll: string } }
export type Challenge = { kind: 'high' | 'low' | 'medium' | 'very-high' | 'even' | 'odd' | 'exact' | 'range'; min: number; max: number; label: string };
type Last = { playerId: string; name: string; results: { roll: number; success: boolean; challenge: string }[] };
export interface Race { sessionId: string; runId: string; challenges: Challenge[]; index: number; phase: 'playing' | 'review' | 'settling' | 'complete'; offer: RewardOffer | null; revision: number; last: Last | null; settlement: { winnerId: string; eventId: string; receipt: string | null } | null; undo?: { playerId: string; index: number; last: Last | null } | null; reviewUntil?: number | null }
export function makeRace(sessionId: string, runId: string, pick: (max: number) => number): Race {
  const pool: Challenge[] = [
    {kind:'low',min:1,max:5,label:'Low roll: 1–5'},
    {kind:'medium',min:6,max:10,label:'Medium roll: 6–10'},
    {kind:'high',min:11,max:15,label:'High roll: 11–15'},
    {kind:'very-high',min:16,max:20,label:'Very high roll: 16–20'},
    {kind:'even',min:1,max:20,label:'Roll an even number'},
    {kind:'odd',min:1,max:20,label:'Roll an odd number'}
  ];
  const count = 3 + pick(5);
  const challenges = Array.from({length:count}, () => { const category=pick(7); if(category<pool.length) return pool[category]; const number=1+pick(20); return {kind:'exact' as const,min:number,max:number,label:`Roll exactly ${number}`}; });
  return {sessionId,runId,challenges,index:0,phase:'playing',offer:null,revision:0,last:null,settlement:null,undo:null,reviewUntil:null};
}
export function applyRolls(race: Race, playerId: string, name: string, rolls: number[], eventId: string, memberCount = 1, now = Date.now()): Race {
  if (race.phase !== 'playing' || !race.offer) throw new Error('The race is awaiting completion.');
  if (memberCount > 1 && race.last?.playerId === playerId) throw new Error('Wait for another player to enter a roll.');
  if (rolls.length !== 1 || rolls.some(n => !Number.isInteger(n) || n < 1 || n > 20)) throw new Error('Enter one whole number from 1 to 20.');
  let index = race.index; let settlement: Race['settlement'] = null;
  const results: Last['results'] = [];
  for (const roll of rolls) {
    const challenge = race.challenges[index];
    const success = roll >= challenge.min && roll <= challenge.max && (challenge.kind !== 'even' || roll % 2 === 0) && (challenge.kind !== 'odd' || roll % 2 === 1);
    results.push({roll,success,challenge:challenge.label});
    if (success && ++index === race.challenges.length) { settlement = {winnerId:playerId,eventId,receipt:null}; break; }
  }
  const undo = memberCount > 1 ? {playerId,index:race.index,last:race.last} : null;
  return {...race,index,phase:settlement ? (undo ? 'review' : 'settling') : 'playing',settlement,revision:race.revision+1,last:{playerId,name,results},undo,reviewUntil:settlement && undo ? now+15000 : null};
}
export function undoRoll(race: Race, playerId: string, memberCount: number, now: number): Race {
  if (memberCount <= 1 || !race.undo || race.undo.playerId !== playerId || !['playing','review'].includes(race.phase) || (race.phase === 'review' && now >= (race.reviewUntil ?? 0))) throw new Error('This roll can no longer be undone.');
  return {...race,index:race.undo.index,last:race.undo.last,phase:'playing',settlement:null,reviewUntil:null,undo:null,revision:race.revision+1};
}
export function finishReview(race: Race, now: number): Race {
  return race.phase === 'review' && now >= (race.reviewUntil ?? 0) ? {...race,phase:'settling',undo:null,reviewUntil:null,revision:race.revision+1} : race;
}
export function publicView(race: Race, playerId: string, memberCount = 1, now = Date.now()) {
  return { playerId, phase:race.phase, challenge:race.phase === 'playing' ? race.challenges[race.index].label : null, offer:race.offer, last:race.last, winnerId:race.settlement?.winnerId ?? null, revision:race.revision, memberCount, canUndo:memberCount>1 && race.undo?.playerId===playerId && ['playing','review'].includes(race.phase) && (race.phase!=='review' || now < (race.reviewUntil ?? 0)), reviewUntil:race.phase==='review' ? race.reviewUntil : null, serverNow:now };
}
