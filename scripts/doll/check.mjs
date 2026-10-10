#!/usr/bin/env node
// yarn doll:check — the paper doll (lib/doll) on real patterns, rendered as SHADED WebGL in headless
// Chrome (SwiftShader), four views per file, plus the report in words and the gates of
// tmp/plans/assembly-3d-doll/01-DESIGN-L0.md §7 (P1):
//   every file: solves ≤ 3 s, 0 NaN, settles;
//   SS26-005: truth seams closed (gap ≤ 3 mm, strain ≤ 3 %), sleeves attached by proposed cap ↔ armhole,
//             stand on the neckline by a proposed seam;
//   NEGATIVE CONTROL: SS26-005 with its two side seams dropped must report them open (red), and the
//             gate set above must FAIL on it — a gate that does not move is not measuring anything.
//
// Usage: yarn doll:check            (all files)
//        DOLL_FILES=ss26,card6 yarn doll:check
// Data:  SKELETON_PLANS=<dir with assembly-from-pattern/, pdf-to-dxf/, assembly-3d-doll/>, default
//        ../tmp/plans next to the repo. Output: $DOLL_OUT or tmp/plans/assembly-3d-doll/p2-doll/.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const plans = process.env.SKELETON_PLANS ?? resolve(here, '../../../tmp/plans');
const out = process.env.DOLL_OUT ?? resolve(plans, 'assembly-3d-doll/p2-doll');
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const prod = resolve(plans, 'assembly-3d-doll/prod-data/dxf');
const prodFile = (prefix) => {
  if (!existsSync(prod)) return null;
  const f = readdirSync(prod).find((x) => x.startsWith(prefix));
  return f ? resolve(prod, f) : null;
};
const corpus = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo');
const SIDE_SEAMS = ['BP_2_R#0~FP_1_R#1', 'BP_1_L#2~FP_2_L#0'];
const ALL = [
  {
    id: 'ss26',
    label: 'SS26-005 shirt',
    dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
    category: 'shirt',
    truth: 'shirt-M',
    card: '5',
    gender: 'FEMALE',
  },
  {
    id: 'ss26-neg',
    label: 'SS26-005 NEGATIVE CONTROL (side seams dropped)',
    dxf: resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf'),
    category: 'shirt',
    truth: 'shirt-M',
    drop: SIDE_SEAMS,
    gender: 'FEMALE',
  },
  {
    id: 'allsizes',
    label: 'Allsizes (yoke shirt, CLO)',
    dxf: resolve(corpus, 'Allsizes_with_notches.dxf'),
    category: 'shirt',
    truth: 'allsizes-M',
    gender: 'MALE',
  },
  {
    id: 'summer',
    label: 'summer men (shirt)',
    dxf: resolve(corpus, 'summer men.dxf'),
    category: 'shirt',
    gender: 'MALE',
  },
  {
    id: 'summer-x2',
    label: 'summer men — ×2 TEST (SL_R removed, SL_L cut ×2 mirrored)',
    dxf: resolve(corpus, 'summer men.dxf'),
    category: 'shirt',
    gender: 'MALE',
    x2: { keep: 'SL_L', drop: 'SL_R' },
  },
  {
    id: 'card6',
    label: 'prod card 6 SS26-006 shirt with pockets (MAIN)',
    dxf: prodFile('card6-MAIN'),
    category: 'shirt',
    card: '6',
    gender: 'MALE',
  },
  {
    id: 'card6-shuf',
    label: 'prod card 6 NEGATIVE CONTROL (order inputs shuffled)',
    dxf: prodFile('card6-MAIN'),
    category: 'shirt',
    card: '6',
    shuffleOps: true,
    gender: 'MALE',
  },
  {
    id: 'card16',
    label: 'prod card 16 FW26-001 shirt (MAIN)',
    dxf: prodFile('card16-MAIN'),
    category: 'shirt',
    card: '16',
    gender: 'FEMALE',
  },
  {
    id: 'card11',
    label: 'prod card 11 SS26-011 pants (MAIN)',
    dxf: prodFile('card11-MAIN'),
    category: 'trousers',
    card: '11',
    gender: 'MALE',
  },
  {
    id: 'card7',
    label: 'prod card 7 SS26-007 pants (MAIN)',
    dxf: prodFile('card7-MAIN'),
    category: 'trousers',
    card: '7',
    gender: 'FEMALE',
  },
  {
    id: 'card8',
    label: 'prod card 8 SS26-008 blazer shell (MAIN, lining off)',
    dxf: prodFile('card8-MAIN'),
    category: 'jacket-lined',
    card: '8',
    gender: 'MALE',
  },
];
const want = (process.env.DOLL_FILES ?? '').split(',').filter(Boolean);
const files = ALL.filter(
  (f) => f.dxf && existsSync(f.dxf) && (!want.length || want.includes(f.id)),
);
for (const f of ALL)
  if (!f.dxf || !existsSync(f.dxf)) console.log(`SKIPPED ${f.id}: DXF not found`);

