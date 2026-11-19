const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'functions/node_modules'),target=path.join(root,'.deployment/node_modules');
if(!fs.existsSync(path.join(target,'firebase-admin/package.json')))fs.cpSync(source,target,{recursive:true});
console.log('Prepared isolated integration dependencies.');
