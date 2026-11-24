// Replay only the new reader against frozen, pre-repair native Pieces inputs.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
const [dir] = process.argv.slice(2);
assert(dir, 'Expected corpus directory containing native session.v8.gz files');
const bundle = await build({
  entryPoints: ['src/lib/pattern-import/pieces/printed-mark-contour.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { readPrintedMarkContours } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64')
);
const ranges = JSON.parse(
  readFileSync(new URL('../../docs/pattern-import/albuca-printed-ranges.json', import.meta.url)),
);
for (const [name, expected, total] of [
  ['Albuca', 18, 18],
  ['Estoril', 87, 90],
  ['Spokane', 51, 54],
  ['Harrington', 67, 70],
]) {
  const file = readdirSync(dir).find((n) => n.includes('-' + name + '-'));
  const s = deserialize(gunzipSync(readFileSync(join(dir, file, 'session.v8.gz'))));
  function replay(sheet, excluded = new Set()) {
    const families = structuredClone(s.families);
    readPrintedMarkContours(
      sheet,
      s.set,
      s.run,
      s.seeds,
      new Map(families.map((f) => [f.seed, f.candidates])),
      excluded,
    );
    return families;
  }
  const result = replay(s.sheet);
  let closed = 0,
    n = 0;
  for (let i = 0; i < s.families.length; i++)
    for (let j = 0; j < s.families[i].candidates.length; j++) {
      const old = s.families[i].candidates[j],
        current = result[i].candidates[j];
      if (old.outcome === 'closed' || name !== 'Albuca') assert.deepEqual(current, old);
      else assert(current.printedMotif && current.outcome === 'closed');
      if (current.outcome === 'closed') closed++;
      n++;
    }
  assert.equal(closed, expected);
  assert.equal(n, total);
  console.log(name, closed + '/' + n);
  if (name !== 'Albuca') continue;
  assert.deepEqual(replay(s.sheet, new Set([0])), s.families);
  for (const [label, page] of [
    ['XS', 13],
    ['L', 23],
    ['2XL', 23],
  ]) {
    const band = ranges[label].find(([p]) => p === page);
    const paths = s.sheet.paths.map((p) =>
      p.src.page === page - 1 && p.src.op >= band[1] && p.src.op <= band[2]
        ? { ...p, visibleMotif: false }
        : p,
    );
    const rejected = replay({ ...s.sheet, paths });
    const rank = result[1].candidates.find((c) => s.run.sizes[c.rank].label === label).rank;
    for (const f of rejected)
      for (const c of f.candidates) {
        const want = (f.seed === s.families[1].seed && c.rank === rank ? s.families : result)
          .find((r) => r.seed === f.seed)
          .candidates.find((q) => q.rank === c.rank);
        assert.deepEqual(c, want);
      }
    console.log(label, 'missing printed range rejected', band);
  }
}
