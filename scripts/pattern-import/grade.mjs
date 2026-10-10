#!/usr/bin/env node
// PATTERN-IMPORT · HARD-SIZES H1 probe — size assignment for sheets where every size is drawn with
// the SAME line, no labels, lines crossing (pieces/grade). Bundles grade-entry.ts with esbuild and
// runs it in node against the stripped bench (tmp/plans/pdf-to-dxf/hard-sizes/h0/bench/).
//   node scripts/pattern-import/grade.mjs [all|baseline|solve|controls|encoded|render] [sample…] [L1|L2]
//   env PATIMPORT_GRADE_BENCH (bench dir), PATIMPORT_GRADE_OUT (reports / overlays dir)
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `patimport-grade-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'grade-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
const code = await m.main(process.argv.slice(2));
process.exit(code ?? 0);
