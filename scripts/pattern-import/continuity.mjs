#!/usr/bin/env node
// PATTERN-IMPORT · P1 continuity walls + cause E: synthetic controls (one per rule, each guarded by
// a mutation) + the dossier's leak cases on the corpus (viola, leonie, palto at the automatic
// pieces run: what closes through continuity walls, what is refused, no wrong closure).
//   node scripts/pattern-import/continuity.mjs [--synthetic-only | --corpus-only]
//   (yarn patimport:continuity)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.CONT_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.CONT_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ? 1 : 0);
}
const outfile = resolve(tmpdir(), `patimport-continuity-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'continuity-entry.ts')],
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
  { env: { ...process.env, CONT_CHILD: outfile }, stdio: 'inherit', cwd: REPO },
);
process.exit(r.status ?? 1);
