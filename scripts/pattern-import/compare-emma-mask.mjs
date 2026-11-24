// Compare the two native sessions by PDF operation and family/size. IDs can change after clipping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

const load = (path) => deserialize(gunzipSync(readFileSync(path)));
const [baseline, changed] = process.argv.slice(2).map(load);

async function finalize(s, path) {
  const runtime = await import(pathToFileURL(resolve(dirname(path), '../replay-runtime.mjs')));
  const native = JSON.parse(readFileSync(resolve(dirname(path), 'native.json')));
  return runtime.finalizePieces(s, native.structuralEdits);
}
if (process.env.FINAL_CELLS) {
  const paths = process.argv.slice(2);
  [baseline.families, changed.families] = await Promise.all([
    finalize(baseline, paths[0]),
    finalize(changed, paths[1]),
  ]);
}
const sourceKey = ({ src: s }) => [s.file, s.page, s.op, s.sub].join('/');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Sample each entire source edge. The target is its continuous polygonal boundary.
function directed(a, b) {
  const edge = b.map((p, i) => {
    const q = b[(i + 1) % b.length],
      x = q.x - p.x,
      y = q.y - p.y;
    return { p, x, y, len: x * x + y * y };
  });
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length],
      n = Math.max(1, Math.ceil(distance(p, q) / 0.25));
    for (let j = 0; j < n; j++) {
      const x = p.x + ((q.x - p.x) * j) / n,
        y = p.y + ((q.y - p.y) * j) / n;
      let best = Infinity;
      for (const e of edge) {
        const dx = x - e.p.x,
          dy = y - e.p.y;
        const t = e.len ? Math.max(0, Math.min(1, (dx * e.x + dy * e.y) / e.len)) : 0;
        best = Math.min(best, (dx - e.x * t) ** 2 + (dy - e.y * t) ** 2);
        if (best <= max) break;
      }
      max = Math.max(max, best);
    }
  }
  return Math.sqrt(max);
}
function area(pts) {
  return (
    Math.abs(
      pts.reduce((sum, a, i) => {
        const b = pts[(i + 1) % pts.length];
        return sum + (a.x - pts[0].x) * (b.y - pts[0].y) - (a.y - pts[0].y) * (b.x - pts[0].x);
      }, 0),
    ) / 2
  );
}
function crossings(pts) {
  const hits = [];
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
      if (t > 0 && t < 1 && u > 0 && u < 1) hits.push([a.x + t * rx, a.y + t * ry]);
    }
  return hits;
}
const oldLine = baseline.set.chains.find((c) =>
  c.ranges.some((r) => {
    const s = baseline.sheet.paths[r.path].src;
    return s.page === 6 && s.op === 12146;
  }),
);
const keys = new Set(oldLine.ranges.map((r) => sourceKey(baseline.sheet.paths[r.path])));
const rows = changed.set.chains
  .map((c) => ({ c, keys: c.ranges.map((r) => sourceKey(changed.sheet.paths[r.path])) }))
  .filter((row) => row.keys.some((k) => keys.has(k)));
const ops = [9035, 9700, 9710, 9715, 9720, 9730, 9735, 9740];
const target = changed.families[7].candidates.find((c) => changed.run.sizes[c.rank].label === '26');
const used = new Set(target.visibleMarks);
const marks = ops.map((op) => {
  const path = (s) => s.sheet.paths.find((p) => p.src.page === 11 && p.src.op === op);
  const a = path(baseline),
    b = path(changed);
  return {
    op,
    usedInCut: b ? used.has(b.id) : false,
    visibleAreaRatio: b ? area(b.visibleFill ?? b.pts) / area(a.pts) : 0,
    chains: rows.filter((r) => r.keys.includes(sourceKey(a))).map((r) => r.c.id),
  };
});
const changedOld = [],
  lost = [],
  gained = [],
  neighbors = [];
let unchanged = 0;
for (const [i, f] of baseline.families.entries())
  for (const a of f.candidates) {
    const label = baseline.run.sizes[a.rank].label;
    const b = changed.families[i].candidates.find((c) => changed.run.sizes[c.rank].label === label);
    const id = [i, label];
    if (a.outcome === 'closed' && b.outcome !== 'closed') lost.push(id);
    else if (a.outcome !== 'closed' && b.outcome === 'closed') gained.push(id);
    else if (a.outcome === 'closed') {
      if (same(a.outer, b.outer)) unchanged++;
      else
        changedOld.push({
          id,
          areaBefore: a.areaMm2,
          areaAfter: b.areaMm2,
          deviation: Math.max(directed(a.outer, b.outer), directed(b.outer, a.outer)),
        });
    }
    if (i === 7 && ['24', '26', '28'].includes(label))
      neighbors.push({
        label,
        before: a.outcome,
        after: b.outcome,
        areaBefore: a.areaMm2,
        areaAfter: b.areaMm2,
        leakAt: b.leakAt,
        crossings: crossings(b.outer),
      });
  }
if (process.env.CHECK_EMMA) {
  assert.equal(target.outcome, 'closed');
  assert.equal(used.size, 468);
  for (const op of [9710, 9730]) assert(marks.find((m) => m.op === op)?.usedInCut);
  for (const op of [9720, 9735]) assert.equal(marks.find((m) => m.op === op)?.usedInCut, false);
  assert.deepEqual(lost, []);
  assert.deepEqual(changedOld, []);
  assert.equal(unchanged, 128);
  assert.deepEqual(gained, [[7, '26']]);
}
console.log(
  JSON.stringify(
    {
      marks,
      visibleMarks: used.size,
      lines: rows.map(({ c, keys: ids }) => ({
        id: c.id,
        overlap: ids.filter((k) => keys.has(k)).length,
        total: ids.length,
        labels: changed.set.classes
          .filter((r) => r.chains.includes(c.id))
          .map((r) => r.sizeLabel ?? r.role),
        ends: [c.pts[0], c.pts.at(-1)],
        gap: distance(c.pts[0], c.pts.at(-1)),
        crossings: crossings(c.pts),
      })),
      neighbors,
      unchanged,
      changedOld,
      lost,
      gained,
    },
    null,
    2,
  ),
);
