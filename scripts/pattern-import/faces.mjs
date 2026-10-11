#!/usr/bin/env node
// PATTERN-IMPORT · A2 probe runner — bundles faces-entry.ts once, runs each case in its own node
// process (the e2e operator pass with the automatic pieces run captured), writes
// reports/A2-faces.json + reports/A2-faces/*.png, then the checks (summary).
//   node scripts/pattern-import/faces.mjs                 (yarn patimport:faces)
//   node scripts/pattern-import/faces.mjs wm-M r4454      just these cases
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS, PATIMPORT_E2E_OUT, FACES_BASE (base E2E json for the
//   wrongPassing comparison)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const bundle = resolve(tmpdir(), `patimport-faces-${process.pid}.mjs`);

if (process.env.FACES_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.FACES_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

await esbuild({
  entryPoints: [resolve(HERE, 'faces-entry.ts')],
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

/** The A2 sheets, the smoke SVG, and the negative controls. */
const CASES = [
  'synthetic',
  'wm-M',
  'syn:inkscape-smoke-SML',
  'syn:inkscape-pieces-mm.svg',
  'blazer',
  'r4454',
  'r4454-M2',
  'redcafe',
  'wm',
  'robe',
  'kombinezon-A',
  'kombinezon-B',
  'dxf:allsizes',
  'dxf:blazer',
  'dxf:summer men',
];
const MUTATE = new Set(['wm-M', 'blazer', 'r4454', 'redcafe', 'wm', 'robe', 'kombinezon-A']);
const args = process.argv.slice(2);
const ids = args.length ? args : CASES;
const child = (a, env = {}) =>
  spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...a],
    {
      env: { ...process.env, FACES_CHILD: bundle, PATIMPORT_REPO: REPO, ...env },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    },
  );
const file = resolve(REPORTS, 'A2-faces.json');
const prev = existsSync(file) && args.length ? JSON.parse(readFileSync(file, 'utf8')) : [];
const rows = prev.filter((r) => !ids.includes(r.id));
for (const id of ids) {
  const t = Date.now();
  const r = child(
    id === 'r4454-M2'
      ? ['m2']
      : id === 'synthetic'
        ? ['synth']
        : ['case', id, ...(MUTATE.has(id) ? ['--mutate'] : [])],
  );
  if (process.env.FACES_DEBUG)
    process.stdout.write((r.stdout ?? '').replace(/^@@RESULT .*$/m, '') + (r.stderr ?? ''));
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@RESULT '));
  const row = line
    ? JSON.parse(line.slice(9))
    : { id, verdict: 'crashed', stderr: (r.stderr ?? '').slice(-1500) };
  rows.push(row);
  const a = row.auto;
  console.log(
    `${id.padEnd(30)} ${String(row.verdict).padEnd(14)} ${((Date.now() - t) / 1000).toFixed(1)}s · seeds ${JSON.stringify(a?.seeds ?? {})} · junk ${JSON.stringify(a?.junkBy ?? {})} · clicks ${row.clicks?.total ?? '—'} · face ${JSON.stringify(row.faceSeeds ?? null)}${row.mutation ? ` · mut ${JSON.stringify(row.mutation)}` : ''}${row.stderr ? ` · ${row.stderr.split('\n').slice(-4).join(' | ')}` : ''}`,
  );
}
writeFileSync(file, JSON.stringify(rows, null, 1));
const s = child(['summary']);
process.stdout.write(s.stdout + (s.stderr ?? ''));
process.exit(s.status ?? 1);
