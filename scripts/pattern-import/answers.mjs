#!/usr/bin/env node
// PATTERN-IMPORT · S3 probe — D3 answers belong to their question. Drives the REAL wizard hook
// (use-import-session.ts, React replaced by a one-component shim) over a two-sheet fixture client:
// answers given on sheet A must not answer sheet B, the write transition must refuse on its own,
// and Back/forward over the same sheet must keep them. Plus unit controls on answers.ts.
//   node scripts/pattern-import/answers.mjs        (yarn patimport:answers)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-answers-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'answers-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const m = await import(pathToFileURL(outfile).href);
const bad = await m.main();
process.exit(bad ? 1 : 0);
