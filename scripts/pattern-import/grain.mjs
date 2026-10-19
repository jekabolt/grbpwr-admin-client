#!/usr/bin/env node
// PATTERN-IMPORT · GRAIN probe — a proposed grainline lies on its piece (semantics/grain-inside.ts):
// unit checks, then every proposal the latest E2E report offered, measured on its piece.
//   node scripts/pattern-import/grain.mjs        (yarn patimport:grain)
//   env PATIMPORT_REPORTS, GRAIN_E2E=<E2E-*.json>
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-grain-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'grain-entry.ts')],
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
