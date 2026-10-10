#!/usr/bin/env node
// PATTERN-IMPORT · wall hygiene controls (S4 grey, S6 overprint) on synthetic sheets.
//   node scripts/pattern-import/hygiene.mjs   (yarn patimport:hygiene)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-hygiene-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'hygiene-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const m = await import(pathToFileURL(outfile).href);

const bad = await m.main();
process.exit(bad ? 1 : 0);
