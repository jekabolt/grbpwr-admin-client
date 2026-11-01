#!/usr/bin/env node
// PATTERN-IMPORT · BTN — the buttons of the golden CLO shirt (AAMA base DXF + RUL): a button is a
// circle whose centre is graded, radius constant across sizes. Bundles btn-entry.ts with esbuild,
// runs it in node. Writes btn-after.svg next to the golden pair.
//   node scripts/pattern-import/btn.mjs   (yarn patimport:btn; exit 1 on any FAIL)
//   PATIMPORT_GOLDEN_CLO=<dir>        the golden pair (allsizes.dxf + allsizes.rul)
//   PATIMPORT_BTN_BEFORE=<dxf>        a per-size export of the old code, drawn behind in the SVG
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-btn-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'btn-entry.ts')],
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
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
process.exit((await m.main()) ?? 0);
