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
    id: 'card6',
    label: 'prod card 6 SS26-006 shirt with pockets (MAIN)',
    dxf: prodFile('card6-MAIN'),
    category: 'shirt',
    card: '6',
    gender: 'MALE',
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
    /TRUTH tube \((\d+);[^)]*?(\d+) beyond ease[^)]*\): residual p95 ([\d.]+) mm [^·]*· local strain max ([\d.]+) %/.exec(
      t,
    );
  const caps = (t.match(/\[proposed · doll\] (left|right) sleeve cap ↔ armhole/g) ?? []).length;
  const stand = /\[proposed · doll\] collar stand ↔ neckline/.test(t);
  const openSide =
    /\[open[^\]]*\] [^\n]*(FP_1_R|BP_2_R|BP_1_L|FP_2_L)[^\n]*(FP_1_R|BP_2_R|BP_1_L|FP_2_L)/.test(t);
  return {
    truthClosed:
      !!truth && Number(truth[2]) === 0 && Number(truth[3]) <= 3 && Number(truth[4]) <= 3,
    truthDetail: truth
      ? `${truth[1]} tube truth seams, gap p95 ${truth[3]} mm, strain max ${truth[4]} %, ${truth[2]} eased beyond ease`
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
  gate(`${s.id}: settles`, s.converged);
}
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
