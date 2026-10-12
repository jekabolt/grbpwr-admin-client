// PATTERN-IMPORT · D6 — one PDF = one garment: every tile sheet in one drawing. Crafted checks of
// the pure parts (the composite itself and the corpus are e2e's: `ulmus`, `polupalto`, `r4454`):
//   1 the cross-sheet reading (pieces/sheets.ts): disjoint sheets unite; a copy (moved, turned,
//     mirrored) is found with its evidences; a whole sheet drawn again is an ALTERNATIVE (keep one)
//     — the coordinator's control: the same pattern twice never exports twice; a split is asked;
//     furniture words are no label. Every rule has a mutation that must flip it.
//   2 the per-sheet legend: the same size pens agree, a pen on one sheet only is a question.
//   3 G23 on the cover: a sheet left out, a sheet that exports nothing, an alternative / copy not
//     answered, a split answered "halves" — each blocks; the answered twins pass.
//   4 the replay of a record onto the composite: an older one-sheet record moves by where its sheet
//     sits now; a D6 record by its sheet's shift; a sheet whose pages changed lands nowhere.
import type {
  IRText,
  PieceFamily,
  PtMm,
  ReplayAnswer,
  Seed,
  SheetPart,
} from 'lib/pattern-import/types';
import {
  emptyKey,
  openSheetQuestions,
  sheetAnswerEdits,
  sheetCoverOf,
  sheetLegend,
  sheetLegendQuestion,
  sheetPieces,
  sheetQuestion,
  type SheetPieces,
} from 'lib/pattern-import/pieces/sheets';
import { g23 } from 'lib/pattern-import/gate/checks';
import { joinSheetChains } from 'lib/pattern-import/assemble/composite';
import type { ChainSet, LineClass, Style } from 'lib/pattern-import/types';
import { readManifest } from 'lib/pattern-import/manifest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { anchorOf } from 'components/managers/tech-card/components/pattern-import/autopilot/replay-record';
import { CASES, runCase } from './e2e-entry';

const PROBES = resolve(
  process.env.PATIMPORT_PLANS ?? '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf',
  'probes',
);
import {
  movePoints,
  placedAnswers,
} from 'components/managers/tech-card/components/pattern-import/autopilot/replay-sheets';

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) fails++;
};

// ── crafted drawing ────────────────────────────────────────────────────────────────────────────
const part = (sheet: number, x0: number, w = 1000): SheetPart => ({
  sheet,
  pages: [{ file: '0', page: sheet * 10 }],
  dx: x0,
  dy: 0,
  box: { minX: x0, minY: 0, maxX: x0 + w, maxY: 1000 },
  maxResidualMm: 0,
  missing: 0,
});
const PARTS = [part(0, 0), part(1, 1300)];

let nid = 0;
const txt = (s: string, at: PtMm): IRText => ({
  id: nid++,
  text: s,
  anchor: at,
  bbox: { minX: at.x - 10, minY: at.y - 2, maxX: at.x + 10, maxY: at.y + 2 },
  fontSizeMm: 4,
  rotationDeg: 0,
  layer: null,
  src: { file: '0', page: 0, index: 0 } as unknown as IRText['src'],
});
const rect = (x: number, y: number, w: number, h: number): PtMm[] => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];
/** An L-shaped piece (no symmetry: a turn or a mirror is a real orientation). */
const ell = (x: number, y: number, s = 1): PtMm[] =>
  [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 80 },
    { x: 120, y: 80 },
    { x: 120, y: 260 },
    { x: 0, y: 260 },
  ].map((p) => ({ x: x + p.x * s, y: y + p.y * s }));
const turn = (r: PtMm[], c: PtMm) => r.map((p) => ({ x: c.x - (p.y - c.y), y: c.y + (p.x - c.x) }));
const mirror = (r: PtMm[], cx: number) => r.map((p) => ({ x: 2 * cx - p.x, y: p.y }));
const area = (r: PtMm[]) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j].x * r[i].y - r[i].x * r[j].y;
  return Math.abs(a) / 2;
};
/** A point inside a ring: the middle of the first span of the scan line through 40 % height. */
function interior(r: PtMm[]): PtMm {
  const ys = r.map((p) => p.y);
  const y = Math.min(...ys) + 0.4 * (Math.max(...ys) - Math.min(...ys));
  const xs: number[] = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (r[i].y > y !== r[j].y > y)
      xs.push(r[i].x + ((y - r[i].y) * (r[j].x - r[i].x)) / (r[j].y - r[i].y));
  xs.sort((a, b) => a - b);
  return { x: (xs[0] + xs[1]) / 2, y };
}

