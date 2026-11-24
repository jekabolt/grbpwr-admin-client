// Read Savannah's button crosses directly from the three PDF tiles and the cut/check DXF.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { OPS, getDocument, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';

const [original, cellsPath, ...written] = process.argv.slice(2);
assert(written.length, 'Expected original.pdf cells.json main.dxf [interlining.dxf]');
const bytes = readFileSync(original);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '5990cd5fc6d1b19bdc7302268e84268652552a4c1beab1a1dc29384405ce3bab',
);
const sizes = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String(2 * i + 2))];
// Horizontal paint operators in printed size order. Each perpendicular mate follows by five
// operators except the size 0 mark which crosses a tile boundary between pages 9 and 14.
const rows = [
  [
    14,
    [
      1305, 1272, 1241, 1338, 1209, 1177, 1146, 1115, 1082, 1049, 1018, 987, 956, 925, 893, 861,
      830, 797,
    ],
  ],
  [
    14,
    [
      1964, 1916, 1226, 1323, 1194, 1162, 1131, 1100, 1067, 1034, 1003, 972, 941, 910, 878, 846,
      815, 782,
    ],
  ],
  [
    9,
    [
      1949, 1901, 1865, 1997, 1833, 1801, 1770, 1739, 1706, 1673, 1642, 1611, 1580, 1549, 1517,
      1485, 1454, 1421,
    ],
  ],
  [
    9,
    [
      1934, 1886, 1850, 1982, 1818, 1786, 1755, 1724, 1691, 1658, 1627, 1596, 1565, 1534, 1502,
      1470, 1439, 1406,
    ],
  ],
  [
    4,
    [
      1145, 1127, 1111, 1163, 1094, 1077, 1061, 1045, 1027, 1009, 993, 977, 961, 945, 928, 911, 895,
      877,
    ],
  ],
];
const ops = rows.map(([page, ids], row) =>
  ids.map((id, i) => {
    const hp = row === 1 && i < 2 ? 9 : page;
    return [[hp, id], row === 1 && i === 1 ? [14, 1262] : [hp, id + 5]];
  }),
);
function* paints(page, wanted) {
  const stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < page.fnArray.length; i++) {
    const fn = page.fnArray[i],
      args = page.argsArray[i];
    if (fn === OPS.save) stack.push(matrix);
    if (fn === OPS.restore) matrix = stack.pop();
    if (fn === OPS.transform) matrix = Util.transform(matrix, args);
    if (fn !== OPS.constructPath || !wanted.includes(i + 1)) continue;
    assert.equal(page.fnArray[i + 1], OPS.stroke);
    const [ops, xy] = args;
    let offset = 0;
    const take = () => {
      const [x, y] = Util.applyTransform([xy[offset++], xy[offset++]], matrix);
      return { x: (x * 25.4) / 72, y: (y * 25.4) / 72 };
    };
    yield { op: i + 1, ops, take };
  }
}

const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const lines = new Map();
for (const page of [4, 9, 14]) {
  const list = await (await pdf.getPage(page)).getOperatorList();
  const needed = ops
    .flat(2)
    .filter(([p]) => p === page)
    .map(([, id]) => id);
  for (const { op, ops: commands, take } of paints(list, needed)) {
    assert.deepEqual(Array.from(commands), [OPS.moveTo, OPS.lineTo]);
    // Same column, with seven/six/five further tile pitches below these three pages.
    const y = ([7, 6, 5][[4, 9, 14].indexOf(page)] * 756 * 25.4) / 72;
    lines.set(
      page + ':' + op,
      [take(), take()].map((p) => ({ x: p.x, y: p.y + y })),
    );
  }
}
await pdf.destroy();
const family = JSON.parse(readFileSync(cellsPath, 'utf8')).find((f) => f.label === 'B - FRONT');
assert.equal(family.cells.length, 18);
const { outputFiles } = await build({
  stdin: {
    contents:
      "export { readRawDxf } from './src/lib/pattern-import/gate/reader';export { readManifest } from './src/lib/pattern-import/manifest';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const { readRawDxf, readManifest } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64')
);

const bounds = (points) => ({
  x: Math.min(...points.map((p) => p.x)),
  y: Math.min(...points.map((p) => p.y)),
});
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const error = (a, b) =>
  Math.min(
    ...[b, [...b].reverse()].map((pair) =>
      Math.max(distance(a[0], pair[0]), distance(a[1], pair.at(-1))),
    ),
  );
for (const filename of written) {
  const text = readFileSync(filename, 'utf8'),
    raw = readRawDxf(text),
    manifest = readManifest(text);
  let checked = 0,
    maxError = 0;
  for (const [i, size] of sizes.entries()) {
    const sourceCut = family.cells.find((c) => c.size === size).outer.map(([x, y]) => ({ x, y }));
    const origin = bounds(sourceCut);
    const left = raw.blocks.get('PCK_L_' + size),
      right = raw.blocks.get('PCK_R_' + size);
    const cut = (es) => es.find((e) => e.layer === '1' && e.closed).pts;
    const leftOrigin = bounds(cut(left));
    const shift = (p) => ({ x: p.x - origin.x + leftOrigin.x, y: p.y - origin.y + leftOrigin.y });
    const axis = left.find((e) => e.layer === '7').pts;
    const [a, b] = axis,
      dx = b.x - a.x,
      dy = b.y - a.y,
      den = dx * dx + dy * dy;
    const mirror = (p) => {
      const k = ((p.x - a.x) * dx + (p.y - a.y) * dy) / den;
      return { x: 2 * (a.x + k * dx) - p.x, y: 2 * (a.y + k * dy) - p.y };
    };
    const reflected = bounds(cut(left).map(mirror)),
      rightOrigin = bounds(cut(right));
    for (const [hand, es] of [
      ['L', left],
      ['R', right],
    ]) {
      const transform = (p) => {
        const q = shift(p);
        if (hand === 'L') return q;
        const r = mirror(q);
        return { x: r.x - reflected.x + rightOrigin.x, y: r.y - reflected.y + rightOrigin.y };
      };
      const arms = es.filter(
        (e) =>
          e.layer === '8' &&
          !e.closed &&
          (e.pts.length === 2 ||
            (e.pts.length === 3 &&
              distance(e.pts[1], {
                x: (e.pts[0].x + e.pts[2].x) / 2,
                y: (e.pts[0].y + e.pts[2].y) / 2,
              }) < 0.001)),
      );
      const own = ops.flatMap((row) =>
        row[i].map(([page, op]) => lines.get(page + ':' + op).map(transform)),
      );
      const matched = new Set();
      for (const segment of own) {
        const hits = arms.filter((e) => error(segment, e.pts) < 0.15);
        assert.equal(
          hits.length,
          1,
          'Missing or doubled arm ' + hand + size + ' ' + JSON.stringify(segment),
        );
        matched.add(hits[0]);
        maxError = Math.max(maxError, error(segment, hits[0].pts));
        checked++;
      }
      assert.equal(matched.size, 10);
      for (const row of ops)
        for (const pair of row)
          for (const [page, op] of pair) {
            const segment = lines.get(page + ':' + op).map(transform);
            const hit = arms.find((e) => error(segment, e.pts) < 0.15);
            if (hit) assert(matched.has(hit), 'A different size button remains in ' + hand + size);
          }
    }
  }
  console.log(
    JSON.stringify({
      filename,
      blocks: manifest.blocks.length,
      checkedArms: checked,
      maxErrorMm: maxError,
    }),
  );
}
