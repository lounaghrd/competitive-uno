import { chromium } from 'playwright';
const SHOT='/home/user/competitive-uno/tests/shots';
import fs from 'fs'; fs.mkdirSync(SHOT,{recursive:true});
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, hasTouch:true, isMobile:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
page.on('dialog', d=>d.accept());
await page.goto('http://localhost:8099/index.html');

let fail=0;
const check=(cond,msg)=>{ if(cond) console.log('ok    '+msg); else { fail++; console.log('FAIL  '+msg); } };
const shot=n=>page.screenshot({path:`${SHOT}/${n}.png`});

// --- empty state
check((await page.textContent('#view')).includes('No games yet'), 'empty leaderboard explains what to do');
await shot('01-empty');

// --- new session + seating
await page.click('[data-tab="session"]');
await page.click('[data-act="new-session"]');
check(await page.isVisible('.circle'), 'seating circle appears');
check(await page.isDisabled('[data-act="seat-save"]'), 'cannot confirm an unfinished circle');
await shot('02-seating-empty');
for (const n of ['Tom','Louna','Andy','Justin','Julia','Nathan','Nicolas'])
  await page.click(`[data-act="seat-add"]:has-text("${n}")`);
check(!(await page.isDisabled('[data-act="seat-save"]')), 'confirm unlocks when all 7 are seated');
await shot('03-seating-full');
await page.click('[data-act="seat-save"]');
check((await page.textContent('#view')).includes('Start game 1'), 'lands on the session screen ready to play');
check((await page.textContent('.seat.starter')).includes('Tom'), 'starter shown (all tied at 0 -> first seat)');
await shot('04-session-ready');

// --- game 1
async function play(winner, kind, points){
  await page.click('[data-act="start-game"], [data-act="open-live"]');
  await page.click(`[data-act="set-win"][data-p="${winner}"][data-k="${kind}"]`);
  for (const [p,v] of Object.entries(points)) await page.fill(`[data-pts="${p}"]`, String(v));
  await page.click('[data-act="save-game"]');
}
await page.click('[data-act="start-game"]');
check(await page.isDisabled('[data-act="save-game"]'), 'cannot save a game with no winner');
await shot('05-game-entry-empty');
await page.click('[data-act="set-win"][data-p="julia"][data-k="cut"]');
for (const [p,v] of Object.entries({andy:40,justin:100,nathan:15,tom:0,louna:65,nicolas:120}))
  await page.fill(`[data-pts="${p}"]`, String(v));
await shot('06-game-entry-filled');
await page.click('[data-act="save-game"]');
check((await page.textContent('body')).includes('Julia wins game 1'), 'saving confirms the winner');

// --- a few more games
await play('tom','win',{andy:22,justin:100,julia:35,nathan:80,louna:12,nicolas:47});
await play('louna','win',{andy:5,justin:60,julia:90,nathan:31,tom:120,nicolas:18});
await play('andy','cut',{justin:15,julia:44,nathan:0,tom:66,louna:28,nicolas:150});

// --- leaderboard
await page.click('[data-tab="board"]');
const board = await page.textContent('#view');
check(board.includes('4 games played'), 'leaderboard counts the games');
const totals = await page.evaluate(()=>window.compute().totals);
check(totals.justin === 75, `Justin totals 75 - he hit exactly 200 in game 2 and got the bonus (got ${totals.justin})`);
const fired = await page.evaluate(()=>window.compute().flat.flatMap(f=>f.bonuses));
check(fired.length===1 && fired[0].id==='justin' && fired[0].landed===200, 'the mid-league bonus is recorded, not just applied');
check(totals.andy === -20+40+22+5, `Andy totals ${-20+40+22+5} (got ${totals.andy})`);
const order = await page.$$eval('.lb-row .lb-name', els=>els.map(e=>e.textContent));
const sorted = Object.entries(totals).sort((a,c)=>a[1]-c[1]).map(x=>x[0]);
check(order[0].toLowerCase() === sorted[0], 'lowest score is ranked first');
await shot('07-leaderboard');

// --- bonus fires and is announced
await page.click('[data-tab="session"]');
const before = (await page.evaluate(()=>window.compute().totals)).justin;
await play('julia','win',{andy:0,justin:200-before,nathan:0,tom:0,louna:0,nicolas:0});
const t2 = await page.evaluate(()=>window.compute().totals);
check(t2.justin === 0, `landing exactly on 200 drops Justin to 0 (got ${t2.justin})`);
check((await page.textContent('#toast')).includes('landed exactly on 200'), 'the bonus is announced on screen');
await shot('08-bonus-toast');

// --- edit + delete
await page.click('.gm >> nth=0');
check((await page.textContent('#view')).includes('Edit game 5'), 'tapping a game opens it for editing');
await page.fill('[data-pts="nicolas"]','77');
await page.click('[data-act="save-game"]');
const t3 = await page.evaluate(()=>window.compute().totals);
check(t3.nicolas === 412, `editing an old score recalculates the league (Nicolas ${t3.nicolas}, want 412)`);
check(t3.justin === 0, 'the bonus still holds after the edit');
await page.click('.gm >> nth=0');
await page.click('[data-act="delete-game"]');
const games = await page.evaluate(()=>window.compute().flat.length);
check(games === 4, `deleting a game rolls the league back (${games} games left)`);

// --- chart
await page.click('[data-tab="chart"]');
const paths = await page.$$eval('#chartsvg path[stroke-width="2"]', p=>p.length);
check(paths === 7, `chart draws one line per player (${paths})`);
check((await page.textContent('#scrub')).length > 20, 'the read-out panel under the chart is filled');
await shot('09-chart');
const boxEl = await page.$('#chartsvg'); const bb = await boxEl.boundingBox();
await page.mouse.move(bb.x+bb.width*0.45, bb.y+bb.height/2); await page.mouse.down();
await page.mouse.move(bb.x+bb.width*0.55, bb.y+bb.height/2); await page.mouse.up();
const crossN = await page.$$eval('#cross > *', e=>e.length);
check(crossN >= 8, `dragging draws the crosshair + a dot per player (${crossN} marks)`);
const scrubbed = await page.evaluate(()=>window.ui ? null : null);
check((await page.textContent('#scrub')).match(/Game \d+|Start/) !== null, 'the read-out follows the drag');
await page.click('[data-act="toggle-series"] >> nth=0');
check(await page.isVisible('.lg.dim'), 'tapping a name focuses/dims that player');
await shot('10-chart-scrubbed');

// --- data + export
await page.click('[data-tab="data"]');
await shot('11-data');
const dl = await Promise.all([ page.waitForEvent('download'), page.click('[data-act="export-csv"]') ]);
const csv = fs.readFileSync(await dl[0].path(),'utf8');
const rows = csv.trim().split('\n');
check(rows[0].includes('left_neighbour') && rows[0].includes('starter'), 'CSV carries seating + starter columns');
check(rows.length === 1 + 4*7, `CSV has one row per player per game (${rows.length-1} rows)`);
check(csv.includes('Julia,'), 'CSV uses real names');
console.log('\nCSV sample:\n' + rows.slice(0,3).join('\n'));

// --- persistence across a reload
await page.reload();
const after = await page.evaluate(()=>window.compute().flat.length);
check(after === 4, 'data survives closing and reopening the app');

// --- offline
await ctx.setOffline(true);
await page.reload().catch(()=>{});
await page.waitForTimeout(600);
check((await page.title()).includes('UNO'), 'app still opens with no internet');
await ctx.setOffline(false);

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close();
console.log(fail? `\n${fail} FAILING` : '\nall UI checks pass');
process.exit(fail?1:0);
