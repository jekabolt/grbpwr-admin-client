#!/usr/bin/env node
// PATTERN-IMPORT · ink check over a dxf-shot output: for every open cell, does the PDF paint ink
// along the grade prediction where the line is missing (and does our extraction have it)?
//   node scripts/pattern-import/ink-check.mjs <pdf dir> --shot <dxf-shot out> \
//        --canvas <dir with node_modules/@napi-rs/canvas> [--only text] [--pxmm 12] [--out f.json]
// Rendering needs @napi-rs/canvas, which the repo does not depend on: install it in a scratch dir
// (`npm i @napi-rs/canvas`) and pass that dir. Light: one process, renders only the pages that
// cover an open cell. Verdicts and the alignment guard: ink-check-entry.ts header.
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.INK_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.INK_CHILD).href);
  const code = (await m.main(process.argv.slice(2))) ?? 0;
  // a pipe is async on macOS: exit() right away drops the unflushed tail of a long stdout line
  await new Promise((r) => process.stdout.write('', r));
  process.exit(code);
}

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = opt('--out', '');
const bundle = resolve(tmpdir(), `patimport-ink-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'ink-check-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: { lib: resolve(REPO, 'src/lib') },
});
const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
  env: { ...process.env, INK_CHILD: bundle },
  encoding: 'utf8',
  maxBuffer: 1 << 28,
  stdio: ['ignore', 'pipe', 'inherit'],
});
const files = (r.stdout ?? '')
  .split('\n')
  .filter((l) => l.startsWith('@@RESULT '))
  .map((l) => JSON.parse(l.slice(9)));

const total = {};
for (const f of files) {
  const by = {};
  if (f.separable !== undefined) f.alignMedianMm = `${f.alignMedianMm} own ${f.selfCheck?.trueOwn}/nb ${f.selfCheck?.neighbourOwn}`;
  for (const c of f.cells ?? []) {
    by[c.verdict] = (by[c.verdict] ?? 0) + 1;
    total[c.verdict] = (total[c.verdict] ?? 0) + 1;
  }
  const tag = f.error ? `ERROR ${f.error}` : f.misaligned ? `MISALIGNED (median ${f.alignMedianMm} mm)` : '';
  console.log(
    `${String(f.file).slice(0, 60).padEnd(60)} align ${f.alignMedianMm ?? '-'} mm  ${tag || JSON.stringify(by)}  ${f.ms ?? ''}ms`,
  );
}
console.log('TOTAL', JSON.stringify(total));
if (OUT) writeFileSync(OUT, JSON.stringify(files, null, 1));
process.exit(r.status ?? 1);