type P = { seed: number; ring: PtMm[]; label?: string; words?: string[] };
function build(ps: P[]) {
  const families = ps.map(
    (p): PieceFamily =>
      ({
        seed: p.seed,
        monotone: true,
        candidates: [
          {
            rank: 0,
            outcome: 'closed',
            outer: p.ring,
            areaMm2: area(p.ring),
            bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
          },
        ],
      }) as unknown as PieceFamily,
  );
  const texts: IRText[] = [];
  const seeds: Seed[] = ps.map((p) => {
    const inner = interior(p.ring);
    if (p.label) texts.push(txt(p.label, inner));
    for (const w of p.words ?? []) texts.push(txt(w, { x: inner.x, y: inner.y + 0.5 }));
    return { id: p.seed, at: inner, origin: 'face', variant: null } as Seed;
  });
  return { families, seeds, texts };
}
const read = (ps: P[], parts: SheetPart[] = PARTS): SheetPieces | null => {
  const b = build(ps);
  return sheetPieces(parts, b.families, b.seeds, b.texts);
};

// ── 1 · the cross-sheet reading ───────────────────────────────────────────────────────────────
{
  const r = read([
    { seed: 1, ring: rect(100, 100, 200, 300), label: 'FRONT' },
    { seed: 2, ring: ell(1400, 100), label: 'BACK' },
  ]);
  check(
    '1a disjoint sheets unite (no copy / alternative / split)',
    !!r && !r.copies.length && !r.alternatives.length && !r.splits.length,
    JSON.stringify(r?.parts),
  );
  check(
    '1a one sheet: no reading at all',
    read([{ seed: 1, ring: rect(0, 0, 10, 10) }], [PARTS[0]]) === null,
  );
}
{
  const base = ell(100, 100);
  const moved = ell(1500, 300);
  const r = read([
    { seed: 1, ring: base, label: 'COLLAR' },
    { seed: 2, ring: moved, label: 'COLLAR' },
    { seed: 3, ring: rect(500, 500, 100, 100), label: 'FRONT' },
    { seed: 4, ring: rect(1900, 500, 220, 140), label: 'BACK' },
  ]);
  const c = r?.copies[0];
  check(
    '1b a moved copy with the same label: a STRONG copy, the lower sheet kept',
    r?.copies.length === 1 && !!c?.strong && c.keep.seed === 1 && c.copy.seed === 2,
    JSON.stringify(c?.evidence),
  );
  check(
    '1b the answer "copy" is "not a piece" on the copy only',
    JSON.stringify(sheetAnswerEdits(r, c!.key, 'copy')) ===
      JSON.stringify([{ kind: 'not-a-piece', seed: 2 }]),
  );
  check(
    '1b the question is asked, then answered',
    !!sheetQuestion(r, {}) && !sheetQuestion(r, { [c!.key]: 'both' }),
  );
  // mutation: the label differs → shape only → weak (the autopilot stops)
  const w = read([
    { seed: 1, ring: base, label: 'COLLAR' },
    { seed: 2, ring: moved, label: 'POCKET' },
  ]);
  check(
    '1b' + "'" + ' mutation: other label → a WEAK copy',
    w?.copies.length === 1 && !w.copies[0].strong,
  );
  // mutation: 3 % bigger → no copy; with the same label → a split question
  const s = read([
    { seed: 1, ring: base, label: 'COLLAR' },
    { seed: 2, ring: ell(1500, 300, 1.03), label: 'COLLAR' },
  ]);
  check(
    '1b' + "''" + ' mutation: 3 % bigger → no copy, the same label → a split',
    s?.copies.length === 0 && s.splits.length === 1 && sheetQuestion(s, {})?.kind === 'split',
  );
}
{
  const base = ell(100, 100);
  const turned = turn(ell(1500, 300), { x: 1600, y: 400 });
  const mirrored = mirror(ell(1500, 300), 1700);
  for (const [name, ring] of [
    ['turned 90°', turned],
    ['mirrored', mirrored],
  ] as const) {
    const r = read([
      { seed: 1, ring: base, label: 'COLLAR' },
      { seed: 2, ring, label: 'COLLAR' },
    ]);
    check(`1c a copy ${name} is found`, r?.copies.length === 1 && !!r.copies[0].strong);
  }
}
{
  // the coordinator's control: the same pattern drawn twice (A4 tiles + Letter tiles)
  const A = [
    { seed: 1, ring: ell(100, 100), label: 'FRONT' },
    { seed: 2, ring: rect(500, 100, 200, 400), label: 'BACK' },
    { seed: 3, ring: rect(100, 600, 150, 150), label: 'POCKET' },
  ];
  const B = [
    { seed: 11, ring: ell(1400, 120), label: 'FRONT' },
    { seed: 12, ring: rect(1800, 120, 200, 400), label: 'BACK' },
    { seed: 13, ring: rect(1400, 620, 150, 150), label: 'POCKET' },
  ];
  const r = read([...A, ...B]);
  const a = r?.alternatives[0];
  check(
    '1d the same pattern on two sheets is ONE alternative (keep sheet 1), its copies answered with it',
    r?.alternatives.length === 1 && a?.keep === 0 && a.drop === 1 && !!a.strong && !r.copies.length,
    JSON.stringify(a?.evidence),
  );
  const edits = sheetAnswerEdits(r, a!.key, 'keep');
  check(
    '1d "keep" drops EVERY piece of the other sheet (never both exported)',
    JSON.stringify(edits.map((e) => e.seed).sort()) === JSON.stringify([11, 12, 13]),
  );
  // the cover of an unanswered alternative with both exported blocks (G23)
  const cover = sheetCoverOf({
    parts: PARTS,
    tileSheets: [0, 1],
    read: r,
    answers: {},
    exported: [1, 2, 3, 11, 12, 13],
  });
  const g = g23({ expect: { sheets: cover } } as never);
  check('1d mutation: the alternative not answered, both exported → G23 blocks', !g.ok, g.note);
  const ok = g23({
    expect: {
      // after "keep" the copies are "not a piece": the pieces run reads sheet 2 empty
      sheets: sheetCoverOf({
        parts: PARTS,
        tileSheets: [0, 1],
        read: read(A),
        answers: {},
        exported: [1, 2, 3],
      }),
    },
  } as never);
  check('1d answered "keep" (the copies not exported) → G23 passes', ok.ok, ok.note);
  // mutation: only 1 of 3 pieces repeats → no alternative, one copy question
  const part1 = read([
    ...A,
    B[0],
    { seed: 12, ring: ell(1800, 120, 0.7), label: 'YOKE' },
    { seed: 13, ring: rect(1400, 620, 90, 60), label: 'TAB' },
  ]);
  check(
    '1d' + "'" + ' mutation: one repeated piece of three → no alternative, a copy question',
    part1?.alternatives.length === 0 && part1.copies.length === 1,
  );
}
{
  // furniture words (in most pieces) are no label: «MDF065 SIZE» everywhere, names apart
  const r = read([
    { seed: 1, ring: rect(100, 100, 200, 300), label: 'FRONT', words: ['MDF065', 'SIZE'] },
    { seed: 2, ring: ell(400, 100), label: 'YOKE', words: ['MDF065', 'SIZE'] },
    { seed: 3, ring: rect(1400, 100, 220, 300), label: 'BACK', words: ['MDF065', 'SIZE'] },
    { seed: 4, ring: ell(1700, 100, 0.8), label: 'SLEEVE', words: ['MDF065', 'SIZE'] },
  ]);
  check(
    '1e words in most pieces are furniture: no split from «MDF065 SIZE»',
    !!r && !r.splits.length,
    JSON.stringify(r?.splits.map((s) => s.a.label)),
  );
}

