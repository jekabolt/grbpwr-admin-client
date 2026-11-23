// Offline ownership test for Ventura J. Replays the same wizard with and without
// the curved source reader, then checks the resulting piece and every other cell.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import DxfParser from 'dxf-parser';
import { perimeterError } from './automatic-gap-source-curves.mjs';

const [original, sourceDxf, output, mode = 'paired', compareRun] = process.argv.slice(2);
assert(
  original && sourceDxf && output && !existsSync(output) && ['paired', 'production'].includes(mode),
  'Usage: node automatic-gap-source-ventura.mjs <original PDF> <verified pocket DXF> <new directory> [paired|production] [control run directory]',
);
assert.equal(
  createHash('sha256').update(readFileSync(original)).digest('hex'),
  '26e070c8836aa10c21744acafb8dbf747725396acf83e74045802ab8a0320389',
);
const verified = new DxfParser().parseSync(readFileSync(sourceDxf, 'utf8'));
assert.equal(verified.header.$INSUNITS, 4);
assert.equal(verified.entities.length, 8);
const card = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String((i + 1) * 2))];
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
mkdirSync(output, { recursive: true });
const bundle = resolve(output, 'runner.mjs');
await build({
  entryPoints: [resolve(here, 'dxf-shot-entry.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: { react: resolve(here, 'react-hook-shim.ts') },
  plugins: [
    {
      name: 'source-oracle',
      setup(b) {
        b.onLoad({ filter: /printed-cut-ranges\.ts$/ }, ({ path }) => {
          const source = readFileSync(path, 'utf8');
          const signature =
            'export function readPrintedCuts(d: PrintedCutInput, card: string[]): PrintedCutGroup[][] {';
          assert(source.includes(signature));
          return {
            loader: 'ts',
            contents: source.replace(
              signature,
              signature + '\n  if (globalThis.__venturaControl) return rangesFor(d, card, false);',
            ),
          };
        });
        b.onLoad({ filter: /dxf-shot-entry\.ts$/ }, ({ path }) => {
          const source = readFileSync(path, 'utf8'),
            first = 'const first = await run([], null);';
          assert(source.includes(first));
          return {
            loader: 'ts',
            contents: source.replace(
              first,
              'const first = {sizesRead: {labels: ' + JSON.stringify(card) + '}};',
            ),
          };
        });
      },
    },
  ],
});

Object.assign(process.env, {
  PATIMPORT_REPO: repo,
  PIECES_OPEN_PASS: '1',
  AUTOPILOT_OUTLINES: '1',
});
const { main } = await import(pathToFileURL(bundle).href);
const read = (mode, name) => JSON.parse(readFileSync(resolve(output, mode, name)));
const modes = mode === 'production' ? ['production'] : ['control', 'assigned'];
for (const variation of modes) {
  globalThis.__venturaControl = variation === 'control';
  if (variation === 'production') delete process.env.PIECES_OPEN_PASS;
  assert.equal(await main([resolve(original), resolve(output, variation)]), 0);
  assert.equal(read(variation, 'run.json').error, null);
}
function cellsOf(families) {
  return new Map(
    families.flatMap((f) => f.cells.map((c) => [[f.seed, f.label, c.size].join('/'), c])),
  );
}
const reviewedSizes = verified.entities.map((e) => e.layer.slice('J_POCKET_'.length));
function shapeError(c) {
  const reference = verified.entities.find((e) => e.layer === 'J_POCKET_' + c.size);
  assert(reference?.shape && c.from === 'printed-range');
  const local = (points) => {
    const x = Math.min(...points.map((p) => p.x)),
      y = Math.min(...points.map((p) => p.y));
    return points.map((p) => ({ x: p.x - x, y: p.y - y }));
  };
  const errorMm = perimeterError(
    local(c.outer.map(([x, y]) => ({ x, y }))),
    local(reference.vertices),
  );
  assert(errorMm < 0.5, c.size + ' disagreement ' + errorMm);
  return errorMm;
}
if (mode === 'production') {
  const run = read(mode, 'run.json'),
    families = read(mode, 'cells.json');
  const family = families.find((f) => f.label === 'J - POCKET');
  const all = cellsOf(families);
  const gains =
    family?.cells
      .filter((c) => reviewedSizes.includes(c.size) && c.outcome === 'closed')
      .map((c) => ({ size: c.size, errorMm: shapeError(c) })) ?? [];
  const changedPriorClosed = [],
    lostPriorClosed = [];
  let previouslyClosed = null;
  if (compareRun && all.size) {
    const before = cellsOf(JSON.parse(readFileSync(resolve(compareRun, 'cells.json'))));
    previouslyClosed = 0;
    for (const [key, c] of before)
      if (c.outcome === 'closed') {
        previouslyClosed++;
        const after = all.get(key);
        if (after?.outcome !== 'closed') lostPriorClosed.push(key);
        else if (JSON.stringify(c.outer) !== JSON.stringify(after.outer))
          changedPriorClosed.push(key);
      }
  }
  const comparison = {
    ms: run.ms,
    verdict: run.verdict,
    stop: run.stop,
    write: run.write,
    cells: all.size,
    pocketClosed: family?.cells.filter((c) => c.outcome === 'closed').length ?? null,
    gains,
    previouslyClosed,
    lostPriorClosed,
    changedPriorClosed,
  };
  writeFileSync(resolve(output, 'comparison.json'), JSON.stringify(comparison, null, 2));
  console.log(JSON.stringify(comparison, null, 2));
  process.exit(0);
}
function cells(mode) {
  return cellsOf(read(mode, 'cells.json'));
}
const control = cells('control'),
  assigned = cells('assigned');
assert.deepEqual([...assigned.keys()], [...control.keys()]);
const gains = [];
// Compare independently digitised and reported outlines in piece-local millimetres.
for (const [key, c] of control) {
  const trial = assigned.get(key);
  if (c.outcome === trial.outcome) {
    if (c.outcome === 'closed') assert.deepEqual(trial.outer, c.outer, key);
    continue;
  }
  assert.equal(c.outcome, 'leak', key);
  assert.equal(trial.outcome, 'closed', key);
  assert(key.includes('/J - POCKET/'), key);
  const errorMm = shapeError(trial);
  gains.push({ size: c.size, errorMm });
}
assert.deepEqual(
  gains.map((g) => g.size),
  ['10', '12', '14', '18', '24', '26', '28', '30'],
);
const result = {
  gains,
  cells: control.size,
  controlStop: read('control', 'run.json').stop,
  assignedStop: read('assigned', 'run.json').stop,
  assignedWrite: read('assigned', 'run.json').write,
};
writeFileSync(resolve(output, 'comparison.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
