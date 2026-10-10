#!/usr/bin/env node
// PATTERN-IMPORT · A8 probe — the clean stage (lib/pattern-import/clean): wm M (grid, labels,
// stroke text, test square, watermark; the legend before / after; edits; mutation check of every
// detector), the wall guard on a synthetic page, and the negative controls (no wall of a closed
// piece masked) through the e2e operator pass — one child process per section / case.
//   node scripts/pattern-import/clean.mjs                 (yarn patimport:clean)
//   node scripts/pattern-import/clean.mjs wm-M robe          just these sections / cases
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS, PATIMPORT_E2E_OUT (the e2e pass writes its files there)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const bundle = resolve(tmpdir(), `patimport-clean-${process.pid}.mjs`);

if (process.env.CLEAN_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.CLEAN_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

await esbuild({
  entryPoints: [resolve(HERE, 'clean-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

/** Negative controls: CLO DXFs, robe, kombinezon, blazer, the synthetic SVG / PLT. */
const CONTROLS = [
  'dxf:allsizes',
  'dxf:blazer',
  'dxf:summer men',
  'robe',
  'kombinezon-A',
  'kombinezon-B',
  'blazer',
  'syn:inkscape-pieces-mm.svg',
  'syn:illustrator-back-72dpi.svg',
  'syn:seamly2d-qt-collar.svg',
  'syn:gerber-front.plt',
  'syn:optitex-hpgl2-pe.plt',
];
const args = process.argv.slice(2);
const jobs = [
  ...(!args.length || args.includes('wm-M') ? [['wm-M']] : []),
  ...(!args.length || args.includes('synth') ? [['synth']] : []),
  ...(args.length ? args.filter((c) => c !== 'wm-M' && c !== 'synth') : CONTROLS).map((c) => [
    'walls',
    c,
  ]),
];

const rows = [];
const extra = [];
for (const job of jobs) {
  const t = Date.now();
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...job],
    {
      env: { ...process.env, CLEAN_CHILD: bundle, PATIMPORT_REPO: REPO },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    },
  );
  const lines = (r.stdout ?? '').split('\n');
  const got = lines.filter((l) => l.startsWith('@@CHECK ')).map((l) => JSON.parse(l.slice(8)));
  extra.push(...lines.filter((l) => l.startsWith('WM ')).map((l) => JSON.parse(l.slice(3))));
  if (!got.length)
    got.push({
      section: job.join(' '),
      check: 'ran',
      ok: false,
      got: `status ${r.status} ${(r.stderr ?? '').slice(-800)}`,
    });
  rows.push(...got);
  console.error(`· ${job.join(' ')} ${((Date.now() - t) / 1000).toFixed(1)}s`);
}

let bad = 0;
for (const c of rows) {
  if (!c.ok) bad++;
  console.log(
    `${c.ok ? 'PASS' : 'FAIL'}  ${c.section.padEnd(28)} ${c.check}\n        ${c.got.slice(0, 600)}`,
  );
}
mkdirSync(REPORTS, { recursive: true });
const d = new Date();
const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const out = resolve(REPORTS, `A8-clean-${stamp}.json`);
writeFileSync(out, JSON.stringify({ at: d.toISOString(), checks: rows, wm: extra }, null, 2));
console.log(`\n${rows.length - bad}/${rows.length} PASS → ${out}`);
process.exit(bad ? 1 : 0);
