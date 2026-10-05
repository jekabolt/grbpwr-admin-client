#!/usr/bin/env node
// PAINT THE PARTS · T28 — a saved map's paint carried onto a replaced flat (re-scaled, shifted,
// a square with margins): every painted part lands on its own region of the new flat.
//   node scripts/paint-transfer-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `paint-transfer-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-transfer-entry.ts')],
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

/* ── synthetic: a 400×500 garment — yoke on top, body split left | right, a round pocket ── */
// Design space: outline [0,400]×[0,500], yoke line y=150, split x=200 below it, pocket (100,350) r50.
function drawing(W, H, ox, oy, k) {
  const rgba = new Uint8ClampedArray(W * H * 4).fill(255);
  const t = 2.5; // half a line, px on the sheet
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5 - ox) / k;
      const v = (y + 0.5 - oy) / k;
      const d = t / k;
      const inX = u >= -d && u <= 400 + d;
      const inY = v >= -d && v <= 500 + d;
      let ink = false;
      if (inY && (Math.abs(u) <= d || Math.abs(u - 400) <= d)) ink = true;
      if (inX && (Math.abs(v) <= d || Math.abs(v - 500) <= d)) ink = true;
      if (inX && Math.abs(v - 150) <= d) ink = true;
      if (v >= 150 && v <= 500 && Math.abs(u - 200) <= d) ink = true;
      if (Math.abs(Math.hypot(u - 100, v - 350) - 50) <= d) ink = true;
      if (ink) {
        const p = (y * W + x) * 4;
        rgba[p] = rgba[p + 1] = rgba[p + 2] = 0;
      }
    }
  return rgba;
}
const PTS = { yoke: [200, 75], left: [60, 250], right: [300, 300], pocket: [100, 350] };
const at = (flat, ox, oy, k, [u, v]) => {
  const x = Math.floor(ox + u * k);
  const y = Math.floor(oy + v * k);
  return y * flat.w + x;
};
const regionPaint = (flat, labels, i, value) => {
  const r = flat.labels[i];
  for (let j = 0; j < labels.length; j++) if (flat.labels[j] === r) labels[j] = value;
  return r;
};

const A = m.packHex('#c0392b');
const B = m.packHex('#2e86c1');
const C = m.packHex('#27ae60');
{
  const O = { W: 1000, H: 1000, ox: 300, oy: 250, k: 1 };
  const oldFlat = m.analyseFlat(drawing(O.W, O.H, O.ox, O.oy, O.k), O.W, O.H);
  console.log(`  old flat ${O.W}x${O.H}: ${oldFlat.count} regions`);
  const old = new Uint32Array(O.W * O.H);
  const rs = new Set([
    regionPaint(oldFlat, old, at(oldFlat, O.ox, O.oy, O.k, PTS.yoke), A),
    regionPaint(oldFlat, old, at(oldFlat, O.ox, O.oy, O.k, PTS.left), B),
    regionPaint(oldFlat, old, at(oldFlat, O.ox, O.oy, O.k, PTS.pocket), C),
  ]);
  ck(rs.size === 3 && !rs.has(0), 'old: yoke, left body, pocket are three regions');
  const { rgba, palette } = m.mapPixels(old, oldFlat.ink, O.W, O.H);
  const pal = palette.map((s) => s.hex);

  // The new flat: the same drawing ×1.8, shifted off centre, in a 1200 square with margins.
  for (const N of [
    { W: 1200, H: 1200, ox: 280, oy: 150, k: 1.8 },
    { W: 800, H: 800, ox: 200, oy: 120, k: 1.1 },
    { W: 1400, H: 1000, ox: 700, oy: 60, k: 1.7 },
  ]) {
    const flat = m.analyseFlat(drawing(N.W, N.H, N.ox, N.oy, N.k), N.W, N.H);
    const got = m.transferMap({ rgba, w: O.W, h: O.H, palette: pal }, flat);
    const tag = `${N.W}x${N.H} ×${N.k} @${N.ox},${N.oy}`;
    ck(!!got, `${tag}: carried`, `${flat.count} regions`);
    if (!got) continue;
    const L = (p) => got.labels[at(flat, N.ox, N.oy, N.k, p)];
    ck(L(PTS.yoke) === A, `${tag}: yoke keeps its label`);
    ck(L(PTS.left) === B, `${tag}: left body keeps its label`);
    ck(L(PTS.pocket) === C, `${tag}: pocket keeps its label`);
    ck(L(PTS.right) === 0, `${tag}: right body stays unpainted`);
    ck(got.painted === 3, `${tag}: exactly three regions painted`, String(got.painted));
    let onInk = 0;
    for (let i = 0; i < got.labels.length; i++) if (got.labels[i] && flat.ink[i]) onInk++;
    ck(onInk === 0, `${tag}: nothing painted on the ink`);
  }

  // Empty old map / blank new flat → nothing to carry.
  const blank = m.mapPixels(new Uint32Array(O.W * O.H), oldFlat.ink, O.W, O.H);
  ck(
    m.transferMap({ rgba: blank.rgba, w: O.W, h: O.H, palette: [] }, oldFlat) === null,
    'an unpainted old map carries nothing',
  );
}

