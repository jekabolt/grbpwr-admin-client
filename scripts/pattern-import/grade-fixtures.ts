// H1c adversarial fixtures for pieces/grade — synthetic sheets run through the WIZARD's path
// (buildChains without a size count → detectSizeRun → expectedSizes(run, card) → fillPieces).
// Each fixture knows the true outline of every size; the rule checked everywhere is the hard one:
// a closed contour that is not the true outline of its size is a failure. Refusals are fine.
//
//   missing-count   graded nest, empty card run, nobody answered → the piece is refused, never one size
//   mixed           a colour-encoded piece beside an unencoded (all black) graded piece
//   region-check    the hook's final check is region-based: an equal-area other shape is refused,
//                   and so is a contour wrong by the same strip in every rank (10 mm, 2.5 mm) or by
//                   a 10 mm tab over 10 % of it, or a rank on its neighbour's line along 20 % (a
//                   1.5 mm inset is the documented residual)
//   mixed-solve     D4: a mixed sheet's uncovered graded piece solved with the encoding's n (as
//                   common lines, and as orphans — H1c-5)
//   mixed-guard     the mixed-sheet guard: an unencoded two-size piece and a 40 mm tab nest are seen
//                   by the pair rule (the wide rule misses them); a uniform cut + sew pair is not
//   short-zone      sizes differ only along a 40 mm tab (below the guard's 150 mm / 20 % heuristic)
//   grid-hatch      graded nest under a sheet grid (thin grey) and same-look hatching inside the piece
//   equal-area      two layouts with equal areas but other regions → ambiguous (pickLayout, pure)
//   fragment-ids    notEvidence on a chain subset looks chains up by id (the <8 mm fragment rule)
//   count-required  a sheet that does not encode its sizes needs the operator's count: unanswered
//                   → every piece refused; answered 1 → one size (also drawn twice, offset); a
//                   wrong answer, a nested same-look line or a graded cuff → refused
//                   a card and asks with one; a nested same-look line and a cuff graded by a few mm
//                   → refused
//   over-maxfree    the bench's robe / kombinezon solved with maxFree 1–2: components beyond the
//                   search are proven irrelevant or the piece is refused — never a wrong contour
import { buildChainsDetailed } from 'lib/pattern-import/chains/build';
import { fillPiecesDetailed, hausdorffP95 } from 'lib/pattern-import/pieces';
import { GRADE_TUNING } from 'lib/pattern-import/pieces/grade';
import { pickLayout, scoreAreas } from 'lib/pattern-import/pieces/grade/choose';
import { expectedSizes, runForExpected } from 'lib/pattern-import/pieces/grade/expected';
import { gradingEvidence, notEvidence } from 'lib/pattern-import/pieces/grade/guard';
import { gradeHook, mixedGuard, PAIR_GUARD } from 'lib/pattern-import/pieces/grade/hook';
import { wallModel } from 'lib/pattern-import/pieces/walls';
import { detectSizeRun } from 'lib/pattern-import/sizes/detect';
import { proposeSizeMap } from 'lib/pattern-import/sizes/map';
import type { CardSize, Chain, IRPath, LineClass, PieceCandidate, PieceFamily, PtMm, Seed, Sheet, Style } from 'lib/pattern-import/types';
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
  // the sizes step's answer (the card's run is never the count): 0 = nobody answered
  const expected = expectedSizes(read, cardN || null, set) ?? undefined;
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

/**
 * D4: a mixed sheet whose encoding states n — a colour-encoded piece beside a piece drawn in black
 * that no size class covers (the black class taken out of the run, as on polupalto). The black
 * piece is solved with the encoding's n: n nested lines → every rank proven and right; 3 lines for
 * 5 sizes → nothing proven, it stays refused as before ('sizes-not-distinguished').
 */
