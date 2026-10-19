#!/usr/bin/env node
// PATTERN-IMPORT · PASSPORT Ф1 probe (auto/PASSPORT.md) — the deterministic garment passport on
// the corpus against TRUTH, and the controls of its outline / quantity decisions. Bundles
// passport-entry.ts with esbuild and runs it in node with pdf.js' legacy build.
//   node scripts/pattern-import/passport.mjs [case-id…]   (yarn patimport:passport)
//   env PATIMPORT_CORPUS, PATIMPORT_REPORTS (the report goes there), PASSPORT_REPORT (file name)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-passport-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'passport-entry.ts')],
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
