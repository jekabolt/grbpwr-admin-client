#!/usr/bin/env node
// WORKBENCH AUTO-SPLIT · T26 — `detect-split.ts` on the six real beta sheets of
// tmp/plans/paint-parts/autosplit/: each must be CONFIDENT and every frame box within 1 % of the
// image's long side of the reference (`split.py`, boxes below printed by it on 05.10).
//   node scripts/autosplit-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `autosplit-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'autosplit-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: { components: resolve(REPO, 'src/components') },
});
const m = await import(pathToFileURL(outfile).href);

/** `split.py` → (ok, boxes x0,y0,x1,y1) per sheet. */
const REF = {
  'run-70-0-og.png': [
    4,
    [
      [0, 91, 564, 779],
      [560, 77, 892, 795],
      [887, 74, 1445, 808],
      [1449, 77, 1769, 798],
    ],
  ],
  'run-73-0-og.png': [
    4,
    [
      [12, 69, 593, 805],
      [584, 73, 921, 809],
      [918, 67, 1452, 822],
      [1444, 69, 1766, 801],
    ],
  ],
  'run-30-0-og.png': [
    6,
    [
      [0, 137, 323, 717],
      [346, 139, 663, 717],
      [671, 135, 904, 714],
      [897, 136, 1129, 714],
      [1133, 148, 1451, 723],
      [1455, 150, 1770, 725],
    ],
  ],
  'run-52-0-og.png': [
    2,
    [
      [42, 17, 846, 852],
      [932, 17, 1724, 848],
    ],
  ],
  'run-57-0-og.png': [
    2,
    [
      [107, 17, 784, 876],
      [906, 15, 1584, 882],
    ],
  ],
  'run-58-0-og.png': [
    4,
    [
      [28, 90, 591, 755],
      [626, 90, 1166, 757],
      [1210, 84, 1465, 762],
      [1501, 84, 1757, 762],
    ],
  ],
};

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
for (const [name, [n, ref]] of Object.entries(REF)) {
  const p = m.decodePng(readFileSync(resolve(REPO, `../tmp/plans/paint-parts/autosplit/${name}`)));
  const { width: w, height: h, channels: c } = p;
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = p.data[i * c];
    rgba[i * 4 + 1] = p.data[i * c + (c >= 3 ? 1 : 0)];
    rgba[i * 4 + 2] = p.data[i * c + (c >= 3 ? 2 : 0)];
    rgba[i * 4 + 3] = 255;
  }
  const t = performance.now();
  const d = m.detectSplit(rgba, w, h, n);
  const ms = (performance.now() - t).toFixed(0);
  ck(
    !!d && d.confident,
    `${name} n=${n} confident`,
    d ? `gaps ${d.gaps.join(',')} · ${ms} ms` : 'null',
  );
  if (!d) continue;
  const tol = 0.01 * Math.max(w, h);
  let worst = 0;
  ref.forEach((r, k) => {
    const b = d.boxes[k];
    const diff = b
      ? Math.max(...[b.x0, b.y0, b.x1, b.y1].map((v, j) => Math.abs(v - r[j])))
      : Infinity;
    worst = Math.max(worst, diff);
  });
  ck(worst <= tol, `${name} boxes vs split.py`, `worst ${worst} px (tol ${tol.toFixed(0)})`);
  const fr = d.frames.every(
    (f) => f.x >= 0 && f.y >= 0 && f.x + f.w <= 1.0001 && f.y + f.h <= 1.0001 && f.w > 0.02,
  );
  ck(fr, `${name} frames normalised`);
}
// Not confident: a blank sheet is null; a sheet asked for more views than it has gaps is not.
const blank = new Uint8Array(400 * 200 * 4).fill(255);
ck(m.detectSplit(blank, 400, 200, 3) === null, 'blank sheet → null');
const two = new Uint8Array(400 * 200 * 4).fill(255);
for (let y = 40; y < 160; y++)
  for (const [a, b] of [
    [20, 180],
    [220, 380],
  ])
    for (let x = a; x < b; x++) two.fill(0, (y * 400 + x) * 4, (y * 400 + x) * 4 + 3);
const d3 = m.detectSplit(two, 400, 200, 3);
ck(
  !!d3 && !d3.confident && d3.frames.length === 3,
  'two blocks asked as 3 → not confident, 3 seeded frames',
);
const d2 = m.detectSplit(two, 400, 200, 2);
ck(!!d2 && d2.confident, 'two blocks asked as 2 → confident');
console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
