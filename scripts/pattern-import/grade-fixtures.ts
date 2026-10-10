// H1c adversarial fixtures for pieces/grade — synthetic sheets run through the WIZARD's path
// (buildChains without a size count → detectSizeRun → expectedSizes(run, card) → fillPieces).
// Each fixture knows the true outline of every size; the rule checked everywhere is the hard one:
// a closed contour that is not the true outline of its size is a failure. Refusals are fine.
//
//   missing-count   graded nest, empty card run, nobody answered → the piece is refused, never one size
//   mixed           a colour-encoded piece beside an unencoded (all black) graded piece
//   short-zone      sizes differ only along a 40 mm tab (below the guard's 150 mm / 20 % heuristic)
//   grid-hatch      graded nest under a sheet grid (thin grey) and same-look hatching inside the piece
//   equal-area      two layouts with equal areas but other regions → ambiguous (pickLayout, pure)
//   fragment-ids    notEvidence on a chain subset looks chains up by id (the <8 mm fragment rule)
//   card-prior      one size + a card of 6: fills as one size (also drawn twice, offset); a nested
//                   same-look line → refused
//   over-maxfree    the bench's robe / kombinezon solved with maxFree 1–2: components beyond the
//                   search are proven irrelevant or the piece is refused — never a wrong contour
import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { fillPiecesDetailed, hausdorffP95 } from 'lib/pattern-import/pieces';
import { GRADE_TUNING } from 'lib/pattern-import/pieces/grade';
import { pickLayout, scoreAreas } from 'lib/pattern-import/pieces/grade/choose';
import { expectedSizes, runForExpected } from 'lib/pattern-import/pieces/grade/expected';
import { notEvidence } from 'lib/pattern-import/pieces/grade/guard';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import { proposeSizeMap } from 'lib/pattern-import/sizes/map';
import type { CardSize, Chain, IRPath, LineClass, PieceFamily, PtMm, Seed, Sheet, Style } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

export type FixtureResult = { name: string; ok: boolean; why: string };

const cardOf = (n: number): CardSize[] =>
  Array.from({ length: n }, (_, r) => ({ sizeId: 100 + r, name: `S${r}`, token: `s${r}`, rank: r }));

type Draw = { pts: PtMm[]; closed?: boolean; style: number };

