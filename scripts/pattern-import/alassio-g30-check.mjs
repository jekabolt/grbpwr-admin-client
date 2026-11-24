// Audit the two layer-1 polylines directly against the numbered paint operations.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import Parser from 'dxf-parser';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

const docs = new URL('../../docs/pattern-import/', import.meta.url);
const ledger = JSON.parse(fs.readFileSync(new URL('alassio-g30-operations.json', docs)));
const bytes = fs.readFileSync(process.argv[2]);
assert.equal(createHash('sha256').update(bytes).digest('hex'), ledger.pdfSha256);
const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const mm = 25.4 / 72;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => a.map((v, i) => v - b[i]);
async function pagePaths(page, origin) {
  const { fnArray, argsArray } = await (await pdf.getPage(page)).getOperatorList();
  const ops = new Map(),
    stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  fnArray.forEach((fn, i) => {
    const args = argsArray[i];
    if (fn === OPS.save) stack.push(matrix);
    if (fn === OPS.restore) matrix = stack.pop();
    if (fn === OPS.transform) matrix = Util.transform(matrix, args);
    if (fn !== OPS.constructPath) return;
    const [commands, xy] = args,
      points = [];
    for (let j = 0; j < xy.length; j += 2) {
      const q = Util.applyTransform([xy[j], xy[j + 1]], matrix);
      points.push(q.map((v, k) => v * mm + origin[k]));
    }
    ops.set(i, { commands: Array.from(commands), points, next: fnArray[i + 1] });
  });
  return ops;
}
function section(ring, mask) {
  const hits = [];
  for (let i = 0; i < ring.length; i++)
    for (let j = 0; j < mask.length; j++) {
      const a = ring[i],
        b = mask[j],
        u = sub(ring[(i + 1) % ring.length], a),
        v = sub(mask[(j + 1) % mask.length], b),
        w = sub(b, a);
      const det = cross(u, v);
      if (!det) continue;
      const t = cross(w, v) / det,
        s = cross(w, u) / det;
      if (t < 0 || t > 1 || s < 0 || s > 1) continue;
      const p = mix(a, ring[(i + 1) % ring.length], t);
      if (hits.every((q) => distance(p, q) > 0.00001)) hits.push(p);
    }
  assert.equal(hits.length, 2);
  return hits;
}
function ringCenter(op) {
  assert.equal(op.next, OPS.stroke);
  assert.deepEqual(op.commands, [OPS.moveTo, ...Array(4).fill(OPS.curveTo), OPS.closePath]);
  return mix(op.points[0], op.points[6], 0.5);
}
const [keyPage, keyA, keyB] = ledger.legend;
const key = await pagePaths(keyPage, [0, 0]);
const pitch = distance(ringCenter(key.get(keyA)), ringCenter(key.get(keyB)));
const reference = [],
  source = [];
const pages = new Map();
for (const row of ledger.strokes) {
  if (!pages.has(row.page))
    pages.set(row.page, await pagePaths(row.page, ledger.tileOriginsMm[row.page]));
  const ops = pages.get(row.page);
  if (row.turn) {
    const sections = row.turn.map((id, i) => {
      const op = ops.get(id);
      assert.equal(op.next, OPS.stroke);
      return section(op.points, ops.get(row.masks[i]).points);
    });
    assert(sections[0].every((a) => sections[1].some((b) => distance(a, b) < 0.035)));
    reference.push(mix(...sections.map((pair) => mix(...pair, 0.5)), 0.5));
    source.push([row.page, ...row.turn]);
  } else {
    for (let id = row.first; id <= row.last; id += 5) {
      reference.push(ringCenter(ops.get(id)));
      source.push([row.page, id]);
    }
  }
}
assert.equal(reference.length, 2089);
assert(
  reference.every(
    (p, i) => Math.abs(distance(p, reference[(i + 1) % reference.length]) / pitch - 1) < 0.12,
  ),
);
function directed(from, to) {
  let worst = { mm: -1 };
  const edges = to.map((p, i) => {
    const [x, y] = sub(to[(i + 1) % to.length], p);
    return { p, x, y, den: x * x + y * y };
  });
  for (let i = 0; i < from.length; i++) {
    const a = from[i],
      b = from[(i + 1) % from.length],
      n = Math.max(1, Math.ceil(distance(a, b) / ledger.sampleStepMm));
    for (let j = 0; j < n; j++) {
      const at = mix(a, b, j / n);
      let min = Infinity,
        index;
      for (let k = 0; k < edges.length; k++) {
        const { p, x, y, den } = edges[k],
          dx = at[0] - p[0],
          dy = at[1] - p[1];
        const u = den ? Math.max(0, Math.min(1, (dx * x + dy * y) / den)) : 0;
        const ds = (dx - u * x) ** 2 + (dy - u * y) ** 2;
        if (ds < min) {
          min = ds;
          index = k;
        }
      }
      if (min > worst.mm ** 2 || worst.mm < 0)
        worst = { mm: Math.sqrt(min), at, from: i, to: index };
    }
  }
  return worst;
}
for (const { file, translation } of ledger.controls) {
  const dxf = new Parser().parseSync(fs.readFileSync(fileURLToPath(new URL(file, docs)), 'utf8'));
  assert.equal(dxf.header.$INSUNITS, 4);
  const lines = dxf.blocks[ledger.block].entities.filter(
    (e) => e.type === 'LWPOLYLINE' && e.layer === '1',
  );
  assert.equal(lines.length, 1);
  assert(lines[0].shape);
  const cut = lines[0].vertices.map((p) => [p.x - translation[0], p.y - translation[1]]);
  const forward = directed(reference, cut),
    reverse = directed(cut, reference);
  console.log(file, {
    pdfToDxf: { ...forward, operation: source[forward.from] },
    dxfToPdf: { ...reverse, operation: source[reverse.to] },
  });
}
await pdf.destroy();
