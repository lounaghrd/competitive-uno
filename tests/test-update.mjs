/* Publishes a change while the app is installed, and checks the phone picks it
   up on its own — no second open, no clearing anything. */
import { chromium } from 'playwright';
import fs from 'fs'; import http from 'http'; import path from 'path';

const SRC='/home/user/competitive-uno';
const DIR='/tmp/claude-0/-home-user-competitive-uno/855046ed-9dda-5049-840e-207f8b07cb7a/scratchpad/pub';
fs.rmSync(DIR,{recursive:true,force:true}); fs.mkdirSync(DIR,{recursive:true});
for (const f of ['index.html','sw.js','history.js','manifest.webmanifest','icon.svg'])
  fs.copyFileSync(path.join(SRC,f), path.join(DIR,f));

const types={'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const srv=http.createServer((req,res)=>{
  let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
  fs.readFile(path.join(DIR,p),(e,d)=>{
    if(e){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':types[path.extname(p)]||'text/plain','Cache-Control':'no-cache'});
    res.end(d);});
}).listen(8098);

let fail=0; const check=(c,m)=>{ if(c) console.log('ok    '+m); else { fail++; console.log('FAIL  '+m); } };
const b=await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx=await b.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));

// --- install
await page.goto('http://localhost:8098/index.html');
await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:15000});
check(true,'app installs and the offline worker takes control');
const v1=await page.evaluate(()=>window.APP_VERSION);
check((await page.evaluate(()=>window.compute().flat.length))===101,'history loaded on the installed copy');

// --- it must open with no network at all
await ctx.setOffline(true);
await page.reload();
check((await page.evaluate(()=>window.compute().flat.length))===101,'opens offline with the league intact');
await ctx.setOffline(false);

// --- now publish a change, the way a push to the site would
fs.writeFileSync(path.join(DIR,'index.html'),
  fs.readFileSync(path.join(DIR,'index.html'),'utf8').replace('var APP_VERSION = "'+v1+'"','var APP_VERSION = "TEST-NEXT"'));
fs.writeFileSync(path.join(DIR,'sw.js'),
  fs.readFileSync(path.join(DIR,'sw.js'),'utf8').replace('var CACHE = "uno-v3"','var CACHE = "uno-v99"'));

// --- one ordinary open is all the user does
await page.goto('http://localhost:8098/index.html');
await page.waitForFunction(()=>window.APP_VERSION==='TEST-NEXT',{timeout:20000})
  .then(()=>check(true,'the new version appears by itself, on one ordinary open'))
  .catch(async()=>check(false,'new version did NOT appear (still '+await page.evaluate(()=>window.APP_VERSION)+')'));

// --- and the data survived the update
check((await page.evaluate(()=>window.compute().flat.length))===101,'all 101 games survive the update');

if(errs.length){ fail++; console.log('FAIL  page errors: '+errs.join(' | ')); }
await b.close(); srv.close();
console.log(fail?`\n${fail} FAILING`:'\nself-update verified');
process.exit(fail?1:0);
