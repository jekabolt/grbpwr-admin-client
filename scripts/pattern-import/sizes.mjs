#!/usr/bin/env node
// PATTERN-IMPORT · F3 probe — chains + size separation on the corpus. Bundles sizes-entry.ts with
// esbuild (types stripped; tsc covers scripts/) and runs it in node with pdf.js' legacy build.
//   node scripts/pattern-import/sizes.mjs [all|<sample>…] [--negative] [--no-png]
//   env PATIMPORT_CORPUS (default tmp/plans/pdf-to-dxf/corpus/), PATIMPORT_REPORTS,
//       PATIMPORT_CACHE (extracted SourceDocs, default os tmpdir)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-sizes-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'sizes-entry.ts')],
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
