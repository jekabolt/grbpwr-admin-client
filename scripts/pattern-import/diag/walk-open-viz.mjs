// Pictures of open cells the walk closed: whole piece, the walk outline over the printed lines.
//   node walk-open-viz.mjs <snapshot dir> <walk-carry open dump.json> <out.png> <result kinds, comma> [nest]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const require = createRequire(process.cwd() + '/');
const { createCanvas } = require('@napi-rs/canvas');
const [dir, dumpPath, outPng, kinds, nestArg] = process.argv.slice(2);
const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
const f = s.fields; const cells = JSON.parse(readFileSync(dir + '/cells.json', 'utf8'));
const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank])); const labOf = new Map(s.ranks.map((r) => [r.rank, r.label])); const rankOf = new Map(s.ranks.map((r) => [r.label, r.rank]));
const nameOf = new Map(); for (const c of f.chains.classes) for (const i of c.chains) nameOf.set(i, c.role === 'size' ? labOf.get(rankOfClass.get(c.id)) : c.role);
const items = JSON.parse(readFileSync(dumpPath, 'utf8')).filter((r) => r.pts && kinds.split(',').includes(r.result) && (!nestArg || nestArg.split(',').includes(r.nest)));
const P = 460, cols = Math.min(4, items.length), rows = Math.ceil(items.length / cols);
const cv = createCanvas(cols * P, rows * (P + 24) + 30), g = cv.getContext('2d');
g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#000'; g.font = '15px sans-serif';
g.fillText('BLUE = outline found by the walk · black = printed lines of this size · green = nearest closed sizes on both sides · grey = other printed lines · orange = stretch drawn from a neighbour', 8, 18);
items.forEach((it, n) => {
  const ox = (n % cols) * P, oy = 30 + Math.floor(n / cols) * (P + 24);
  const xs = it.pts.map((q) => q[0]), ys = it.pts.map((q) => q[1]); const x0 = Math.min(...xs) - 8, x1 = Math.max(...xs) + 8, y0 = Math.min(...ys) - 8, y1 = Math.max(...ys) + 8;
  const k = Math.min((P - 8) / (x1 - x0), (P - 8) / (y1 - y0)); const X = (x) => ox + 4 + (x - x0) * k + ((P - 8) - (x1 - x0) * k) / 2, Y = (y) => oy + 22 + (y - y0) * k + ((P - 8) - (y1 - y0) * k) / 2;
  g.save(); g.beginPath(); g.rect(ox + 2, oy + 22, P - 4, P - 2); g.clip();
  const line = (pts, col, wd, dash = []) => { g.strokeStyle = col; g.lineWidth = wd; g.setLineDash(dash); g.beginPath(); pts.forEach((q, i) => { const x = q.x ?? q[0], y = q.y ?? q[1]; i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); }); g.stroke(); };
  for (const ch of f.chains.chains) { if (!ch.pts.some((q) => q.x > x0 && q.x < x1 && q.y > y0 && q.y < y1)) continue; const nm = nameOf.get(ch.id); if (nm === 'ignore') continue; line(ch.pts, nm === it.size ? '#000' : '#c8c8c8', nm === it.size ? 1.8 : 0.8); }
  const fam = cells.find((x) => x.seed === it.seed); const rank = rankOf.get(it.size); const closed = fam.cells.filter((c) => c.outcome === 'closed' && c.outer && rankOf.has(c.size)).map((c) => ({ r: rankOf.get(c.size), o: c.outer }));
  for (const nb of [closed.filter((c) => c.r < rank).sort((a, b) => b.r - a.r)[0], closed.filter((c) => c.r > rank).sort((a, b) => a.r - b.r)[0]]) if (nb) line([...nb.o, nb.o[0]], '#2a9d4a', 1.1);
  line([...it.pts, it.pts[0]], '#12f', 2.2, [5, 4]);
  for (const d of it.drawn ?? []) line(d.pts, '#f60', 3);
  g.restore(); g.setLineDash([]); g.strokeStyle = '#888'; g.lineWidth = 1; g.strokeRect(ox + 2, oy + 22, P - 4, P - 2);
  g.fillStyle = '#000'; g.fillText(`${it.label.slice(0, 24)} · size ${it.size} · own ${Math.round(100 * it.own)}% shared ${Math.round(100 * it.shared)}% · ${it.nest}`, ox + 6, oy + 16);
});
writeFileSync(outPng, cv.toBuffer('image/png')); console.log(outPng, items.length);