const STYLES: Style[] = [
  { id: 0, strokeRgb: [0, 0, 0], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
  { id: 1, strokeRgb: [200, 200, 200], widthMm: 0.1, dash: null, layer: null, fill: false, clip: null },
  // five size colours
  { id: 2, strokeRgb: [220, 30, 30], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
  { id: 3, strokeRgb: [30, 160, 30], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
  { id: 4, strokeRgb: [30, 30, 220], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
  { id: 5, strokeRgb: [200, 120, 0], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
  { id: 6, strokeRgb: [150, 0, 150], widthMm: 0.3, dash: null, layer: null, fill: false, clip: null },
];

function sheetOf(draws: Draw[]): Sheet {
  const paths: IRPath[] = draws.map((d, i) => ({
    id: i,
    pts: d.pts,
    closed: !!d.closed,
    style: d.style,
    src: { file: 'fx', page: 0, op: i, sub: 0 },
  }));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of paths)
    for (const q of p.pts) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
  return {
    id: 0,
    poses: [],
    pairs: [],
    bbox: { minX: minX - 20, minY: minY - 20, maxX: maxX + 20, maxY: maxY + 20 },
    missing: [],
    paths,
    texts: [],
    rasters: [],
    styles: STYLES,
    warnings: [],
  };
}

/**
 * A graded piece: the left edge (x = ox) is common (a fold, drawn once, long enough for every
 * size); size s is the open polyline bottom → right → top, growing d mm per size to the right and
 * e mm per size up and down. Truth of size s: the closed rectangle.
 */
function gradedPiece(ox: number, oy: number, n: number, style: (s: number) => number, W = 240, H = 300, d = 6, e = 5) {
  const draws: Draw[] = [{ pts: [{ x: ox, y: oy - n * e - 5 }, { x: ox, y: oy + H + n * e + 5 }], style: 0 }];
  const truth: PtMm[][] = [];
  for (let s = 0; s < n; s++) {
    const x1 = ox + W + s * d;
    const y0 = oy - s * e;
    const y1 = oy + H + s * e;
    draws.push({ pts: [{ x: ox, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: ox, y: y1 }], style: style(s) });
    truth.push([{ x: ox, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: ox, y: y1 }]);
  }
  return { draws, truth, seed: { x: ox + W / 2, y: oy + H / 2 } };
}

function run(draws: Draw[], seeds: PtMm[], cardN: number) {
  const sheet = sheetOf(draws);
  const { set } = buildChainsDetailed(
    sheet,
    { joinGapMm: PATIMPORT.joinGapMm, joinAngleDeg: PATIMPORT.joinAngleDeg, joinLateralMm: PATIMPORT.joinLateralMm },
    { extraTexts: [] },
  );
  const read = detectSizeRun(sheet, set, [{ id: 'fx', name: 'fixture.pdf', kind: 'pdf', pages: 1, bytes: 0 } as never]);
  const expected = expectedSizes(read, cardOf(cardN), null, set) ?? undefined;
  const sizeRun = runForExpected(read, expected ?? null);
  const sd: Seed[] = seeds.map((at, i) => ({ id: i, at, origin: 'click', variant: null }));
  const { families, diag } = fillPiecesDetailed(sheet, set, sizeRun, sd, {
    cellMm: PATIMPORT.fillCellMm,
    snapMm: PATIMPORT.snapMm,
    variant: null,
    ...(expected ? { expectedSizes: expected } : {}),
  });
  return { families, diag, run: sizeRun, expected };
}

/** Closed contours that are not the true outline of their size (truth[seed][rank]). */
function wrongOf(families: PieceFamily[], truth: (PtMm[] | null)[][]): string[] {
  const out: string[] = [];
  for (const f of families)
    for (const c of f.candidates) {
      if (c.outcome !== 'closed') continue;
      const t = truth[f.seed]?.[c.rank];
      if (!t || hausdorffP95(c.outer, t) > 1.0) out.push(`seed ${f.seed} r${c.rank}`);
    }
  return out;
}

const tally = (families: PieceFamily[]) =>
  families
    .map((f) => `${f.seed}:${f.candidates.map((c) => (c.outcome === 'closed' ? 'C' : c.outcome === 'refused' ? 'r' : c.outcome[0])).join('')}`)
    .join(' ');

function missingCount(): FixtureResult {
  const p = gradedPiece(0, 0, 5, () => 0);
  const { families } = run(p.draws, [p.seed], 0);
  const wrong = wrongOf(families, [p.truth]);
  const closedAny = families.some((f) => f.candidates.some((c) => c.outcome === 'closed'));
  const refusedCount = families.some((f) => f.candidates.some((c) => c.gradeRefusal === 'size-count'));
  return {
    name: 'missing-count',
    ok: !wrong.length && !closedAny && refusedCount,
    why: `${tally(families)}${wrong.length ? ` wrong ${wrong.join(', ')}` : ''}${refusedCount ? '' : ' (no size-count refusal)'}`,
  };
}

function mixed(): FixtureResult {
  const a = gradedPiece(0, 0, 5, (s) => 2 + s);
  const b = gradedPiece(600, 0, 5, () => 0);
  const { families, run: r } = run([...a.draws, ...b.draws], [a.seed, b.seed], 5);
  // what reaches the card: a source rank the size map ties to a card size. A GUESSED tie (no label
  // matched, confidence < 0.9) stops the wizard on the sizes step for the operator to confirm
  const map = proposeSizeMap(r, cardOf(5));
  const sure = new Map(map.entries.filter((e) => e.card && (e.confidence ?? 1) >= 0.9).map((e) => [e.source.rank, e.card!.rank]));
  const guessed = map.entries.filter((e) => e.card && (e.confidence ?? 1) < 0.9).length;
  const truthByCard = [a.truth, b.truth].map((t) => Array.from({ length: r.sizes.length }, (_, rank) => (sure.has(rank) ? t[sure.get(rank)!] ?? null : null)));
  const exported = families.map((f) => ({ ...f, candidates: f.candidates.filter((c) => sure.has(c.rank)) }));
  const wrong = wrongOf(exported, truthByCard);
  return {
    name: 'mixed',
    // and the unencoded piece never closes as some size
    ok: !wrong.length && !families.find((f) => f.seed === 1)?.candidates.some((c) => c.outcome === 'closed'),
    why: `encoding ${r.encoding} n=${r.sizes.length}, size map: ${sure.size} sure, ${guessed} guessed (operator confirms); ${tally(families)}${wrong.length ? ` wrong ${wrong.join(', ')}` : ''}`,
  };
}

function shortZone(): FixtureResult {
  // a 300 × 200 rectangle drawn once; on the right edge a 40 mm tab per size, fanning out
  const n = 5;
  const W = 300;
  const H = 200;
  const draws: Draw[] = [
    { pts: [{ x: W, y: 120 }, { x: W, y: H }, { x: 0, y: H }, { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: 80 }], style: 0 },
  ];
  const truth: PtMm[][] = [];
  for (let s = 0; s < n; s++) {
    const tip = { x: W + 8 + 3 * s, y: 100 };
    draws.push({ pts: [{ x: W, y: 80 }, tip, { x: W, y: 120 }], style: 0 });
    truth.push([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: 80 }, tip, { x: W, y: 120 }, { x: W, y: H }, { x: 0, y: H }]);
  }
  const { families } = run(draws, [{ x: 150, y: 100 }], n);
  const wrong = wrongOf(families, [truth]);
  return { name: 'short-zone', ok: !wrong.length, why: `${tally(families)}${wrong.length ? ` wrong ${wrong.join(', ')}` : ''}` };
}

function gridHatch(): FixtureResult {
  const p = gradedPiece(0, 0, 5, () => 0);
  const draws = [...p.draws];
  // sheet grid every 10 mm, thin grey
  for (let x = -60; x <= 360; x += 10) draws.push({ pts: [{ x, y: -60 }, { x, y: 380 }], style: 1 });
  for (let y = -60; y <= 380; y += 10) draws.push({ pts: [{ x: -60, y }, { x: 360, y }], style: 1 });
  // hatching inside the piece in the SAME look as the size lines (black 0.3), 45°, every 8 mm
  for (let k = 8; k <= 200; k += 8) draws.push({ pts: [{ x: 20 + k, y: 20 }, { x: 20, y: 20 + k }], style: 0 });
  const { families } = run(draws, [p.seed], 5);
  const wrong = wrongOf(families, [p.truth]);
  return { name: 'grid-hatch', ok: !wrong.length, why: `${tally(families)}${wrong.length ? ` wrong ${wrong.join(', ')}` : ''}` };
}

function equalArea(): FixtureResult {
  const n = 3;
  const areas = [100, 110, 120];
  const a = scoreAreas([0], areas, n, [11, 12, 13]);
  const b = scoreAreas([1], areas, n, [11, 22, 13]); // same areas, another region at rank 1
  const c = scoreAreas([1], areas, n, [11, 12, 13]); // the same layout reached by another bit
  const two = pickLayout([a, b], n);
  const one = pickLayout([a, c], n);
  const ok = two.ambiguous && !one.ambiguous;
  return { name: 'equal-area', ok, why: `equal areas, other region → ambiguous ${two.ambiguous}; same region → ambiguous ${one.ambiguous}` };
}

/**
 * The card's size run is a weak prior. A one-size piece (cut line + a stitch line of another look,
 * no size label) with a card of 6 sizes fills as one size; so does the same piece drawn twice with a
 * few mm registration offset (a tiled sheet, blazer). The same piece with a nested SAME-look line
 * (two sizes nobody encoded) is refused.
 */
function cardPrior(): FixtureResult {
  // a 5-sided piece (not a rectangle: the registration copy must be a curved line)
  const piece = (dx: number, dy: number, inset = 0): PtMm[] => [
    { x: dx + inset, y: dy + inset },
    { x: dx + 300 - inset, y: dy + inset },
    { x: dx + 340 - inset, y: dy + 120 },
    { x: dx + 300 - inset, y: dy + 240 - inset },
    { x: dx + inset, y: dy + 240 - inset },
    { x: dx + inset, y: dy + inset },
  ];
  const seed = { x: 150, y: 120 };
  const cases: { name: string; draws: Draw[]; refuse: boolean }[] = [
    { name: 'one size', draws: [{ pts: piece(0, 0), style: 0 }, { pts: piece(0, 0, 10), style: 2 }], refuse: false },
    {
      name: 'registration copy',
      draws: [{ pts: piece(0, 0), style: 0 }, { pts: piece(3, -2), style: 0 }, { pts: piece(0, 0, 10), style: 2 }],
      refuse: false,
    },
    { name: 'nested same look', draws: [{ pts: piece(0, 0), style: 0 }, { pts: piece(0, 0, 8), style: 0 }], refuse: true },
  ];
  const notes: string[] = [];
  let ok = true;
  for (const k of cases) {
    const { families } = run(k.draws, [seed], 6);
    const cs = families.flatMap((f) => f.candidates);
    const refused = cs.some((c) => c.outcome === 'refused');
    const closed = cs.some((c) => c.outcome === 'closed');
    const good = k.refuse ? refused && !closed : !refused && closed;
    if (!good) ok = false;
    notes.push(`${k.name} ${tally(families)}${good ? '' : ' ✗'}`);
  }
  return { name: 'card-prior', ok, why: notes.join(' · ') };
}

/**
 * notEvidence on a SUBSET of the chains (the guard passes the lines of one region): an F3 fragment
 * (< 8 mm, automatic 'ignore') stays evidence and a long ignored line does not, looked up by id —
 * never by the chain's position in the subset.
 */
function fragmentIds(): FixtureResult {
  const chain = (id: number, len: number): Chain => ({
    id,
    pts: [{ x: 0, y: id }, { x: len, y: id }],
    closed: false,
    ranges: [],
    motif: null,
    style: 0,
    lengthMm: len,
  });
  const subset = [chain(7, 3), chain(0, 500)];
  const cls: LineClass = { id: 0, role: 'ignore', sizeLabel: null, chains: [0, 7], totalLengthMm: 503, evidence: [], confidence: 0.8 };
  const out = notEvidence([cls], subset);
  const ok = out.has(0) && !out.has(7);
  return { name: 'fragment-ids', ok, why: `not evidence: [${[...out].join(',')}] (expected [0]: the 500 mm line, not the 3 mm fragment)` };
}

export function runFixtures(benchOverMaxFree?: () => { name: string; wrong: string[]; note: string }[]): FixtureResult[] {
  const out: FixtureResult[] = [missingCount(), mixed(), shortZone(), gridHatch(), equalArea(), cardPrior(), fragmentIds()];
  if (benchOverMaxFree) {
    const keep = GRADE_TUNING.maxFree;
    try {
      for (const mf of [1, 2]) {
        GRADE_TUNING.maxFree = mf;
        for (const r of benchOverMaxFree())
          out.push({ name: `over-maxfree ${r.name} maxFree=${mf}`, ok: !r.wrong.length, why: `${r.note}${r.wrong.length ? ` wrong ${r.wrong.join(' ')}` : ''}` });
      }
    } finally {
      GRADE_TUNING.maxFree = keep;
    }
  }
  return out;
}
