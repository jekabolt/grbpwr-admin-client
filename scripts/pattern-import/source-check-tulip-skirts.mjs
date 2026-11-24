// Check the Tulip skirt cuts against visible original paint, their labelled pens and the written DXF.
// Arguments: original PDF, native session directory, directory containing final cells.json and dxf/main.dxf.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import DxfParser from 'dxf-parser';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';

const [original, capture, output] = process.argv.slice(2);
assert(output, 'Expected PDF, capture directory and final output directory');
const bytes = readFileSync(original);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  'e7fe0e1bb030062cdb50ca56d6c833621289ed1cc4c048be972da7d2389177a6',
);
const s = deserialize(gunzipSync(readFileSync(join(capture, 'session.v8.gz'))));
const families = JSON.parse(readFileSync(join(output, 'cells.json'), 'utf8'));
const dxfText = readFileSync(join(output, 'dxf/main.dxf'), 'utf8');
const dxf = new DxfParser().parseSync(dxfText);
const { doc, rawPieces, pose, load, toPage, eligible, distance } = await readPdfDrawing(
  bytes,
  s.sheet,
);
const { outputFiles } = await build({
  entryPoints: [
    fileURLToPath(new URL('../../src/lib/pattern-import/pieces/geom.ts', import.meta.url)),
  ],
  write: false,
  bundle: true,
  platform: 'node',
  format: 'esm',
});
const { SegGrid, segNearest, bboxOf, resample, signedArea } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
function directed(a, b) {
  const grid = new SegGrid(4);
  grid.addPolyline(0, b, true);
  let max = 0;
  for (const p of [...a, ...resample(a, 0.1, true)]) {
    let min = Infinity;
    grid.near(p, 1, (_, i) => {
      min = Math.min(min, segNearest(p, b[i], b[(i + 1) % b.length]).d);
    });
    max = Math.max(min, max);
  }
  return max;
}
function local(line) {
  const b = bboxOf(line);
  return line.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
}
function unfolded(line) {
  // The back skirt has one long, straight centre-back fold at the lower edge of the sheet coordinates.
  const ring = line.slice(0, -1),
    y = bboxOf(ring).minY;
  const i = ring.findIndex(
    (p, k) =>
      Math.abs(p.y - y) < 0.00001 &&
      Math.abs(ring[(k + 1) % ring.length].y - y) < 0.00001 &&
      distance(p, ring[(k + 1) % ring.length]) > 500,
  );
  assert(i >= 0);
  const half = ring.slice(i + 1).concat(ring.slice(0, i + 1));
  return half.concat(
    half
      .slice(1, -1)
      .reverse()
      .map((p) => ({ x: p.x, y: 2 * y - p.y })),
  );
}
const figures = [
  { seed: 1, size: '2', page: 14, op: 801, block: 'SK_F_2' },
  { seed: 0, size: '8', page: 47, op: 665, block: 'SK_B_8' },
  { seed: 0, size: '30', page: 42, op: 713, block: 'SK_B_30' },
  { seed: 0, size: '32', page: 42, op: 707, block: 'SK_B_32' },
];
const pens = new Map(),
  profile = (ds) => ds.map((x) => x / ds.reduce((a, b) => a + b, 0));
const penEqual = (a, b) =>
  a.length === b.length && profile(a).every((v, i) => Math.abs(v - profile(b)[i]) < 0.001);
for (const [size, page, op] of [
  ['2', 5, 781],
  ['6', 4, 1162],
  ['8', 4, 1125],
  ['10', 4, 1088],
  ['24', 4, 832],
  ['30', 4, 727],
  ['32', 4, 690],
]) {
  const data = await load(page),
    p = data.strokes.get(op),
    at = rawPieces(p)[0][0];
  const labels = data.labels
    .filter((l) => /^SIZE (\d+)$/.test(l.text))
    .sort((a, b) => distance(a.p, at) - distance(b.p, at));
  assert.equal(labels[0].text, 'SIZE ' + size);
  pens.set(size, p);
}
assert(penEqual(pens.get('8').dash, pens.get('24').dash));
for (const f of figures) {
  f.source = (await load(f.page)).strokes.get(f.op);
  assert(f.source?.closed);
  f.ring = rawPieces(f.source).flat();
  const key = pens.get(f.size);
  assert.equal(key.pen, f.source.pen);
  assert(penEqual(key.dash, f.source.dash));
}
const small = (await load(47)).strokes.get(672),
  large = (await load(47)).strokes.get(707),
  other = (await load(42)).strokes.get(735);
