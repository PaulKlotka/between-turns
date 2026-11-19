export interface Member { id: string; name: string }
export interface CentralContext { version: 1; playerId: string; displayName: string; sessionId: string; runId: string; expiresAt: number; memberCount?: number; members?: Member[]; accountId?: string | null }
export interface RewardOffer { id: string; reward: { id: string; name: string; qualifyingRoll: string } }
export interface Horse { id: string; name: string; numbers: number[]; hits: number; active: boolean }
type Last = { playerId: string; name: string; roll: number; hitIds: string[] };
export interface Race { sessionId: string; runId: string; players: Horse[]; phase: 'playing'|'review'|'settling'|'complete'; offer: RewardOffer|null; revision: number; last: Last|null; settlement: { winnerIds: string[]; eventId: string; receipt: string|null }|null; undo: { playerId: string; hits: Record<string,number>; last: Last|null }|null; reviewUntil: number|null }
export function makeRace(sessionId: string, runId: string): Race { return {sessionId,runId,players:[],phase:'playing',offer:null,revision:0,last:null,settlement:null,undo:null,reviewUntil:null}; }
export function syncMembers(race: Race, members: Member[], pick: (max:number)=>number): Race {
 if(race.phase==='settling'||race.phase==='complete')return race;
 const players=race.players.map(p=>({...p,active:members.some(m=>m.id===p.id),name:members.find(m=>m.id===p.id)?.name ?? p.name}));
 for(const member of members)if(!players.some(p=>p.id===member.id)){
  const pool=Array.from({length:20},(_,i)=>i+1),numbers:number[]=[];
  for(let i=0;i<4;i++)numbers.push(pool.splice(pick(pool.length),1)[0]);
  players.push({...member,numbers:numbers.sort((a,b)=>a-b),hits:0,active:true});
 }
 if(JSON.stringify(players)===JSON.stringify(race.players))return race;
 if(race.phase==='review'){
  const winnerIds=players.filter(p=>p.active&&p.hits===10).map(p=>p.id).sort();
  return winnerIds.length?{...race,players,revision:race.revision+1,settlement:{...race.settlement!,winnerIds}}:{...race,players,phase:'playing',settlement:null,reviewUntil:null,undo:null,revision:race.revision+1};
 }
 return {...race,players,revision:race.revision+1};
}
export function applyRolls(race:Race,playerId:string,name:string,rolls:number[],eventId:string,_memberCount=1,now=Date.now()):Race {
 if(race.phase!=='playing'||!race.offer)throw Error('The race is awaiting completion.');
 if(rolls.length!==1||rolls.some(n=>!Number.isInteger(n)||n<1||n>20))throw Error('Enter one whole number from 1 to 20.');
 if(!race.players.some(p=>p.id===playerId&&p.active))throw Error('You are no longer in this race.');
 const roll=rolls[0],hitIds=race.players.filter(p=>p.active&&p.numbers.includes(roll)).map(p=>p.id);
 const players=race.players.map(p=>({...p,hits:Math.min(10,p.hits+(hitIds.includes(p.id)?1:0))}));
 const winnerIds=players.filter(p=>p.active&&p.hits===10).map(p=>p.id).sort();
 return {...race,players,last:{playerId,name,roll,hitIds},revision:race.revision+1,undo:{playerId,hits:Object.fromEntries(race.players.map(p=>[p.id,p.hits])),last:race.last},phase:winnerIds.length?'review':'playing',settlement:winnerIds.length?{winnerIds,eventId,receipt:null}:null,reviewUntil:winnerIds.length?now+15000:null};
}
export function undoRoll(race:Race,playerId:string,_memberCount:number,now:number):Race {
 if(!race.undo||race.undo.playerId!==playerId||!['playing','review'].includes(race.phase)||(race.phase==='review'&&now>=(race.reviewUntil??0)))throw Error('This roll can no longer be undone.');
 return {...race,players:race.players.map(p=>({...p,hits:race.undo!.hits[p.id]??p.hits})),last:race.undo.last,phase:'playing',settlement:null,reviewUntil:null,undo:null,revision:race.revision+1};
}
export function finishReview(race:Race,now:number):Race { return race.phase==='review'&&now>=(race.reviewUntil??0)?{...race,phase:'settling',undo:null,reviewUntil:null,revision:race.revision+1}:race; }
export function publicView(race:Race,playerId:string,memberCount=1,now=Date.now()) { return {playerId,phase:race.phase,players:race.players.filter(p=>p.active),offer:race.offer,last:race.last,winnerIds:race.settlement?.winnerIds??[],revision:race.revision,memberCount,canUndo:race.undo?.playerId===playerId&&['playing','review'].includes(race.phase)&&(race.phase!=='review'||now<(race.reviewUntil??0)),reviewUntil:race.phase==='review'?race.reviewUntil:null,serverNow:now}; }
