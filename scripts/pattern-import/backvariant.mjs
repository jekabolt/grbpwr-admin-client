#!/usr/bin/env node
// PATTERN-IMPORT · L15 BACK-VARIANT: labelled variant notches («High back notch» / «Low back
// notch» on kombinezon P03) — asked, never picked; the answer leaves one back notch per size; a
// label naming the model is applied; the mutation without the evidence asks (backvariant-entry.ts).
//   node scripts/pattern-import/backvariant.mjs [case …]        (yarn patimport:backvariant)
//   env PATIMPORT_E2E_OUT (case dirs, default a temp dir). Exit 1 on any failed check.
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.BACKVARIANT_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.BACKVARIANT_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ? 1 : 0);
}
const outfile = resolve(tmpdir(), `patimport-backvariant-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'backvariant-entry.ts')],
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
  [
    '--expose-gc',
    '--max-old-space-size=8192',
    fileURLToPath(import.meta.url),
    ...process.argv.slice(2),
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      BACKVARIANT_CHILD: outfile,
      PATIMPORT_E2E_OUT:
        process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-backvariant-out'),
    },
  },
);
process.exit(r.status ?? 1);
