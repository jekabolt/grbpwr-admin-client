#!/usr/bin/env node
// PATTERN-IMPORT · SHAPE probe runner — bundles shape-entry.ts once, runs every e2e case and MOOD
// sample in its own node process (SHAPE_PAR at a time, SHAPE_CAP_S seconds each), writes
// $PATIMPORT_REPORTS/SHAPE-<date>.json + a table: per case the graded families whose sizes differ
// in features (notches, drills) or outline structure, and how many of those the gate let pass.
// Exit 1 when a family whose sizes differ in their cut-line TURNS passes the gate (soft rule 17.10:
// a notch / drill COUNT difference passes with a recorded warning — unless SHAPE_COUNTS_HOLD=1).
// Timeouts are listed as unjudged.
//   node scripts/pattern-import/shape.mjs [case|mood:<id>|card49…]   (card49 = kombinezon A on a
//   card XS–XL with 8…16 mapped, the owner's tech card 49)
//   env SHAPE_PNG=<dir> (per-size PNGs), PATIMPORT_REPORTS, SHAPE_PAR (3), SHAPE_CAP_S (900)
import { build as esbuild } from 'esbuild';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';

if (process.env.SHAPE_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.SHAPE_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const bundle = resolve(tmpdir(), `patimport-shape-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'shape-entry.ts')],
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

const outDir = resolve(REPORTS, 'SHAPE-out');
mkdirSync(outDir, { recursive: true });
const env = {
  ...process.env,
  SHAPE_CHILD: bundle,
  PATIMPORT_REPO: REPO,
  PATIMPORT_E2E_OUT: outDir,
  E2E_OUT: outDir,
};
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ids = ARGS.length
  ? ARGS
  : JSON.parse(
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'list'], {
        env,
        encoding: 'utf8',
      }).stdout,
    );
const PAR = Number(process.env.SHAPE_PAR ?? 3);
const CAP = Number(process.env.SHAPE_CAP_S ?? 900) * 1000;

const runOne = (id) =>
  new Promise((done) => {
    const t = Date.now();
    const ch = spawn(
      process.execPath,
      ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), id],
      { env },
    );
    let out = '';
    let err = '';
    ch.stdout.on('data', (d) => (out += d));
    ch.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const timer = setTimeout(() => ch.kill('SIGKILL'), CAP);
    ch.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      const r = line
        ? JSON.parse(line.slice(9))
        : {
            id,
            verdict: signal === 'SIGKILL' ? 'timeout' : 'crashed',
            code,
            families: 0,
            mismatched: 0,
            mismatchedPassing: 0,
            rows: [],
            stderr: err.slice(-600),
          };
      r.wallS = +((Date.now() - t) / 1000).toFixed(1);
      done(r);
    });
  });

const results = [];
const queue = ids.slice();
await Promise.all(
  Array.from({ length: Math.min(PAR, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift();
      const r = await runOne(id);
      results.push(r);
      const mism = r.rows.filter((x) => x.diff);
      console.log(
        `${String(r.id).padEnd(26)} ${String(r.verdict).padEnd(15)} ${String(r.wallS).padStart(6)}s families ${r.families} mismatched ${r.mismatched} passing ${r.mismatchedPassing}${
          mism.length
            ? `  ${mism
                .slice(0, 4)
                .map((x) => `${x.identity}:${x.diff}${x.passing ? '!' : ''}`)
                .join(' | ')}`
            : ''
        }${r.error ? `  ERR ${r.error.slice(0, 120)}` : ''}`,
      );
    }
  }),
);
results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
const sum = (k) => results.reduce((a, r) => a + (Number(r[k]) || 0), 0);
const byKind = {};
for (const r of results)
  for (const x of r.rows)
    if (x.diff) {
      const k = x.diff.split(' ')[0];
      byKind[k] = (byKind[k] ?? 0) + 1;
    }
const unjudged = results
  .filter((r) => r.error || r.verdict === 'timeout' || r.verdict === 'crashed')
  .map((r) => r.id);
const total = {
  cases: results.length,
  families: sum('families'),
  mismatched: sum('mismatched'),
  mismatchedPassing: sum('mismatchedPassing'),
  turnPassing: sum('turnPassing'),
  countPassing: sum('countPassing'),
  holdingPassing: sum('holdingPassing'),
  turnFamilies: results.reduce((a, r) => a + r.rows.filter((x) => x.turn).length, 0),
  countFamilies: results.reduce((a, r) => a + r.rows.filter((x) => x.count).length, 0),
  byKind,
  unjudged,
};
console.log(
  `\nTOTAL families ${total.families} · mismatched ${total.mismatched} (${JSON.stringify(byKind)}) · passing the gate: with a turn difference ${total.turnPassing}/${total.turnFamilies}, with a count difference (warned) ${total.countPassing}/${total.countFamilies}${unjudged.length ? ` · unjudged ${unjudged.join(', ')}` : ''}`,
);
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const file = resolve(REPORTS, `SHAPE-${date}.json`);
writeFileSync(file, JSON.stringify({ total, results }, null, 1));
console.log(`→ ${file}`);
process.exit(total.holdingPassing ? 1 : 0);
