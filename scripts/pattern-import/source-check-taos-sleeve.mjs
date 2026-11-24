// Compare the two recorded sleeve cuts with the original Taos PDF's printed size key.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { build } from 'esbuild';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';

const [original, oldSnapshot, newSnapshot, finalCells] = process.argv.slice(2);
assert(
  newSnapshot,
  'Expected the PDF and the two session.v8.gz files containing the disputed cuts',
);
const bytes = readFileSync(original);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '8763ae7fd21d953d3b9786ee1407d0987cb0e7891584b6a7764822b081623b21',
);
const [old, current] = [oldSnapshot, newSnapshot].map((p) =>
  deserialize(gunzipSync(readFileSync(p))),
);
const sizeTwoFills = new Set(
  current.set.chains[5008].ranges.map((r) => {
    const p = current.sheet.paths[r.path].src;
    return p.page + ':' + p.op;
  }),
);
const capOps = [9549, 9564, 9579, 9594, 9609, 9624];
const { doc, load, rawPieces, toPage, eligible } = await readPdfDrawing(
  bytes,
  current.sheet,
  (page, op) => (page === 20 && capOps.includes(op)) || sizeTwoFills.has(page + ':' + op),
);
const { outputFiles } = await build({
  entryPoints: [
    fileURLToPath(new URL('../../src/lib/pattern-import/pieces/geom.ts', import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: 'esm',
});
const { SegGrid, segNearest, resample } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const sheet = current.sheet;
const ref = (id) => current.set.chains[id].ranges.map((r) => sheet.paths[r.path].src);
const operators = new Map();
async function signature(id) {
  const counts = { strokes: 0, fills: 0, fourCurvesOnFive: 0, fourCurvesOnSeven: 0 };
  for (const src of ref(id)) {
    if (!operators.has(src.page))
      operators.set(src.page, await (await doc.getPage(src.page + 1)).getOperatorList());
    const ops = operators.get(src.page),
      code = ops.fnArray[src.op];
    assert.equal(ops.fnArray[src.op - 1], OPS.constructPath);
    const commands = ops.argsArray[src.op - 1][0];
    if (code === OPS.stroke) {
      counts.strokes++;
      continue;
    }
    assert.equal(code, OPS.fill);
    counts.fills++;
    if (commands.filter((k) => k === OPS.curveTo).length === 4) {
      if (commands.length === 5) counts.fourCurvesOnFive++;
      if (commands.length === 7) counts.fourCurvesOnSeven++;
    }
  }
  return counts;
}
const printed = await load(3);
const bySize = { 2: [4970, 5008], 20: [106, 1480], 26: [4743, 4601, 4724], 30: [4744, 4602, 4664] };
const pens = {};
for (const [label, ids] of Object.entries(bySize)) {
  const sample = ids[0],
    row = current.set.classes.find((c) => c.sizeLabel === label),
    key = row.evidence.find((e) => e.kind === 'legend-sample');
  assert.equal(key.chain, sample);
  const labelAt = printed.labels
    .filter((l) => /^SIZE \d+$/.test(l.text))
    .sort(
      (a, b) =>
        Math.hypot(a.p.x - key.textAt.x, a.p.y - key.textAt.y) -
        Math.hypot(b.p.x - key.textAt.x, b.p.y - key.textAt.y),
    )[0];
  assert.equal(labelAt.text, 'SIZE ' + label);
  for (const id of ids) {
    const s = await signature(id);
    pens[id] = s;
    if (label === '20') assert(s.strokes > 0 && s.fills === 0);
    if (label === '2')
      assert(s.strokes === 0 && s.fourCurvesOnFive > 0 && s.fourCurvesOnSeven === 0);
    if (label === '26')
      assert(s.strokes === 0 && s.fourCurvesOnSeven > 0 && s.fourCurvesOnFive === 0);
    if (label === '30') assert(s.strokes > 0 && s.fills > s.strokes && s.fourCurvesOnSeven === 0);
  }
}
// The 20 pen is a declared equal-dash/equal-space stroke. The source may copy a full
// path to a tile on which only part is printed. Check the rectangle on the actual page.
const sample20 = printed.strokes.get(6834),
  paper20 = [];
for (const page of [10, 11, 19, 20]) {
  for (const p of (await load(page)).strokes.values()) {
    if (
      !p.clip ||
      p.pen !== sample20.pen ||
      !p.dash.length ||
      p.dash.length % sample20.dash.length !== 0 ||
      !p.dash.every((d, i) => Math.abs(d - sample20.dash[i % sample20.dash.length]) < 0.25)
    )
      continue;
    for (const line of rawPieces(p)) paper20.push({ page, line, clip: p.clip });
  }
}
function index(lines) {
  const grid = new SegGrid(4);
  lines.forEach(({ line }, id) => grid.addPolyline(id, line));
  return (p, tolerance) => {
    let near = false;
    grid.near(p, tolerance, (id, i) => {
      if (near) return;
      const { page, line, clip } = lines[id];
      if (clip && !eligible(toPage(p, page), clip)) return;
      near = segNearest(p, line[i], line[i + 1]).d <= tolerance;
    });
    return near;
  };
}
const natural = (pts, closed) => (closed ? [...pts, pts[0]] : pts);
const paper30 = [];
for (const id of [4602, 4664, 4673]) {
  for (const src of ref(id)) {
    const p = (await load(src.page)).strokes.get(src.op);
    if (p?.clip)
      for (const line of rawPieces(p)) paper30.push({ page: src.page, line, clip: p.clip });
  }
}
const near20 = index(paper20),
  near30 = index(paper30);
const rings = [];
for (const size of ['2', '26']) {
  const rank = current.run.sizes.findIndex((s) => s.label === size);
  const pair = [old, current].map((s) => s.families[4].candidates[rank]);
  pair.forEach((c) => assert.equal(c.rankFrom, 'innerPlug'));
  for (const [i, c] of pair.entries()) {
    const session = [old, current][i],
      other = pair[1 - i];
    const otherRing = index([{ line: natural(other.outer, true) }]);
    const separated = resample(c.outer, 0.5, true).filter((p) => !otherRing(p, 0.5));
    const assigned = session.set.classes
      .filter((r) => r.role === 'common' || (r.role === 'size' && r.sizeLabel === size))
      .flatMap((r) => r.chains);
    const nearOwn = index(
      assigned.map((id) => {
        const ch = session.set.chains[id];
        return { line: natural(ch.pts, ch.closed) };
      }),
    );
    const otherId = i === 0 ? 1480 : size === '2' ? 4602 : 4664;
    const ch = session.set.chains[otherId],
      foreign = index([{ line: natural(ch.pts, ch.closed) }]);
    const row = {
      size,
      version: i === 0 ? 'before' : 'after',
      divergent: separated.length,
      own: separated.filter((p) => nearOwn(p, 0.3)).length,
      foreign: separated.filter((p) => foreign(p, 0.3)).length,
      onVisible30IndividualDashes: separated.filter((p) => near30(p, 0.3)).length,
      onVisiblePaper20: separated.filter((p) => near20(p, 0.3)).length,
    };
    assert(row.divergent > 0 && row.own < row.divergent / 8);
    if (i === 0) assert(row.onVisiblePaper20 > row.divergent / 2);
    else assert(row.onVisible30IndividualDashes > row.divergent / 2);
    rings.push(row);
  }
}
// The paper still has the 26 pen on the short lower arc. Its repeated rounded dashes are
// centrally symmetric capsules. Inspect their centers even when the chain reader lost the pen.
const capsuleCenters = [];
const tile = await load(20);
for (const op of capOps) {
  const fill = tile.fills.get(op);
  assert(fill?.clip);
  assert.equal(fill.cmd.length, 7);
  const curves = fill.cmd.filter((k) => k === OPS.curveTo).length;
  assert(curves === 4 || curves === 6);
  const pts = rawPieces(fill).flat();
  assert(pts.every((p) => eligible(toPage(p, 20), fill.clip)));
  const mid = (k) => (Math.min(...pts.map((p) => p[k])) + Math.max(...pts.map((p) => p[k]))) / 2;
  capsuleCenters.push({ op, p: { x: mid('x'), y: mid('y') } });
}
const compared = [old, current].map((s) => s.families[4].candidates[14].outer);
const writtenCells = finalCells && JSON.parse(readFileSync(finalCells, 'utf8'))[4].cells;
const final = writtenCells?.find((c) => c.size === '26');
if (final?.outcome === 'closed') compared.push(final.outer.map(([x, y]) => ({ x, y })));
for (const row of capsuleCenters)
  row.distanceMm = compared.map((ring) =>
    Math.min(...ring.map((p, i) => segNearest(row.p, p, ring[(i + 1) % ring.length]).d)),
  );
assert(capsuleCenters[1].distanceMm[0] > 0.5 && capsuleCenters[1].distanceMm[1] > 0.5);
let visibleSizeTwo;
const cut2 = writtenCells?.find((c) => c.size === '2');
if (cut2?.outcome === 'closed') {
  const pts = cut2.outer.map(([x, y]) => ({ x, y }));
  const nativePair = [old, current].map((s) =>
    index([{ line: natural(s.families[4].candidates[2].outer, true) }]),
  );
  const metric = [];
  for (const src of ref(5008)) {
    const fill = (await load(src.page)).fills.get(src.op);
    if (!fill?.clip) continue;
    const mark = rawPieces(fill).flat();
    if (!mark.every((p) => eligible(toPage(p, src.page), fill.clip))) continue;
    const center = (k) =>
      (Math.min(...mark.map((p) => p[k])) + Math.max(...mark.map((p) => p[k]))) / 2;
    const p = { x: center('x'), y: center('y') };
    // Limit the witnesses to the disputed upper arc where the old and new rings both
    // leave the source pen. Includes the original curves before native simplification.
    if (p.y < 1599 || p.y > 1743 || p.x > 1572 || nativePair.some((near) => near(p, 0.5))) continue;
    metric.push({
      op: src.op,
      page: src.page,
      p,
      round: fill.cmd.length === 5 && fill.cmd.filter((x) => x === OPS.curveTo).length === 4,
      d: Math.min(...pts.map((q, i) => segNearest(p, q, pts[(i + 1) % pts.length]).d)),
    });
  }
  assert(metric.length > 75);
  visibleSizeTwo = {
    rawMarks: metric.length,
    within03: metric.filter((v) => v.d <= 0.3).length,
    round: metric.filter((v) => v.round).length,
    roundMaxMm: Math.max(...metric.filter((v) => v.round).map((v) => v.d)),
    worst: metric.reduce((a, b) => (a.d > b.d ? a : b)),
    maxMm: Math.max(...metric.map((v) => v.d)),
  };
  assert(
    visibleSizeTwo.round >= 40 && visibleSizeTwo.roundMaxMm < 0.1,
    'Final size 2 leaves its printed dots',
  );
}
if (final?.outcome === 'closed')
  assert(
    capsuleCenters.every((c) => c.distanceMm[2] <= 0.3),
    'Final size 26 leaves its own printed dashes',
  );
console.log(
  JSON.stringify(
    {
      originalPenOperators: pens,
      cuts: rings,
      capsuleCenters,
      visibleSizeTwo,
      finalSize26: final?.outcome,
    },
    null,
    2,
  ),
);
await doc.destroy();