{
  // Codex D6 #2: two identical pockets on one sheet against ONE pocket on the other pair one to
  // one — never two matches, never a strong alternative that drops the unique piece
  const r = read([
    { seed: 1, ring: rect(100, 100, 150, 150), label: 'POCKET' },
    { seed: 2, ring: rect(400, 100, 150, 150), label: 'POCKET' },
    { seed: 3, ring: rect(100, 500, 600, 80), label: 'WAISTBAND' },
    { seed: 11, ring: rect(1400, 100, 150, 150), label: 'POCKET' },
    { seed: 12, ring: rect(1700, 100, 150, 150), label: 'FLAP' },
    { seed: 13, ring: ell(1500, 600), label: 'FRONT' },
    { seed: 14, ring: rect(1900, 500, 220, 300), label: 'BACK' },
    { seed: 15, ring: ell(2100, 200, 0.6), label: 'YOKE' },
  ]);
  const a = r?.alternatives[0];
  check(
    '1f two identical pockets vs one: no STRONG alternative (one-to-one pairing)',
    !a || !a.strong,
    JSON.stringify(a ? { matched: a.matched, ev: a.evidence } : null),
  );
}
{
  // Codex D6 #3: an answer key is the piece in its own sheet's frame and the sheet's page set
  const ps = [
    { seed: 1, ring: ell(100, 100), label: 'COLLAR' },
    { seed: 2, ring: ell(1500, 300), label: 'COLLAR' },
  ];
  const k0 = read(ps)?.copies[0]?.key;
  const shifted = [part(0, 0), { ...part(1, 1330), dx: 1330 }];
  const k1 = read(
    ps.map((p) => (p.seed === 2 ? { ...p, ring: ell(1530, 300) } : p)),
    shifted,
  )?.copies[0]?.key;
  check(
    '4f a copy answer key survives its sheet laid 30 mm further',
    !!k0 && k0 === k1,
    `${k0} / ${k1}`,
  );
  const repaged = [
    part(0, 0),
    {
      ...part(1, 1300),
      pages: [
        { file: '0', page: 10 },
        { file: '0', page: 11 },
      ],
    },
  ];
  const k2 = read(ps, repaged)?.copies[0]?.key;
  const e0 = read(ps)?.parts[1];
  const e1 = read(ps, repaged)?.parts[1];
  check(
    '4f an empty-sheet answer is bound to the page set too',
    !!e0 && !!e1 && emptyKey(e0) !== emptyKey(e1),
  );
  check(
    '4f mutation: the sheet has other pages → another key (the answer does not land)',
    !!k2 && k2 !== k0,
  );
}
{
  // Codex D6 #1: unlabelled size rows merge across sheets only by pen AND nesting rank
  const styles = [
    { id: 0, strokeRgb: [0, 0, 0], widthMm: 0.4, dash: null, layer: null } as unknown as Style,
  ];
  const chain = (id: number) => ({
    id,
    pts: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    closed: false,
    ranges: [],
    motif: null,
    style: 0,
    lengthMm: 10,
  });
  const row = (rank: number | null): LineClass => ({
    id: 0,
    role: 'size',
    sizeLabel: null,
    chains: [0],
    totalLengthMm: 10,
    evidence: rank == null ? [] : [{ kind: 'nesting-order', rank }],
    confidence: 0.8,
  });
  const set = (rank: number | null): ChainSet => ({
    chains: [chain(0)],
    classes: [row(rank)],
    bundles: [],
    orphans: [],
    warnings: [],
  });
  const ranked = joinSheetChains(
    [
      { sheet: 0, set: set(0) },
      { sheet: 1, set: set(0) },
    ],
    styles,
  );
  check(
    '2c the same pen at the same rank on two sheets is one size row',
    ranked.classes.length === 1,
  );
  const unranked = joinSheetChains(
    [
      { sheet: 0, set: set(null) },
      { sheet: 1, set: set(null) },
    ],
    styles,
  );
  check(
    '2c mutation: the same pen, no rank → two rows (the legend check asks)',
    unranked.classes.length === 2,
  );
  const otherRank = joinSheetChains(
    [
      { sheet: 0, set: set(0) },
      { sheet: 1, set: set(1) },
    ],
    styles,
  );
  check('2c mutation: the same pen, another rank → two rows', otherRank.classes.length === 2);
}

