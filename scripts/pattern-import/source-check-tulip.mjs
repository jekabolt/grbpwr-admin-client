// Exercise the original tiled PDF paint operations independently of the importer's dashed-wall fill.
// node scripts/pattern-import/source-check-tulip.mjs <original.pdf> <current-native-case-directory> <coverage.json>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { readPdfDrawing } from './visible-pdf-strokes.mjs';

const api = await build({
  entryPoints: [
    fileURLToPath(new URL('../../src/lib/pattern-import/pieces/geom.ts', import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const { SegGrid, segNearest, pointInPoly, resample, signedArea } = await import(
  'data:text/javascript;base64,' + Buffer.from(api.outputFiles[0].contents).toString('base64')
);
const [pdf, dir, inventory, dxfPath] = process.argv.slice(2);
const read = (path) => JSON.parse(readFileSync(path));
const s = deserialize(gunzipSync(readFileSync(join(dir, 'session.v8.gz'))));
const targets = read(inventory)
  .find((f) => f.id === basename(dir))
  .rows.filter((r) => r.name === 'A - FRONT BODICE');
const bytes = readFileSync(pdf);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  'e7fe0e1bb030062cdb50ca56d6c833621289ed1cc4c048be972da7d2389177a6',
);
const { doc, apply, pose, pages, load, eligible, toSheet, toPage, rawPieces, distance } =
  await readPdfDrawing(bytes, s.sheet);
const profile = (dash) => {
  const sum = dash.reduce((s, v) => s + v, 0);
  return dash.map((v) => v / sum);
};
const err = (a, b) =>
  a.length === b.length ? Math.max(0, ...a.map((v, i) => Math.abs(v - b[i]))) : Infinity;
const sheetPaths = new Map(s.sheet.paths.map((p) => [p.id, p])),
  family = s.families.find(
    (f) => s.seeds.find((q) => q.id === f.seed)?.text?.text === 'A - FRONT BODICE',
  );
const check = assert.ok;
check(targets.length === 18);
const figures = [];
for (const r of targets) {
  const path = sheetPaths.get(r.evidence.find((e) => e.kind === 'fullPath').paths[0]),
    cls = s.set.classes.find((c) => c.sizeLabel === r.size);
  const legend = cls.evidence.find((e) => e.kind === 'legend-sample' && e.label === r.size);
  const keyChain = s.set.chains[legend.chain];
  const sample = keyChain.ranges
    .map((r) => sheetPaths.get(r.path))
    .find((p) => p.style === keyChain.style);
  check(sample, 'Missing representative legend sample for ' + r.size);
  const text = s.sheet.texts
    .filter((t) => t.text.trim() === 'SIZE ' + r.size)
    .sort((a, b) => distance(a.anchor, legend.textAt) - distance(b.anchor, legend.textAt))[0];
  const original = (await load(path.src.page)).strokes.get(path.src.op),
    key = (await load(sample.src.page)).strokes.get(sample.src.op),
    printed = (await load(text.src.page)).labels.find(
      (t) => t.text === 'SIZE ' + r.size && distance(t.p, text.anchor) < 0.25,
    );
  assert.ok(printed, 'Missing original printed label ' + r.size);
  check(original?.closed && key);
  figures.push({
    size: r.size,
    path,
    original,
    key,
    printed,
    keyText: [text.src.page + 1, printed.text, printed.p.x, printed.p.y],
    keyStroke: [sample.src.page + 1, sample.src.op],
  });
}
const keys = new Map();
for (const f of figures) {
  const key = f.original.pen + String(f.original.dash);
  if (!keys.has(key)) keys.set(key, { index: new SegGrid(4), lines: [] });
}
const allPts = figures.flatMap((f) => f.path.pts),
  box = {
    minX: Math.min(...allPts.map((p) => p.x)),
    maxX: Math.max(...allPts.map((p) => p.x)),
    minY: Math.min(...allPts.map((p) => p.y)),
    maxY: Math.max(...allPts.map((p) => p.y)),
  };
for (const [page, q] of pose) {
  if (
    q.toSheet.e > box.maxX + 2 ||
    q.toSheet.e + q.widthMm < box.minX - 2 ||
    q.toSheet.f > box.maxY + 2 ||
    q.toSheet.f + q.heightMm < box.minY - 2
  )
    continue;
  const data = await load(page);
  for (const p of data.strokes.values()) {
    const slot = keys.get(p.pen + String(p.dash));
    if (!slot || !p.clip) continue;
    for (const line of rawPieces(p)) {
      const id = slot.lines.length;
      slot.lines.push({ line, p });
      slot.index.addPolyline(id, line, false);
    }
  }
}
const output = [];
for (const f of figures) {
  const candidates = figures
    .map((v) => ({ size: v.size, delta: err(profile(f.original.dash), profile(v.key.dash)) }))
    .sort((a, b) => a.delta - b.delta);
  const matches = candidates.filter((k) => k.delta <= candidates[0].delta + 0.001);
  assert.ok(matches.some((m) => m.size === f.size) && candidates[0].delta < 0.001);
  assert.equal(f.original.pen, f.key.pen);
  const rawStart = toSheet(apply(f.original.xy.slice(0, 2), f.original.matrix), f.original.page);
  check(Math.min(...f.path.pts.map((p) => distance(p, rawStart))) < 0.1);
  let missing = 0,
    total = 0;
  const tiles = new Set();
  for (let i = 0; i < f.path.pts.length; i++) {
    const a = f.path.pts[i],
      b = f.path.pts[(i + 1) % f.path.pts.length],
      n = Math.max(1, Math.ceil(distance(a, b) / 0.5));
    for (let j = 0; j < n; j++) {
      const p = { x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n };
      const slot = keys.get(f.original.pen + String(f.original.dash));
      let found = false;
      slot.index.near(p, 0.1, (id, k) => {
        const w = slot.lines[id],
          a = w.line[k],
          b = w.line[k + 1];
        if (!b || !eligible(toPage(p, w.p.page), w.p.clip) || segNearest(p, a, b).d > 0.1) return;
        found = true;
        tiles.add(w.p.page);
      });
      total++;
      if (!found) missing++;
    }
  }
  assert.equal(missing, 0, 'Invisible original segments in size ' + f.size);
  output.push({
    size: f.size,
    source: [f.original.page + 1, f.original.id],
    legend: f.keyText,
    legendStroke: f.keyStroke,
    pattern: f.original.dash,
    matches: matches.map((x) => x.size),
    legendShapeError: candidates[0].delta,
    nextError: candidates[1].delta,
    total,
    missing,
    witnessPages: [...tiles].map((p) => p + 1).sort((a, b) => a - b),
    nativeOutcome: family.candidates.find((c) => s.run.sizes[c.rank].label === f.size).outcome,
  });
}
function bounds(small, big) {
  let maxOutside = 0,
    outside = 0;
  for (const p of resample(small, 0.5, true)) {
    if (pointInPoly(p, big)) continue;
    const d = Math.min(...big.map((q, i) => segNearest(p, q, big[(i + 1) % big.length]).d));
    if (d > 0.3) outside++;
    maxOutside = Math.max(maxOutside, d);
  }
  return { outside, maxOutside };
}
for (const [idx, row] of output.entries()) {
  if (row.matches.length <= 1) continue;
  const lo = figures[idx - 1],
    hi = figures[idx + 1];
  row.brackets = figures
    .filter((f) => row.matches.includes(f.size))
    .map((f) => ({
      size: f.size,
      low: lo.size,
      high: hi.size,
      areas: [lo, f, hi].map((q) => Math.abs(signedArea(q.path.pts))),
      lowInside: bounds(lo.path.pts, f.path.pts),
      highContains: bounds(f.path.pts, hi.path.pts),
    }));
}
for (const row of output.filter((r) => r.brackets)) {
  assert.deepEqual(
    row.brackets.filter((b) => !b.lowInside.outside && !b.highContains.outside).map((b) => b.size),
    [row.size],
  );
}
const smallest = figures[0].path.pts;
const originalTexts = new Set(
  [...pages.values()].flatMap((page) =>
    page.labels.filter((t) => pointInPoly(t.p, smallest)).map((t) => t.text),
  ),
);
for (const mark of [
  'DART',
  'GRAINLINE',
  'FABRIC: CUT 1',
  'A - FRONT BODICE',
  'PLACE ON FOLD OF FABRIC',
])
  assert.ok(originalTexts.has(mark), mark);
function readCutLines(file) {
  const l = readFileSync(file, 'utf8').split(/\r?\n/),
    blocks = new Map();
  let entity,
    props = new Map(),
    block,
    poly;
  function finish() {
    if (entity === 'BLOCK') block = props.get(2);
    if (entity === 'ENDBLK') {
      block = undefined;
      poly = undefined;
    }
    if (!block) return;
    if (entity === 'POLYLINE' && props.get(8) === '1' && Number(props.get(70)) & 1) {
      assert.ok(!blocks.has(block), 'Multiple cut lines in ' + block);
      poly = [];
      blocks.set(block, poly);
    } else if (entity === 'POLYLINE' || entity === 'SEQEND') poly = undefined;
    if (entity === 'VERTEX' && poly)
      poly.push({ x: Number(props.get(10)), y: Number(props.get(20)) });
  }
  for (let i = 0; i + 1 < l.length; i += 2) {
    const k = Number(l[i]),
      v = l[i + 1].trim();
    if (k === 0) {
      finish();
      entity = v;
      props = new Map();
    } else props.set(k, v);
  }
  finish();
  return blocks;
}
function unfolded(ring) {
  const foldX = Math.min(...ring.map((p) => p.x));
  const onFold = (p) => Math.abs(p.x - foldX) < 0.02;
  const spans = ring.map((p, i) => onFold(p) && onFold(ring[(i + 1) % ring.length]));
  const i = spans.findIndex((v, i) => v && !spans[(i - 1 + ring.length) % ring.length]);
  assert.ok(i >= 0, 'Missing straight left fold edge');
  let start = i;
  while (spans[start]) start = (start + 1) % ring.length;
  const side = [ring[start]];
  while (start !== i) {
    start = (start + 1) % ring.length;
    side.push(ring[start]);
  }
  return side.concat(
    side
      .slice(1, -1)
      .reverse()
      .map((p) => ({ x: 2 * foldX - p.x, y: p.y })),
  );
}
function directed(ring, other) {
  const sample = [...ring, ...resample(ring, 0.5, true)];
  return Math.max(
    ...sample.map((p) =>
      Math.min(...other.map((q, i) => segNearest(p, q, other[(i + 1) % other.length]).d)),
    ),
  );
}
if (dxfPath) {
  const blocks = readCutLines(dxfPath);
  for (const [idx, row] of output.entries()) {
    const cut = blocks.get('FP_' + row.size);
    assert.ok(cut?.length);
    const printed = unfolded(figures[idx].path.pts),
      low = (pts, k) => Math.min(...pts.map((p) => p[k]));
    const dx = low(printed, 'x') - low(cut, 'x'),
      dy = low(printed, 'y') - low(cut, 'y');
    const placed = cut.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    row.written = {
      block: 'FP_' + row.size,
      vertices: cut.length,
      sourceToDxf: directed(printed, placed),
      dxfToSource: directed(placed, printed),
    };
  }
}
for (const row of output.filter((r) => r.written))
  assert.ok(
    row.written.sourceToDxf < 0.1 && row.written.dxfToSource < 0.1,
    'DXF departure in ' + row.size,
  );
await doc.destroy();
console.log(
  JSON.stringify(
    { sha256: createHash('sha256').update(bytes).digest('hex'), rows: output },
    null,
    2,
  ),
);
