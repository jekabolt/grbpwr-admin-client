#!/usr/bin/env node
// Dump a pattern as the doll sees it: pieces (role, hand, size, grain, edges) + chosen seams.
// Usage: node scripts/doll/inspect.mjs <file.dxf> [size=M] [category=shirt]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(tmpdir(), `doll-inspect-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'inspect-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const [dxf, size = 'M', cat = 'shirt'] = process.argv.slice(2);
execFileSync(process.execPath, [outfile, dxf, size, cat], { stdio: 'inherit' });