// ── 2 · the per-sheet legend ──────────────────────────────────────────────────────────────────
{
  const ch = (x: number) => ({
    pts: [
      { x, y: 0 },
      { x: x + 200, y: 0 },
    ],
    lengthMm: 200,
  });
  const chains = [ch(10), ch(20), ch(1400), ch(1420), ch(1440)];
  const agree = sheetLegend(
    PARTS,
    [
      { id: 0, role: 'size', chains: [0, 2] },
      { id: 1, role: 'size', chains: [1, 3] },
      { id: 2, role: 'internal', chains: [4] },
    ],
    chains,
  );
  check(
    '2a the same size pens on both sheets agree',
    !!agree?.agree && !sheetLegendQuestion(agree, null),
  );
  const dis = sheetLegend(
    PARTS,
    [
      { id: 0, role: 'size', chains: [0, 2] },
      { id: 1, role: 'size', chains: [1, 3] },
      { id: 2, role: 'size', chains: [4] },
    ],
    chains,
  );
  const q = sheetLegendQuestion(dis, null);
  check('2b a size pen on one sheet only is a question', !!q, q ?? '');
  check('2b confirmed for this reading → no question', !sheetLegendQuestion(dis, dis!.sig));
}

// ── 3 · G23 ───────────────────────────────────────────────────────────────────────────────────
{
  const r = read([
    { seed: 1, ring: rect(100, 100, 200, 300), label: 'FRONT' },
    { seed: 2, ring: ell(1400, 100), label: 'BACK' },
  ]);
  const cover = (x: Partial<Parameters<typeof sheetCoverOf>[0]>) =>
    g23({
      expect: {
        sheets: sheetCoverOf({
          parts: PARTS,
          tileSheets: [0, 1],
          read: r,
          answers: {},
          exported: [1, 2],
          ...x,
        }),
      },
    } as never);
  const ok = cover({});
  check('3a every sheet exports → G23 passes', ok.ok, ok.note);
  const gone = cover({ tileSheets: [0, 1, 2] });
  check('3b mutation: a tile sheet not in the drawing → blocks', !gone.ok, gone.note);
  const none = cover({ exported: [1] });
  check('3c mutation: sheet 2 holds a piece, exports none → blocks', !none.ok, none.note);
  const s = read([
    { seed: 1, ring: ell(100, 100), label: 'SKIRT' },
    { seed: 2, ring: rect(1400, 100, 300, 500), label: 'SKIRT' },
  ]);
  const key = s!.splits[0].key;
  const g = (answers: Record<string, 'separate' | 'halves'>) =>
    g23({
      expect: {
        sheets: sheetCoverOf({
          parts: PARTS,
          tileSheets: [0, 1],
          read: s,
          answers,
          exported: [1, 2],
        }),
      },
    } as never);
  check('3d a split not answered → blocks', !g({}).ok);
  check(
    '3d a split answered "halves" → blocks (no join here)',
    !g({ [key]: 'halves' }).ok,
    g({ [key]: 'halves' }).note,
  );
  check('3d a split answered "separate" → passes', g({ [key]: 'separate' }).ok);
  check(
    '3e open questions list the split until "separate"',
    openSheetQuestions(s, {}).splits.length === 1 &&
      openSheetQuestions(s, { [key]: 'separate' }).splits.length === 0,
  );
}

