/* Who sits next to whom, and the freshest seating. */
import { chromium } from 'playwright';
let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8099/index.html');
await p.click('[data-tab="chart"]'); await p.waitForTimeout(400);

// counts, against numbers derived independently from the session seatings
const cnt = await p.evaluate(()=>window.neighbourCounts());
const expect = {'julia|justin':78,'louna|nathan':62,'julia|nathan':54,'andy|justin':52,'andy|tom':49};
const wrong = Object.entries(expect).filter(([k,v])=>cnt[k]!==v);
check(wrong.length===0, 'the top pairs match the hand-computed counts: '+JSON.stringify(wrong));
const total = Object.values(cnt).reduce((a,v)=>a+v,0);
check(total===618, `every game contributes one count per adjacent pair (${total} = 23x5 + 43x6 + 35x7)`);
check(cnt['julia|nicolas']===undefined && cnt['justin|nicolas']===undefined,
  'Julia and Justin have never sat beside Nicolas');

// two players at a table are neighbours once per game, not twice
const two = await p.evaluate(()=>{
  const keep=window.state.sessions;
  window.state.sessions=[{id:'x',seating:['andy','tom'],games:[{id:'g',entries:{}}]}];
  const r=window.neighbourCounts(); window.state.sessions=keep; return r;
});
check(two['andy|tom']===1, `a two-player table counts once (${two['andy|tom']})`);

// the suggestion really is the best of all 720 arrangements
const best = await p.evaluate(()=>{
  const c=window.compute(), cnt=window.neighbourCounts();
  const seated=['andy','justin','julia','nathan','tom','louna','nicolas'].filter(id=>c.joined[id]!==undefined);
  const f=window.freshestSeating(seated,cnt);
  // exhaustive check by a separate route: score every rotation-free order
  let min=Infinity, count=0;
  const rest=seated.slice(1), out=[], used=rest.map(()=>false);
  (function rec(){
    if(out.length===rest.length){ count++; min=Math.min(min,window.seatingCost([seated[0]].concat(out),cnt)); return; }
    for(let i=0;i<rest.length;i++) if(!used[i]){ used[i]=true; out.push(rest[i]); rec(); out.pop(); used[i]=false; }
  })();
  return { chosen:f.order, cost:f.cost, min, count, avg:Math.round(f.avg), unseen:f.unseen,
           recomputed: window.seatingCost(f.order, cnt) };
});
check(best.count===720, `all 720 arrangements were considered (${best.count})`);
check(best.cost===best.min, `it picks the lowest-repetition one (${best.cost} = ${best.min})`);
check(best.recomputed===best.cost, 'and scoring the chosen order again agrees');
check(best.unseen===2, `it uses both never-before pairings (${best.unseen})`);
check(best.cost < best.avg*0.65, `well below an average seating (${best.cost} vs ${best.avg})`);
check(new Set(best.chosen).size===7, 'everyone is seated exactly once');
console.log('        suggestion:', best.chosen.join(' > '));

// it must render
check(await p.$$eval('#neighbours line', e=>e.length) === 21, 'a line for all 21 pairs');
check(await p.$$eval('#neighbours g[data-act]', e=>e.length) === 7, 'a seat for each player');
check(await p.$$eval('#neighbours line[stroke-dasharray]', e=>e.length) === 2, 'the two never-paired lines are dashed');
await p.screenshot({path:'tests/shots/N-neighbours.png'});

// tapping a player narrows it to their lines
await p.click('#neighbours g[data-act="focus-neighbour"] >> nth=0');
check(await p.evaluate(()=>window.ui.focusSeat) !== null, 'tapping a seat focuses that player');
const dimmed = await p.$$eval('#neighbours line', els=>els.filter(e=>+e.getAttribute('opacity')<0.2).length);
check(dimmed === 15, `their 6 lines stay lit, the other 15 fade (${dimmed})`);
await p.screenshot({path:'tests/shots/N-focus.png'});
await p.click('#neighbours g[data-act="focus-neighbour"] >> nth=0');
check(await p.evaluate(()=>window.ui.focusSeat) === null, 'tapping again clears it');

// the seating screen can apply it
await p.click('[data-tab="session"]');
await p.click('[data-act="new-session"]');
check(await p.isVisible('[data-act="seat-fresh"]'), 'the seating screen offers it');
await p.click('[data-act="seat-fresh"]');
const draft = await p.evaluate(()=>window.ui.draftSeat);
/* A round table has no first seat and no direction, so two orders are the same
   seating when they produce the same set of neighbouring pairs. */
const cycle = o => new Set(o.map((x,i)=>[x,o[(i+1)%o.length]].sort().join('|'))).size===o.length
  ? o.map((x,i)=>[x,o[(i+1)%o.length]].sort().join('|')).sort().join(',') : 'invalid';
check(draft.length===7 && cycle(draft)===cycle(best.chosen),
  'and applies the same circle: '+draft.join(' > '));
check(await p.evaluate(([d,c])=>window.seatingCost(d,window.neighbourCounts())===window.seatingCost(c,window.neighbourCounts()),
  [draft,best.chosen]), 'with an identical repetition score');
await p.screenshot({path:'tests/shots/N-seating.png'});

// with only some players it solves for those
await p.click('[data-act="seat-clear"][data-i="0"]');
await p.click('[data-act="seat-clear"][data-i="0"]');
await p.click('[data-act="seat-fresh"]');
const five = await p.evaluate(()=>window.ui.draftSeat);
check(five.length===5, `with five at the table it seats five (${five.length})`);

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close();
console.log(fail?`\n${fail} FAILING`:'\nneighbour chart and seating suggestion verified');
process.exit(fail?1:0);
