#!/usr/bin/env node
// PATTERN-IMPORT · F5 probe — piece semantics (cut/seam + allowance, fold → unfold, pairs, grain,
// notches, identity) and proposeSizeMap. Synthetic fixtures + every CLO DXF of the corpus through
// the DXF fast path → buildPieceSpecs → writeAndGate (G1–G13) + the sheet text of every corpus PDF
// for the allowance reader. Bundles semantics-entry.ts with esbuild and runs it with pdf.js legacy.
//   node scripts/pattern-import/semantics.mjs        (yarn patimport:semantics)
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-semantics-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'semantics-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
const code = await m.main(process.argv.slice(2));
process.exit(code ?? 0);
