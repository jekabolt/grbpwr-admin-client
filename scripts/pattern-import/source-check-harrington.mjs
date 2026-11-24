// Compare the three recovered Harrington cuts to the independently decoded PDF fills.
// Write three contour samples with the normal R12 writer when the native wizard has no DXF.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import DxfParser from 'dxf-parser';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';
import { perimeterError } from './automatic-gap-source-curves.mjs';
const [original, before, after, output] = process.argv.slice(2);
assert(output, 'Expected original PDF, baseline and new session.v8.gz, output diagnostic DXF');
const bytes = readFileSync(original);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '83a30840de9184bfb0d734c61612c7ce42ae7882bf96fd8178d6994321193e1d',
);
const [base, now] = [before, after].map((f) => deserialize(gunzipSync(readFileSync(f))));
const ranges = JSON.parse(
  readFileSync(new URL('../../docs/pattern-import/harrington-36-ranges.json', import.meta.url)),
);
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {writeR12} from './src/lib/pattern-import/write/r12';export {SegGrid,segNearest} from './src/lib/pattern-import/pieces/geom';export {restoreTriangleStripContours} from './src/lib/pattern-import/pieces/triangle-strip-contour';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  write: false,
});
const { writeR12, SegGrid, segNearest, restoreTriangleStripContours } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const read = (sheet, excluded = new Set()) => {
  const fs = structuredClone(base.families);
  restoreTriangleStripContours(
    sheet,
    base.set,
    base.run,
    base.seeds,
    new Map(fs.map((f) => [f.seed, f.candidates])),
    excluded,
    () => {},
  );
  return fs;
};
const direct = read(base.sheet),
  byId = new Map(now.sheet.paths.map((p) => [p.id, p]));
const stats = [],
  changes = [],
  blocks = [];
for (const f of base.families)
  for (const c of f.candidates)
    if (c.outcome === 'closed') {
      assert.deepEqual(direct[f.seed].candidates[c.rank], c);
      const actual = now.families[f.seed].candidates[c.rank];
      if (actual.outcome !== 'closed' || JSON.stringify(actual.outer) !== JSON.stringify(c.outer))
        changes.push({
          seed: f.seed,
          size: base.run.sizes[c.rank].label,
          outcome: actual.outcome,
          delta: actual.outer.length ? perimeterError(actual.outer, c.outer) : null,
          source: actual.foldPanelPaths?.slice(0, 2).map((id) => byId.get(id).src),
          alternatives: actual.foldPanelAlternatives,
        });
    }
// The shared branch already closes G36 via the nest pass. The source-proved
// five-vertex version must agree with that older closed perimeter as well.
const previousWaist = base.families[4].candidates[1];
const waistChange = changes.find((c) => c.seed === 4 && c.size === '36');
if (previousWaist.outcome === 'closed') {
  assert(waistChange?.outcome === 'closed' && waistChange.delta < 0.001);
}
assert.deepEqual(
  changes.map((c) => [c.seed, c.size, c.outcome]),
  [
    [1, '38', 'refused'],
    [1, '42', 'refused'],
    [1, '48', 'closed'],
    [1, '52', 'closed'],
    ...(previousWaist.outcome === 'closed' ? [[4, '36', 'closed']] : []),
  ],
);
assert.deepEqual(read(base.sheet, new Set([0])), base.families);
const names = ['A_BACK', 'G_WAISTBAND', 'E_POCKETS'],
  ids = [1, 4, 6];
const { doc, load, rawPieces, toPage, eligible } = await readPdfDrawing(
  bytes,
  now.sheet,
  (page, op) =>
    (page === 3 && op >= 583 && op <= 688) ||
    Object.values(ranges)
      .flat()
      .some(([p, lo, hi]) => p === page + 1 && lo <= op && op <= hi),
);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const key = await load(3);
assert(key.labels.some((t) => t.text === 'SIZE 36'));
let legend = 0;
for (const [op, g] of key.fills)
  if (op >= 583 && op <= 688) {
    const path = rawPieces(g).flat();
    assert.equal(path.length, 4);
    legend++;
  }