// ── 4 · replay onto the composite ─────────────────────────────────────────────────────────────
{
  const now: SheetPart[] = [
    { ...part(0, 0), dx: 0 },
    { ...part(1, 1500), dx: 1500, dy: 5, pages: [{ file: '0', page: 10 }] },
  ];
  const sess = { sheet: { sheet: { parts: now } } } as never;
  const piece = (x: number, y: number): ReplayAnswer => ({
    step: 'meaning',
    kind: 'piece',
    subject: 'p',
    value: { pc: { a: 100, x, y } } as never,
  });
  const legacy = placedAnswers(
    [
      { step: 'sheet', kind: 'sheet-choice', subject: 'f', value: { sheet: 1 } as never },
      piece(10, 20),
    ],
    sess,
    () => '0',
  );
  const pc = (legacy.answers[1].value as { pc: PtMm }).pc;
  check(
    '4a an older record of sheet 2 alone moves by where sheet 2 sits now',
    pc.x === 1510 && pc.y === 25,
    JSON.stringify(pc),
  );
  const plain = placedAnswers([piece(10, 20)], sess, () => '0');
  check(
    '4b an older one-sheet record (sheet 1) does not move',
    (plain.answers[0].value as { pc: PtMm }).pc.x === 10 && !plain.moved,
  );
  const layout = (dx1: number, pages1: number) => ({
    step: 'sheet',
    kind: 'sheet-layout',
    subject: '2 tile sheets',
    value: {
      parts: [
        { k: 0, pages: [[0, 0]], dx: 0, dy: 0, box: [0, 0, 1000, 1000] },
        { k: 1, pages: [[0, pages1]], dx: dx1, dy: 0, box: [dx1, 0, dx1 + 1000, 1000] },
      ],
    } as never,
  });
  const d6 = placedAnswers([layout(1400, 10), piece(1450, 20), piece(10, 20)], sess, () => '0');
  const p1 = (d6.answers[1].value as { pc: PtMm }).pc;
  const p0 = (d6.answers[2].value as { pc: PtMm }).pc;
  check(
    '4c a D6 record: a point of sheet 2 moves by its shift, sheet 1 stays',
    p1.x === 1550 && p1.y === 25 && p0.x === 10,
    JSON.stringify([p1, p0]),
  );
  const changed = placedAnswers([layout(1400, 11), piece(1450, 20)], sess, () => '0');
  check(
    '4d mutation: sheet 2 has other pages now → its answers land nowhere',
    (changed.answers[1].value as { pc: PtMm }).pc.x > 1e8,
  );
  const m = movePoints(
    { seeds: { 3: { at: { x: 1, y: 2 } } }, chains: { 7: [1, 2, 3, 4, 9] }, text: '{"x":1}' },
    (p) => ({ x: p.x + 100, y: p.y }),
  ) as { seeds: Record<string, { at: PtMm }>; chains: Record<string, number[]>; text: string };
  check(
    '4e points, chain prints moved; edit text left for its parser',
    m.seeds[3].at.x === 101 &&
      m.chains[7][0] === 101 &&
      m.chains[7][2] === 103 &&
      m.chains[7][4] === 9 &&
      m.text === '{"x":1}',
  );
}

