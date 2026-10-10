#!/usr/bin/env node
// `yarn pom:check` — the POM engine (src/lib/pom) on real patterns, with gates.
//
// Files: corpus (SS26-005 probe copy, Allsizes 5 sizes, blazer unnamed, summer men, leonie trousers
// trace) + the prod snapshot (tmp/plans/assembly-3d-doll/prod-data: cards 4–16 with their card
// piece facts). Every file: roles coverage, per-size POM table, an SVG/PNG sheet of the base size.
//
// Gates:
//  G1 SS26-005 M: chest, HPS length, across shoulder, sleeve length, hem, neck width within ±5 mm of
//     a HAND measurement made on the raw DXF by a different code path (the 09.10 probe's own DXF
//     reader + hand-written definitions below), and the engine calls them exact;
//  G2 Allsizes: every POM found in all sizes is monotonic XS → XL (≥ −1 mm per step);
//  G3 roles ≥ 0.6 on ≥ 80 % of edges of every NAMED file (≥ 80 % of pieces carry a known kind);
//  G4 blazer (unnamed pieces): every POM is «not found» — no guesses;
//  G5 negative controls: shoulder↔hem swapped moves HPS length out of G1; neckline↔hem swapped
//     makes it inexact (the HPS corner is lost) — both must turn G1 red.
// Plus a SANITY line (not a fit judgement): pattern chest/hip full − a fit model's body girth.
//
// Usage: node scripts/pom/check.mjs   (POM_PLANS=<tmp/plans dir>, POM_OUT=<out dir>, CHROME=<path>)

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `pom-check-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'check-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const mod = await import(pathToFileURL(outfile).href);

const plans = process.env.POM_PLANS ?? resolve(here, '../../../tmp/plans');
const outDir = process.env.POM_OUT ?? resolve(plans, 'assembly-3d-doll/pom-check');
await mkdir(outDir, { recursive: true });
const corpus = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo');
const prod = resolve(plans, 'assembly-3d-doll/prod-data');
const cards = existsSync(resolve(prod, 'cards.json'))
  ? JSON.parse(await readFile(resolve(prod, 'cards.json'), 'utf8'))
  : {};
const fitModels = existsSync(resolve(prod, 'fit-models.json'))
  ? JSON.parse(await readFile(resolve(prod, 'fit-models.json'), 'utf8'))
  : [];
const prodFile = (id, purpose) => {
  const dir = resolve(prod, 'dxf');
  if (!existsSync(dir)) return null;
  return (
    execFileSync('ls', [dir])
      .toString()
      .split('\n')
      .filter((f) => f.startsWith(`card${id}-${purpose}`))
      .map((f) => resolve(dir, f))[0] ?? null
  );
};

const FILES = [
  {
    id: 'ss26',
    label: 'SS26-005 (probe copy)',
    dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
    category: 'shirt',
    card: '5',
  },
  {
    id: 'allsizes',
    label: 'Allsizes_with_notches (5 sizes)',
    dxf: resolve(corpus, 'Allsizes_with_notches.dxf'),
    category: 'shirt',
    card: '4',
  },
  { id: 'summer', label: 'summer men', dxf: resolve(corpus, 'summer men.dxf'), category: 'shirt' },
  {
    id: 'blazer',
    label: 'blazer.dxf (unnamed pieces)',
    dxf: resolve(homedir(), 'Downloads/blazer.dxf'),
    category: 'jacket-lined',
    unnamed: true,
  },
  {
    id: 'leonie',
    label: 'leonie trousers (PDF trace, back legs only)',
    dxf: resolve(plans, 'pdf-to-dxf/reports/E2E-out/leonie/leonie-main.dxf'),
    category: 'trousers',
    trace: true,
  },
  {
    id: 'card4',
    label: 'prod card 4 SS26-004 shirt',
    dxf: prodFile(4, 'UNSET'),
    category: 'shirt',
    card: '4',
  },
  {
    id: 'card5',
    label: 'prod card 5 SS26-005 shirt',
    dxf: prodFile(5, 'UNSET'),
    category: 'shirt',
    card: '5',
  },
  {
    id: 'card6',
    label: 'prod card 6 SS26-006 shirt MAIN',
    dxf: prodFile(6, 'MAIN'),
    category: 'shirt',
    card: '6',
  },
  {
    id: 'card7',
    label: 'prod card 7 SS26-007 pants MAIN',
    dxf: prodFile(7, 'MAIN'),
    category: 'trousers',
    card: '7',
  },
  {
    id: 'card8',
    label: 'prod card 8 SS26-008 blazer MAIN',
    dxf: prodFile(8, 'MAIN'),
    category: 'jacket-lined',
    card: '8',
  },
  {
    id: 'card9',
    label: 'prod card 9 SS26-009 shirt',
    dxf: prodFile(9, 'UNSET'),
    category: 'shirt',
    card: '9',
  },
  {
    id: 'card11',
    label: 'prod card 11 SS26-011 pants MAIN',
    dxf: prodFile(11, 'MAIN'),
    category: 'trousers',
    card: '11',
  },
  {
    id: 'card16',
    label: 'prod card 16 FW26-001 shirt MAIN',
    dxf: prodFile(16, 'MAIN'),
    category: 'shirt',
    card: '16',
  },
].filter(
  (f) =>
    f.dxf &&
    existsSync(f.dxf) &&
    (!process.env.POM_ONLY || process.env.POM_ONLY.split(',').includes(f.id)),
);

const quiet = async (fn) => {
  const w = console.warn;
  const l = console.log;
  console.warn = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.warn = w;
    console.log = l;
  }
};
const cm = (mm) => (mm == null ? '   —  ' : (mm / 10).toFixed(1).padStart(6));
let bad = 0;
const gate = (ok, msg) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) bad++;
};

const results = {};
for (const f of FILES) {
  const buf = await readFile(f.dxf);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loaded = await quiet(() => mod.load(bytes, f.category, cards[f.card]?.pieces ?? []));
  const { report, ms } = await quiet(() => mod.run(loaded));
  const cov = mod.coverage(report);
  results[f.id] = { f, loaded, report, cov };
  console.log(`\n=== ${f.label} — ${basename(f.dxf)}`);
  console.log(
    `  ${report.garment}, ${loaded.facts.pieces.length} pieces, sizes ${loaded.sizes.map((s) => s.size).join(' ')} (base ${report.baseSize}); parse ${loaded.ms.toFixed(0)} ms, POM ${ms.toFixed(0)} ms all sizes`,
  );
  console.log(
    `  roles: ${cov.ok}/${cov.edges} edges ≥ 0.6 (${Math.round(cov.share * 100)} %), named pieces ${Math.round(cov.namedShare * 100)} %`,
  );
  const unk = report.pieces.filter((p) => p.kind === 'unknown');
  if (unk.length) console.log(`  unknown pieces: ${unk.map((p) => p.pieceKey).join(' ')}`);
  const sizes = report.sizes;
  console.log(
    `  ${'POM'.padEnd(16)} ${sizes.map((s) => s.size.padStart(6)).join(' ')}  exact? (base)  reason`,
  );
  for (const v of sizes.find((s) => s.size === report.baseSize).values) {
    const row = sizes.map((s) => cm(s.values.find((x) => x.code === v.code)?.valueMm));
    console.log(
      `  ${v.code.padEnd(16)} ${row.join(' ')}  ${v.exactness.padEnd(9)} ${(v.reason ?? '').slice(0, 110)}`,
    );
  }
  const regr = sizes.filter((s) => s.regraded.length);
  for (const s of regr) console.log(`  size ${s.size}: regraded ${s.regraded.join(' ')}`);
  const sheet = mod.renderSheet(loaded, report, f.label);
  const html = resolve(outDir, `${f.id}.html`);
  await writeFile(html, sheet.html);
  results[f.id].sheet = { ...sheet, html };
}

// ── PNG sheets ──────────────────────────────────────────────────────────────────────────────
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (existsSync(chrome)) {
  for (const { f, sheet } of Object.values(results)) {
    const png = resolve(outDir, `${f.id}.png`);
    try {
      execFileSync(
        chrome,
        [
          '--headless=new',
          '--disable-gpu',
          '--hide-scrollbars',
          '--force-device-scale-factor=1',
          `--window-size=${Math.ceil(sheet.w)},${Math.ceil(sheet.h)}`,
          `--screenshot=${png}`,
          pathToFileURL(sheet.html).href,
        ],
        { stdio: 'ignore', timeout: 60000 },
      );
    } catch (e) {
      console.log(`  (screenshot ${f.id} failed: ${e.message})`);
    }
  }
  console.log(`\nsheets: ${outDir}/<file>.png`);
}

// ── G1: hand measurement of SS26-005 M (independent code path) ────────────────────────────────
// The 09.10 probe's own DXF reader (assembly-from-pattern/probe/dxf.mjs: raw tags → blocks →
// sewing-line loop per piece, mm, y up), my own resample/corner finder, and definitions written by
// hand after looking at the pattern: no lib/pom code, no seam graph, no edge roles.
const hand = await (async () => {
  const probe = await import(
    pathToFileURL(resolve(plans, 'assembly-from-pattern/probe/dxf.mjs')).href
  );
  const file = resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
  if (!existsSync(file)) return null;
  const blocks = probe.parseBlocks(probe.readTags(file)).blocks;
  const P = Object.fromEntries(probe.extractPieces(blocks, 'M').map((p) => [p.id, p]));
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ring = (id) => {
    let pts = P[id].seam.map((p) => [p[0], p[1]]);
    if (D(pts[0], pts[pts.length - 1]) < 0.01) pts = pts.slice(0, -1);
    let a = 0;
    for (let i = 0; i < pts.length; i++)
      a += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
    if (a < 0) pts.reverse();
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i],
        q = pts[(i + 1) % pts.length];
      const k = Math.max(1, Math.round(D(p, q)));
      for (let j = 0; j < k; j++)
        out.push([p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k]);
    }
    return out;
  };
  const vert = (r, x) => {
    const ys = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      if ((x >= a[0] && x < b[0]) || (x >= b[0] && x < a[0]))
        ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
    }
    return ys.sort((u, v) => u - v);
  };
  const horiz = (r, y) => {
    const xs = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[i],
        b = r[(i + 1) % r.length];
      if ((y >= a[1] && y < b[1]) || (y >= b[1] && y < a[1]))
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
    }
    xs.sort((u, v) => u - v);
    let w = 0;
    for (let i = 0; i + 1 < xs.length; i += 2) w += xs[i + 1] - xs[i];
    return w;
  };
  // corners: turn over ±6 mm above 38°, local maxima, merged within 8 mm
  const corners = (r) => {
    const n = r.length,
      w = 6;
    const ang = r.map((_, i) => {
      const a = r[(i - w + n) % n],
        b = r[i],
        c = r[(i + w) % n];
      const v1 = [b[0] - a[0], b[1] - a[1]],
        v2 = [c[0] - b[0], c[1] - b[1]];
      return Math.abs(
        (Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]) * 180) / Math.PI,
      );
    });
    const c = [];
    for (let i = 0; i < n; i++) {
      if (ang[i] < 38) continue;
      let max = true;
      for (let d = -w; d <= w; d++) if (d && ang[(i + d + n) % n] > ang[i]) max = false;
      if (max && !(c.length && i - c[c.length - 1] < 8)) c.push(i);
    }
    return c;
  };
  const runs = (r) => {
    const c = corners(r),
      n = r.length;
    return c.map((s, k) => {
      const e = c[(k + 1) % c.length];
      const pts = [];
      for (let j = s; j !== e; j = (j + 1) % n) pts.push(r[j]);
      pts.push(r[e]);
      return pts;
    });
  };
  const len = (pts) => pts.slice(1).reduce((s, p, i) => s + D(p, pts[i]), 0);
  const meanY = (pts) => pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const hemRun = (id) => runs(ring(id)).reduce((a, b) => (meanY(b) < meanY(a) ? b : a));
  const top = (r) => r.reduce((a, b) => (b[1] > a[1] ? b : a));
  const lowAt = (r, x) => vert(r, x)[0];
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

  // 1. Body length from HPS: the highest point of each front, straight down to its own hem.
  const hps = avg(
    ['FRONT_L', 'FRONT_R'].map((id) => {
      const r = ring(id);
      const h = top(r);
      return h[1] - lowAt(r, h[0]);
    }),
  );
  // 2. Across shoulder: BP's leftmost and rightmost points in its top quarter (the shoulder points).
  const bp = ring('BP');
  const bpY = bp.map((p) => p[1]),
    bpTop = Math.max(...bpY),
    bpH = bpTop - Math.min(...bpY);
  const topQ = bp.filter((p) => p[1] > bpTop - bpH / 4);
  const across = D(
    topQ.reduce((a, b) => (b[0] < a[0] ? b : a)),
    topQ.reduce((a, b) => (b[0] > a[0] ? b : a)),
  );
  // 3. Neck width: the highest point of each half of BP (the back HPS).
  const cx = (Math.min(...bp.map((p) => p[0])) + Math.max(...bp.map((p) => p[0]))) / 2;
  const neck = D(top(bp.filter((p) => p[0] < cx)), top(bp.filter((p) => p[0] > cx)));
  // 4. Sleeve length: the top sleeve's highest point straight down to its own wrist.
  const sleeve = avg(
    ['SLV_M_L', 'SLV_M_R'].map((id) => {
      const r = ring(id);
      const h = top(r);
      return h[1] - lowAt(r, h[0]);
    }),
  );
  // 5. Hem sweep: the bottom run of every body panel + the button line beyond each front edge
  //    (PLCK_L is sewn on along its right edge, PLCK_R along its left — read off the drawing).
  const chain = [
    'FRONT_L',
    'FP_L',
    'FP_1_L',
    'FP_2_L',
    'BP_1_L',
    'BP_L',
    'BP',
    'BP_R',
    'BP_1_R',
    'BP_2_R',
    'FP_1_R',
    'FP_R',
    'FRONT_R',
  ];
  const plk = (id, side) => {
    const r = ring(id);
    const xs = r.map((p) => p[0]);
    const edge = side === 'right' ? Math.max(...xs) : Math.min(...xs);
    const cols = [...new Set(P[id].drills.map((d) => Math.round(d[0])))];
    return Math.min(...cols.map((x) => Math.abs(x - edge)));
  };
  const cfOff = plk('PLCK_L', 'right') + plk('PLCK_R', 'left');
  const hem = chain.reduce((s, id) => s + len(hemRun(id)), 0) + cfOff;
  // 6. Chest: panels laid side by side in the chain order, each one's bottom-left corner on the
  //    previous one's bottom-right corner (sewn from the hem); the side seams are FP_2_L|BP_1_L and
  //    BP_2_R|FP_1_R; level = their tops − 25.4 mm; widths summed + the button line offsets.
  const dy = {};
  let prevRight = null;
  for (const id of chain) {
    const h = hemRun(id);
    const left = h[0][0] < h[h.length - 1][0] ? h[0] : h[h.length - 1];
    const right = left === h[0] ? h[h.length - 1] : h[0];
    dy[id] = prevRight == null ? 0 : prevRight - left[1];
    prevRight = right[1] + dy[id];
  }
  const sideTop = (id, side) => {
    const rs = runs(ring(id));
    const i = rs.reduce((bi, r, k) => (meanY(r) < meanY(rs[bi]) ? k : bi), 0);
    // CCW: the run after the hem climbs the right side, the run before it the left side.
    const run = side === 'right' ? rs[(i + 1) % rs.length] : rs[(i - 1 + rs.length) % rs.length];
    return top(run)[1] + dy[id];
  };
  const ahb = avg([
    sideTop('FP_2_L', 'right'),
    sideTop('BP_1_L', 'left'),
    sideTop('BP_2_R', 'right'),
    sideTop('FP_1_R', 'left'),
  ]);
  const Y = ahb - 25.4;
  const chest = (chain.reduce((s, id) => s + horiz(ring(id), Y - dy[id]), 0) + cfOff) / 2;
  return {
    chest,
    hpsLength: hps,
    across,
    neck,
    sleeve,
    hem: hem / 2,
    cfOff,
    sides: [
      sideTop('FP_2_L', 'right'),
      sideTop('BP_1_L', 'left'),
      sideTop('BP_2_R', 'right'),
      sideTop('FP_1_R', 'left'),
    ],
  };
})();

console.log('\n=== GATES');
const ss = results.ss26;
const at = (rep, code, size = rep.baseSize) =>
  rep.sizes.find((s) => s.size === size)?.values.find((v) => v.code === code);
const G1 = [
  ['chest', 'chest', (v) => v.halfMm],
  ['length-hps', 'hpsLength', (v) => v.valueMm],
  ['across-shoulder', 'across', (v) => v.valueMm],
  ['sleeve-length', 'sleeve', (v) => v.valueMm],
  ['hem', 'hem', (v) => v.halfMm],
  ['neck-width', 'neck', (v) => v.valueMm],
];
const g1 = (values, label) => {
  let okAll = true;
  for (const [code, hk, get] of G1) {
    const v = values.find((x) => x.code === code);
    const eng = v ? get(v) : null;
    const d = eng == null ? null : eng - hand[hk];
    const ok =
      d != null &&
      Math.abs(d) <= 5 &&
      v.exactness !== 'not-found' &&
      (code !== 'length-hps' || v.exactness === 'exact');
    if (!label)
      console.log(
        `  ${ok ? 'ok  ' : 'FAIL'} G1 ${code.padEnd(16)} engine ${cm(eng)} cm  hand ${cm(hand[hk])} cm  Δ ${d == null ? '—' : d.toFixed(1)} mm  (${v?.exactness})`,
      );
    if (!ok) okAll = false;
  }
  return okAll;
};
if (hand && ss) {
  const ok = g1(at(ss.report, 'chest') ? ss.report.sizes.find((s) => s.size === 'M').values : []);
  if (!ok) bad++;
  console.log(
    `       hand: CF offsets ${hand.cfOff.toFixed(0)} mm, side seam tops ${hand.sides.map((y) => y.toFixed(0)).join(' / ')}`,
  );
  // G5 negative controls: the same G1 with roles swapped must fail.
  for (const [a, b] of [
    ['shoulder', 'hem'],
    ['neckline', 'hem'],
  ]) {
    const vals = await quiet(() => mod.runSwapped(ss.loaded, a, b));
    const red = !g1(vals, 'neg');
    const h = vals.find((v) => v.code === 'length-hps');
    gate(red, `G5 NEG ${a}↔${b}: G1 goes red (HPS length ${cm(h.valueMm)} cm, ${h.exactness})`);
  }
} else gate(false, 'G1 SS26-005 data missing');

// G2: monotonic across sizes (Allsizes gates; others reported).
for (const id of Object.keys(results)) {
  const { report } = results[id];
  if (report.sizes.length < 3) continue;
  const viol = [];
  for (const v of report.sizes[0].values) {
    const seq = report.sizes.map((s) => s.values.find((x) => x.code === v.code)?.valueMm);
    if (seq.some((x) => x == null)) continue;
    for (let i = 1; i < seq.length; i++)
      if (seq[i] < seq[i - 1] - 1)
        viol.push(
          `${v.code} ${report.sizes[i - 1].size}→${report.sizes[i].size} ${(seq[i] - seq[i - 1]).toFixed(1)} mm`,
        );
  }
  if (id === 'allsizes')
    gate(
      viol.length === 0,
      `G2 Allsizes monotonic XS→XL over every POM found in all sizes${viol.length ? `: ${viol.join('; ')}` : ''}`,
    );
  else if (viol.length) console.log(`  info G2 ${id}: not monotonic — ${viol.join('; ')}`);
}

// G3: roles on named files.
for (const id of Object.keys(results)) {
  const { cov, f } = results[id];
  const named = cov.namedShare >= 0.8;
  const line = `G3 ${id.padEnd(9)} roles ≥0.6 on ${Math.round(cov.share * 100)} % of ${cov.edges} edges (named pieces ${Math.round(cov.namedShare * 100)} %)`;
  if (named && !f.unnamed && !f.trace) gate(cov.share >= 0.8, line);
  else
    console.log(
      `  info ${line} — ${f.trace ? 'a PDF trace (converter output), not a CLO export' : 'not a named file'}, not gated`,
    );
}

// G4: unnamed blazer says «not found» everywhere.
if (results.blazer) {
  const vals = results.blazer.report.sizes[0].values;
  const guessed = vals.filter((v) => v.exactness !== 'not-found').map((v) => v.code);
  gate(
    guessed.length === 0,
    `G4 blazer (unnamed): ${vals.length - guessed.length}/${vals.length} POMs honestly not found${guessed.length ? ` — guessed: ${guessed.join(', ')}` : ''}`,
  );
}

// SANITY (not a fit judgement): pattern girth − a fit model's body girth, size M / base.
console.log(
  '\n=== SANITY: ease against a fit model (pattern full girth − body girth, base size; NOT a fit judgement)',
);
for (const id of Object.keys(results)) {
  const { f, report } = results[id];
  const card = cards[f.card];
  if (!card) continue;
  const gender = card.gender.replace('GENDER_ENUM_', '');
  const fm = fitModels.find(
    (x) => x.gender === gender && (x.m.CHEST ?? 0) > 600 && (x.m.HIP ?? 0) > 600,
  );
  if (!fm) continue;
  const pairs =
    report.garment === 'top'
      ? [['chest', 'CHEST']]
      : [
          ['hip', 'HIP'],
          ['waist', 'WAIST'],
        ];
  for (const [code, body] of pairs) {
    const v = at(report, code);
    if (!v || v.fullMm == null) {
      console.log(`  ${id.padEnd(8)} ${code}: not found — no ease to read`);
      continue;
    }
    const ease = v.fullMm - fm.m[body];
    console.log(
      `  ${id.padEnd(8)} ${code} full ${cm(v.fullMm)} cm − fit model #${fm.id} (${gender}) ${body} ${cm(fm.m[body])} cm = ease ${cm(ease)} cm  (${v.exactness})${ease <= 0 ? '  ← negative: check the convention / the model' : ''}`,
    );
  }
}

// Summary JSON for the UI phase (values per size, roles coverage).
const summary = Object.fromEntries(
  Object.entries(results).map(([id, { report, cov, f }]) => [
    id,
    {
      label: f.label,
      garment: report.garment,
      baseSize: report.baseSize,
      coverage: cov,
      sizes: report.sizes.map((s) => ({
        size: s.size,
        regraded: s.regraded,
        values: s.values.map((v) => ({
          code: v.code,
          valueMm: v.valueMm,
          halfMm: v.halfMm,
          fullMm: v.fullMm,
          exactness: v.exactness,
          reason: v.reason,
        })),
      })),
      dictionary: mod
        .pomsToDictionary(report)
        .filter((d) => d.size === report.baseSize && d.exactness !== 'unmapped')
        .map((d) => ({
          name: d.name,
          pom: d.pom,
          valueMm: d.valueMm,
          convention: d.convention,
          exactness: d.exactness,
        })),
    },
  ]),
);
await writeFile(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 1));
console.log(`\nsummary: ${resolve(outDir, 'summary.json')}`);
console.log(bad ? `\n${bad} FAIL` : '\nall gates ok');
process.exit(bad ? 1 : 0);
