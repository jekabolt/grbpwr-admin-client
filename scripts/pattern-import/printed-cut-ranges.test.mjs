import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readPrintedCuts } from './printed-cut-ranges.mjs';

const card = ['00', '0', '2', '4'];
function sheet() {
  const pt = (x, y) => ({ x, y });
  const source = (op, page = 0) => ({ op, page, file: 'drawing', sub: 0 });
  const label = (text, x, y) => ({
    text,
    anchor: pt(x, y),
    bbox: { minX: x, maxX: x + 1, minY: y, maxY: y + 1 },
    src: source(0),
  });
  const texts = [
    label('A - POCKET', 5, 5),
    label('Cut 2', 10, 10),
    label('00 - 0', 39, 39),
    label('2 - 4', 49, 49),
  ];
  const paths = [],
    chains = [],
    classes = [];
  for (const [index, n] of [40, 50].entries()) {
    const id = paths.length;
    // The top and right corner are on the next tile. The gap is one PDF dash space.
    const fragments = [
      [pt(n / 2, 0), pt(0, 0), pt(0, n), pt(n - 1, n)],
      [pt(n - 0.5, n), pt(n, n), pt(n, 0), pt(n / 2 + 0.5, 0)],
    ];
    for (const [page, pts] of fragments.entries()) {
      const id = paths.length;
      paths.push({ id, pts, src: source(index * 6, page), style: 0, closed: false });
      chains.push({ id, ranges: [{ path: id, from: 0, to: pts.length - 1 }] });
    }
    classes.push({
      role: 'size',
      sizeLabel: card[index * 2],
      chains: [id, id + 1],
      evidence: [{ kind: 'legend-sample' }],
    });
  }
  return {
    paths,
    chains,
    classes,
    styles: [{ dash: [2, 0.5], widthMm: 0.2, fill: false }],
    texts,
    seeds: [{ id: 3, origin: 'text', at: pt(8, 8), text: texts[0] }],
  };
}
test('two size groups read across tiles', () => {
  const groups = readPrintedCuts(sheet(), card);
  assert.deepEqual(
    groups.map((gs) => gs.map((g) => [g.lo, g.hi, g.outer.length])),
    [
      [
        [0, 1, 4],
        [2, 3, 4],
      ],
    ],
  );
});
for (const [reason, change] of [
  ['placement annotation', (d) => d.texts.push({ ...d.texts[0], text: 'Patch pocket placement' })],
  ['missing original stroke', (d) => d.paths.splice(1, 1)],
  ['gap longer than the printed pen space', (d) => (d.styles[0].dash = [2, 0.1])],
  ['missing printed group', (d) => d.texts.pop()],
  ['partial class attribution', (d) => (d.chains[1].ranges[0].to = 1)],
  ['second piece enclosed', (d) => d.seeds.push({ ...d.seeds[0], id: 4 })],
]) {
  test('abstains with ' + reason, () => {
    const d = sheet();
    change(d);
    assert.deepEqual(readPrintedCuts(d, card), []);
  });
}
