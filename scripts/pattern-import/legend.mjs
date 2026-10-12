#!/usr/bin/env node
// PATTERN-IMPORT · LEGEND probe (MOOD-F1) — the drawing's own size key read whole: crafted size
// tokens (00, paired sizes) and the Mood sample (printed key == size rows, one pen sample per
// label, samples drawn alike told apart or asked). Bundles legend-entry.ts with esbuild and runs it
// in node with pdf.js' legacy build.
//   node scripts/pattern-import/legend.mjs [sample id…]   (yarn patimport:legend)
//   env PATIMPORT_ARCHIVE (the Mood PDFs, read only), PATIMPORT_REPORTS (LEGEND-probe.json)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-legend-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'legend-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
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
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
const code = await m.main(process.argv.slice(2));
process.exit(code ?? 0);
