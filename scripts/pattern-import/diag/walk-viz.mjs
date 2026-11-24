// Pictures for the owner: the reference outline against the outline the walk found, zoomed on the
// place where they differ most.   node walk-viz.mjs <snapshot dir> <walk dump.json> <out.png> [sizes]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const require = createRequire(process.cwd() + '/');
const { createCanvas } = require('@napi-rs/canvas');
const [dir, dumpPath, outPng, only] = process.argv.slice(2);
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields;
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank])); const labOf = new Map(s.ranks.map((r) => [r.rank, r.label]));
const nameOf = new Map(); for (const c of f.chains.classes) for (const i of c.chains) nameOf.set(i, c.role === 'size' ? labOf.get(rankOfClass.get(c.id)) : c.role);
let items = JSON.parse(readFileSync(dumpPath, 'utf8')); if (only) items = items.filter((x) => only.split(',').includes(x.size));
const P = 520, HALF = 14, cols = Math.min(4, items.length), rows = Math.ceil(items.length / cols);
const cv = createCanvas(cols * P, rows * (P + 26) + 30), g = cv.getContext('2d');
g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
g.fillStyle = '#000'; g.font = '15px sans-serif';
g.fillText('RED = outline in the reference set · BLUE = outline found by the walk · black = printed lines of this size · grey = other printed lines · each panel 28 × 28 mm at the largest difference', 8, 18);
items.forEach((it, n) => {
  const ox = (n % cols) * P, oy = 30 + Math.floor(n / cols) * (P + 26);
  const rg = new Grid(); const rp = it.ref.map(([x, y]) => ({ x, y })); for (let k = 1; k < rp.length; k++) rg.add(rp[k - 1], rp[k], 0);
  let worst = { d: -1 }; const w = [...it.walk, it.walk[0]];
  for (let k = 1; k < w.length; k++) { const [ax, ay] = w[k - 1], [bx, by] = w[k]; const m = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay))); for (let q = 0; q < m; q++) { const x = ax + ((bx - ax) * (q + 0.5)) / m, y = ay + ((by - ay) * (q + 0.5)) / m; const nr = rg.near(x, y, 40); const d = nr.size ? nr.get(0) : 40; if (d > worst.d) worst = { d, x, y }; } }
  const k = P / (2 * HALF), X = (x) => ox + (x - worst.x + HALF) * k, Y = (y) => oy + 22 + (y - worst.y + HALF) * k;
  g.save(); g.beginPath(); g.rect(ox + 2, oy + 22, P - 4, P - 2); g.clip();
  const line = (pts, col, wd, dash = []) => { g.strokeStyle = col; g.lineWidth = wd; g.setLineDash(dash); g.beginPath(); pts.forEach((q, i) => { const x = q.x ?? q[0], y = q.y ?? q[1]; i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); }); g.stroke(); };
  for (const ch of f.chains.chains) { if (!ch.pts.some((q) => Math.abs(q.x - worst.x) < HALF + 5 && Math.abs(q.y - worst.y) < HALF + 5)) continue; const nm = nameOf.get(ch.id); line(ch.pts, nm === it.size ? '#000' : '#bbb', nm === it.size ? 2.2 : 1); }
  line(it.ref, '#e11', 2.5, [9, 6]); line(w, '#12f', 2.5, [3, 4]);
  g.restore(); g.setLineDash([]); g.strokeStyle = '#888'; g.lineWidth = 1; g.strokeRect(ox + 2, oy + 22, P - 4, P - 2);
  g.fillStyle = '#000'; g.fillText(`${it.id} · size ${it.size} · reference: ${it.verdict} · largest difference ${worst.d.toFixed(1)} mm`, ox + 8, oy + 16);
});
writeFileSync(outPng, cv.toBuffer('image/png'));
console.log(outPng, items.length, 'panels');
