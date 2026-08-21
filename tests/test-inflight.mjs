/* A game saved while the previous one is still uploading must not be dropped.
   The server is deliberately slow so the two overlap. */
import { chromium } from 'playwright';
import { start } from './fake-firebase.mjs';
const DB=start(8091, 700); const LEAGUE='http://localhost:8091/leagues/flight';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
await p.addInitScript(u=>{window.UNO_SYNC_URL=u;},LEAGUE);
await p.goto('http://localhost:8099/index.html');
await p.waitForFunction(()=>window.Sync&&window.Sync.state!=='connecting',{timeout:10000}).catch(()=>{});

await p.click('[data-tab="session"]'); await p.click('[data-act="new-session"]');
if(await p.isVisible('[data-act="seat-last"]')) await p.click('[data-act="seat-last"]');
await p.click('[data-act="seat-save"]');
async function play(w){
  await p.click('[data-act="start-game"]');
  await p.click(`[data-act="set-win"][data-p="${w}"][data-k="win"]`);
  await p.click('[data-act="save-game"]');
}
// three games back to back, faster than the uploads can finish
await play('tom'); await play('julia'); await play('andy');
check(await p.evaluate(()=>window.compute().flat.length) === 104, 'all three are recorded on the phone');

// let the uploads drain
for (let i=0;i<12;i++){ await p.evaluate(()=>window.Sync.flush()); await new Promise(r=>setTimeout(r,400)); }
const ids = await p.evaluate(()=>window.compute().flat.slice(-3).map(f=>f.game.id));
const inDb = DB.dump()?.leagues?.flight?.games || {};
const missing = ids.filter(id=>!inDb[id]);
check(missing.length===0, `all three reached the database (missing: ${missing.length})`);
check(await p.evaluate(()=>window.Sync.pending) === null, 'nothing is left stuck in the queue');

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close(); DB.srv.close();
console.log(fail?`\n${fail} FAILING`:'\nnothing dropped while uploading');
process.exit(fail?1:0);
