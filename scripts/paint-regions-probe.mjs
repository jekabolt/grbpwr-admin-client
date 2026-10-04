#!/usr/bin/env node
// PAINT THE PARTS · T1 — the client port of the Ф0 region cutter against the Ф0 flats.
// Compares the region count at r = 3 with the Python probe (`f0/out/<flat>/report.txt`); ±20 % or
// ±2 regions passes (the probe resamples with LANCZOS and dilates with cv2's ellipse — near, not equal).
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
  const ok = Number.isNaN(py) || Math.abs(r.count - py) <= Math.max(2, py * 0.2);
  if (!ok) bad += 1;
  console.log(
    `${ok ? '  ok  ' : '  FAIL'} ${name.padEnd(16)} ${w}x${h}  ts ${String(r.count).padStart(3)}  py ${String(py).padStart(3)}  ${ms} ms`,
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
console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
