const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const {makeRace,syncMembers,applyRolls,undoRoll,publicView}=require('../functions/lib/race');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 let race=syncMembers(makeRace('session','run'),[{id:'a',name:'A <script>'},{id:'b',name:'B'},{id:'c',name:'C'}],()=>0);
 race.players[2].numbers=[10,11,12,13];race.offer={id:'offer',reward:{id:'prize',name:'Shared Prize',qualifyingRoll:'Use your reward'}};
 const calls=[];const context=await browser.newContext({viewport:{width:1100,height:900}});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname==='between-turns-paul.web.app')return route.fulfill({contentType:'text/html',body:`<html><body style="margin:0"><iframe title="Horse Race" style="width:100%;height:880px;border:0" src="https://horse-race-paul.web.app/embed?btVersion=1&btParentOrigin=https%3A%2F%2Fbetween-turns-paul.web.app&btNonce=test-nonce"></iframe><script>addEventListener('message',e=>{if(e.data.type==='ready')e.source.postMessage({channel:'between-turns',version:1,nonce:'test-nonce',type:'connect',grant:'grant',expiresAt:Date.now()+60000},'https://horse-race-paul.web.app')})</script></body></html>`});
  if(u.hostname==='horse-race-paul.web.app'){
   if(u.pathname==='/embeddedApi'){
    const data=route.request().postDataJSON();calls.push(data);
    if(data.action==='roll')race=applyRolls(race,'c','C',data.rolls,'event',3);
    if(data.action==='undo')race=undoRoll(race,'c',3,Date.now());
    return route.fulfill({json:{result:data.action==='begin'?{credential:'A'.repeat(43)}:publicView(race,'c',3)}});
   }
   const file=u.pathname.startsWith('/assets/')?path.join('dist',u.pathname.slice(1)):'dist/index.html';
   return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
  }
  return route.abort();
 });
 const page=await context.newPage();await page.goto('https://between-turns-paul.web.app');const frame=page.frameLocator('iframe');
 await expect(frame.locator('progress')).toHaveCount(3);await expect(frame.locator('.horse-heading strong').first()).toHaveText('A <script>');await expect(frame.locator('#grid button')).toHaveCount(20);
 expect(await frame.locator('#grid button').allTextContents()).toEqual(Array.from({length:20},(_,i)=>String(i+1)));
 const child=page.frames().find(f=>f.url().startsWith('https://horse-race-paul.web.app/'));
 fs.mkdirSync('.ops',{recursive:true});
 for(const width of [1100,390,320]){await page.setViewportSize({width,height:900});expect(await child.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`.ops/horse-race-${width}.png`,fullPage:true});}
 await frame.getByRole('button',{name:'Enter roll 1',exact:true}).click();
 await expect(frame.locator('progress').nth(0)).toHaveAttribute('value','1');await expect(frame.locator('progress').nth(1)).toHaveAttribute('value','1');await expect(frame.locator('progress').nth(2)).toHaveAttribute('value','0');
 await expect(frame.getByRole('button',{name:'Enter roll 1',exact:true})).toBeEnabled();await frame.getByRole('button',{name:'Undo roll',exact:true}).click();await expect(frame.locator('progress').nth(0)).toHaveAttribute('value','0');
 for(let i=0;i<10;i++){await frame.getByRole('button',{name:'Enter roll 1',exact:true}).click();await expect(frame.locator('progress').nth(0)).toHaveAttribute('value',String(i+1));}
 await expect(frame.locator('#challenge')).toHaveText('Shared victory!');await expect(frame.locator('#grid')).toBeHidden();await expect(frame.locator('#status')).toContainText('seconds');await expect(frame.locator('.winner')).toHaveCount(2);
 await frame.getByRole('button',{name:'Undo roll',exact:true}).click();await expect(frame.locator('#challenge')).toHaveText('Race to ten');await expect(frame.locator('progress').nth(0)).toHaveAttribute('value','9');await expect(frame.locator('progress').nth(1)).toHaveAttribute('value','9');
 expect(calls.filter(c=>c.action==='roll').every(c=>c.rolls.length===1&&c.requestId)).toBe(true);
 await context.close();
 const standalone=await browser.newPage();await standalone.route('**/*',async route=>{const u=new URL(route.request().url());const file=u.pathname.startsWith('/assets/')?path.join('dist',u.pathname.slice(1)):'dist/index.html';return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});});await standalone.goto('https://horse-race-paul.web.app');await expect(standalone.locator('#status')).toHaveText('Open Horse Race from Between Turns.');await expect(standalone.locator('.game')).toBeHidden();
 console.log('PASS: desktop and phone standings, proportional bars, safe player names, 1–20 grid, every-player hits, repeated reporting, undo, tied winning review, standalone guard');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
