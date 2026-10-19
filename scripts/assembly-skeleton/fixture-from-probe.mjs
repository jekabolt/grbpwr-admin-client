#!/usr/bin/env node
// One-off: the feasibility probe's seam graph (tmp/plans/assembly-from-pattern/probe/out/*.json +
// the flags printed in *.txt) → a SeamGraph fixture lane B can be built and measured against
// while lane A builds the real one. NOT product code; the fixtures it writes are committed.
//
//   node scripts/assembly-skeleton/fixture-from-probe.mjs <probe-out-prefix> <out.json> \
//        [--card card.json] [--category shirt] [--buttons N] [--truth truth.json]
//
// --card maps piece names to the card's lineKeys and carries the technologist's join steps as
// truth; --truth reads hand-written truth joins instead ({joins: [{name, inputs: [[names…]…]}]}).

import fs from 'node:fs';

const [prefix, outPath, ...rest] = process.argv.slice(2);
if (!prefix || !outPath) {
  console.error(
    'usage: fixture-from-probe.mjs <probe-out-prefix> <out.json> [--card f] [--category c] [--buttons n] [--truth f]',
  );
  process.exit(2);
}
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];

const probe = JSON.parse(fs.readFileSync(`${prefix}.json`, 'utf8'));
const txt = fs.readFileSync(`${prefix}.txt`, 'utf8').split('\n');

const card = opt.card ? JSON.parse(fs.readFileSync(opt.card, 'utf8')).techCard : null;
const keyOf = new Map();
if (card) for (const p of card.pieces) keyOf.set(p.name, p.lineKey);
const key = (name) => keyOf.get(name) ?? name;
const edgeKey = (label) => {
  const i = label.lastIndexOf('#');
  return `${key(label.slice(0, i))}#${label.slice(i + 1)}`;
};

const handOf = (x) => x.match(/(?:^|_)(L|R)(?=_|$)/)?.[1] ?? null;

