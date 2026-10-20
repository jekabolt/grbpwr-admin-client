#!/usr/bin/env node
// Half-on-fold through the card's nest path (parseSheets → orientToGrain → applySeamAllowance →
// nest). A piece exported as a HALF + fold line (AAMA layer 6) must reach the marker as the
// unit the cutting room gets from folded fabric — never as a half cut once.
//
// Usage:
//   node scripts/nest-fold-probe.mjs                     # synthetic cases (asserts)
//   node scripts/nest-fold-probe.mjs <file.dxf> <outDir> # real file: dump JSON + SVG per block
// Env (real file): FOLD_PROBE_BLOCKS (regex, default '.'), FOLD_PROBE_LAYER (contour layer,
// default '1'), FOLD_PROBE_GRAIN (grain layer, default '7'), FOLD_PROBE_SA (cm, default 0),
// FOLD_PROBE_BUDGET_MS (default 3000), FOLD_PROBE_WIDTH (cm, default 140), FOLD_PROBE_CROSS=1
// (cross grain allowed).
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `nest-fold-probe-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'nest-fold-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const mod = await import(pathToFileURL(outfile).href);

const [file, outDir] = process.argv.slice(2);
const env = process.env;

if (file) {
  const buf = await readFile(file);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  await mkdir(outDir, { recursive: true });
  const run = await mod.runFile(bytes, basename(file), {
    blockRe: env.FOLD_PROBE_BLOCKS ?? '.',
    layer: env.FOLD_PROBE_LAYER ?? '1',
    grainLayer: env.FOLD_PROBE_GRAIN ?? '7',
    allowanceCm: Number(env.FOLD_PROBE_SA ?? 0),
    qty: 1,
    budgetMs: Number(env.FOLD_PROBE_BUDGET_MS ?? 3000),
    widthCm: Number(env.FOLD_PROBE_WIDTH ?? 140),
    crossGrain: env.FOLD_PROBE_CROSS === '1',
  });
  await writeFile(resolve(outDir, 'nest.json'), JSON.stringify(run, null, 1));
  await writeFile(resolve(outDir, 'marker.svg'), run.svg);
  console.log(
    `fabric ${Number(env.FOLD_PROBE_WIDTH ?? 140)} cm${env.FOLD_PROBE_CROSS === '1' ? ', cross grain allowed' : ''}`,
  );
  for (const p of run.pieces) {
    console.log(
      `${p.name.padEnd(10)} drawn ${p.drawnAreaCm2.toFixed(0).padStart(6)} cm² · cut ${p.cutAreaCm2
        .toFixed(0)
        .padStart(6)} cm² · unit ${p.foldUnit ? 'yes' : 'no '} · refused ${p.foldRefused ?? '-'}`,
    );
  }
  const r = run.result;
  console.log(
    `placed ${r.placements.length} · unplaced ${r.unplaced.length} (${r.unplaced
      .map((u) => u.reason)
      .join(',')}) · length ${r.usedLengthCm?.toFixed?.(1)} cm`,
  );
  for (const w of r.warnings ?? []) console.log(`warning: ${w}`);
  process.exit(0);
}

const cases = await mod.synthetic();
let fail = 0;
for (const c of cases) {
  if (!c.ok) fail++;
  console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `\n      ${c.detail}`}`);
}
console.log(`nest-fold: ${cases.length - fail}/${cases.length} pass`);
process.exit(fail ? 1 : 0);
