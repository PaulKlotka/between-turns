const {chromium}=require('@playwright/test');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext();
await context.route(/^https:\/\/(?:[^/]+\.googleapis\.com|www\.google\.com|www\.gstatic\.com|recaptcha\.google\.com)\//,async route=>{try{const r=route.request(),h={...r.headers()};delete h['accept-encoding'];delete h['content-length'];const res=await fetch(r.url(),{method:r.method(),headers:h,body:r.postDataBuffer()||undefined,signal:AbortSignal.timeout(30000)});const headers=Object.fromEntries(res.headers);delete headers['content-encoding'];delete headers['content-length'];await route.fulfill({status:res.status,headers,body:Buffer.from(await res.arrayBuffer())});}catch{await route.abort();}});
const page=await context.newPage();
page.on('requestfailed',r=>{const u=new URL(r.url());if(!u.pathname.includes('log'))console.log('Network failure',u.origin+u.pathname,r.failure()?.errorText)});
page.on('response',async r=>{if(r.status()>=400){const u=new URL(r.url());console.log('HTTP failure',r.status(),u.origin+u.pathname);if((u.hostname.endsWith('cloudfunctions.net')||u.hostname.includes('firebaseappcheck.googleapis.com')))try{const d=await r.json();console.log('Function error',JSON.stringify(d.error));}catch{}}});
await page.goto('https://between-turns-paul.web.app/');
try{await page.locator('#welcome').waitFor({state:'visible',timeout:20000});console.log('Welcome visible');}catch{console.log('Connection status',await page.locator('#connection').innerText());}
await browser.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
