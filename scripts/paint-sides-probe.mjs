#!/usr/bin/env node
// PAINT THE PARTS · Ф1 — the wearer's left/right checked on the drawing (front/back centroids, the
// side view's flank from where its front faces) and the `opening` group that never paints.
// f3 — a "binding" / "band" wider than BAND_MAX_WIDTH of the silhouette leaves its group (`fixBands`).
//   node scripts/paint-sides-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `paint-sides-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-sides-entry.ts')],
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

// A 100×50 garment cut in three columns: region 1 = x 0..39 (picture-left), 3 = 40..59, 2 = 60..99.
const W = 100;
const H = 50;
const labels = new Int32Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) labels[y * W + x] = x < 40 ? 1 : x >= 60 ? 2 : 3;
const flat = { w: W, h: H, labels, count: 3 };
const seeds = new Int32Array([-1, 20 * W + 20, 20 * W + 80, 20 * W + 50]);
const lay = (view, groups) => m.partsOf({ parts: groups, splitNeeded: [] }, flat, seeds, view);
const g = (label, regions, partKey = label.replace(/\W+/g, '-')) => ({ label, regions, partKey });
const keys = new Map([
  ['left sleeve', 'left-sleeve'],
  ['right sleeve', 'right-sleeve'],
]);
const names = (p) => p.groups.map((x) => `${x.label}[${x.key}]:${x.regions.join(',')}`).join(' | ');

ck(
  m.PARTS_ALGO_REV.length <= 32 && m.PARTS_ALGO_REV.startsWith('regions.v4+'),
  'parts rev fits the server cap',
  m.PARTS_ALGO_REV,
);

/* front: the wearer's left is the picture's RIGHT */
{
  const p = lay('front', [g('left sleeve', [1]), g('right sleeve', [2]), g('front body', [3])]);
  const f = m.fixSides('front', p, flat, keys);
  ck(
    names(f) ===
      'right sleeve[right-sleeve]:1 | left sleeve[left-sleeve]:2 | front body[front-body]:3',
    'front: a mirrored pair swaps names and keys',
    names(f),
  );
  const ok = lay('front', [g('right sleeve', [1]), g('left sleeve', [2])]);
  ck(m.fixSides('front', ok, flat, keys) === ok, 'front: a right pair is left alone');
  const one = lay('front', [g('left sleeve', [1]), g('right sleeve', [3])]);
  ck(m.fixSides('front', one, flat, keys) === one, 'front: one member at the centre — no swap');
}
/* back: the wearer's left is the picture's LEFT */
{
  const p = lay('back', [g('left sleeve', [1]), g('right sleeve', [2])]);
  ck(m.fixSides('back', p, flat, keys) === p, 'back: left on picture-left is right');
  const q = lay('back', [
    g('left sleeve', [2]),
    g('right sleeve', [1]),
    g('left strap · inside', [3], 'left-strap'),
  ]);
  ck(
    names(m.fixSides('back', q, flat, keys)) ===
      'right sleeve[right-sleeve]:2 | left sleeve[left-sleeve]:1 | left strap · inside[left-strap]:3',
    'back: a mirrored pair swaps',
    names(m.fixSides('back', q, flat, keys)),
  );
}
/* side: the flank from where the front faces */
{
  // front body picture-left of the back body → the front faces LEFT → the wearer's LEFT flank.
  const p = lay('side_r', [g('front body', [1]), g('back body', [2]), g('right sleeve', [3])]);
  ck(
    names(m.fixSides('side_r', p, flat, keys)) ===
      'front body[front-body]:1 | back body[back-body]:2 | left sleeve[left-sleeve]:3',
    'side: the drawing shows the left flank → "right sleeve" takes the left twin',
    names(m.fixSides('side_r', p, flat, keys)),
  );
  const facingRight = lay('side_r', [
    g('front body', [2]),
    g('back body', [1]),
    g('right sleeve', [3]),
  ]);
  ck(
    m.fixSides('side_r', facingRight, flat, keys) === facingRight,
    'side: flank agrees — untouched',
  );
  const unsure = lay('side_l', [g('front body', [3]), g('right sleeve', [1])]);
  ck(
    m.fixSides('side_l', unsure, flat, keys) === unsure,
    'side: no back part — facing unread, untouched',
  );
  const noTwin = lay('side_l', [g('front body', [1]), g('back body', [2]), g('right cuff', [3])]);
  ck(
    m.fixSides('side_l', noTwin, flat, keys) === noTwin,
    'side: a twin with no key on the card stays',
  );
  const inside = lay('side_l', [
    g('front body', [1]),
    g('back body', [2]),
    g('right front · inside', [3], 'right-front'),
  ]);
  ck(
    m.fixSides('side_l', inside, flat, keys) === inside,
    'side: the inside of the far side is never moved',
  );
}
/* openings */
{
  const p = lay('back', [g('back body', [1, 2]), g('opening', [3], 'opening')]);
  const all = Int32Array.from({ length: W * H }, (_, i) => i);
  const kept = m.dropOpenings(all, flat, p);
  ck(
    kept.length === 80 * H && [...kept].every((i) => labels[i] !== 3),
    'pen/click: opening pixels dropped',
    `${kept.length}`,
  );
  ck(
    m.dropOpenings(all, flat, lay('back', [g('back body', [1, 2, 3])])) === all,
    'no opening: the same pixels',
  );
  const other = lay('front', [g('front body', [1, 2]), g('opening', [3], 'opening')]);
  const sides = [
    { view: 'back', parts: p },
    { view: 'front', parts: other },
  ];
  ck(m.partAcross(sides, 'back', 1).length === 0, 'an opening is no part across the sides');
  ck(
    JSON.stringify(m.partAcross(sides, 'back', 0)) ===
      JSON.stringify([{ view: 'back', groups: [0] }]),
    'a part never fans out into an opening',
    JSON.stringify(m.partAcross(sides, 'back', 0)),
  );
  ck(!m.transferable('opening') && m.transferable('back body'), 'an opening name does not travel');
}

