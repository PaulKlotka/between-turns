import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRolls, makeRace, publicView, finishReview, undoRoll, type Race, type Challenge } from '../functions/src/race';
const c=(n:number):Challenge=>({kind:'exact',min:n,max:n,label:`Roll exactly ${n}`});
function race():Race{return {...makeRace('session','run',()=>0),challenges:[c(1),c(2),c(3)],offer:{id:'offer',reward:{id:'r',name:'Prize',qualifyingRoll:'Use it'}}};}
test('race length is three through seven and future challenges stay hidden',()=>{for(let n=0;n<5;n++){const r=makeRace('s','r',max=>max===5?n:0);assert.equal(r.challenges.length,n+3);}const text=JSON.stringify(publicView(race(),'p'));assert.ok(text.includes('Roll exactly 1'));assert.ok(!text.includes('Roll exactly 2'));assert.ok(!text.includes('challenges'));assert.ok(!text.includes('index'));});
test('a successful roll advances, and a failure leaves the challenge in place',()=>{const next=applyRolls(race(),'p','Paul',[1],'event');assert.equal(next.index,1);assert.equal(applyRolls(next,'p','Paul',[20],'next').index,1);});
test('multiplayer undo restores progress and expires after another player rolls',()=>{const first=applyRolls(race(),'a','A',[1],'first',2,1000);assert.equal(first.index,1);assert.equal(publicView(first,'a',2,1000).canUndo,true);const undone=undoRoll(first,'a',2,1001);assert.equal(undone.index,0);assert.equal(undone.last,null);assert.throws(()=>applyRolls(first,'a','A',[2],'same',2,1001));const next=applyRolls(first,'b','B',[2],'next',2,1001);assert.throws(()=>undoRoll(next,'a',2,1002));assert.throws(()=>undoRoll(next,'b',1,1002));});
test('multiplayer win is undoable for 15 seconds and settles only after the deadline',()=>{const won=applyRolls({...race(),index:2},'p','P',[3],'win',2,1000);assert.equal(won.phase,'review');assert.equal(won.reviewUntil,16000);assert.equal(finishReview(won,15999).phase,'review');assert.equal(finishReview(won,16000).phase,'settling');assert.equal(undoRoll(won,'p',2,15999).index,2);assert.throws(()=>undoRoll(won,'p',2,16000));assert.throws(()=>undoRoll(won,'other',2,1001));});
test('solo players cannot undo and win immediately',()=>{const r=applyRolls(race(),'p','P',[1],'event',1,1000);assert.equal(publicView(r,'p',1,1001).canUndo,false);assert.throws(()=>undoRoll(r,'p',1,1001));assert.equal(applyRolls({...race(),index:2},'p','P',[3],'win',1,1000).phase,'settling');});
test('submissions contain exactly one physical d20 integer',()=>{for(const rolls of [[],[0],[21],[1.5],[1,2]])assert.throws(()=>applyRolls(race(),'p','P',rolls,'e'));});

test('each new challenge category has one equally likely selection slot',()=>{
 const expected=['low','medium','high','very-high','even','odd','exact'];
 for(let category=0;category<7;category++){const calls:number[]=[];const r=makeRace('s','r',max=>{calls.push(max);return max===7?category:0;});assert.deepEqual(r.challenges.map(c=>c.kind),Array(3).fill(expected[category]));assert.equal(calls.filter(x=>x===7).length,3);assert.equal(calls.filter(x=>x===20).length,category===6?3:0);}
 for(let target=1;target<=20;target++){const r=makeRace('s','r',max=>max===7?6:max===20?target-1:0);assert.equal(r.challenges[0].min,target);assert.equal(r.challenges[0].max,target);}
});
test('each new challenge accepts exactly its intended d20 results',()=>{
 const expected=[(n:number)=>n<=5,(n:number)=>n>=6&&n<=10,(n:number)=>n>=11&&n<=15,(n:number)=>n>=16,(n:number)=>n%2===0,(n:number)=>n%2===1];
 for(let category=0;category<7;category++)for(let roll=1;roll<=20;roll++){const challenge=makeRace('s','r',max=>max===7?category:max===20?12:0).challenges[0];const current={...race(),challenges:[challenge,c(2),c(3)]};const result=applyRolls(current,'p','P',[roll],'event');assert.equal(result.index===1,category===6?roll===13:expected[category](roll),`${challenge.label} with ${roll}`);}
 for(let target=1;target<=20;target++){const challenge=makeRace('s','r',max=>max===7?6:max===20?target-1:0).challenges[0];const current={...race(),challenges:[challenge,c(2),c(3)]};for(const roll of [target,target===20?1:target+1])assert.equal(applyRolls(current,'p','P',[roll],'event').index===1,roll===target);}
});
test('stored legacy challenges retain their original labels and winning ranges',()=>{
 const legacy:Challenge[]=[{kind:'low',min:1,max:6,label:'Low roll: 1–6'},{kind:'high',min:15,max:20,label:'High roll: 15–20'},{kind:'range',min:1,max:5,label:'Roll 1–5'},{kind:'range',min:15,max:20,label:'Roll 15–20'}];
 for(const challenge of legacy){const current={...race(),challenges:[challenge,c(2),c(3)]};assert.equal(publicView(current,'p').challenge,challenge.label);for(let roll=1;roll<=20;roll++)assert.equal(applyRolls(current,'p','P',[roll],'event').index===1,roll>=challenge.min&&roll<=challenge.max);}
});
