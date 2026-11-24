import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { Grid } from './grid.mjs';
const require = createRequire(process.cwd() + '/');
const { createCanvas } = require('@napi-rs/canvas');
const [dir, size, x0s, y0s, x1s, y1s, outPng] = process.argv.slice(2);
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((f) => f.endsWith('.snap.gz')).sort().pop())));
const f = s.fields;
const cells = JSON.parse(readFileSync(`${dir}/cells.json`, 'utf8'));
const rank = s.ranks.find((r) => r.label === size).rank;
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank]));
const info = new Map();
for (const c of f.chains.classes) for (const ch of c.chains) info.set(ch, { role: c.role, rank: c.role === 'size' ? rankOfClass.get(c.id) ?? null : null, cls: c.id });
const [x0, y0, x1, y1] = [+x0s, +y0s, +x1s, +y1s];
const k = Math.min(1400 / (x1 - x0), 1400 / (y1 - y0)), W = Math.ceil((x1 - x0) * k), H = Math.ceil((y1 - y0) * k);
const cv = createCanvas(W, H), g = cv.getContext('2d');
g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
const X = (x) => (x - x0) * k, Y = (y) => (y - y0) * k;
const line = (pts, col, w, dash = []) => { g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p.x ?? p[0]), Y(p.y ?? p[1])) : g.moveTo(X(p.x ?? p[0]), Y(p.y ?? p[1])))); g.stroke(); };
const inBox = (p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
const grid = new Grid();
const own = [];
for (const ch of f.chains.chains) {
  if (!ch.pts.some(inBox)) continue;
  const i = info.get(ch.id);
  const kind = !i ? 'unassigned' : i.role === 'size' ? (i.rank === rank ? 'own' : 'other') : i.role;
  if (kind === 'own') own.push(ch); else for (let q = 1; q < ch.pts.length; q++) grid.add(ch.pts[q - 1], ch.pts[q], ch.id);
  const col = { own: '#11f', other: '#bbb', common: '#000', ignore: '#f9c', unassigned: '#f80', internal: '#0a0', notch: '#0a0', seam: '#0a0', grain: '#0a0' }[kind];
  if (kind !== 'own') line(ch.pts, col, kind === 'common' ? 2 : 1);
}
for (const ch of own) line(ch.pts, '#11f', 3);
for (const fam of cells) for (const c of fam.cells) if (c.size === size && c.outer && c.outer.some(([x, y]) => inBox({ x, y }))) line([...c.outer, c.outer[0]], '#e00', 1.2, [6, 5]);
// dangling ends of the size's own chains inside the box
const ends = [];
for (const ch of own) for (const e of [ch.pts[0], ch.pts[ch.pts.length - 1]]) {
  if (!inBox(e) || ch.closed) continue;
  const ownNear = own.some((o) => o !== ch && o.pts.some((p) => Math.hypot(p.x - e.x, p.y - e.y) < 0.6));
  if (ownNear) continue;
  const near = [...grid.near(e.x, e.y, 0.6)].map(([id]) => { const i = info.get(id); const c = f.chains.chains[id]; return `${!i ? 'unassigned' : i.role === 'size' ? 'size ' + s.ranks.find((r) => r.rank === i.rank)?.label : i.role}(len ${Math.round(c.lengthMm)}, motif ${JSON.stringify(c.motif)})`; });
  ends.push({ at: [Math.round(e.x), Math.round(e.y)], chain: ch.id, lenMm: Math.round(ch.lengthMm), touches: near });
  g.setLineDash([]); g.strokeStyle = '#e00'; g.lineWidth = 2; g.beginPath(); g.arc(X(e.x), Y(e.y), 9, 0, 6.3); g.stroke();
}
g.setLineDash([]); g.fillStyle = '#000'; g.font = '15px sans-serif';
g.fillText(`size ${size}: BLUE own line · BLACK common · grey other sizes · pink ignore · green marks · orange unassigned · red dashed = closed outline · red circle = loose end of own line`, 8, 18);
writeFileSync(outPng, cv.toBuffer('image/png'));
console.log(JSON.stringify(ends, null, 0).replace(/\},/g, '},\n'));
