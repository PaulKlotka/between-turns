import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const workspace = path.resolve('.integration-work');
const output = path.resolve('docs/integration'); fs.mkdirSync(output,{recursive:true});
function copyTree(source,target) { fs.mkdirSync(target,{recursive:true}); for(const e of fs.readdirSync(source,{withFileTypes:true})) { if(['node_modules','lib','.git'].includes(e.name)) continue; const a=path.join(source,e.name),b=path.join(target,e.name); if(e.isDirectory()) copyTree(a,b); else fs.copyFileSync(a,b); } }
function prepare(name) {
 const source=path.join(process.env.RPG_PROJECTS_ROOT || path.dirname(process.cwd()),name), target=path.join(workspace,name); fs.mkdirSync(target,{recursive:true});
 for(const dir of ['src','shared','functions/src','tests']) if(fs.existsSync(path.join(source,dir))) copyTree(path.join(source,dir),path.join(target,dir));
 for(const file of ['package.json','tsconfig.json','vite.config.ts','firebase.json','index.html','functions/package.json','functions/tsconfig.json']) if(fs.existsSync(path.join(source,file))) {fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.copyFileSync(path.join(source,file),path.join(target,file));}
 if (name === 'rpg-bingo' && !fs.existsSync(path.join(target,'integrations'))) fs.symlinkSync(path.join(source,'integrations'),path.join(target,'integrations'),'junction');
 for(const dir of ['node_modules','functions/node_modules']) {const dest=path.join(target,dir);if(!fs.existsSync(dest))fs.symlinkSync(path.join(source,dir),dest,'junction');}
 return {source,target,changed:[]};
}
function edit(project,file,transform) { const dest=path.join(project.target,file),old=fs.readFileSync(dest,'utf8');const next=transform(old);if(next===old)return;fs.writeFileSync(dest,next);project.changed.push(file); }
const hub=prepare('between-turns');
edit(hub,'shared/types.ts',s=>s.replace("playerId: string; runId?: string }","playerId: string; runId?: string; gameId?: string }"));
edit(hub,'functions/src/service.ts',s=>s.replace("return this.context(member, command.playerId, app.kind);", "if (app.kind === 'rewards' && command.runId) assert(member.phase === 'playing' && member.run?.id === command.runId && member.run.gameId === command.gameId, 'permission-denied', 'Game instance is not active.');\n        return this.context(member, command.playerId, command.runId ? 'game' : app.kind);"));
edit(hub,'src/main.ts',s=>s.includes('data-page="reward-history"') ? s : s.replace('  page = next;', '  page = next;\n  if (view) renderRewards();').replace('<button data-page="rewards">My Rewards</button>','<button data-page="rewards">My Rewards</button><button data-page="reward-history">Session History</button>')
 .replace('<section id="page-session"', '<section id="page-reward-history" class="page" aria-label="Session History" hidden><p id="reward-history-note" class="muted">Session history appears when Rewards is connected and the session is active.</p><div id="reward-history-embed"></div></section>\n      <section id="page-session"')
 .replace("['game', 'rewards', 'session']", "['game', 'rewards', 'reward-history', 'session']")
 .replace('  updateGameLayout();\n}', '  if (view) renderRewards();\n  updateGameLayout();\n}')
 .replace("const key = !view.expired && app ? `${view.session.id}:${app.embedUrl}` : '';", "const key = !view.expired && app ? `${view.session.id}:${app.embedUrl}:${page === 'reward-history' ? 'history' : 'inventory'}` : '';")
 .replace("const placeholder = $('#page-rewards .placeholder');", "$('#reward-history-note').hidden = !!key; const placeholder = $('#page-rewards .placeholder');")
 .replace("$('#page-rewards').append(host);", "(page === 'reward-history' ? $('#reward-history-embed') : $('#page-rewards')).append(host);")
 .replace("title: 'My Rewards'", "title: page === 'reward-history' ? 'Session History' : 'My Rewards'")
 .replace("url: app.embedUrl, appId: app.id", "url: (() => { const url = new URL(app.embedUrl); url.searchParams.set('view', page === 'reward-history' ? 'history' : 'inventory'); return url.href; })(), appId: app.id"));
edit(hub,'src/embed.ts',s=>s.replace("event.data.type === 'ready' && !connecting && !connected", "event.data.type === 'ready' && !connecting"));
edit(hub,'src/style.css',s=>s.includes('#rewards-embed .game-frame') ? s : s+'\n#rewards-embed .game-frame{min-height:70vh;width:100%;border:0}.navigation{flex-wrap:wrap}\n');
edit(hub,'firebase.json',s=>s.replace('frame-src https://www.google.com https://recaptcha.google.com;', 'frame-src https://www.google.com https://recaptcha.google.com https://rpg-rewards-paul.web.app https://rpg-bingo-paul.web.app;'));
const bingo=prepare('rpg-bingo');
edit(bingo,'functions/src/embedded-service.ts',s=>s.replace('this.gateway.draw({ ...c, playerId: run.offerPlayerId })','this.gateway.draw(c)'));
edit(bingo,'functions/src/integration-gateway.ts',s=>s.replace("requestId: eventId('offer', c.runId)", "requestId: eventId(`offer/${c.playerId}`, c.runId)"));
for(const project of [hub,bingo]) {
 let patch='';
 for(const file of project.changed) {
  const result=spawnSync('git',['diff','--no-index','--',path.join(project.source,file),path.join(project.target,file)],{encoding:'utf8'});
  if(result.status!==1)throw Error(result.stderr||'Diff failed');
  let part=result.stdout;
  const lines=part.split('\n');
  lines[0]=`diff --git a/${file} b/${file}`;
  const a=lines.findIndex(s=>s.startsWith('--- ')),b=lines.findIndex(s=>s.startsWith('+++ '));
  lines[a]=`--- a/${file}`;lines[b]=`+++ b/${file}`;patch+=lines.join('\n');
 }
 if(patch) fs.writeFileSync(path.join(output,`${path.basename(project.source)}.patch`),patch);
 console.log(`${project.source}: ${project.changed.length} files staged in ${project.target}`);
}


