import './style.css';
import type { RewardsView } from '../shared/integration';
import { undoUseRemaining, type Award } from '../shared/model';
const app = document.querySelector<HTMLElement>('#app')!;
const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const p = new URLSearchParams(location.search), nonce = p.get('btNonce') || '', origin = p.get('btParentOrigin') || '';
const allowed = (import.meta.env.VITE_BETWEEN_TURNS_ORIGINS || 'https://between-turns-paul.web.app').split(',');
if (import.meta.env.DEV) allowed.push('http://127.0.0.1:5180');
const embedded = parent !== window && p.get('btVersion') === '1' && /^[A-Za-z0-9_-]{1,128}$/.test(nonce) && allowed.includes(origin);
let credential = '', view: RewardsView | undefined, offset = 0, busy = false, connected = false;
let notice = 'Connecting through Between Turns.', page = p.get('view') === 'history' ? 'history' : 'inventory';
let pending: Record<string, unknown> | undefined;
let revision = 0, markup = '';
function render(html: string) {
  if (markup === html) return;
  const focused = document.activeElement as HTMLElement | null;
  const key = focused?.dataset.award;
  const id = focused?.id;
  app.innerHTML = html; markup = html;
  if (key) app.querySelector<HTMLElement>(`[data-award="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
  else if (id) document.getElementById(id)?.focus({preventScroll:true});
}
function send(type: string) { parent.postMessage({channel:'between-turns',version:1,type,nonce}, origin); }
async function request<T>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch('/embeddedApi', {method:'POST',headers:{'Content-Type':'application/json',...(credential ? {Authorization:`Bearer ${credential}`} : {})},body:JSON.stringify(input),signal:AbortSignal.timeout(25000)});
  const body = await response.json();
  if (!response.ok || body.error) {
    if (['permission-denied','unauthenticated'].includes(body.error?.code) || (input.action === 'view' && body.error?.code === 'failed-precondition')) { view = undefined; connected = false; }
    throw Object.assign(new Error(body.error?.message || 'Rewards is temporarily unavailable.'), {code:body.error?.code});
  }
  return body.result as T;
}
function draw() {
  const history = page === 'history', now = Date.now() + offset;
  const remaining = view ? Math.max(0, ...view.inventory.map(a => undoUseRemaining(a, now))) : 0;
  const awards = history ? view?.history : view?.inventory;
  render(`<main class="embedded-rewards"><h1>${history ? 'Session History' : 'My Rewards'}</h1><p class="muted">${history ? 'Rewards won by everyone in this session.' : view?.persistent ? 'Your saved rewards from every session. They stay with your account.' : 'Guest rewards last for this session. Sign in with Google in Between Turns to keep them.'}</p><div role="status" aria-live="polite" class="${notice ? 'notice' : ''}">${esc(notice)}</div>${!history && remaining > 0 ? `<p>${Math.ceil(remaining/1000)}s to undo your last use. Other rewards are locked.</p>` : ''}<div class="reward-list">${awards?.length ? awards.map(a => {
    const mine = !history && 'consumedAt' in a ? a as Award : undefined, undo = mine ? undoUseRemaining(mine, now) : 0;
    return `<article class="reward-card${mine?.consumedAt != null ? ' consumed' : ''}"><div class="reward-info"><div class="reward-top"><h2>${esc(a.reward.name)}</h2><span class="bonus">+1</span></div><p>+1 to one ${esc(a.reward.qualifyingRoll)}.</p>${history ? `<p class="reward-meta"><strong>${esc(a.playerName)}</strong></p>` : ''}</div>${mine ? mine.consumedAt !== null && !undo ? '<span class="state-pill">Used</span>' : `<button class="${mine.consumedAt === null ? 'use-button' : 'undo-button'}" data-award="${esc(mine.id)}" data-consumed="${mine.consumedAt === null}" ${busy || pending || (mine.consumedAt === null && remaining > 0) ? 'disabled' : ''}>${mine.consumedAt === null ? 'Use reward' : `Undo use (${Math.ceil(undo/1000)}s)`}</button>` : ''}</article>`;
  }).join('') : view ? `<p class="empty">${history ? 'No rewards have been won in this session yet.' : 'Rewards you win will appear here.'}</p>` : ''}</div>${pending ? '<button id="retry" class="secondary">Retry reward update</button>' : ''}${!connected ? '<button id="reconnect" class="secondary">Reconnect</button>' : ''}</main>`);
}
async function refresh() { const version = ++revision; const next = await request<RewardsView>({action:'view'}); if (version !== revision) return; view = next; offset = next.serverNow - Date.now(); draw(); }
async function start() {
  view = undefined; connected = false; notice = 'Connecting through Between Turns.'; draw();
  try { credential = (await request<{credential:string}>({action:'begin',nonce})).credential; send('ready'); }
  catch(error) { notice = (error as Error).message; draw(); }
}
async function mutate() {
  if (!pending || busy) return;
  busy = true; revision++; draw();
  try { await request(pending); pending = undefined; notice = ''; await refresh(); send('refresh'); }
  catch(error) { notice = (error as Error).message; const code = (error as {code?:string}).code; if (code && !['unavailable','internal','deadline-exceeded'].includes(code)) pending = undefined; }
  finally { busy = false; draw(); }
}
if (!embedded) app.innerHTML = '<main class="embedded-rewards"><h1>RPG Rewards</h1><p>Open your rewards from Between Turns.</p><a href="https://between-turns-paul.web.app/">Open Between Turns</a></main>';
else {
  window.addEventListener('message', event => {
    const d = event.data;
    if (event.source !== parent || event.origin !== origin || !d || d.channel !== 'between-turns' || d.version !== 1 || d.nonce !== nonce) return;
    if (d.type === 'rewards-view' && ['inventory','history'].includes(d.view)) { page = d.view; draw(); return; }
    if (d.type !== 'connect' || connected || busy || typeof d.grant !== 'string' || !d.grant.length || d.grant.length > 1024 || !Number.isFinite(d.expiresAt) || d.expiresAt <= Date.now()) return;
    busy = true;
    void request<RewardsView>({action:'connect',nonce,grant:d.grant}).then(next => { view = next; offset = next.serverNow-Date.now(); connected = true; notice = ''; send('connected'); }).catch(error => { notice = error.message; send('error'); }).finally(() => { busy = false; draw(); });
  });
  app.addEventListener('click', event => {
    const b = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b || b.disabled || busy) return;
    if (b.id === 'reconnect') { void start(); return; }
    if (b.id === 'retry') { void mutate(); return; }
    if (!b.dataset.award || pending) return;
    pending = {action:'consume',awardId:b.dataset.award,consumed:b.dataset.consumed === 'true',requestId:crypto.randomUUID()}; void mutate();
  });
  setInterval(() => { if (connected && !busy && !document.hidden) void refresh().catch(error => { notice = error.message; draw(); }); }, 3000);
  setInterval(() => { if (connected && !document.hidden) draw(); }, 250);
  void start();
}
