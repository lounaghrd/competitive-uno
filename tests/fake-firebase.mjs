/* A stand-in for the real shared database, speaking the same shapes:
   GET /x.json, PATCH /x.json, and a live stream over server-sent events.
   Lets the multi-phone tests run without touching anything real. */
import http from 'http';
let store = {};
const clients = new Set();
const at = (path) => path.replace(/\.json$/,'').split('/').filter(Boolean);
const get = (segs) => segs.reduce((o,k)=> (o==null?undefined:o[k]), store);
const merge = (segs, body) => {
  let o = store;
  for (const k of segs) { if (typeof o[k] !== 'object' || o[k]===null) o[k] = {}; o = o[k]; }
  Object.assign(o, body);
};
const notify = () => { for (const r of clients) r.write(`event: patch\ndata: {"path":"/"}\n\n`); };

export function start(port=8097, delayMs=0){
  const srv = http.createServer((req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Headers','*');
    res.setHeader('Access-Control-Allow-Methods','GET,PATCH,PUT,OPTIONS');
    if(req.method==='OPTIONS'){ res.writeHead(204); return res.end(); }
    const segs = at(req.url.split('?')[0]);
    if(req.headers.accept?.includes('text/event-stream')){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      res.write(`event: put\ndata: {"path":"/","data":null}\n\n`);
      clients.add(res); req.on('close',()=>clients.delete(res));
      return;
    }
    if(req.method==='GET'){
      res.writeHead(200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify(get(segs) ?? null));
    }
    let body=''; req.on('data',c=>body+=c);
    req.on('end',()=>{
      const go = () => { try {
        const parsed = JSON.parse(body||'{}');
        if(globalThis.__UNO_LOG) console.log('   PATCH /'+segs.join('/')+' <-', Object.keys(parsed).join(','));
        merge(segs, parsed);
      } catch(e){}
      res.writeHead(200,{'Content-Type':'application/json'}); res.end(body||'{}');
      notify(); };
      if(delayMs) setTimeout(go, delayMs); else go();
    });
  }).listen(port);
  return { srv, reset(){ store={}; }, dump(){ return store; } };
}
