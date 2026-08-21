/* The distance-to-average chart. The value must be a player's total minus the
   average of everyone in the league at that moment - which is not the same as
   the average of all seven, because Tom and Nicolas joined late. */
import { chromium } from 'playwright';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:8099/index.html');
await p.click('[data-tab="chart"]');

// both charts are on screen
check(await p.isVisible('#chartgap'), 'the new chart is there');
check(await p.isVisible('#chartsvg'), 'the total-points chart is still there');
const lines = id => p.$$eval('#'+id+' path[stroke-width="2"]', e=>e.length);
check(await lines('chartgap') === 7, `the new chart draws all seven players (${await lines('chartgap')})`);

// the numbers must be right
const data = await p.evaluate(()=>{
  const c = window.compute(), m = window.averages(c), n = c.snaps.length-1;
  const at = i => ({ live: window.liveAt(c,i), mean: m[i],
    gaps: Object.fromEntries(window.liveAt(c,i).map(id=>[id, window.gapValue(c,m,i,id)])),
    totals: c.snaps[i].totals });
  return { n, first: at(1), mid: at(50), last: at(n), joined: c.joined };
});

// at game 1 only the original five are in the league
check(data.first.live.length === 5 && !data.first.live.includes('tom') && !data.first.live.includes('nicolas'),
  'early on the average covers only the five who were playing: '+data.first.live.join(', '));
const meanOf = (ids, totals) => ids.reduce((a,id)=>a+totals[id],0)/ids.length;
check(Math.abs(data.first.mean - meanOf(data.first.live, data.first.totals)) < 1e-9,
  `the average is the mean of those five (${data.first.mean.toFixed(2)})`);

// a gap really is total minus average
const badGap = Object.entries(data.last.gaps)
  .filter(([id,g]) => Math.abs(g - (data.last.totals[id] - data.last.mean)) > 1e-9);
check(badGap.length === 0, 'every value is exactly total minus the average');

// the gaps of everyone in the league must cancel out to zero
const sum = Object.values(data.last.gaps).reduce((a,g)=>a+g,0);
check(Math.abs(sum) < 1e-9, `the seven gaps sum to zero (${sum.toExponential(2)})`);
check(Math.abs(Object.values(data.mid.gaps).reduce((a,g)=>a+g,0)) < 1e-9, 'and mid-league too');

// Tom joined at game 24, so he has no value before that
check(data.joined.tom === 23 && data.joined.nicolas === 66,
  `late joiners start at their first game (Tom ${data.joined.tom}, Nicolas ${data.joined.nicolas})`);
const early = await p.evaluate(()=>{
  const c=window.compute(), m=window.averages(c);
  return { tomIn: window.liveAt(c,10).includes('tom'), n: window.liveAt(c,10).length };
});
check(!early.tomIn && early.n === 5, 'Tom is not dragged into the average before he joined');

// the leader should be the furthest below the average
const c2 = await p.evaluate(()=>window.compute());
const lowest = c2.stats[0].id;
const most = Object.entries(data.last.gaps).sort((a,b)=>a[1]-b[1])[0][0];
check(lowest === most, `the player winning is the one furthest below average (${most})`);

// dimming a player is a way of looking, not a change to the data
const beforeMean = data.last.mean;
await p.click('[data-act="toggle-series"] >> nth=0');
const afterMean = await p.evaluate(()=>{ const c=window.compute(); return window.averages(c).slice(-1)[0]; });
check(Math.abs(beforeMean-afterMean) < 1e-9, 'hiding a player does not move the average');

// scrubbing drives both charts from either one
await p.click('[data-act="toggle-series"] >> nth=0');
const box = await (await p.$('#chartgap')).boundingBox();
await p.mouse.move(box.x+box.width*0.4, box.y+box.height/2);
await p.mouse.down(); await p.mouse.move(box.x+box.width*0.6, box.y+box.height/2); await p.mouse.up();
check(await p.$$eval('#chartgap .cross > *', e=>e.length) >= 2, 'dragging the new chart shows its crosshair');
check(await p.$$eval('#chartsvg .cross > *', e=>e.length) >= 2, 'and moves the other chart in step');
check((await p.textContent('#scrub')).includes('how far from the average'), 'the read-out explains both numbers');

await p.screenshot({path:'tests/shots/G-gap.png'});
await p.evaluate(()=>window.scrollTo(0,99999));
await p.screenshot({path:'tests/shots/G-both.png'});

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close();
console.log(fail?`\n${fail} FAILING`:'\ndistance-to-average chart verified');
process.exit(fail?1:0);
