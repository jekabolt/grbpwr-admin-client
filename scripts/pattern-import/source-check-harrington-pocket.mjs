import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { build } from 'esbuild';
import DxfParser from 'dxf-parser';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';

const [pdf, before, after, trace, out] = process.argv.slice(2);
const session = (dir) => deserialize(gunzipSync(readFileSync(join(dir, 'session.v8.gz'))));
const old = session(before),
  cur = session(after);
const { outputFiles } = await build({
  stdin: {
    contents: [
      "export {classifyFeatures} from './src/lib/pattern-import/semantics/features'",
      "export {readRepeatedMotifWalk} from './src/lib/pattern-import/pieces/printed-motif-polygon'",
      "export {planBlocks} from './src/lib/pattern-import/write/plan'",
      "export {applyAffine} from './src/lib/pattern-import/write/geom'",
      "export {ringSelfIntersects} from './src/lib/fusing-dxf/spline'",
      "export {writeR12} from './src/lib/pattern-import/write/r12'",
    ].join('\n'),
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  write: false,
});
const {
  classifyFeatures,
  readRepeatedMotifWalk,
  planBlocks,
  applyAffine,
  writeR12,
  ringSelfIntersects,
} = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const heads = [7150, 7156, 7162, 7168];
const reader = await readPdfDrawing(
  readFileSync(pdf),
  cur.sheet,
  (p, id) => p === 8 && heads.includes(id),
);
const page = await reader.load(8);
const raw = page.strokes.get(7145);
const [shaft] = reader.rawPieces(raw);
assert.equal(shaft.length, 2);
for (const [op, paint] of [[7145, raw], ...heads.map((id) => [id, page.fills.get(id)])]) {
  assert(paint, 'missing paint ' + op);
  for (const p of reader.rawPieces(paint).flat())
    assert(reader.eligible(reader.toPage(p, 8), paint.clip));
}
const dist = reader.distance,
  middle = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const angle = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const sameAxis = (actual, expected) =>
  Math.min(
    ...[expected, [...expected].reverse()].map((e) =>
      Math.max(dist(actual[0], e[0]), dist(actual[1], e[1])),
    ),
  );
const changed = [],
  sizes = [];
let n = 0;
for (const f of old.families)
  for (const c of f.candidates) {
    const d = cur.families.find((x) => x.seed === f.seed).candidates.find((x) => x.rank === c.rank);
    assert.equal(c.outcome, 'closed');
    assert.equal(d.outcome, 'closed');
    n++;
    const size = cur.run.sizes[c.rank].label;
    if (!isDeepStrictEqual(c.outer, d.outer))
      changed.push({
        seed: f.seed,
        size,
        oldArea: c.areaMm2,
        newArea: d.areaMm2,
        oldVertices: c.outer.length,
        newVertices: d.outer.length,
      });
    if (f.seed !== 6) continue;
    const grain = (sheet) => classifyFeatures(d, cur.set, sheet).find((v) => v.kind === 'grain');
    const g = grain(cur.sheet);
    assert.equal(g.origin, 'detected');
    assert(g.evidence.includes('arrowheads'));
    assert(g.evidence.includes('word'));
    const err = sameAxis([g.a, g.b], shaft);
    assert(err < 1e-6);
    sizes.push({ size, shaftErrorMm: err });
    if (c.rank === 0) {
      const paths = cur.sheet.paths.map((p) =>
        p.src.page === 8 && p.src.op === 7150 ? { ...p, visibleMotif: false } : p,
      );
      assert.notEqual(grain({ ...cur.sheet, paths })?.origin, 'detected');
    }
  }
assert.equal(n, 70);
assert.deepEqual(
  changed.map((v) => [v.seed, String(v.size)]),
  [[6, '50']],
);
const c = old.families
  .find((f) => f.seed === 6)
  .candidates.find((c) => String(old.run.sizes[c.rank].label) === '50');
const reconstruct = (sheet) =>
  readRepeatedMotifWalk(sheet, old.set, old.run, c, old.seeds[6], old.seeds);
const loop = reconstruct(old.sheet);
assert.equal(loop.paths.size, 792);
const nativeE50 = cur.families.find((f) => f.seed === 6).candidates.find((d) => d.rank === c.rank);
assert.deepEqual(nativeE50.outer, loop.pts);
assert.equal(nativeE50.outer.length, 5);
assert.equal(ringSelfIntersects(nativeE50.outer), false);
let maxMarkError = 0;
const pages = {},
  operations = {};
const segmentDist = (p, a, b) => {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
for (const id of loop.paths) {
  const { page: pg, op } = old.sheet.paths[id].src;
  const stroke = (await reader.load(pg)).strokes.get(op);
  assert(stroke);
  const points = reader.rawPieces(stroke).flat();
  const bounds = (key) => [
    Math.min(...points.map((p) => p[key])),
    Math.max(...points.map((p) => p[key])),
  ];
  const [x, X] = bounds('x'),
    [y, Y] = bounds('y');
  const center = { x: (x + X) / 2, y: (y + Y) / 2 };
  assert(reader.eligible(reader.toPage(center, pg), stroke.clip));
  const error = Math.min(
    ...loop.pts.map((p, i) => segmentDist(center, p, loop.pts[(i + 1) % loop.pts.length])),
  );
  maxMarkError = Math.max(maxMarkError, error);
  pages[pg + 1] = (pages[pg + 1] ?? 0) + 1;
  (operations[pg + 1] ??= []).push(op);
}
assert(maxMarkError < 0.2);
const withoutBand = old.sheet.paths.map((p) =>
  loop.paths.has(p.id) && p.pts[0].x > 1000 && p.pts[0].x < 1040
    ? { ...p, visibleEdges: false, visibleMotif: false }
    : p,
);
assert.equal(reconstruct({ ...old.sheet, paths: withoutBand }), undefined);
const stages = JSON.parse(readFileSync(trace));
assert.equal(stages.stop.step, 'meaning');
assert(stages.pocket?.length);
const main = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: 'L1',
  label: 'main',
  isInterlining: false,
  sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
};
// Meaning stops before the Fabrics step. Assign the page-3 material solely in this diagnostic copy.
assert(stages.pocket.every((p) => p.fabrics.length === 0));
const { blocks } = planBlocks(
  stages.pocket.map((p) => ({ ...p, fabrics: [main.fabricPurpose] })),
  main,
);
assert.deepEqual(
  blocks.map((b) => b.name).sort(),
  sizes.flatMap(({ size }) => [`PCK_L_${size}`, `PCK_R_${size}`]).sort(),
);
const file = join(out, 'E-POCKETS-FABRIC-diagnostic.dxf');
writeFileSync(
  file,
  writeR12(blocks, {
    styleName: 'Harrington pocket check',
    createdAt: '2026-11-22T00:00:00Z',
    sampleSize: '34',
  }),
);
const decoded = new DxfParser().parseSync(readFileSync(file, 'utf8'));
const axes = [];
for (const b of blocks) {
  const lines = decoded.blocks[b.name].entities.filter(
    (e) => e.type === 'LINE' && String(e.layer) === '7',
  );
  assert.equal(lines.length, 1);
  const [a, z] = lines[0].vertices,
    [p, q] = shaft.map((v) => applyAffine(b.transform, v));
  const delta = Math.abs(angle(a, z) - angle(p, q)) % 180;
  axes.push({
    block: b.name,
    lengthMm: dist(a, z),
    midpointErrorMm: dist(middle(a, z), middle(p, q)),
    angleErrorDeg: Math.min(delta, 180 - delta),
  });
}
assert(
  axes.every(
    (a) =>
      a.midpointErrorMm < 0.001 && a.angleErrorDeg < 0.001 && Math.abs(a.lengthMm - 180) < 0.001,
  ),
);
const result = {
  cuts: n,
  changed,
  shaft,
  lengthMm: dist(...shaft),
  directionDegrees: (angle(...shaft) + 180) % 180,
  sizes,
  maxMarkError,
  pages,
  operations,
  axes,
};
writeFileSync(join(out, 'proof.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, operations: undefined, axes: axes.slice(0, 1) }));
await reader.doc.destroy();
