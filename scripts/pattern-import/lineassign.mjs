#!/usr/bin/env node
// PATTERN-IMPORT · LINEFIX: the operator puts lines into a size ("these lines are size N") by a
// stable geometric key (chains/assign.ts) — crafted checks of the key and the assignment, then the
// real kombinezon: the strip outlines of sizes 6 and 8 assigned to their sizes, the strips filled.
//   node scripts/pattern-import/lineassign.mjs   (yarn patimport:lineassign)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.LA_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.LA_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ? 1 : 0);
}
const outfile = resolve(tmpdir(), `patimport-lineassign-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'lineassign-entry.ts')],
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
      PATIMPORT_E2E_OUT: process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-lineassign-out'),
      LA_CHILD: outfile,
    },
    stdio: 'inherit',
    cwd: REPO,
  },
);
process.exit(r.status ?? 1);
