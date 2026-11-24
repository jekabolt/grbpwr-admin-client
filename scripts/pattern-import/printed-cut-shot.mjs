import assert from 'node:assert/strict';
import { readPrintedCuts } from './printed-cut-ranges.mjs';
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

// Replay against the same accepted card as a previous dxf-shot run.
const [pdf, out, baseline, mode = 'leaks'] = process.argv.slice(2);
assert(
  pdf && out && baseline && ['leaks', 'early', 'all'].includes(mode) && !existsSync(out),
  'Usage: printed-cut-shot.mjs <original PDF> <new output dir> <baseline run.json> [leaks|early|all]',
);
const reference = JSON.parse(readFileSync(baseline));
const card = reference.card;
let groups;
globalThis.readRanges = (sheet, set, run, seeds) => {
  assert.deepEqual(
    run.sizes.map((s) => s.label),
    card,
  );
  groups = readPrintedCuts({ ...sheet, chains: set.chains, classes: set.classes, seeds }, card);
  for (const group of groups)
    for (const g of group) {
      const ids = new Set(g.paths);
      g.walls = set.chains
        .filter((c) => c.ranges.length && c.ranges.every((r) => ids.has(r.path)))
        .map((c) => c.id);
    }
};
globalThis.useRanges = (cands) => {
  for (const group of groups)
    for (const g of group)
      for (const c of cands.get(g.seed) ?? []) {
        if ((mode !== 'all' && c.outcome !== 'leak') || c.rank < g.lo || c.rank > g.hi) continue;
        const o = g.outer,
          x = o.map((p) => p.x),
          y = o.map((p) => p.y);
        const area =
          Math.abs(
            o.reduce((v, p, i) => {
              const q = o[(i + 1) % o.length];
              return v + p.x * q.y - p.y * q.x;
            }, 0),
          ) / 2;
        Object.assign(c, {
          outer: o,
          walls: g.walls,
          outcome: 'closed',
          areaMm2: area,
          bbox: {
            minX: Math.min(...x),
            minY: Math.min(...y),
            maxX: Math.max(...x),
            maxY: Math.max(...y),
          },
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
const bundle = resolve(mkdtempSync(resolve(tmpdir(), 'printed-cut-')), 'runner.mjs');
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
      name: 'printed-cut-fixture',
      setup(b) {
        const inject = (src, marker, code) => {
          assert(src.includes(marker), marker);
          return src.replace(marker, code + '\n' + marker);
        };
        b.onLoad({ filter: /dxf-shot-entry\.ts$/ }, ({ path }) => {
          const src = readFileSync(path, 'utf8'),
            marker = 'const first = await run([], null);';
          assert(src.includes(marker), marker);
          return {
            loader: 'ts',
            contents:
              src.replace(
                marker,
                'const first: Rec={sizesRead:{labels:' + JSON.stringify(card) + '}};',
              ) + "\nexport {writeR12} from 'lib/pattern-import/write/r12';",
          };
        });
        b.onLoad({ filter: /pieces[\\/]fill\.ts$/ }, ({ path }) => {
          const src = inject(
            readFileSync(path, 'utf8'),
            '  // P3: a click carried to the other size files by its face',
            "  if(model.mode==='graded') (globalThis as any).readRanges(sheet,set,run,use);",
          );
          return { loader: 'ts', contents: src };
        });
        if (mode !== 'leaks')
          b.onLoad({ filter: /gfit[\\/]repair-hook\.ts$/ }, ({ path }) => ({
            loader: 'ts',
            contents: inject(
              readFileSync(path, 'utf8'),
              '  const t0 = Date.now();',
              '  (globalThis as any).useRanges(cands);',
            ),
          }));
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
assert(groups, 'The graded fill did not run');
const result = JSON.parse(readFileSync(resolve(out, 'run.json')));
assert.equal(result.error, null);
assert.equal(result.id, reference.id);
if (mode === 'leaks') {
  const previous = JSON.parse(readFileSync(resolve(dirname(baseline), 'cells.json')));
  const after = JSON.parse(readFileSync(resolve(out, 'cells.json')));
  for (const family of previous) {
    const cells = after.find((f) => f.seed === family.seed && f.label === family.label)?.cells;
    assert(cells, 'Missing family ' + family.label);
    for (const cell of family.cells.filter((c) => c.outcome === 'closed')) {
      const current = cells.find((c) => c.size === cell.size);
      assert.equal(current?.outcome, 'closed', family.label + ' ' + cell.size);
      assert.deepEqual(current.outer, cell.outer, family.label + ' ' + cell.size);
    }
  }
}

writeFileSync(resolve(out, 'source-ranges.json'), JSON.stringify(groups));
for (const group of groups) {
  const name = group[0].name.replace(/[^A-Za-z0-9]+/g, '_');
  const base = group.at(-1).outer;
  const x0 = Math.min(...base.map((p) => p.x)),
    y0 = Math.min(...base.map((p) => p.y));
  // A geometry verification file. Each block is one cut sample.
  const blocks = card.map((size, i) => {
    const r = group.find((g) => g.lo <= i && i <= g.hi);
    return {
      name: name + '_' + size,
      identity: name,
      displayName: r.name,
      quantity: 1,
      labelSize: size,
      material: '',
      annotation: ['Cut contour sample'],
      cut: r.outer.map((p) => ({ x: p.x - x0, y: p.y - y0 })),
      cutLoops: [],
      internal: [],
      drawn: [],
      foldLines: 0,
      drills: [],
      notches: [],
    };
  });
  writeFileSync(
    resolve(out, name + '.dxf'),
    writeR12(blocks, {
      styleName: name + ' cut samples',
      createdAt: '2026-11-19T00:00:00Z',
      sampleSize: card[0],
    }),
  );
}
