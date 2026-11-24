// Write the four audited Pieces cuts through the production DXF writer and compare layer 1.
// node scripts/pattern-import/source-check-silverstone.mjs <session.v8.gz> <output.dxf>
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
const specs = ['G - SKIRT FRONT LINING', 'E - SKIRT BACK'].map((displayName) => {
  const identity = displayName[0];
  const seed = session.seeds.find((s) => s.text?.text === displayName);
  const family = session.families.find((f) => f.seed === seed?.id);
  return {
    identity,
    displayName,
    fabrics: ['control'],
    piecesPerGarment: 1,
    sizes: ['4XL', '5XL'].map((sizeToken) => {
      const rank = session.run.sizes.find((s) => s.label === sizeToken).rank;
      const candidate = family.candidates.find((c) => c.rank === rank);
      assert.equal(candidate.outcome, 'closed');
      return {
        rank,
        sizeToken,
        sizeId: rank + 1,
        cut: candidate.outer,
        notches: [],
        drills: [],
        internal: [],
      };
    }),
  };
});
const plan = planBlocks(specs, { scopeKey: 'control' });
writeFileSync(output, writeR2000(plan.blocks));
const parse = (path) => new DxfParser().parseSync(readFileSync(path, 'utf8'));
const actual = parse(output);
const proof = parse(
  new URL('../../docs/pattern-import/silverstone-4xl-control.dxf', import.meta.url),
);
const source = readFileSync(
  new URL('../../docs/pattern-import/silverstone-5xl-source.csv', import.meta.url),
  'utf8',
)
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((s) => s.split(','));
assert.equal(actual.header.$INSUNITS, 4);
assert.equal(proof.header.$INSUNITS, 4);
for (const spec of specs) {
  for (const s of spec.sizes) {
    const name = spec.identity + '_' + s.sizeToken;
    const cuts = [actual, proof].map((d) => {
      const cuts = d.blocks[name].entities.filter(
        (e) => e.layer === '1' && e.type === 'LWPOLYLINE',
      );
      assert.equal(cuts.length, 1);
      assert.equal(cuts[0].shape, true);
      return cuts[0].vertices;
    });
    assert.equal(cuts[0].length, cuts[1].length, name);
    // Check the entire ordered polygon, permitting only the writer's shelf translation.
    const [a, b] = cuts;
    const dx = b[0].x - a[0].x,
      dy = b[0].y - a[0].y;
    const max = Math.max(...a.map((p, i) => Math.hypot(p.x + dx - b[i].x, p.y + dy - b[i].y)));
    assert(max < 0.000003, name + ' differs from the paper-audited layer 1 by ' + max + ' mm');
    const result = {
      name,
      nativeVertices: s.cut.length,
      writtenVertices: a.length,
      maxDxFDifferenceMm: max,
    };
    if (s.sizeToken === '5XL') {
      const centers = source.filter((row) => row[0] === spec.identity);
      // Native source marks may be enumerated from another corner or in reverse.
      assert.equal(s.cut.length, centers.length);
      const xy = centers.map((r) => ({ x: Number(r[5]), y: Number(r[6]) }));
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      const start = xy.findIndex((p) => dist(p, s.cut[0]) < 0.00001);
      assert(start >= 0);
      const n = xy.length;
      const errors = [-1, 1].map((sign) =>
        Math.max(...s.cut.map((p, i) => dist(p, xy[(start + sign * i + n) % n]))),
      );
      result.maxOriginalCenterDifferenceMm = Math.min(...errors);
      assert(result.maxOriginalCenterDifferenceMm < 0.01, JSON.stringify(result));
    }
    console.log(JSON.stringify(result));
  }
}
