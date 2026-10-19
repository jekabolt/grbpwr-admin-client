#!/usr/bin/env node
// Cold-peer robustness harness for the assembly-skeleton pipeline.
// Each case is a separate process: --timeout defaults to 5000 ms and can stop CPU-bound hangs.

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const args = process.argv.slice(2);
const timeoutAt = args.indexOf('--timeout');
const timeout = timeoutAt >= 0 ? Number(args[timeoutAt + 1]) : 5000;
const realOnly = args.includes('--real-only');
const mutationsOnly = args.includes('--mutations-only');
const jsonOnly = args.includes('--json');
const fileAt = args.indexOf('--file');
const onlyFile = fileAt >= 0 ? resolve(args[fileAt + 1]) : null;
const mutationAt = args.indexOf('--mutation');
const onlyMutation = mutationAt >= 0 ? args[mutationAt + 1] : 'none';
const stopAt = args.indexOf('--stop-after');
const stopAfter = stopAt >= 0 ? args[stopAt + 1] : 'layouts';
const bundle = resolve(here, `.worker-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(here, 'entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  absWorkingDir: root,
  outfile: bundle,
  logLevel: 'warning',
});

function walk(dir, recursive) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name);
    if (e.isDirectory() && recursive) out.push(...walk(p, true));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.dxf')) out.push(p);
  }
  return out;
}

const plans = resolve(root, '../tmp/plans');
const downloadFiles = walk(resolve(homedir(), 'Downloads'), false);
const corpusFiles = walk(resolve(plans, 'pdf-to-dxf/corpus'), true);
const probeFiles = walk(resolve(plans, 'assembly-from-pattern/probe/data'), false);
const realCases = [...downloadFiles, ...corpusFiles, ...probeFiles]
  .sort()
  .map((path) => ({ path, mutation: 'none', kind: 'real' }));

const ss26 = resolve(plans, 'assembly-from-pattern/probe/data/ss26-005-shirt.dxf');
const allsizes = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo/Allsizes_with_notches.dxf');
const blazer = resolve(plans, 'pdf-to-dxf/corpus/dxf-clo/blazer.dxf');
const mutationCases = [
  [ss26, 'rename_numbers'],
  [ss26, 'drop_notches'],
  [ss26, 'mirror'],
  [allsizes, 'duplicate'],
  [allsizes, 'one_piece'],
  [blazer, 'tile_120'],
  [ss26, 'triangle'],
  [ss26, 'zero_length'],
  [ss26, 'self_intersection'],
  [ss26, 'scale_0_1'],
  [ss26, 'scale_10'],
  [ss26, 'reverse_order'],
  [blazer, 'reverse_order'],
]
  .filter(([path]) => existsSync(path))
  .map(([path, mutation]) => ({ path, mutation, kind: 'mutation' }));

const cases = onlyFile
  ? [
      {
        path: onlyFile,
        mutation: onlyMutation,
        kind: onlyMutation === 'none' ? 'real' : 'mutation',
      },
    ]
  : mutationsOnly
    ? mutationCases
    : realOnly
      ? realCases
      : [...realCases, ...mutationCases];

function one(test) {
  const source = `
    const keep = [console.log, console.warn, console.error];
    console.log = console.warn = console.error = () => {};
    try {
      const mod = await import(${JSON.stringify(pathToFileURL(bundle).href)});
      const value = await mod.run(${JSON.stringify(test.path)}, ${JSON.stringify(test.mutation)}, ${JSON.stringify(stopAfter)});
      process.stdout.write(JSON.stringify({ ok: true, value }));
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.stack : String(error) }));
    } finally {
      [console.log, console.warn, console.error] = keep;
    }
  `;
  const t0 = performance.now();
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    killSignal: 'SIGKILL',
  });
  const wallMs = Math.round(performance.now() - t0);
  if (child.error?.code === 'ETIMEDOUT')
    return { ...test, status: 'hang', wallMs, error: `killed after ${timeout} ms` };
  if (child.error)
    return { ...test, status: 'throw', wallMs, error: child.error.stack ?? String(child.error) };
  try {
    const parsed = JSON.parse(child.stdout || '{}');
    if (!parsed.ok)
      return { ...test, status: 'throw', wallMs, error: parsed.error ?? child.stderr };
    return { ...test, status: 'ok', wallMs, ...parsed.value };
  } catch (error) {
    return {
      ...test,
      status: 'throw',
      wallMs,
      error: `${error instanceof Error ? error.stack : String(error)}\nstdout: ${child.stdout}\nstderr: ${child.stderr}`,
    };
  }
}

const results = [];
try {
  for (const test of cases) {
    const result = one(test);
    results.push(result);
    if (!jsonOnly) {
      const label =
        test.kind === 'mutation'
          ? `${basename(test.path)} [${test.mutation}]`
          : basename(test.path);
      const issues =
        result.status !== 'ok'
          ? result.status
          : [
              result.sweepViolations?.length ? `sweep:${result.sweepViolations.length}` : '',
              result.nonFiniteLayouts?.length ? `nonfinite:${result.nonFiniteLayouts.length}` : '',
              result.emptyEdges?.length ? `empty:${result.emptyEdges.length}` : '',
              result.silentDrops?.length ? `dropped:${result.silentDrops.length}` : '',
              result.pieces === 0
                ? result.warnings?.length
                  ? 'empty-file (said)'
                  : 'empty-file SILENT'
                : '',
              result.pieces > 0 && result.steps === 0 && result.warnings?.length
                ? `refused: ${result.warnings[0].slice(0, 40)}`
                : '',
            ]
              .filter(Boolean)
              .join(',') || 'clean';
      console.log(
        `${label.padEnd(54)} ${String(result.pieces ?? '-').padStart(4)} pcs  ${String(result.wallMs).padStart(5)} ms  ${issues}`,
      );
    }
  }
} finally {
  rmSync(bundle, { force: true });
}

const report = {
  generatedAt: new Date().toISOString(),
  timeoutMs: timeout,
  roots: [
    resolve(homedir(), 'Downloads'),
    resolve(plans, 'pdf-to-dxf/corpus'),
    resolve(plans, 'assembly-from-pattern/probe/data'),
  ],
  results,
};
writeFileSync(resolve(here, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
if (jsonOnly) process.stdout.write(`${JSON.stringify(report)}\n`);
else {
  const summary = results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  console.log(
    `\n${results.length} cases: ${JSON.stringify(summary)}; details: ${resolve(here, 'results.json')}`,
  );
}
