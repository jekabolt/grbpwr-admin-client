#!/usr/bin/env node
// PATTERN-IMPORT · TILESTEP probe — sparse tiled PDFs from our own 1:1 export (with / without the
// Bundles tilestep-entry.ts with esbuild (types stripped; tsc covers scripts/) and runs it in node
// GRBPWR-TILES line) round-trip through the importer at their exact pitch; --survey <pdf…> measures
// where the pitch comes from on real files.  node scripts/pattern-import/tilestep.mjs [--survey pdf…]
//   (yarn patimport:tilestep)   env TILESTEP_VERBOSE=1 prints every case's warnings
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-tilestep-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'tilestep-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  // node_modules is a symlink into another worktree: resolve inside this one.
  preserveSymlinks: true,
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
