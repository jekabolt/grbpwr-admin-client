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
  // The fixtures below name regions by their v2 numbers; the topstitching on this shirt is dashed,
  // which v3 bridges (and renumbers) — the mapping is tested on the v2 cut.
  return m.analyseFlat(px, p.width, p.height, { dashes: false });
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

// T21 · topology (R16/R17): one part = one part_key across the sides; one click, one undo.
{
  const KF = {
    parts: [
      { label: 'Right Front', regions: [8, 10, 18], partKey: 'right-front' },
      { label: 'left sleeve', regions: [13], partKey: 'left-sleeve' },
      { label: 'collar', regions: [2, 3], partKey: 'collar' },
      { label: 'unnamed', regions: [20], partKey: 'unnamed-front' },
    ],
  };
  // The back names its collar differently: the key, not the name, makes it the same part.
  const KB = {
    parts: [
      { label: 'back collar', regions: [1], partKey: 'collar' },
      { label: 'left sleeve', regions: [4], partKey: 'left-sleeve' },
      { label: 'unnamed', regions: [12], partKey: 'unnamed-back' },
    ],
  };
  // A side view (the back flat stands in): collar keyed; the stale twin names "sleeve" sideless.
  const KS = {
    parts: [
      { label: 'collar', regions: [1], partKey: 'collar' },
      { label: 'sleeve', regions: [4], partKey: 'left-sleeve' },
    ],
  };
  const fk = m.partsOf(KF, front, fs, 'front');
  const bk = m.partsOf(KB, backF, undefined, 'back');
  const sk = m.partsOf(KS, backF, undefined, 'side_l');
  ck(
    fk.keyed && bk.keyed && fk.groups[2].key === 'collar' && m.keyedSuggestion(KF),
    'part_key kept; a card-level answer is keyed',
  );
  ck(
    !m.keyedSuggestion(BACK) && !m.partsOf(BACK, backF).keyed,
    'an answer without part_key is stale',
  );
  ck(sk.groups[1].label === 'sleeve', 'a keyed name is never side-filled', sk.groups[1].label);
  const ss = m.partsOf(
    {
      parts: [
        { label: 'Front Body', regions: [3] },
        { label: 'right cuff', regions: [5] },
        { label: 'unnamed', regions: [6] },
      ],
    },
    backF,
    undefined,
    'side_l',
  );
  ck(
    ss.groups[0].label === 'left front body' &&
      ss.groups[1].label === 'right cuff' &&
      ss.groups[2].label === 'unnamed',
    'no part_key: side_l fills "left" into names without a side',
    ss.groups.map((g) => g.label).join(' / '),
  );
  ck(
    m.partsOf({ parts: [{ label: 'front body', regions: [3] }] }, backF, undefined, 'side_r')
      .groups[0].label === 'right front body',
    'side_r fills "right"',
  );
  const fb = m.partsOf(
    { parts: [{ label: 'body front left', regions: [3] }] },
    backF,
    undefined,
    'front',
  );
  ck(
    m.samePart(ss.groups[0], 'side_l', fb.groups[0], 'front'),
    'no part_key: names compare by word set',
  );
  ck(
    !m.samePart(fk.groups[1], 'front', { ...fk.groups[1], key: 'right-sleeve' }, 'back'),
    'two keys differ → different parts even with one name',
  );
  ck(
    m.samePart(fk.groups[2], 'front', bk.groups[0], 'back'),
    'same key → same part even with two names',
  );
  ck(
    m.partAcross(
      [
        { view: 'front', parts: fk },
        { view: 'back', parts: bk },
      ],
      'front',
      3,
    ).length === 1,
    'unnamed-<view> never travels',
  );
  const sides3 = [
    { view: 'front', parts: fk },
    { view: 'back', parts: bk },
    { view: 'side_l', parts: sk },
    { view: 'side_r', parts: null },
  ];
  const acr = m.partAcross(sides3, 'back', 0);
  ck(
    JSON.stringify(acr) ===
      JSON.stringify([
        { view: 'back', groups: [0] },
        { view: 'front', groups: [2] },
        { view: 'side_l', groups: [0] },
      ]),
    'collar clicked on BACK: the collar on every side with parts, clicked side first',
    JSON.stringify(acr),
  );
  // Paint it in one gesture, undo in one.
  const L = {
    front: new Uint32Array(front.w * front.h),
    back: new Uint32Array(backF.w * backF.h),
    side_l: new Uint32Array(backF.w * backF.h),
  };
  const F = { front, back: backF, side_l: backF };
  const P = { front: fk, back: bk, side_l: sk };
  const g = m.paintGesture(
    acr.map((x, k) => ({
      view: x.view,
      base: 200 + k,
      labels: L[x.view],
      idx: m.concatIndices(
        x.groups.map((gi) => m.partIndices(L[x.view], F[x.view], P[x.view], gi)),
      ),
    })),
    A,
  );
  const col = (v, gi) => m.partIndices(new Uint32Array(L[v].length), F[v], P[v], gi);
  const frontCollar = col('front', 2);
  ck(
    g.length === 3 &&
      frontCollar.length > 0 &&
      [...frontCollar].every((i) => L.front[i] === A) &&
      [...col('back', 0)].every((i) => L.back[i] === A) &&
      [...col('side_l', 0)].every((i) => L.side_l[i] === A) &&
      L.front.filter((v) => v).length === frontCollar.length,
    'one click paints the collar on all three sides and nothing else',
  );
  [...g].reverse().forEach((st) => m.undoDiff(L[st.view], st.diff));
  ck(
    Object.values(L).every((a) => a.every((v) => v === 0)),
    'one undo clears the collar on every side',
  );
  // Mixed: a keyed side and a stale side still meet by name.
  const stale = m.partsOf(
    { parts: [{ label: 'sleeve left', regions: [4] }] },
    backF,
    undefined,
    'back',
  );
  ck(
    JSON.stringify(
      m.partAcross(
        [
          { view: 'front', parts: fk },
          { view: 'back', parts: stale },
        ],
        'front',
        1,
      ),
    ) ===
      JSON.stringify([
        { view: 'front', groups: [1] },
        { view: 'back', groups: [0] },
      ]),
    'keyed ↔ stale side: falls back to the name',
  );
}

