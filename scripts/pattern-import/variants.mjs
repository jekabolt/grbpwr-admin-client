#!/usr/bin/env node
// PATTERN-IMPORT · VARIANTS: pieces.out.variantMarks on the corpus models sheet (kombinezon A/B) —
// the marks exist (never `[]` on a sheet whose models differ), each model's cutLines are exactly
// its knives (variantKnifeItems) as sheet-mm polylines, the Style-A-only pieces are claimed, and a
// sheet PNG with each model's marks. Exit 1 on any failed check.
//   node scripts/pattern-import/variants.mjs        (yarn patimport:variants)
//   env PATIMPORT_E2E_OUT (case dirs, default a temp dir), VARIANTS_OUT (PNG + JSON, default the same)
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (process.env.VARIANTS_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.VARIANTS_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ? 1 : 0);
}
const outfile = resolve(tmpdir(), `patimport-variants-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'variants-entry.ts')],
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
      VARIANTS_CHILD: outfile,
      PATIMPORT_E2E_OUT:
        process.env.PATIMPORT_E2E_OUT ?? resolve(tmpdir(), 'patimport-variants-out'),
    },
  },
);
process.exit(r.status ?? 1);
