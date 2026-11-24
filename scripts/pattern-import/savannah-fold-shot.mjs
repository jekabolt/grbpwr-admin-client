// Run the Savannah wizard with the PDF's stated sizes, cuts, and a test card with contrast facings.
// node scripts/pattern-import/savannah-fold-shot.mjs original.pdf new-output-directory main|contrast
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const [pdf, out, cloth] = process.argv.slice(2);
assert(['main', 'contrast'].includes(cloth), 'Select main or contrast for the hem facings');
assert(
  pdf && out && !existsSync(out),
  'Expected original Savannah PDF and unused output directory',
);
assert.equal(
  createHash('sha256').update(readFileSync(pdf)).digest('hex'),
  '5990cd5fc6d1b19bdc7302268e84268652552a4c1beab1a1dc29384405ce3bab',
);
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(out, { recursive: true });
const runner = resolve(out, 'runner.mjs');
await build({
  stdin: {
    contents:
      "export { main } from './dxf-shot-entry'; export { SCOPES } from './autopilot-entry';",
    resolveDir: here,
  },
  outfile: runner,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: { react: resolve(here, 'react-hook-shim.ts') },
});
const card = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String(2 * i + 2))];
const cardFile = join(out, 'case.json');
writeFileSync(cardFile, JSON.stringify({ id: basename(pdf).replace(/\.pdf$/i, ''), card }));
const purpose = 'TECH_CARD_BOM_PURPOSE_CONTRAST';
const { main, SCOPES } = await import(pathToFileURL(runner).href);
if (cloth === 'contrast')
  SCOPES.push({
    scopeKey: purpose,
    fabricPurpose: purpose,
    bomLineKey: 'L4',
    label: 'contrast',
    isInterlining: false,
    sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
  });
process.env.PATIMPORT_REPO = resolve(here, '../..');
process.env.GOLDEN_ANSWERS = JSON.stringify({
  pages: true,
  asides: true,
  outline: 'cut',
  qty: { 3: 2 },
});
delete process.env.PIECES_OPEN_PASS;
assert.equal(await main([resolve(pdf), resolve(out), resolve(cardFile)]), 0);
const report = JSON.parse(readFileSync(join(out, 'run.json'), 'utf8'));
const cells = report.families.flatMap((family) => family.cells);
assert.equal(cells.length, 180);
assert(
  cells.every((cell) => cell.outcome === 'closed'),
  JSON.stringify(report.stop),
);
console.log(JSON.stringify({ verdict: report.verdict, stop: report.stop, write: report.write }));
