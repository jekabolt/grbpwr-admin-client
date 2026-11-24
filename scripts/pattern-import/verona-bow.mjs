// Reproduce the Verona G bow experiment. Supply the original PDF, an unused output directory,
// and control, anchor or groups. Operator ranges below identify the four audited PDF stroke runs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const [pdf, out, mode] = process.argv.slice(2);
assert(
  pdf && out && !existsSync(out) && ['control', 'anchor', 'groups'].includes(mode),
  'Usage: node verona-bow.mjs <PDF> <new directory> control|anchor|groups',
);
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.equal(sha, '63b77341a77555ad02f90c859f5037dfabd4b1bc518396e77d7102b8ec8d689e');
const card = ['00', '0', ...Array.from({ length: 16 }, (_, i) => String(2 * (i + 1)))];
const packets = [
  ['00 - 8', 496, 562],
  ['10 - 14', 14178, 14220],
  ['16 - 24', 17829, 17871],
  ['26 - 32', 25826, 25868],
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const same = (a, b) => Math.abs(a - b) < 0.01;
const inside = (p, b) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;
function readPacket(sheet, set, label, first, last) {
  const paths = sheet.paths
    .filter((p) => p.src.page === 8 && p.src.op >= first && p.src.op <= last)
    .sort((a, b) => a.src.op - b.src.op);
  assert.equal(paths.length, (last - first) / 6 + 1);
  const corners = [],
    walls = [];
  let maxGap = 0;
  for (const [i, p] of paths.entries()) {
    assert.equal(p.src.op, first + 6 * i);
    const style = sheet.styles[p.style];
    assert(!p.background && !style.fill && style.widthMm > 0 && !p.closed);
    if (p.pts.length === 3) corners.push(p.pts[1]);
    else assert.equal(p.pts.length, 2);
    const next = paths[(i + 1) % paths.length],
      a = p.pts.at(-1),
      b = next.pts[0];
    const gap = dist(a, b);
    // The PDF splits the dashed sides into separate paint operations. Each join must run
    // forward on the same straight side and fit a space declared by an adjacent dash pen.
    const before = p.pts.at(-2),
      after = next.pts[1];
    assert(
      (same(before.x, a.x) &&
        same(a.x, b.x) &&
        same(b.x, after.x) &&
        (a.y - before.y) * (b.y - a.y) >= 0 &&
        (after.y - b.y) * (b.y - a.y) >= 0) ||
        (same(before.y, a.y) &&
          same(a.y, b.y) &&
          same(b.y, after.y) &&
          (a.x - before.x) * (b.x - a.x) >= 0 &&
          (after.x - b.x) * (b.x - a.x) >= 0),
    );
    const spaces = [
      ...(style.dash ?? []).filter((_, i) => i % 2),
      ...(sheet.styles[next.style].dash ?? []).filter((_, i) => i % 2),
    ];
    assert(gap <= Math.max(0, ...spaces) + 0.02, 'Unexplained break in the source stroke');
    maxGap = Math.max(maxGap, gap);
  }
  assert.equal(corners.length, 4);
  const [bl, tl, tr, br] = corners;
  assert(
    same(bl.x, tl.x) &&
      same(tl.y, tr.y) &&
      same(tr.x, br.x) &&
      same(br.y, bl.y) &&
      bl.x < tr.x &&
      bl.y < tr.y,
  );
  const box = { minX: bl.x, minY: bl.y, maxX: tr.x, maxY: tr.y };
  const labels = sheet.texts.filter((t) => t.text.trim() === label && dist(t.anchor, tr) < 6);
  assert.equal(labels.length, 1, 'Missing or ambiguous printed size range');
  const [low, high] = label.split(' - ').map((t) => card.indexOf(t));
  assert(low >= 0 && high >= low);
  const sizes = card.slice(low, high + 1);
  // Each of the four sides has a long native chain belonging to the same legend size
  // within the printed group. Reject a rectangle made from furniture or neighbouring pens.
  const sizeGroups = set.classes.filter(
    (g) =>
      g.role === 'size' &&
      sizes.includes(g.sizeLabel) &&
      g.evidence.some((e) => e.kind === 'legend-sample'),
  );
  const pathIds = new Set(paths.map((p) => p.id));
  const related = set.chains.filter((c) => c.ranges.some((r) => pathIds.has(r.path)));
  const sizeOf = new Map(sizeGroups.flatMap((g) => g.chains.map((id) => [id, g.sizeLabel])));
  const sides = new Map();
  for (const c of related) {
    const size = sizeOf.get(c.id);
    if (!size) continue;
    const side = [
      ['x', box.minX, box.maxY - box.minY],
      ['x', box.maxX, box.maxY - box.minY],
      ['y', box.minY, box.maxX - box.minX],
      ['y', box.maxY, box.maxX - box.minX],
    ].findIndex(([axis, n, len]) => c.lengthMm > len / 2 && c.pts.every((p) => same(p[axis], n)));
    if (side < 0) continue;
    if (!sides.has(size)) sides.set(size, new Set());
    sides.get(size).add(side);
    walls.push(c.id);
  }
  const representative = [...sides].filter(([, edges]) => edges.size === 4).map(([s]) => s);
  assert(representative.length, 'Four legend-confirmed walls required');
  return { label, sizes, representative, box, outer: [bl, br, tr, tl], walls, first, last, maxGap };
}
let records, seedId;
globalThis.readVeronaBow = (sheet, set, run, seeds) => {
  assert.deepEqual(
    run.sizes.map((s) => s.label),
    card,
  );
  records = packets.map(([label, first, last]) => readPacket(sheet, set, label, first, last));
  assert.deepEqual(
    records.flatMap((r) => r.sizes),
    card,
  );
  const bow = seeds.filter((s) => inside(s.at, records[0].box));
  assert.equal(bow.length, 1);
  seedId = bow[0].id;
  assert(sheet.texts.some((t) => t.text === 'G - BOW' && inside(t.anchor, records[0].box)));
};
globalThis.tryVeronaBow = (cands) => {
  if (mode === 'control') return;
  for (const c of cands.get(seedId) ?? []) {
    if (mode === 'anchor' && (c.outcome !== 'leak' || c.rank !== 0)) continue;
    const rec = records.find((r) => r.sizes.includes(card[c.rank])),
      b = rec.box;
    Object.assign(c, {
      outer: rec.outer,
      walls: rec.walls,
      outcome: 'closed',
      areaMm2: (b.maxX - b.minX) * (b.maxY - b.minY),
      bbox: b,
      sourceCoverage: 1,
      p95Mm: 0,
      rankFrom: 'class',
      derived: [],
    });
    delete c.leakAt;
    delete c.repair;
  }
};
const here = dirname(fileURLToPath(import.meta.url));
const bundle = resolve(mkdtempSync(resolve(tmpdir(), 'verona-bow-')), 'runner.mjs');
process.on('exit', () => {
  if (existsSync(bundle)) unlinkSync(bundle);
  rmdirSync(dirname(bundle));
});
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
      name: 'verona-bow-fixture',
      setup(b) {
        for (const [filter, marker, replacement] of [
          [
            /dxf-shot-entry\.ts$/,
            'const first = await run([], null);',
            'const first: Rec={sizesRead:{labels:' + JSON.stringify(card) + '}};',
          ],
          [
            /pieces[\\/]fill\.ts$/,
            '  // P3: a click carried to the other size files by its face',
            "  if(model.mode==='graded') (globalThis as any).readVeronaBow(sheet,set,run,use);\n  // P3: a click carried to the other size files by its face",
          ],
          [
            /gfit[\\/]repair-hook\.ts$/,
            '  const t0 = Date.now();',
            '  (globalThis as any).tryVeronaBow(cands);\n  const t0 = Date.now();',
          ],
        ])
          b.onLoad({ filter }, ({ path }) => {
            const src = readFileSync(path, 'utf8');
            assert(src.includes(marker), marker);
            return {
              contents:
                src.replace(marker, replacement) +
                (path.endsWith('dxf-shot-entry.ts')
                  ? "\nexport {writeR12} from 'lib/pattern-import/write/r12';"
                  : ''),
              loader: 'ts',
            };
          });
      },
    },
  ],
});
mkdirSync(out, { recursive: true });
Object.assign(process.env, {
  PATIMPORT_REPO: resolve(here, '../..'),
  PIECES_OPEN_PASS: '1',
  AUTOPILOT_OUTLINES: '1',
});
const { main, writeR12 } = await import(pathToFileURL(bundle).href);
const rc = await main([resolve(pdf), resolve(out)]);
assert.equal(rc, 0);
assert(records, 'Native fill did not read the bow');
writeFileSync(
  resolve(out, 'bow-source.json'),
  JSON.stringify({ sha, seedId, mode, records }, null, 2),
);
if (mode === 'groups') {
  const blocks = card.map((size) => {
    const r = records.find((r) => r.sizes.includes(size));
    return {
      name: 'BOW_' + size,
      identity: 'BOW',
      displayName: 'G - BOW',
      quantity: 1,
      labelSize: size,
      material: 'FABRIC',
      annotation: [],
      cut: r.outer.map((p) => ({ x: p.x - records[3].box.minX, y: p.y - records[3].box.minY })),
      cutLoops: [],
      internal: [],
      drawn: [],
      foldLines: 0,
      drills: [],
      notches: [],
    };
  });
  writeFileSync(
    resolve(out, 'verona-bow-cuts.dxf'),
    writeR12(blocks, {
      styleName: 'MDF481 Verona G Bow',
      sampleSize: '00',
      createdAt: '2026-11-19T00:00:00Z',
    }),
  );
}
