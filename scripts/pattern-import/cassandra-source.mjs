import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const dir = process.argv[2],
  { pdf } = JSON.parse(fs.readFileSync(dir + '/case.json')),
  s = deserialize(gunzipSync(fs.readFileSync(dir + '/session.v8.gz')));
const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(pdf)), verbosity: 0 }).promise,
  rows = [],
  paints = new Map();
assert.equal(
  createHash('sha256').update(fs.readFileSync(pdf)).digest('hex'),
  '14c504160751d325c61ad6fdbe84d3b7c64fb0dc0917649514b8ed8bb7b143ad',
);
for (const pageNum of [4, 5, 6, 7]) {
  const p = await doc.getPage(pageNum),
    ol = await p.getOperatorList(),
    pose = s.sheet.poses.find((v) => v.page === pageNum - 1).toSheet;
  let m = [1, 0, 0, 1, 0, 0],
    clips = [],
    stack = [],
    path,
    pending;
  const coord = (xy, mat) => {
    const [u, v] = Util.applyTransform(xy, mat),
      x = ((u - p.view[0]) * 25.4) / 72,
      y = ((v - p.view[1]) * 25.4) / 72;
    return [pose.a * x + pose.c * y + pose.e, pose.b * x + pose.d * y + pose.f];
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i],
      a = ol.argsArray[i];
    if (fn === OPS.save) stack.push([m, clips]);
    else if (fn === OPS.restore) [m, clips] = stack.pop();
    else if (fn === OPS.transform) m = Util.transform(m, a);
    else if (fn === OPS.constructPath) {
      path = { op: i, ops: [...a[0]], xy: [...a[1]], m };
    } else if (fn === OPS.clip || fn === OPS.eoClip) pending = path;
    else if (
      [
        OPS.endPath,
        OPS.stroke,
        OPS.closeStroke,
        OPS.fill,
        OPS.eoFill,
        OPS.fillStroke,
        OPS.eoFillStroke,
        OPS.closeFillStroke,
        OPS.closeEOFillStroke,
      ].includes(fn)
    ) {
      if (fn !== OPS.endPath && path) {
        const q = path;
        const pts = q.ops.every((o) => [OPS.moveTo, OPS.lineTo, OPS.closePath].includes(o))
          ? Array.from({ length: q.xy.length / 2 }, (_, k) =>
              coord(q.xy.slice(2 * k, 2 * k + 2), q.m),
            )
          : [];
        paints.set(pageNum + '/' + i, { pts, fn, clips: [...clips] });
      }
      if (pending) {
        let q = pending,
          points = [];
        if (q.ops.length === 1 && q.ops[0] === OPS.rectangle) {
          const [x, y, w, h] = q.xy;
          points = [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ].map((pt) => coord(pt, q.m));
        } else if (q.ops.every((o) => [OPS.moveTo, OPS.lineTo, OPS.closePath].includes(o)))
          for (let k = 0; k < q.xy.length; k += 2) points.push(coord(q.xy.slice(k, k + 2), q.m));
        let row = { page: pageNum, op: q.op, points, ops: q.ops.length, paints: [] };
        rows.push(row);
        clips = [...clips, row];
        pending = undefined;
      } else if (fn !== OPS.endPath && clips.length) clips.at(-1).paints.push(i);
    }
  }
}
const after = process.argv[3],
  loaded = deserialize(gunzipSync(fs.readFileSync(after + '/session.v8.gz')));
const final = async (state, d) =>
  (await import(pathToFileURL(resolve(dirname(d), 'replay-runtime.mjs')))).finalizePieces(
    state,
    JSON.parse(fs.readFileSync(d + '/native.json')).structuralEdits,
  );
const [beforeCells, afterCells] = await Promise.all([final(s, dir), final(loaded, after)]);
const old = beforeCells[0].candidates,
  now = afterCells[0].candidates;
for (const c of old.filter((c) => c.outcome === 'closed'))
  assert.deepEqual(now.find((q) => q.rank === c.rank).outer, c.outer);
const avg = (pts) =>
  pts.reduce((v, p) => [v[0] + p[0] / pts.length, v[1] + p[1] / pts.length], [0, 0]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]],
  dot = (a, b) => a[0] * b[0] + a[1] * b[1],
  det = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(...sub(a, b));
