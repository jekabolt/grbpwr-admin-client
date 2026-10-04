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
const out = resolve(tmpdir(), `quiz-pictograms-sheet-${process.pid}.mjs`);

await build({
  entryPoints: [resolve(HERE, 'quiz-pictograms-sheet-svg.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
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

const metadata = svg.match(/data-families="(\d+)" data-parts="(\d+)" data-shapes="(\d+)"/);
if (!metadata) throw new Error('contact-sheet metadata is missing');
const [, families, parts, shapes] = metadata;
if (families !== '30' || shapes !== '30') {
  throw new Error(`expected 30 families and shapes, got ${families} and ${shapes}`);
}

writeFileSync(svgPath, svg);
const renderer = ['/opt/homebrew/bin/rsvg-convert', '/usr/local/bin/rsvg-convert'].find(existsSync);
if (!renderer) throw new Error('rsvg-convert not found');
execFileSync(renderer, ['-o', pngPath, svgPath]);

console.log(`ok ${families} families · ${parts} part marks`);
console.log(`svg ${svgPath}`);
console.log(`png ${pngPath}`);
