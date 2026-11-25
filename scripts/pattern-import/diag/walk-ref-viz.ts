// A reference outline against the product walk, zoomed where they are farthest apart, over every
// printed stroke of the sheet — for the owner to say which of the two is right.
//   npx vite-node scripts/pattern-import/diag/walk-ref-viz.ts <reference.json> <clone with .runs> <out.png> <piece>:<size> […]
//   CAPTION_RU=1 for Russian captions (a picture for the owner; the repo's own pictures stay English)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { bboxOf } from 'lib/pattern-import/pieces/geom';
import {
  differs,
  sharedStretches,
  WALK,
  walkLines,
  walkOutline,
} from 'lib/pattern-import/pieces/walk';
import type { PtMm } from 'lib/pattern-import/types';

const require = createRequire(`${process.cwd()}/`);
const { createCanvas } = require('@napi-rs/canvas');
const [refPath, base, out, ...specs] = process.argv.slice(2);
const ru = !!process.env.CAPTION_RU;
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces = Array.isArray(raw) ? raw : raw.pieces;
const P = 560;
const cols = Math.min(4, specs.length);
const rows = Math.ceil(specs.length / cols);
const cv = createCanvas(P * cols, rows * (P + 26) + 30);
const g = cv.getContext('2d');
g.fillStyle = '#fff';
g.fillRect(0, 0, cv.width, cv.height);
g.fillStyle = '#000';
g.font = '15px "Helvetica Neue", Arial, sans-serif';
g.fillText(
  ru
    ? 'КРАСНЫЙ = контур из эталона · СИНИЙ = обход · чёрный = линии этого размера (по чтению) · зелёный = все напечатанные штрихи · панель 20 × 20 мм в месте наибольшего расхождения'
    : 'RED = the reference outline · BLUE = the walk · black = lines of this size (by the reader) · green = every printed stroke · each panel 20 × 20 mm at the largest difference',
  8,
  18,
);
specs.forEach((spec, n) => {
  const [pid, size] = spec.split(':');
  const p = pieces.find((x: { id: string }) => x.id === pid);
  const root = `${base}/${p.root}`;
  const dir = `${root}/${readdirSync(root).find((d) => d.includes(p.file))}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap: any = deserialize(
    gunzipSync(
      readFileSync(
        `${dir}/${readdirSync(dir)
          .filter((x) => x.endsWith('.snap.gz'))
          .sort()
          .pop()}`,
      ),
    ),
  );
  const rankOf = new Map<string, number>(
    snap.ranks.map((r: { label: string; rank: number }) => [r.label, r.rank]),
  );
  const L = walkLines(snap.fields.chains, snap.fields.run);
  const mk = (z: { outer: number[] }) => {
    const a: PtMm[] = [];
    for (let i = 0; i + 1 < z.outer.length; i += 2) a.push({ x: z.outer[i], y: z.outer[i + 1] });
    return a;
  };
  const sizes = p.sizes.filter(
    (z: { size: string; outer: number[] }) => rankOf.has(z.size) && z.outer.length > 6,
  );
  const all = bboxOf(sizes.flatMap(mk));
  const box = {
    minX: all.minX - WALK.padMm,
    minY: all.minY - WALK.padMm,
    maxX: all.maxX + WALK.padMm,
    maxY: all.maxY + WALK.padMm,
  };
  const z = p.sizes.find((q: { size: string }) => q.size === size);
  const ref = mk(z);
  const rank = rankOf.get(size)!;
  const own = L.bySize.get(rank) ?? [];
  const b = bboxOf(ref);
  const w = walkOutline(own, sharedStretches(L, box), box, {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
  });
  const d = w ? differs(w.outer, ref) ?? differs(ref, w.outer) : null;
  const c = d?.at ?? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const ox = (n % cols) * P;
  const oy = 30 + Math.floor(n / cols) * (P + 26);
  const H = 10;
  const k = P / (2 * H);
  const X = (x: number) => ox + (x - c.x + H) * k;
  const Y = (y: number) => oy + 24 + (y - c.y + H) * k;
  g.save();
  g.beginPath();
  g.rect(ox + 2, oy + 24, P - 4, P - 2);
  g.clip();
  const line = (pts: PtMm[], col: string, wd: number, dash: number[] = []) => {
    g.strokeStyle = col;
    g.lineWidth = wd;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y))));
    g.stroke();
  };
  for (const pa of snap.fields.sheet.paths)
    if (
      pa.pts.length &&
      pa.pts.some((q: PtMm) => Math.abs(q.x - c.x) < H + 4 && Math.abs(q.y - c.y) < H + 4)
    )
      line(pa.pts.length > 1 ? pa.pts : [pa.pts[0], pa.pts[0]], '#7c7', 1.2);
  for (const o of own) line(o, '#000', 2);
  line([...ref, ref[0]], '#e11', 3, [10, 6]);
  if (w) line([...w.outer, w.outer[0]], '#12f', 3, [3, 5]);
  g.restore();
  g.setLineDash([]);
  g.strokeStyle = '#888';
  g.lineWidth = 1;
  g.strokeRect(ox + 2, oy + 24, P - 4, P - 2);
  g.fillStyle = '#000';
  const verdict = ru ? (z.verdict === 'ok' ? 'принят' : 'забракован') : z.verdict;
  g.fillText(
    ru
      ? `${pid} · размер ${size} · в эталоне: ${verdict} · ${d ? `расхождение ${d.maxMm.toFixed(1)} мм на ${Math.round(d.overMm)} мм` : w ? 'контуры совпадают' : 'обход не замкнулся'}`
      : `${pid} · size ${size} · reference: ${verdict} · ${d ? `${d.maxMm.toFixed(1)} mm apart over ${Math.round(d.overMm)} mm` : w ? 'the same' : 'no walk'}`,
    ox + 8,
    oy + 17,
  );
});
writeFileSync(out, cv.toBuffer('image/png'));
console.log(out);
