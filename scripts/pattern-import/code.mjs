#!/usr/bin/env node
// PATTERN-IMPORT · CODE lane probe (bulk piece codes, label side).
//   node scripts/pattern-import/code.mjs   (yarn patimport:code)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-code-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'code-entry.ts')],
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
