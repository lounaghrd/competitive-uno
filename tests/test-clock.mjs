/* The clock for the next game must start on its own when the last one is
   recorded, and survive the app being closed. */
import { chromium } from 'playwright';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8099/index.html');

await p.click('[data-tab="session"]'); await p.click('[data-act="new-session"]');
if(await p.isVisible('[data-act="seat-last"]')) await p.click('[data-act="seat-last"]');
await p.click('[data-act="seat-save"]');

// confirming the seating is "we are playing now"
const live0 = await p.evaluate(()=>window.curSession().live);
check(!!live0, 'confirming the seating starts the first clock');
check(live0.autoStarted === false, 'the first game of a session is not marked auto-started');
check(await p.isVisible('[data-act="open-live"]'), 'the session screen goes straight to entering results');

async function play(w){
  await p.click('[data-act="open-live"], [data-act="start-game"]');
  await p.click(`[data-act="set-win"][data-p="${w}"][data-k="win"]`);
  await p.click('[data-act="save-game"]');
}
await play('tom');

// the moment that game was saved, the next clock started
const st = await p.evaluate(()=>{
  const s = window.curSession();
  const last = s.games[s.games.length-1];
  return { liveStart: s.live && s.live.startedAt, auto: s.live && s.live.autoStarted,
           prevEnd: last.endedAt, prevStart: last.startedAt };
});
check(!!st.liveStart, 'saving a game starts the next clock with no button press');
check(st.auto === true, 'and marks it as started automatically');
check(st.liveStart === st.prevEnd,
  'it starts exactly when the previous game ended — no gap goes unmeasured');

// no dead time: the recorded spans butt up against each other
await new Promise(r=>setTimeout(r,1200));
await play('julia');
const spans = await p.evaluate(()=>{
  const s = window.curSession();
  return s.games.map(g=>({start:g.startedAt, end:g.endedAt, auto:!!g.autoStarted}));
});
check(spans.length===2, 'two games recorded');
check(spans[1].start === spans[0].end, 'game 2 begins where game 1 ended');
check(spans[1].end - spans[1].start >= 1000, `game 2 has a real duration (${spans[1].end-spans[1].start}ms)`);
check(spans[0].auto===false && spans[1].auto===true, 'each game records how its clock began');

// a long break: the clock can be reset by hand
const before = await p.evaluate(()=>window.curSession().live.startedAt);
await new Promise(r=>setTimeout(r,600));
await p.click('[data-act="restart-clock"]');
const after = await p.evaluate(()=>window.curSession().live);
check(after.startedAt > before, `restarting the clock moves it forward (+${after.startedAt-before}ms)`);
check(after.autoStarted === false, 'and stops calling it automatic');

// closing the app must not lose the running clock
const running = await p.evaluate(()=>window.curSession().live.startedAt);
await p.reload(); await p.waitForTimeout(400);
const afterReload = await p.evaluate(()=>{ const s=window.curSession(); return s && s.live ? s.live.startedAt : null; });
check(afterReload === running, 'the running clock survives closing and reopening the app');
check(await p.isVisible('[data-act="open-live"]'), 'and the app comes back ready to enter results');

// ending a session throws away the game nobody played
await p.click('[data-act="end-session"]');
check(await p.evaluate(()=>window.compute().flat.length) === 103,
  'ending a session does not record the un-played game the clock was running for');

// the export says how each clock started
const dl = await Promise.all([p.waitForEvent('download'),
  p.click('[data-tab="data"]').then(()=>p.click('[data-act="export-csv"]'))]);
const fs = await import('fs');
const csv = fs.readFileSync(await dl[0].path(),'utf8').trim().split('\n');
check(csv[0].endsWith('clock_auto_started'), 'the export records whether the clock started on its own');
const last = csv[csv.length-1].split(',');
check(last[last.length-1]==='yes', `and the last game says yes (${last[last.length-1]})`);

await p.screenshot({path:'tests/shots/T-clock.png'});
if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close();
console.log(fail?`\n${fail} FAILING`:'\nrolling clock verified');
process.exit(fail?1:0);
