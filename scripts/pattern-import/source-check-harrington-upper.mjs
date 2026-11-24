import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import DxfParser from 'dxf-parser';
import { build } from 'esbuild';
import { Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';
import { sourceFills } from './emma-pdf-marks.mjs';

const [pdf, reviewFile, previous, final, folder] = process.argv.slice(2);
const bytes = fs.readFileSync(pdf);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '83a30840de9184bfb0d734c61612c7ce42ae7882bf96fd8178d6994321193e1d',
);
const readSession = (path) => deserialize(gunzipSync(fs.readFileSync(join(path, 'session.v8.gz'))));
const before = readSession(previous),
  now = readSession(final),
  review = JSON.parse(fs.readFileSync(reviewFile));
const { outputFiles } = await build({
  stdin: {
    contents:
      "export {writeR12} from './src/lib/pattern-import/write/r12'; export {SegGrid,segNearest} from './src/lib/pattern-import/pieces/geom';export {mixedPanel} from './src/lib/pattern-import/pieces/mixed-fold-panel';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  write: false,
});
const { writeR12, SegGrid, segNearest, mixedPanel } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const reader = await readPdfDrawing(bytes, now.sheet, () => true);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const refs = {},
  out = { sizes: {}, priorClosed: 0 };
for (const f of before.families)
  for (const c of f.candidates) {
    const n = now.families.find((q) => q.seed === f.seed).candidates[c.rank];
    assert.equal(n.outcome, 'closed');
    if (c.outcome === 'closed') {
      assert.deepEqual(n.outer, c.outer);
      out.priorClosed++;
    } else assert(f.seed === 1 && [2, 4].includes(c.rank) && c.gradeRefusal === 'grade-ambiguous');
  }
assert.equal(out.priorClosed, 68);
function diff(a, b) {
  const points = [...b, b[0]],
    grid = new SegGrid(2);
  grid.addPolyline(0, points);
  let max = 0,
    count = 0,
    worst;
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length],
      n = Math.ceil(dist(p, q) / 0.1);
    for (let j = 0; j < n; j++) {
      const pt = { x: p.x + ((q.x - p.x) * j) / n, y: p.y + ((q.y - p.y) * j) / n };
      let d = Infinity;
      grid.near(pt, 2, (_, k) => {
        d = Math.min(d, segNearest(pt, points[k], points[k + 1]).d);
      });
      assert(Number.isFinite(d));
      if (d > max) {
        max = d;
        worst = pt;
      }
      count++;
    }
  }
  return { max, count, worst };
}
async function fill(pg, op) {
  const raw = (await reader.load(pg - 1)).fills.get(op);
  assert(raw, pg + '/' + op);
  return raw;
}
const getPoints = (g) => reader.rawPieces(g)[0];
function ends(g) {
  return Array.from(g.cmd, (_, i) =>
    i === 0
      ? reader.toSheet(Util.applyTransform(g.xy.slice(0, 2), g.matrix), g.page)
      : getPoints({ ...g, cmd: g.cmd.slice(0, i + 1) }).at(-1),
  );
}
function offsetLine(a, b, h) {
  const n = dist(a, b),
    x = (-(b.y - a.y) / n) * h,
    y = ((b.x - a.x) / n) * h;
  return [a, b].map((p) => ({ x: p.x + x, y: p.y + y }));
}
function intersect([a, b], [c, d]) {
  const x = b.x - a.x,
    y = b.y - a.y,
    u = d.x - c.x,
    v = d.y - c.y,
    det = x * v - y * u;
  assert(Math.abs(det) > 0.01);
  const t = ((c.x - a.x) * v - (c.y - a.y) * u) / det;
  return { x: a.x + t * x, y: a.y + t * y };
}
const blocks = [];
const upperPage = await reader.doc.getPage(4),
  list = await upperPage.getOperatorList();
