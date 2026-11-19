const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(process.argv[2]||'.'),project=process.argv[3],source=path.join(base,'functions');
process.loadEnvFile(path.join(source,'.env.'+project));
process.env.GCLOUD_PROJECT=project;process.env.FIREBASE_CONFIG=JSON.stringify({projectId:project});process.env.FUNCTIONS_CONTROL_API='true';process.env.FUNCTIONS_MANIFEST_OUTPUT_PATH=path.join(source,'functions.yaml');
process.argv=[process.execPath,'firebase-functions',source,'--manifest'];
require(path.resolve(__dirname,'../functions/node_modules/firebase-functions/lib/bin/firebase-functions.js'));