function mixedSolve(): FixtureResult {
  const one = (nb: number, asOrphans = false) => {
    const a = gradedPiece(0, 0, 5, (s) => 2 + s);
    const b = gradedPiece(600, 0, nb, () => 0);
    const sheet = sheetOf([...a.draws, ...b.draws]);
    const { set: set0 } = buildChainsDetailed(
      sheet,
      { joinGapMm: PATIMPORT.joinGapMm, joinAngleDeg: PATIMPORT.joinAngleDeg, joinLateralMm: PATIMPORT.joinLateralMm },
      { extraTexts: [] },
    );
    // the black lines are not a size: every black chain to one common class
    const black = new Set(set0.chains.filter((c) => sheet.styles[c.style]?.strokeRgb?.every((v) => v === 0)).map((c) => c.id));
    const classes = set0.classes
      .map((c) => ({ ...c, chains: c.chains.filter((id) => !black.has(id)) }))
      .filter((c) => c.chains.length);
    // H1c-5: or as orphans (F3 put them in no class)
    if (!asOrphans)
      classes.push({ id: Math.max(...classes.map((c) => c.id)) + 1, role: 'common', sizeLabel: null, chains: [...black], totalLengthMm: 0, evidence: [], confidence: 0.6 });
    const orphans = set0.orphans.filter((id) => !black.has(id));
    const set = { ...set0, classes, orphans: asOrphans ? [...orphans, ...black] : orphans };
    const read = detectSizeRun(sheet, set, [{ id: 'fx', name: 'fixture.pdf', kind: 'pdf', pages: 1, bytes: 0 } as never]);
    const expected = expectedSizes(read, null, set) ?? undefined;
    const sd: Seed[] = [a.seed, b.seed].map((at, i) => ({ id: i, at, origin: 'click', variant: null }));
    const { families } = fillPiecesDetailed(sheet, set, read, sd, {
      cellMm: PATIMPORT.fillCellMm,
      snapMm: PATIMPORT.snapMm,
      variant: null,
      ...(expected ? { expectedSizes: expected } : {}),
    });
    const wrong = wrongOf(families, [a.truth, b.truth]);
    const bOut = families.find((f) => f.seed === 1)?.candidates ?? [];
    return { families, wrong, read, bOut };
  };
  const five = one(5);
  const three = one(3);
  const orphan5 = one(5, true);
  const orphan3 = one(3, true);
  const ok =
    !orphan5.wrong.length &&
    !orphan3.wrong.length &&
    orphan5.bOut.every((c) => c.outcome === 'closed') &&
    orphan3.bOut.every((c) => c.outcome === 'refused') &&
    five.read.sizes.length === 5 &&
    !five.wrong.length &&
    !three.wrong.length &&
    five.bOut.length === 5 &&
    five.bOut.every((c) => c.outcome === 'closed') &&
    three.bOut.every((c) => c.outcome === 'refused' && c.gradeRefusal === 'sizes-not-distinguished');
  return {
    name: 'mixed-solve',
    ok,
    why: `encoding ${five.read.encoding} n=${five.read.sizes.length}: black piece with 5 lines ${tally(five.families)}; with 3 lines ${tally(three.families)}; drawn as orphans (H1c-5) ${tally(orphan5.families)} / ${tally(orphan3.families)}${[...five.wrong, ...three.wrong, ...orphan5.wrong, ...orphan3.wrong].length ? ` wrong ${[...five.wrong, ...three.wrong, ...orphan5.wrong, ...orphan3.wrong].join(', ')}` : ''}`,
  };
}

/**
 * The mixed-sheet guard on lines no size class covers (gradingEvidence, the hook's two rules): the
 * wide rule (≥ min(n, 5) lanes over a third of the lines) misses an unencoded piece that draws TWO
 * sizes (graded unevenly: 10 mm at the side, 3 mm at top and bottom) and one whose five sizes differ
 * only along a 40 mm tab; the pair rule sees both. A cut line with its sew line drawn alike at a
 * uniform 10 mm is no nest for either.
 */
