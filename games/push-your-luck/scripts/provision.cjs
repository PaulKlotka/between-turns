const {api,operation}=require('./cloud-admin.cjs');
(async()=>{
 const project='push-your-luck-paul';
 const billing=await api('https://cloudbilling.googleapis.com','get',`/v1/projects/${project}/billingInfo`); if(!billing.billingEnabled || billing.billingAccountName!=='billingAccounts/01FBB3-563C94-99B565') await api('https://cloudbilling.googleapis.com','put',`/v1/projects/${project}/billingInfo`,{billingAccountName:'billingAccounts/01FBB3-563C94-99B565'});console.log('Verified existing Firebase billing account.');
 const result=await api('https://serviceusage.googleapis.com','post',`/v1/projects/${project}/services:batchEnable`,{serviceIds:['firestore.googleapis.com','cloudfunctions.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','cloudscheduler.googleapis.com','run.googleapis.com','firebasehosting.googleapis.com','iam.googleapis.com','eventarc.googleapis.com','pubsub.googleapis.com','storage.googleapis.com']});await operation('https://serviceusage.googleapis.com',result);console.log('Enabled required APIs.');
 const info=await api('https://cloudresourcemanager.googleapis.com','get',`/v1/projects/${project}`);console.log('Project number: '+info.projectNumber);
 try{await api('https://iam.googleapis.com','post',`/v1/projects/${project}/serviceAccounts`,{accountId:'push-your-luck-runtime',serviceAccount:{displayName:'Push Your Luck runtime'}});}catch(e){if(e.status!==409 && !/already exists/i.test(e.message))throw e;}
 const policy=await api('https://cloudresourcemanager.googleapis.com','post',`/v1/projects/${project}:getIamPolicy`,{});
 const grants=[['roles/datastore.user',`serviceAccount:push-your-luck-runtime@${project}.iam.gserviceaccount.com`],['roles/logging.logWriter',`serviceAccount:${info.projectNumber}-compute@developer.gserviceaccount.com`],['roles/artifactregistry.writer',`serviceAccount:${info.projectNumber}-compute@developer.gserviceaccount.com`],['roles/storage.objectViewer',`serviceAccount:${info.projectNumber}-compute@developer.gserviceaccount.com`]];
 for(const [role,member]of grants){let b=policy.bindings.find(b=>b.role===role && !b.condition);if(!b){b={role,members:[]};policy.bindings.push(b);}if(!b.members.includes(member))b.members.push(member);}
 await api('https://cloudresourcemanager.googleapis.com','post',`/v1/projects/${project}:setIamPolicy`,{policy});
 try{await operation('https://firestore.googleapis.com',await api('https://firestore.googleapis.com','post',`/v1/projects/${project}/databases?databaseId=(default)`,{locationId:'us-central1',type:'FIRESTORE_NATIVE',databaseEdition:'STANDARD'}));}catch(e){if(e.status!==409 && !/already exists/i.test(e.message))throw e;}
 console.log('Runtime IAM and Firestore configured.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