const dist = mkdtempSync(resolve(tmpdir(), 'doll-check-'));
await Promise.all([
  build({
    entryPoints: [resolve(here, 'check-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: resolve(dist, 'check.mjs'),
    logLevel: 'warning',
  }),
  build({
    entryPoints: [resolve(here, 'render-entry.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile: resolve(dist, 'render.js'),
    logLevel: 'warning',
  }),
]);
const specPath = resolve(dist, 'spec.json');
writeFileSync(
  specPath,
  JSON.stringify({
    files,
    plans,
    ...(process.env.DOLL_PASSES ? { maxPasses: Number(process.env.DOLL_PASSES) } : {}),
    ...(process.env.DOLL_NOOPS ? { noOps: true } : {}),
  }),
);
execFileSync(process.execPath, [resolve(dist, 'check.mjs'), specPath, out], { stdio: 'inherit' });

// ── screenshots ───────────────────────────────────────────────────────────────────────────
const renderJs = readFileSync(resolve(dist, 'render.js'), 'utf8');
const profile = mkdtempSync(resolve(tmpdir(), 'doll-chrome-'));
const shots = [];
for (const f of files) {
  const scene = readFileSync(resolve(out, `${f.id}.scene.json`), 'utf8');
  const html = resolve(out, `${f.id}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><title>doll ${f.id}</title><style>html,body{margin:0;background:#f4f4f2;overflow:hidden}</style></head><body><script>window.__DOLL__=${scene.replaceAll('<', '\\u003c')};</script><script>${renderJs}</script></body></html>`,
  );
  const views = (process.env.DOLL_VIEWS ?? 'all').split(',');
  for (const v of views) {
    const png = resolve(out, v === 'all' ? `${f.id}.png` : `${f.id}-${v}.png`);
    const size = v === 'all' ? '1600,1400' : '1000,1100';
    try {
      execFileSync(
        chrome,
        [
          '--headless=new',
          '--no-sandbox',
          '--hide-scrollbars',
          '--allow-file-access-from-files',
          '--use-angle=swiftshader',
          '--enable-unsafe-swiftshader',
          '--ignore-gpu-blocklist',
          '--run-all-compositor-stages-before-draw',
          '--virtual-time-budget=8000',
          `--window-size=${size}`,
          '--force-device-scale-factor=1',
          `--user-data-dir=${profile}`,
          `--screenshot=${png}`,
          `${pathToFileURL(html).href}?view=${v}`,
        ],
        { stdio: 'ignore', timeout: 90_000 },
      );
    } catch (e) {
      console.log(`screenshot FAILED for ${f.id}: ${e.message}`);
      continue;
    }
    if (existsSync(png) && statSync(png).size > 20_000) shots.push(png);
    else console.log(`screenshot too small / missing: ${png}`);
  }
}
rmSync(profile, { recursive: true, force: true });

// ── gates ─────────────────────────────────────────────────────────────────────────────────
const summary = JSON.parse(readFileSync(resolve(out, 'summary.json'), 'utf8'));
const txt = (id) =>
  existsSync(resolve(out, `${id}.txt`)) ? readFileSync(resolve(out, `${id}.txt`), 'utf8') : '';
let failed = 0;
const gate = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const ss26Gates = (id) => {
  const t = txt(id);
  const truth =
    /TRUTH tube \((\d+)\): closed (\d+) · proposed (\d+) \(wrong reading \(direction\) — mirror reading closed (\d+) of \d+\) · not closed (\d+); eased \d+ by design, (\d+) beyond ease \+ 2 %: residual p95 ([\d.]+) mm [^·]*· local strain max ([\d.]+) %/.exec(
      t,
    );
  const caps = (t.match(/\[proposed · doll\] (left|right) sleeve cap ↔ armhole/g) ?? []).length;
  const stand = /\[proposed · doll\] collar stand ↔ neckline/.test(t);
  const openSide =
    /\[open[^\]]*\] [^\n]*(FP_1_R|BP_2_R|BP_1_L|FP_2_L)[^\n]*(FP_1_R|BP_2_R|BP_1_L|FP_2_L)/.test(t);
  return {
    truthClosed:
      !!truth &&
      truth[5] === '0' &&
      truth[3] === truth[4] &&
      truth[6] === '0' &&
      Number(truth[7]) <= 3 &&
      Number(truth[8]) <= 3,
    truthDetail: truth
      ? `${truth[1]} truth seams: ${truth[2]} closed, ${truth[3]} proposed (wrong reading — mirror closed ${truth[4]}), ${truth[5]} not closed; gap p95 ${truth[7]} mm, strain max ${truth[8]} %, ${truth[6]} eased beyond ease`
      : 'no truth line',
    caps,
    stand,
    openSide,
  };
};
for (const s of summary) {
  gate(
    `${s.id}: solves ≤ 3 s`,
    s.ms <= 3000,
    `${Math.round(s.ms)} ms (+ graph ${Math.round(s.msGraph)} ms)`,
  );
  gate(`${s.id}: 0 NaN`, s.nan === 0);
  gate(`${s.id}: settles (travel p99 ≤ 1 mm per 20 passes)`, s.converged, `p99 ${s.travelP99} mm`);
  if (s.lacks > 0 && !s.id.endsWith('-shuf') && !s.id.endsWith('-neg'))
    gate(
      `${s.id}: declared joins the graph lacks — doll proposes ≥ 70 %`,
      s.proposed >= 0.7 * s.lacks,
      `${s.proposed} of ${s.lacks} (${Math.round((100 * s.proposed) / s.lacks)} %), ${s.fromOrderClosed}/${s.fromOrder} from the order closed`,
    );
}
const real6 = summary.find((s) => s.id === 'card6');
const shuf6 = summary.find((s) => s.id === 'card6-shuf');
if (real6 && shuf6)
  gate(
    'NEG card6-shuf: shuffled order inputs → fewer seams proposed from the order close',
    shuf6.fromOrderClosed < real6.fromOrderClosed,
    `real ${real6.fromOrderClosed} closed of ${real6.fromOrder} · shuffled ${shuf6.fromOrderClosed} of ${shuf6.fromOrder}`,
  );
if (summary.some((s) => s.id === 'ss26')) {
  const g = ss26Gates('ss26');
  gate(
    'ss26: body tube truth seams closed (≤ 3 mm, ≤ 3 % strain; eased ≤ ease + 2 %)',
    g.truthClosed,
    g.truthDetail,
  );
  gate('ss26: both sleeves attached by proposed cap ↔ armhole', g.caps === 2, `${g.caps} of 2`);
  gate('ss26: stand on the neckline by a proposed seam', g.stand);
}
if (summary.some((s) => s.id === 'ss26-neg')) {
  const g = ss26Gates('ss26-neg');
  gate('NEG ss26-neg: the dropped side seams are reported open', g.openSide);
  gate(
    'NEG ss26-neg: the doll gate set FAILS without the side seams',
    !(g.truthClosed && g.caps === 2 && g.stand && !g.openSide),
    g.truthDetail,
  );
}
console.log(`\nscreenshots:\n${shots.map((s) => `  ${s}`).join('\n')}\nreports: ${out}/*.txt`);
rmSync(dist, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
