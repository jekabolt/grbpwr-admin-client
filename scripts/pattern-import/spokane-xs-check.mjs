// Compare one fresh dxf-shot result against the Spokane snapshot after B S/M.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [baseline, current] = process.argv.slice(2);
const read = (dir, file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const before = read(baseline, 'cells.json');
const after = read(current, 'cells.json');
let preserved = 0;
let checkedXS = false;
for (const family of before) {
  const updated = after.find((f) => f.seed === family.seed && f.label === family.label);
  assert.equal(updated?.cells.length, family.cells.length);
  for (const old of family.cells) {
    const cell = updated.cells.find((c) => c.size === old.size);
    assert.equal(cell.outcome, old.outcome);
    if (family.label === 'B - FRONT' && cell.size === 'XS') {
      // Cells serialize in sheet coordinates rounded to 0.1 mm. These are the
      // PDF hem corners, side curve and neck curve, including XS outside S/M.
      for (const [x, y] of [
        [802.405, 991.574],
        [1158.044, 991.574],
        [803.765, 1303.441],
        [1081.735, 1530.265],
      ]) {
        const errors = cell.outer.map(([a, b], i, ring) => {
          const [c, d] = ring[(i + 1) % ring.length],
            dx = c - a,
            dy = d - b;
          const t = Math.max(
            0,
            Math.min(1, ((x - a) * dx + (y - b) * dy) / (dx * dx + dy * dy || 1)),
          );
          return Math.hypot(x - a - t * dx, y - b - t * dy);
        });
        assert(Math.min(...errors) < 0.15, 'XS misses its printed pen at ' + [x, y]);
      }
      assert.equal(Math.min(...cell.outer.map((p) => p[1])), 991.6);
      checkedXS = true;
    } else {
      assert.deepEqual(cell.outer, old.outer, family.label + ' ' + cell.size);
      if (old.outcome === 'closed') preserved++;
    }
  }
}
assert(checkedXS);
assert.equal(preserved, 52);
const run = read(current, 'run.json');
assert.equal(run.stop.step, 'pieces');
assert.match(run.stop.reason, /1 region.*A - BACK: leak/);
assert.equal(run.write, null);
console.log('B XS follows its printed cut; 52 previous cuts match, A M open, apply 0.');
