#!/usr/bin/env node
// yarn doll:shape — THE SHAPE GATE of the paper doll, on the requests yarn doll:corpus captured.
//
// For every req/<id>.json under beta-all/<CORPUS_REQ>/ the doll is solved again in node
// (shape-entry.ts: the same solveDoll the worker runs) and measured BY SHAPE, not by seam counts:
// crumple index, waist ring vs band, pieces past their host's edge, front-view width profile and
// side-view depth. Each garment is then rendered at 1600 px from the FRONT, the LEFT and the BACK
// (render-entry.ts in headless Chrome) → beta-all/<CORPUS_TAG>/<id>-<code>-{front,left,back}.png.
// The numbers go to beta-all/<CORPUS_TAG>/shape.json and into that tag's corpus.json (field
// `shape`), and a table is printed beside the base tag's (CORPUS_SHAPE_BASE, default shape-base).
//
//   yarn doll:shape                                 req + out = CORPUS_TAG (default now)
//   CORPUS_TAG=after CORPUS_REQ=before yarn doll:shape   re-solve before's requests, write to after
//   ONLY=7,11 yarn doll:shape                       some (prod ids)
//   SHAPE_VIEWS=none yarn doll:shape                numbers only, no renders
//
// yarn doll:corpus runs this itself after writing corpus.json.
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
const PLANS = process.env.PLANS ?? resolve(here, '../../../tmp/plans');
const ROOT = process.env.CORPUS_OUT ?? resolve(PLANS, 'assembly-3d-doll/beta-all');
const TAG = process.env.CORPUS_TAG ?? 'now';
const REQ = process.env.CORPUS_REQ ?? TAG;
const BASE = process.env.CORPUS_SHAPE_BASE ?? (TAG === 'shape-base' ? '' : 'shape-base');
const VIEWS = (process.env.SHAPE_VIEWS ?? 'front,left,back')
  .split(',')
  .filter((v) => v && v !== 'none');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const reqDir = resolve(ROOT, REQ, 'req');
const outDir = resolve(ROOT, TAG);
const shapeDir = resolve(outDir, 'shape');
mkdirSync(shapeDir, { recursive: true });
if (!existsSync(reqDir)) {
  console.log(`no requests under ${reqDir} — run yarn doll:corpus first`);
  process.exit(1);
}
// Garments only: the bags (not a garment) have no shape to gate. Order as RESULTS.md.
const ORDER = [5, 6, 7, 8, 9, 11, 4, 16, 1, 12, 13, 14, 15];
const only = (process.env.ONLY ?? '').split(',').filter(Boolean).map(Number);
const ids = ORDER.filter(
  (id) => (!only.length || only.includes(id)) && existsSync(resolve(reqDir, `${id}.json`)),
);
const corpusPath = resolve(outDir, 'corpus.json');
const reqCorpusPath = resolve(ROOT, REQ, 'corpus.json');
const codeOf = new Map();
for (const p of [corpusPath, reqCorpusPath])
  if (existsSync(p)) for (const r of JSON.parse(readFileSync(p, 'utf8'))) codeOf.set(r.id, r.code);