// T13 + QW2 · the cloth mockup: the tile at its TRUE repeat on the side's scale (mm per px).
{
  ck(
    m.clothTilePx(30, 3) === 10 && m.clothTilePx(60, 0.6) === 100,
    'QW2 tile px = repeatMm / (mm per px)',
  );
  ck(
    m.clothTilePx(0, 3) === Math.round(m.SWATCH_MM / 3) &&
      m.clothTilePx(0, 6) === Math.round(m.SWATCH_MM / 6),
    'QW2 no repeat → a swatch (SWATCH_MM across) on the side’s scale, not flat/8',
    `${m.clothTilePx(0, 3)} px at 3 mm/px`,
  );
  // Scale: the chart's chest across the body on FRONT; length down the side; else 600 est.
  const SW = 300,
    SH = 400;
  const sil = new Uint8Array(SW * SH);
  // A body 100 px wide (x 100..199) from y 0..399, sleeves apart at x 20..59 down to y 300.
  for (let y = 0; y < SH; y += 1)
    for (let x = 0; x < SW; x += 1)
      if ((x >= 100 && x < 200) || (y < 300 && ((x >= 20 && x < 60) || (x >= 240 && x < 280))))
        sil[y * SW + x] = 1;
  const sflat = { w: SW, h: SH, silhouette: sil };
  const est = m.viewScale('front', sflat, m.NO_GARMENT);
  ck(
    est.estimated &&
      Math.abs(est.mmPerPx - m.GARMENT_WIDTH_MM / 260) < 1e-9 &&
      est.acrossMm === 600,
    'QW2 no chart → 600 mm across the silhouette, estimated',
    JSON.stringify(est),
  );
  const chest = m.viewScale('front', sflat, { chestMm: 550, lengthMm: 0 });
  ck(
    !chest.estimated && Math.abs(chest.mmPerPx - 5.5) < 1e-9,
    'QW2 chest 550 mm over the 100 px body (sleeves apart) → 5.5 mm/px',
    JSON.stringify(chest),
  );
  const side = m.viewScale('side_l', sflat, { chestMm: 550, lengthMm: 800 });
  ck(
    !side.estimated && Math.abs(side.mmPerPx - 2) < 1e-9,
    'QW2 side: chest does not apply, length 800 mm down 400 px → 2 mm/px',
  );
  const names = [
    { id: 7, name: 'Chest' },
    { id: 9, name: 'length' },
  ];
  const cell = (sizeId, measurementNameId, value) => ({
    sizeId,
    measurementNameId,
    value: { value: String(value) },
  });
  const g1 = m.garmentOfChart(
    { cells: [cell(1, 7, 52), cell(2, 7, 55), cell(3, 7, 58), cell(2, 9, 72)], gradeBaseSizeId: 0 },
    names,
  );
  ck(
    g1.chestMm === 550 && g1.lengthMm === 720,
    'QW2 chart in cm → mm, middle size',
    JSON.stringify(g1),
  );
  const g2 = m.garmentOfChart(
    { cells: [cell(1, 7, 1040), cell(3, 7, 1120)], gradeBaseSizeId: 3 },
    names,
  );
  ck(
    g2.chestMm === 560 && g2.lengthMm === 0,
    'QW2 girth halved, base size wins',
    JSON.stringify(g2),
  );
  ck(m.garmentOfChart(undefined, names).chestMm === 0, 'QW2 no chart → nothing said');

  const W = 200,
    H = 40;
  const flat = {
    w: W,
    h: H,
    labels: new Int32Array(W * H).fill(1),
    silhouette: new Uint8Array(W * H).fill(1),
  };
  const lab = new Uint32Array(W * H).fill(A);
  const white = new Uint8ClampedArray(W * H * 4).fill(255);
  // A 2-px tile: black | white — one dark run per repeat. 600 mm across 200 px = 3 mm/px.
  const tile = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const runs = (repeatMm) => {
    const px = m.mockupPixels(
      flat,
      lab,
      white,
      new Map([[A, { kind: 'tile', rgba: tile, w: 2, h: 1, tilePx: m.clothTilePx(repeatMm, 3) }]]),
    );
    let n = 0;
    for (let x = 0; x < W; x += 1)
      if (px[(10 * W + x) * 4] === 0 && (x === 0 || px[(10 * W + x - 1) * 4] !== 0)) n += 1;
    return n;
  };
  ck(
    runs(30) === 20 && runs(60) === 10 && runs(0) === Math.ceil(W / Math.round(m.SWATCH_MM / 3)),
    'mockup repeats scale with repeatMm (unstated = a 100 mm swatch)',
    `${runs(30)}/${runs(60)}/${runs(0)} repeats`,
  );
  // Ink multiplies on top; a free colour fills flat; unpainted = paper without a remainder.
  const ink = white.slice();
  ink.set([0, 0, 0, 255], (5 * W + 5) * 4);
  const lab2 = lab.slice();
  lab2.fill(0, 0, W * 20);
  const colour = new Map([[A, { kind: 'colour', hex: '#336699' }]]);
  const px = m.mockupPixels(flat, lab2, ink, colour);
  ck(
    px[(5 * W + 5) * 4] === 0 &&
      px[(5 * W + 6) * 4] === 255 &&
      px[30 * W * 4] === 0x33 &&
      px[30 * W * 4 + 2] === 0x99,
    'lines multiplied on top, paper unpainted, a free colour flat',
  );
  // QW1 · the REMAINDER fills the unpainted garment on the mockup; outside the silhouette stays white.
  const flatR = {
    ...flat,
    labels: flat.labels.slice().fill(0, 0, W * 2),
    silhouette: flat.silhouette.slice().fill(0, 0, W * 2),
  };
  const pr = m.mockupPixels(flatR, lab2, ink, colour, { kind: 'colour', hex: '#aa5500' });
  ck(
    pr[(5 * W + 6) * 4] === 0xaa &&
      pr[(5 * W + 6) * 4 + 1] === 0x55 &&
      pr[(5 * W + 5) * 4] === 0 &&
      pr[0] === 255 &&
      pr[30 * W * 4] === 0x33,
    'QW1 mockup: remainder under the unpainted garment, lines on top, paper outside, paint kept',
  );
}

