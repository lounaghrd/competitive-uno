import { chromium } from 'playwright';
import fs from 'fs';
const expected = JSON.parse(fs.readFileSync('.dev/expected.json','utf8'));
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('dialog',d=>d.accept());
await page.goto('http://localhost:8099/index.html');
let fail=0;
const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };

// the history should already be there, with no action from the user
const c = await page.evaluate(()=>window.compute());
check(c.flat.length === 101, `all 101 games loaded on first open (${c.flat.length})`);
check((await page.evaluate(()=>window.state.sessions.length)) === 12, 'split into 12 sessions');

// EVERY total must match the spreadsheet
const got = c.totals;
let bad = Object.entries(expected).filter(([k,v]) => got[k] !== v);
check(bad.length===0, 'every final total matches the spreadsheet exactly');
Object.entries(expected).forEach(([k,v]) => console.log(`        ${k.padEnd(8)} sheet ${String(v).padStart(5)}   app ${String(got[k]).padStart(5)}  ${got[k]===v?'✓':'✗'}`));

// the one bonus the sheet recorded, and only that one
const fired = c.flat.flatMap(f=>f.bonuses);
check(fired.length===1 && fired[0].id==='tom' && fired[0].landed===1200 && fired[0].bonus===-200,
  'exactly one bonus fired: Tom landing on 1200  ' + JSON.stringify(fired));

// joining handicaps preserved
const op = await page.evaluate(()=>window.state.opening);
check(op.tom===416 && op.nicolas===1335, `joining totals kept (Tom ${op.tom}, Nicolas ${op.nicolas})`);

// games really do have 5, 6 and 7 players
const sizes = await page.evaluate(()=>{
  const n={}; window.compute().flat.forEach(f=>{ const k=Object.keys(f.game.entries).length; n[k]=(n[k]||0)+1; });
  return n; });
check(sizes[5]===23 && sizes[6]===43 && sizes[7]===35, 'table sizes preserved: '+JSON.stringify(sizes));

// per-game counts per player match the sheet
const played = Object.fromEntries(c.stats.map(s=>[s.id,s.games]));
check(played.nathan===101 && played.tom===78 && played.nicolas===35,
  `games played per person (Nathan ${played.nathan}, Tom ${played.tom}, Nicolas ${played.nicolas})`);

// screens render with the real data
await page.click('[data-tab="board"]'); await page.screenshot({path:'tests/shots/I-board.png'});
check((await page.evaluate(()=>window.compute().flat.length))===101, 'leaderboard shows the full league');
await page.click('[data-tab="chart"]');
const paths = await page.$$eval('#chartsvg path[stroke-width="2"]', p=>p.length);
check(paths===7, 'chart draws all seven players');
await page.screenshot({path:'tests/shots/I-chart.png'});
await page.click('[data-tab="session"]'); await page.screenshot({path:'tests/shots/I-sessions.png'});
await page.click('[data-tab="data"]'); await page.screenshot({path:'tests/shots/I-data.png', fullPage:true});

// export covers everything
const dl = await Promise.all([ page.waitForEvent('download'), page.click('[data-act="export-csv"]') ]);
const csv = fs.readFileSync(await dl[0].path(),'utf8').trim().split('\n');
check(csv.length === 1 + 23*5 + 43*6 + 35*7, `CSV row per player per game (${csv.length-1})`);
check(csv[0].includes('players_at_table'), 'CSV records how many were at the table');
check(csv.slice(1).every(r=>r.split(',')[9]!==''), 'starter filled in for every imported row');
// the starter of each game must be whoever was last going into it
const starterCheck = await page.evaluate(()=>{
  const c = window.compute(); let bad = 0, run = {};
  Object.keys(window.state.opening||{}).forEach(k=>run[k]=window.state.opening[k]);
  c.flat.forEach(f=>{
    const seats = f.sess.seating;
    const at = seats.filter(id => f.game.entries[id]);
    let want = null;
    at.forEach(id => { const t = run[id]||0; if(want===null || t > (run[want]||0)) want = id; });
    if(f.game.starter !== want) bad++;
    at.forEach(id => {
      const e = f.game.entries[id];
      const base = e.kind==='win' ? -10 : e.kind==='cut' ? -20 : (e.points||0);
      const mid = (run[id]||0) + base; let b = 0;
      if(mid>0 && mid%200===0) b -= 200;
      run[id] = mid + b;
    });
  });
  return bad;
});
check(starterCheck === 0, `every imported starter is the player who was last at that moment (${starterCheck} wrong)`);
const counts = await page.evaluate(()=>{
  const n={}; window.compute().flat.forEach(f=>{ n[f.game.starter]=(n[f.game.starter]||0)+1; }); return n; });
check(counts.justin===39 && counts.julia===29 && counts.nathan===23,
  'starter tally matches the spreadsheet reconstruction: '+JSON.stringify(counts));

// re-importing must not duplicate
await page.click('[data-act="reimport"]');
const after = await page.evaluate(()=>window.compute().flat.length);
check(after===101, `re-import is idempotent (${after} games)`);

// new games continue on top of the history
await page.click('[data-tab="session"]'); await page.click('[data-act="new-session"]');
await page.click('[data-act="seat-last"]'); await page.click('[data-act="seat-save"]');
await page.click('[data-act="start-game"], [data-act="open-live"]');
await page.click('[data-act="set-win"][data-p="tom"][data-k="win"]');
await page.fill('[data-pts="nathan"]','26');
await page.click('[data-act="save-game"]');
const t = await page.evaluate(()=>window.compute().totals);
check(t.nathan === expected.nathan + 26 && t.tom === expected.tom - 10,
  `a new game builds on the imported totals (Nathan ${t.nathan}, Tom ${t.tom})`);

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close();
console.log(fail? `\n${fail} FAILING` : '\nimport verified against the spreadsheet');
process.exit(fail?1:0);
