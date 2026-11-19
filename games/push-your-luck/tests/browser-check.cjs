const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const {makeRace,syncMembers,applyRoll,bank,undoRoll,undoBank,publicView}=require('../functions/lib/race.js');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const errors=[],calls=[];
 const context=await browser.newContext({viewport:{width:1366,height:768}});
 const offer={id:'offer',reward:{id:'prize',name:'A little extra luck',qualifyingRoll:'Use this reward on your next check.'}};
 let race={...syncMembers(makeRace('session','run'),[{id:'p',name:'Paul',connected:true},{id:'sam',name:'Sam',connected:true}],2),offer},connectedCount=2;
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='between-turns-paul.web.app')return route.fulfill({contentType:'text/html',body:`<style>body{margin:0;background:#111d24}iframe{width:100%;height:calc(100vh - 80px);border:0}</style><div style="height:80px"></div><iframe src="https://luck.example/embed?btVersion=1&btParentOrigin=https%3A%2F%2Fbetween-turns-paul.web.app&btNonce=nonce"></iframe><script>addEventListener('message',e=>{if(e.origin==='https://luck.example'&&e.data.type==='ready')e.source.postMessage({channel:'between-turns',version:1,nonce:'nonce',type:'connect',grant:'grant',expiresAt:Date.now()+60000},'https://luck.example')})</script>`});
  if(url.hostname!=='luck.example')return route.abort();
  if(url.pathname==='/embeddedApi'){
   const data=route.request().postDataJSON();calls.push({data,authorization:route.request().headers().authorization});
   try{
    if(data.action==='roll')race=applyRoll(race,'p',data.roll,'event',connectedCount,Date.now());
    if(data.action==='bank')race=bank(race,'p','event',Date.now());
    if(data.action==='undo-roll')race=undoRoll(race,'p',Date.now());
    if(data.action==='undo-bank')race=undoBank(race,'p',Date.now());
    return route.fulfill({json:{result:data.action==='begin'?{credential:'A'.repeat(43)}:publicView(race,'p',connectedCount,Date.now())}});
   }catch(e){return route.fulfill({status:409,json:{error:{code:'failed-precondition',message:e.message}}});}
  }
  const file=url.pathname.startsWith('/assets/')?path.join('dist',url.pathname.slice(1)):'dist/index.html';
  return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://between-turns-paul.web.app');const frame=page.frameLocator('iframe');await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('0 banked');
 const child=page.frames().find(f=>f.url().startsWith('https://luck.example/'));
 for(const [width,height] of [[1366,768],[1440,900],[1024,600]]){
  await page.setViewportSize({width,height});
  const fits=await child.evaluate(()=>({horizontal:document.documentElement.scrollWidth<=innerWidth,vertical:document.documentElement.scrollHeight<=innerHeight}));
  expect(fits.horizontal,`desktop ${width}x${height} horizontal overflow`).toBe(true);
 }
 await frame.getByRole('button',{name:'Enter roll 12',exact:true}).click();await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('12 at risk');await expect(frame.locator('#bank')).toHaveText('Bank 12 treasure');await expect(frame.getByRole('button',{name:'Enter roll 13',exact:true})).toBeDisabled();
 await frame.locator('#bank').click();await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('12 banked');await expect(frame.locator('#bank')).toHaveText('Sitting out the next roll');await frame.locator('#undo-bank').click();await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('12 at risk');await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('0 banked');
 await frame.locator('#undo-roll').click();await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('0 at risk');await expect(frame.getByRole('button',{name:'Enter roll 12',exact:true})).toBeEnabled();
 // With only one connected member, multiplayer continues and repeat entries work.
 connectedCount=1;await frame.getByRole('button',{name:'Enter roll 19',exact:true}).click();await frame.getByRole('button',{name:'Enter roll 19',exact:true}).click();await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('38 at risk');
 // Win by pressing Bank and verify pause and correction controls.
 race.players.p.atRisk=110;race.revision++;await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('110 at risk',{timeout:10000});await frame.locator('#bank').click();await expect(frame.locator('#status')).toContainText('Result confirms');await expect(frame.locator('#result')).toContainText('Paul wins');await expect(frame.getByRole('button',{name:'Enter roll 1',exact:true})).toBeDisabled();await expect(frame.locator('#undo-bank')).toBeVisible();await frame.locator('#undo-bank').click();await expect(frame.locator('.race-row.me .race-label span:last-child')).toContainText('110 at risk');
 race={...syncMembers(makeRace('solo','run'),[{id:'p',name:'Paul',connected:true}],1),offer};connectedCount=1;race.revision=100;await expect(frame.locator('.turn-row')).toContainText('0 / 10 rolls',{timeout:10000});
 for(let i=0;i<9;i++) await frame.getByRole('button',{name:'Enter roll 2',exact:true}).click();
 await expect(frame.locator('.turn-row')).toContainText('9 / 10 rolls');await expect(frame.locator('.bar-turns')).toHaveCSS('width', /px/);
 await frame.getByRole('button',{name:'Enter roll 2',exact:true}).click();await expect(frame.locator('.turn-row')).toContainText('10 / 10 rolls');await expect(frame.locator('#result')).toContainText('Solo complete');await expect(frame.locator('.race-row.me')).toContainText('20 banked');
 fs.mkdirSync('artifacts',{recursive:true});await page.setViewportSize({width:1366,height:768});await child.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const fresh=await context.newPage();await fresh.goto('https://between-turns-paul.web.app');await expect(fresh.frameLocator('iframe').locator('.race-row.me .race-label span:last-child')).toContainText('20 banked');await fresh.screenshot({path:'artifacts/desktop-preview.png'});await fresh.close();
 for(const width of [320,390]){await page.setViewportSize({width,height:844});expect(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await frame.locator('#bank').scrollIntoViewIfNeeded();await expect(frame.locator('#bank')).toBeVisible();await frame.getByRole('button',{name:'Enter roll 20',exact:true}).scrollIntoViewIfNeeded();await expect(frame.getByRole('button',{name:'Enter roll 20',exact:true})).toBeVisible();}
 await page.screenshot({path:'artifacts/mobile.png'});
 expect(calls.filter(c=>!['begin'].includes(c.data.action)).every(c=>c.authorization==='Bearer '+'A'.repeat(43))).toBe(true);
 expect(errors).toEqual([]);
 console.log('PASS: 3 desktop sizes without scrolling; 320/390px controls; roll/bank/undo; multiplayer turn lock; review pause; credential header.');
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});