const dist = mkdtempSync(resolve(tmpdir(), 'doll-shape-'));
await Promise.all([
  build({
    entryPoints: [resolve(here, 'shape-entry.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: resolve(dist, 'shape.mjs'),
    logLevel: 'warning',
  }),
  VIEWS.length
    ? build({
        entryPoints: [resolve(here, 'render-entry.ts')],
        bundle: true,
        platform: 'browser',
        format: 'iife',
        target: 'es2020',
        outfile: resolve(dist, 'render.js'),
        logLevel: 'warning',
      })
    : Promise.resolve(),
]);
const renderJs = VIEWS.length ? readFileSync(resolve(dist, 'render.js'), 'utf8') : '';
const profile = mkdtempSync(resolve(tmpdir(), 'doll-shape-chrome-'));
const VIEW_OF = { front: 'front', left: 'side', back: 'back' };

const results = [];
for (const id of ids) {
  const code = codeOf.get(id) ?? '';
  const json = resolve(shapeDir, `${id}.json`);
  const scene = resolve(shapeDir, `${id}.scene.json`);
  execFileSync(
    process.execPath,
    [resolve(dist, 'shape.mjs'), resolve(reqDir, `${id}.json`), json, scene, code],
    { stdio: 'inherit' },
  );
  const r = JSON.parse(readFileSync(json, 'utf8'));
  results.push(r);
  if (r.skipped || !r.garment || !VIEWS.length) continue;
  const html = resolve(shapeDir, `${id}.html`);
  writeFileSync(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><title>doll ${id}</title><style>html,body{margin:0;background:#f4f4f2;overflow:hidden}</style></head><body><script>window.__DOLL__=${readFileSync(scene, 'utf8').replaceAll('<', '\\u003c')};</script><script>${renderJs}</script></body></html>`,
  );
  for (const v of VIEWS) {
    const png = resolve(outDir, `${id}-${code || id}-${v}.png`);
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
          '--window-size=1600,1800',
          '--force-device-scale-factor=1',
          `--user-data-dir=${profile}`,
          `--screenshot=${png}`,
          `${pathToFileURL(html).href}?view=${VIEW_OF[v] ?? v}`,
        ],
        { stdio: 'ignore', timeout: 90_000 },
      );
    } catch (e) {
      console.log(`  render FAILED ${id} ${v}: ${e.message}`);
      continue;
    }
    if (!existsSync(png) || statSync(png).size < 20_000)
      console.log(`  render too small / missing: ${png}`);
  }
}
rmSync(profile, { recursive: true, force: true });
rmSync(dist, { recursive: true, force: true });
writeFileSync(resolve(outDir, 'shape.json'), JSON.stringify(results, null, 1));
if (existsSync(corpusPath)) {
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
  for (const c of corpus) {
    const r = results.find((x) => String(x.id) === String(c.id));
    if (r) c.shape = r;
  }
  writeFileSync(corpusPath, JSON.stringify(corpus, null, 2));
}

// ── table ──
const base = new Map();
if (BASE && existsSync(resolve(ROOT, BASE, 'shape.json')))
  for (const r of JSON.parse(readFileSync(resolve(ROOT, BASE, 'shape.json'), 'utf8')))
    base.set(String(r.id), r);
const f0 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : Number(x).toFixed(0));
const f1 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : Number(x).toFixed(1));
const pair = (a, b, f = f0) => (b === undefined ? f(a) : `${f(b)} → ${f(a)}`);
const bandCell = (r) =>
  r.band ? `${r.band.state} · gap p95 ${f0(r.band.gapP95Mm)} · ease ${f0(r.band.easePct)} %` : '—';
console.log(
  `\n══ SHAPE (${TAG}${base.size ? ` vs ${BASE}` : ''}) — band = waistband seam · ring = tape round the waist seam vs the band (%) · crumple = triangles under 70 % of their flat area, waist zone % · creases = interior edges folded > 60°, waist zone % / worst piece % · past = worst surface piece past its host edge % · widths mm (${base.size ? 'base → now' : 'now'})`,
);
console.log(
  `| prod | card | band | ring Δ% | crumple | creases waist / worst | past edge | widths (${results.find((r) => r.legs) ? 'waist · seat · crotch · knee · hem' : 'top · upper · mid · lower · hem'}) | seat depth | widens | s |`,
);
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  if (r.skipped || !r.garment) {
    console.log(`| ${r.id} | ${r.code} | not a garment | | | | | | | | |`);
    continue;
  }
  const b = base.get(String(r.id));
  const past = (x) => (x.pastEdge.length ? Math.max(...x.pastEdge.map((p) => p.pct)) : 0);
  const widths = Object.keys(r.widths)
    .map((k) => pair(r.widths[k], b?.widths?.[k]))
    .join(' · ');
  console.log(
    `| ${r.id} | ${r.code} | ${bandCell(r)}${b ? ` (was ${bandCell(b)})` : ''} | ${pair(r.ring?.diffPct, b?.ring?.diffPct, f1)} | ${pair(r.crumple.waistPct, b?.crumple?.waistPct, f1)} | ${pair(r.creases.waistPct, b?.creases?.waistPct, f1)} / ${r.creases.worst?.piece ?? '—'} ${pair(r.creases.worst?.pct, b?.creases?.worst?.pct, f1)} | ${pair(past(r), b ? past(b) : undefined)} | ${widths} | ${pair(r.depths.seat ?? r.depths.mid, b?.depths?.seat ?? b?.depths?.mid)} | ${r.widensSeatToHem === null ? '—' : r.widensSeatToHem ? 'yes' : 'NO'} | ${(r.ms / 1000).toFixed(1)} |`,
  );
}
console.log(`shape.json + renders → ${outDir}`);
