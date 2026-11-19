import './style.css';
import type { publicView } from '../functions/src/race';
type View=ReturnType<typeof publicView>;
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<main><header><div><span class="eyebrow">BETWEEN TURNS · TREASURE RACE</span><h1>Push Your Luck</h1></div><span id="mode" class="pill">Connect to play</span></header>
<section class="game" hidden><section class="treasure" aria-label="Treasure race"><div class="section-heading"><h2>Treasure race</h2><span class="goal">Goal: 100</span></div><div class="legend"><span class="safe-key">Banked</span><span class="risk-key">At risk</span></div><div id="standings"></div><button id="bank" class="primary">Bank treasure</button><p id="collecting" class="hint"></p><button id="undo-bank" class="subtle" hidden>Undo bank</button></section>
<section class="roll-panel" aria-label="Record a physical d20 roll"><div class="section-heading"><h2>Record your d20</h2><span id="roll-count" class="pill"></span></div><p class="hint">The player who rolled should enter the result.</p><div id="grid" class="grid"></div><div class="latest"><div><span class="eyebrow">LATEST ROLL</span><p id="last">Waiting for the first roll</p></div><button id="undo-roll" class="subtle" title="Restores treasure before this roll, including any banks made afterward" hidden>Undo roll</button></div><p id="roll-note" class="hint"></p></section>
<section class="reward"><span class="eyebrow">RACE REWARD</span><strong id="reward"></strong><p id="benefit"></p></section>
<aside class="rules"><span><b>1</b> Lose at risk</span><span><b>2–19</b> Add treasure</span><span><b>20</b> Add + auto-bank</span><span>Bank clears toxic numbers and skips one roll</span></aside></section>
<div id="result" class="result" hidden aria-live="polite"></div><p id="status" role="status">Connecting to Between Turns…</p><button id="retry" class="subtle" hidden>Retry</button></main>`;
const $=<T extends HTMLElement>(s:string)=>root.querySelector<T>(s)!;
const params=new URLSearchParams(location.search),origin=params.get('btParentOrigin') ?? '',nonce=params.get('btNonce') ?? '';
const allowed=['https://between-turns-paul.web.app',...(import.meta.env.DEV?['http://127.0.0.1:5180']:[])];
let credential='',connected=false,busy=false,refreshing=false,mutationVersion=0,view:View|undefined,pending:Record<string,unknown>|undefined,clockOffset=0,reviewTriggered=0;
const status=$('#status'),retry=$<HTMLButtonElement>('#retry'),grid=$('#grid');
const post=(type:string)=>window.parent.postMessage({channel:'between-turns',version:1,nonce,type},origin);
async function request<T>(data:object):Promise<T>{const response=await fetch('/embeddedApi',{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},body:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(25000)});const body=await response.json();if(!response.ok || body.error)throw Object.assign(new Error(body.error?.message || 'Please try again.'),{code:body.error?.code});return body.result as T;}
function setView(next:View){if(view && next.revision<view.revision)return;view=next;clockOffset=next.serverNow-Date.now();}
function fail(e:unknown){status.textContent=e instanceof Error?e.message:'Unable to connect.';retry.hidden=false;}
function render(){
 if(!view)return;
 $('.game').hidden=false;const me=view.players.find(p=>p.id===view!.playerId);
 $('#mode').textContent=view.mode==='solo'?`Solo � ${view.rollLimit} rolls`:'Multiplayer � first to 100';
 const blocked=busy || !!pending,bankButton=$<HTMLButtonElement>('#bank');
 bankButton.textContent=me?.skipNext?'Sitting out the next roll':me?.atRisk?`Bank ${me.atRisk} treasure`:'Bank treasure';bankButton.disabled=blocked || !view.canBank;
 $('#collecting').textContent=me?.skipNext?'Your treasure is safe. Collecting resumes after the next roll.':'Keep going is automatic. Bank to protect your treasure and skip one roll.';
 $('#roll-count').textContent=view.rollLimit?`Roll ${view.rollCount} / ${view.rollLimit}`:`Roll ${view.rollCount}`;
 grid.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{const n=Number(b.textContent);const toxic=me?.toxicNumbers.includes(n) ?? n===1;b.classList.toggle('toxic',toxic);b.setAttribute('aria-label',`Enter roll ${n}${toxic?' (toxic for you)':''}`);b.disabled=blocked || !view!.canRoll;});
 $('#last').textContent=view.last?`${view.last.roll} · ${view.last.name}`:'Waiting for the first roll';
 $('#roll-note').textContent=view.phase!=='playing'?'Rolls and banking are paused.':view.canRoll?'Enter the unmodified die result. Each recorded roll affects everyone collecting.':'Wait for another player to roll or bank. You can still bank your treasure.';
 for(const kind of ['roll','bank'] as const){const button=$<HTMLButtonElement>(`#undo-${kind}`);button.hidden=!(kind==='roll'?view.canUndoRoll:view.canUndoBank);button.disabled=blocked || (view.phase==='review' && Date.now()+clockOffset>=(view.reviewUntil ?? 0));}
 $('#reward').textContent=view.offer?.reward.name ?? 'Preparing reward…';$('#benefit').textContent=view.offer?.reward.qualifyingRoll ?? '';
 const standings=$('#standings');standings.replaceChildren();
 for(const player of view.players){
  const row=document.createElement('div');row.className=`race-row${player.id===view.playerId?' me':''}`;
  const label=document.createElement('div');label.className='race-label';
  const name=document.createElement('span');name.textContent=`${player.name}${player.id===view.playerId?' (you)':''}${player.skipNext?' � skipping':''}`;
  const values=document.createElement('span');values.textContent=`${player.banked} banked � ${player.atRisk} at risk`;
  label.append(name,values);
  const track=document.createElement('div');track.className='race-track';track.setAttribute('role','img');track.setAttribute('aria-label',`${player.name}: ${player.banked} banked and ${player.atRisk} at risk, goal ${view.target}`);
  const safe=document.createElement('div');safe.className='bar-safe';safe.style.width=`${Math.min(100,player.banked/view.target*100)}%`;
  const risk=document.createElement('div');risk.className='bar-risk';risk.style.width=`${Math.min(100-Math.min(100,player.banked/view.target*100),player.atRisk/view.target*100)}%`;
  track.append(safe,risk);const toxic=document.createElement('div');toxic.className='toxic-list';toxic.textContent=`Toxic: ${[...player.toxicNumbers].sort((a,b)=>a-b).join(', ')}`;row.append(label,track,toxic);standings.append(row);
 }
 if(view.mode==='solo' && view.rollLimit){
  const row=document.createElement('div');row.className='race-row turn-row';
  const label=document.createElement('div');label.className='race-label';
  const name=document.createElement('span');name.textContent='Turns';const values=document.createElement('span');values.textContent=`${view.rollCount} / ${view.rollLimit} rolls`;label.append(name,values);
  const track=document.createElement('div');track.className='race-track';track.setAttribute('role','progressbar');track.setAttribute('aria-label','Turns taken');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(view.rollLimit));track.setAttribute('aria-valuenow',String(Math.min(view.rollCount,view.rollLimit)));
  const fill=document.createElement('div');fill.className='bar-turns';fill.style.width=`${Math.min(100,view.rollCount/view.rollLimit*100)}%`;track.append(fill);row.append(label,track);standings.append(row);
 }
 const result=$('#result');result.hidden=view.phase==='playing';
 const names=view.players.filter(p=>view!.winnerIds.includes(p.id)).map(p=>p.name).join(' & ');
 if(!result.hidden)result.textContent=view.winnerIds.length?`${names || 'Winner'} ${view.winnerIds.length>1?'win':'wins'}! ${view.offer?.reward.name ?? ''}`:`Solo complete · ${me?.banked ?? 0} / 100 banked treasure`;
 if(retry.hidden){
  if(view.phase==='review'){const seconds=Math.max(0,Math.ceil(((view.reviewUntil ?? 0)-(Date.now()+clockOffset))/1000));status.textContent=seconds?`Result confirms in ${seconds}s. The last action can still be undone.`:'Confirming result…';}
  else status.textContent=view.phase==='playing'?'Protect your treasure, or push your luck.':view.phase==='settling'?'Recording the result and any rewards…':'Result recorded. Between Turns will choose the next game.';
 }
}
for(let n=1;n<=20;n++){const button=document.createElement('button');button.type='button';button.textContent=String(n);button.className=n===1?'bust':n===20?'jackpot':'';button.setAttribute('aria-label',`Enter roll ${n}`);button.onclick=()=>send({action:'roll',roll:n});grid.append(button);}
function send(data:Record<string,unknown>){if(busy || pending)return;pending={...data,...(data.action!=='roll'?{expectedRollCount:view?.rollCount}:{}),requestId:crypto.randomUUID()};void submit();}
async function refresh(){if(!connected || busy || pending || refreshing)return;refreshing=true;const version=mutationVersion;try{const next=await request<View>({action:'view'});if(busy || pending || version!==mutationVersion)return;setView(next);retry.hidden=true;if(view?.phase==='complete')post('refresh');render();}catch(e){if(!busy && !pending && version===mutationVersion){fail(e);post('refresh');}}finally{refreshing=false;}}
async function submit(){if(busy || !pending)return;busy=true;mutationVersion++;render();try{setView(await request<View>(pending));pending=undefined;retry.hidden=true;post('refresh');}catch(e){if((e as {code?:string}).code==='failed-precondition'){pending=undefined;try{setView(await request<View>({action:'view'}));}catch{}fail(e);}else fail(e);}finally{busy=false;render();}}
$<HTMLButtonElement>('#bank').onclick=()=>send({action:'bank'});
$<HTMLButtonElement>('#undo-bank').onclick=()=>send({action:'undo-bank'});
$<HTMLButtonElement>('#undo-roll').onclick=()=>send({action:'undo-roll'});
retry.onclick=()=>{if(!connected)location.reload();else if(pending)void submit();else void refresh();};
if(window.parent===window || !allowed.includes(origin) || params.get('btVersion')!=='1' || !/^[A-Za-z0-9_-]{1,128}$/.test(nonce)){status.textContent='Open Push Your Luck from Between Turns.';}
else{
 let lastSize='';const reportSize=()=>{const width=Math.ceil(document.documentElement.clientWidth),height=Math.ceil($('main').getBoundingClientRect().height);const size=`${width}:${height}`;if(width>0 && height>0 && width<=16384 && height<=16384 && size!==lastSize){lastSize=size;window.parent.postMessage({channel:'between-turns',version:1,nonce,type:'size',width,height},origin);}};
 const resize=new ResizeObserver(reportSize);resize.observe($('main'));window.addEventListener('resize',reportSize);window.addEventListener('pagehide',()=>resize.disconnect(),{once:true});
 window.addEventListener('message',async event=>{const d=event.data;if(connected || busy || event.origin!==origin || event.source!==window.parent || !d || d.channel!=='between-turns' || d.version!==1 || d.nonce!==nonce || d.type!=='connect' || typeof d.grant!=='string' || typeof d.expiresAt!=='number' || d.expiresAt<=Date.now())return;busy=true;try{setView(await request<View>({action:'connect',nonce,grant:d.grant}));connected=true;post('connected');}catch(e){fail(e);post('error');}finally{busy=false;render();}});
 void request<{credential:string}>({action:'begin',nonce}).then(result=>{credential=result.credential;post('ready');}).catch(fail);
 window.setInterval(()=>void refresh(),3000);window.setInterval(()=>{if(view?.phase==='review'){render();if(view.reviewUntil && Date.now()+clockOffset>=view.reviewUntil && reviewTriggered!==view.reviewUntil){reviewTriggered=view.reviewUntil;void refresh();}}},250);
}

