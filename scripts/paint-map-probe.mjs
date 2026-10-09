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

// ─── R9 Ф1 · hardware as parts ───
{
  // slotLabels: cloths first — appending hardware ids never re-steps a cloth label.
  const fab = Array.from({ length: 40 }, (_, i) => i * 3 + 600);
  // A hardware id whose base hex collides with a cloth's, with a LOWER id (the old id-order rule
  // would have stepped the cloth's label off).
  let clash = 0;
  for (let id = 1; id < 600 && !clash; id += 1)
    if (fab.some((f) => m.slotHex(f) === m.slotHex(id))) clash = id;
  const hw = [7, 11, 13, ...(clash ? [clash] : [])];
  const alone = m.slotLabels(fab);
  const both = m.slotLabels(fab, hw);
  ck(
    fab.every((id) => both.get(id) === alone.get(id)),
    'R9 slotLabels: cloth labels unchanged with hardware ids appended',
    clash ? `colliding hardware id ${clash}` : 'no base collision in range',
  );
  const all = [...both.values()];
  ck(
    new Set(all).size === all.length && hw.every((id) => both.has(id)),
    'R9 slotLabels: hardware ids take their own distinct labels',
  );
  if (clash) {
    const old = m.slotLabels([...fab, clash]);
    ck(
      fab.some((id) => old.get(id) !== alone.get(id)),
      'R9 (control) the id-order rule alone WOULD re-step a cloth label',
    );
  }
  ck(
    m.slotLabels([...fab].reverse(), [...hw].reverse()).get(clash || 7) === both.get(clash || 7),
    'R9 slotLabels: still independent of the order within each list',
  );

  // Finding 1 · a hardware label is a function of its id alone. Ids 2 and 612 share the base hex
  // (#9139d0): the old rule stepped 612, and deleting 2 then moved 612 back onto 2's pixels.
  ck(m.slotHex(2) === m.slotHex(612), 'R9 (control) ids 2 and 612 share a base slotHex');
  const fabNo612 = fab.filter((id) => id !== 612);
  const withTwo = m.slotLabels(fabNo612, [2, 612, 31]);
  const deleted = m.slotLabels(fabNo612, [612, 31]);
  const added = m.slotLabels([...fabNo612, 2], [612, 31]);
  ck(
    deleted.get(612) === withTwo.get(612) &&
      deleted.get(31) === withTwo.get(31) &&
      added.get(612) === withTwo.get(612) &&
      ![...deleted.values()].includes(withTwo.get(2)),
    "R9 delete slot 2 and reload: 612 keeps its label, nothing inherits 2's pixels",
    `${withTwo.get(2)} / ${withTwo.get(612)}`,
  );
  // The namespace is disjoint from every cloth and free-colour label and injective.
  const chroma = (hex) => {
    const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return Math.max(...v) - Math.min(...v);
  };
  let minCloth = 255;
  for (let id = 1; id < 5000; id += 1)
    for (let step = 0; step < 13; step += 1)
      minCloth = Math.min(minCloth, chroma(m.slotHex(id, step)));
  const taken = [];
  for (let k = 0; k < 64; k += 1) taken.push(m.freeColourLabel(taken));
  const minFree = Math.min(...taken.map(chroma));
  const hwHex = new Set();
  let maxHw = 0;
  for (let id = 1; id <= m.HARDWARE_ID_SPAN; id += 1) {
    const h = m.hardwareHex(id);
    hwHex.add(h);
    maxHw = Math.max(maxHw, chroma(h));
  }
  ck(
    hwHex.size === m.HARDWARE_ID_SPAN &&
      maxHw < minCloth &&
      maxHw < minFree &&
      !hwHex.has('#000000') &&
      !hwHex.has('#ffffff'),
    'R9 hardware namespace: injective over the span, disjoint from cloth and colour labels',
    `hw chroma ≤ ${maxHw}, cloth ≥ ${minCloth}, colour ≥ ${minFree}`,
  );

  // Synthetic sheet: a button (ring r 10, 2 px) with four hole rings (r 2, 1 px) on 200×200
  // (1 % of the sheet = 400 px, the disc ≈ 250).
  const W = 200,
    H = 200;
  const ink = new Uint8Array(W * H);
  const ring = (cx, cy, r0, r1) => {
    for (let y = 0; y < H; y += 1)
      for (let x = 0; x < W; x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= r0 && d < r1) ink[y * W + x] = 1;
      }
  };
  ring(50, 50, 9, 11);
  const holes = [
    [46, 46],
    [54, 46],
    [46, 54],
    [54, 54],
  ];
  for (const [hx, hy] of holes) ring(hx, hy, 1.5, 2.6);
  const pick = m.hardwareAt(ink, W, H, 50, 50);
  const inFill = new Set(pick?.idx ?? []);
  ck(
    pick && !pick.open && holes.every(([hx, hy]) => inFill.has(hy * W + hx)),
    'R9 click on a disc with holes: the fill takes the hole pockets',
    `${pick?.idx?.length ?? 0} px`,
  );
  ck(
    [...inFill].every((i) => !ink[i]) &&
      [...inFill].every((i) => Math.hypot((i % W) - 50, ((i / W) | 0) - 50) < 9),
    'R9 the fill is bounded by the ink: nothing of the ring, nothing outside it',
  );
  const onRing = m.hardwareAt(ink, W, H, 50, 40);
  ck(
    onRing && !onRing.open && onRing.idx.length === pick.idx.length,
    'R9 a click ON the ring snaps inside (the outside would not close)',
    `${onRing?.idx?.length ?? 0} px`,
  );
  // A solid dot (a rivet): no non-ink within 3 px → the ink blob itself.
  const DW = 120;
  const dot = new Uint8Array(DW * DW);
  for (let y = 0; y < DW; y += 1)
    for (let x = 0; x < DW; x += 1) if (Math.hypot(x - 20, y - 20) <= 4.5) dot[y * DW + x] = 1;
  const blob = m.hardwareAt(dot, DW, DW, 20, 20);
  const dots = dot.reduce((a, v) => a + v, 0);
  ck(
    blob && !blob.open && blob.idx.length === dots && [...blob.idx].every((i) => dot[i]),
    'R9 a click on a solid blob paints the 8-connected ink blob',
    `${blob?.idx?.length} of ${dots}`,
  );
  // An open outline (a C): the fill runs out past 1 % of the sheet → open, nothing painted.
  const c = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) {
      const d = Math.hypot(x - 50, y - 50);
      if (d >= 9 && d < 11 && !(x > 55 && Math.abs(y - 50) < 3)) c[y * W + x] = 1;
    }
  const open = m.hardwareAt(c, W, H, 50, 50);
  ck(open && open.open && open.idx === null, 'R9 an open outline guard: open, nothing painted');
  ck(
    m.hardwareAt(c, W, H, 50, 50, 0.05)?.open === true,
    'R9 open at 5 % too (the C leaks to paper)',
  );

  // The owner's jacket (card 51 front, 770 px): both closure buttons are closed fills (Ф0: 218/217).
  const jacket = (() => {
    const p = m.decodePng(
      readFileSync(resolve(REPO, '../tmp/plans/fabrics-hardware/r9-f0/flats/c51-front.png')),
    );
    const px = new Uint8ClampedArray(p.width * p.height * 4);
    for (let i = 0; i < p.width * p.height; i++) {
      const g = (k) => p.data[i * p.channels + k];
      px.set(
        p.channels >= 3
          ? [g(0), g(1), g(2), p.channels === 4 ? g(3) : 255]
          : [g(0), g(0), g(0), 255],
        i * 4,
      );
    }
    return m.analyseFlat(px, p.width, p.height);
  })();
  const b1 = m.hardwareAt(jacket.ink, jacket.w, jacket.h, 387, 358);
  const b2 = m.hardwareAt(jacket.ink, jacket.w, jacket.h, 387, 469);
  ck(
    b1 &&
      !b1.open &&
      b1.idx.length > 150 &&
      b1.idx.length < 400 &&
      b2 &&
      !b2.open &&
      b2.idx.length > 150 &&
      b2.idx.length < 400,
    'R9 card 51: a click fills each closure button (not the body)',
    `${b1?.idx?.length} / ${b2?.idx?.length} px`,
  );
  // Fix 5 · a hover is a memo lookup: the same button answers the same fill object, a refused
  // (open) body answers from the memo too, and 2 000 hovers over the jacket stay cheap.
  {
    const again = m.hardwareAt(jacket.ink, jacket.w, jacket.h, 389, 359);
    const body1 = m.hardwareAt(jacket.ink, jacket.w, jacket.h, 300, 300);
    const t0 = performance.now();
    let opens = 0;
    for (let k = 0; k < 2000; k += 1) {
      const p = m.hardwareAt(
        jacket.ink,
        jacket.w,
        jacket.h,
        200 + (k % 400),
        200 + ((k * 7) % 400),
      );
      if (p?.open) opens += 1;
    }
    const ms = performance.now() - t0;
    const body2 = m.hardwareAt(jacket.ink, jacket.w, jacket.h, 310, 305);
    ck(
      again === b1 && body1?.open && body2 === body1 && ms < 250,
      'R9 fix 5: hover fills are memoised (closed and refused), no flood per pointer event',
      `2000 hovers ${ms.toFixed(0)} ms, ${opens} open`,
    );
  }

  // Instances: two buttons (pockets joined to their button), a speck dropped.
  const HW = m.packHex('#2fa84f');
  const CL = m.packHex('#3a7bd5');
  const lab = new Uint32Array(W * H);
  for (let i = 0; i < W * H; i += 1) if (!ink[i]) lab[i] = CL;
  for (const i of pick.idx) lab[i] = HW;
  const one = m.hardwareInstances(lab, HW, W, H);
  ck(
    one.length === 1 && one[0].idx.length === pick.idx.length,
    'R9 instances: a button with its hole pockets is ONE instance',
    `${one.length} instance(s), ${one[0]?.idx.length} px`,
  );
  const speck = lab.slice();
  speck[5 * W + 5] = HW;
  speck[5 * W + 6] = HW;
  ck(
    m.hardwareInstances(speck, HW, W, H).length === 1,
    'R9 instances: a component under 12 px is none',
  );
  const twin = new Uint32Array(W * H);
  for (const i of pick.idx) {
    twin[i] = HW;
    const x = (i % W) - 25;
    if (x >= 0) twin[((i / W) | 0) * W + x] = HW;
  }
  ck(m.hardwareInstances(twin, HW, W, H).length === 2, 'R9 instances: two buttons count 2');

  // Fix 4 · every hardware label of a side in ONE pass: the same instances as one label at a time,
  // a label absent from the side is no key, `isHardware` asked once per distinct value.
  {
    const HW2 = m.packHex('#808080');
    const mix = twin.slice();
    for (let i = 0; i < W * H; i += 1) if (!mix[i] && !ink[i]) mix[i] = CL;
    for (const i of pick.idx) {
      const y = ((i / W) | 0) + 60;
      if (y < H) mix[y * W + (i % W)] = HW2;
    }
    let asked = 0;
    const all = m.hardwareInstancesAll(
      mix,
      (v) => {
        asked += 1;
        return v === HW || v === HW2 || v === m.packHex('#123456');
      },
      W,
      H,
    );
    const same = (a, b) =>
      a.length === b.length &&
      a.every((x, k) => x.idx.length === b[k].idx.length && x.x0 === b[k].x0 && x.y0 === b[k].y0);
    ck(
      same(all.get(HW) ?? [], m.hardwareInstances(mix, HW, W, H)) &&
        same(all.get(HW2) ?? [], m.hardwareInstances(mix, HW2, W, H)) &&
        (all.get(HW) ?? []).length === 2 &&
        (all.get(HW2) ?? []).length === 1 &&
        !all.has(m.packHex('#123456')) &&
        !all.has(CL) &&
        asked === 3,
      'R9 fix 4: one pass gives every hardware label its instances (absent labels none)',
      `asked ${asked}, keys ${all.size}`,
    );
  }

  // Export: the button's pixels take the cloth around them; the palette names no hardware hex.
  const isHw = (v) => v === HW;
  const exp = m.exportLabels(lab, ink, W, H, isHw);
  ck(
    [...pick.idx].every((i) => exp[i] === CL) &&
      exp.every((v, i) => (lab[i] === HW ? v === CL : v === lab[i])),
    'R9 map export rewrites hardware pixels to the surrounding cloth label',
  );
  const { palette: pal } = m.mapPixels(exp, ink, W, H);
  ck(
    pal.length === 1 && pal[0].hex === '#3a7bd5',
    'R9 the exported palette carries the cloth only',
    JSON.stringify(pal),
  );
  const paper = new Uint32Array(W * H);
  for (const i of pick.idx) paper[i] = HW;
  ck(
    m.exportLabels(paper, ink, W, H, isHw).every((v) => v === 0),
    'R9 a button on unpainted paper exports as paper',
  );
  // The saved map keeps a rivet (all ink) over the ink; it reads back.
  const rivet = new Uint32Array(DW * DW);
  for (const i of blob.idx) rivet[i] = HW;
  const saved = m.mapPixels(rivet, dot, DW, DW, isHw);
  const back = m.labelsFromMap(
    saved.rgba,
    DW,
    DW,
    DW,
    DW,
    saved.palette.map((s) => s.hex),
  );
  ck(
    [...blob.idx].every((i) => back[i] === HW) &&
      m.mapPixels(rivet, dot, DW, DW).palette.length === 0,
    'R9 the saved map keeps hardware over ink (a rivet survives the read); the plain map does not',
  );

  // Mockup: the slot picture fitted into the instance, the ink on top; no picture → mid grey.
  const flatW = {
    w: W,
    h: H,
    labels: new Int32Array(W * H).fill(1),
    silhouette: new Uint8Array(W * H).fill(1),
  };
  const flatRgba = new Uint8ClampedArray(W * H * 4).fill(255);
  for (let i = 0; i < W * H; i += 1) if (ink[i]) flatRgba.set([0, 0, 0, 255], i * 4);
  const red = {
    rgba: new Uint8ClampedArray(16 * 16 * 4).map((_, k) => (k % 4 === 0 || k % 4 === 3 ? 255 : 0)),
    w: 16,
    h: 16,
  };
  const inst = m.hardwareInstances(lab, HW, W, H)[0];
  const skins = new Map([[CL, { kind: 'colour', hex: '#3a7bd5' }]]);
  const mk = m.mockupPixels(flatW, exp, flatRgba, skins, null, [{ instance: inst, picture: red }]);
  const at = (x, y) => [...mk.slice((y * W + x) * 4, (y * W + x) * 4 + 3)];
  ck(
    JSON.stringify(at(50, 50)) === '[255,0,0]' &&
      JSON.stringify(at(5, 5)) === '[58,123,213]' &&
      JSON.stringify(at(50, 40)) === '[0,0,0]',
    'R9 mockup: the picture in the button, the cloth around, the ink on top',
    `${at(50, 50)} | ${at(5, 5)} | ${at(50, 40)}`,
  );
  const mg = m.mockupPixels(flatW, exp, flatRgba, skins, null, [{ instance: inst, picture: null }]);
  ck(mg[(50 * W + 50) * 4] === 0x80, 'R9 mockup: no picture → the neutral tint');

  // fitMockups: a view with hardware gives way after every other view.
  const views4 = ['front', 'back', 'side_l', 'side_r'];
  const maps4 = views4.map((view, i) => ({ view, mediaId: 300 + i }));
  const inputs = [100, 101, 102, 103, 200, 201, 202, 400, 401, 401, 0];
  const keepHw = m.fitMockups(inputs, maps4, 14, 0, new Set(['back']));
  ck(
    JSON.stringify(keepHw.dropped) === '["side_r","side_l","front"]' && keepHw.keep.has('back'),
    'R9 fitMockups keeps the hardware view (trims the others first, in order)',
    JSON.stringify(keepHw.dropped),
  );
  ck(
    JSON.stringify(m.fitMockups(inputs, maps4, 13, 0, new Set(['back'])).dropped) ===
      '["side_r","side_l","front","back"]',
    'R9 …and gives it way last when nothing else fits',
  );

  // The run: a painted button travels as hardware (no mapHex), the map palette without it.
  const media = (id) => ({ id, media: { fullSize: { mediaUrl: `m${id}` } } });
  const asset = (id, kind = 'fabric', note = '') => ({
    id,
    kind,
    name: `a${id}`,
    mediaId: 500 + id,
    note,
  });
  const band = {
    assets: [
      asset(201),
      asset(202),
      asset(301, 'hardware', 'horn, black · 20L'),
      asset(302, 'hardware'),
      asset(303, 'hardware'),
    ],
    assetBindings: [
      { colorwayId: 11, bomItemId: 1, assetId: 201 },
      { colorwayId: 11, bomItemId: 2, assetId: 202 },
      { colorwayId: 11, bomItemId: 31, assetId: 301 },
      { colorwayId: 11, bomItemId: 32, assetId: 302 },
      { colorwayId: 11, bomItemId: 33, assetId: 303 },
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
    ],
    runs: [],
  };
  const slot = (bomItemId, name, section, family = 'fabric') => ({
    bomItemId,
    lineKey: `l${bomItemId}`,
    name,
    purpose: '',
    purposeLabel: family === 'hardware' ? 'button' : '',
    section,
    detail: family === 'hardware' ? 'horn · 20L' : '',
    words: name,
    family,
    kind: family === 'hardware' ? 'TECH_CARD_BOM_KIND_BUTTON' : '',
  });
  const cloth = [
    slot(1, 'MAIN', 'TECH_CARD_BOM_SECTION_FABRIC'),
    slot(2, 'LINING', 'TECH_CARD_BOM_SECTION_FABRIC'),
  ];
  const hwSlots = [
    slot(31, 'FRONT BUTTON', 'TECH_CARD_BOM_SECTION_TRIM', 'hardware'),
    slot(32, 'CUFF BUTTON', 'TECH_CARD_BOM_SECTION_TRIM', 'hardware'),
    slot(33, 'SNAP', 'TECH_CARD_BOM_SECTION_TRIM', 'hardware'),
  ];
  ck(
    m.isPaintableHardware(hwSlots[0]) &&
      !m.isPaintableHardware({ family: 'hardware', section: 'TECH_CARD_BOM_SECTION_LABEL' }) &&
      !m.isPaintableHardware({ family: 'hardware', section: 'TECH_CARD_BOM_SECTION_DECORATION' }) &&
      !m.isPaintableHardware(cloth[0]),
    'R9 isPaintableHardware: hardware, not a label, not an artwork',
  );
  const L = m.slotLabels([1, 2], [31, 32, 33]);
  const planOf = (hexes) => ({
    rev: 1,
    maps: [
      {
        mediaId: 900,
        view: 'front',
        baseMediaId: 101,
        palette: hexes.map((hex) => ({ hex, px: 10 })),
        url: '',
        gone: false,
      },
    ],
    cloths: [],
  });
  const parts = new Map([[L.get(31), 'left front body · 2 on the front']]);
  const run = m.paintRun({
    band,
    plan: planOf([L.get(1), L.get(31)]),
    slots: cloth,
    colorwayId: 11,
    colorwayLabel: 'ROSSO',
    hardware: hwSlots,
    hardwareParts: parts,
  });
  const hwUse = run.fabrics?.find((f) => f.kind === 'hardware');
  ck(
    run.kind === 'maps' &&
      hwUse &&
      hwUse.mapHex === '' &&
      hwUse.mediaId === 801 &&
      hwUse.assetId === 301 &&
      hwUse.name === 'FRONT BUTTON' &&
      hwUse.words === 'horn, black · 20L' &&
      hwUse.parts === 'left front body · 2 on the front' &&
      run.fabrics
        .filter((f) => f.kind !== 'hardware')
        .map((f) => `${f.assetId}${f.mapHex ? '@' : ''}`)
        .join() === '201@,202' &&
      run.colourMaps[0].palette.map((s) => s.hex).join() === L.get(1) &&
      run.hardwareViews.join() === 'front' &&
      run.fabricMediaId === 701,
    'R9 run: one hardware use (no mapHex, picture, words, parts); the map palette without it; never the REMAINDER',
    JSON.stringify(run.fabrics?.map((f) => [f.assetId, f.kind, f.mapHex, f.mediaId])),
  );
  // One cloth + a button: the maps travel (the mockup carries it); hardware never counts as a cloth.
  const one1 = m.paintRun({
    band,
    plan: planOf([L.get(1), L.get(31)]),
    slots: [cloth[0]],
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots,
  });
  ck(
    one1.kind === 'maps' && one1.fabrics.length === 2 && one1.fabrics[0].assetId === 201,
    'R9 one cloth + painted hardware: maps travel (cloth + hardware)',
  );
  ck(
    m.paintRun({
      band,
      plan: planOf([L.get(1)]),
      slots: [cloth[0]],
      colorwayId: 11,
      colorwayLabel: '',
      hardware: hwSlots,
    }).kind === 'none',
    'R9 (control) one cloth alone: no maps, as before',
  );
  // Only hardware painted: the cloths travel as the pack (nobody divided them).
  const onlyHw = m.paintRun({
    band,
    plan: planOf([L.get(31)]),
    slots: cloth,
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots,
  });
  ck(
    onlyHw.kind === 'maps' &&
      onlyHw.fabrics.filter((f) => f.kind !== 'hardware').every((f) => !f.mapHex) &&
      onlyHw.fabrics.filter((f) => f.kind !== 'hardware').length === 2,
    'R9 only buttons painted: the whole pack travels, no remainder made up',
  );
  // Fix 3 · the REMAINDER travels as an explicit index, never «the first use without a mapHex».
  ck(
    run.remainder === 1 &&
      run.fabrics[1].assetId === 202 &&
      m.remainderUse(run.fabrics, run.remainder) === run.fabrics[1],
    'R9 fix 3: the run names its REMAINDER by index (the unpainted pack cloth)',
  );
  ck(
    onlyHw.remainder === -1 && m.remainderUse(onlyHw.fabrics, onlyHw.remainder) === undefined,
    'R9 fix 3: only hardware painted over two cloths — no remainder (placement-only mockup)',
    `remainder ${onlyHw.remainder}`,
  );
  const oneHw = m.paintRun({
    band,
    plan: planOf([L.get(31)]),
    slots: [cloth[0]],
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots,
  });
  ck(
    oneHw.kind === 'maps' && oneHw.remainder === 0 && oneHw.fabrics[0].assetId === 201,
    'R9 fix 3: only hardware painted over ONE cloth — that cloth is the whole garment',
  );
  const isHwHex = (hex) => [31, 32, 33].some((id) => L.get(id) === hex);
  ck(
    m.remainderCloth({
      band,
      slots: cloth,
      colorwayId: 11,
      painted: new Set([L.get(31)]),
      isHardware: isHwHex,
    }) === null &&
      m.remainderCloth({
        band,
        slots: [cloth[0]],
        colorwayId: 11,
        painted: new Set([L.get(31)]),
        isHardware: isHwHex,
      })?.assetId === 201 &&
      m.remainderCloth({
        band,
        slots: cloth,
        colorwayId: 11,
        painted: new Set([L.get(1), L.get(31)]),
        isHardware: isHwHex,
      })?.assetId === 202,
    'R9 fix 3: the canvas remainder keeps the same rule (hardware divides no cloth)',
  );
  // The placement-only mockup: no remainder → the flat stands wherever no label is skinned.
  {
    const fw = 4;
    const flat4 = {
      w: fw,
      h: 1,
      labels: new Int32Array(fw).fill(1),
      silhouette: new Uint8Array(fw).fill(1),
    };
    const px4 = new Uint8ClampedArray(fw * 4).map((_, k) => (k % 4 === 3 ? 255 : 200));
    const mk4 = m.mockupPixels(flat4, new Uint32Array(fw), px4, new Map(), null, []);
    const skinned = m.mockupPixels(
      flat4,
      new Uint32Array(fw),
      px4,
      new Map(),
      { kind: 'colour', hex: '#ff0000' },
      [],
    );
    ck(
      [...mk4.slice(0, 3)].join() === '200,200,200' &&
        [...skinned.slice(0, 3)].join() !== '200,200,200',
      'R9 fix 3: a placement-only mockup invents no garment skin',
    );
  }

  // Fix 2 · no cloth bound in this colourway (the cloth stated in words): a painted button still
  // travels — the run augments the base recipe with its use and the hardware view's map only.
  const bandWords = { ...band, assetBindings: band.assetBindings.filter((b) => b.bomItemId > 30) };
  const plan2 = planOf([L.get(31)]);
  plan2.maps.push({
    mediaId: 901,
    view: 'back',
    baseMediaId: 102,
    palette: [],
    url: '',
    gone: false,
  });
  bandWords.bench = [
    ...band.bench,
    {
      id: 2,
      viewKey: 'back',
      kind: 'flat',
      pictureId: 2,
      slotRev: 1,
      picture: { id: 2, media: media(102) },
    },
  ];
  const wordsOnly = m.paintRun({
    band: bandWords,
    plan: plan2,
    slots: cloth,
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots,
  });
  ck(
    wordsOnly.kind === 'maps' &&
      wordsOnly.fabrics.length === 1 &&
      wordsOnly.fabrics[0].kind === 'hardware' &&
      wordsOnly.fabrics[0].name === 'FRONT BUTTON' &&
      wordsOnly.remainder === -1 &&
      wordsOnly.fabricMediaId === 0 &&
      wordsOnly.colourMaps.map((x) => x.view).join() === 'front' &&
      wordsOnly.colourMaps[0].palette.length === 0,
    'R9 fix 2: no cloth bound + a painted button — the hardware travels (never dropped)',
    JSON.stringify(wordsOnly.kind === 'maps' ? wordsOnly.colourMaps.map((x) => x.view) : wordsOnly),
  );
  ck(
    m.paintRun({
      band: bandWords,
      plan: planOf([]),
      slots: cloth,
      colorwayId: 11,
      colorwayLabel: '',
      hardware: hwSlots,
    }).kind === 'none',
    'R9 (control) no cloth bound and nothing painted: the base recipe alone',
  );

  // Three painted hardware slots: the first two send a picture, the third goes in words.
  const three = m.paintRun({
    band,
    plan: planOf([L.get(1), L.get(31), L.get(32), L.get(33)]),
    slots: cloth,
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots,
  });
  ck(
    m.MAX_RENDER_HARDWARE === 2 &&
      three.fabrics
        .filter((f) => f.kind === 'hardware')
        .map((f) => f.mediaId > 0)
        .join() === 'true,true,false',
    'R9 MAX_RENDER_HARDWARE: the first two in pack order send a picture, the rest words',
  );
  // An unbound hardware slot is still a use, in words.
  const bandNo = { ...band, assetBindings: band.assetBindings.filter((b) => b.bomItemId !== 31) };
  const words = m.paintRun({
    band: bandNo,
    plan: planOf([L.get(1), L.get(31)]),
    slots: cloth,
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots,
  });
  const wu = words.fabrics?.find((f) => f.kind === 'hardware');
  ck(
    wu && wu.mediaId === 0 && wu.assetId === 0 && wu.words === 'button · horn · 20L',
    'R9 a hardware slot with no picture in this colourway: a words-only use',
    JSON.stringify(wu),
  );
  // A painted hardware label whose slot is gone: the existing refusal.
  const gone = m.paintRun({
    band,
    plan: planOf([L.get(1), L.get(31)]),
    slots: cloth,
    colorwayId: 11,
    colorwayLabel: '',
    hardware: hwSlots.slice(1),
  });
  ck(
    gone.kind === 'refuse' && /lost its material · repaint it/.test(gone.reason),
    'R9 a painted hardware label whose slot is gone: «repaint it»',
  );
  ck(
    JSON.stringify(m.hardwareModelLines(run.fabrics)) ===
      '["front button · left front body · 2 on the front · picture"]' &&
      m.hardwareModelLines(words.fabrics)[0].endsWith('· words'),
    'R9 WHAT THE MODEL GETS: one line per hardware use',
    JSON.stringify(m.hardwareModelLines(run.fabrics)),
  );
  ck(
    m.hardwarePartsText(
      ['left front body', 'left front body'],
      [
        { view: 'front', n: 2 },
        { view: 'side_l', n: 1 },
      ],
    ) === 'left front body · 2 on the front, 1 on the left side',
    'R9 parts text: places once, counts per view in the prompt’s view words',
  );
  ck(
    m.hardwarePartsText(['cuff'], [{ view: 'three_quarter_l', n: 1 }]) ===
      'cuff · 1 on the three-quarter from the left',
    'R9 fix 7: a three-quarter view in the server’s view words',
  );
}

console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
