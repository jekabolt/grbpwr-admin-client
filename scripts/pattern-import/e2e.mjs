#!/usr/bin/env node
// PATTERN-IMPORT · E2E probe runner — bundles e2e-entry.ts once, then runs every case in its own
// node process (so peak RSS is per sample) and writes reports/E2E-<date>.json.
//   node scripts/pattern-import/e2e.mjs            every case + the f17 sweep
//   node scripts/pattern-import/e2e.mjs robe palto  just these
//   … --clicks                 A7: a per-case click table, compared with reports/E2E-clicks-baseline.json
//                              (exit 1 when any case needs more clicks than its baseline, or a written
//                              file's manifest does not round-trip to the run's card, scope and sizes)
//   … --clicks --write-baseline  record the table as the baseline (merged per case)
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
const bundle = resolve(tmpdir(), `patimport-e2e-${process.pid}.mjs`);

if (process.env.E2E_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.E2E_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

await esbuild({
  entryPoints: [resolve(HERE, 'e2e-entry.ts')],
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

const child = (args) => {
  const r = spawnSync(
    process.execPath,
    ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), ...args],
    {
      env: { ...process.env, E2E_CHILD: bundle, PATIMPORT_REPO: REPO },
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30 * 60 * 1000,
    },
  );
  const lines = (r.stdout ?? '').split('\n').filter((l) => l.startsWith('@@RESULT '));
  if (!lines.length)
    return [
      {
        id: args[0],
        verdict: 'crashed',
        status: r.status,
        signal: r.signal,
        stderr: (r.stderr ?? '').slice(-1500),
      },
    ];
  return lines.map((l) => JSON.parse(l.slice(9)));
};

if (process.argv[2] === 'cmp') {
  const r = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      env: { ...process.env, E2E_CHILD: bundle, PATIMPORT_REPO: REPO },
      encoding: 'utf8',
    },
  );
  process.stdout.write(r.stdout + r.stderr);
  process.exit(r.status ?? 0);
}
const FLAGS = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CLICKS = FLAGS.has('--clicks') || FLAGS.has('--write-baseline');
const ids = ARGS.length
  ? ARGS
  : JSON.parse(
      spawnSync(process.execPath, [fileURLToPath(import.meta.url), 'list'], {
        env: { ...process.env, E2E_CHILD: bundle },
        encoding: 'utf8',
      }).stdout,
    );
const results = [];
for (const id of ids) {
  const t = Date.now();
  const [r] = child([id]);
  results.push(r);
  const w = (r.write ?? [])
    .map((x) => `${x.scope} ${x.blocksPassing}/${x.blocks}${x.passed ? '✓' : '✗'}`)
    .join(' ');
  console.log(
    `${id.padEnd(46)} ${String(r.verdict).padEnd(15)} ${((Date.now() - t) / 1000).toFixed(1)}s peak ${r.peakRssMb ?? '?'}MB · ${w} · ${r.reason ?? r.error?.split('\n')[0] ?? ''}`,
  );
}
if (!ARGS.length) results.push(...child(['f17']));
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const out = resolve(REPORTS, process.env.E2E_REPORT ?? `E2E-${date}.json`);
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`→ ${out}`);

if (CLICKS) process.exit(clickTable(results.filter((r) => r.id !== 'f17')));

/** A7: the per-case click table against the baseline; returns the exit code. */
function clickTable(rs) {
  const file = resolve(REPORTS, 'E2E-clicks-baseline.json');
  const base = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { cases: {} };
  const kinds = (c) =>
    Object.entries(c?.byKind ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
  let bad = 0;
  console.log(`\n${'case'.padEnd(46)} ${'clicks'.padStart(6)} ${'base'.padStart(5)}  nav  by kind`);
  for (const r of rs) {
    const now = r.clicks?.total;
    const was = base.cases[r.id]?.total;
    let flag = '';
    if (now == null) flag = r.verdict === 'refused' ? '' : was != null ? ' ✗ no count' : '';
    else if (was != null && now > was) flag = ` ✗ +${now - was}`;
    else if (was != null && now < was) flag = ` ✓ −${was - now}`;
    else if (was == null) flag = ' (new)';
    if (r.manifestCheck && !r.manifestCheck.ok)
      flag += ` ✗ manifest: ${r.manifestCheck.problems.join('; ')}`;
    if (flag.includes('✗')) bad++;
    console.log(
      `${r.id.padEnd(46)} ${String(now ?? '—').padStart(6)} ${String(was ?? '—').padStart(5)}  ${String(r.clicks?.nav ?? '—').padStart(3)}  ${kinds(r.clicks)}${r.wrongPassing ? ` · wrongPassing ${r.wrongPassing}` : ''}${flag}`,
    );
  }
  if (FLAGS.has('--write-baseline')) {
    for (const r of rs)
      if (r.clicks)
        base.cases[r.id] = { total: r.clicks.total, nav: r.clicks.nav, byKind: r.clicks.byKind };
    base.updatedAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(base, null, 1));
    console.log(`baseline → ${file}`);
    return rs.some((r) => r.manifestCheck && !r.manifestCheck.ok) ? 1 : 0;
  }
  console.log(bad ? `✗ ${bad} case(s) regressed` : '✓ no case needs more clicks than its baseline');
  return bad ? 1 : 0;
}