// ── 5 · the owner's Ulmus record (before D6: sheet 2 alone) onto the D6 drawing ─────────────────
// The owner's export of 12.10 (ss26-…-4dfbd71e.dxf, a copy in pdf-to-dxf/probes) carries the replay
// record of an import of tile sheet 2 alone. On the D6 drawing every piece answer of it must land
// on a piece of the same outline (sheet 2 is the anchor there); the mutation "it was sheet 1"
// moves them onto nothing.
async function ownerRecord() {
  const dxf = resolve(PROBES, 'ulmus-owner-export-4dfbd71e.dxf');
  const c = CASES.find((x) => x.id === 'ulmus');
  if (!existsSync(dxf) || !c) {
    console.log('SKIP  5 the owner record (file or case missing)');
    return;
  }
  const m = readManifest(readFileSync(dxf, 'latin1'));
  const answers = m?.replay?.answers ?? [];
  check(
    '5 the owner export carries a replay record of sheet 2',
    answers.some((a) => a.kind === 'sheet-choice'),
  );
  let fams: PieceFamily[] = [];
  let parts: SheetPart[] = [];
  await runCase(c, {
    onPieces: (s) => {
      const x = s as unknown as { families: PieceFamily[]; sheet: { parts: SheetPart[] } };
      fams = x.families ?? [];
      parts = x.sheet?.parts ?? [];
    },
  });
  const entries =
    (answers.find((a) => a.kind === 'size-map')?.value as { entries?: { r: number; c: unknown }[] })
      ?.entries ?? [];
  const mapped = new Set(entries.filter((e) => e.c).map((e) => e.r));
  const anchors = fams.flatMap((f) => {
    const a = anchorOf(f, mapped.size ? mapped : null);
    return a ? [a] : [];
  });
  const lands = (pc: { a: number; x: number; y: number }) =>
    anchors.some(
      (n) =>
        Math.abs(n.a - pc.a) <= Math.max(5, 0.005 * pc.a) &&
        Math.hypot(n.x - pc.x, n.y - pc.y) <= 1.5,
    );
  const count = (as: ReplayAnswer[]) =>
    as.filter(
      (a) =>
        a.kind === 'piece' && lands((a.value as { pc: { a: number; x: number; y: number } }).pc),
    ).length;
  const sess = { sheet: { sheet: { parts } } } as never;
  const pieces = answers.filter((a) => a.kind === 'piece').length;
  const placed = placedAnswers(answers, sess, () => '0');
  const got = count(placed.answers);
  check(
    `5 the owner's piece answers land on the D6 drawing (${got} of ${pieces})`,
    pieces > 0 && got === pieces,
    `sheets ${parts.map((p) => `${p.sheet + 1}@${Math.round(p.dx)}`).join(', ')}`,
  );
  const wrong = placedAnswers(
    answers.map((a) => (a.kind === 'sheet-choice' ? { ...a, value: { sheet: 0 } as never } : a)),
    sess,
    () => '0',
  );
  check(
    '5 mutation: the record said sheet 1 → its answers land on nothing',
    count(wrong.answers) === 0,
  );
}

export async function main(): Promise<number> {
  await ownerRecord();
  console.log(fails ? `\n${fails} FAIL` : '\nall PASS');
  return fails;
}
