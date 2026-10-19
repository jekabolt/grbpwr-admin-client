#!/usr/bin/env node
// PATTERN-IMPORT · A6 probe — how many sizes the sheet draws, from independent evidences
// (sizes/count-evidence.ts): unit checks, then the worker Session over the live smoke's SVG and
// variants of it (SIZE 38 / SIZE: M → 1 inferred; a legend 36–46 over one-line outlines → asked).
//   node scripts/pattern-import/count-evidence.mjs        (yarn patimport:count)
//   env PATIMPORT_CORPUS
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-count-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'count-evidence-entry.ts')],
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
const m = await import(pathToFileURL(outfile).href);
process.exit(await m.main());
