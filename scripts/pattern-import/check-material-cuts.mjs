#!/usr/bin/env node
// Reread the three independently digitised Estoril sizes through material selection and the production writer.
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import DxfParser from 'dxf-parser';
import assert from 'node:assert/strict';
const [sessionFile, referenceDir, pdf, out, previousSession] = process.argv.slice(2);
if (!out)
  throw Error(
    'usage: check-material-cuts.mjs session.v8.gz reference-directory original.pdf output-directory [previous-session.v8.gz]',
  );
fs.mkdirSync(out, { recursive: true });
const lib = path.resolve('src/lib/pattern-import');
const bundle = await build({
  stdin: {
    contents: `
export { buildPieceSpecsDetailed } from './src/lib/pattern-import/semantics/build';
export { proposeSizeMap } from './src/lib/pattern-import/sizes/map';
export { writeAndGate } from './src/lib/pattern-import/gate';
export {recoverMaterialPanels} from './src/lib/pattern-import/pieces/material-panels';
export { finalizePieces } from './src/lib/pattern-import/pieces/finalize';
export { planScopes,PURPOSE,SECTION } from './src/lib/pattern-import/fabrics/scope';
export * as rules from './src/components/managers/tech-card/components/nesting/block-code';
`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: { lib: path.dirname(lib) },
});
const bundlePath = path.resolve(out, 'writer.cjs');
fs.writeFileSync(bundlePath, bundle.outputFiles[0].contents);
const {
  buildPieceSpecsDetailed,
  proposeSizeMap,
  writeAndGate,
  planScopes,
  PURPOSE,
  SECTION,
  rules,
  finalizePieces,
  recoverMaterialPanels,
} = (await import(bundlePath)).default;
const ps = v8.deserialize(gunzipSync(fs.readFileSync(sessionFile)));
const families = finalizePieces(ps);
if (previousSession) {
  const prior = v8.deserialize(gunzipSync(fs.readFileSync(previousSession)));
  const previous = finalizePieces(prior);
  const closed = previous.flatMap((f) =>
    f.candidates
      .filter((c) => c.outcome === 'closed')
      .map((c) => ({ seed: f.seed, rank: c.rank, outer: c.outer })),
  );
  for (const c of closed) {
    const current = families
      .find((f) => f.seed === c.seed)
      .candidates.find((x) => x.rank === c.rank);
    assert.equal(current.outcome, 'closed');
    assert.deepEqual(
      current.outer,
      c.outer,
      'previous contour changed at seed ' + c.seed + ' rank ' + c.rank,
    );
  }
  assert.equal(closed.length, 87);
  function negative(sheet, set) {
    const groups = new Map(previous.map((f) => [f.seed, structuredClone(f.candidates)]));
    recoverMaterialPanels(sheet, set, ps.run, ps.seeds, groups, () => {});
    assert.equal(
      [...groups.values()].flat().filter((c) => c.outcome === 'closed').length,
      closed.length,
    );
  }
  negative(
    {
      ...ps.sheet,
      texts: ps.sheet.texts.filter((t) => !/^cut here for lining$/i.test(t.text.trim())),
    },
    ps.set,
  );
  negative(ps.sheet, {
    ...ps.set,
    classes: ps.set.classes.map((c) => ({
      ...c,
      evidence: c.evidence.filter((e) => e.kind !== 'legend-sample'),
    })),
  });
  const lines = new Set(
    families.flatMap((f) => f.candidates.flatMap((c) => (c.liningCut ? [c.liningCut.path] : []))),
  );
  negative(
    {
      ...ps.sheet,
      paths: ps.sheet.paths.map((p) =>
        lines.has(p.id) ? { ...p, visibleEdges: undefined, paintCopies: undefined } : p,
      ),
    },
    ps.set,
  );
  console.log(
    'Previous full-precision contours identical:',
    closed.length,
    '; three source-removal controls held',
  );
}
const tokens = ps.run.sizes.map((s) => s.label);
const card = tokens.map((token, rank) => ({ name: token, token, sizeId: rank + 1, rank }));
const map = proposeSizeMap(ps.run, card);
const source = {
  files: [
    {
      name: path.basename(pdf),
      sha256: createHash('sha256').update(fs.readFileSync(pdf)).digest('hex'),
      bytes: fs.statSync(pdf).size,
      kind: 'pdf',
      pages: ps.sheet.poses.length,
    },
  ],
  scale: { method: 'declared', factor: 1, measuredMm: null, declaredMm: null },
  sheet: {
    pages: ps.sheet.poses.length,
    method: ps.sheet.pairs[0]?.method ?? 'single',
    maxResidualMm: Math.max(...ps.sheet.poses.map((p) => p.residualMm ?? 0)),
  },
  sizeEncoding: ps.run.encoding,
  variant: null,
};
const refdoc = new DxfParser().parseSync(
  fs.readFileSync(path.join(referenceDir, 'estoril-material-references.dxf'), 'utf8'),
);
const { layout } = JSON.parse(fs.readFileSync(path.join(referenceDir, 'verification.json')));
const results = [];
for (const [piece, requested, identity] of [
  ['H - SKIRT FRONT', ['S', 'M'], 'SF'],
  ['B - TOP FRONT', ['3XL'], 'TF'],
]) {
  const seed = ps.seeds.find((s) => s.text?.text === piece);
  assert.ok(seed);
  const family = families.find((f) => f.seed === seed.id);
  const active =
    requested.length === 1 ? [tokens[tokens.indexOf(requested[0]) - 1], ...requested] : requested;
  const candidates = family.candidates.filter((c) => active.includes(tokens[c.rank]));
  assert.ok(candidates.every((c) => c.outcome === 'closed' && c.liningCut));
  const selected = { ...family, candidates };
  const sizeMap = { ...map, entries: map.entries.filter((e) => active.includes(e.source.label)) };
  const input = {
    sheet: ps.sheet,
    set: ps.set,
    run: ps.run,
    sizeMap,
    families: [selected],
    fileAllowance: { meaning: 'cut', allowanceMm: 10, origin: 'operator', evidence: [] },
    pieceOverrides: {
      [seed.id]: {
        code: identity,
        mods: [],
        displayName: piece,
        nameOrigin: 'operator',
        unfoldedFold: false,
        pairHand: null,
        piecesPerGarment: 1,
      },
    },
    operatorGrain: {},
    seedAts: { [seed.id]: seed.at },
    seedLabels: { [seed.id]: piece },
  };
  let detail = buildPieceSpecsDetailed(input);
  const grain = detail.output.grainProposals?.find((g) => g.seed === seed.id);
  if (grain) {
    input.operatorGrain[seed.id] = { a: grain.a, b: grain.b, accepted: grain.evidence };
    detail = buildPieceSpecsDetailed(input);
  }
  if (!detail.output.pieces.length)
    throw Error(
      JSON.stringify({
        piece,
        blocked: detail.output.blocked,
        grain: detail.output.grainProposals,
      }),
    );
  const targets = [
    ['FABRIC', PURPOSE.main, SECTION.fabric],
    ['LINING', PURPOSE.lining, SECTION.lining],
  ].map(([label, fabricPurpose, section]) => ({
    label,
    scopeKey: label,
    bomLineKey: label,
    fabricPurpose,
    sections: [section],
    isInterlining: false,
  }));
  const plan = planScopes(
    detail.output.pieces,
    { byPurpose: { FABRIC: [seed.id], LINING: [seed.id] }, interliningInBom: false, proposals: [] },
    targets,
  );
  assert.deepEqual(plan.problems, []);
  for (const sp of plan.scopes) {
    const material = sp.target.label;
    const semantics = material === 'LINING' ? detail.lining : detail;
    const sizes = sizeMap.entries.map((e) => ({
      ...e.card,
      sourceLabel: e.source.label,
      rank: e.source.rank,
    }));
    const gate = await writeAndGate(
      {
        techCardId: 1,
        scope: sp.target,
        pieces: sp.specs,
        sizes,
        source,
        generator: 'material-cut-verification',
        dialect: 'r2000',
      },
      {
        rules,
        sizeTokens: new Set(active.map((t) => t.toLowerCase())),
        wallsOf: (id, r) => semantics.wallsOf(sp.sourceOf[id] ?? id, r),
        identityOf: (id, r) => semantics.identityOf(sp.sourceOf[id] ?? id, r),
        now: () => new Date(0),
      },
    );
    const file = path.join(out, identity + '_' + material + '.dxf');
    fs.writeFileSync(file, gate.dxfText);
    const dxf = new DxfParser().parseSync(fs.readFileSync(file, 'utf8'));
    assert.equal(dxf.header.$INSUNITS, 4);
    for (const token of requested) {
      const name = Object.keys(dxf.blocks).find(
        (n) => n.startsWith(sp.specs[0].identity + '_') && n.endsWith('_' + token),
      );
      if (!name) throw Error(JSON.stringify(Object.keys(dxf.blocks)));
      const refName =
        (piece.startsWith('H') ? 'H_SKIRT_FRONT_' : 'B_TOP_FRONT_') + token + '_' + material;
      const cut = (d, n) => {
        const p = d.blocks[n].entities.filter(
          (e) => e.layer === '1' && ['POLYLINE', 'LWPOLYLINE'].includes(e.type),
        );
        assert.equal(p.length, 1);
        assert.ok(p[0].shape);
        assert.equal(d.entities.filter((e) => e.type === 'INSERT' && e.name === n).length, 1);
        return p[0].vertices;
      };
      const [dx, dy] = layout[refName],
        ref = cut(refdoc, refName).map((p) => ({ x: p.x - dx, y: p.y - dy })),
        off = gate.detail.plan.offsets[sp.specs[0].identity],
        actual = cut(dxf, name).map((p) => ({ x: p.x - off.dx, y: p.y - off.dy }));
      function directed(a, b) {
        let max = 0;
        const edges = b.map((p, i) => {
          const q = b[(i + 1) % b.length],
            x = q.x - p.x,
            y = q.y - p.y;
          return { p, x, y, l: x * x + y * y };
        });
        for (let i = 0; i < a.length; i++) {
          const p = a[i],
            q = a[(i + 1) % a.length],
            n = Math.max(1, Math.ceil(Math.hypot(p.x - q.x, p.y - q.y) / 0.1));
          for (let j = 0; j < n; j++) {
            const x = p.x + ((q.x - p.x) * j) / n,
              y = p.y + ((q.y - p.y) * j) / n;
            let best = Infinity;
            for (const e of edges) {
              const u = Math.min(
                1,
                Math.max(0, ((x - e.p.x) * e.x + (y - e.p.y) * e.y) / e.l || 0),
              );
              const vx = x - e.p.x - u * e.x,
                vy = y - e.p.y - u * e.y;
              best = Math.min(best, vx * vx + vy * vy);
            }
            max = Math.max(max, Math.sqrt(best));
          }
        }
        return max;
      }
      const row = {
        refName,
        name,
        vertices: actual.length,
        refToDxfMm: directed(ref, actual),
        dxfToRefMm: directed(actual, ref),
        gates: gate.report,
      };
      results.push(row);
      console.log(name, material, row.refToDxfMm, row.dxfToRefMm);
    }
  }
}
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
assert.equal(results.length, 6);
assert.ok(results.every((r) => Math.max(r.refToDxfMm, r.dxfToRefMm) < 0.1));
