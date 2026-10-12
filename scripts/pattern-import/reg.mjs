#!/usr/bin/env node
// PATTERN-IMPORT · REG probe — tile registration on a printed label grid (Alghero + controls).
// Bundles reg-entry.ts with esbuild (types stripped; tsc covers scripts/) and runs it in node
// with pdf.js' legacy build.
//   node scripts/pattern-import/reg.mjs [pdf]   (yarn patimport:reg)
//   env PATIMPORT_ALGHERO (the PDF), REG_OUT (PNG dir)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-reg-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'reg-entry.ts')],
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
