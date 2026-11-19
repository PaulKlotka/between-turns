import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { RaceService } from './service';
import { RemoteGateway } from './integration-gateway';
initializeApp();
const service=()=>new RaceService(getFirestore(),new RemoteGateway());
const runtime=process.env.FUNCTIONS_EMULATOR==='true' ? undefined : process.env.HORSE_RACE_RUNTIME_SERVICE_ACCOUNT;
export const horseRaceApi=onRequest({region:'us-central1',invoker:'private',maxInstances:3,timeoutSeconds:60,cors:false,serviceAccount:runtime},async(req,res)=>{
 res.set('Cache-Control','no-store'); if(req.method!=='POST'){res.status(405).end();return;}
 const allowed=(process.env.HORSE_RACE_BROWSER_ORIGINS || '').split(',').map(x=>x.trim());
 if(req.get('Origin') && !allowed.includes(req.get('Origin')!)){res.status(403).end();return;}
 try { const data=req.body; if(!data || typeof data!=='object' || Array.isArray(data) || JSON.stringify(data).length>8192) throw new HttpsError('invalid-argument','Invalid request.');
  let result:unknown; if(data.action==='begin') result=await service().begin(data.nonce); else {const credential=req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]; if(!credential) throw new HttpsError('unauthenticated','Connect through Between Turns.'); result=data.action==='connect' ? await service().connect(credential,data.nonce,data.grant) : await service().command(credential,data);}
  res.json({result});
 } catch(e) {const known=e instanceof HttpsError; if(!known){const error=e as {name?:string;message?:string;code?:string|number;response?:{status?:number;data?:{error?:{code?:string}}}};console.error('Embedded request failed',JSON.stringify({name:error?.name,code:error?.code,status:error?.response?.status,remoteCode:error?.response?.data?.error?.code,message:error?.message}));} res.status(known ? (e.code==='unauthenticated'?401:409):503).json({error:{code:known?e.code:'unavailable',message:known?e.message:'Unable to reach the game services. Please retry.'}});}
});
export const maintainHorseRaces=onSchedule({schedule:'every 1 minutes',maxInstances:1,timeoutSeconds:300,serviceAccount:runtime},async()=>{await service().maintain();});


