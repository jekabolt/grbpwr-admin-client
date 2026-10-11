#!/usr/bin/env node
// node scripts/doll/corpus-pieces.mjs <prodId> [name regex] — piece dump of a captured request.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const PLANS = process.env.PLANS ?? resolve(here, '../../../tmp/plans');
const dir = resolve(PLANS, 'assembly-3d-doll/beta-all', process.env.CORPUS_REQ ?? 'before', 'req');
const outfile = resolve(tmpdir(), `doll-corpus-pieces-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'corpus-pieces-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const [id, re = ''] = process.argv.slice(2);
execFileSync(process.execPath, [outfile, resolve(dir, `${id}.json`), re], { stdio: 'inherit' });
