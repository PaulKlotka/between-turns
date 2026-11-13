// Stage deployable sibling sources inside this checkout; never write sibling repositories.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const projects=process.env.RPG_PROJECTS_ROOT || path.resolve(root,'..');
function stage(name){
 const source=path.join(projects,name),target=path.join(root,'.deployment',name);
 for(const dir of ['shared','src','functions/src','scripts'])if(fs.existsSync(path.join(source,dir)))fs.cpSync(path.join(source,dir),path.join(target,dir),{recursive:true});
 for(const file of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','firebase.json','firestore.rules','firestore.indexes.json','functions/package.json','functions/package-lock.json','functions/tsconfig.json'])if(fs.existsSync(path.join(source,file))){fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.copyFileSync(path.join(source,file),path.join(target,file));}
 return target;
}
const hub=stage('between-turns'),rewards=stage('rpg-rewards');
const file=path.join(hub,'functions/src/service.ts');let code=fs.readFileSync(file,'utf8');
const before='memberCount: Object.keys(s.members).length };';
const after="memberCount: Object.keys(s.members).length, connectedCount: Object.keys(s.members).filter(id => connected(s, id, this.now())).length, members: Object.values(s.members).map(m => ({ id: m.id, name: m.name, connected: connected(s, m.id, this.now()) })) };";
if(!code.includes(before))throw Error('Hub context changed: review the roster patch before staging.');
fs.writeFileSync(file,code.replace(before,after));
const types=path.join(hub,'shared/types.ts');code=fs.readFileSync(types,'utf8');
const typeBefore='memberCount?: number; }';
if(!code.includes(typeBefore))throw Error('Hub context type changed: review before staging.');
fs.writeFileSync(types,code.replace(typeBefore,'memberCount?: number; connectedCount?: number; members?: { id: string; name: string; connected: boolean }[]; }'));
// Add only the new frame origin. Registration is merged from live values at deployment.
const hosting=JSON.parse(fs.readFileSync(path.join(hub,'firebase.json'),'utf8'));
for(const rule of hosting.hosting.headers ?? [])for(const header of rule.headers ?? [])if(header.key.toLowerCase()==='content-security-policy')header.value=header.value.replace(/frame-src ([^;]+);/,(_m,origins)=>`frame-src ${origins} https://push-your-luck-paul.web.app;`);
fs.writeFileSync(path.join(hub,'firebase.json'),JSON.stringify(hosting,null,2)+'\n');
fs.mkdirSync(path.join(root,'docs/integration'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/integration/hub-roster.patch'),`diff --git a/functions/src/service.ts b/functions/src/service.ts\n--- a/functions/src/service.ts\n+++ b/functions/src/service.ts\n@@ -258 +258 @@\n-    ${fs.readFileSync(path.join(projects,'between-turns/functions/src/service.ts'),'utf8').split(/\r?\n/)[257].trim()}\n+    ${fs.readFileSync(file,'utf8').split(/\r?\n/)[257].trim()}\ndiff --git a/shared/types.ts b/shared/types.ts\n--- a/shared/types.ts\n+++ b/shared/types.ts\n@@ -${fs.readFileSync(types,'utf8').split(/\r?\n/).findIndex(x=>x.startsWith('export interface ConnectionContext'))+1} +${fs.readFileSync(types,'utf8').split(/\r?\n/).findIndex(x=>x.startsWith('export interface ConnectionContext'))+1} @@\n-${fs.readFileSync(path.join(projects,'between-turns/shared/types.ts'),'utf8').split(/\r?\n/).find(x=>x.startsWith('export interface ConnectionContext'))}\n+${fs.readFileSync(types,'utf8').split(/\r?\n/).find(x=>x.startsWith('export interface ConnectionContext'))}\n`);
console.log('Staged hub roster/presence extension, Hosting policy and Rewards sources.');
