// Every source operation belonging to the original size-26 pen, rasterised under its own clips.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { draw, sourceFills } from './emma-pdf-marks.mjs';
const [pdf, before, after] = process.argv.slice(2);
const load = (p) => deserialize(gunzipSync(readFileSync(p)));
const old = load(before),
  now = load(after),
  doc = await getDocument({ data: new Uint8Array(readFileSync(pdf)), verbosity: 0 }).promise;
const source = old.set.chains[3639].ranges.map((r) => old.sheet.paths[r.path].src);

async function finalize(s, path) {
  const runtime = await import(pathToFileURL(resolve(dirname(path), '../replay-runtime.mjs')));
  const native = JSON.parse(readFileSync(resolve(dirname(path), 'native.json')));
  return runtime.finalizePieces(s, native.structuralEdits);
}
if (process.env.FINAL_CELLS) now.families = await finalize(now, after);
const cell = now.families[7].candidates.find((c) => now.run.sizes[c.rank].label === '26');
const ring = cell.outer,
  marks = [];
for (const index of new Set(source.map((s) => s.page))) {
  const page = await doc.getPage(index + 1),
    list = await page.getOperatorList();
  const ops = new Set(source.filter((s) => s.page === index).map((s) => s.op));
  const fills = sourceFills(list, ops),
    pose = old.sheet.poses.find((p) => p.page === index).toSheet;
  assert.equal(ops.size, fills.size);
  for (const [op, { path, clips }] of fills) {
    const center = Util.applyTransform([0, 0], path.matrix);
    const scale = 18,
      w = 240,
      ctx = createCanvas(w, w).getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, w / 2 - scale * center[0], w / 2 - scale * center[1]);
    for (const clip of clips) {
      draw(ctx, clip);
      ctx.clip(clip.rule);
    }
    draw(ctx, path);
    ctx.fill();
    const rgba = ctx.getImageData(0, 0, w, w).data;
    let wx = 0,
      wy = 0,
      weight = 0,
      minX = w,
      maxX = 0,
      minY = w,
      maxY = 0;
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const a = rgba[(y * w + x) * 4 + 3];
        if (!a) continue;
        assert(x > 0 && x < w - 1 && y > 0 && y < w - 1, 'audit crop');
        wx += a * (x + 0.5);
        wy += a * (y + 0.5);
        weight += a;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }
    if (!weight) continue;
    const px = ((center[0] + (wx / weight - w / 2) / scale - page.view[0]) * 25.4) / 72;
    const py = ((center[1] + (wy / weight - w / 2) / scale - page.view[1]) * 25.4) / 72;
    const x = pose.a * px + pose.c * py + pose.e,
      y = pose.b * px + pose.d * py + pose.f;
    const radius =
      ((Math.hypot(
        Math.max(wx / weight - minX, maxX - wx / weight),
        Math.max(wy / weight - minY, maxY - wy / weight),
      ) /
        scale) *
        25.4) /
      72;
    marks.push({ page: index + 1, op, x, y, radius });
  }
}
function ringDistance(p, target = ring) {
  let best = Infinity;
  for (let i = 0; i < target.length; i++) {
    const a = target[i],
      b = target[(i + 1) % target.length],
      dx = b.x - a.x,
      dy = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy) || 0),
    );
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
const errors = marks.map((p) => ({ ...p, d: ringDistance(p) })).sort((a, b) => b.d - a.d);
let largest = { d: 0 };
for (let i = 0; i < ring.length; i++) {
  const a = ring[i],
    b = ring[(i + 1) % ring.length],
    n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 0.1));
  for (let j = 0; j < n; j++) {
    const x = a.x + ((b.x - a.x) * j) / n,
      y = a.y + ((b.y - a.y) * j) / n;
    let best = Infinity;
    for (const p of marks) {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      best = Math.min(best, d);
      if (best <= largest.d ** 2) break;
    }
    if (best > largest.d ** 2) largest = { d: Math.sqrt(best), x, y };
  }
}
// The two incident printed axes pass through the consecutive full marks on either side.
const glyph = (op) => marks.find((p) => p.page === 12 && p.op === op);
const a = glyph(9695),
  b = glyph(9700),
  c = glyph(9035),
  d = glyph(9040);
const ux = b.x - a.x,
  uy = b.y - a.y,
  vx = d.x - c.x,
  vy = d.y - c.y;
