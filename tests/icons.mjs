import { chromium } from 'playwright';
import fs from 'fs';
const svg = fs.readFileSync('/home/user/competitive-uno/icon.svg','utf8');
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const size of [180,512]) {
  const p = await b.newPage({ viewport:{width:size,height:size}, deviceScaleFactor:1 });
  await p.setContent(`<body style="margin:0">${svg.replace('<svg','<svg width="'+size+'" height="'+size+'"')}</body>`);
  await p.screenshot({ path:`/home/user/competitive-uno/icon-${size}.png`, omitBackground:false });
  await p.close();
}
await b.close();
console.log('icons ok');
