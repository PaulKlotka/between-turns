const {api}=require('./cloud-admin.cjs');const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),account='push-your-luck-runtime@push-your-luck-paul.iam.gserviceaccount.com';
function dotenv(values){return Object.entries(values).map(([k,v])=>{if(v.includes("'"))throw Error('Review dotenv quoting for '+k);return `${k}='${v}'`;}).join('\n')+'\n';}
(async()=>{
 const hub=await api('https://cloudfunctions.googleapis.com','get','/v2/projects/between-turns-paul/locations/us-central1/functions/integrationApi');
 const rewards=await api('https://cloudfunctions.googleapis.com','get','/v2/projects/rpg-rewards-paul/locations/us-central1/functions/gameApi');
 const h=hub.serviceConfig.environmentVariables,r=rewards.serviceConfig.environmentVariables;
 const apps=JSON.parse(h.APPS_JSON),games=JSON.parse(h.GAMES_JSON),clients=JSON.parse(r.GAME_CLIENTS_JSON);
 if(!apps.some(a=>a.id==='push-your-luck'))apps.push({id:'push-your-luck',kind:'game',origin:'https://push-your-luck-paul.web.app',serviceAccount:account});
 if(!games.some(g=>g.id==='push-your-luck'))games.push({id:'push-your-luck',name:'Push Your Luck',description:'Bank treasure from table d20 rolls, or risk it for a bigger haul.',ready:false,embedUrl:'https://push-your-luck-paul.web.app/embed'});
 clients['push-your-luck']={serviceAccount:account,redirectUris:[]};
 const hubEnv={APPS_JSON:JSON.stringify(apps),GAMES_JSON:JSON.stringify(games),GAME_API_AUDIENCE:h.GAME_API_AUDIENCE,HUB_RUNTIME_SERVICE_ACCOUNT:h.HUB_RUNTIME_SERVICE_ACCOUNT};
 const rewardsEnv=Object.fromEntries(Object.entries(r).filter(([key])=>['REWARDS_RUNTIME_SERVICE_ACCOUNT','GAME_API_AUDIENCE','GAME_CLIENTS_JSON','BETWEEN_TURNS_API_URL','REWARDS_BROWSER_ORIGINS'].includes(key)));rewardsEnv.GAME_CLIENTS_JSON=JSON.stringify(clients);
 fs.writeFileSync(path.join(root,'.deployment/between-turns/functions/.env.between-turns-paul'),dotenv(hubEnv));
 fs.writeFileSync(path.join(root,'.deployment/rpg-rewards/functions/.env.rpg-rewards-paul'),dotenv(rewardsEnv));
 const response=await fetch('https://between-turns-paul.web.app');const livePolicy=response.headers.get('content-security-policy');if(!livePolicy?.includes('frame-src '))throw Error('Review hub Hosting policy before deployment.');
 const policy=livePolicy.replace(/frame-src ([^;]+);/,(_m,origins)=>`frame-src ${origins} https://push-your-luck-paul.web.app;`);
 const configPath=path.join(root,'.deployment/between-turns/firebase.json'),config=JSON.parse(fs.readFileSync(configPath,'utf8'));
 for(const rule of config.hosting.headers)for(const header of rule.headers)if(header.key.toLowerCase()==='content-security-policy')header.value=policy;
 fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
 fs.writeFileSync(path.join(root,'.deployment/live/merged-registrations.json'),JSON.stringify({apps,games,clients},null,2));
 console.log('Prepared merged live registries with the new game disabled, preserving all existing registrations and the live frame policy. No live changes made.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
