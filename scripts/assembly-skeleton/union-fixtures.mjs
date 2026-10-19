#!/usr/bin/env node
// One-off: cut the five golden units of the union probe (C4) out of the feasibility probe's seam
// graphs (tmp/plans/assembly-from-pattern/probe/out/*-M.json) into a small in-repo fixture, so
// `yarn skeleton:union` runs without the plans folder.
//
//   node scripts/assembly-skeleton/union-fixtures.mjs <probe-out-dir> [blazer-M.json]
//
// blazer-M.json in probe/out predates contour export (no `rs`); regenerate it with
// `node probe/seamgraph.mjs <corpus>/dxf-clo/blazer.dxf M <dir>/blazer-M` and pass that path.
//
// Edge labels `piece#k` are the probe's corner segmentation; lane A's real geometry renumbers
// nothing here — the fixture carries its own s/e indices.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [, , outDir, blazerPath] = process.argv;
if (!outDir) {
  console.error('usage: union-fixtures.mjs <probe-out-dir> [blazer-M.json]');
  process.exit(2);
}
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const graphs = {
  shirt: load(resolve(outDir, 'shirt-M.json')),
  allsizes: load(resolve(outDir, 'allsizes-M.json')),
  blazer: load(blazerPath ?? resolve(outDir, 'blazer-M.json')),
};

const UNITS = [
  {
    id: 'ss26-005-right-sleeve',
    name: 'right sleeve',
    source: 'shirt',
    seams: ['SLV_M_R#0~SLV_R#1', 'SLV_M_R#2~SLV_R#5'],
  },
  { id: 'ss26-005-collar-base', name: 'collar base', source: 'shirt', seams: ['CLR#1~CLR_1#1'] },
  {
    id: 'ss26-005-back-panel',
    name: 'back panel',
    source: 'shirt',
    seams: [
      'BP#7~BP_L#1',
      'BP#9~BP_R#0',
      'BP_L#2~BP_1_L#3',
      'BP_1_R#3~BP_R#2',
      'BP_2_R#3~BP_1_R#1',
    ],
  },
  {
    id: 'allsizes-yoke-back-fronts',
    name: 'yoke + back + fronts',
    source: 'allsizes',
    seams: ['BP#5~BP_1#2', 'BP#3~FP_L#0', 'BP#1~FP_R#4'],
  },
  {
    id: 'blazer-two-piece-sleeve',
    name: 'two-piece sleeve',
    source: 'blazer',
    seams: ['3#3~4#1', '3#1~4#3'],
  },
];

const signedArea = (rs) => {
  let a = 0;
  for (let i = 0; i < rs.length; i++) {
    const p = rs[i];
    const q = rs[(i + 1) % rs.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
const perim = (rs) => {
  let s = 0;
  for (let i = 0; i < rs.length; i++) {
    const p = rs[i];
    const q = rs[(i + 1) % rs.length];
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return s;
};

const out = [];
for (const u of UNITS) {
  const G = graphs[u.source];
  const keys = [...new Set(u.seams.flatMap((s) => s.split('~').map((e) => e.split('#')[0])))];
  const pieces = keys.map((k) => {
    const p = G.pieces.find((x) => String(x.id) === k);
    if (!p?.rs) throw new Error(`${u.id}: no contour for ${k} in ${u.source}`);
    const lens = new Map(G.edges.filter((e) => String(e.piece) === k).map((e) => [e.k, e.len]));
    const sa = signedArea(p.rs);
    return {
      pieceKey: k,
      rs: p.rs,
      notchIdx: p.notchIdx ?? [],
      areaMm2: Math.abs(sa),
      signed: Math.sign(sa),
      perimMm: perim(p.rs),
      edges: G.edgeIdx
        .filter((e) => String(e.piece) === k)
        .map((e) => ({ k: e.k, s: e.s, e: e.e, lenMm: lens.get(e.k) ?? 0 })),
    };
  });
  // Twins the way lane A defines them (01-PLAN A2): area ±1.5 %, perimeter ±1 %; a hand suffix
  // (_L/_R) makes it a mirror (L/R), none an identical layer. The contours are normalised CCW, so
  // the sign of the area cannot tell the two apart. The fixture has one cloth, so cloth agrees.
  const hand = (k) => (/_L(_|$)/.test(k) ? 'L' : /_R(_|$)/.test(k) ? 'R' : null);
  for (const a of pieces) {
    a.twinOf = pieces
      .filter(
        (b) =>
          b !== a &&
          Math.abs(a.areaMm2 - b.areaMm2) / Math.max(a.areaMm2, b.areaMm2) <= 0.015 &&
          Math.abs(a.perimMm - b.perimMm) / Math.max(a.perimMm, b.perimMm) <= 0.01,
      )
      .map((b) => ({
        key: b.pieceKey,
        kind: hand(a.pieceKey) && hand(b.pieceKey) ? 'mirror' : 'identical',
      }));
    a.hand = hand(a.pieceKey);
  }
  out.push({
    id: u.id,
    name: u.name,
    source: u.source,
    pieces: pieces.map(({ signed: _s, ...p }) => p),
    seams: u.seams,
  });
  console.log(
    `${u.id}: ${pieces.length} pieces, twins ${pieces.flatMap((p) => p.twinOf.map((t) => `${p.pieceKey}~${t.key}:${t.kind}`)).join(' ') || '—'}`,
  );
}
const file = resolve(here, 'fixtures/union-units.json');
writeFileSync(file, JSON.stringify(out));
console.log(`→ ${file}`);
