#!/usr/bin/env node
// PAINT THE PARTS · T15 — the magnetic pen on a real flat (the shirt back c49-p112 at 1600 px):
// two clicks on one seam follow the ink, a 20 px gap is crossed straight, timing per segment.
//   node scripts/paint-pen-probe.mjs     (DEBUG=<file.png> writes the traced yoke over the flat)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `paint-pen-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-pen-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
  },
});
const m = await import(pathToFileURL(outfile).href);
let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

/** The flat scaled nearest-neighbour so its long side is `side` (the canvas cap). */
function rgbaOf(name, side) {
  const p = m.decodePng(
    readFileSync(resolve(REPO, `../tmp/plans/paint-parts/f0/flats/${name}.png`)),
  );
  const s = side / Math.max(p.width, p.height);
  const w = Math.round(p.width * s);
  const h = Math.round(p.height * s);
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = Math.min(p.width - 1, Math.floor((x + 0.5) / s));
      const sy = Math.min(p.height - 1, Math.floor((y + 0.5) / s));
      const i = sy * p.width + sx;
      const g = (c) => p.data[i * p.channels + c];
      px.set(p.channels >= 3 ? [g(0), g(1), g(2), 255] : [g(0), g(0), g(0), 255], (y * w + x) * 4);
    }
  return { rgba: px, w, h, s };
}

/** Points every 1 px along a polyline. */
function sample(path) {
  const out = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k],
      b = path[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let j = 0; j < n; j++)
      out.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
  }
  out.push(path[path.length - 1]);
  return out;
}
const onInkShare = (f, path, tol = 2) => {
  const pts = sample(path);
  let on = 0;
  for (const p of pts) if (f.d[Math.floor(p.y) * f.w + Math.floor(p.x)] <= tol) on++;
  return on / pts.length;
};
const timed = (fn) => {
  const t = performance.now();
  const r = fn();
  return [r, performance.now() - t];
};

const SIDE = 1600;
const { rgba, w, h, s } = rgbaOf('c49-p112', SIDE);
const [flat, tA] = timed(() => m.analyseFlat(rgba, w, h));
const [field, tF] = timed(() => m.inkField(flat));
console.log(
  `  back ${w}x${h} (×${s.toFixed(2)}): regions ${tA.toFixed(0)} ms, ink field ${tF.toFixed(0)} ms`,
);

/** The first ink row in a column between y0..y1 (sheet px of the 807 original, scaled). */
const inkIn = (x0, y0, y1) => {
  const x = Math.round(x0 * s);
  for (let y = Math.round(y0 * s); y <= Math.round(y1 * s); y++)
    if (flat.ink[y * w + x]) return { x: x + 0.5, y: y + 0.5 };
  return null;
};
const inkInRow = (y0, x0, x1) => {
  const y = Math.round(y0 * s);
  for (let x = Math.round(x0 * s); x <= Math.round(x1 * s); x++)
    if (flat.ink[y * w + x]) return { x: x + 0.5, y: y + 0.5 };
  return null;
};

const seg = (f, a, b, prev) => {
  const lw = new m.LiveWire(f, a, prev);
  const [ok, t] = timed(() => lw.expand(b));
  return { lw, ok, t, path: ok ? lw.pathTo(b) : [] };
};
const times = [];

