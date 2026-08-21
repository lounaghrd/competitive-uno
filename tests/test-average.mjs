/* The average score of each game, checked against the 101 hand-kept rows. */
import { chromium } from 'playwright';
import fs from 'fs';
const exp = JSON.parse(fs.readFileSync('.dev/avg-expected.json','utf8'));
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8099/index.html');

const got = await p.evaluate(()=>Object.fromEntries(
  window.compute().flat.map(f=>[f.no, Math.round(window.gameAverage(f.game)*10)/10])));

// every game where the sheet's own formula was right
const trusted = Object.entries(exp).filter(([,v])=>v.n<7);
const badT = trusted.filter(([no,v])=>Math.abs(got[no]-v.sheet)>0.05);
check(badT.length===0, `matches the spreadsheet on all ${trusted.length} games it averaged correctly`);

// and the arithmetic on every game, including the seven-player ones
const badA = Object.entries(exp).filter(([no,v])=>Math.abs(got[no]-v.true)>0.05);
check(badA.length===0, `correct on all ${Object.keys(exp).length} games`
  + (badA.length?' — off on '+JSON.stringify(badA.slice(0,3)):''));

// the sheet stopped counting Nicolas; we should not
// the sheet's formula never grew to include Nicolas: proved exactly when the
// expected data was built, so assert on that rather than on rounded values
const seven = Object.entries(exp).filter(([,v])=>v.n===7);
check(seven.length===35, `35 games were played seven-handed (${seven.length})`);
check(seven.every(([,v])=>v.sheetSkippedNicolas), 'the sheet left Nicolas out of the average on every one of them');
const drift = Object.entries(exp).filter(([no,v])=>v.sheet!==null && Math.abs(v.true-v.sheet)>0.05);
check(drift.length && drift.every(([no])=>exp[no].n===7),
  `${drift.length} of them come out visibly different here; every one is a seven-handed game`);
const g80 = got[80];
check(Math.abs(g80-36.4)<0.05, `game 80: ${g80}, where the sheet said ${exp[80].sheet} (it dropped Nicolas's 152)`);

// spot-check one by hand: game 1 was 15+46+21+2-10 over five players
check(Math.abs(got[1]-14.8)<0.001, `game 1 averages 14.8 (${got[1]})`);
// and a cut counts as -20
const cut = await p.evaluate(()=>window.gameAverage({entries:{a:{kind:'cut'},b:{kind:'points',points:40}}}));
check(cut===10, `a cut counts as -20 in the average ((-20+40)/2 = ${cut})`);
const win = await p.evaluate(()=>window.gameAverage({entries:{a:{kind:'win'},b:{kind:'points',points:30}}}));
check(win===10, `a plain win counts as -10 ((-10+30)/2 = ${win})`);

// it must be visible where they need it
await p.click('[data-tab="session"]');
await p.click('[data-act="open-session"] >> nth=0');
check((await p.textContent('#view')).includes('avg '), 'every game in a session lists its average');
await p.screenshot({path:'tests/shots/A-avg-session.png'});

// and announced when a game is saved
await p.click('[data-tab="session"]');
await p.click('[data-act="close-session"]').catch(()=>{});
await p.click('[data-act="new-session"]');
if(await p.isVisible('[data-act="seat-last"]')) await p.click('[data-act="seat-last"]');
await p.click('[data-act="seat-save"]');
await p.click('[data-act="start-game"]');
await p.click('[data-act="set-win"][data-p="tom"][data-k="win"]');
for(const [q,v] of Object.entries({nathan:30,louna:20,andy:10,julia:40,justin:50,nicolas:60}))
  await p.fill(`[data-pts="${q}"]`,String(v));
await p.click('[data-act="save-game"]');
const t = await p.textContent('#toast');
// (-10+30+20+10+40+50+60)/7 = 28.571 -> 28.6
check(t.includes('average 28.6'), `the confirmation announces it: "${t}"`);
await p.screenshot({path:'tests/shots/A-avg-toast.png'});

// the export carries it too
const dl = await Promise.all([p.waitForEvent('download'), p.click('[data-tab="data"]').then(()=>p.click('[data-act="export-csv"]'))]);
const csv = fs.readFileSync(await dl[0].path(),'utf8').trim().split('\n');
check(csv[0].endsWith('game_average'), 'the spreadsheet export has a game_average column');
check(csv[1].split(',').pop()==='14.8', `and the first game reads 14.8 (${csv[1].split(',').pop()})`);

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close();
console.log(fail?`\n${fail} FAILING`:'\ngame averages verified against the spreadsheet');
process.exit(fail?1:0);
