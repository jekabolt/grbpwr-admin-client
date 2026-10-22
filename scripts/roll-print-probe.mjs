#!/usr/bin/env node
// Golden roll-print probe: chosen sizes -> bounded roll sheets -> exact-size PDF -> one PNG/page.
//
// Usage: node scripts/roll-print-probe.mjs [file.dxf] [out-dir]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dxf = resolve(REPO, process.argv[2] ?? '.printroll/card70-summer-men.dxf');
const outDir = resolve(REPO, process.argv[3] ?? '.printroll/out');
const outfile = resolve(tmpdir(), `roll-print-probe-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(HERE, 'roll-print-probe-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  preserveSymlinks: true,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});

process.env.ROLL_PRINT_REPO = REPO;
const probe = await import(pathToFileURL(outfile).href);
const result = await probe.main([dxf, outDir]);
console.log(`min ${result.min} cm`);
if (result.atMinTooWide !== 0)
  throw new Error(`min ${result.min} cm leaves ${result.atMinTooWide} piece(s) too wide`);
if (result.belowMinTooWide === 0)
  throw new Error(`min - 0.1 cm (${result.belowMinWidthCm} cm) leaves no pieces too wide`);
let failed = false;
for (const render of result.renders ?? []) {
  const oldSheet = new RegExp(
    `^${basename(render.stem).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_sheet-\\d+\\.png$`,
  );
  for (const file of readdirSync(outDir))
    if (oldSheet.test(file)) unlinkSync(resolve(outDir, file));
  for (let page = 1; page <= render.pages; page++) {
    const png = `${render.stem}_sheet-${page}`;
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
process.exit(failed ? 1 : result.code ?? 0);
