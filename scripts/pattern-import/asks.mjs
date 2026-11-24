#!/usr/bin/env node
// PATTERN-IMPORT · `asks` metric over a folder of PDFs: does the autopilot (the REAL wizard hook)
// reach apply by itself, and where does it stop when it does not.
//   node scripts/pattern-import/asks.mjs <folder> [--only <text>] [--limit 1200] [--out asks.json]
// One process per file, one at a time (the hook runs the whole import: do not run it next to
// regress — under load files time out). Per file: verdict apply / stopped / crashed / timeout and
// the first stop (step: reason). Summary: files that ask nothing, and the stops grouped by step and
// by reason with numbers taken out. Compare two runs with `--base <earlier asks.json>`: a file
// that reached apply before and stops now is WORSE (exit 1).
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.ASKS_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.ASKS_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const dir = args.find(
  (a, i) => !a.startsWith('--') && !['--only', '--limit', '--out', '--base'].includes(args[i - 1]),
);
if (!dir) {
  console.error('usage: asks.mjs <folder of PDFs> [--only text] [--limit 1200] [--out asks.json]');
  process.exit(2);
}
const LIMIT = Number(opt('--limit', '1200')) * 1000;
const ONLY = opt('--only', '');
const OUT = resolve(opt('--out', 'asks.json'));
const BASE = opt('--base', '');

const work = resolve(tmpdir(), 'patimport-asks');
mkdirSync(work, { recursive: true });
const bundle = resolve(work, `asks-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'asks-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

const files = readdirSync(dir)
  .filter((f) => f.toLowerCase().endsWith('.pdf') && (!ONLY || f.includes(ONLY)))
  .sort();
const results = [];
for (const [k, f] of files.entries()) {
  const t = Date.now();
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), resolve(dir, f)],
    {
      env: { ...process.env, ASKS_CHILD: bundle, PATIMPORT_REPO: REPO },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: LIMIT,
    },
  );
  const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('@@RESULT '));
  const rec = line
    ? JSON.parse(line.slice(9))
    : {
        name: f,
        verdict: r.signal === 'SIGTERM' ? 'timeout' : 'crashed',
        error: (r.stderr ?? '').slice(-800),
      };
  results.push(rec);
  const stop = rec.stop ? `${rec.stop.step}: ${String(rec.stop.reason).slice(0, 100)}` : '';
  console.log(
    `${k + 1}/${files.length} ${f.slice(0, 60).padEnd(60)} ${String(rec.verdict).padEnd(8)} ${((Date.now() - t) / 1000).toFixed(0).padStart(5)}s  ${stop}`,
  );
}

const norm = (r) =>
  r.stop
    ? `${r.stop.step}: ${String(r.stop.reason)
        .replace(/\d+(\.\d+)?/g, 'N')
        .slice(0, 110)}`
    : r.verdict;
const count = (key) =>
  Object.entries(
    results
      .filter((r) => r.verdict !== 'apply')
      .reduce((a, r) => ((a[key(r)] = (a[key(r)] ?? 0) + 1), a), {}),
  ).sort((a, b) => b[1] - a[1]);
const summary = {
  files: results.length,
  askNothing: results.filter((r) => r.verdict === 'apply').length,
  byStep: count((r) => r.stop?.step ?? r.verdict),
  byReason: count(norm).slice(0, 20),
};
console.log(
  `\n${summary.files} files · ask nothing (reach apply) ${summary.askNothing} · ask ${summary.files - summary.askNothing}`,
);
console.log('first stop by step:');
for (const [k, v] of summary.byStep) console.log(`  ${String(v).padStart(4)}  ${k}`);
console.log('first stop by reason:');
for (const [k, v] of summary.byReason) console.log(`  ${String(v).padStart(4)}  ${k}`);

let worse = [];
if (BASE) {
  const before = new Map(
    JSON.parse(readFileSync(resolve(BASE), 'utf8')).results.map((r) => [r.name, r]),
  );
  const order = [
    'files',
    'scale',
    'sheet',
    'sizes',
    'pieces',
    'meaning',
    'fabrics',
    'check',
    'apply',
  ];
  const reach = (r) => (r.verdict === 'apply' ? order.length : order.indexOf(r.stop?.step ?? ''));
  worse = results.filter((r) => before.has(r.name) && reach(r) < reach(before.get(r.name)));
  const better = results.filter((r) => before.has(r.name) && reach(r) > reach(before.get(r.name)));
  console.log(`vs ${BASE}: better ${better.length} · WORSE ${worse.length}`);
  for (const r of worse) console.log(`  WORSE ${r.name}: ${norm(before.get(r.name))} → ${norm(r)}`);
}
writeFileSync(OUT, JSON.stringify({ summary, results }, null, 1));
console.log(`→ ${OUT}`);
process.exit(worse.length ? 1 : 0);
