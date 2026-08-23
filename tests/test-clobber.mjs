/* A correction made on one phone must not be undone by an unrelated game
   saved on another phone that had not seen it yet. */
import { chromium } from 'playwright';
import { start } from './fake-firebase.mjs';
const DB=start(8093); const LEAGUE='http://localhost:8093/leagues/clobber';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const errs=[];
async function phone(n){
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage(); p.on('pageerror',e=>errs.push(n+': '+e)); p.on('dialog',d=>d.accept());
  await p.addInitScript(u=>{window.UNO_SYNC_URL=u;},LEAGUE);
  await p.goto('http://localhost:8099/index.html');
  await p.waitForFunction(()=>window.Sync&&window.Sync.state!=='connecting',{timeout:10000}).catch(()=>{});
  return {ctx,p,n};
}
const settle=async(...ps)=>{ for(const x of ps) await x.p.evaluate(()=>window.Sync.flush());
  await new Promise(r=>setTimeout(r,400));
  for(const x of ps) await x.p.evaluate(()=>window.Sync.pull()); await new Promise(r=>setTimeout(r,300)); };

const A=await phone('A'), B=await phone('B');
await settle(A,B);

// a shared starting point: one session with a game in it
await A.p.click('[data-tab="session"]'); await A.p.click('[data-act="new-session"]');
if(await A.p.isVisible('[data-act="seat-last"]')) await A.p.click('[data-act="seat-last"]');
await A.p.click('[data-act="seat-save"]');
await A.p.click('[data-act="start-game"], [data-act="open-live"]');
await A.p.click('[data-act="set-win"][data-p="tom"][data-k="win"]');
await A.p.fill('[data-pts="nathan"]','50');
await A.p.click('[data-act="save-game"]');
await settle(A,B); await settle(A,B);
check((await B.p.evaluate(()=>window.compute().totals)).nathan
   === (await A.p.evaluate(()=>window.compute().totals)).nathan, 'both phones start in step');

// B reloads (this is what resets its idea of what it last sent) and drops off
await B.p.reload();
await B.p.waitForFunction(()=>window.Sync&&window.Sync.state!=='connecting',{timeout:10000}).catch(()=>{});
await B.ctx.setOffline(true);

// meanwhile A corrects Nathan's score in that game
await A.p.click('[data-tab="session"]');
await A.p.click('.gm >> nth=0');
await A.p.fill('[data-pts="nathan"]','5');
await A.p.click('[data-act="save-game"]');
await settle(A);
const corrected = (await A.p.evaluate(()=>window.compute().totals)).nathan;

// B, still holding the old score, records a completely unrelated new game
await B.p.click('[data-tab="session"]');
await B.p.click('[data-act="start-game"], [data-act="open-live"]');
await B.p.click('[data-act="set-win"][data-p="julia"][data-k="win"]');
await B.p.click('[data-act="save-game"]');

// B comes back and syncs
await B.ctx.setOffline(false);
await settle(A,B); await settle(A,B);

const after = (await A.p.evaluate(()=>window.compute().totals)).nathan;
const bAfter = (await B.p.evaluate(()=>window.compute().totals)).nathan;
check(after === bAfter, `the phones agree afterwards (A ${after}, B ${bAfter})`);
// B's new game adds nothing to Nathan (Julia won, Nathan blank = 0), so the
// corrected score must survive untouched
check(after === corrected,
  `the correction survives B's unrelated game (was ${corrected}, now ${after})`);
check(await A.p.evaluate(()=>window.compute().flat.length) === 103, 'and both games are present');

// a phone joining for the first time must not overwrite corrections already
// made to the imported history with its own pristine copy of it
const fresh = await phone('C');
await settle(A,fresh); await settle(A,fresh);
check((await fresh.p.evaluate(()=>window.compute().totals)).nathan === corrected,
  `a phone joining cold does not undo corrections (${(await fresh.p.evaluate(()=>window.compute().totals)).nathan} vs ${corrected})`);
check((await A.p.evaluate(()=>window.compute().totals)).nathan === corrected,
  'and the phone that made the correction still has it');

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close(); DB.srv.close();
console.log(fail?`\n${fail} FAILING`:'\nno clobbering');
process.exit(fail?1:0);