function intersect([a, b], [c, d]) {
  const u = sub(b, a),
    v = sub(d, c),
    t = det(sub(c, a), v) / det(u, v);
  return [a[0] + t * u[0], a[1] + t * u[1]];
}
function corner(page, ops) {
  const [a, b] = ops.map((op) => rows.find((r) => r.page === page && r.op === op).points);
  const seam = a.filter((p) => b.some((q) => dist(p, q) < 0.003));
  assert.equal(seam.length, 2);
  return avg(seam);
}
const pairSets = {
  2: [5, [2354, 2384, 2414, 2444], [2153, 2183, 2213, 2243]],
  6: [5, [3657, 3687, 3717, 3747], [3306, 3336, 3366, 3396]],
  18: [4, [2176, 2197, 2218, 2239], [6187, 6207, 6227, 6247]],
  24: [4, [2746, 2772, 2798, 2824], [6940, 6965, 6990, 7015]],
  26: [4, [3366, 3387, 3408, 3429], [7850, 7870, 7890, 7910]],
};
const direct = {
  0: [
    [
      [5, 1036],
      [7, 884],
    ],
    [
      [7, 874],
      [7, 689],
    ],
    [
      [7, 675],
      [5, 651],
    ],
    [
      [5, 1235],
      [5, 1145],
    ],
    [
      [5, 1140],
      [5, 1050],
    ],
  ],
  10: [
    [
      [5, 4698],
      [7, 4177],
    ],
    [
      [7, 4149],
      [7, 3840],
    ],
    [
      [7, 3812],
      [5, 3910],
    ],
    [
      [4, 1189],
      [4, 1049],
    ],
    [
      [4, 1021],
      [4, 881],
    ],
  ],
};
function reference(label) {
  if (direct[label]) {
    const axes = direct[label].map((pair) =>
      pair.map((id) => {
        const { pts, fn } = paints.get(id.join('/'));
        if (label === '10') {
          assert.equal(fn, OPS.stroke);
          assert.equal(pts.length, 2);
          return avg(pts);
        }
        assert.equal(fn, OPS.fill);
        assert.equal(pts.length, 3);
        const tri = pts
          .map((a, i) => [a, pts[(i + 1) % 3], pts[(i + 2) % 3]])
          .sort((a, b) => dist(b[0], b[1]) - dist(a[0], a[1]))[0];
        return avg([avg(tri.slice(0, 2)), tri[2]]);
      }),
    );
    return axes.map((a, i) => intersect(axes[(i + 4) % 5], a));
  }
  const [page, left, right] = pairSets[label];
  const bl = corner(page, left.slice(0, 2)),
    tl = corner(page, left.slice(2)),
    tr = corner(7, right.slice(0, 2)),
    br = corner(7, right.slice(2));
  const far = (op, at) =>
    avg(
      rows
        .find((r) => r.page === page && r.op === op)
        .points.slice()
        .sort((a, b) => dist(b, at) - dist(a, at))
        .slice(0, 2),
    );
  return [bl, br, tr, tl, intersect([bl, far(left[1], bl)], [tl, far(left[2], tl)])];
}
function directed(a, b) {
  let max = 0;
  for (let i = 0; i < a.length; i++) {
    const p = a[i],
      q = a[(i + 1) % a.length],
      n = Math.ceil(dist(p, q) / 0.1);
    for (let k = 0; k < n; k++) {
      const t = k / n,
        x = [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      const best = Math.min(
        ...b.map((u, j) => {
          const v = b[(j + 1) % b.length],
            w = sub(v, u),
            h = Math.max(0, Math.min(1, dot(sub(x, u), w) / dot(w, w)));
          return dist(x, [u[0] + h * w[0], u[1] + h * w[1]]);
        }),
      );
      max = Math.max(max, best);
    }
  }
  return max;
}
const results = {};
for (const c of old.filter((c) => c.outcome === 'leak')) {
  const label = s.run.sizes[c.rank].label,
    ref = reference(label),
    nc = now.find((q) => q.rank === c.rank);
  const actual = nc.outer.map((p) => [p.x, p.y]);
  const evidence = nc.printedMotif;
  const groups = ref.map(() => new Map());
  for (const id of evidence?.paths ?? []) {
    const p = loaded.sheet.paths[id],
      pg = p.src.page + 1,
      op = p.src.op,
      src = paints.get(pg + '/' + op);
    assert(src && [OPS.fill, OPS.stroke, OPS.eoFill, OPS.closeStroke].includes(src.fn));
    assert(
      src.clips.every((clip) => clip.ops === 1),
      'mask beyond rectangular visibility proof',
    );
    const center = avg(p.pts.map((v) => [v.x, v.y]));
    const ds = ref.map((a, i) => {
      const b = ref[(i + 1) % ref.length],
        w = sub(b, a),
        t = Math.max(0, Math.min(1, dot(sub(center, a), w) / dot(w, w)));
      return dist(center, [a[0] + t * w[0], a[1] + t * w[1]]);
    });
    const g = groups[ds.indexOf(Math.min(...ds))];
    (g.get(pg) ?? g.set(pg, []).get(pg)).push(op);
  }
  const shape = groups.map((g) =>
    [...g]
      .sort(([a], [b]) => a - b)
      .map(([page, ops]) => ({ page, ops: ops.sort((a, b) => a - b) })),
  );
  const key = evidence?.key.map((id) => loaded.sheet.paths[id].src.op).sort((a, b) => a - b);
  results[label] = {
    reference: ref,
    key,
    source: shape,
    marks: evidence?.paths.length,
    outcome: nc.outcome,
    area: nc.areaMm2,
    PDFtoCut: actual.length ? directed(ref, actual) : null,
    cutToPDF: actual.length ? directed(actual, ref) : null,
  };
}
assert.equal(old.filter((c) => c.outcome === 'closed').length, 11);
assert.equal(Object.keys(results).length, 7);
for (const r of Object.values(results)) {
  assert.equal(r.outcome, 'closed');
  assert(r.PDFtoCut < 0.005 && r.cutToPDF < 0.005);
  assert(r.source.every((side) => side.length));
}
if (process.argv[5]) {
  const W = 1036,
    H = 442,
    canvas = createCanvas(W, H),
    ctx = canvas.getContext('2d'),
    K = 9,
    x0 = 117,
    y1 = 1732;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, W, H);
  const X = (x) => (x - x0) * K,
    Y = (y) => 64 + (y1 - y) * K;
  for (const pageNum of [4, 5]) {
    const page = await doc.getPage(pageNum),
      view = page.getViewport({ scale: 3.2 }),
      buf = createCanvas(Math.ceil(view.width), Math.ceil(view.height));
    await page.render({ canvasContext: buf.getContext('2d'), viewport: view }).promise;
    const pose = s.sheet.poses.find((p) => p.page === pageNum - 1);
    ctx.save();
    ctx.beginPath();
    const lo = pageNum === 4 ? 0 : X(203.2),
      hi = pageNum === 4 ? X(203.2) : W;
    ctx.rect(lo, 64, hi - lo, H - 85);
    ctx.clip();
    ctx.drawImage(
      buf,
      X(pose.toSheet.e),
      Y(pose.toSheet.f + pose.heightMm),
      pose.widthMm * K,
      pose.heightMm * K,
    );
    ctx.restore();
  }
  ctx.font = 'bold 21px sans-serif';
  ctx.fillStyle = '#222';
  ctx.fillText('Cassandra A · продолжение среза через пересечение · стр. 4–5', 14, 27);
  for (const c of now.filter((c) => c.printedMotif)) {
    const label = loaded.run.sizes[c.rank].label,
      min = c.outer.reduce((p, q) => (q.x < p.x ? q : p));
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 64, W, H - 85);
    ctx.clip();
    ctx.beginPath();
    c.outer.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.lineWidth = 1.55;
    ctx.strokeStyle = '#008b98';
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#006671';
    ctx.font = 'bold 17px sans-serif';
    ctx.fillText(label, X(min.x + 2.2) - 6, 58);
  }
  ctx.fillStyle = '#333';
  ctx.font = '14px sans-serif';
  ctx.fillText('Чёрный — оригинал PDF. Бирюзовый — финализированный контур.', 14, H - 3);
  fs.writeFileSync(process.argv[5], canvas.toBuffer('image/png'));
}
fs.writeFileSync(process.argv[4], JSON.stringify(results, null, 2));
await doc.destroy();
