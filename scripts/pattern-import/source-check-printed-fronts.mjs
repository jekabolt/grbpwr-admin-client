// Check printed front-panel cuts against the original Biarritz or Silverstone paint operations.
// node scripts/pattern-import/source-check-printed-fronts.mjs <original.pdf> <session.v8.gz> <cells.json> [comparison-cells.json] [--fold-panel]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';

const [pdf, snapshot, cells, previous] = process.argv.slice(2).filter((s) => s !== '--fold-panel');
const bytes = readFileSync(pdf);
const digest = createHash('sha256').update(bytes).digest('hex');
const session = deserialize(gunzipSync(readFileSync(snapshot)));
const { outputFiles } = await build({
  entryPoints: ['src/lib/pattern-import/pieces/geom.ts'],
  bundle: true,
  write: false,
  format: 'esm',
});
const { SegGrid, segNearest, resample } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const raw = await readPdfDrawing(bytes, session.sheet);
const keyPage = await raw.load(3);
const frontSideOps = [
  [4, 1744],
  [4, 1754],
  [4, 1760],
  [4, 1770],
  [4, 1776],
  [4, 1782],
  [5, 2205],
  [11, 2893],
  [11, 2899],
  [10, 1909],
  [10, 1881],
  [10, 1887],
];
const cases = new Map([
  [
    '08907a9dc2e4ce3764e1e1c30fe617d5820a461b1d12024ef2099342764a6a5b',
    [
      ...(process.argv.includes('--fold-panel')
        ? [
            {
              name: 'D - TOP FRONT CENTER',
              size: '4XL',
              y: 1644.401,
              legendOp: 4449,
              refs: [
                [12, 6227],
                [5, 5219],
                [5, 5225],
                [5, 5231],
                [5, 5237],
                [6, 6938],
                [6, 6944],
                [7, 11086],
                [7, 11092],
                [13, 12566],
                [12, 6233],
                [12, 6217],
              ],
            },
          ]
        : []),
      { name: 'C - TOP FRONT SIDE', size: 'L', y: 1670.043, legendOp: 4475, refs: frontSideOps },
      {
        name: 'F - SKIRT FRONT',
        size: '4XL',
        y: 1644.401,
        legendOp: 4449,
        refs: [
          [19, 3902],
          [19, 3908],
          [20, 7251],
          [21, 6772],
          [21, 6778],
          [33, 9120],
          [31, 6960],
          [30, 8756],
        ],
      },
    ],
  ],
  [
    '40a5a6175d0ad9b732bd2505ebf6163bdc68971e3796f4eb773ea1c245d4344a',
    [
      {
        name: 'D - FRONT PANEL',
        size: '4XL',
        x: 24.021,
        y: 1199.027,
        legendOp: 8130,
        refs: [
          [16, 6588],
          [16, 6594],
          [16, 6600],
          [18, 2459],
          [18, 2465],
          [29, 1164],
          [27, 4036],
          [27, 4020],
        ],
      },
    ],
  ],
]);
const figures = cases.get(digest);
assert(figures, 'Unknown PDF');
for (const { name, size, x = 59.164, y, legendOp, refs } of figures) {
  const cellIn = (path) =>
    JSON.parse(readFileSync(path))
      .find((f) => f.label === name)
      .cells.find((c) => c.size === size);
  const cell = cellIn(cells);
  assert.equal(cell.outcome, 'closed');
  const actual = cell.outer.map(([x, y]) => ({ x, y }));
  const key = keyPage.strokes.get(legendOp);
  const label = keyPage.labels.find((t) => t.text === 'SIZE ' + size);
  assert(label && raw.distance(label.p, { x, y }) < 0.01);
  const profiles = key.dash.length === 2 ? [key.dash, []] : [key.dash, [], key.dash.slice(2)];
  const ops = [];
  function sameProfile(a, b) {
    return (
      a.length === b.length &&
      (!b.length || a.every((v, i) => Math.abs(v / a[0] - b[i] / b[0]) < 0.003))
    );
  }
  for (const [i, [page, op]] of refs.entries()) {
    const p = (await raw.load(page - 1)).strokes.get(op);
    assert(p?.clip && p.pen === key.pen);
    const profile = profiles[i % profiles.length];
    assert(sameProfile(p.dash, profile));
    const lines = raw.rawPieces(p);
    assert.equal(lines.length, 1);
    ops.push({ p, line: lines[0] });
  }
  const gapErrorMm = ops.map(({ p, line }, i) => {
    const next = ops[(i + 1) % ops.length],
      mm = 25.4 / 72;
    const nominal = p.dash.length ? (p.dash[1] * mm) / 2 : next.p.dash[1] * mm;
    return Math.abs(raw.distance(line.at(-1), next.line[0]) - nominal);
  });
  assert(Math.max(...gapErrorMm) < 0.025);
  const visible = ops.map(() => ({ grid: new SegGrid(4), lines: [] }));
  const full = ops.flatMap((r) => r.line);
  const bbox = {
    minX: Math.min(...full.map((p) => p.x)),
    maxX: Math.max(...full.map((p) => p.x)),
    minY: Math.min(...full.map((p) => p.y)),
    maxY: Math.max(...full.map((p) => p.y)),
  };
  for (const [page, pose] of raw.pose) {
    if (
      pose.toSheet.e > bbox.maxX + 2 ||
      pose.toSheet.e + pose.widthMm < bbox.minX - 2 ||
      pose.toSheet.f > bbox.maxY + 2 ||
      pose.toSheet.f + pose.heightMm < bbox.minY - 2
    )
      continue;
    for (const p of (await raw.load(page)).strokes.values()) {
      if (!p.clip || p.pen !== key.pen) continue;
      for (const [i, r] of ops.entries()) {
        if (
          p.dash.length !== r.p.dash.length ||
          p.dash.some((v, j) => Math.abs(v - r.p.dash[j]) > 0.015)
        )
          continue;
        for (const line of raw.rawPieces(p)) {
          if (
            !line.some(
              (q) =>
                q.x >= bbox.minX - 2 &&
                q.x <= bbox.maxX + 2 &&
                q.y >= bbox.minY - 2 &&
                q.y <= bbox.maxY + 2,
            )
          )
            continue;
          const target = visible[i];
          target.grid.addPolyline(target.lines.length, line);
          target.lines.push({ p, line });
        }
      }
    }
  }
  function nearest(grid, lines, q) {
    let best = Infinity;
    grid.near(q, 1, (n, j) => {
      const { p, line } = lines[n],
        m = segNearest(q, line[j], line[j + 1]);
      if (p && !raw.eligible(raw.toPage(m.q, p.page), p.clip)) return;
      best = Math.min(best, m.d);
    });
    if (!isFinite(best) && !lines[0]?.p) {
      for (const { line } of lines)
        for (let j = 1; j < line.length; j++)
          best = Math.min(best, segNearest(q, line[j - 1], line[j]).d);
    }
    return best;
  }
  const visibilityMax = Math.max(
    ...ops.map(({ line }, i) =>
      Math.max(
        ...resample(line, 0.15, false).map((q) => nearest(visible[i].grid, visible[i].lines, q)),
      ),
    ),
  );
  function directed(a, b) {
    const line = [...b, b[0]],
      grid = new SegGrid(4);
    grid.addPolyline(0, line);
    return Math.max(...resample(a, 0.15, true).map((q) => nearest(grid, [{ line }], q)));
  }
  const toPdf = directed(actual, full),
    fromPdf = directed(full, actual);
  console.log({
    name,
    size,
    visibilityMax,
    maxGapErrorMm: Math.max(...gapErrorMm),
    toPdf,
    fromPdf,
  });
  assert(visibilityMax < 0.12 && toPdf < 0.15 && fromPdf < 0.15);
  if (previous) {
    const old = cellIn(previous);
    if (old.outcome === 'closed') {
      const xy = old.outer.map(([x, y]) => ({ x, y }));
      console.log({ name, previousToPdf: directed(xy, full), pdfToPrevious: directed(full, xy) });
    }
  }
}
await raw.doc.destroy();
