const fs=require('node:fs'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const projects=process.env.RPG_PROJECTS_ROOT || path.dirname(root);
const candidates=[process.env.FIRESTORE_EMULATOR_JAR,...['between-turns','rpg-rewards','rpg-bingo'].map(p=>path.join(projects,p,'.emulator-cache/cloud-firestore-emulator-v1.22.0.jar'))].filter(Boolean);
const jar=candidates.find(fs.existsSync);if(!jar)throw Error('Set FIRESTORE_EMULATOR_JAR to the Firestore emulator jar.');
const bundled='C:/Program Files/Android/Android Studio/jbr/bin/java.exe';const java=fs.existsSync(bundled)?bundled:'java';
async function listening(){return new Promise(resolve=>{const socket=net.connect(8580,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));});}
(async()=>{
 if(await listening())throw Error('Port 8580 is busy. Use test:integration with the existing emulator, or free the port first.');
 fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});const log=fs.createWriteStream(path.join(root,'artifacts/firestore-emulator.log'));
 const child=spawn(java,['-jar',jar,'--host=127.0.0.1','--port=8580','--project_id=demo-push-your-luck','--rules='+path.join(root,'firestore.rules')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log);child.stderr.pipe(log);let stopped=false;const stop=()=>{if(!stopped){stopped=true;child.kill();}};process.once('exit',stop);process.once('SIGINT',()=>{stop();process.exit(130)});
 try{
  let ready=false;for(let i=0;i<120;i++){if(await listening()){ready=true;break;}if(child.exitCode!==null)throw Error('Emulator failed; see artifacts/firestore-emulator.log');await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('Emulator startup timed out.');
  const test=spawn(process.execPath,[require.resolve('tsx/cli'),'--test','tests/integration.test.ts','tests/cross-service.test.ts'],{cwd:root,stdio:'inherit',windowsHide:true,env:{...process.env,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8580'}});
  const code=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',resolve)});process.exitCode=code ?? 1;
 }finally{stop();log.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