assert(
  penEqual(small.dash, pens.get('6').dash) &&
    penEqual(large.dash, pens.get('10').dash) &&
    penEqual(other.dash, pens.get('24').dash),
);
const area = (p) => Math.abs(signedArea(rawPieces(p).flat()));
assert(
  area(small) < area(figures[1].source) &&
    area(figures[1].source) < area(large) &&
    area(large) < area(other),
);
const grid = new SegGrid(4),
  strokes = [];
const keys = new Set(figures.map((f) => f.source.pen + String(f.source.dash)));
for (const [page] of pose) {
  const data = await load(page);
  for (const q of data.strokes.values()) {
    if (!q.clip || !keys.has(q.pen + String(q.dash))) continue;
    for (const line of rawPieces(q)) {
      const id = strokes.length;
      strokes.push({ q, line });
      grid.addPolyline(id, line);
    }
  }
}
const checked = [];
for (const f of figures) {
  const tiles = new Set();
  let missing = 0;
  for (const p of resample(f.ring, 0.5, true)) {
    let seen = false;
    grid.near(p, 0.1, (id, i) => {
      const { q, line } = strokes[id];
      if (
        q.pen === f.source.pen &&
        String(q.dash) === String(f.source.dash) &&
        eligible(toPage(p, q.page), q.clip) &&
        segNearest(p, line[i], line[i + 1]).d <= 0.1
      ) {
        seen = true;
        tiles.add(q.page + 1);
      }
    });
    if (!seen) missing++;
  }
  assert.equal(missing, 0, f.block + ' needs visible source ink');
  const candidate = families
    .find((g) => g.seed === f.seed)
    .cells.find((c) => c.size === f.size)
    .outer.map(([x, y]) => ({ x, y }));
  const cut = dxf.blocks[f.block].entities.find((e) => e.layer === '1' && e.type === 'POLYLINE');
  assert(cut.shape);
  const source = local(f.seed === 0 ? unfolded(f.ring) : f.ring),
    dxfCut = local(cut.vertices);
  const errors = {
    pdfToCell: directed(f.ring, candidate),
    cellToPdf: directed(candidate, f.ring),
    pdfToDxf: directed(source, dxfCut),
    dxfToPdf: directed(dxfCut, source),
  };
  assert(Math.max(...Object.values(errors)) < 0.2, f.block + ' ' + JSON.stringify(errors));
  checked.push({ block: f.block, page: f.page + 1, op: f.op, visibleTiles: tiles.size, ...errors });
}
for (const page of [8, 13]) {
  const q = await load(page);
  const mark = q.strokes.get(521),
    size = q.strokes.get(645);
  assert(!mark.dash.length && mark.pen !== size.pen && penEqual(size.dash, pens.get('2').dash));
  const markEdge = rawPieces(mark)[0],
    x = markEdge[1].x;
  const raw = rawPieces(size).flat(),
    target = bboxOf(markEdge);
  const edge = raw.find(
    (p, i) =>
      i < raw.length - 1 &&
      Math.abs(p.x - raw[i + 1].x) < 0.001 &&
      Math.abs(p.x - x) < 0.3 &&
      Math.min(p.y, raw[i + 1].y) < target.minY &&
      Math.max(p.y, raw[i + 1].y) > target.maxY,
  );
  assert(edge);
  checked.push({ page: page + 1, printedMarkToCutMm: Math.abs(edge.x - x) });
}
console.log(JSON.stringify(checked, null, 2));
await doc.destroy();
