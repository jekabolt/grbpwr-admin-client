#!/usr/bin/env node
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');
const pngPath = process.env.SHEET ?? resolve(tmpdir(), 'pictograms-sheet.png');
const svgPath = process.env.SHEET_SVG ?? resolve(tmpdir(), 'pictograms-sheet.svg');
const out = resolve(tmpdir(), `quiz-pictograms-sheet-${process.pid}.cjs`);

await build({
  entryPoints: [resolve(HERE, 'quiz-pictograms-sheet-svg.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: out,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  alias: Object.fromEntries(
    [
      'components',
      'lib',
      'api',
      'utils',
      'ui',
      'constants',
      'store',
      'hooks',
      'context',
      'types',
      'styles',
    ].map((name) => [name, resolve(root, 'src', name)]),
  ),
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
});

let svg = '';
try {
  svg = execFileSync(process.execPath, [out], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
} finally {
  rmSync(out, { force: true });
}

const metadata = svg.match(
  /data-families="(\d+)" data-parts="(\d+)" data-shapes="(\d+)" data-manifest="(\d+)" data-undrawn="(\d+)" data-hardware="(\d+)" data-labels="(\d+)" data-seams="(\d+)" data-palettes="(\d+)"/,
);
if (!metadata) throw new Error('contact-sheet metadata is missing');
const [, families, parts, shapes, manifestFamilies, undrawn, hardware, labels, seams, palettes] =
  metadata;
// the family count comes from the manifest, not a literal (95 §3.3)
if (families !== manifestFamilies || shapes !== manifestFamilies) {
  throw new Error(
    `expected ${manifestFamilies} families and shapes (manifest), got ${families} and ${shapes}`,
  );
}
if (undrawn !== '0') console.warn(`warn ${undrawn} families drawn as their manifest base`);
if (hardware !== '20') throw new Error(`expected 20 hardware icons, got ${hardware}`);
if (labels !== '6') throw new Error(`expected 6 label icons, got ${labels}`);
if (seams !== '26') throw new Error(`expected 26 seam and edge icons, got ${seams}`);
if (palettes !== '1') throw new Error(`expected 1 palette icon, got ${palettes}`);

writeFileSync(svgPath, svg);
const renderer = ['/opt/homebrew/bin/rsvg-convert', '/usr/local/bin/rsvg-convert'].find(existsSync);
if (!renderer) throw new Error('rsvg-convert not found');
execFileSync(renderer, ['-o', pngPath, svgPath]);

console.log(
  `ok ${families} families · ${parts} part marks · ${hardware} hardware icons · ${labels} label icons · ${seams} seam icons · ${palettes} palette icon`,
);
console.log(`svg ${svgPath}`);
console.log(`png ${pngPath}`);