// twins from the header line «twins A~B C~D»
const header = txt.find((l) => l.startsWith('file ')) ?? '';
const twinPairs = (header.split(' twins ')[1] ?? '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map((t) => t.split('~'));
const twinKind = (a, b) => {
  const ha = handOf(a);
  const hb = handOf(b);
  return ha && hb && ha !== hb ? 'mirror' : !ha && !hb ? 'identical' : 'mirror';
};

const area = (rs) => {
  let s = 0;
  for (let i = 0; i < rs.length; i++) {
    const [x1, y1] = rs[i];
    const [x2, y2] = rs[(i + 1) % rs.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s / 2);
};

const edgesByPiece = new Map();
probe.edges.forEach((e, i) => {
  const ix = probe.edgeIdx[i];
  const list = edgesByPiece.get(e.piece) ?? [];
  list.push({
    id: `${key(e.piece)}#${e.k}`,
    pieceKey: key(e.piece),
    k: e.k,
    s: ix.s,
    e: ix.e,
    pts: [],
    lenMm: e.len,
    chordMm: 0,
    turnDeg: e.turn,
    notchesMm: e.notches,
    kind: 'edge',
  });
  edgesByPiece.set(e.piece, list);
});

const pieces = probe.pieces.map((p) => ({
  pieceKey: key(p.id),
  name: p.id,
  hand: handOf(p.id),
  cloth: 'main',
  rs: [],
  corners: [],
  notchIdx: p.notchIdx,
  edges: edgesByPiece.get(p.id) ?? [],
  rect: false,
  areaMm2: Math.round(area(p.rs)),
  perimMm: (edgesByPiece.get(p.id) ?? []).reduce((s, e) => s + e.lenMm, 0),
  twinOf: twinPairs
    .filter(([a, b]) => a === p.id || b === p.id)
    .map(([a, b]) => ({ key: key(a === p.id ? b : a), kind: twinKind(a, b) })),
}));

// «  0.78  CLR#3            ↔ 2CLR#3           Δ0 0% ns=0.5 ambiguous(alt CLR#3↔2CLR_1#3)»
const start = txt.findIndex((l) => l.startsWith('CHOSEN PAIRS'));
const chosen = [];
for (let i = start + 1; i < txt.length && txt[i].startsWith('  '); i++) {
  const m = txt[i].match(
    /^\s+([\d.]+)\s+(\S+)\s+↔\s+(\S+)\s+Δ([\d.]+)\s+([\d.]+)%\s+ns=([\d.]+)(.*)$/,
  );
  if (!m) continue;
  const [, score, a, b, dl, rel, ns, flags] = m;
  const pa = a.slice(0, a.lastIndexOf('#'));
  const pb = b.slice(0, b.lastIndexOf('#'));
  const ha = handOf(pa);
  const hb = handOf(pb);
  const twin = / TWIN/.test(flags)
    ? 'mirror'
    : twinPairs.some(([x, y]) => (x === pa && y === pb) || (x === pb && y === pa))
      ? twinKind(pa, pb)
      : 'none';
  const evidence = {
    dLenMm: +dl,
    relLen: +rel / 100,
    notchScore: +ns === 0.5 ? null : +ns,
    curvature: 'flat',
    hand: ha && hb ? (ha === hb ? 'same' : 'cross') : 'neutral',
    twin,
    self: / SELF/.test(flags),
    ...(/ eased/.test(flags) ? { rule: 'eased: lengths within 3.5 %' } : {}),
  };
  const c = { a: edgeKey(a), b: edgeKey(b), score: +score, evidence, kind: 'edge' };
  const alt = flags.match(/ambiguous\(alt (\S+)↔(\S+)\)/);
  if (alt)
    c.ambiguousWith = [
      { a: edgeKey(alt[1]), b: edgeKey(alt[2]), score: +score, evidence, kind: 'edge' },
    ];
  chosen.push(c);
}

// connected components by pieceKey
const parent = new Map(pieces.map((p) => [p.pieceKey, p.pieceKey]));
const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
for (const c of chosen) {
  const a = c.a.slice(0, c.a.lastIndexOf('#'));
  const b = c.b.slice(0, c.b.lastIndexOf('#'));
  parent.set(find(a), find(b));
}
const comps = new Map();
for (const p of pieces)
  comps.set(find(p.pieceKey), [...(comps.get(find(p.pieceKey)) ?? []), p.pieceKey]);

const graph = { pieces, chosen, rejected: [], components: [...comps.values()], warnings: [] };

const facts = {
  pieces: (card ? card.pieces : probe.pieces.map((p) => ({ name: p.id, lineKey: p.id }))).map(
    (p) => ({
      pieceKey: p.lineKey,
      name: p.name,
      piecesPerGarment: p.piecesPerGarment ?? 1,
      cutSymmetry: p.cutSymmetry ?? null,
      cloth: 'main',
      fused: false,
    }),
  ),
  category: opt.category ?? 'generic',
  bom: {
    zipper: 0,
    buttons: +(opt.buttons ?? 0),
    snaps: 0,
    tape: 0,
    elastic: 0,
    drawcord: 0,
    interlining: 0,
  },
  defaultMachineType: card?.construction?.equipmentDefaults?.machines?.[0]?.machineType ?? null,
};

// Truth: the technologist's join steps (a step with an output unit), or hand-written joins.
let truth = [];
if (card) {
  truth = card.operations
    .filter((o) => o.outputUnitKey)
    .map((o) => ({ name: o.outputUnitKey, inputs: o.inputKeys }));
} else if (opt.truth) {
  truth = JSON.parse(fs.readFileSync(opt.truth, 'utf8')).joins;
}

fs.writeFileSync(
  outPath,
  JSON.stringify({ source: `${prefix} (probe v3, 09.10)`, graph, facts, truth }, null, 1) + '\n',
);
console.log(
  `${outPath}: ${pieces.length} pieces, ${chosen.length} chosen seams, ${truth.length} truth joins`,
);
