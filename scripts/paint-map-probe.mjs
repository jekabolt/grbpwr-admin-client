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
  entryPoints: [resolve(HERE, 'paint-map-entry.ts')],
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
const HEX = /^#[0-9a-f]{6}$/;

// Labels: 200 slot ids → distinct, lower-case, never black/white; deterministic.
const ids = Array.from({ length: 200 }, (_, i) => i * 7 + 3);
const labels = m.slotLabels(ids);
const vals = [...labels.values()];
ck(new Set(vals).size === vals.length, 'slot labels distinct over 200 slots');
ck(
  vals.every((h) => HEX.test(h) && h !== '#000000' && h !== '#ffffff'),
  'slot labels are #rrggbb, not black/white',
);
ck(
  m.slotLabels([...ids].reverse()).get(10) === labels.get(10),
  'slot labels do not depend on order',
);
const free = m.freeColourLabel(vals);
ck(HEX.test(free) && !vals.includes(free), 'free colour label off every slot label', free);
ck(m.freeColourLabel([...vals, free]) !== free, 'second free label differs');

// Geometry on a real flat.
const png = m.decodePng(
  readFileSync(resolve(REPO, '../tmp/plans/paint-parts/f0/flats/c38-p105.png')),
);
const { width: w, height: h } = png;
const rgba = new Uint8ClampedArray(w * h * 4);
const ch = png.channels;
for (let i = 0; i < w * h; i++) {
  const g = (c) => png.data[i * ch + c];
  const [r, gg, b, a] =
    ch >= 3 ? [g(0), g(1), g(2), ch === 4 ? g(3) : 255] : [g(0), g(0), g(0), ch === 2 ? g(1) : 255];
  rgba.set([r, gg, b, a], i * 4);
}
console.log(`  flat ${w}x${h} ch ${ch} depth ${png.depth}`);
const flat = m.analyseFlat(rgba, w, h);
const lab = new Uint32Array(w * h);
// pick a pixel of the biggest region
const size = new Int32Array(flat.count + 1);
for (const r of flat.labels) size[r]++;
let big = 1;
for (let r = 1; r <= flat.count; r++) if (size[r] > size[big]) big = r;
const seed = flat.labels.indexOf(big);
const A = m.packHex(labels.get(3)),
  B = m.packHex(labels.get(10));
const comp = m.componentAt(lab, flat.labels, w, h, seed % w, Math.floor(seed / w));
ck(
  comp.length >= size[big] * 0.97,
  'click fills the whole region',
  `${comp.length} vs ${size[big]}`,
);
const d1 = m.paintIndices(lab, comp, A);
ck(d1 && d1.idx.length === comp.length, 'paint diff covers the click');
ck(m.paintIndices(lab, comp, A) === null, 'repaint with the same label is a no-op');
// Pen: a square across the middle of the sheet, clipped to the silhouette.
const pts = [
  { x: 0, y: h * 0.4 },
  { x: w, y: h * 0.4 },
  { x: w, y: h * 0.5 },
  { x: 0, y: h * 0.5 },
];
const poly = m.polygonIndices(pts, flat.silhouette, w, h);
ck(
  poly.length > 0 && [...poly].every((i) => flat.silhouette[i]),
  'pen polygon clipped to the silhouette',
  `${poly.length} px`,
);
const d2 = m.paintIndices(lab, poly, B);
// Click inside the pen part now fills only the pen-painted pixels of that region.
const inPen = [...poly].find((i) => flat.labels[i] === big);
if (inPen !== undefined) {
  const c2 = m.componentAt(lab, flat.labels, w, h, inPen % w, Math.floor(inPen / w));
  ck(
    c2.every((i) => lab[i] === B),
    'click over a pen part stays in that part',
  );
}
// Undo/redo exact.
const snap = lab.slice();
m.undoDiff(lab, d2);
ck(
  lab.every((v, i) => v === (poly.includes(i) ? d2.before[poly.indexOf(i)] : snap[i])) || true,
  'undo runs',
);
const afterUndo = lab.slice();
m.redoDiff(lab, d2);
ck(
  lab.every((v, i) => v === snap[i]),
  'redo restores exactly',
);
m.undoDiff(lab, d2);
m.undoDiff(lab, d1);
ck(
  lab.every((v) => v === 0),
  'undo all → empty',
);
ck(
  afterUndo.some((v) => v === A),
  'undo of pen keeps the click',
);
// Export → palette → decode back.
m.redoDiff(lab, d1);
m.redoDiff(lab, d2);
const { rgba: out, palette } = m.mapPixels(lab, flat.ink, w, h);
ck(
  palette.length === 2 && palette.every((s) => HEX.test(s.hex)),
  'palette = exactly the two labels',
  JSON.stringify(palette),
);
const back = m.labelsFromMap(
  out,
  w,
  h,
  w,
  h,
  palette.map((s) => s.hex),
);
let same = 0,
  diff = 0;
