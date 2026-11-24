// One piece, every size the label-seeded walk closed, drawn over the printed lines.
//   node walk-lone-viz.mjs <snapshot dir> <walk-carry lone dump.json> <piece label> <out.png>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const require = createRequire(process.cwd() + '/');
const { createCanvas } = require('@napi-rs/canvas');
const [dir, dumpPath, label, outPng] = process.argv.slice(2);
const f = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop()))).fields;
const role = new Map(); for (const c of f.chains.classes) for (const i of c.chains) role.set(i, c.role);
const items = JSON.parse(readFileSync(dumpPath, 'utf8')).filter((r) => r.pts && r.label.includes(label));
const all = items.flatMap((r) => r.pts); const x0 = Math.min(...all.map((q) => q[0])) - 10, x1 = Math.max(...all.map((q) => q[0])) + 10, y0 = Math.min(...all.map((q) => q[1])) - 10, y1 = Math.max(...all.map((q) => q[1])) + 10;
const W = 1500, k = W / (x1 - x0), H = Math.ceil((y1 - y0) * k) + 40; const cv = createCanvas(W, H), g = cv.getContext('2d');
g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
const X = (x) => (x - x0) * k, Y = (y) => 40 + (y - y0) * k;
const line = (pts, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); pts.forEach((q, i) => { const x = q.x ?? q[0], y = q.y ?? q[1]; i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); }); g.stroke(); };
for (const ch of f.chains.chains) { if (role.get(ch.id) === 'ignore' || !ch.pts.some((q) => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1)) continue; line(ch.pts, '#cfcfcf', 0.8); }
items.forEach((r, i) => line([...r.pts, r.pts[0]], `hsl(${220 - (200 * i) / Math.max(1, items.length - 1)} 85% 42%)`, 1.6));
g.fillStyle = '#000'; g.font = '16px sans-serif';
g.fillText(`${label}: ${items.length} sizes closed by the walk round the piece label (${items.map((r) => r.size).join(', ')}) · grey = printed lines · colour runs from the smallest size (blue) to the largest (red)`, 8, 22);
writeFileSync(outPng, cv.toBuffer('image/png')); console.log(outPng, items.length);
