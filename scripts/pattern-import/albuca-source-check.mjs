// Audit restored Albuca B fronts against the actual PDF operators for that printed pen.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import DxfParser from 'dxf-parser';
import { draw } from './emma-pdf-marks.mjs';
import { perimeterError } from './automatic-gap-source-curves.mjs';
const [pdfFile, before, after, dxf] = process.argv.slice(2);
assert(after, 'Expected original.pdf before/session.v8.gz after/session.v8.gz [written-cut.dxf]');
const ranges = JSON.parse(
  readFileSync(new URL('../../docs/pattern-import/albuca-printed-ranges.json', import.meta.url)),
);
const pdfBytes = readFileSync(pdfFile);
assert.equal(
  createHash('sha256').update(pdfBytes).digest('hex'),
  '1346dbb1f0bbc59c1dd59fd6a1df44cc65961d04361f5aa3330da64a42ed75af',
);
const load = (f) => deserialize(gunzipSync(readFileSync(f)));
const baseline = load(before),
  now = load(after),
  doc = await getDocument({ data: new Uint8Array(pdfBytes), verbosity: 0 }).promise;
let old = 0;
for (const f of baseline.families)
  for (const c of f.candidates)
    if (c.outcome === 'closed') {
      assert.deepEqual(
        now.families.find((q) => q.seed === f.seed).candidates.find((q) => q.rank === c.rank).outer,
        c.outer,
      );
      old++;
    }
