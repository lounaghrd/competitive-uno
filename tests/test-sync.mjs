/* Two phones on one league. The things that must never happen:
   a game vanishing, or one phone's scores overwriting another's. */
import { chromium } from 'playwright';
import { start } from './fake-firebase.mjs';

const DB = start(8097);
const LEAGUE = 'http://localhost:8097/leagues/roadtrip';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };

const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs=[];
async function phone(name){
  const ctx = await b.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  const p = await ctx.newPage();
  p.on('pageerror', e=>errs.push(name+': '+e));
  p.on('dialog', d=>d.accept());
  await p.addInitScript(u=>{ window.UNO_SYNC_URL = u; }, LEAGUE);
  await p.goto('http://localhost:8099/index.html');
  await p.waitForFunction(()=>window.Sync && window.Sync.state!=='connecting', {timeout:10000}).catch(()=>{});
  return { ctx, p, name };
}
const total = ph => ph.p.evaluate(()=>window.compute().flat.length);
const settle = async (...phones) => {
  for (const ph of phones) await ph.p.evaluate(()=>window.Sync.flush());
  await new Promise(r=>setTimeout(r,400));
  for (const ph of phones) await ph.p.evaluate(()=>window.Sync.pull());
  await new Promise(r=>setTimeout(r,300));
};
async function playGame(ph, winner, pts){
  const has = await ph.p.evaluate(()=>!!(window.curSession() && window.curSession().seating));
  if(!has){
    await ph.p.click('[data-tab="session"]');
    if(await ph.p.isVisible('[data-act="new-session"]')) await ph.p.click('[data-act="new-session"]');
    if(await ph.p.isVisible('[data-act="seat-last"]')) await ph.p.click('[data-act="seat-last"]');
    await ph.p.click('[data-act="seat-save"]');
  }
  await ph.p.click('[data-tab="session"]');
  await ph.p.click('[data-act="start-game"]');
  await ph.p.click(`[data-act="set-win"][data-p="${winner}"][data-k="win"]`);
  for (const [q,v] of Object.entries(pts)) await ph.p.fill(`[data-pts="${q}"]`, String(v));
  await ph.p.click('[data-act="save-game"]');
}

const A = await phone('Louna');
check(await A.p.evaluate(()=>window.Sync.configured()), 'phone 1 joins the shared league');
check(await total(A) === 101, 'phone 1 starts from the 101 imported games');
await settle(A);

// a second phone arrives later and should be handed the whole league
const B = await phone('Tom');
await settle(A,B);
check(await total(B) === 101, `phone 2 receives the league on joining (${await total(B)})`);

// phone 1 records a session
await playGame(A,'tom',{nathan:44,louna:12,andy:8,julia:30,justin:19,nicolas:5});
await settle(A,B);
check(await total(B) === 102, `a game scored on phone 1 shows up on phone 2 (${await total(B)})`);
const tA = await A.p.evaluate(()=>window.compute().totals);
const tB = await B.p.evaluate(()=>window.compute().totals);
check(JSON.stringify(tA)===JSON.stringify(tB), 'both phones agree on every total');

// the dangerous one: both phones score at the same time, neither knowing
await Promise.all([
  playGame(A,'julia',{nathan:10,louna:20,andy:30,tom:40,justin:50,nicolas:60}),
  playGame(B,'andy', {nathan:11,louna:21,julia:31,tom:41,justin:51,nicolas:61}),
]);
await settle(A,B); await settle(A,B);
const cA = await total(A), cB = await total(B);
check(cA === 104 && cB === 104, `two phones scoring at once keeps BOTH games (${cA} / ${cB})`);
const fA = await A.p.evaluate(()=>window.compute().totals);
const fB = await B.p.evaluate(()=>window.compute().totals);
check(JSON.stringify(fA)===JSON.stringify(fB), 'they still agree afterwards: '+JSON.stringify(fA));

// signal drops on one phone
await B.ctx.setOffline(true);
await playGame(B,'louna',{nathan:7,andy:7,julia:7,tom:7,justin:7,nicolas:7});
check(await total(B) === 105, 'you can keep scoring with no signal');
await settle(A);
check(await total(A) === 104, 'the offline game has not reached the others yet');
const pend = await B.p.evaluate(()=>Object.keys(window.Sync.pending.games).length);
check(pend >= 1, `the offline game is queued to send (${pend})`);

// signal comes back
await B.ctx.setOffline(false);
await B.p.evaluate(()=>window.Sync.flush());
await new Promise(r=>setTimeout(r,600));
await settle(A,B);
check(await total(A) === 105, `the queued game arrives once there is signal again (${await total(A)})`);

// deleting must delete everywhere, not bounce back
await A.p.click('[data-tab="session"]');
await A.p.click('.gm >> nth=0'); await A.p.click('[data-act="delete-game"]');
await settle(A,B); await settle(A,B);
check(await total(A) === 104 && await total(B) === 104,
  `deleting a game removes it on every phone and stays deleted (${await total(A)} / ${await total(B)})`);

// a correction on one phone reaches the other
const before = (await B.p.evaluate(()=>window.compute().totals)).nathan;
await A.p.click('.gm >> nth=0');
await A.p.fill('[data-pts="nathan"]','200');
await A.p.click('[data-act="save-game"]');
await settle(A,B);
const after = (await B.p.evaluate(()=>window.compute().totals)).nathan;
check(after !== before, `a correction on one phone updates the others (Nathan ${before} -> ${after})`);
check(after === (await A.p.evaluate(()=>window.compute().totals)).nathan, 'and both land on the same number');

// a third phone, joining cold, must see the finished picture
const C = await phone('Andy');
await settle(A,B,C);
check(await total(C) === 104, `a phone joining later gets the whole league (${await total(C)})`);
check(JSON.stringify(await C.p.evaluate(()=>window.compute().totals))
   === JSON.stringify(await A.p.evaluate(()=>window.compute().totals)), 'and matches the others exactly');

// a friend joining by tapping the shared link, having typed nothing
const ctxD = await b.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const D = await ctxD.newPage(); D.on('pageerror',e=>errs.push('link: '+e));
await D.goto('http://localhost:8099/index.html?league='+encodeURIComponent(LEAGUE));
await D.waitForFunction(()=>window.Sync && window.Sync.configured(), {timeout:10000}).catch(()=>{});
check(await D.evaluate(()=>window.Sync.configured()), 'tapping the invite link joins the league with no typing');
check(!/league=/.test(await D.evaluate(()=>location.search)), 'the link tidies itself out of the address bar');
await D.evaluate(()=>window.Sync.pull()); await new Promise(r=>setTimeout(r,400));
check(await D.evaluate(()=>window.compute().flat.length) === 104,
  `and that phone has the whole league straight away (${await D.evaluate(()=>window.compute().flat.length)})`);

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close(); DB.srv.close();
console.log(fail?`\n${fail} FAILING`:'\nmulti-phone sync verified');
process.exit(fail?1:0);