function mixedNarrow(): FixtureResult {
  let id = 0;
  const chain = (pts: PtMm[], closed = false): Chain => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (closed) L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
    return { id: id++, pts, closed, ranges: [], motif: null, style: 0, lengthMm: L };
  };
  const two = gradedPiece(0, 0, 2, () => 0, 240, 300, 10, 3).draws.map((d) => chain(d.pts));
  const W = 300;
  const tab = [chain([{ x: W, y: 120 }, { x: W, y: 200 }, { x: 0, y: 200 }, { x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: 80 }])];
  for (let k = 0; k < 5; k++) tab.push(chain([{ x: W, y: 80 }, { x: W + 8 + 3 * k, y: 100 }, { x: W, y: 120 }]));
  const rect = (i: number) => [{ x: i, y: i }, { x: 300 - i, y: i }, { x: 300 - i, y: 200 - i }, { x: i, y: 200 - i }];
  const sew = [chain(rect(0), true), chain(rect(10), true)];
  const cases = [
    { name: 'two sizes', chains: two, wide: false, pair: true },
    { name: 'tab', chains: tab, wide: false, pair: true },
    { name: 'cut + sew line', chains: sew, wide: false, pair: false },
  ];
  let ok = true;
  const notes = cases.map((k) => {
    const w = gradingEvidence(k.chains, [], mixedGuard(5)).graded;
    const p = gradingEvidence(k.chains, [], PAIR_GUARD).graded;
    const good = w === k.wide && p === k.pair;
    if (!good) ok = false;
    return `${k.name}: wide ${w} pair ${p}${good ? '' : ' ✗'}`;
  });
  return { name: 'mixed-guard', ok, why: notes.join(' · ') };
}

/**
 * The hook's last check, F4's contour against the solver's region: a graded piece is solved, then
 * handed contours = the true outlines (kept), and again with rank 2 swapped for a rectangle of the
 * SAME area but another shape (refused — equal areas are not the same region).
 */