for (const [rank, size] of [
  [2, '38'],
  [4, '42'],
]) {
  const c = now.families[1].candidates[rank],
    probe = review.probes[size];
  const [flag, damaged, outgoing, ovalKey, flagKey] =
    size === '38' ? [2597, 2602, 2612, 1094, 1079] : [3931, 3936, 3941, 703, 693];
  const original = new Map();
  for (const op of [flag, damaged, outgoing, outgoing + 5, ovalKey, flagKey])
    original.set(op, await fill(4, op));
  const points = (op) => ends(original.get(op));
  const key = points(ovalKey),
    h = mid(key[0], key[2]).y - points(flagKey)[0].y;
  const flags = points(flag),
    bend = points(damaged),
    o = points(outgoing),
    next = points(outgoing + 5);
  const firstOut = [o[0], o[2]],
    secondOut = [next[0], next[2]];
  const datum = size === '38' ? offsetLine(bend[0], bend.at(-2), h) : [bend[0], bend[4]];
  const primary = intersect(datum, firstOut),
    control = intersect(offsetLine(flags[0], flags.at(-2), h), secondOut);
  assert(dist(primary, control) < 0.001);
  const clips = sourceFills(list, new Set([damaged]))
    .get(damaged)
    .clips.map((x) => x.id);
  const dr = original.get(damaged);
  assert(getPoints(dr).every((p) => reader.eligible(reader.toPage(p, 3), dr.clip)));
  const closest = Math.min(...c.outer.map((p) => dist(p, primary)));
  assert(closest < 0.001);
  // Load every source oval again from the original commands in the independent audit ledger.
  const ring = [];
  for (const a of probe.anchors) {
    const raw = await fill(a.pg, a.op),
      p = ends(raw),
      at = mid(p[0], p[2]);
    assert(dist(at, a.at) < 0.00001);
    assert(reader.eligible(reader.toPage(at, a.pg - 1), raw.clip));
    ring.push({ station: a.station, at });
  }
  for (const q of probe.quads) {
    const page = await reader.doc.getPage(q.pg),
      ops = await page.getOperatorList();
    // Each mask is followed by clip, endPath, and the first fill of this brush.
    const polys = q.ops.map((id) => {
      // Resolve the paint id from the actual operator list, including any optional save/transform.
      const fillIds = [...(reader.pages.get(q.pg - 1)?.fills.keys() ?? [])].filter(
        (i) => i > id && i < id + 24,
      );
      const clip = [...sourceFills(ops, new Set(fillIds)).values()]
        .flatMap((f) => f.clips)
        .find((m) => m.id === id);
      assert(clip && clip.xy.length === 8);
      return Array.from({ length: 4 }, (_, i) =>
        reader.toSheet(
          Util.applyTransform([clip.xy[i * 2], clip.xy[i * 2 + 1]], clip.matrix),
          q.pg - 1,
        ),
      );
    });
    const common = polys[0].filter((p) => polys[1].some((q) => dist(p, q) < 0.002));
    assert.equal(common.length, 2);
    const at = mid(...common);
    assert(dist(at, q.at) < 0.001);
    ring.push({ station: q.station, at });
  }
  ring.push({ station: probe.metrics.shoulder[0].station, at: primary });
  refs[size] = ring.sort((a, b) => a.station - b.station).map((r) => r.at);
  // Regression: removing a continuous interval of the selected pen must prevent a repair.
  const cls = now.set.classes.find((k) => k.id === now.run.sizes[rank].classId),
    keyChain = cls.evidence.find((e) => e.kind === 'legend-sample');
  const sample = now.set.chains[keyChain.chain].ranges.map((r) => now.sheet.paths[r.path]);
  const paths = now.sheet.paths.filter(
    (p) =>
      p.src.page !== 11 ||
      p.src.op < (size === '38' ? 2302 : 3575) ||
      p.src.op > (size === '38' ? 2427 : 3725),
  );
  assert(mixedPanel(now.sheet.paths, now.sheet.styles, sample, c.outer, now.sheet.paths));
  assert(!mixedPanel(paths, now.sheet.styles, sample, c.outer, paths));
  out.sizes[size] = {
    operation: damaged,
    clips,
    primary,
    control,
    independentError: dist(primary, control),
    nativeCornerError: closest,
  };
  blocks.push({
    name: 'A_BACK_' + size,
    identity: 'A_BACK',
    displayName: 'A BACK',
    quantity: 1,
    labelSize: size,
    material: '',
    annotation: ['Diagnostic printed half on fold'],
    cut: c.outer.map((p) => ({ x: p.x - c.bbox.minX, y: p.y - c.bbox.minY })),
    cutLoops: [],
    internal: [],
    drawn: [],
    foldLines: 0,
    drills: [],
    notches: [],
  });
}
fs.mkdirSync(folder, { recursive: true });
const path = join(folder, 'harrington-upper.dxf');
fs.writeFileSync(
  path,
  writeR12(blocks, {
    styleName: 'Harrington source check',
    createdAt: '2026-11-22T00:00:00Z',
    sampleSize: '38',
  }),
);
const dxf = new DxfParser().parseSync(fs.readFileSync(path, 'utf8'));
for (const [rank, size] of [
  [2, '38'],
  [4, '42'],
]) {
  const c = now.families[1].candidates[rank];
  const lines = dxf.blocks['A_BACK_' + size].entities.filter(
    (e) => e.type === 'POLYLINE' && String(e.layer) === '1' && e.shape,
  );
  assert.equal(lines.length, 1);
  const line = lines[0].vertices.map((p) => ({ x: p.x + c.bbox.minX, y: p.y + c.bbox.minY }));
  for (let i = 0; i < line.length; i++) {
    const a = line[i],
      b = line[(i + 1) % line.length];
    assert(dist(a, b) > 0.000001);
    for (let j = i + 2; j < line.length; j++) {
      if (i === 0 && j === line.length - 1) continue;
      const p = line[j],
        q = line[(j + 1) % line.length];
      if (
        Math.max(a.x, b.x) < Math.min(p.x, q.x) ||
        Math.max(p.x, q.x) < Math.min(a.x, b.x) ||
        Math.max(a.y, b.y) < Math.min(p.y, q.y) ||
        Math.max(p.y, q.y) < Math.min(a.y, b.y)
      )
        continue;
      const side = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      assert(
        side(a, b, p) * side(a, b, q) > 0 || side(p, q, a) * side(p, q, b) > 0,
        'intersecting DXF edges',
      );
    }
  }
  assert.equal(line.length, c.outer.length);
  const rounding = Math.max(...line.map((v, i) => dist(v, c.outer[i])));
  assert(rounding < 0.000001);
  const sourceToDxf = diff(refs[size], line),
    dxfToSource = diff(line, refs[size]);
  Object.assign(out.sizes[size], { rounding, sourceToDxf, dxfToSource, vertices: line.length });
  assert(sourceToDxf.max < 0.12 && dxfToSource.max < 0.12);
}
out.native = JSON.parse(fs.readFileSync(join(final, 'native.json')));
delete out.native.nativeMs;
fs.writeFileSync(
  join(folder, 'harrington-upper-verification.json'),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(JSON.stringify(out.sizes, null, 2));
await reader.doc.destroy();