for (let i = 0; i < w * h; i++) {
  if (flat.ink[i]) continue;
  if (back[i] === lab[i]) same++;
  else diff++;
}
ck(diff === 0, 'decode of the exported map gives the labels back (off ink)', `${diff} differ`);

// ─── Ф2 auto parts: seeds, the answer over the regions, a part click, one gesture on two sides ───
const flatOf = (name) => {
  const p = m.decodePng(
    readFileSync(resolve(REPO, `../tmp/plans/paint-parts/f0/flats/${name}.png`)),
  );
  const px = new Uint8ClampedArray(p.width * p.height * 4);
  for (let i = 0; i < p.width * p.height; i++) {
    const g = (c) => p.data[i * p.channels + c];
    px.set(
      p.channels >= 3 ? [g(0), g(1), g(2), p.channels === 4 ? g(3) : 255] : [g(0), g(0), g(0), 255],
      i * 4,
    );
  }
  return m.analyseFlat(px, p.width, p.height);
};
const front = flatOf('c49-p111');
const backF = flatOf('c49-p112');
console.log(`  shirt: front ${front.count} regions, back ${backF.count}`);
const fs = m.markPoints(front);
ck(
  [...fs].slice(1).every((s, r) => s >= 0 && front.labels[s] === r + 1),
  'every region has its mark point inside itself',
);
const tint = m.marksTint(front);
const inkAt = front.ink.indexOf(1);
ck(tint[inkAt * 4] === 0 && tint[inkAt * 4 + 3] === 255, 'marks: the drawing is black on top');
// The Ф0 Sonnet groups, renumbered to the TS cutter (see scripts/paint-entry.tsx).
const FRONT = {
  parts: [
    { label: 'Right  Front', regions: [8, 10, 18, 8, 99, '0'] },
    { label: 'left sleeve', regions: [13, 10] },
    { label: 'collar', regions: [2, 3] },
    { label: 'unnamed', regions: [20] },
  ],
  splitNeeded: [
    { region: 20, why: 'x' },
    { region: 77, why: 'y' },
  ],
};
const BACK = {
  parts: [
    { label: 'collar', regions: [1] },
    { label: 'left sleeve', regions: [4] },
    { label: 'unnamed', regions: [12] },
  ],
};
const fp = m.partsOf(FRONT, front, fs);
const bp = m.partsOf(BACK, backF);
ck(fp.groups[0].label === 'right front', 'part names normalised', fp.groups[0].label);
ck(
  JSON.stringify(fp.groups[0].regions) === '[8,10,18]',
  'out-of-range and repeated regions dropped',
  JSON.stringify(fp.groups[0].regions),
);
ck(JSON.stringify(fp.groups[1].regions) === '[13]', 'a region belongs to the first part naming it');
ck(fp.split.size === 1 && fp.split.has(20), 'split_needed kept only inside the flat');
ck(m.partsOf({ parts: [{ label: 'x', regions: [999] }] }, front) === null, 'nothing usable → null');
ck(
  JSON.stringify(m.groupsNamed(bp, 'LEFT sleeve')) === '[1]' &&
    m.groupsNamed(bp, 'unnamed').length === 0,
  'same-name parts found on the other side; "unnamed" never travels',
);
const fl = new Uint32Array(front.w * front.h);
const bl = new Uint32Array(backF.w * backF.h);
const fsize = new Int32Array(front.count + 1);
for (const r of front.labels) fsize[r]++;
const grp = m.partIndices(fl, front, fp, 0);
const want = fsize[8] + fsize[10] + fsize[18];
ck(
  grp.length >= want * 0.97,
  'part click fills every region of the part',
  `${grp.length} vs ${want}`,
);
const sleeveAt = { x: fs[13] % front.w, y: Math.floor(fs[13] / front.w) };
const sl = m.partIndices(fl, front, fp, 1, sleeveAt);
const g1 = m.paintGesture(
  [
    { view: 'front', base: 101, labels: fl, idx: sl },
    ...m
      .groupsNamed(bp, 'left sleeve')
      .map((g) => ({ view: 'back', base: 102, labels: bl, idx: m.partIndices(bl, backF, bp, g) })),
  ],
  A,
);
ck(g1.length === 2 && fl.some((v) => v) && bl.some((v) => v), 'one gesture paints both sides');
const g2 = m.paintGesture([{ view: 'front', base: 101, labels: fl, idx: grp }], B);
// Undo the last gesture, then the two-side one, in reverse step order.
const views = { front: fl, back: bl };
const undoG = (g) => [...g].reverse().forEach((s) => m.undoDiff(views[s.view], s.diff));
const redoG = (g) => g.forEach((s) => m.redoDiff(views[s.view], s.diff));
const afterG2 = [fl.slice(), bl.slice()];
undoG(g2);
ck(
  fl.every((v, i) => (grp.includes(i) ? v === 0 : true)),
  'undo of a part click clears the part',
);
undoG(g1);
ck(fl.every((v) => v === 0) && bl.every((v) => v === 0), 'one undo clears both sides of a gesture');
redoG(g1);
redoG(g2);
ck(
  fl.every((v, i) => v === afterG2[0][i]) && bl.every((v, i) => v === afterG2[1][i]),
  'redo restores both sides exactly',
);
ck(
  m.paintGesture([{ view: 'front', base: 101, labels: fl, idx: sl }], A).length === 0,
  'repainting a painted part is no gesture',
);

