#!/usr/bin/env node
// PATTERN-IMPORT · SILENT probe — the size-run sanity and the grade-model neighbour hold, offline over
// GRADE-REVIEW family dumps (GFIT_REVIEW_DIR): node scripts/pattern-import/silent.mjs dump <dir> [out.json]
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.SILENT_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.SILENT_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}
const outfile = resolve(tmpdir(), `patimport-silent-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'silent-entry.ts')],
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
  { env: { ...process.env, SILENT_CHILD: outfile }, stdio: 'inherit', cwd: REPO },
);
process.exit(r.status ?? 1);
