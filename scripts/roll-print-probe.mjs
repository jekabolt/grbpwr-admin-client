#!/usr/bin/env node
// Golden roll-print probe: chosen sizes -> bounded roll sheets -> exact-size PDF -> one PNG/page.
//
// Usage: node scripts/roll-print-probe.mjs [file.dxf] [out-dir]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dxf = resolve(REPO, process.argv[2] ?? '.printroll/card70-summer-men.dxf');
const outDir = resolve(REPO, process.argv[3] ?? '.printroll/out');
const afterBundle = resolve(tmpdir(), `roll-print-probe-after-${process.pid}.mjs`);
const beforeBundle = resolve(tmpdir(), `roll-print-probe-before-${process.pid}.mjs`);
const BETA_COMMIT = '83741d5eb';

await build({
  entryPoints: [resolve(HERE, 'roll-print-probe-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: afterBundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  preserveSymlinks: true,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

await build({
  entryPoints: [resolve(HERE, 'roll-print-before-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: beforeBundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  preserveSymlinks: true,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
  plugins: [
    {
      name: 'beta-source',
      setup(builder) {
        builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
          if (!args.path.startsWith(`${resolve(REPO, 'src')}/`)) return undefined;
          const repoPath = relative(REPO, args.path).replaceAll('\\', '/');
          const shown = spawnSync('git', ['show', `${BETA_COMMIT}:${repoPath}`], {
            cwd: REPO,
            encoding: 'utf8',
          });
          if (shown.status !== 0)
            return {
              errors: [
                {
                  text: `git show ${BETA_COMMIT}:${repoPath} failed: ${shown.stderr}`,
                },
              ],
            };
          const extension = repoPath.split('.').pop();
          const loader = extension === 'tsx' ? 'tsx' : extension === 'jsx' ? 'jsx' : 'ts';
          return { contents: shown.stdout, loader };
        });
      },
    },
  ],
});

process.env.ROLL_PRINT_REPO = REPO;
const beforeProbe = await import(pathToFileURL(beforeBundle).href);
const before = await beforeProbe.main([dxf, outDir]);
const afterProbe = await import(pathToFileURL(afterBundle).href);
const after = await afterProbe.main([dxf, outDir]);
console.log(`minimum roll width after straightening: ${after.min} cm`);
let failed = false;
for (const render of [...(before.renders ?? []), ...(after.renders ?? [])]) {
  const suffix = render.suffix ?? '';
  const oldSheet = new RegExp(
    `^${basename(render.stem).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_sheet-\\d+${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.png$`,
  );
  for (const file of readdirSync(outDir))
    if (oldSheet.test(file)) unlinkSync(resolve(outDir, file));
  for (let page = 1; page <= render.pages; page++) {
    const png = `${render.stem}_sheet-${page}${suffix}`;
    const run = spawnSync('pdftoppm', [
      '-png',
      '-r',
      '24',
      '-f',
      String(page),
      '-l',
      String(page),
      '-singlefile',
      render.pdf,
      png,
    ]);
    if (run.status !== 0) {
      failed = true;
      console.error(`pdftoppm failed: ${run.stderr}`);
    } else console.log(`png ${png}.png`);
  }
}
// The acceptance line: per case, the beta layout, the deterministic seed, what is printed now.
const m = (mm) => (mm / 1000).toFixed(3);
console.log('case          before    seed     final    marker   runtime');
for (const now of after.metrics ?? []) {
  const was = (before.metrics ?? []).find((row) => row.key === now.key);
  if (!was) {
    failed = true;
    console.error(`no before run for ${now.key}`);
    continue;
  }
  const ok = now.lengthMm <= was.lengthMm;
  if (!ok) failed = true;
  console.log(
    `${now.key.padEnd(13)} ${m(was.lengthMm)} m  ${m(now.seedLengthMm)} m  ${m(now.lengthMm)} m  ${m(now.markerLengthMm)} m  ${(now.runtimeMs / 1000).toFixed(1)} s  ${ok ? 'ok' : 'LONGER THAN BEFORE'}`,
  );
}
console.log(
  `RESULT ${JSON.stringify({ before: before.metrics, after: after.metrics, min: after.min })}`,
);
process.exit(failed ? 1 : after.code ?? before.code ?? 0);
