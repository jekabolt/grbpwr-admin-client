#!/usr/bin/env node
// PATTERN-IMPORT · STOPS diag — what the line work on each page set aside "to check" is
// (clean/page-ink.ts): per page the ink reading (explained / the first unexplained line), and with
// INK_CHAINS=1 every long / piece-sized chain with its pen. Any PDF path (the archive's included).
//   node scripts/pattern-import/page-ink.mjs /abs/a.pdf …
// The checks live in page-roles.mjs (truth + "a real piece on an instruction page" mutations).
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-page-ink-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'page-ink-entry.ts')],
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
