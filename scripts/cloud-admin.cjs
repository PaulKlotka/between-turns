const path=require('node:path');
process.env.XDG_CONFIG_HOME=path.resolve(__dirname,'../.firebase-config');
const cliRoot=path.dirname(require.resolve('firebase-tools/package.json',{paths:[path.resolve(__dirname,'../../between-turns'),path.join(process.env.APPDATA,'npm')]}));
const auth=require(path.join(cliRoot,'lib/auth'));
const {Client,setRefreshToken}=require(path.join(cliRoot,'lib/apiv2'));
const account=auth.getGlobalDefaultAccount();if(!account)throw Error('Firebase sign-in required.');setRefreshToken(account.tokens.refresh_token);
const clients=new Map();
async function api(origin,method,resource,body){if(!clients.has(origin))clients.set(origin,new Client({urlPrefix:origin,auth:true}));const client=clients.get(origin);return (method==='get'?await client.get(resource):await client[method](resource,body)).body;}
async function operation(origin,initial,version='v1'){if(!initial.name || initial.done){if(initial.error)throw Error(initial.error.message);return initial;}for(let i=0;i<90;i++){await new Promise(r=>setTimeout(r,2000));const state=await api(origin,'get',`/${version}/${initial.name}`);if(state.error)throw Error(state.error.message);if(state.done)return state;}throw Error('Cloud operation still pending: '+initial.name);}
module.exports={api,operation};
