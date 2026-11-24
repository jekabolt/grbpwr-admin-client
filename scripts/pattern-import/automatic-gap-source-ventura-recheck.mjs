// Check the portions of the previously closed Ventura D2 and F26 which changed on integration.
// Arguments: original PDF, accepted session.v8.gz, previous cells.json, integrated cells.json.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
const [pdf, session, oldFile, newFile] = process.argv.slice(2);
assert(
  newFile,
  'Expected original PDF, accepted session.v8.gz, previous and integrated cells.json',
);
const bytes = readFileSync(pdf);
assert.equal(
  createHash('sha256').update(bytes).digest('hex'),
  '26e070c8836aa10c21744acafb8dbf747725396acf83e74045802ab8a0320389',
);
const d = deserialize(gunzipSync(readFileSync(session)));
const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const byPath = new Map(d.sheet.paths.map((p) => [p.id, p])),
  pages = new Map(),
  mm = 25.4 / 72;
async function records(page) {
  if (pages.has(page)) return pages.get(page);
  const list = await (await doc.getPage(page + 1)).getOperatorList(),
    pa = new Map(),
    stack = [];
  let mat = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < list.fnArray.length; i++) {
    const [fn, args] = [list.fnArray[i], list.argsArray[i]];
    if (fn === OPS.save) stack.push(mat);
    if (fn === OPS.restore) mat = stack.pop();
    if (fn === OPS.transform) mat = Util.transform(mat, args);
    if (fn === OPS.constructPath) pa.set(i + 1, { mat, ops: args[0], xy: args[1] });
  }
  pages.set(page, pa);
  return pa;
}
async function original(p) {
  const { mat, ops, xy } = (await records(p.src.page)).get(p.src.op);
  let i = 0,
    points = [];
  const next = () => Util.applyTransform([xy[i++], xy[i++]], mat).map((v) => v * mm);
  for (const fn of ops) {
    if (fn === OPS.moveTo || fn === OPS.lineTo) points.push(next());
    else if ([OPS.curveTo, OPS.curveTo2, OPS.curveTo3].includes(fn)) {
      const p = points.at(-1),
        a = fn === OPS.curveTo2 ? p : next(),
        b = next(),
        c = fn === OPS.curveTo3 ? b : next();
      for (let j = 1; j <= 64; j++) {
        const t = j / 64,
          u = 1 - t;
        points.push(
          p.map((v, k) => u ** 3 * v + 3 * u * u * t * a[k] + 3 * u * t * t * b[k] + t ** 3 * c[k]),
        );
      }
    } else if (fn !== OPS.closePath) throw Error('unsupported op ' + fn);
  }
  return points;
}
const old = JSON.parse(readFileSync(oldFile, 'utf8')),
  fresh = JSON.parse(readFileSync(newFile, 'utf8'));
const boxCenter = (vs) =>
  [0, 1].map((k) => (Math.min(...vs.map((p) => p[k])) + Math.max(...vs.map((p) => p[k]))) / 2);
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
for (const [seed, size, chainId, left, right] of [
  [2, '2', 6319, 405.9, 556.7],
  [7, '26', 6024, 796.7, 995.2],
]) {
  const own = d.set.classes.filter((g) => g.chains.includes(chainId)).map((g) => g.sizeLabel);
  assert.deepEqual(own, [size]); // Limit the measured centre line to this cut. Ink comes only from the named pen in the source chain.
  const refLine = (x) => (seed === 2 ? 1846.3 + (x - 406.8) * 0.234 : 1042.3);
  const sourcePaths = d.set.chains[chainId].ranges
    .map((r) => byPath.get(r.path))
    .filter((p) => {
      const [x, y] = boxCenter(p.pts.map((v) => [v.x, v.y]));
      return x > left - 6 && x < right + 6 && Math.abs(y - refLine(x)) < 2;
    });
  const records = [];
  for (const p of sourcePaths) {
    const raw = await original(p);
    records.push({ p, raw, shift: [p.pts[0].x - raw[0][0], p.pts[0].y - raw[0][1]] });
  }
  const poses = new Map();
  for (const page of new Set(records.map((z) => z.p.src.page))) {
    const same = records.filter((v) => v.p.src.page === page);
    poses.set(
      page,
      [0, 1].map((k) => median(same.map((v) => v.shift[k]))),
    );
  }
  const registration = Array.from(poses, ([page, t]) => {
    const v = records.filter((z) => z.p.src.page === page),
      ok = v.filter((z) => Math.hypot(z.shift[0] - t[0], z.shift[1] - t[1]) < 1e-6);
    return [page + 1, v.length, ok.length];
  });
  const worstRegistration = Math.max(
    ...records.map((v) => {
      const shift = poses.get(v.p.src.page);
      return Math.hypot(v.shift[0] - shift[0], v.shift[1] - shift[1]);
    }),
  ); // Align each whole PDF page once. Coincident endpoints supply a majority even at a tile seam.
  const centers = records
    .map((v) => {
      const c = boxCenter(v.raw),
        shift = poses.get(v.p.src.page);
      return [c[0] + shift[0], c[1] + shift[1]];
    })
    .sort((a, b) => a[0] - b[0]);
  for (const [, count, aligned] of registration) assert(aligned >= 2 && 2 * aligned > count);
  console.log({ seed, size, chainId, marks: centers.length, registration, worstRegistration });
  for (const [name, f] of [
    ['old', old],
    ['new', fresh],
  ]) {
    const poly = f[seed].cells.find((c) => c.size === size).outer;
    let start = poly.findIndex((p) => p[0] === right && Math.abs(p[1] - refLine(p[0])) < 2),
      finish = poly.findIndex((p) => p[0] === left && Math.abs(p[1] - refLine(p[0])) < 2);
    const interval = poly.slice(start, finish + 1).reverse();
    if (interval.length < 2) throw Error('invalid interval ' + start + ' ' + finish); // Both cuts and the source marks are monotone in x here. Their maximum vertical difference
    // at all breakpoints bounds both directed distances over the complete changed interval.
    const linear = (vs, x) => {
      const i = vs.findIndex((p) => p[0] >= x);
      if (i === 0) return vs[0][1];
      if (i < 0) throw Error('uncovered');
      const [a, b] = [vs[i - 1], vs[i]],
        t = (x - a[0]) / (b[0] - a[0]);
      return a[1] + t * (b[1] - a[1]);
    };
    let max = 0;
    for (const x of [...interval, ...centers]
      .map((p) => p[0])
      .filter((x) => x >= left && x <= right))
      max = Math.max(max, Math.abs(linear(centers, x) - linear(interval, x)));
    assert(max < (seed === 2 ? 0.18 : 0.04));
    console.log(name, interval.length, max);
  }
}
await doc.destroy();
