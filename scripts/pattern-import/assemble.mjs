#!/usr/bin/env node
// PATTERN-IMPORT · F2 probe — page segmentation + global sheet assembly on the corpus.
// Bundles assemble-entry.ts with esbuild (types stripped; tsc covers scripts/) and runs it in node
// with pdf.js' legacy build.
//   node scripts/pattern-import/assemble.mjs [all|corpus|controls|perf] [sample-id…]
//   env PATIMPORT_CORPUS (default tmp/plans/pdf-to-dxf/corpus/), PATIMPORT_REPORTS
// Writes reports/F2-<yyyymmdd>.json, reports/F2.md and one PNG per sheet in reports/F2-sheets/.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-assemble-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'assemble-entry.ts')],
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