// 1. Two clicks on the back yoke seam (one 4 px off the line: it snaps).
{
  const a = m.snapToInk(field, { x: inkIn(300, 150, 220).x, y: inkIn(300, 150, 220).y + 4 });
  const b = m.snapToInk(field, inkIn(500, 150, 220));
  ck(
    field.d[Math.floor(a.y) * w + Math.floor(a.x)] === 0,
    'a vertex 4 px off the seam snaps onto it',
    JSON.stringify(a),
  );
  const r = seg(field, a, b);
  times.push(r.t);
  const share = onInkShare(field, r.path);
  ck(
    r.ok && share >= 0.9,
    'yoke seam: the path lies on ink (≥90 % within 2 px)',
    `${(share * 100).toFixed(1)} %, ${r.path.length} pts, ${r.t.toFixed(1)} ms, ${r.lw.settledCount} px settled`,
  );
}
// 2. A curved outline: the left side of the back from the shoulder down the sleeve.
{
  const a = m.snapToInk(field, inkInRow(150, 0, 400));
  const b = m.snapToInk(field, inkInRow(400, 0, 400));
  const r = seg(field, a, b);
  times.push(r.t);
  const share = onInkShare(field, r.path);
  const chord = onInkShare(field, [a, b]);
  ck(
    r.ok && share >= 0.9 && chord < 0.5,
    'curved outline: on ink, where the chord is not',
    `path ${(share * 100).toFixed(1)} % vs chord ${(chord * 100).toFixed(1)} %, ${r.path.length} pts, ${r.t.toFixed(1)} ms`,
  );
}
// 3. A 20 px gap cut into the yoke seam is crossed straight.
{
  const y0 = inkIn(410, 150, 220).y;
  const gx0 = Math.round(410 * s);
  const ink = flat.ink.slice();
  for (let y = Math.floor(y0) - 4; y <= Math.floor(y0) + 14; y++)
    for (let x = gx0; x < gx0 + 20; x++) ink[y * w + x] = 0;
  const gf = m.inkField({ ink, w, h });
  const a = m.snapToInk(gf, inkIn(340, 150, 220));
  const b = m.snapToInk(gf, inkIn(480, 150, 220));
  const r = seg(gf, a, b);
  times.push(r.t);
  // The ends of the gap on the line: the last path points before / after it.
  const pts = sample(r.path);
  const inGap = pts.filter((p) => p.x >= gx0 && p.x <= gx0 + 20);
  const L = r.path.filter((p) => p.x <= gx0).pop();
  const R = r.path.find((p) => p.x >= gx0 + 20);
  const off = Math.max(
    ...inGap.map(
      (p) =>
        Math.abs((p.x - L.x) * (R.y - L.y) - (p.y - L.y) * (R.x - L.x)) /
        Math.hypot(R.x - L.x, R.y - L.y),
    ),
  );
  const dy = Math.abs(L.y - R.y);
  ck(
    r.ok && inGap.length >= 19 && off <= 0.5 && dy <= 4 && Math.abs(L.y - y0) <= 8,
    'a 20 px gap in the seam (and its stitching): straight across, on the seam line',
    `${inGap.length} pts in the gap, off chord ${off.toFixed(2)} px, gap ends ${JSON.stringify([L, R])}; whole path on ink ${(onInkShare(gf, r.path) * 100).toFixed(1)} %`,
  );
}
// 4. Synthetic: a horizontal line with a 20 px gap, clicks on the stubs; and plain paper.
{
  const W = 400,
    H = 200;
  const ink = new Uint8Array(W * H);
  for (let x = 50; x < 350; x++)
    if (x < 190 || x >= 210) for (let y = 99; y <= 101; y++) ink[y * W + x] = 1;
  const sf = m.inkField({ ink, w: W, h: H });
  const r = seg(sf, { x: 60.5, y: 100.5 }, { x: 340.5, y: 100.5 });
  ck(
    r.ok && r.path.every((p) => Math.abs(p.y - 100.5) < 1e-6),
    'synthetic gap: one straight line',
    JSON.stringify(r.path),
  );
  const a = m.snapToInk(sf, { x: 30.5, y: 20.5 });
  const b = m.snapToInk(sf, { x: 370.5, y: 60.5 });
  ck(
    !m.magnetic(sf, a, b),
    'clicks on paper (40 px from a line): a straight segment, not pulled to it',
  );
}
// 5. Timing at 1600: the yoke traced with 4 clicks (cold segments), and a cursor sweeping along
//    the seam in 6 px steps (the live preview's incremental cost per move).
{
  const o = (x, y) => m.snapToInk(field, { x: x * s, y: y * s });
  const clicks = [o(194, 178), o(622, 181), o(520, 71), o(330, 70)];
  console.log(`  yoke clicks ${JSON.stringify(clicks)}`);
  let prev;
  const seg4 = [];
  for (let k = 0; k < clicks.length; k++) {
    const a = clicks[k],
      b = clicks[(k + 1) % clicks.length];
    const r = seg(field, a, b, prev);
    prev = r.lw;
    seg4.push(r.t);
    times.push(r.t);
    console.log(
      `  yoke segment ${k + 1}: ${r.t.toFixed(1)} ms, ${r.lw.settledCount} px, ${r.path.length} pts, on ink ${(onInkShare(field, r.path) * 100).toFixed(0)} %`,
    );
  }
  const lw = new m.LiveWire(field, clicks[1], prev);
  const moves = [];
  for (let x = 262; x <= 560; x += 6 / s) {
    const p = m.snapToInk(field, inkIn(x, 150, 220) ?? { x: x * s, y: 171 * s });
    const [, t] = timed(() => {
      lw.expand(p);
      lw.pathTo(p);
    });
    moves.push(t);
  }
  moves.sort((a, b) => a - b);
  const p95 = moves[Math.floor(moves.length * 0.95)];
  console.log(
    `  cursor sweep: ${moves.length} moves, median ${moves[moves.length >> 1].toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${moves[moves.length - 1].toFixed(1)} ms`,
  );
  // The worst: a cold segment across the whole sheet (corner to corner of the garment).
  const far = seg(
    field,
    m.snapToInk(field, inkInRow(150, 0, 400)),
    m.snapToInk(field, inkInRow(780, 600, 807)),
    prev,
  );
  console.log(
    `  worst cold segment (shoulder → opposite hem): ${far.t.toFixed(1)} ms, ${far.lw.settledCount} px settled`,
  );
  times.sort((a, b) => a - b);
  console.log(
    `  cold segments: median ${times[times.length >> 1].toFixed(1)} ms, max ${times[times.length - 1].toFixed(1)} ms`,
  );
  // The closed yoke fills the yoke region.
  const ring = [];
  for (let k = 0; k < clicks.length; k++) {
    const r = seg(field, clicks[k], clicks[(k + 1) % clicks.length]);
    ring.push(...r.path.slice(k ? 1 : 0));
  }
  // Coverage of the yoke region away from the lines (the ink and its white halo hide the rest).
  const idx = m.polygonIndices(ring, flat.silhouette, w, h);
  const yoke = flat.labels[Math.round(120 * s) * w + Math.round(400 * s)];
  const inPoly = new Uint8Array(w * h);
  for (const i of idx) inPoly[i] = 1;
  let body = 0,
    got = 0,
    spill = 0;
  for (let i = 0; i < w * h; i++) {
    if (flat.labels[i] === yoke && field.d[i] > 3 * field.unit) {
      body++;
      if (inPoly[i]) got++;
    } else if (
      inPoly[i] &&
      flat.labels[i] &&
      flat.labels[i] !== yoke &&
      field.d[i] > 3 * field.unit
    )
      spill++;
  }
  ck(
    got / body > 0.98 && spill / idx.length < 0.02,
    'four clicks round the yoke fill the yoke region',
    `${idx.length} px, yoke body covered ${((got / body) * 100).toFixed(1)} %, spill ${((spill / idx.length) * 100).toFixed(2)} %, ${ring.length} pts`,
  );
}

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
