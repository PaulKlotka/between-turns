const {api}=require('./cloud-admin.cjs');
const fs=require('node:fs');
(async()=>{
 const results=await Promise.all([
 api('https://cloudbilling.googleapis.com','get','/v1/projects/roll-race-paul/billingInfo'),
 api('https://cloudfunctions.googleapis.com','get','/v2/projects/between-turns-paul/locations/us-central1/functions/integrationApi'),
 api('https://cloudfunctions.googleapis.com','get','/v2/projects/rpg-rewards-paul/locations/us-central1/functions/gameApi')]);
 fs.mkdirSync('.deployment/live',{recursive:true});fs.writeFileSync('.deployment/live/before.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({billing:results[0],hub:{state:results[1].state,url:results[1].serviceConfig.uri,account:results[1].serviceConfig.serviceAccountEmail,apps:JSON.parse(results[1].serviceConfig.environmentVariables.APPS_JSON),games:JSON.parse(results[1].serviceConfig.environmentVariables.GAMES_JSON)},rewards:{state:results[2].state,url:results[2].serviceConfig.uri,account:results[2].serviceConfig.serviceAccountEmail,clients:JSON.parse(results[2].serviceConfig.environmentVariables.GAME_CLIENTS_JSON)}}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
