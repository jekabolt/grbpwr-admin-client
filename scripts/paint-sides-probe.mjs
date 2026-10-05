#!/usr/bin/env node
// PAINT THE PARTS · Ф1 — the wearer's left/right checked on the drawing (front/back centroids, the
// side view's flank from where its front faces) and the `opening` group that never paints.
//   node scripts/paint-sides-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

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
  m.PARTS_ALGO_REV.length <= 32 && m.PARTS_ALGO_REV.startsWith('regions.v3+'),
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

console.log(bad ? `\n${bad} FAILED` : '\nall ok');
process.exit(bad ? 1 : 0);
