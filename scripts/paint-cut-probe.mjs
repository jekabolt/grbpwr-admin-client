#!/usr/bin/env node
// PAINT THE PARTS · M5 — the v5 cutter against the owner's complaints of 06.10
// (tmp/plans/flat-consistency/98-SIDE-GENERAL.md §5, `e5_cut.py`):
//   A  the owner's FRONT (shots/owner-1006/11.webp, fine bindings, a dashed V) is no longer ONE
//      region («pen only»): the neck binding and the V are regions of their own;
//   B  every saved side of cards 38 / 51 and of run 162 cuts into 1..60 regions (namable);
//   C  an OPENING is never a seed: once a side's hole is an opening, cloth grows first — the hole
//      never gains a pixel (it keeps its own edge strip, inside its line), no pixel of the garment
//      is left unlabelled;
//   D  a BAND is one region: a strip cut in pieces by seams across it, a ring round a hole, joins
//      up — never into the body or the hole beside it; two strips side by side along a line stay two;
//   E  STITCHING is no wall: a dashed stitch line down a band keeps the band a region; a FREE
//      dashed line (a layer's edge, a V) across the body still cuts it; a twin-needle hem set back
//      from its edge is stitching too — no ladder of rungs chops the strip under it.
//   node scripts/paint-cut-probe.mjs
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const IN = resolve(REPO, '../tmp/plans/flat-consistency/in/m5');
const outfile = resolve(tmpdir(), `paint-cut-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'paint-cut-entry.ts')],
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

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad += 1;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

const load = (name) => {
  const file = resolve(IN, `${name}.png`);
  if (!existsSync(file)) return null;
  const png = m.decodePng(readFileSync(file));
  const { width: w, height: h, channels: c, data } = png;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p += 1) {
    for (let k = 0; k < 3; k += 1) rgba[p * 4 + k] = data[p * c + (c >= 3 ? k : 0)];
    rgba[p * 4 + 3] = c === 4 ? data[p * 4 + 3] : c === 2 ? data[p * 2 + 1] : 255;
  }
  return { w, h, flat: m.analyseFlat(rgba, w, h) };
};
const at = (f, x, y) => f.labels[y * f.w + x];
const share = (f, id) => {
  let n = 0;
  let all = 0;
  for (let i = 0; i < f.labels.length; i += 1) {
    if (f.labels[i]) all += 1;
    if (f.labels[i] === id) n += 1;
  }
  return n / Math.max(1, all);
};

ck(m.REGIONS_ALGO_REV === 'regions.v5', 'the cutter is regions.v5', m.REGIONS_ALGO_REV);

/* A · the owner's front */
{
  const o = load('o11-front');
  if (!o) console.log('  skip  o11-front');
  else {
    const f = o.flat;
    const body = at(f, 655, 740);
    const neck = at(f, 661, 165);
    const v = at(f, 658, 312);
    ck(
      f.count >= 2 && f.count <= 60,
      'A owner front: namable, not «pen only»',
      `${f.count} regions`,
    );
    ck(neck > 0 && body > 0 && neck !== body, 'A owner front: the neck binding is its own region');
    const vs = share(f, v);
    ck(
      v > 0 && v !== body && v !== neck && vs >= 0.08 && vs <= 0.25,
      'A owner front: the dashed V is its own region',
      `${Math.round(vs * 100)} %`,
    );
  }
}

/* B · every saved side cuts into 1..60 regions */
for (const name of [
  'c38-front-870',
  'c38-back-871',
  'c38-side_l-872',
  'c38-side_r-873',
  'c51-front-861',
  'c51-back-862',
  'c51-side_l-863',
  'c51-side_r-864',
  'r162-front',
  'r162-back',
  'r162-side_l',
  'r162-side_r',
]) {
  const o = load(name);
  if (!o) {
    console.log(`  skip  ${name}`);
    continue;
  }
  ck(o.flat.count >= 1 && o.flat.count <= 60, `B ${name}: namable`, `${o.flat.count} regions`);
}

/* C · an opening is never a seed */
for (const [name, x, y] of [
  ['c38-side_l-872', 417, 191],
  ['c38-side_r-873', 336, 190],
  ['r162-side_l', 230, 221],
  ['r162-side_r', 218, 222],
  ['c38-back-871', 376, 301],
  ['r162-back', 214, 345],
]) {
  const o = load(name);
  if (!o) {
    console.log(`  skip  ${name}`);
    continue;
  }
  const f = o.flat;
  const hole = at(f, x, y);
  const g = m.withOpenings(f, (r) => r === hole);
  let gained = 0;
  let unlabelled = 0;
  let given = 0;
  let edge = 0;
  for (let i = 0; i < g.labels.length; i += 1) {
    if (g.labels[i] === hole && f.labels[i] !== hole) gained += 1;
    if (f.labels[i] === hole && g.labels[i] !== hole) given += 1;
    if (g.labels[i] === hole && f.raw[i] !== hole) edge += 1;
    if (!g.labels[i] && f.silhouette[i] && !f.walls[i]) unlabelled += 1;
  }
  ck(
    hole > 0 && g !== f && g.openings?.[hole] === 1 && gained === 0 && unlabelled === 0,
    `C ${name}: the hole never gains a pixel, nothing left unlabelled`,
    `hole ${hole} · keeps ${edge} px of its edge strip · ${given} px went to cloth · ${unlabelled} unlabelled`,
  );
}

/* D · E · drawn cases */
// 800 px: the gap a dash reaches (1.4 % = 11 px) is wider than the closing (r = 3) shuts alone.
const W = 800;
const H = 800;
const sheet = () => {
  const px = new Uint8ClampedArray(W * H * 4).fill(255);
  const dot = (x, y, grey = 0) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = (y * W + x) * 4;
    px[p] = px[p + 1] = px[p + 2] = grey;
  };
  const thick = (x, y, t, grey) => {
    for (let dy = -t; dy <= t; dy += 1)
      for (let dx = -t; dx <= t; dx += 1) dot(x + dx, y + dy, grey);
  };
  const seg = (x0, y0, x1, y1, t = 1, grey = 0) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k += 1)
      thick(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), t, grey);
  };
  const dashed = (x0, y0, x1, y1, on = 3, off = 7, grey = 60) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k += 1)
      if (k % (on + off) < on)
        dot(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), grey);
  };
  const ring = (cx, cy, r, t = 1) => {
    for (let a = 0; a < 2 * Math.PI; a += 0.5 / r)
      thick(Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a)), t, 0);
  };
  const outline = () => {
    seg(40, 40, 760, 40, 1);
    seg(760, 40, 760, 760, 1);
    seg(760, 760, 40, 760, 1);
    seg(40, 760, 40, 40, 1);
  };
  return { px, seg, dashed, ring, outline };
};
const cut = (s) => {
  const f = m.analyseFlat(s.px, W, H);
  return { f, id: (x, y) => f.labels[y * W + x] };
};

// D1 · a band (20 px between two lines) cut by three seams across it: one region, not the body.
{
  const s = sheet();
  s.outline();
  s.seg(40, 200, 760, 200, 1);
  s.seg(40, 222, 760, 222, 1);
  for (const x of [240, 440, 600]) s.seg(x, 200, x, 222, 1);
  const { f, id } = cut(s);
  const parts = [120, 340, 520, 680].map((x) => id(x, 211));
  ck(
    parts.every((v) => v > 0 && v === parts[0]) &&
      id(400, 120) !== parts[0] &&
      id(400, 500) !== parts[0],
    'D1 a band cut by seams across it is one region, never the body',
    `band ${parts.join('/')} · above ${id(400, 120)} · below ${id(400, 500)} · ${f.count} regions`,
  );
}
// D2 · two bands side by side along a solid line: two regions.
{
  const s = sheet();
  s.outline();
  s.seg(40, 200, 760, 200, 1);
  s.seg(40, 222, 760, 222, 1);
  s.seg(40, 244, 760, 244, 1);
  const { id } = cut(s);
  ck(
    id(400, 211) > 0 && id(400, 233) > 0 && id(400, 211) !== id(400, 233),
    'D2 two strips side by side along a solid line stay two',
    `${id(400, 211)} / ${id(400, 233)}`,
  );
}
// D3 · a ring band round a hole, cut by seams: one ring, not the hole, not the body.
{
  const s = sheet();
  s.outline();
  s.ring(400, 400, 120, 1);
  s.ring(400, 400, 142, 1);
  for (const a of [0.3, 1.9, 3.4, 4.8]) {
    const c = Math.cos(a);
    const d = Math.sin(a);
    s.seg(
      Math.round(400 + 120 * c),
      Math.round(400 + 120 * d),
      Math.round(400 + 142 * c),
      Math.round(400 + 142 * d),
      1,
    );
  }
  const { id } = cut(s);
  const ring = [0, 1.2, 2.6, 4.1, 5.5].map((a) =>
    id(Math.round(400 + 131 * Math.cos(a)), Math.round(400 + 131 * Math.sin(a))),
  );
  ck(
    ring.every((v) => v > 0 && v === ring[0]) && id(400, 400) !== ring[0] && id(80, 80) !== ring[0],
    'D3 a ring round a hole, cut by seams, is one region — not the hole, not the body',
    `ring ${ring.join('/')} · hole ${id(400, 400)} · body ${id(80, 80)}`,
  );
}
// E1 · a dashed stitch line down a band: the band stays a region (no ladder of rungs).
{
  const s = sheet();
  s.outline();
  s.seg(40, 200, 760, 200, 1);
  s.seg(40, 222, 760, 222, 1);
  s.dashed(46, 211, 754, 211);
  const { id } = cut(s);
  const band = [120, 400, 680].map((x) => id(x, 205));
  ck(
    band.every((v) => v > 0 && v === band[0]) &&
      band[0] !== id(400, 120) &&
      band[0] !== id(400, 500),
    'E1 a band with a dashed stitch line down it stays one region',
    `band ${band.join('/')} · above ${id(400, 120)} · below ${id(400, 500)}`,
  );
}
// E2 · a free dashed V across the body (a layer's edge seen through): it cuts the body.
{
  const s = sheet();
  s.outline();
  s.dashed(160, 44, 400, 520);
  s.dashed(640, 44, 400, 520);
  const { id } = cut(s);
  const inV = id(400, 200);
  ck(
    inV > 0 && inV !== id(120, 600) && inV !== id(680, 600),
    'E2 a free dashed V across the body is its own region',
    `V ${inV} · body ${id(120, 600)}`,
  );
}
// E3 · a twin-needle hem: the inner row 9 px up (stitching beside the hem line), the outer 14 px
// (farther than a gap — read alone, free, each dash an END that rungs to the hem line). Both are
// stitching: no rung crosses the strip under them, and the strip stays whole.
{
  const s = sheet();
  s.outline();
  s.dashed(46, 751, 754, 751);
  s.dashed(51, 746, 749, 746);
  const { f, id } = cut(s);
  let rungs = 0;
  for (let x = 60; x <= 740; x += 1) if (f.walls[755 * W + x] && !f.ink[755 * W + x]) rungs += 1;
  const strip = [80, 200, 330, 400, 470, 600, 720].map((x) => id(x, 755));
  ck(
    rungs === 0 && strip.every((v) => v > 0 && v === strip[0]),
    'E3 no rung crosses the strip under a twin-needle hem; it stays whole',
    `${rungs} px of rungs · strip ${strip.join('/')}`,
  );
}

console.log(bad ? `\n${bad} FAIL` : '\nall ok');
process.exit(bad ? 1 : 0);
