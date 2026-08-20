/* Deleting a whole session, and fixing a score in a session from days ago. */
import { chromium } from 'playwright';
import { start } from './fake-firebase.mjs';
const DB = start(8095);
const LEAGUE='http://localhost:8095/leagues/del';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[];
async function phone(name){
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(name+': '+e)); p.on('dialog',d=>d.accept());
  await p.addInitScript(u=>{window.UNO_SYNC_URL=u;},LEAGUE);
  await p.goto('http://localhost:8099/index.html');
  await p.waitForFunction(()=>window.Sync&&window.Sync.state!=='connecting',{timeout:10000}).catch(()=>{});
  return {ctx,p,name};
}
const total = ph=>ph.p.evaluate(()=>window.compute().flat.length);
/* compare by value: compute() and a hand-written literal list keys in
   different orders, so stringifying them is not a valid comparison */
const same=(a,b)=>Object.keys(a).length===Object.keys(b).length
  && Object.keys(a).every(k=>a[k]===b[k]);
const settle = async(...ps)=>{ for(const x of ps) await x.p.evaluate(()=>window.Sync.flush());
  await new Promise(r=>setTimeout(r,400));
  for(const x of ps) await x.p.evaluate(()=>window.Sync.pull()); await new Promise(r=>setTimeout(r,300)); };
async function session(ph, games){
  await ph.p.click('[data-tab="session"]');
  await ph.p.click('[data-act="new-session"]');
  if(await ph.p.isVisible('[data-act="seat-last"]')) await ph.p.click('[data-act="seat-last"]');
  await ph.p.click('[data-act="seat-save"]');
  for(const g of games){
    await ph.p.click('[data-act="start-game"]');
    await ph.p.click(`[data-act="set-win"][data-p="${g.w}"][data-k="win"]`);
    for(const [q,v] of Object.entries(g.pts)) await ph.p.fill(`[data-pts="${q}"]`,String(v));
    await ph.p.click('[data-act="save-game"]');
  }
  await ph.p.click('[data-act="end-session"]');
}

const A=await phone('Louna');
check(await total(A)===101,'starts from the imported 101 games');

await session(A,[
  {w:'tom',  pts:{nathan:10,louna:20,andy:30,julia:40,justin:50,nicolas:60}},
  {w:'julia',pts:{nathan:11,louna:21,andy:31,tom:41,justin:51,nicolas:61}},
]);
await session(A,[{w:'andy',pts:{nathan:5,louna:5,julia:5,tom:5,justin:5,nicolas:5}}]);
check(await total(A)===104,`three games across two new sessions (${await total(A)})`);
const baseline = await A.p.evaluate(()=>window.compute().totals);

// past sessions must be reachable at all — they were dead text before
await A.p.click('[data-tab="session"]');
check(await A.p.isVisible('[data-act="open-session"]'),'past sessions are tappable');
check((await A.p.textContent('#view')).includes('1 game ·'),'says "1 game", not "1 games"');

const B=await phone('Tom'); await settle(A,B);
check(await total(B)===104,'second phone has the same 104');

// open the most recent session and delete it
await A.p.click('[data-act="open-session"] >> nth=0');
check((await A.p.textContent('#view')).includes('Delete this whole session'),'the session screen offers deletion');
await A.p.screenshot({path:'tests/shots/D-session.png'});
await A.p.click('[data-act="delete-session"]');
check(await total(A)===103,`deleting a 1-game session removes exactly that game (${await total(A)})`);

// and the bigger one
await A.p.click('[data-act="open-session"] >> nth=0');
await A.p.click('[data-act="delete-session"]');
check(await total(A)===101,`deleting a 2-game session removes both (${await total(A)})`);
const back = await A.p.evaluate(()=>window.compute().totals);
const imported = {nathan:2474,louna:2020,andy:2175,julia:2158,justin:2461,tom:2086,nicolas:2291};
check(same(back,imported),'totals return exactly to the spreadsheet numbers: '+JSON.stringify(back));
check(!same(back,baseline),'(and they really had changed beforehand)');

// it must delete on the other phone too, and stay deleted
await settle(A,B); await settle(A,B);
check(await total(B)===101,`the deletion reaches the other phone (${await total(B)})`);
await settle(A,B);
check(await total(A)===101 && await total(B)===101,'and does not come back on the next sync');

// deleting must not touch the imported history
check((await A.p.evaluate(()=>window.state.sessions.length))===12,'the 12 imported sessions are untouched');

// a score can be fixed in a session from days ago
await A.p.click('[data-tab="session"]');
await A.p.click('[data-act="open-session"] >> nth=3');
await A.p.click('.gm >> nth=0');
check((await A.p.textContent('#view')).includes('Edit game'),'a game inside an old session opens for editing');
// the winner's row shows a locked score, so pick someone who was not the winner
const who = await A.p.evaluate(()=>{
  const e = window.ui.editing.game.entries;
  return Object.keys(e).find(k=>e[k].kind==='points');
});
const wasTotal = (await A.p.evaluate(()=>window.compute().totals))[who];
await A.p.fill(`[data-pts="${who}"]`,'999');
await A.p.click('[data-act="save-game"]');
const fixed = await A.p.evaluate(()=>window.compute().totals);
check(fixed[who] !== wasTotal, `the correction applies (${who} ${wasTotal} -> ${fixed[who]})`);
check(await total(A)===101,'and no game was added or lost doing it');
await settle(A,B);
check((await B.p.evaluate(()=>window.compute().totals))[who] === fixed[who],'the correction reaches the other phone');

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close(); DB.srv.close();
console.log(fail?`\n${fail} FAILING`:'\nsession deletion verified');
process.exit(fail?1:0);
