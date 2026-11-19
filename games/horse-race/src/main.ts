import './style.css';
type View={playerId:string;phase:string;players:{id:string;name:string;numbers:number[];hits:number}[];offer:{reward:{name:string;qualifyingRoll:string}}|null;winnerIds:string[];last:{playerId:string;name:string;roll:number;hitIds:string[]}|null;memberCount:number;canUndo:boolean;reviewUntil:number|null;serverNow:number};
const root=document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML=`<main><header><span class="eyebrow">BETWEEN TURNS</span><h1>Horse Race</h1><p>Four lucky numbers. First to ten hits wins.</p></header><section class="game" hidden><section class="standings" aria-label="Race progress"><div class="standings-heading"><h2 id="challenge">Race to ten</h2><span class="eyebrow">FINISH · 10 HITS</span></div><p class="hint">Each reported d20 roll gives a hit to everyone with that number. Players reaching ten together share the win.</p><div id="horses"></div></section><div class="reward"><span class="eyebrow">REWARD FOR EACH WINNER</span><strong id="reward"></strong><p id="benefit"></p></div><section class="roll-panel" aria-label="Enter a physical d20 roll"><div id="entry"><h2>Report a table d20 roll</h2><div id="grid" class="grid" aria-label="Choose the physical die result"></div><p class="hint">Report each physical roll once. Anyone can enter it.</p></div><div id="entered" class="entered" hidden><span class="eyebrow">WINNING ROLL</span><strong id="entered-roll" class="entered-roll"></strong></div><button id="undo" class="undo" hidden>Undo roll</button></section><p id="last" aria-live="polite"></p></section><p id="status" role="status">Connecting to Between Turns…</p><button id="retry" hidden>Retry</button></main>`;
const $=<T extends HTMLElement>(s:string)=>root.querySelector<T>(s)!;
const params=new URLSearchParams(location.search), origin=params.get('btParentOrigin') ?? '', nonce=params.get('btNonce') ?? '';
const allowed=['https://between-turns-paul.web.app'];
let credential='',connected=false,busy=false,refreshing=false,mutationVersion=0,view:View|undefined,pending:Record<string,unknown>|undefined,clockOffset=0,reviewTriggered=0;
const status=$<HTMLElement>('#status'),retry=$<HTMLButtonElement>('#retry'),grid=$<HTMLElement>('#grid');
const post=(type:string)=>window.parent.postMessage({channel:'between-turns',version:1,nonce,type},origin);
async function request<T>(data:object):Promise<T>{ const response=await fetch('/embeddedApi',{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},body:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(25000)}); const body=await response.json(); if(!response.ok || body.error) throw Object.assign(new Error(body.error?.message || 'Please try again.'),{code:body.error?.code}); return body.result as T; }
function setView(next:View){view=next;clockOffset=next.serverNow-Date.now();}
function fail(e:unknown){status.textContent=e instanceof Error?e.message:'Unable to connect.';retry.hidden=false;}
function render(){
 if(!view)return;
 $('.game').hidden=false;
 $('#challenge').textContent=view.phase==='playing'?'Race to ten':view.winnerIds.length>1?'Shared victory!':'We have a winner!';
 $('#reward').textContent=view.offer?.reward.name??'Preparing reward…';$('#benefit').textContent=view.offer?.reward.qualifyingRoll??'';
 const horses=$('#horses');horses.replaceChildren();
 for(const player of view.players){
  const row=document.createElement('article');row.className='horse'+(player.id===view.playerId?' mine':'')+(view.winnerIds.includes(player.id)?' winner':'');
  const heading=document.createElement('div');heading.className='horse-heading';
  const name=document.createElement('strong');name.textContent=player.name+(player.id===view.playerId?' (you)':'');
  const count=document.createElement('span');count.textContent=`${player.hits} / 10 hits`;
  heading.append(name,count);row.append(heading);
  const progress=document.createElement('progress');progress.max=10;progress.value=player.hits;progress.setAttribute('aria-label',`${player.name}: ${player.hits} of 10 hits`);row.append(progress);
  const numbers=document.createElement('div');numbers.className='numbers';
  for(const n of player.numbers){const number=document.createElement('span');number.className=view.last?.roll===n?'number matched':'number';number.textContent=String(n);numbers.append(number);}
  row.append(numbers);horses.append(row);
 }
 $('#last').textContent=view.last?`${view.last.name} reported ${view.last.roll}. ${view.last.hitIds.length?view.last.hitIds.map(id=>view!.players.find(p=>p.id===id)?.name??'Former player').join(', ')+(view.last.hitIds.length===1?' gets a hit.':' each get a hit.'):'No matching numbers.'}`:'Report a roll to start the race.';
 $('#entry').hidden=view.phase!=='playing';$('#entered').hidden=view.phase!=='review';$('#entered-roll').textContent=String(view.last?.roll??'');
 const undo=$<HTMLButtonElement>('#undo');undo.hidden=!view.canUndo;undo.disabled=busy||!!pending||(view.phase==='review'&&Date.now()+clockOffset>=(view.reviewUntil??0));
 grid.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=busy||!!pending||view!.phase!=='playing');
 if(retry.hidden){if(view.phase==='review'){const seconds=Math.max(0,Math.ceil(((view.reviewUntil??0)-(Date.now()+clockOffset))/1000));status.textContent=seconds?`Winning roll. Rewards confirmed in ${seconds} seconds. The reporter can undo a mistake.`:'Recording rewards…';}else status.textContent=view.phase==='playing'?'All session players are in the race. Report each physical roll only once.':view.phase==='settling'?'Recording rewards…':'Rewards recorded. Between Turns will choose the next game.';}
}
for(let n=1;n<=20;n++){const button=document.createElement('button');button.type='button';button.textContent=String(n);button.setAttribute('aria-label',`Enter roll ${n}`);button.onclick=()=>{if(busy||pending)return;pending={action:'roll',rolls:[n],requestId:crypto.randomUUID()};void submit();};grid.append(button);}
async function refresh(){if(!connected || busy || pending || refreshing)return; refreshing=true;const version=mutationVersion;try{const next=await request<View>({action:'view'});if(busy || pending || version!==mutationVersion)return;setView(next);retry.hidden=true;if(view?.phase==='complete')post('refresh');render();}catch(e){if(!busy && !pending && version===mutationVersion)fail(e);}finally{refreshing=false;}}
async function submit(){if(busy||!pending)return;busy=true;mutationVersion++;render();try{setView(await request<View>(pending));pending=undefined;retry.hidden=true;post('refresh');}catch(e){if((e as {code?:string}).code==='failed-precondition'){pending=undefined;try{setView(await request<View>({action:'view'}));}catch{} fail(e);}else fail(e);}finally{busy=false;render();}}
$<HTMLButtonElement>('#undo').onclick=()=>{if(busy||pending||!view?.canUndo)return;pending={action:'undo',requestId:crypto.randomUUID()};void submit();};
retry.onclick=()=>{if(!connected)location.reload();else if(pending)void submit();else void refresh();};
if(window.parent===window || !allowed.includes(origin) || params.get('btVersion')!=='1' || !/^[A-Za-z0-9_-]{1,128}$/.test(nonce)){status.textContent='Open Horse Race from Between Turns.';}else{
 let lastSize=''; const reportSize=()=>{const main=$<HTMLElement>('main');const width=Math.ceil(document.documentElement.clientWidth),height=Math.ceil(main.getBoundingClientRect().height);const size=`${width}:${height}`;if(width>0 && height>0 && width<=16384 && height<=16384 && size!==lastSize){lastSize=size;window.parent.postMessage({channel:'between-turns',version:1,nonce,type:'size',width,height},origin);}}; const resize=new ResizeObserver(reportSize);resize.observe($<HTMLElement>('main'));window.addEventListener('resize',reportSize);window.addEventListener('pagehide',()=>resize.disconnect(),{once:true});
 window.addEventListener('message',async event=>{const d=event.data;if(connected||busy||event.origin!==origin||event.source!==window.parent||!d||d.channel!=='between-turns'||d.version!==1||d.nonce!==nonce||d.type!=='connect'||typeof d.grant!=='string'||typeof d.expiresAt!=='number'||d.expiresAt<=Date.now())return;busy=true;try{setView(await request<View>({action:'connect',nonce,grant:d.grant}));connected=true;post('connected');}catch(e){fail(e);post('error');}finally{busy=false;render();}});
 void request<{credential:string}>({action:'begin',nonce}).then(result=>{credential=result.credential;post('ready');}).catch(fail);
 window.setInterval(()=>void refresh(),3000);window.setInterval(()=>{if(view?.phase==='review'){render();if(view.reviewUntil && Date.now()+clockOffset>=view.reviewUntil && reviewTriggered!==view.reviewUntil){reviewTriggered=view.reviewUntil;void refresh();}}},250);
}

