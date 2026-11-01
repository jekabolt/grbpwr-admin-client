#!/usr/bin/env node
import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const outfile = resolve(tmpdir(), `patimport-clo-shirt-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(here, 'clo-shirt-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: repo,
  alias: { lib: resolve(repo, 'src/lib') },
});

await import(pathToFileURL(outfile).href);
