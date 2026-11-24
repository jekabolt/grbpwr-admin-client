// Compare the 18 unfolded J cut lines in a written DXF with mirrored original PDF page 37 strokes.
// node scripts/pattern-import/savannah-fold-check.mjs original.pdf main.dxf
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { OPS, getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { perimeterError } from './automatic-gap-source-curves.mjs';

const [original, written] = process.argv.slice(2);
assert(written, 'Expected the original Savannah PDF and written DXF');
const bytes = readFileSync(original);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '5990cd5fc6d1b19bdc7302268e84268652552a4c1beab1a1dc29384405ce3bab',
);
const sizes = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String(2 * i + 2))];
const strokes = [
  691, 683, 677, 699, 670, 663, 657, 651, 643, 635, 629, 623, 617, 611, 604, 597, 589, 583,
];
const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const list = await (await pdf.getPage(37)).getOperatorList();
const marks = await (await pdf.getPage(42)).getOperatorList();
await pdf.destroy();
const shafts = [
  2146, 2133, 2122, 2159, 2110, 2098, 2087, 2076, 2063, 2050, 2039, 2028, 2017, 2006, 1994, 1982,
  1971, 1958,
];
function* paints(page, wanted) {
  const stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < page.fnArray.length; i++) {
    const fn = page.fnArray[i],
      args = page.argsArray[i];
    if (fn === OPS.save) stack.push(matrix);
    if (fn === OPS.restore) matrix = stack.pop();
    if (fn === OPS.transform) matrix = Util.transform(matrix, args);
    if (fn !== OPS.constructPath || !wanted.includes(i + 1)) continue;
    assert.equal(page.fnArray[i + 1], OPS.stroke);
    const [ops, xy] = args;
    let offset = 0;
    const take = () => {
      const [x, y] = Util.applyTransform([xy[offset++], xy[offset++]], matrix);
      return { x: (x * 25.4) / 72, y: (y * 25.4) / 72 };
    };
    yield { op: i + 1, ops, take };
  }
}
const printedNotches = new Map();
for (const { op, ops, take } of paints(marks, shafts)) {
  assert.deepEqual(Array.from(ops), [OPS.moveTo, OPS.lineTo]);
  const base = take(),
    tip = take(),
    length = Math.hypot(tip.x - base.x, tip.y - base.y);
  assert(length > 4.3 && length < 4.7);
  // The next tile row is one 756 pt pitch lower than page 37.
  printedNotches.set(sizes[shafts.indexOf(op)], { x: base.x, y: base.y - (756 * 25.4) / 72 });
}
const unposed = (points, cut = points) => {
  const x = Math.min(...cut.map((p) => p.x)),
    y = Math.min(...cut.map((p) => p.y));
  return points.map((p) => ({ x: p.x - x, y: p.y - y }));
};
const sources = new Map();
for (const { op, ops, take } of paints(list, strokes)) {
  assert.equal(ops.at(-1), OPS.closePath);
  const points = [];
  for (const s of ops) {
    if (s === OPS.moveTo) {
      assert.equal(points.length, 0);
      points.push(take());
    } else if (s === OPS.lineTo) points.push(take());
    else if (s === OPS.curveTo) {
      const p = points.at(-1),
        a = take(),
        b = take(),
        c = take();
      const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
      const n = Math.ceil((dist(p, a) + dist(a, b) + dist(b, c)) / 0.5);
      for (let k = 1; k <= n; k++) {
        const t = k / n,
          u = 1 - t;
        points.push({
          x: u ** 3 * p.x + 3 * u * u * t * a.x + 3 * u * t * t * b.x + t ** 3 * c.x,
          y: u ** 3 * p.y + 3 * u * u * t * a.y + 3 * u * t * t * b.y + t ** 3 * c.y,
        });
      }
    } else assert.equal(s, OPS.closePath);
  }
  if (Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 1e-8) points.pop();
  const bottom = Math.min(...points.map((p) => p.y));
  const base = points.filter((p) => Math.abs(p.y - bottom) < 1e-6);
  assert.equal(base.length, 2);
  assert(Math.abs(Math.abs(base[1].x - base[0].x) - 53.9962) < 0.005);
  // Walk the outside of the printed half, then return along its reflection, omitting the fold seam.
  let a = points.indexOf(base[0]),
    b = points.indexOf(base[1]);
  if ((a + 1) % points.length !== b) [a, b] = [b, a];
  assert.equal((a + 1) % points.length, b);
  const arc = [...points.slice(b), ...points.slice(0, b)];
  const ring = [
    ...arc,
    ...arc
      .slice(1, -1)
      .reverse()
      .map((p) => ({ x: p.x, y: 2 * bottom - p.y })),
  ];
  const size = sizes[strokes.indexOf(op)];
  const printed = printedNotches.get(size);
  const corner = base.reduce((p, q) => (p.x < q.x ? p : q));
  assert(Math.hypot(printed.x - corner.x, printed.y - corner.y) < 0.001);
  sources.set(size, {
    ring: unposed(ring),
    fold: unposed(base, ring),
    notch: unposed([printed], ring)[0],
  });
}
assert.equal(sources.size, 18);
const { outputFiles } = await build({
  stdin: {
    contents:
      "export { readRawDxf } from './src/lib/pattern-import/gate/reader';export { readManifest } from './src/lib/pattern-import/manifest';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { readRawDxf, readManifest } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const text = readFileSync(written, 'utf8'),
  raw = readRawDxf(text),
  manifest = readManifest(text);
assert(manifest, 'A written garment DXF with a conversion manifest is required');
const matches = manifest.pieces.filter((p) => /back hem facing/i.test(p.displayName));
assert.equal(matches.length, 1, 'Expected a single back hem facing');
assert.equal(matches[0].unfoldedFold, true);
const blocks = manifest.blocks.filter((b) => b.identity === matches[0].identity);
assert.equal(blocks.length, 18);
assert.deepEqual(new Set(blocks.map((b) => b.sizeToken)), new Set(sizes));
const results = blocks.map((b) => {
  const cuts = raw.blocks
    .get(b.block)
    .filter((e) => (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.layer === '1');
  assert.equal(cuts.length, 1);
  assert(cuts[0].closed);
  const source = sources.get(b.sizeToken);
  const mm = perimeterError(source.ring, unposed(cuts[0].pts));
  const marked = raw.blocks
    .get(b.block)
    .filter((e) => e.layer === '8' && !e.closed && e.pts.length >= 2);
  const foldErrors = marked.map((e) => perimeterError(source.fold, unposed(e.pts, cuts[0].pts)));
  const foldMm = Math.min(...foldErrors);
  assert(foldMm < 0.2, 'Missing printed fold in ' + b.block + ': ' + foldMm);
  assert(mm < 0.2, 'Unfolded cut differs from PDF in ' + b.block + ': ' + mm);
  const notch = raw.blocks
    .get(b.block)
    .filter((e) => e.layer === '4' && (e.type === 'POINT' || e.type === 'LINE'));
  assert.equal(notch.length, 1, 'The printed fold has one corner notch per size: ' + b.block);
  const [point] = unposed(notch[0].pts, cuts[0].pts);
  const corner = source.notch;
  const notchMm = Math.hypot(point.x - corner.x, point.y - corner.y);
  assert(notchMm < 0.2, 'Notch displaced from the printed corner: ' + b.block);
  return { block: b.block, size: b.sizeToken, maxMm: mm, foldMm, notchMm };
});
console.log(
  JSON.stringify({ blocks: results, maxMm: Math.max(...results.map((r) => r.maxMm)) }, null, 2),
);
