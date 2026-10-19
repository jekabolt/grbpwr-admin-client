#!/usr/bin/env node
// node scripts/doll/corpus-node.mjs [ids] [-v] — re-solve the requests yarn doll:corpus captured
// (PLANS/assembly-3d-doll/beta-all/<CORPUS_REQ=before>/req/<id>.json) in node.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const PLANS = process.env.PLANS ?? resolve(here, '../../../tmp/plans');
const dir = resolve(PLANS, 'assembly-3d-doll/beta-all', process.env.CORPUS_REQ ?? 'before', 'req');
const outfile = resolve(tmpdir(), `doll-corpus-node-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(here, 'corpus-node-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
});
const args = process.argv.slice(2);
const v = args.includes('-v') ? ['-v'] : [];
const ids = (args.find((a) => a !== '-v') ?? '5,6,7,8,9,11,4,16').split(',');
for (const id of ids) {
  const f = resolve(dir, `${id}.json`);
  if (!existsSync(f)) continue;
  console.log(`── prod ${id}`);
  execFileSync(process.execPath, [outfile, f, ...v], { stdio: 'inherit' });
}