const t = ((c.x - a.x) * vy - (c.y - a.y) * vx) / (ux * vy - uy * vx);
const corner = { x: a.x + t * ux, y: a.y + t * uy };
const keyPoint = (p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 4;
const localRing = ring.filter(keyPoint);
// Build a second perimeter using only positions of the visible PDF paint, without
// the candidate boundary. Accept an ordering only when every edge is reciprocal
// and the entire set forms one cycle.
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const links = marks.map((p, i) =>
  marks
    .map((q, j) => ({ j, d: i === j ? Infinity : dist(p, q) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 2)
    .map((x) => x.j),
);
const exceptions = links.flatMap((l, i) =>
  l
    .filter((j) => !links[j].includes(i))
    .map((j) => [marks[i].page, marks[i].op, marks[j].page, marks[j].op]),
);
const order = [],
  seen = new Set();
let prev = -1,
  cur = 0;
while (!seen.has(cur)) {
  seen.add(cur);
  order.push(marks[cur]);
  const next = links[cur].find((j) => j !== prev);
  prev = cur;
  cur = next;
}
function directed(from, to) {
  let max = 0;
  for (let i = 0; i < from.length; i++) {
    const a = from[i],
      b = from[(i + 1) % from.length],
      n = Math.max(1, Math.ceil(dist(a, b) / 0.1));
    for (let k = 0; k < n; k++)
      max = Math.max(
        max,
        ringDistance({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, to),
      );
  }
  return max;
}
const cycle = { exceptions, visited: order.length, closedAtStart: cur === 0 };
if (!exceptions.length && order.length === marks.length && cur === 0 && ring.length) {
  cycle.pdfToRing = directed(order, ring);
  cycle.ringToPdf = directed(ring, order);
}
// At the clipped elbow the two close half marks shorten the apparent pitch.
// Establish each incoming limb by order along its observed straight PDF axis.
const idx = (op) => marks.findIndex((p) => p.page === 12 && p.op === op);
links[idx(9035)] = [idx(9040), idx(9740)];
links[idx(9700)] = [idx(9695), idx(9715)];
assert(links.every((l, i) => l.every((j) => links[j].includes(i))));
const reference = [],
  visited = new Set();
prev = -1;
cur = 0;
while (!visited.has(cur)) {
  visited.add(cur);
  reference.push(marks[cur]);
  const next = links[cur].find((j) => j !== prev);
  if ([cur, next].includes(idx(9710)) && [cur, next].includes(idx(9730))) reference.push(corner);
  prev = cur;
  cur = next;
}
assert.equal(visited.size, marks.length);
assert.equal(cur, 0);
const perimeter = ring.length
  ? { pdfToRing: directed(reference, ring), ringToPdf: directed(ring, reference) }
  : null;
console.log(
  JSON.stringify(
    {
      outcome: cell.outcome,
      perimeter,
      cycle,
      cornerLinks: marks.flatMap((p, i) =>
        p.page === 12 && [9035, 9040, 9695, 9700, 9710, 9715, 9730, 9740].includes(p.op)
          ? [[p.op, ...links[i].map((j) => marks[j].op)]]
          : [],
      ),
      cornerIntersection: corner,
      cornerError: ringDistance(corner),
      localRing,
      inked: marks.length,
      original: source.length,
      worst: errors.slice(0, 8),
      corner: errors.filter((p) => p.page === 12 && p.op >= 9700 && p.op <= 9740),
      furthestToCenter: largest,
    },
    null,
    2,
  ),
);
if (process.env.OVERLAY) {
  const page = await doc.getPage(12),
    ops = new Set(source.filter((s) => s.page === 11).map((s) => s.op));
  const fills = sourceFills(await page.getOperatorList(), ops),
    m = old.sheet.poses.find((p) => p.page === 11).toSheet;
  const canvas = createCanvas(1000, 450),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 1000, 450);
  const scale = 61,
    pt = 25.4 / 72;
  const paint = (left, line, color, title) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, 48, 460, 340);
    ctx.clip();
    ctx.translate(left - scale * 530.5, 48 + scale * 670.5);
    ctx.scale(scale, -scale);
    for (const { path, clips } of fills.values()) {
      ctx.save();
      ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
      ctx.scale(pt, pt);
      ctx.translate(-page.view[0], -page.view[1]);
      for (const clip of clips) {
        draw(ctx, clip);
        ctx.clip(clip.rule);
      }
      draw(ctx, path);
      ctx.fillStyle = '#333333';
      ctx.fill();
      ctx.restore();
    }
    if (line.length) {
      ctx.beginPath();
      ctx.moveTo(line[0].x, line[0].y);
      for (const p of line.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.045;
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = 'bold 21px sans-serif';
    ctx.fillText(title, left, 32);
    ctx.fillStyle = '#333';
    ctx.fillRect(left, 406, scale, 3);
    ctx.font = '15px sans-serif';
    ctx.fillText('1 мм', left + scale + 7, 412);
  };
  paint(25, old.set.chains[3639].pts, '#b33c28', 'Исходная цепь 26');
  paint(515, ring, '#007887', 'Восстановленный срез B26');
  ctx.fillStyle = '#333';
  ctx.font = '15px sans-serif';
  ctx.fillText('Emma · стр. 12 · чёрным показаны видимые заливки исходного пера', 25, 438);
  writeFileSync(process.env.OVERLAY, canvas.toBuffer('image/png'));
}
await doc.destroy();