function regionCheck(): FixtureResult {
  const n = 5;
  const p = gradedPiece(0, 0, n, () => 0);
  const sheet = sheetOf(p.draws);
  const { set } = buildChainsDetailed(
    sheet,
    { joinGapMm: PATIMPORT.joinGapMm, joinAngleDeg: PATIMPORT.joinAngleDeg, joinLateralMm: PATIMPORT.joinLateralMm },
    { extraTexts: [] },
  );
  const read = detectSizeRun(sheet, set, [{ id: 'fx', name: 'fixture.pdf', kind: 'pdf', pages: 1, bytes: 0 } as never]);
  const expected = expectedSizes(read, n, set) ?? undefined;
  const sizeRun = runForExpected(read, expected ?? null);
  const seeds: Seed[] = [{ id: 0, at: p.seed, origin: 'click', variant: null }];
  const hook = gradeHook(sheet, set, sizeRun, seeds, wallModel(set, sizeRun, sheet.texts), {
    cellMm: PATIMPORT.fillCellMm,
    snapMm: PATIMPORT.snapMm,
    variant: null,
    ...(expected ? { expectedSizes: expected } : {}),
  });
  const area = (q: PtMm[]) => Math.abs(q.reduce((a, v, i) => a + v.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * v.y, 0) / 2);
  const cand = (r: number, outer: PtMm[]): PieceCandidate => ({
    seed: 0,
    rank: r,
    outer,
    walls: [],
    inside: [],
    textsInside: [],
    outcome: 'closed',
    areaMm2: area(outer),
    bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    sourceCoverage: 1,
    p95Mm: 0,
  });
  if (!hook) return { name: 'region-check', ok: false, why: 'no hook' };
  const pass = (swap: boolean) => {
    const list = p.truth.map((t, r) => {
      if (!swap || r !== 2) return cand(r, t);
      // the same area, 15 % wider and 1/1.15 as tall, about the same centre
      const xs = t.map((q) => q.x);
      const ys = t.map((q) => q.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      return cand(r, t.map((q) => ({ x: cx + (q.x - cx) * 1.15, y: cy + (q.y - cy) / 1.15 })));
    });
    const cands = new Map<number, PieceCandidate[]>([[0, list]]);
    hook.finish(cands);
    return cands.get(0)!.map((c) => (c.outcome === 'closed' ? 'C' : c.outcome === 'refused' ? 'r' : c.outcome[0])).join('');
  };
  // every rank wrong by the same strip (a sew line taken for the cut line): no rank moves off the
  // piece's median, only the absolute bound sees it — 10 mm, and 2.5 mm (under the area rules)
  const strip = (d: number) => {
    const list = p.truth.map((t, r) => {
      const xs = t.map((q) => q.x);
      const ys = t.map((q) => q.y);
      const [x0, x1, y0, y1] = [Math.min(...xs) + d, Math.max(...xs) - d, Math.min(...ys) + d, Math.max(...ys) - d];
      return cand(r, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
    });
    const cands = new Map<number, PieceCandidate[]>([[0, list]]);
    hook.finish(cands);
    return cands.get(0)!.map((c) => (c.outcome === 'closed' ? 'C' : c.outcome === 'refused' ? 'r' : c.outcome[0])).join('');
  };
  // every rank with a 10 mm tab over 10 % of its outline (the neighbour size's line taken there):
  // under the strip and area bounds, only the boundary deviation (Hausdorff) sees it
  const tab = () => {
    const list = p.truth.map((t, r) => {
      const xs = t.map((q) => q.x);
      const ys = t.map((q) => q.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const run = 0.1 * 2 * (x1 - x0 + (y1 - y0));
      const ym = (y0 + y1 - run) / 2;
      return cand(r, [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: ym },
        { x: x1 + 10, y: ym },
        { x: x1 + 10, y: ym + run },
        { x: x1, y: ym + run },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ]);
    });
    const cands = new Map<number, PieceCandidate[]>([[0, list]]);
    hook.finish(cands);
    return cands.get(0)!.map((c) => (c.outcome === 'closed' ? 'C' : c.outcome === 'refused' ? 'r' : c.outcome[0])).join('');
  };
  // rank 2 follows rank 3's line (6 mm out) along 20 % of its outline
  const follow = () => {
    const list = p.truth.map((t, r) => {
      if (r !== 2) return cand(r, t);
      const xs = t.map((q) => q.x);
      const ys = t.map((q) => q.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const nx = Math.max(...p.truth[3].map((q) => q.x));
      const run = 0.2 * 2 * (x1 - x0 + (y1 - y0));
      const ym = (y0 + y1 - run) / 2;
      return cand(r, [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: ym },
        { x: nx, y: ym },
        { x: nx, y: ym + run },
        { x: x1, y: ym + run },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ]);
    });
    const cands = new Map<number, PieceCandidate[]>([[0, list]]);
    hook.finish(cands);
    return cands
      .get(0)!
      .map((c) => (c.outcome === 'closed' ? 'C' : c.outcome === 'refused' ? 'r' : c.outcome[0]))
      .join('');
  };
  const kept = pass(false);
  const swapped = pass(true);
  const f20 = follow();
  const s10 = strip(10);
  const s25 = strip(2.5);
  const t10 = tab();
  // the accepted residual (hook.ts GRADE_HAUS_MAX_MM): a 1.5 mm all-round inset need not be caught
  // (informational: here the boundary bound happens to catch it)
  const s15 = strip(1.5);
  return {
    name: 'region-check',
    ok: kept === 'CCCCC' && swapped[2] === 'r' && s10 === 'rrrrr' && s25 === 'rrrrr' && t10 === 'rrrrr' && f20[2] === 'r',
    why: `true outlines ${kept}; rank 2 swapped for an equal-area other shape ${swapped}; every rank 10 mm in ${s10}, 2.5 mm in ${s25}; a 10 mm tab on 10 % of every outline ${t10}; rank 2 on rank 3's line along 20 % ${f20}; 1.5 mm in (residual, not required) ${s15}`,
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
 * The count is required (H1c-4): a one-size piece (cut line + a stitch line of another look, no size
 * label) is refused until the operator answers; answered 1 it fills as one size, and so does the
 * same piece drawn twice with a few mm registration offset (a tiled sheet, blazer). A wrong answer
 * (6), a nested SAME-look line or a cuff graded by a few mm stays refused.
 */
function countRequired(): FixtureResult {
  // a 5-sided piece (not a rectangle: the registration copy must be a curved line)
  const piece = (dx: number, dy: number): PtMm[] => [
    { x: dx, y: dy },
    { x: dx + 300, y: dy },
    { x: dx + 340, y: dy + 120 },
    { x: dx + 300, y: dy + 240 },
    { x: dx, y: dy + 240 },
  ];
  const closedPts = (q: PtMm[]) => [...q, q[0]];
  // the sew line: the outline offset 10 mm inward, edge by edge (a true allowance)
  const inset = (q: PtMm[], d: number): PtMm[] => {
    const n = q.length;
    const area2 = q.reduce((acc, v, i) => acc + v.x * q[(i + 1) % n].y - q[(i + 1) % n].x * v.y, 0);
    const sgn = area2 > 0 ? 1 : -1;
    const lines = q.map((a, i) => {
      const b = q[(i + 1) % n];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const nx = (sgn * -(b.y - a.y)) / L;
      const ny = (sgn * (b.x - a.x)) / L;
      return { a: { x: a.x + nx * d, y: a.y + ny * d }, b: { x: b.x + nx * d, y: b.y + ny * d } };
    });
    return lines.map((l1, i) => {
      const l0 = lines[(i + n - 1) % n];
      const d1 = { x: l0.b.x - l0.a.x, y: l0.b.y - l0.a.y };
      const d2 = { x: l1.b.x - l1.a.x, y: l1.b.y - l1.a.y };
      const den = d1.x * d2.y - d1.y * d2.x;
      const t = ((l1.a.x - l0.a.x) * d2.y - (l1.a.y - l0.a.y) * d2.x) / den;
      return { x: l0.a.x + d1.x * t, y: l0.a.y + d1.y * t };
    });
  };
  const base = piece(0, 0);
  const cut: Draw = { pts: closedPts(base), style: 0 };
  const sew: Draw = { pts: closedPts(inset(base, 10)), style: 2 };
  const copy: Draw = { pts: closedPts(piece(3, -2)), style: 0 };
  // a cuff graded +4 mm in length and +2 mm in width per size, three sizes, about one corner
  const cuff: Draw[] = [0, 1, 2].map((k) => ({
    pts: closedPts([
      { x: 0, y: 0 },
      { x: 250 + 4 * k, y: 0 },
      { x: 250 + 4 * k, y: 80 + 2 * k },
      { x: 0, y: 80 + 2 * k },
    ]),
    style: 0,
  }));
  const seed = { x: 150, y: 120 };
  // `drawn`: the operator's answer on the sizes step (0 = not answered; the card's run is no count)
  const cases: { name: string; draws: Draw[]; drawn: number; at?: PtMm; refuse: boolean }[] = [
    { name: 'one size, not answered', draws: [cut, sew], drawn: 0, refuse: true },
    { name: 'one size, answered 1', draws: [cut, sew], drawn: 1, refuse: false },
    { name: 'one size, answered 6', draws: [cut, sew], drawn: 6, refuse: true },
    { name: 'registration copy, answered 1', draws: [cut, copy, sew], drawn: 1, refuse: false },
    { name: 'nested same look, not answered', draws: [cut, { pts: closedPts(inset(base, 8)), style: 0 }], drawn: 0, refuse: true },
    { name: 'cuff 3 sizes, not answered', draws: cuff, drawn: 0, at: { x: 120, y: 40 }, refuse: true },
    { name: 'cuff 3 sizes, answered 6', draws: cuff, drawn: 6, at: { x: 120, y: 40 }, refuse: true },
  ];
  const notes: string[] = [];
  let ok = true;
  for (const k of cases) {
    const { families } = run(k.draws, [k.at ?? seed], k.drawn);
    const cs = families.flatMap((f) => f.candidates);
    const refused = cs.some((c) => c.outcome === 'refused');
    const closed = cs.some((c) => c.outcome === 'closed');
    const good = k.refuse ? refused && !closed : !refused && closed;
    if (!good) ok = false;
    notes.push(`${k.name} ${tally(families)}${good ? '' : ' ✗'}`);
  }
  return { name: 'count-required', ok, why: notes.join(' · ') };
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
  const out: FixtureResult[] = [missingCount(), mixed(), shortZone(), gridHatch(), equalArea(), countRequired(), fragmentIds(), mixedNarrow(), regionCheck(), mixedSolve()];
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
