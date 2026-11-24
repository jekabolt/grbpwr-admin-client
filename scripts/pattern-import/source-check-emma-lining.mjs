// Audit the size-26 lining trial against its original motif marks, including PDF clipping.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { sourceFills, draw } from './emma-pdf-marks.mjs';

const [pdf, snapshot] = process.argv.slice(2);
assert(snapshot, 'Expected the original Emma PDF and its session.v8.gz');
const bytes = readFileSync(pdf);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '323c00ad49b79a4fa395eefe7acfddbd1a143f543d769e011e74eea98f773edf',
);
const session = deserialize(gunzipSync(readFileSync(snapshot)));
const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const page = await doc.getPage(12);
const operators = await page.getOperatorList();
const selected = new Set([9035, 9700, 9710, 9715, 9720, 9730, 9735, 9740]);

// Draw each individual fill with the source Béziers. The crop includes the whole mark before
// any source clipping. Erasing paint by a clip does not count as an unprinted dash interval.
function ink(path, clips) {
  const width = 600,
    scale = 48,
    ctx = createCanvas(width, width).getContext('2d');
  const center = Util.applyTransform([0, 0], path.matrix);
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    width / 2 - scale * center[0],
    width / 2 - scale * center[1],
  );
  for (const clip of clips) {
    draw(ctx, clip);
    ctx.clip(clip.rule);
  }
  draw(ctx, path);
  ctx.fill();
  const rgba = ctx.getImageData(0, 0, width, width).data;
  let total = 0;
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (x === 0 || x === width - 1 || y === 0 || y === width - 1)
        assert.equal(alpha, 0, 'Mark reaches audit crop');
      total += alpha;
    }
  return total;
}
const fills = sourceFills(operators, selected);
const ratios = Object.fromEntries(
  [...fills].map(([i, { path, clips }]) => [i, ink(path, clips) / ink(path, [])]),
);
assert.equal(fills.size, selected.size);
assert.equal(ratios[9720], 0);
assert.equal(ratios[9735], 0);
for (const op of [9710, 9730]) assert(ratios[op] > 0.47 && ratios[op] < 0.48);
for (const op of [9035, 9700, 9715, 9740]) assert(ratios[op] > 0.99);

const chain = session.set.chains[3639],
  ignored = session.set.chains[1627],
  family = session.families[7];
const cls = (id) => session.set.classes.filter((row) => row.chains.includes(id));
assert(
  cls(chain.id).some(
    (row) =>
      row.sizeLabel === '26' &&
      row.evidence.some((e) => e.kind === 'legend-sample' && e.label === '26'),
  ),
);
assert.deepEqual(
  cls(ignored.id).map((c) => c.role),
  ['ignore'],
);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const points = chain.pts;
const gap = distance(points[0], points.at(-1));
assert(Math.abs(gap - 3.667) < 0.001);
const glyphs = chain.ranges.map((r) => session.sheet.paths[r.path]);
function sourceOfCenter(vertex) {
  return glyphs.find(
    (g) =>
      distance(
        g.pts.reduce(
          (acc, p) => ({ x: acc.x + p.x / g.pts.length, y: acc.y + p.y / g.pts.length }),
          { x: 0, y: 0 },
        ),
        vertex,
      ) < 0.00001,
  )?.src;
}
const gapSources = [sourceOfCenter(points[0]), sourceOfCenter(points.at(-1))];
for (const src of gapSources) {
  const ops = await (await doc.getPage(src.page + 1)).getOperatorList();
  assert.equal(ops.fnArray[src.op], OPS.fill);
}
const ignoredSource = session.sheet.paths[ignored.ranges[0].path].src;
const ignoredPage = await doc.getPage(ignoredSource.page + 1);
assert.equal((await ignoredPage.getOperatorList()).fnArray[ignoredSource.op], OPS.stroke);
function crossings(pts) {
  const result = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 2; j < pts.length; j++) {
      if (!i && j === pts.length - 1) continue;
      const a = pts[i],
        b = pts[(i + 1) % pts.length],
        c = pts[j],
        d = pts[(j + 1) % pts.length];
      const rx = b.x - a.x,
        ry = b.y - a.y,
        sx = d.x - c.x,
        sy = d.y - c.y,
        det = rx * sy - ry * sx;
      if (Math.abs(det) < 1e-12) continue;
      const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / det,
        u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / det;
      if (t > 0 && t < 1 && u > 0 && u < 1) result.push({ x: a.x + t * rx, y: a.y + t * ry });
    }
  return result;
}
const erased = points.filter((p) => {
  const src = sourceOfCenter(p);
  return src?.page === 11 && ratios[src.op] === 0;
});
const rawCrossings = crossings(points),
  afterRemoval = crossings(points.filter((p) => !erased.includes(p)));
assert.equal(erased.length, 2);
assert.equal(rawCrossings.length, 4);
assert(afterRemoval.length > 0);
const area = Math.abs(
  points.reduce((a, p, i) => {
    const b = points[(i + 1) % points.length];
    return a + p.x * b.y - b.x * p.y;
  }, 0) / 2,
);
const neighbors = ['24', '28'].map((label) =>
  family.candidates.find((c) => session.run.sizes[c.rank].label === label),
);
assert(neighbors.every((c) => c.outcome === 'closed'));
assert(neighbors[0].areaMm2 < area && neighbors[1].areaMm2 > area);
console.log(
  JSON.stringify(
    {
      gapMm: gap,
      gapSources,
      sourceMarks: glyphs.length,
      ignoredSource,
      originalAreaMm2: area,
      neighborAreasMm2: neighbors.map((c) => c.areaMm2),
      rawCrossings,
      afterRemoval,
      visibleAreaRatios: ratios,
    },
    null,
    2,
  ),
);
await doc.destroy();
