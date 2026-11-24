// Picture for the owner: the outline `oneOutlineAt` gives a piece drawn once, over the printed lines.
//   npx vite-node scripts/pattern-import/diag/one-outline-viz.ts <snapshot dir> <bench.json> <label part> <out.png>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { oneOutlineAt, sizelessChains } from 'lib/pattern-import/pieces/one-outline';
import type { ChainSet, Sheet } from 'lib/pattern-import/types';

const require = createRequire(`${process.cwd()}/`);
const { createCanvas } = require('@napi-rs/canvas');
const [dir, benchPath, labelPart, outPng] = process.argv.slice(2);
const f = deserialize(
  gunzipSync(
    readFileSync(
      `${dir}/${readdirSync(dir)
        .filter((x) => x.endsWith('.snap.gz'))
        .sort()
        .pop()}`,
    ),
  ),
).fields as { sheet: Sheet; chains: ChainSet };
const id = dir.split('/').filter(Boolean).pop();
const piece = JSON.parse(readFileSync(benchPath, 'utf8'))
  .files.find((x: { id: string }) => x.id === id)
  .pieces.find((q: { label: string | null }) => (q.label ?? '').includes(labelPart));
const at = piece.at as { x: number; y: number };
const r = oneOutlineAt(f.chains.chains, sizelessChains(f.chains), at, f.sheet.poses);
if (!r) throw new Error('no outline round the label');
const xs = r.outer.map((p) => p.x);
const ys = r.outer.map((p) => p.y);
const pad = 25;
const [x0, x1, y0, y1] = [
  Math.min(...xs) - pad,
  Math.max(...xs) + pad,
  Math.min(...ys) - pad,
  Math.max(...ys) + pad,
];
const W = 1200;
const k = W / (x1 - x0);
const H = Math.ceil((y1 - y0) * k) + 34;
const cv = createCanvas(W, H);
const g = cv.getContext('2d');
g.fillStyle = '#fff';
g.fillRect(0, 0, W, H);
const X = (x: number) => (x - x0) * k;
const Y = (y: number) => 34 + (y - y0) * k;
const role = new Map<number, string>();
for (const c of f.chains.classes) for (const i of c.chains) role.set(i, c.role);
const line = (pts: { x: number; y: number }[], col: string, wd: number, dash: number[] = []) => {
  g.strokeStyle = col;
  g.lineWidth = wd;
  g.setLineDash(dash);
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
  g.stroke();
};
for (const ch of f.chains.chains) {
  if (!ch.pts.some((p) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1)) continue;
  const rl = role.get(ch.id);
  if (rl === 'ignore') continue;
  line(
    ch.pts,
    rl === 'size' ? '#9bd' : rl === 'common' ? '#000' : '#7a7',
    rl === 'common' ? 1.6 : 0.9,
  );
}
line([...r.outer, r.outer[0]], '#12f', 3, [10, 6]);
g.setLineDash([]);
g.strokeStyle = '#f80';
g.lineWidth = 3;
g.beginPath();
g.moveTo(X(at.x) - 12, Y(at.y));
g.lineTo(X(at.x) + 12, Y(at.y));
g.moveTo(X(at.x), Y(at.y) - 12);
g.lineTo(X(at.x), Y(at.y) + 12);
g.stroke();
g.fillStyle = '#000';
g.font = '16px sans-serif';
const per = r.outer.reduce(
  (a, p, i) =>
    a +
    Math.hypot(
      p.x - r.outer[(i + 1) % r.outer.length].x,
      p.y - r.outer[(i + 1) % r.outer.length].y,
    ),
  0,
);
g.fillText(
  `«${piece.label}» · BLUE = the one outline given to every size (${Math.round(per)} mm) · black = common lines · green = inner lines · light blue = size lines · cross = label`,
  8,
  22,
);
writeFileSync(outPng, cv.toBuffer('image/png'));
console.log(outPng, Math.round(per), 'mm', r.chains.length, 'chains');
