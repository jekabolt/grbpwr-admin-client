#!/usr/bin/env node
// PATTERN-IMPORT · GRADE P2 probe — the synthetic honesty probe of the leak repair (see
// gradep2-entry.ts). Writes only under GRADEP2_OUT (default /private/tmp/patimport-runs/gradep2/honesty),
// PNGs to GRADEP2_PNG when set. EXIT 1 = an accepted repair beyond tolerance.
//   yarn patimport:gradep2
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.GRADEP2_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.GRADEP2_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}
const outfile = resolve(tmpdir(), `patimport-gradep2-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'gradep2-entry.ts')],
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
  { env: { ...process.env, GRADEP2_CHILD: outfile }, stdio: 'inherit', cwd: REPO },
);
process.exit(r.status ?? 1);
