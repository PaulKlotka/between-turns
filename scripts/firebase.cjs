const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),projects=process.env.RPG_PROJECTS_ROOT || path.dirname(root);
let cli;
for(const base of [root,path.join(projects,'between-turns'),process.env.APPDATA?path.join(process.env.APPDATA,'npm'):null].filter(Boolean)){
 try{cli=require.resolve('firebase-tools/lib/bin/firebase.js',{paths:[base]});break;}catch{}
}
if(!cli)throw Error('Install firebase-tools locally or globally before using this command.');
const child=spawn(process.execPath,['--use-system-ca',cli,...process.argv.slice(2)],{cwd:process.cwd(),stdio:'inherit',env:{...process.env,XDG_CONFIG_HOME:path.join(root,'.firebase-config'),NODE_USE_SYSTEM_CA:'1'}});
child.on('exit',code=>process.exit(code ?? 1));process.on('SIGINT',()=>child.kill('SIGINT'));