/* f3 · a band is a thin strip (`fixBands`) */
{
  // Synthetic: a 100-px-wide silhouette at x 10..109, y 10..59; region 1 = the body around region 2,
  // a 1-px line between them.
  const SW = 120;
  const SH = 70;
  const mk = (x0, x1, y0, y1) => {
    const lab = new Int32Array(SW * SH);
    const sil = new Uint8Array(SW * SH);
    for (let y = 10; y < 60; y++)
      for (let x = 10; x < 110; x++) {
        sil[y * SW + x] = 1;
        const inner = x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const line = x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
        lab[y * SW + x] = inner ? 2 : line ? 0 : 1;
      }
    return { w: SW, h: SH, labels: lab, silhouette: sil, count: 2 };
  };
  const ans = (f, band) =>
    m.partsOf(
      { parts: [g('back body', [1]), g(band, [2])], splitNeeded: [] },
      f,
      new Int32Array([-1, 15 * SW + 15, 35 * SW + 60]),
      'back',
    );
  const wideIn = mk(50, 69, 25, 44); // 20 px = 20 % of the silhouette, no border with the outside
  const p = ans(wideIn, 'waist binding');
  ck(
    names(m.fixBands(p, wideIn)) === 'back body[back-body]:1 | back body · inside[back-body]:2',
    'wide band inside the garment → the body’s inside',
    names(m.fixBands(p, wideIn)),
  );
  const thin = mk(30, 89, 33, 36); // 4 px = 4 %
  const q = ans(thin, 'waist band');
  ck(m.fixBands(q, thin) === q, 'thin band untouched');
  const wideOut = mk(10, 29, 25, 44); // 20 px, on the outline
  const o = ans(wideOut, 'side binding');
  ck(
    names(m.fixBands(o, wideOut)) === 'back body[back-body]:1 | opening[opening]:2',
    'wide band on the outline → opening',
    names(m.fixBands(o, wideOut)),
  );
  const strap = ans(wideIn, 'waistband');
  ck(m.fixBands(strap, wideIn) === strap, '"waistband" / "strap" are no band words');
  // Order (use-paint `laid`): fixSides first, so the inside takes the owner's corrected name/key.
  {
    const SW2 = 120;
    const lab = new Int32Array(SW2 * 70);
    const sil = new Uint8Array(SW2 * 70);
    for (let y = 10; y < 60; y++)
      for (let x = 10; x < 110; x++) {
        sil[y * SW2 + x] = 1;
        const inner = x >= 80 && x <= 99 && y >= 25 && y <= 44;
        const line = x >= 79 && x <= 100 && y >= 24 && y <= 45;
        lab[y * SW2 + x] = inner ? 3 : line ? 0 : x < 60 ? 1 : 2;
      }
    const f = { w: SW2, h: 70, labels: lab, silhouette: sil, count: 3 };
    const k2 = new Map([
      ['left panel', 'left-panel'],
      ['right panel', 'right-panel'],
    ]);
    // front: the wearer's left must sit picture-right — the answer has them mirrored.
    const p = m.partsOf(
      {
        parts: [g('left panel', [1]), g('right panel', [2]), g('panel binding', [3])],
        splitNeeded: [],
      },
      f,
      new Int32Array([-1, 30 * SW2 + 30, 30 * SW2 + 70, 35 * SW2 + 90]),
      'front',
    );
    const out = names(m.fixBands(m.fixSides('front', p, f, k2), f));
    ck(
      out.includes('left panel · inside[left-panel]:3') && out.includes('left panel[left-panel]:2'),
      'inside follows the owner after the L/R swap',
      out,
    );
  }
}
/* f3 · the live labels (tmp/plans/flat-consistency/shots/paint-qa/f3-labels.json) on real flats */
{
  const QA = resolve(REPO, '../tmp/plans/flat-consistency/in/paint-qa');
  const LIVE = resolve(REPO, '../tmp/plans/flat-consistency/shots/paint-qa/f3-labels.json');
  const cut = (name) => {
    const file = resolve(QA, `${name}.png`);
    if (!existsSync(file)) return null;
    const png = m.decodePng(readFileSync(file));
    const { width: w, height: h, channels: c, data } = png;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      const at = (k) => (c >= 3 ? data[p * c + k] : data[p * c]);
      rgba[p * 4] = at(0);
      rgba[p * 4 + 1] = at(1);
      rgba[p * 4 + 2] = at(2);
      rgba[p * 4 + 3] = c === 4 || c === 2 ? data[p * c + c - 1] : 255;
    }
    return m.analyseFlat(rgba, w, h);
  };
  const live = existsSync(LIVE) ? JSON.parse(readFileSync(LIVE, 'utf8')).cards : null;
  const run = (card, view, name, remap = (r) => r) => {
    const f = cut(name);
    const rows = live?.[card]?.views?.[view];
    if (!f || !rows) return console.log(`  skip  ${name}`), null;
    const p = m.partsOf(
      { parts: rows.map((x) => ({ ...x, regions: x.regions.map(remap) })), splitNeeded: [] },
      f,
      undefined,
      view,
    );
    return { f, p, fixed: m.fixBands(p, f) };
  };
  // Card 38 front: the neck binding (region 2, 4.0 % wide) is a real thin binding.
  const front = run('38', 'front', 'c38-front-537');
  if (front) ck(front.fixed === front.p, 'c38 front: the neck binding stays', names(front.fixed));
  // Card 49 sides: cuffs / placket / collar — no band word, nothing moves.
  for (const [view, name] of [
    ['side_l', 'c49-side_l-517'],
    ['side_r', 'c49-side_r-518'],
  ]) {
    const r = run('49', view, name);
    if (r) ck(r.fixed === r.p, `c49 ${view}: untouched`);
  }
  // Card 38 back (base 541). Its flat is not in the QA set: c38-back-541r.png is the drawing's black
  // ink kept from shots/paint-qa/c38-back-after.png (825 px, same cut: 7 regions); there the two
  // triangles come out as 3 = picture-right, 4 = picture-left, the live answer's 3 / 4 the other way.
  const back = run('38', 'back', 'c38-back-541r', (r) => (r === 3 ? 4 : r === 4 ? 3 : r));
  if (back) {
    const after = names(back.fixed);
    ck(
      back.f.count === 7 &&
        after.includes('opening[opening]:3,4') &&
        !/binding/.test(after) &&
        after.includes('right strap[right-strap]:1') &&
        after.includes('left strap[left-strap]:2,5') &&
        after.includes('back body[back-body]:7') &&
        after.includes('front body · inside[front-body]:6'),
      'c38 back: the two "armhole binding" triangles → opening, the rest kept',
      after,
    );
    // A strap named a binding is a thin strip (5.6 %): it stays.
    const rows = live['38'].views.back.map((x) =>
      x.partKey === 'right-strap' ? { ...x, label: 'right strap binding' } : x,
    );
    const p = m.partsOf({ parts: rows, splitNeeded: [] }, back.f, undefined, 'back');
    const fx = m.fixBands(p, back.f);
    ck(
      fx.groups.some((x) => x.label === 'right strap binding' && x.regions.join() === '1'),
      'c38 back: a strap binding (thin) stays',
      names(fx),
    );
  }
}

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
