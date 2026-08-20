import http from 'http'; import fs from 'fs'; import path from 'path';
const root='/home/user/competitive-uno';
const types={'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(root,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}); res.end(d); });
}).listen(8099,()=>console.log('up on 8099'));