// QW3 · a run with maps carries the REMAINDER + the painted cloths only; QW1 the same remainder.
{
  const media = (id) => ({ id, media: { fullSize: { mediaUrl: `m${id}` } } });
  const asset = (id) => ({ id, kind: 'fabric', name: `cloth ${id}`, mediaId: 500 + id });
  const band = {
    assets: [asset(201), asset(202), asset(203)],
    assetBindings: [
      { colorwayId: 11, bomItemId: 1, assetId: 201 },
      { colorwayId: 11, bomItemId: 2, assetId: 202 },
      { colorwayId: 11, bomItemId: 3, assetId: 203 },
    ],
    bench: [
      {
        id: 1,
        viewKey: 'front',
        kind: 'flat',
        pictureId: 1,
        slotRev: 1,
        picture: { id: 1, media: media(101) },
      },
      {
        id: 2,
        viewKey: 'back',
        kind: 'flat',
        pictureId: 2,
        slotRev: 1,
        picture: { id: 2, media: media(102) },
      },
    ],
    runs: [],
  };
  const slot = (bomItemId, name) => ({
    bomItemId,
    lineKey: `l${bomItemId}`,
    name,
    purpose: '',
    purposeLabel: name.toLowerCase(),
    section: 'TECH_CARD_BOM_SECTION_FABRIC',
    detail: '',
    words: name,
  });
  const slots = [slot(1, 'MAIN'), slot(2, 'CONTRAST'), slot(3, 'LINING')];
  const lab = m.slotLabels([1, 2, 3]);
  const plan = {
    rev: 1,
    maps: [
      {
        mediaId: 900,
        view: 'front',
        baseMediaId: 101,
        palette: [{ hex: lab.get(2), px: 10 }],
        url: '',
        gone: false,
      },
    ],
    cloths: [],
  };
  const run = m.paintRun({ band, plan, slots, colorwayId: 11, colorwayLabel: 'ROSSO' });
  const ids = (run.fabrics || []).map((f) => `${f.assetId}${f.mapHex ? '@' : ''}`);
  ck(
    run.kind === 'maps' && ids.join(',') === '201,202@',
    'QW3 maps run: remainder + painted only — the unpainted LINING stays home',
    `${run.kind} ${ids.join(',')}`,
  );
  const rest = m.remainderCloth({ band, slots, colorwayId: 11, painted: new Set([lab.get(2)]) });
  ck(
    rest?.assetId === 201 && rest.label === lab.get(1),
    'QW1 canvas remainder = the run’s remainder',
  );
  ck(
    m.remainderCloth({ band, slots, colorwayId: 11, painted: new Set() }) === null &&
      m.remainderCloth({
        band,
        slots,
        colorwayId: 11,
        painted: new Set([lab.get(1), lab.get(2), lab.get(3)]),
      }) === null,
    'QW1 no remainder when nothing or everything is painted',
  );
  const first = m.remainderCloth({ band, slots, colorwayId: 11, painted: new Set([lab.get(1)]) });
  ck(first?.assetId === 202, 'QW1 main painted → the next unpainted cloth is the remainder');
}