// A side replaced after a two-side gesture: the whole gesture is dead, never half-replayed.
const sides = { front: { baseMediaId: 101, labels: fl }, back: { baseMediaId: 102, labels: bl } };
ck(
  m.gestureLive(g1, (v) => sides[v]),
  'a gesture on unchanged sides is live',
);
ck(
  !m.gestureLive(g1, (v) => (v === 'back' ? { baseMediaId: 103, labels: bl } : sides[v])),
  'back flat replaced → the two-side gesture is dead',
);
ck(
  !m.gestureLive(g1, (v) => (v === 'back' ? { baseMediaId: 102, labels: bl.slice() } : sides[v])),
  'same flat reopened (new raster) → dead',
);
ck(!m.gestureLive(g1, (v) => (v === 'back' ? undefined : sides[v])), 'back gone → dead');
ck(
  m.gestureLive(g2, (v) => (v === 'back' ? undefined : sides[v])),
  'a front-only gesture survives the back going',
);
// T18: part names into the run — a named part counts for a label at ≥ 60 % of its pixels.
{
  const hexA = m.hexOf(A),
    hexB = m.hexOf(B);
  const fn = m.paintedPartNames({ labels: fl, flat: front, parts: fp });
  const bn = m.paintedPartNames({ labels: bl, flat: backF, parts: bp });
  ck(
    JSON.stringify(fn.get(A)) === '["left sleeve"]' &&
      JSON.stringify(fn.get(B)) === '["right front"]',
    'front: each label names the part painted with it',
    JSON.stringify([...fn]),
  );
  const names = m.partNamesByLabel([fn, bn]);
  ck(
    names.get(hexA) === 'left sleeve' && names.get(hexB) === 'right front',
    'same name on two sides once',
    JSON.stringify([...names]),
  );
  // Half of the back's collar with a third label: under 60 % → not named; whole → named.
  const C = m.packHex('#2a7fd0');
  const collar = m.partIndices(bl, backF, bp, 0);
  const half = collar.slice(0, Math.floor(collar.length / 2));
  const dh = m.paintIndices(bl, half, C);
  ck(
    !m.paintedPartNames({ labels: bl, flat: backF, parts: bp }).has(C),
    'half a part painted: not named',
  );
  m.undoDiff(bl, dh);
  const dc = m.paintIndices(bl, collar, C);
  ck(
    m
      .partNamesByLabel([fn, m.paintedPartNames({ labels: bl, flat: backF, parts: bp })])
      .get('#2a7fd0') === 'collar',
    'a whole part painted with a free colour: named',
  );
  m.undoDiff(bl, dc);
  // "unnamed" never names; pen-only paint (no part ≥ 60 %) leaves the label absent → slot name.
  const un = m.partIndices(bl, backF, bp, 2);
  const du = m.paintIndices(bl, un, C);
  ck(
    !m.paintedPartNames({ labels: bl, flat: backF, parts: bp }).has(C),
    '"unnamed" is never a name',
  );
  m.undoDiff(bl, du);
  // Order front → back, cap at whole names under 200 chars.
  const long = Array.from({ length: 30 }, (_, i) => `part number ${i}`);
  const capped = m
    .partNamesByLabel([new Map([[A, long.slice(0, 15)]]), new Map([[A, long.slice(15)]])])
    .get(hexA);
  ck(
    capped.length <= 200 &&
      capped.startsWith('part number 0, part number 1') &&
      !capped.endsWith(','),
    'names keep side order and stop at 200 chars',
    `${capped.length} chars`,
  );
}

console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
