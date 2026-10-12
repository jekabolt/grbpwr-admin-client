#!/usr/bin/env node
// PATTERN-IMPORT · NAP: a number that is part of a printed code is held back, never offered as a
// piece — crafted controls (one per evidence, each guarded by a mutation), a crafted SVG through
// the session (the outline a code sits in is not lost), the corpus (every hold reviewed, no TRUTH
// piece held). The e2e runs write to PATIMPORT_E2E_OUT, else a temp dir — never the plans folder.
//   node scripts/pattern-import/nap.mjs [--synthetic-only | --corpus-only] [case ids]
//   (yarn patimport:nap)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.NAP_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.NAP_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ? 1 : 0);
}
const outfile = resolve(tmpdir(), `patimport-nap-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'nap-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const r = spawnSync(
  process.execPath,
  ['--max-old-space-size=8192', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      PATIMPORT_E2E_OUT: process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-nap-out'),
      NAP_CHILD: outfile,
    },
    stdio: 'inherit',
    cwd: REPO,
  },
);
process.exit(r.status ?? 1);