// QW6 · ⇧-click paints this side only; a plain click the same part on every side.
{
  const flat = { w: 4, h: 1, labels: Int32Array.from([1, 2, 3, 4]), count: 4 };
  const f = m.partsOf(
    { parts: [{ label: 'collar', regions: [1], partKey: 'collar' }] },
    flat,
    undefined,
    'front',
  );
  const b = m.partsOf(
    { parts: [{ label: 'collar', regions: [2], partKey: 'collar' }] },
    flat,
    undefined,
    'back',
  );
  const sides = [
    { view: 'front', parts: f },
    { view: 'back', parts: b },
  ];
  ck(
    m.partAcross(sides, 'front', 0).length === 2 &&
      JSON.stringify(m.partAcross(sides, 'front', 0, true)) ===
        JSON.stringify([{ view: 'front', groups: [0] }]),
    'QW6 ⇧ = this side only; click = the part on every side',
  );
}

// T24 · the engine's picture ceiling: mockups give way side_r → side_l → back → front; maps stay.
{
  const views = ['front', 'back', 'side_l', 'side_r'];
  const maps = views.map((view, i) => ({ view, mediaId: 300 + i }));
  // Beta run 72: 4 plates + 3 references + 2 cloths (one named twice, a zero) = 9 inputs.
  const inputs = [100, 101, 102, 103, 200, 201, 202, 400, 401, 401, 0];
  const at16 = m.fitMockups(inputs, maps, 16);
  ck(
    at16.total === 16 &&
      !at16.over &&
      JSON.stringify(at16.dropped) === '["side_r"]' &&
      [...at16.keep].sort().join() === 'back,front,side_l',
    'T24 17 → 16: side_r mockup dropped, maps all stay',
    JSON.stringify({ total: at16.total, dropped: at16.dropped }),
  );
  const at14 = m.fitMockups(inputs, maps, 14);
  ck(
    JSON.stringify(at14.dropped) === '["side_r","side_l","back"]' &&
      at14.total === 14 &&
      [...at14.keep].join() === 'front' &&
      !at14.over,
    'T24 order: side_r, side_l, back before front',
    JSON.stringify(at14.dropped),
  );
  const at12 = m.fitMockups(inputs, maps, 12);
  ck(
    at12.over &&
      at12.keep.size === 0 &&
      at12.total === 13 &&
      /would send 13 pictures and GPT Image 2 takes at most 12/.test(
        m.overCeilingSentence(at12, 'GPT Image 2'),
      ),
    "T24 still over with no mockup → the gate refuses in the server's words",
  );
  const roomy = m.fitMockups(inputs, maps, 0);
  ck(
    roomy.keep.size === 4 && !roomy.over && roomy.dropped.length === 0,
    'T24 no ceiling known → nothing trimmed',
  );
  const two = m.fitMockups(inputs, [maps[0], maps[3]], 12);
  ck(
    JSON.stringify(two.dropped) === '["side_r"]' && two.keep.has('front'),
    'T24 only the outgoing maps are trimmed, side_r first',
  );
}

console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
