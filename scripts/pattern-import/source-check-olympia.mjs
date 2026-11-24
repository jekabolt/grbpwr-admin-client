// Check the nine diagnostic layer-1 polygons and two ambiguous PDF turns.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import DxfParser from 'dxf-parser';

const [snapshot, output] = process.argv.slice(2);
assert(output, 'Expected a native Pieces snapshot and a diagnostic DXF output path');
const session = deserialize(gunzipSync(readFileSync(snapshot)));
const bundle = await build({
  stdin: {
    contents:
      "export {planBlocks} from './src/lib/pattern-import/write/plan'; export {writeR2000} from './src/lib/pattern-import/write/r2000';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: 'esm',
});
const { planBlocks, writeR2000 } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const family = session.families.find(
  (f) => session.seeds.find((s) => s.id === f.seed)?.text?.text === 'C - FRONT WAIST PANEL',
);
assert(family, 'Missing C FRONT WAIST PANEL');
const rankOf = (label) => session.run.sizes.find((s) => s.label === label).rank;
for (const label of ['2', '26']) {
  const c = family.candidates.find((c) => c.rank === rankOf(label));
  assert.equal(c.outcome, 'refused');
  assert.equal(c.outer.length, 0);
  assert.equal(c.foldPanelAlternatives?.length, 2);
  assert(c.foldPanelPaths?.length);
}
const ref = new DxfParser().parseSync(
  readFileSync(new URL('../../docs/pattern-import/olympia-c-control.dxf', import.meta.url), 'utf8'),
);
const expected = ref.entities.map((e) => e.name).sort();
assert.equal(expected.length, 9);
const sizes = expected.map((block) => {
  const sizeToken = block.slice(2),
    rank = rankOf(sizeToken),
    c = family.candidates.find((c) => c.rank === rank);
  assert.equal(c.outcome, 'closed');
  assert(c.foldPanelPaths?.length);
  return { rank, sizeToken, sizeId: rank + 1, cut: c.outer, notches: [], drills: [], internal: [] };
});
const plan = planBlocks(
  [
    {
      identity: 'C',
      displayName: 'C FRONT WAIST PANEL',
      piecesPerGarment: 1,
      fabrics: ['control'],
      sizes,
    },
  ],
  { scopeKey: 'control', label: 'Olympia' },
);
writeFileSync(output, writeR2000(plan.blocks));
const current = new DxfParser().parseSync(readFileSync(output, 'utf8'));
assert.equal(current.header.$INSUNITS, 4);
assert.deepEqual(current.entities.map((e) => e.name).sort(), expected);
for (const name of expected) {
  const [a, b] = [current, ref].map((d) => {
    const cuts = d.blocks[name].entities.filter((e) => e.type === 'LWPOLYLINE' && e.layer === '1');
    assert.equal(cuts.length, 1);
    assert.equal(cuts[0].shape, true);
    return cuts[0].vertices;
  });
  assert.deepEqual(a, b, name + ' differs from the original PDF control');
}
console.log(JSON.stringify({ identicalLayer1: expected, ambiguous: ['2', '26'] }));
