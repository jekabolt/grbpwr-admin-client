#!/usr/bin/env node
// PATTERN-IMPORT · SIZESOCG: kombinezon waistband strips — hovering a size lights its own strip end
// (OCG layer vs dash + nesting; the sides every size shares split off as one common line).
//   node scripts/pattern-import/sizesocg.mjs   (yarn patimport:sizesocg)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.SOCG_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.SOCG_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ? 1 : 0);
}
const outfile = resolve(tmpdir(), `patimport-sizesocg-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'sizesocg-entry.ts')],
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
      PATIMPORT_E2E_OUT:
        process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-sizesocg-out'),
      SOCG_CHILD: outfile,
    },
    stdio: 'inherit',
    cwd: REPO,
  },
);
process.exit(r.status ?? 1);
