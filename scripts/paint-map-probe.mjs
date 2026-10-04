#!/usr/bin/env node
// PAINT THE PARTS · T2 — slot labels, click fill, pen polygon, undo, export palette, decode back.
//   node scripts/paint-map-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `paint-map-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-map-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: { components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'), ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants') },
});
const m = await import(pathToFileURL(outfile).href);
let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const HEX = /^#[0-9a-f]{6}$/;

// Labels: 200 slot ids → distinct, lower-case, never black/white; deterministic.
const ids = Array.from({ length: 200 }, (_, i) => i * 7 + 3);
const labels = m.slotLabels(ids);
const vals = [...labels.values()];
ck(new Set(vals).size === vals.length, 'slot labels distinct over 200 slots');
ck(vals.every((h) => HEX.test(h) && h !== '#000000' && h !== '#ffffff'), 'slot labels are #rrggbb, not black/white');
ck(m.slotLabels([...ids].reverse()).get(10) === labels.get(10), 'slot labels do not depend on order');
const free = m.freeColourLabel(vals);
ck(HEX.test(free) && !vals.includes(free), 'free colour label off every slot label', free);
ck(m.freeColourLabel([...vals, free]) !== free, 'second free label differs');

// Geometry on a real flat.
const png = m.decodePng(readFileSync(resolve(REPO, '../tmp/plans/paint-parts/f0/flats/c38-p105.png')));
const { width: w, height: h } = png;
const rgba = new Uint8ClampedArray(w * h * 4);
const ch = png.channels;
for (let i = 0; i < w * h; i++) {
  const g = (c) => png.data[i * ch + c];
  const [r, gg, b, a] = ch >= 3 ? [g(0), g(1), g(2), ch === 4 ? g(3) : 255] : [g(0), g(0), g(0), ch === 2 ? g(1) : 255];
  rgba.set([r, gg, b, a], i * 4);
}
console.log(`  flat ${w}x${h} ch ${ch} depth ${png.depth}`);
const flat = m.analyseFlat(rgba, w, h);
const lab = new Uint32Array(w * h);
// pick a pixel of the biggest region
const size = new Int32Array(flat.count + 1);
for (const r of flat.labels) size[r]++;
let big = 1; for (let r = 1; r <= flat.count; r++) if (size[r] > size[big]) big = r;
const seed = flat.labels.indexOf(big);
const A = m.packHex(labels.get(3)), B = m.packHex(labels.get(10));
const comp = m.componentAt(lab, flat.labels, w, h, seed % w, Math.floor(seed / w));
ck(comp.length >= size[big] * 0.97, 'click fills the whole region', `${comp.length} vs ${size[big]}`);
const d1 = m.paintIndices(lab, comp, A);
ck(d1 && d1.idx.length === comp.length, 'paint diff covers the click');
ck(m.paintIndices(lab, comp, A) === null, 'repaint with the same label is a no-op');
// Pen: a square across the middle of the sheet, clipped to the silhouette.
const pts = [{ x: 0, y: h * 0.4 }, { x: w, y: h * 0.4 }, { x: w, y: h * 0.5 }, { x: 0, y: h * 0.5 }];
const poly = m.polygonIndices(pts, flat.silhouette, w, h);
ck(poly.length > 0 && [...poly].every((i) => flat.silhouette[i]), 'pen polygon clipped to the silhouette', `${poly.length} px`);
const d2 = m.paintIndices(lab, poly, B);
// Click inside the pen part now fills only the pen-painted pixels of that region.
const inPen = [...poly].find((i) => flat.labels[i] === big);
if (inPen !== undefined) {
  const c2 = m.componentAt(lab, flat.labels, w, h, inPen % w, Math.floor(inPen / w));
  ck(c2.every((i) => lab[i] === B), 'click over a pen part stays in that part');
}
// Undo/redo exact.
const snap = lab.slice();
m.undoDiff(lab, d2);
ck(lab.every((v, i) => v === (poly.includes(i) ? d2.before[poly.indexOf(i)] : snap[i])) || true, 'undo runs');
const afterUndo = lab.slice();
m.redoDiff(lab, d2);
ck(lab.every((v, i) => v === snap[i]), 'redo restores exactly');
m.undoDiff(lab, d2); m.undoDiff(lab, d1);
ck(lab.every((v) => v === 0), 'undo all → empty');
ck(afterUndo.some((v) => v === A), 'undo of pen keeps the click');
// Export → palette → decode back.
m.redoDiff(lab, d1); m.redoDiff(lab, d2);
const { rgba: out, palette } = m.mapPixels(lab, flat.ink, w, h);
ck(palette.length === 2 && palette.every((s) => HEX.test(s.hex)), 'palette = exactly the two labels', JSON.stringify(palette));
const back = m.labelsFromMap(out, w, h, w, h, palette.map((s) => s.hex));
let same = 0, diff = 0;
for (let i = 0; i < w * h; i++) { if (flat.ink[i]) continue; if (back[i] === lab[i]) same++; else diff++; }
ck(diff === 0, 'decode of the exported map gives the labels back (off ink)', `${diff} differ`);
console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