assert.equal(old, 15);
const k = 25.4 / 72,
  scale = 3,
  dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const seg = (p, a, b) => {
  let x = b.x - a.x,
    y = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.y - a.y) * y) / (x * x + y * y || 1)));
  return Math.hypot(p.x - a.x - t * x, p.y - a.y - t * y);
};
const cells = Object.fromEntries(
  Object.keys(ranges).map((size) => [
    size,
    now.families[1].candidates.find((c) => now.run.sizes[c.rank].label === size),
  ]),
);
const dense = Object.fromEntries(
  Object.entries(cells).map(([size, c]) => [
    size,
    c.outer.flatMap((a, i) => {
      const b = c.outer[(i + 1) % c.outer.length],
        n = Math.ceil(dist(a, b) / 0.25);
      return Array.from({ length: n }, (_, j) => ({
        x: a.x + ((b.x - a.x) * j) / n,
        y: a.y + ((b.y - a.y) * j) / n,
        gap: Infinity,
      }));
    }),
  ]),
);
const cornerDots = new Map();
const stats = Object.fromEntries(
  Object.keys(ranges).map((size) => [size, { marks: 0, maxAxis: 0 }]),
);
// Separate bitmap for each size and tile. Rasterise only the corresponding original pen; use
// the graphic-state stack and each stroke/filled Bezier under its original clips.
for (const pageNumber of new Set(
  Object.values(ranges)
    .flat()
    .map(([page]) => page),
)) {
  const page = await doc.getPage(pageNumber),
    list = await page.getOperatorList(),
    view = page.getViewport({ scale });
  const pose = now.sheet.poses.find((p) => p.page === pageNumber - 1).toSheet;
  assert(
    Math.abs(pose.a - 1) < 1e-8 &&
      Math.abs(pose.d - 1) < 1e-8 &&
      Math.abs(pose.b) + Math.abs(pose.c) < 1e-8,
  );
  const w = 300,
    z = 24,
    local = createCanvas(w, w).getContext('2d');
  const frames = Object.fromEntries(
    Object.keys(ranges).map((size) => {
      const ctx = createCanvas(view.width, view.height).getContext('2d');
      return [
        size,
        {
          ctx,
          intervals: ranges[size].filter((r) => r[0] === pageNumber),
          ids: new Set(
            cells[size].printedMotif.paths
              .map((id) => now.sheet.paths[id])
              .filter((p) => p.src.page === pageNumber - 1)
              .map((p) => p.src.op),
          ),
        },
      ];
    }),
  );
  let state = {
      matrix: [1, 0, 0, 1, 0, 0],
      clips: [],
      width: 1,
      cap: 0,
      colour: [0, 0, 0],
      opacity: 1,
      strokeOpacity: 1,
    },
    stack = [],
    pending,
    cut;
  for (let i = 0; i < list.fnArray.length; i++) {
    const f = list.fnArray[i],
      args = list.argsArray[i];
    if (f === OPS.save) stack.push({ ...state });
    if (f === OPS.restore) state = stack.pop();
    if (f === OPS.transform) state.matrix = Util.transform(state.matrix, args);
    if (f === OPS.setLineWidth) state.width = args[0];
    if (f === OPS.setLineCap) state.cap = args[0];
    if (f === OPS.setGState) {
      for (const [key, value] of args[0]) {
        if (key === 'ca') state.opacity = value;
        if (key === 'CA') state.strokeOpacity = value;
      }
    }
    if (f === OPS.constructPath) pending = { ops: args[0], xy: args[1], matrix: state.matrix };
    if (f === OPS.clip || f === OPS.eoClip)
      cut = { ...pending, rule: f === OPS.clip ? 'nonzero' : 'evenodd' };
    if (
      ![
        OPS.stroke,
        OPS.closeStroke,
        OPS.fill,
        OPS.eoFill,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke,
        OPS.endPath,
      ].includes(f)
    )
      continue;
    if (f !== OPS.endPath && pending)
      for (const [size, frame] of Object.entries(frames)) {
        if (!frame.intervals.some(([, a, b]) => i >= a && i <= b)) continue;
        const ctx = frame.ctx;
        ctx.save();
        ctx.setTransform(...view.transform);
        for (const clip of state.clips) {
          draw(ctx, clip);
          ctx.clip(clip.rule);
        }
        draw(ctx, pending);
        if (f === OPS.stroke) {
          ctx.lineWidth = state.width * Math.hypot(state.matrix[0], state.matrix[1]);
          ctx.lineCap = ['butt', 'round', 'square'][state.cap];
          ctx.globalAlpha = state.strokeOpacity;
          ctx.stroke();
        } else if (f === OPS.fill || f === OPS.eoFill) {
          ctx.globalAlpha = state.opacity;
          ctx.fill(f === OPS.eoFill ? 'evenodd' : 'nonzero');
        } else assert.fail('Unexpected paint in an Albuca motif interval');
        ctx.restore();
        if (!frame.ids.has(i)) continue;
        // An independent PDF canvas renders each claimed mark at 24 px/pt. Opposite ink extents
        // across the local cut tangent reconstruct the centre of the decoration, including triangles.
        const sourcePoints = [];
        for (let j = 0; j < pending.xy.length; j += 2)
          sourcePoints.push(
            Util.applyTransform([pending.xy[j], pending.xy[j + 1]], pending.matrix),
          );
        const anchor = [0, 1].map(
          (d) =>
            (Math.min(...sourcePoints.map((p) => p[d])) +
              Math.max(...sourcePoints.map((p) => p[d]))) /
            2,
        );
        local.save();
        local.resetTransform();
        local.clearRect(0, 0, w, w);
        local.setTransform(z, 0, 0, z, w / 2 - z * anchor[0], w / 2 - z * anchor[1]);
        for (const clip of state.clips) {
          draw(local, clip);
          local.clip(clip.rule);
        }
        draw(local, pending);
        if (f === OPS.stroke) {
          local.lineWidth = state.width * Math.hypot(state.matrix[0], state.matrix[1]);
          local.lineCap = ['butt', 'round', 'square'][state.cap];
          local.stroke();
        } else local.fill(f === OPS.eoFill ? 'evenodd' : 'nonzero');
        const data = local.getImageData(0, 0, w, w).data;
        local.restore();
        const ring = cells[size].outer,
          pt = { x: anchor[0] * k + pose.e, y: anchor[1] * k + pose.f };
        if (size === '2XL' && pageNumber === 38 && [1494, 1499, 1517, 1522].includes(i))
          cornerDots.set(i, pt);
        let best = Infinity,
          line;
        for (let j = 0; j < ring.length; j++) {
          const a = ring[j],
            b = ring[(j + 1) % ring.length],
            d = seg(pt, a, b);
          if (d < best) {
            best = d;
            line = [a, b];
          }
        }
        const [a, b] = line,
          L = dist(a, b),
          nx = -(b.y - a.y) / L,
          ny = (b.x - a.x) / L;
        let lo = Infinity,
          hi = -Infinity,
          count = 0;
        for (let p = 3; p < data.length; p += 4)
          if (data[p] >= 128) {
            const px = ((((p >> 2) % w) + 0.5 - w / 2) / z) * k,
              py = ((Math.floor((p >> 2) / w) + 0.5 - w / 2) / z) * k;
            const h = (pt.x + px - a.x) * nx + (pt.y + py - a.y) * ny;
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
            count++;
          }
        assert(count > 0);
        stats[size].marks++;
        const offset = Math.abs((lo + hi) / 2);
        if (offset > stats[size].maxAxis) {
          stats[size].worstOperator = [pageNumber, i];
          stats[size].maxAxis = offset;
        }
      }
    if (cut) {
      state.clips = [...state.clips, cut];
      cut = undefined;
    }
    pending = undefined;
  }
  for (const [size, { ctx }] of Object.entries(frames)) {
    const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height),
      pxPerMm = scale / k;
    for (const p of dense[size]) {
      const [x, y] = Util.applyTransform([(p.x - pose.e) / k, (p.y - pose.f) / k], view.transform);
      const radius = Math.ceil(Math.min(6, p.gap) * pxPerMm) + 1;
      if (x < -radius || y < -radius || x >= data.width + radius || y >= data.height + radius)
        continue;
      let best = p.gap;
      for (
        let iy = Math.max(0, Math.floor(y) - radius);
        iy <= Math.min(data.height - 1, Math.ceil(y) + radius);
        iy++
      )
        for (
          let ix = Math.max(0, Math.floor(x) - radius);
          ix <= Math.min(data.width - 1, Math.ceil(x) + radius);
          ix++
        )
          if (data.data[4 * (iy * data.width + ix) + 3] >= 128)
            best = Math.min(best, Math.hypot(ix + 0.5 - x, iy + 0.5 - y) / pxPerMm);
      p.gap = best;
    }
  }
}
await doc.destroy();
const raw = dxf && new DxfParser().parseSync(readFileSync(dxf, 'utf8'));
const norm = (r) => {
  const x = Math.min(...r.map((p) => p.x)),
    y = Math.min(...r.map((p) => p.y));
  return r.map((p) => ({ x: p.x - x, y: p.y - y }));
};
for (const [size, c] of Object.entries(cells)) {
  const info = stats[size],
    d = dense[size].map((p) => p.gap).sort((a, b) => a - b);
  assert.equal(info.marks, c.printedMotif.paths.length);
  info.samples = d.length;
  info.maxInk = d.at(-1);
  const peak = dense[size].find((p) => p.gap === info.maxInk);
  const nearest = c.printedMotif.paths
    .map((id) => now.sheet.paths[id])
    .map((p) => ({
      page: p.src.page + 1,
      op: p.src.op,
      pts: p.pts.length,
      min: Math.min(...p.pts.map((q) => dist(q, peak))),
    }))
    .sort((a, b) => a.min - b.min);
  info.peak = { x: peak.x, y: peak.y, nearest: nearest.slice(0, 4) };

  info.p95Ink = d[Math.floor(d.length * 0.95)];
  if (raw) {
    const entities = (hand) => raw.blocks['FP_' + hand + '_' + size].entities;
    const cut = (es) =>
      es
        .filter((e) => e.type === 'POLYLINE' && String(e.layer) === '1' && e.shape)
        .sort((a, b) => b.vertices.length - a.vertices.length)[0].vertices;
    const left = cut(entities('L')),
      right = cut(entities('R'));
    const grain = entities('L').find((e) => e.type === 'LINE' && String(e.layer) === '7').vertices,
      [a, b] = grain,
      x = b.x - a.x,
      y = b.y - a.y;
    const mirrored = c.outer.map((p) => {
      const q = (p.x * x + p.y * y) / (x * x + y * y);
      return { x: 2 * q * x - p.x, y: 2 * q * y - p.y };
    });
    info.leftDxf = perimeterError(norm(c.outer), norm(left));
    info.rightDxf = perimeterError(norm(mirrored), norm(right));
  }
  // At the widest white interval on 2XL, page 38 changes direction between four
  // circular stamps. Independently intersect those two raw PDF pen directions.
  if (size === '2XL') {
    const [a, b, c, d] = [1494, 1499, 1517, 1522].map((i) => cornerDots.get(i));
    const x = b.x - a.x,
      y = b.y - a.y,
      u = d.x - c.x,
      v = d.y - c.y;
    const t = ((c.x - a.x) * v - (c.y - a.y) * u) / (x * v - y * u);
    const corner = { x: a.x + t * x, y: a.y + t * y };
    info.peakCornerError = dist(peak, corner);
    assert(info.peakCornerError < 0.12);
  }
  console.log(size, JSON.stringify(info));
  // The printed repeats measure 2.31, 6.71 and 6.66 mm in the three legend samples.
  const pitch = { XS: 2.31, L: 6.71, '2XL': 6.66 }[size];
  assert(info.maxInk < pitch && info.maxAxis < 0.35);
  if (raw) assert(info.leftDxf < 0.02 && info.rightDxf < 0.02);
}
