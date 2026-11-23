// Compare Cher's witnessed and inherited flap sizes to original page 19 paint operations.
// node automatic-gap-source-cher.mjs <PDF> <cutrange-Cher/source.json> <before/run.json> <after/run.json>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { OPS, getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { perimeterError } from './automatic-gap-source-curves.mjs';

const [file, dump, beforeFile, afterFile] = process.argv.slice(2);
assert(afterFile, 'Expected PDF, saved source sheet, baseline run and native treatment run');
const bytes = readFileSync(file);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  'b7f7f5d840e51fe085a883881ff75d92d5a92fb74050675d12b7f2467d83907c',
);
const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const list = await (await doc.getPage(19)).getOperatorList();
await doc.destroy();
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sheet = read(dump),
  before = read(beforeFile),
  after = read(afterFile);
before.families = read(join(dirname(beforeFile), 'cells.json'));
after.families = read(join(dirname(afterFile), 'cells.json'));
const entry = new URL('../../src/lib/pattern-import/pieces/legend-polygons.ts', import.meta.url);
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(entry)],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readLegendPolygons } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const candidates = new Map(
  before.families.map((f) => [
    f.seed,
    f.cells.map((c, rank) => ({ ...c, rank, outer: (c.outer ?? []).map(([x, y]) => ({ x, y })) })),
  ]),
);
const cell = (run, rank) =>
  run.families.find((f) => f.seed === 14).cells.find((c) => c.size === rank);
// The control withholds an already-closed size from the resolver, but retains its source page.
candidates.get(14).find((c) => c.size === '4').outcome = 'leak';
const recovered = readLegendPolygons(sheet, before.card, candidates).flat();
assert.deepEqual(
  recovered.map((r) => [r.seed, r.label]),
  [
    [14, '4'],
    [14, '28'],
    [14, '30'],
    [14, '32'],
  ],
);
const paths = new Map(sheet.paths.map((p) => [p.id, p]));
const paints = new Map(),
  stack = [];
let matrix = [1, 0, 0, 1, 0, 0];
list.fnArray.forEach((fn, i) => {
  const args = list.argsArray[i];
  if (fn === OPS.save) stack.push(matrix);
  if (fn === OPS.restore) matrix = stack.pop();
  if (fn === OPS.transform) matrix = Util.transform(matrix, args);
  if (fn === OPS.constructPath) paints.set(i + 1, { matrix, ops: args[0], xy: args[1] });
});
const check = (label, first, last) => {
  const result = recovered.find((r) => r.label === label);
  const real = result.paths.map((id) => paths.get(id));
  const ops = Array.from({ length: (last - first) / 6 + 1 }, (_, i) => first + i * 6);
  assert.deepEqual(
    real.map((p) => p.src.op),
    ops,
  );
  const raw = ops.flatMap((op) => {
    assert.equal(list.fnArray[op], OPS.stroke);
    const { matrix, ops: opsInPath, xy } = paints.get(op);
    return [...opsInPath].map((fn, i) => {
      assert(fn === OPS.moveTo || fn === OPS.lineTo);
      const [x, y] = Util.applyTransform([xy[i * 2], xy[i * 2 + 1]], matrix);
      return { x: (x * 25.4) / 72, y: (y * 25.4) / 72 };
    });
  });
  // Register once at the first paint endpoint. Preserve the original scale, rotation and all other coordinates.
  const dx = real[0].pts[0].x - raw[0].x,
    dy = real[0].pts[0].y - raw[0].y;
  const points = raw.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const error = perimeterError(result.outer, points);
  assert(error < 0.01, 'PDF source error ' + label + ' ' + error);
  if (label !== '4') {
    const out = cell(after, label);
    assert.equal(out.from, 'legend-polygon');
    assert.deepEqual(out.polygonSource, result.polygonSource);
    assert(
      perimeterError(
        out.outer.map(([x, y]) => ({ x, y })),
        points,
      ) < 0.08,
    );
  }
  return { label, paintCount: ops.length, sourceErrorMm: error };
};
const controls = [check('4', 6297, 6363), check('28', 26078, 26120), check('32', 28767, 28833)];
const changed = [];
for (const family of before.families)
  for (const old of family.cells) {
    const next = after.families
      .find((f) => f.seed === family.seed)
      .cells.find((c) => c.size === old.size);
    if (old.outcome === 'closed') assert.deepEqual(next.outer, old.outer);
    if (next.outcome !== old.outcome)
      changed.push([family.seed, old.size, old.outcome, next.outcome]);
  }
assert.deepEqual(
  changed,
  ['28', '30', '32'].map((size) => [14, size, 'leak', 'closed']),
);
assert.deepEqual(cell(after, '30').outer, cell(after, '28').outer);
assert.equal(cell(after, '30').from, 'shared-polygon');
assert.deepEqual(
  cell(after, '30').polygonSource,
  recovered.find((r) => r.label === '30').polygonSource,
);
const reference = recovered.find((r) => r.label === '28').outer;
const pen30 = sheet.classes.find((g) => g.role === 'size' && g.sizeLabel === '30');
const supportedSides = [8203, 8204].map((id) => {
  assert(pen30.chains.includes(id));
  const points = sheet.chains.find((c) => c.id === id).pts;
  const sides = reference.map((a, i) => [a, reference[(i + 1) % reference.length]]);
  const distance = (p, [a, b]) => {
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  };
  const error = Math.max(...points.map((p) => Math.min(...sides.map((s) => distance(p, s)))));
  const middle = points[Math.floor(points.length / 2)];
  const distances = sides.map((s) => distance(middle, s));
  const side = distances.indexOf(Math.min(...distances));
  assert(Math.abs(sides[side][0].x - sides[side][1].x) < 0.01);
  assert(error < 0.075);
  return { chain: id, side, sourceErrorMm: error };
});
assert.notEqual(supportedSides[0].side, supportedSides[1].side);
console.log(
  JSON.stringify(
    { changed, controls, supportedSides, stop: after.stop, write: after.write },
    null,
    2,
  ),
);
