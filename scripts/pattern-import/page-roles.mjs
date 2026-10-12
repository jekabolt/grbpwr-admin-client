#!/usr/bin/env node
// PATTERN-IMPORT · A9 probe — the AI page roles (clean/page-roles.ts) on the corpus PDFs with the
// recorded answers (fixtures/page-roles.json): coverage, the rule, the mutation. Bundles
// page-roles-entry.ts with esbuild and runs it in node with pdf.js' legacy build.
//   node scripts/pattern-import/page-roles.mjs [dump file.pdf…]   (yarn patimport:page-roles)
//   env PATIMPORT_CORPUS (default tmp/plans/pdf-to-dxf/corpus/), PATIMPORT_REPORTS
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-page-roles-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'page-roles-entry.ts')],
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
    // the wizard hook runs under the one-component shim (the stale-answers check)
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
