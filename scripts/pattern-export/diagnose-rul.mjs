#!/usr/bin/env node
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `pattern-export-diagnose-rul-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(HERE, 'diagnose-rul-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  alias: { lib: resolve(REPO, 'src/lib') },
});

const result = await import(pathToFileURL(outfile).href);
await result.main(process.argv.slice(2));