/* ── a real flat: painted, then the same flat shrunk into a padded square ── */
const FLAT = resolve(REPO, '../tmp/plans/paint-parts/f0/flats/c38-p105.png');
if (existsSync(FLAT)) {
  const png = m.decodePng(readFileSync(FLAT));
  const { width: w, height: h } = png;
  const ch = png.channels;
  const src = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const g = (c) => png.data[i * ch + c];
    const px =
      ch >= 3
        ? [g(0), g(1), g(2), ch === 4 ? g(3) : 255]
        : [g(0), g(0), g(0), ch === 2 ? g(1) : 255];
    src.set(px, i * 4);
  }
  const oldFlat = m.analyseFlat(src, w, h);
  // Paint the four biggest regions.
  const size = new Int32Array(oldFlat.count + 1);
  for (const r of oldFlat.labels) size[r]++;
  const big = [...size.keys()]
    .filter((r) => r > 0)
    .sort((a, b) => size[b] - size[a])
    .slice(0, 4);
  const hexes = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad'].map(m.packHex);
  const old = new Uint32Array(w * h);
  for (let i = 0; i < old.length; i++) {
    const k = big.indexOf(oldFlat.labels[i]);
    if (k >= 0) old[i] = hexes[k];
  }
  const { rgba, palette } = m.mapPixels(old, oldFlat.ink, w, h);
  // New: a square, side = 1.15 × long side, the flat at 0.8× (nearest), off centre.
  const S = Math.round(Math.max(w, h) * 1.15);
  const k = 0.8;
  const nw = Math.round(w * k);
  const nh = Math.round(h * k);
  const ox = Math.round((S - nw) / 3);
  const oy = Math.round((S - nh) / 2);
  const dst = new Uint8ClampedArray(S * S * 4).fill(255);
  for (let y = 0; y < nh; y++)
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, Math.floor((x + 0.5) / k));
      const sy = Math.min(h - 1, Math.floor((y + 0.5) / k));
      const s = (sy * w + sx) * 4;
      const d = ((y + oy) * S + (x + ox)) * 4;
      // composite over white
      const a = src[s + 3] / 255;
      for (let c = 0; c < 3; c++) dst[d + c] = Math.round(src[s + c] * a + 255 * (1 - a));
    }
  const flat = m.analyseFlat(dst, S, S);
  const t0 = Date.now();
  const got = m.transferMap({ rgba, w, h, palette: palette.map((s) => s.hex) }, flat);
  const ms = Date.now() - t0;
  ck(!!got, `real flat ${w}x${h} → ${S}² ×${k}: carried in ${ms} ms`, `${flat.count} regions`);
  if (got) {
    // Every old painted part: the new label at the image of its pixels agrees (by pixel share).
    for (let q = 0; q < big.length; q++) {
      let hit = 0;
      let n = 0;
      for (let i = 0; i < old.length; i += 7) {
        if (oldFlat.labels[i] !== big[q]) continue;
        const x = Math.floor((i % w) * k) + ox;
        const y = Math.floor(Math.floor(i / w) * k) + oy;
        const j = y * S + x;
        if (!flat.labels[j]) continue;
        n++;
        if (got.labels[j] === hexes[q]) hit++;
      }
      ck(
        n > 0 && hit / n > 0.9,
        `real flat: part ${q + 1} lands`,
        `${((100 * hit) / Math.max(1, n)).toFixed(1)} %`,
      );
    }
  }
} else console.log(`  skip real flat (${FLAT} not here)`);

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