assert.equal(legend, 22);
for (const [i, name] of names.entries()) {
  const c = now.families[ids[i]].candidates[1];
  assert.equal(c.outcome, 'closed');
  const expected = new Set(
    c.printedMotif.paths.map((id) => byId.get(id)).map((p) => p.src.page + ':' + p.src.op),
  );
  const ink = new SegGrid(3),
    lines = [],
    axisDeviations = [],
    folded = [];
  for (const [page, lo, hi, count] of ranges[name]) {
    const { fills } = await load(page - 1);
    let actual = 0;
    for (const [op, fill] of fills)
      if (op >= lo && op <= hi) {
        assert(
          expected.delete(page - 1 + ':' + op),
          name + ' unexpected filled operation ' + page + '/' + op,
        );
        actual++;
        const pts = rawPieces(fill).flat();
        assert(
          pts.every((p) => eligible(toPage(p, page - 1), fill.clip)),
          name + ' clipped glyph ' + page + '/' + op,
        );
        ink.addPolyline(lines.length, pts);
        lines.push(pts);
        if (pts.length !== 4) {
          folded.push([page, op]);
          continue;
        }
        const vertices = pts.slice(0, 3);
        const [a, b, d] = vertices
            .map((q, i) => [q, vertices[(i + 1) % 3], vertices[(i + 2) % 3]])
            .sort((p, q) => dist(q[0], q[1]) - dist(p[0], p[1]))[0],
          x = b.x - a.x,
          y = b.y - a.y,
          len = Math.hypot(x, y),
          nx = -y / len,
          ny = x / len,
          height = (d.x - a.x) * nx + (d.y - a.y) * ny;
        if (Math.abs(len - 1.495) > 0.09 || Math.abs(Math.abs(height) - 0.649) > 0.05) {
          folded.push([page, op]);
          continue;
        }
        const center = { x: (a.x + b.x + nx * height) / 2, y: (a.y + b.y + ny * height) / 2 };
        axisDeviations.push(
          Math.min(
            ...c.outer.map((p, i) => segNearest(center, p, c.outer[(i + 1) % c.outer.length]).d),
          ),
        );
      }
    assert.equal(actual, count);
  }
  assert.equal(expected.size, 0);
  let maxInk = 0,
    count = 0;
  for (let i = 0; i < c.outer.length; i++) {
    const a = c.outer[i],
      b = c.outer[(i + 1) % c.outer.length],
      n = Math.ceil(dist(a, b) / 0.25);
    for (let j = 0; j < n; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n };
      let d = Infinity;
      ink.near(p, 3, (id, k) => {
        d = Math.min(d, segNearest(p, lines[id][k], lines[id][k + 1]).d);
      });
      maxInk = Math.max(maxInk, d);
      count++;
    }
  }
  assert(
    axisDeviations.length > c.printedMotif.paths.length * 0.9 && Math.max(...axisDeviations) < 0.16,
  );
  assert(maxInk < 2.25);
  const [page, low, high] = [
    [19, 822, 1402],
    [31, 1516, 1561],
    [8, 1186, 1216],
  ][i];
  const sheet = {
    ...base.sheet,
    paths: base.sheet.paths.map((p) =>
      p.src.page === page - 1 && p.src.op >= low && p.src.op <= high
        ? { ...p, visibleMotif: false }
        : p,
    ),
  };
  const withoutSupport = read(sheet)[ids[i]].candidates[1];
  if (i === 1 && previousWaist.outcome === 'closed') assert.deepEqual(withoutSupport, previousWaist);
  else assert.equal(withoutSupport.outcome, 'leak');
  const cut = c.outer.map((p) => ({ x: p.x - c.bbox.minX, y: p.y - c.bbox.minY }));
  blocks.push({
    name: name + '_36',
    identity: name,
    displayName: base.seeds[ids[i]].text.text,
    quantity: 1,
    labelSize: '36',
    material: '',
    annotation: ['Diagnostic printed shape only'],
    cut,
    cutLoops: [],
    internal: [],
    drawn: [],
    foldLines: 0,
    drills: [],
    notches: [],
  });
  stats.push({
    name,
    marks: lines.length,
    samples: count,
    maxInk,
    triangles: axisDeviations.length,
    maxAxis: Math.max(...axisDeviations),
    folded,
  });
}
await doc.destroy();
writeFileSync(
  output,
  writeR12(blocks, {
    styleName: 'Harrington cut samples',
    createdAt: '2026-11-21T00:00:00Z',
    sampleSize: '36',
  }),
);
const dxf = new DxfParser().parseSync(readFileSync(output, 'utf8'));
for (const [i, block] of blocks.entries()) {
  const group = dxf.blocks[block.name].entities.filter(
    (e) => e.type === 'POLYLINE' && String(e.layer) === '1' && e.shape,
  );
  assert.equal(group.length, 1);
  stats[i].dxfMax = perimeterError(group[0].vertices, block.cut);
  assert(stats[i].dxfMax < 0.002);
}
console.log(JSON.stringify({ nativeChangesToPreviousClosed: changes, stats }, null, 2));
