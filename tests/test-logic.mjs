import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await b.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
await page.goto('http://localhost:8099/index.html');

const mk = (rows) => ({ version:1, sessions:[{ id:'s1', startedAt:1, endedAt:null,
  seating:['andy','justin','julia','nathan','tom','louna','nicolas'],
  games: rows.map((r,i)=>({ id:'g'+i, startedAt:100+i, endedAt:200+i, starter:'andy', entries:r })) }] });

const pts = o => { const e={}; for(const k in o) e[k] = typeof o[k]==='string' ? {kind:o[k],points:null} : {kind:'points',points:o[k]}; return e; };

const cases = [
  { name:'winner -10, cut -20, plain points',
    games:[ pts({andy:'win',  justin:100, julia:50, nathan:60, tom:70, louna:80, nicolas:90}),
            pts({andy:5, justin:'cut', julia:50, nathan:60, tom:70, louna:80, nicolas:90}) ],
    want:{ andy:-5, justin:80, julia:100, nathan:120, tom:140, louna:160, nicolas:180 } },

  { name:'exact 200 fires -200',
    games:[ pts({andy:'win', justin:100, julia:0, nathan:0, tom:0, louna:0, nicolas:0}),
            pts({andy:0, justin:100, julia:'win', nathan:0, tom:0, louna:0, nicolas:0}) ],
    want:{ justin:0 } },

  { name:'landing on 400 gives -200 and does NOT chain from 200 to 0',
    games:[ pts({andy:'win', justin:400, julia:0, nathan:0, tom:0, louna:0, nicolas:0}) ],
    want:{ justin:200 } },

  { name:'199 and 201 get nothing (exact landing only)',
    games:[ pts({andy:'win', justin:199, julia:201, nathan:0, tom:0, louna:0, nicolas:0}) ],
    want:{ justin:199, julia:201 } },

  { name:'exact birth year: Tom 2003 -> -230',
    games:[ pts({andy:'win', justin:0, julia:0, nathan:0, tom:2003, louna:0, nicolas:0}) ],
    want:{ tom:1773 } },

  { name:'exact birth year: Andy 1999 -> -270 (age 27)',
    games:[ pts({andy:1999, justin:'win', julia:0, nathan:0, tom:0, louna:0, nicolas:0}) ],
    want:{ andy:1729 } },

  { name:'total of exactly 0 does not fire the 200 rule',
    games:[ pts({andy:'win', justin:10, julia:0, nathan:0, tom:0, louna:0, nicolas:0}),
            pts({andy:0, justin:'win', julia:0, nathan:0, tom:0, louna:0, nicolas:0}) ],
    want:{ andy:-10, justin:0 } },

  { name:'negative totals never fire a bonus',
    games:[ pts({andy:'cut', justin:0, julia:0, nathan:0, tom:0, louna:0, nicolas:0}),
            pts({andy:'cut', justin:0, julia:0, nathan:0, tom:0, louna:0, nicolas:0}),
            pts({andy:'cut', justin:0, julia:0, nathan:0, tom:0, louna:0, nicolas:0}) ],
    want:{ andy:-60 } },
];

let fail = 0;
for (const c of cases) {
  const got = await page.evaluate((st)=>{ window.state = st; return window.compute().totals; }, mk(c.games));
  const bad = Object.entries(c.want).filter(([k,v]) => got[k] !== v);
  if (bad.length) { fail++; console.log('FAIL  ' + c.name);
    bad.forEach(([k,v]) => console.log(`        ${k}: want ${v}, got ${got[k]}`)); }
  else console.log('ok    ' + c.name);
}

// starter suggestion = lowest total, ties by seat order
const st = await page.evaluate(()=>{
  window.state = { version:1, sessions:[] };
  const seat=['tom','louna','andy','justin','julia','nathan','nicolas'];
  return [ window.suggestStarter(seat, {andy:5,justin:2,julia:9,nathan:4,tom:7,louna:1,nicolas:3}),
           window.suggestStarter(seat, {andy:0,justin:0,julia:0,nathan:0,tom:0,louna:0,nicolas:0}),
           window.suggestStarter(['tom','louna','andy'], {andy:5,justin:99,julia:99,nathan:99,tom:7,louna:1,nicolas:99}) ];
});
if (st[0]==='julia' && st[1]==='tom' && st[2]==='tom')
  console.log('ok    starter = highest total (last place), ties by seat order, only players at the table');
else { fail++; console.log('FAIL  starter picking:', st); }

// an update must never interrupt a game that is being typed in
const upd = await page.evaluate(()=>{
  const before = window.location.href;
  window.ui.editing = { game:{entries:{}}, seating:['andy'], isNew:true };
  const reloaded = window.onNewVersion();          // returns false = deferred
  window.ui.editing = null;
  return { reloaded, stillHere: window.location.href === before };
});
if (upd.reloaded === false && upd.stillHere) console.log('ok    an app update waits until the game in progress is saved');
else { fail++; console.log('FAIL  update interrupted a game in progress', upd); }

if (errs.length) { fail++; console.log('FAIL  page errors:', errs); }
await b.close();
console.log(fail ? `\n${fail} FAILING` : '\nall logic checks pass');
process.exit(fail?1:0);
