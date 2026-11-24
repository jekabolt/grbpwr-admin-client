// Verify source-blind curved-range discovery against independently decoded PDF Béziers.
// node automatic-gap-source-curve-check.mjs <Ventura original PDF> <saved cutrange dump root>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPS, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPrintedCuts } from './printed-cut-ranges.mjs';
import { perimeterError, readCurvedRanges } from './automatic-gap-source-curves.mjs';

const [original, dumps] = process.argv.slice(2);
assert(
  original && dumps,
  'Expected original Ventura PDF and directory containing cutrange-{Axel,Cher,Verona,Ventura}/source.json',
);
const bytes = readFileSync(original);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '26e070c8836aa10c21744acafb8dbf747725396acf83e74045802ab8a0320389',
);
const card = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String((i + 1) * 2))];
const load = (id) => JSON.parse(readFileSync(join(dumps, 'cutrange-' + id, 'source.json')));
for (const file of ['Axel', 'Cher', 'Verona', 'Ventura']) {
  const cuts = readPrintedCuts(load(file), card);
  const old = JSON.parse(readFileSync(join(dumps, 'cutrange-' + file, 'rings.json')));
  assert.deepEqual(
    cuts.filter((gs) => !gs[0].equivalentCurves),
    old,
    'Changed polygon evidence for ' + file,
  );
  if (file !== 'Ventura')
    assert.deepEqual(
      cuts.filter((gs) => gs[0].equivalentCurves),
      [],
      file,
    );
}
const sheet = load('Ventura');
const [groups] = readCurvedRanges(sheet, card);
assert.equal(groups?.length, 6);
const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const mm = 25.4 / 72;
const identity = [1, 0, 0, 1, 0, 0];
function compose(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
async function pathsOn(pageNo) {
  const list = await (await doc.getPage(pageNo)).getOperatorList(),
    out = new Map(),
    stack = [];
  let transform = identity;
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(transform);
    if (fn === OPS.restore) transform = stack.pop();
    if (fn === OPS.transform) transform = compose(transform, args);
    if (fn === OPS.constructPath) out.set(i, { ops: args[0], xy: args[1], transform });
  });
  return out;
}
const i4 = await pathsOn(79),
  i5 = await pathsOn(80);
await doc.destroy();
const pointDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
function decoded(page, op) {
  const stroke = (page === 79 ? i4 : i5).get(op);
  assert(stroke);
  const [a, b, c, d, e, f] = stroke.transform,
    pts = [];
  let i = 0;
  function read() {
    const xx = stroke.xy[i++],
      yy = stroke.xy[i++];
    // PDF units are points. I4 and I5 begin at grid columns 3 and 4 with a 558 pt pitch.
    return {
      x: (a * xx + c * yy + e + (page === 79 ? 3 : 4) * 558) * mm,
      y: (b * xx + d * yy + f) * mm,
    };
  }
  for (const fn of stroke.ops) {
    if (fn === OPS.moveTo || fn === OPS.lineTo) pts.push(read());
    else {
      assert.equal(fn, OPS.curveTo);
      const p = pts.at(-1),
        a = read(),
        b = read(),
        c = read();
      const n = Math.ceil(
        (pointDistance(p, a) + pointDistance(a, b) + pointDistance(b, c)) / (1.5 * mm),
      );
      for (let j = 1; j <= n; j++) {
        const t = j / n,
          u = 1 - t;
        const evalAt = (field) =>
          u ** 3 * p[field] +
          3 * u ** 2 * t * a[field] +
          3 * u * t ** 2 * b[field] +
          t ** 3 * c[field];
        pts.push({ x: evalAt('x'), y: evalAt('y') });
      }
    }
  }
  return pts;
}
// Manually audited paint operators in perimeter order. These IDs are used only AFTER discovery.
const audit = [
  ['00 - 0', [582, 588], 594, 599, [605, 611, 617, 623, 629, 635], [606, 612, 618, 624, 630, 636]],
  [
    '2 - 4',
    [4019, 4025],
    4031,
    3859,
    [3865, 3871, 3877, 3883, 3889, 3895],
    [4043, 4049, 4055, 4061, 4067, 4073],
  ],
  [
    '6 - 8',
    [6343, 6349],
    6355,
    6020,
    [6026, 6032, 6038, 6044, 6050, 6056],
    [6367, 6373, 6379, 6385, 6391, 6397],
  ],
  ['10 - 20', [8892], 8898, 8275, [8281, 8287, 8293, 8299], [8910, 8916, 8922, 8928]],
  [
    '22 - 26',
    [12774, 12780],
    12786,
    11270,
    [11276, 11282, 11288, 11294, 11300, 11306],
    [12798, 12804, 12810, 12816, 12822, 12828],
  ],
  ['28 - 32', [17341], 17347, 14254, [14260, 14266, 14272, 14278], [17359, 17365, 17371, 17377]],
];
const measurements = [];
for (const [label, first, arc, repeat, right, left] of audit) {
  const c = decoded(79, arc),
    d = decoded(80, repeat);
  assert(c.length === d.length && c.every((p, i) => pointDistance(p, d[i]) < 0.002 * mm));
  const reference = [
    ...first.flatMap((op) => decoded(79, op)),
    ...c,
    ...right.flatMap((op) => decoded(80, op)),
    ...left.flatMap((op) => decoded(79, op)),
  ];
  const group = groups.find((g) => g.label === label);
  assert(group, label);
  const maxMm = perimeterError(reference, group.outer);
  assert(maxMm < 0.05, label + ' disagreement ' + maxMm);
  measurements.push({ label, sourceCycles: group.equivalentCurves, maxMm });
}
const seed = sheet.seeds.find((s) => s.id === groups[0].seed);
const noResult = (d, msg) => assert.deepEqual(readCurvedRanges(d, card), [], msg);
for (const text of ['placement', 'template']) {
  noResult({ ...sheet, texts: [...sheet.texts, { ...seed.text, text, anchor: seed.at }] }, text);
}
noResult({ ...sheet, seeds: [...sheet.seeds, { ...seed, id: -10 }] }, 'competing enclosed piece');
noResult(
  { ...sheet, texts: sheet.texts.filter((t) => t.text !== '2 - 4') },
  'incomplete printed range card',
);
noResult(
  { ...sheet, classes: sheet.classes.filter((g) => g.sizeLabel !== '4') },
  'unconfirmed size of curve',
);
noResult(
  { ...sheet, paths: sheet.paths.filter((p) => !(p.src.page === 79 && p.src.op === 3860)) },
  'missing originating curve',
);
// Two nearby graded lines with different geometry must not become a shared range.
noResult(
  {
    ...sheet,
    paths: sheet.paths.map((p) =>
      p.src.page === 79 && p.src.op === 10295
        ? {
            ...p,
            pts: p.pts.map((v, i) =>
              i === Math.floor(p.pts.length / 2) ? { x: v.x, y: v.y + 0.9 } : v,
            ),
          }
        : p,
    ),
  },
  'competing source geometry',
);
console.log(
  JSON.stringify({ measurements, negativeControls: 7, otherEligibleOriginals: 3 }, null, 2),
);
