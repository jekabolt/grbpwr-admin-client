#!/usr/bin/env node
// PATTERN-IMPORT · GRADE P0 probe — tolerance calibration of the gfit grade model on CAD-graded DXF
// (see gfit-entry.ts). Writes only under /private/tmp/patimport-runs/gradep0 (GFIT_OUT), PNGs to
// GFIT_PNG when set. Probe only: the module (src/lib/pattern-import/pieces/gfit) is not wired in.
//   node scripts/pattern-import/gfit.mjs cad [file.dxf …]
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.GFIT_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.GFIT_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}
const outfile = resolve(tmpdir(), `patimport-gfit-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'gfit-entry.ts')],
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
  { env: { ...process.env, GFIT_CHILD: outfile }, stdio: 'inherit', cwd: REPO },
);
process.exit(r.status ?? 1);
