#!/usr/bin/env node
// PAINT THE PARTS · T1 — the client port of the Ф0 region cutter against the Ф0 flats.
// Compares the region count at r = 3 with the Python probe (`f0/out/<flat>/report.txt`); ±20 % or
// ±2 regions passes (the probe resamples with LANCZOS and dilates with cv2's ellipse — near, not equal).
// v5 (M5): the count is INFO only — v5 joins band fragments and no longer folds channels into the
// body, so it departs from Ф0 by design; a cut of 0 or > 60 regions on a Ф0 flat still fails. The
// E5 rules themselves are gated by `paint-cut-probe.mjs`.
//
//   node scripts/paint-regions-probe.mjs [flats dir]
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, basename, extname } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const F0 = resolve(REPO, '../tmp/plans/paint-parts/f0');
const FLATS = process.argv[2] || resolve(F0, 'flats');
const outfile = resolve(tmpdir(), `paint-regions-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-regions-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: { components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib') },
});
const m = await import(pathToFileURL(outfile).href);

function rgbaOf(png) {
  const { width: w, height: h, channels, depth } = png;
  const src = png.data;
  const pal = png.palette;
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (i) => (depth === 16 ? src[i] >> 8 : src[i]);
  for (let p = 0; p < w * h; p += 1) {
    let r,
      g,
      b,
      a = 255;
    if (pal) {
      const c = pal[src[p]];
      [r, g, b] = c;
      if (c.length > 3) a = c[3];
    } else if (channels === 1 || channels === 2) {
      r = g = b = at(p * channels);
      if (channels === 2) a = at(p * 2 + 1);
    } else {
      r = at(p * channels);
      g = at(p * channels + 1);
      b = at(p * channels + 2);
      if (channels === 4) a = at(p * 4 + 3);
    }
    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = a;
  }
  return { w, h, data: out };
}

let bad = 0;
for (const file of readdirSync(FLATS).sort()) {
  if (extname(file).toLowerCase() !== '.png') {
    console.log(`  skip  ${file} (not a PNG)`);
    continue;
  }
  const name = basename(file, extname(file));
  const { w, h, data } = rgbaOf(m.decodePng(readFileSync(resolve(FLATS, file))));
  const t0 = performance.now();
  const r = m.analyseFlat(data, w, h, { r: 3 });
  const ms = Math.round(performance.now() - t0);
  const rep = resolve(F0, 'out', name, 'report.txt');
  const py = existsSync(rep)
    ? Number(/regions r=3: (\d+) parts/.exec(readFileSync(rep, 'utf8'))?.[1])
    : NaN;
  const near = Number.isNaN(py) || Math.abs(r.count - py) <= Math.max(2, py * 0.2);
  const ok = r.count >= 1 && r.count <= 60;
  // v3 ≡ v2 where the flat holds no FREE dashed line: the same cut, numbered the same (v5: the
  // stitching still stops the growth, so the cut — `raw` — is compared, not the grown labels).
  const v2 = m.analyseFlat(data, w, h, { r: 3, dashes: false });
  let same = v2.count === r.count;
  for (let i = 0; same && i < v2.raw.length; i += 1) same = v2.raw[i] === r.raw[i];
  const v2ok = (r.dashes ?? 0) > 0 || same;
  if (!v2ok) bad += 1;
  console.log(
    `${v2ok ? '  ok  ' : '  FAIL'} ${name.padEnd(16)} dashes ${String(r.dashes ?? 0).padStart(3)}  ${same ? 'v3 == v2' : `v3 != v2 (v2 ${v2.count} → v3 ${r.count})`}`,
  );
  if (!ok) bad += 1;
  console.log(
    `${ok ? (near ? '  ok  ' : '  info') : '  FAIL'} ${name.padEnd(16)} ${w}x${h}  ts ${String(r.count).padStart(3)}  py ${String(py).padStart(3)}  ${ms} ms`,
  );
}
// Speed at the canvas ceiling (1600 long side) on the busiest flat.
{
  const big = rgbaOf(m.decodePng(readFileSync(resolve(FLATS, 'c49-p95.png'))));
  const s = 1600 / Math.max(big.w, big.h);
  const W = Math.round(big.w * s),
    H = Math.round(big.h * s);
  const up = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      const sx = Math.min(big.w - 1, Math.floor(x / s)),
        sy = Math.min(big.h - 1, Math.floor(y / s));
      up.set(big.data.subarray((sy * big.w + sx) * 4, (sy * big.w + sx) * 4 + 4), (y * W + x) * 4);
    }
  const t0 = performance.now();
  const r = m.analyseFlat(up, W, H);
  console.log(
    `  1600 sheet ${W}x${H}: ${r.count} regions in ${Math.round(performance.now() - t0)} ms (r=${m.scaledRadius(W, H)})`,
  );
}
// v3 · DASHES (tmp/plans/flat-consistency/l5.py): the front view of a flare sheet whose inner V layer
// is drawn as a light dashed line behind sheer cloth. Without the bridge the V is no region; with
// it the V separates (~15 % of the silhouette, l5: 16 % / 15 %) and the bindings and side panels stay.
{
  const LAYERS = resolve(REPO, '../tmp/plans/flat-consistency/out/layers/test1');
  for (const sheet of ['sheet-1', 'sheet-4']) {
    const file = resolve(LAYERS, `${sheet}.png`);
    if (!existsSync(file)) {
      console.log(`  skip  ${sheet} (no ${file})`);
      continue;
    }
    const full = rgbaOf(m.decodePng(readFileSync(file)));
    const W = Math.round(full.w * 0.27);
    const H = full.h;
    const front = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y += 1)
      front.set(full.data.subarray(y * full.w * 4, (y * full.w + W) * 4), y * W * 4);
    const shares = (r) => {
      let sil = 0;
      for (let i = 0; i < r.silhouette.length; i += 1) sil += r.silhouette[i];
      const size = new Array(r.count + 1).fill(0);
      const cx = new Array(r.count + 1).fill(0);
      const cy = new Array(r.count + 1).fill(0);
      for (let i = 0; i < r.labels.length; i += 1) {
        const id = r.labels[i];
        if (!id) continue;
        size[id] += 1;
        cx[id] += i % W;
        cy[id] += Math.floor(i / W);
      }
      return size.slice(1).map((s, k) => ({
        share: s / sil,
        x: cx[k + 1] / s / W,
        y: cy[k + 1] / s / H,
      }));
    };
    const base = shares(m.analyseFlat(front, W, H, { dashes: false }));
    const dash = shares(m.analyseFlat(front, W, H));
    // The V: centred, upper half, 10–25 % of the silhouette. The binding at the neck: a region in
    // the top fifth.
    const isV = (g) => g.share >= 0.1 && g.share <= 0.25 && Math.abs(g.x - 0.5) < 0.1 && g.y < 0.5;
    const isNeck = (g) => g.y < 0.25 && g.share < 0.1;
    const vBase = base.some(isV);
    const vDash = dash.find(isV);
    const ok = !vBase && !!vDash && dash.some(isNeck) && dash.length >= base.length;
    // sheet-1 is the gate (40-BUILD-SPEC); sheet-4's V dashes are rings that close only with the
    // strokes' light halo as walls, which v3 no longer adds — reported, not failed.
    const gate = sheet === 'sheet-1';
    if (!ok && gate) bad += 1;
    const pct = (list) => list.map((g) => `${Math.round(g.share * 100)}%`).join(' ');
    console.log(
      `${ok ? '  ok  ' : gate ? '  FAIL' : '  info'} ${sheet} front  base ${base.length} [${pct(base)}]  dash ${dash.length} [${pct(dash)}]  V ${vDash ? `${Math.round(vDash.share * 100)}%` : 'none'}`,
    );
  }
}
// v4 · beta card QA (06.10, tmp/plans/flat-consistency/shots/paint-qa): the cut of real sides.
{
  const QA = resolve(REPO, '../tmp/plans/flat-consistency/in/paint-qa');
  const cut = (name) => {
    const file = resolve(QA, `${name}.png`);
    if (!existsSync(file)) return null;
    const img = rgbaOf(m.decodePng(readFileSync(file)));
    return { ...m.analyseFlat(img.data, img.w, img.h), W: img.w };
  };
  // A pocket sewn over the placket: the strips between the placket's lines stay with the placket
  // (v3 gave them to the pocket as the crow flies, across the line).
  for (const [name, at, beyond] of [
    ['c49-side_r-518', [330, 290], (x) => x < 300],
    ['c49-side_l-517', [455, 290], (x) => x > 490],
  ]) {
    const r = cut(name);
    if (!r) {
      console.log(`  skip  ${name}`);
      continue;
    }
    const pocket = r.labels[at[1] * r.W + at[0]];
    let all = 0;
    let out = 0;
    for (let i = 0; i < r.labels.length; i += 1)
      if (r.labels[i] === pocket) {
        all += 1;
        if (beyond(i % r.W)) out += 1;
      }
    const ok = pocket > 0 && out / all < 0.01;
    if (!ok) bad += 1;
    console.log(
      `${ok ? '  ok  ' : '  FAIL'} ${name} pocket stays inside its line  — ${((100 * out) / Math.max(1, all)).toFixed(1)} % past the placket line`,
    );
  }
  // A dashed V whose arm breaks once by a gap a little wider than the rest (11.9 px vs 11.5 px):
  // the two ends bridge, the V is a region (centred, upper half, 8–25 % of the silhouette).
  {
    const r = cut('c38-front-537');
    if (!r) console.log('  skip  c38-front-537');
    else {
      let sil = 0;
      for (let i = 0; i < r.silhouette.length; i += 1) sil += r.silhouette[i];
      const H = r.labels.length / r.W;
      const size = new Array(r.count + 1).fill(0);
      const cx = new Array(r.count + 1).fill(0);
      const cy = new Array(r.count + 1).fill(0);
      for (let i = 0; i < r.labels.length; i += 1) {
        const id = r.labels[i];
        if (!id) continue;
        size[id] += 1;
        cx[id] += i % r.W;
        cy[id] += Math.floor(i / r.W);
      }
      const v = size.findIndex(
        (s, id) =>
          id > 0 &&
          s / sil >= 0.08 &&
          s / sil <= 0.25 &&
          Math.abs(cx[id] / s / r.W - 0.5) < 0.1 &&
          cy[id] / s / H < 0.5,
      );
      if (v < 0) bad += 1;
      console.log(
        `${v > 0 ? '  ok  ' : '  FAIL'} c38-front-537 the broken dashed V is a region  — ${r.count} regions${v > 0 ? `, V ${Math.round((100 * size[v]) / sil)} %` : ''}`,
      );
    }
  }
}
console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
