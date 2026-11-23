// Compare a fresh native session with the shared baseline and the separate source-checked cuts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import DxfParser from 'dxf-parser';
import { build } from 'esbuild';

const [before, after, accepted48, control36, controlUpper, output] = process.argv.slice(2);
const read = (dir) => deserialize(gunzipSync(readFileSync(join(dir, 'session.v8.gz'))));
const [baseline, final, reference] = [before, after, accepted48].map(read);
const { outputFiles } = await build({
  entryPoints: ['src/lib/pattern-import/write/r12.ts'],
  bundle: true,
  format: 'esm',
  write: false,
});
const { writeR12 } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);
const targets = [
  [1, 'A_BACK', '36'],
  [4, 'G_WAISTBAND', '36'],
  [6, 'E_POCKETS', '36'],
  ...[38, 42, 48, 52].map((n) => [1, 'A_BACK', String(n)]),
];
function block(s, [seed, identity, labelSize]) {
  const f = s.families.find((f) => f.seed === seed);
  const c = f.candidates.find((c) => String(s.run.sizes[c.rank].label) === labelSize);
  assert.equal(c.outcome, 'closed');
  return {
    name: identity + '_' + labelSize,
    identity,
    displayName: identity,
    quantity: 1,
    labelSize,
    material: '',
    annotation: ['Diagnostic source cut'],
    cut: c.outer.map((p) => ({ x: p.x - c.bbox.minX, y: p.y - c.bbox.minY })),
    cutLoops: [],
    internal: [],
    drawn: [],
    foldLines: 0,
    drills: [],
    notches: [],
  };
}
function save(name, blocks) {
  const path = join(output, name);
  writeFileSync(
    path,
    writeR12(blocks, {
      styleName: 'Harrington native contour check',
      createdAt: '2026-11-22T00:00:00Z',
      sampleSize: '36',
    }),
  );
  return path;
}
const decode = (path) => new DxfParser().parseSync(readFileSync(path, 'utf8')).blocks;
const controls = {
  ...decode(control36),
  ...decode(controlUpper),
  ...decode(
    save(
      'reference-48-52.dxf',
      targets.slice(-2).map((t) => block(reference, t)),
    ),
  ),
};
const reread = decode(
  save(
    'harrington-main-seven.dxf',
    targets.map((t) => block(final, t)),
  ),
);
const vertices = (block) => {
  const lines = block.entities.filter(
    (e) => e.type === 'POLYLINE' && String(e.layer) === '1' && e.shape,
  );
  assert.equal(lines.length, 1);
  return lines[0].vertices.map((p) => [p.x, p.y]);
};
const stats = {};
for (const key of targets.map(([, id, size]) => id + '_' + size)) {
  const actual = vertices(reread[key]);
  assert.deepEqual(actual, vertices(controls[key]));
  stats[key] = actual.length;
}
let preserved = 0;
for (const f of baseline.families)
  for (const c of f.candidates) {
    const size = String(baseline.run.sizes[c.rank].label);
    if (targets.some(([seed, , s]) => seed === f.seed && s === size)) continue;
    assert.equal(c.outcome, 'closed');
    const q = final.families.find((g) => g.seed === f.seed).candidates[c.rank];
    assert.equal(q.outcome, 'closed');
    assert.deepEqual(q.outer, c.outer);
    preserved++;
  }
assert.equal(preserved, 63);
console.log(JSON.stringify({ exactDxfVertices: stats, otherCutsPreserved: preserved }, null, 2));
