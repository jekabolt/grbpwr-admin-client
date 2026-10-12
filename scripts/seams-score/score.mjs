#!/usr/bin/env node
// yarn seams:score [mode] [ids] — the seam-inference MEASUREMENT: truth seam list vs the engine.
//
//   yarn seams:score                      score all cards → scripts/seams-score/out/latest.json
//   yarn seams:score score 5,11           some (prod ids; 49 = beta card 49)
//   yarn seams:score edges 8              dump pieces/edges/joins/seams (to write a truth spec)
//   yarn seams:score build [ids]          truth/specs.ts → truth/<id>.seams.json
//   yarn seams:score sheet [ids]          <metrics>/truth/<id>-flat-edges.png (numbered edges + truth)
//
// Inputs: the doll requests yarn doll:corpus captured at PLANS/assembly-3d-doll/beta-all/<CORPUS_REQ>/
// req/<id>.json (default: the newest tag that has all 13) — the facts the live app hands the doll —
// and beta card 49 (PLANS/assembly-3d-doll/beta-data). Output dir for sheets / report:
// PLANS/assembly-3d-doll/metrics. SCORE_SHA tags latest.json (default: git HEAD).

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../..');
const PLANS = process.env.PLANS ?? process.env.SKELETON_PLANS ?? resolve(REPO, '../tmp/plans');
const BETA_ALL = resolve(PLANS, 'assembly-3d-doll/beta-all');
const METRICS = process.env.METRICS_OUT ?? resolve(PLANS, 'assembly-3d-doll/metrics');
const PROD = [5, 6, 7, 8, 9, 11, 4, 16, 1, 12, 13, 14, 15];
const [mode = 'score', idsArg = ''] = process.argv.slice(2);
const want = idsArg.split(',').filter(Boolean);

function newestFullTag() {
  if (!existsSync(BETA_ALL)) return null;
  const tags = readdirSync(BETA_ALL)
    .filter((t) => PROD.every((id) => existsSync(resolve(BETA_ALL, t, 'req', `${id}.json`))))
    .map((t) => ({ t, at: statSync(resolve(BETA_ALL, t, 'req')).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  return tags[0]?.t ?? null;
}
let sha = process.env.SCORE_SHA ?? '';
if (!sha)
  try {
    sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: REPO,
      encoding: 'utf8',
    }).trim();
  } catch {
    sha = 'unknown';
  }
// The requests to score on: CORPUS_REQ, else the capture made for this commit
// (`CORPUS_TAG=metrics-<sha> yarn doll:corpus`), else the newest tag that has all 13 — another
// worktree's capture may be newer, so the commit's own tag wins when it exists.
const reqTag =
  process.env.CORPUS_REQ ??
  (existsSync(resolve(BETA_ALL, `metrics-${sha}`, 'req', '5.json'))
    ? `metrics-${sha}`
    : newestFullTag());
if (!reqTag) {
  console.log('no captured corpus requests — run `yarn doll:corpus` first');
  process.exit(1);
}

const LABELS = {
  5: 'SS26-005 load balance (shirt, F)',
  6: 'SS26-006 starvation (shirt with pockets, M)',
  7: 'SS26-007 fan out (pants, F)',
  8: 'SS26-008 critical path (blazer, M)',
  9: 'SS26-009 Summer Shirt (F)',
  11: 'SS26-011 Pants (M)',
  4: 'SS26-004 Shirt Summer (short-sleeve, M)',
  16: 'FW26-001 semaphore shirt (F)',
  1: 'SS26-015 garment bag',
  12: 'SS26-012 Octagon M (bag)',
  13: 'SS26-013 Dust Bag M',
  14: 'SS26-014 Octagon S (bag)',
  15: 'SS26-016 dust bag s',
};
// The size the overlay read for each card (corpus.json of the same capture).
let sizeOf = new Map();
try {
  sizeOf = new Map(
    JSON.parse(readFileSync(resolve(BETA_ALL, reqTag, 'corpus.json'), 'utf8')).map((r) => [
      String(r.id),
      r.size,
    ]),
  );
} catch {
  /* no corpus.json beside the requests */
}
const cards = [
  ...PROD.map((id) => ({
    id: String(id),
    label: LABELS[id],
    req: resolve(BETA_ALL, reqTag, 'req', `${id}.json`),
    size: sizeOf.get(String(id)) ?? '?',
  })),
  {
    id: '49',
    label: 'beta card 49 FW26-001 check shirt (double yoke)',
    dxf: resolve(PLANS, 'assembly-3d-doll/beta-data/card49-MAIN.dxf'),
    betaCard: resolve(PLANS, 'assembly-3d-doll/beta-data/card49.json'),
    size: 'M',
    category: 'shirt',
    bom: { buttons: 10, interlining: 1 },
    gender: 'MALE',
  },
].filter((c) => !want.length || want.includes(c.id));

const truthDir = resolve(here, 'truth');
const outDir = mode === 'sheet' ? resolve(METRICS, 'truth') : resolve(here, 'out');
mkdirSync(outDir, { recursive: true });
const dist = mkdtempSync(resolve(tmpdir(), 'seams-score-'));
await build({
  entryPoints: [resolve(here, 'entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: resolve(dist, 'entry.mjs'),
  logLevel: 'warning',
  absWorkingDir: REPO,
});
const specPath = resolve(dist, 'spec.json');
writeFileSync(specPath, JSON.stringify({ mode, cards, outDir, truthDir, sha, reqTag }));
console.log(`seams:score ${mode} · requests ${reqTag} · ${sha}`);
execFileSync(process.execPath, [resolve(dist, 'entry.mjs'), specPath], { stdio: 'inherit' });

if (mode === 'sheet') {
  const chrome =
    process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const profile = mkdtempSync(resolve(tmpdir(), 'seams-score-chrome-'));
  for (const c of cards) {
    const svg = resolve(outDir, `${c.id}-flat-edges.svg`);
    if (!existsSync(svg)) continue;
    const { w, h } = JSON.parse(readFileSync(resolve(outDir, `${c.id}-flat-edges.size`), 'utf8'));
    const html = resolve(dist, `${c.id}.html`);
    writeFileSync(
      html,
      `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body>${readFileSync(svg, 'utf8')}</body></html>`,
    );
    const png = resolve(outDir, `${c.id}-flat-edges.png`);
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--hide-scrollbars',
        '--allow-file-access-from-files',
        `--window-size=${w},${h}`,
        '--force-device-scale-factor=1',
        `--user-data-dir=${profile}`,
        `--screenshot=${png}`,
        pathToFileURL(html).href,
      ],
      { stdio: 'ignore', timeout: 90_000 },
    );
    rmSync(resolve(outDir, `${c.id}-flat-edges.size`), { force: true });
    console.log(`  ${png}`);
  }
  rmSync(profile, { recursive: true, force: true });
}
rmSync(dist, { recursive: true, force: true });
