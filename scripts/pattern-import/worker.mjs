#!/usr/bin/env node
// PATTERN-IMPORT · F13b probe — the import worker session (lib/pattern-import/worker) on the corpus
// and synthetic files. Bundles worker-entry.ts with esbuild (types stripped, not checked — tsc
// covers scripts/) and runs it in node with pdf.js' legacy build.
//   node --expose-gc scripts/pattern-import/worker.mjs   (yarn patimport:worker)
//   env PATIMPORT_CORPUS (default tmp/plans/pdf-to-dxf/corpus/), PATIMPORT_REPORTS
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-worker-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'worker-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  // pdf.js is loaded at run time from node_modules (legacy build), never bundled.
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
