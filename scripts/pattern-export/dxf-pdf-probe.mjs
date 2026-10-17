#!/usr/bin/env node
// PATTERN-EXPORT probe: DXF → PDF 1:1 (one sheet + tiles) and the ROUND TRIP through our own PDF
// importer (scale detection + tile assembly), so «our export re-imports» is measured, not hoped.
//   node scripts/pattern-export/dxf-pdf-probe.mjs <file.dxf|file.plt> <out-dir> [A4|A3|Letter]
// Writes <stem>-sheet.pdf, <stem>-tiles-<paper>.pdf and PNGs of page 1 + one tile (pdftoppm).
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const outfile = resolve(tmpdir(), `pattern-export-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'dxf-pdf-probe-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  preserveSymlinks: true,
  alias: {
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
});
process.env.PATIMPORT_REPO = REPO;
const m = await import(pathToFileURL(outfile).href);
const res = await m.main(process.argv.slice(2));
for (const [pdf, page, png] of res.renders ?? []) {
  const r = spawnSync('pdftoppm', [
    '-png',
    '-r',
    '60',
    '-f',
    String(page),
    '-l',
    String(page),
    '-singlefile',
    pdf,
    png,
  ]);
  console.log(r.status === 0 ? `png ${png}.png` : `pdftoppm failed: ${r.stderr}`);
}
process.exit(res.code ?? 0);
