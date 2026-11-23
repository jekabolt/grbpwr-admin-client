// Original PDF paint and legend check for the integrated MDF476 E/F gains.
// node automatic-gap-source-fawn.mjs <original Fawn PDF> <integrated case directory>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { perimeterError } from './automatic-gap-source-curves.mjs';
const [pdf, dir] = process.argv.slice(2);
assert(
  dir,
  'Expected the original PDF and the case directory containing cells.json and session.v8.gz',
);
const bytes = readFileSync(pdf);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '876f0024db321b4035a26970c287c388fa4e88377b0a6846e843f527f494e4d2',
);
const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const { sheet } = deserialize(gunzipSync(readFileSync(join(dir, 'session.v8.gz'))));
const families = JSON.parse(readFileSync(join(dir, 'cells.json'), 'utf8'));
const byId = new Map(sheet.paths.map((p) => [p.id, p])),
  mm = 25.4 / 72;
async function drawing(page) {
  const pg = await doc.getPage(page),
    list = await pg.getOperatorList();
  const items = (await pg.getTextContent()).items.filter((i) => i.str);
  const strokes = new Map(),
    stack = [];
  let mat = [1, 0, 0, 1, 0, 0],
    dash = [];
  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i],
      args = list.argsArray[i];
    if (fn === OPS.save) stack.push([mat, dash]);
    if (fn === OPS.restore) [mat, dash] = stack.pop();
    if (fn === OPS.transform) mat = Util.transform(mat, args);
    if (fn === OPS.setDash) dash = args[0];
    if (fn === OPS.constructPath && list.fnArray[i + 1] === OPS.stroke) {
      const { 0: ops, 1: xy } = args;
      if (![...ops].every((op) => op === OPS.moveTo || op === OPS.lineTo)) continue;
      const pts = [...ops].map((_, k) => {
        const [x, y] = Util.applyTransform([xy[k * 2], xy[k * 2 + 1]], mat);
        return { x: x * mm, y: y * mm };
      });
      strokes.set(i + 1, { pts, dash });
    }
  }
  return { items, strokes };
}
const legend = await drawing(4);
const named = legend.items.filter((i) => /^SIZE (XS|S|M|L|XL|[2-5]XL)$/.test(i.str.trim()));
const pens = new Map();
for (const [size, op] of [
  ['L', 5027],
  ['2XL', 4964],
]) {
  const stroke = legend.strokes.get(op);
  assert(stroke);
  const y = stroke.pts[0].y;
  const nearest = [...named].sort(
    (a, b) =>
      Math.abs(y - (a.transform[5] + a.height / 2) * mm) -
      Math.abs(y - (b.transform[5] + b.height / 2) * mm),
  );
  assert.equal(nearest[0]?.str.trim(), 'SIZE ' + size);
  pens.set(size, stroke.dash);
}
const normalized = (ds) => ds.map((v) => v / Math.min(...ds.filter((x) => x > 0)));
const agrees = (a, b) =>
  a.length === b.length && normalized(a).every((n, i) => Math.abs(n - normalized(b)[i]) < 0.15);
assert(!agrees(pens.get('L'), pens.get('2XL')));
const rows = [];
for (const [seed, page, name, options] of [
  [
    4,
    26,
    'E - POCKET FLAP',
    [
      ['L', 4843, 42692],
      ['2XL', 7779, 43252],
    ],
  ],
  [
    6,
    22,
    'F - POCKET WELT',
    [
      ['L', 4915, 35468],
      ['2XL', 8024, 36063],
    ],
  ],
]) {
  const raw = await drawing(page);
  assert(raw.items.some((i) => i.str.trim() === name));
  assert(raw.items.some((i) => /\bCUT\s+[1-9]/i.test(i.str)));
  const family = families.find((f) => f.seed === seed && f.label === name);
  const traces = new Map();
  for (const [size, first, pathId] of options) {
    const ops = Array.from({ length: 12 }, (_, i) => first + i * 6);
    const paths = ops.map((op) => raw.strokes.get(op));
    assert(paths.every(Boolean));
    const actualPen = paths
      .map((stroke, i) => [stroke, i])
      .filter(([stroke]) => agrees(stroke.dash, pens.get(size)));
    assert.deepEqual(
      actualPen.map(([, i]) => i),
      [2, 5, 8, 11],
    );
    const source = byId.get(pathId),
      firstVertex = paths[0].pts[0];
    assert.deepEqual([source.src.page + 1, source.src.op], [page, first]);
    const dx = source.pts[0].x - firstVertex.x,
      dy = source.pts[0].y - firstVertex.y;
    const ring = paths.flatMap((stroke) => stroke.pts.map((p) => ({ x: p.x + dx, y: p.y + dy })));
    const ids = ops.map((op, i) => {
      const p = byId.get(pathId + i);
      assert.equal(p.src.op, op);
      return p.id;
    });
    traces.set(size, { ring, ids });
  }
  for (const c of family.cells.filter((c) => c.from === 'legend-polygon')) {
    const ref = traces.get(c.size),
      second = traces.get(c.polygonSource.confirmedBy);
    assert(ref && second && ref !== second);
    assert.equal(c.size, c.polygonSource.reference);
    assert.deepEqual(c.polygonSource.paths, ref.ids);
    assert.deepEqual(c.polygonSource.confirmationPaths, second.ids);
    const native = c.outer.map(([x, y]) => ({ x, y }));
    const sourceErrorMm = perimeterError(native, ref.ring),
      penAgreementMm = perimeterError(ref.ring, second.ring);
    assert(sourceErrorMm < 0.08 && penAgreementMm < 0.01);
    rows.push({ name, size: c.size, page, sourceErrorMm, penAgreementMm });
  }
}
assert.deepEqual(
  rows.map((r) => [r.name[0], r.size]),
  [
    ['E', '2XL'],
    ['F', 'L'],
    ['F', '2XL'],
  ],
);
console.log(JSON.stringify(rows, null, 2));
await doc.destroy();
