#!/usr/bin/env node
// PATTERN-IMPORT · RUL — AAMA/ASTM base DXF + grade rule table (.rul): read as every size, written
// as the alternative storage of our per-size blocks. Bundles rul-entry.ts with esbuild, runs it in
// node. Fixtures it writes: corpus/synthetic/rul/. Real vendor pairs (local only): corpus/rul-real/.
//   node scripts/pattern-import/rul.mjs   (yarn patimport:rul; exit 1 on any FAIL)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-rul-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'rul-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    // RULHOOK (section H) mounts the real wizard hook: React is the one-component shim
    react: resolve(HERE, 'react-hook-shim.ts'),
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
process.exit((await m.main()) ?? 0);
