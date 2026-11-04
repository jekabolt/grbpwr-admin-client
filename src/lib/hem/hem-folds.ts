// A hem step as a fold of the doll: the step's kind, its allowance and its input decide, whatever the
// piece is called. Each hem run (hem-edge.ts) becomes one inward fold, the crease parallel to the
// run's chord at the whole turned depth; a hem turned twice folds once, at that depth. Computed per
// size from that size's geometry, handed to the solve and never saved. A step that cannot be read
// gives no fold and a line in words, never a guess.

import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import {
  add,
  clampUV,
  clipThrough,
  frameOf,
  inwardSign,
  len,
  mul,
  perp,
  sub,
  toUV,
  unit,
} from 'lib/folds/geom';
import { FOLDS, type DollFold, type StoredFold } from 'lib/folds/types';
import type { StoredSeam } from 'lib/seams/types';

import { foldedEdges, hemEdgeOf, type HemEdgeReason } from './hem-edge';

export const HEM_FOLD = {
  /** The turned depth may vary this much along a curved run, as a share of the depth, at least `minSpreadMm`. */
  maxSpreadShare: 1,
  minSpreadMm: 10,
  /** A run that bends less than this is simply straight: nothing to say. */
  saySpreadMm: 3,
  /** The crease may turn this much of the piece beyond the deepest point of the run. */
  beyondRunMm: 10,
} as const;

export type HemStepLike = {
  operationNumber?: number;
  inputKeys?: readonly string[];
  outputUnitKey?: string;
  seamKeys?: readonly string[];
  foldKeys?: readonly string[];
  work?: string;
  seamKind?: string;
  seamClass?: string;
  seamAllowanceMm?: string | number | null;
};

const HEM_WORKS = new Set(['hem_turned', 'moscow_hem']);

/**
 * The signs disagree on real data, so any one of them makes the step a hem. One exception: a serged
 * edge carries the raw-hem class on real cards, yet nothing is turned, so the class alone is not
 * enough there. A raw-edge hem is still a turned hem, only the serging work rules it out.
 */
export function isHemStep(op: HemStepLike): boolean {
  const work = (op.work ?? '').trim();
  return (
    HEM_WORKS.has(work) ||
    /hem/i.test(op.seamKind ?? '') ||
    (work !== 'overlock_serge' && /(^|_)ef_hem_/i.test(op.seamClass ?? ''))
  );
}

/** '' and absent are empty; `0` is a real value. */
function mmOf(value: string | number | null | undefined): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const mm = Number(raw);
  return Number.isFinite(mm) && mm >= 0 ? mm : null;
}

/** The depth of a step: its own allowance, empty inherits the card standard, else none. */
export const hemDepthOf = (
  op: HemStepLike,
  standardMm: string | number | null | undefined,
): number | null => mmOf(op.seamAllowanceMm) ?? mmOf(standardMm);

export type HemFoldApplied = {
  step: number;
  pieceKey: string;
  seq: number;
  depthMm: number;
  /** The run as cut, along its contour. */
  cutLenMm: number;
  /** The crease: the bottom as finished. */
  finishedLenMm: number;
  /** How deep the run's own points lie from the crease: equal on a straight run. */
  turned: [number, number];
};

export type HemFoldsInput = {
  /** Every step of the card, in order: earlier steps say what a unit is made of. */
  ops: readonly HemStepLike[];
  standardMm?: string | number | null;
  /** Every piece of the card on ONE size. */
  pieces: readonly PieceGeom[];
  seams: readonly StoredSeam[];
  storedFolds: readonly StoredFold[];
  /** The stored folds laid on this size (resolveFolds): an explicit row keeps its own `seq`. */
  laid?: Readonly<Record<string, DollFold[]>>;
  grainDeg?: ReadonlyMap<string, number>;
};

export type HemFolds = {
  /** The laid stored folds with the hems among them, in step order. */
  folds: Record<string, DollFold[]>;
  words: string[];
  applied: HemFoldApplied[];
};

type Run = { pieceKey: string; edges: EdgeId[]; pts: Pt2[]; lenMm: number };

const REASON: Record<HemEdgeReason, string> = {
  'no-input': 'no input piece on this size',
  'no-free-bottom': 'no free edge at the bottom',
  ambiguous: 'more than one edge could be the hem',
};

/** The edges a step's own row names, as runs: one contiguous stretch per piece, or a word why not. */
function runsOfParts(
  targets: readonly string[],
  pieces: readonly PieceGeom[],
): { runs: Run[]; stray: string[] } {
  const ids = new Set(targets.flatMap((target) => edgeIdsOf(target)));
  const runs: Run[] = [];
  const stray: string[] = [];
  for (const piece of pieces) {
    const at = piece.edges.flatMap((edge, index) => (ids.has(edge.id) ? [index] : []));
    if (!at.length) continue;
    const count = piece.edges.length;
    const breaks = at.filter((index) => !at.includes((index - 1 + count) % count));
    if (breaks.length !== 1) {
      stray.push(piece.name || 'a piece');
      continue;
    }
    const walk = at.map((_, step) => piece.edges[(breaks[0] + step) % count]);
    runs.push({
      pieceKey: piece.pieceKey,
      edges: walk.map((edge) => edge.id),
      pts: walk.flatMap((edge, step) => (step ? edge.pts.slice(1) : edge.pts)),
      lenMm: walk.reduce((sum, edge) => sum + edge.lenMm, 0),
    });
  }
  return { runs, stray };
}

type Laid =
  | { fold: Omit<DollFold, 'seq'>; finishedLenMm: number; turned: [number, number] }
  | { refused: string };

/** The straight crease of one run at `depthMm`, or why a straight crease cannot stand for it. */
function foldOfRun(
  piece: PieceGeom,
  run: Run,
  depthMm: number,
  grainDeg: ReadonlyMap<string, number> | undefined,
): Laid {
  const a = run.pts[0];
  const b = run.pts[run.pts.length - 1];
  const along = sub(b, a);
  if (len(along) < FOLDS.minLenMm) return { refused: 'the hem has no length across the piece' };
  const inward = mul(perp(unit(along)), inwardSign(piece, run));
  // From the chord, so the crease meets the run's two ends at exactly the depth: the side seam then
  // finds the crease of its neighbour at the same length, and a curve shows as a varying turned depth.
  const mid = mul(add(a, b), 0.5);
  const line = clipThrough(piece.rs, add(mid, mul(inward, depthMm)), along);
  if (!line) return { refused: `a crease ${depthMm} mm in falls outside the piece` };
  const depthAt = (point: Pt2) =>
    depthMm - ((point[0] - mid[0]) * inward[0] + (point[1] - mid[1]) * inward[1]);
  const depths = run.pts.map(depthAt);
  const turned: [number, number] = [Math.min(...depths), Math.max(...depths)];
  const r1 = (mm: number) => mm.toFixed(1);
  if (turned[0] <= 0)
    return {
      refused: `the hem curves ${r1(depthMm - turned[0])} mm, deeper than the ${depthMm} mm crease`,
    };
  if (turned[1] - turned[0] > Math.max(HEM_FOLD.minSpreadMm, HEM_FOLD.maxSpreadShare * depthMm))
    return {
      refused: `the hem curves, a straight crease would turn ${r1(turned[0])} to ${r1(turned[1])} mm`,
    };
  const beyond = Math.max(...piece.rs.map(depthAt));
  if (beyond > turned[1] + HEM_FOLD.beyondRunMm)
    return {
      refused: `a straight crease would also turn ${r1(beyond)} mm of the piece beyond the hem`,
    };
  const frame = frameOf(piece, grainDeg?.get(piece.pieceKey) ?? 0);
  return {
    fold: {
      a: clampUV(toUV(frame, line[0])),
      b: clampUV(toUV(frame, line[1])),
      // The chord's middle lies on the turned side, `depthMm` off the crease, however the run curves.
      flipAt: clampUV(toUV(frame, mid)),
      kind: 'inward',
    },
    finishedLenMm: len(sub(line[1], line[0])),
    turned,
  };
}

/** Stored rows keep their `seq`; a hem takes a value between them, before the first later step's row. */
function inOrder(
  stored: readonly DollFold[],
  stepOfStored: (seq: number) => number | undefined,
  hems: readonly { index: number; fold: Omit<DollFold, 'seq'>; set: (seq: number) => void }[],
): DollFold[] {
  type Item = { fold: DollFold } | (typeof hems)[number];
  const items: Item[] = stored.map((fold) => ({ fold }));
  for (const hem of hems) {
    const later = items.findIndex((item) => {
      if ('index' in item) return item.index > hem.index;
      const step = stepOfStored(item.fold.seq);
      return step !== undefined && step > hem.index;
    });
    items.splice(later < 0 ? items.length : later, 0, hem);
  }
  const out: DollFold[] = [];
  let before = 0;
  items.forEach((item, at) => {
    if (!('index' in item)) {
      out.push(item.fold);
      before = item.fold.seq;
      return;
    }
    let next = at + 1;
    while (next < items.length && 'index' in items[next]) next++;
    const after = items[next];
    const gap = after && !('index' in after) ? (after.fold.seq - before) / (next - at + 1) : 1;
    const seq = before + gap;
    item.set(seq);
    out.push({ ...item.fold, seq });
    before = seq;
  });
  return out;
}

/** Every hem step of the card as folds on this size. See the head of this file. */
export function hemFoldsOf(input: HemFoldsInput): HemFolds {
  const words: string[] = [];
  const applied: HemFoldApplied[] = [];
  const byKey = new Map(input.pieces.map((piece) => [piece.pieceKey, piece]));
  const known = new Map(input.pieces.map((piece) => [piece.pieceKey.toUpperCase(), piece]));
  const units = new Map<string, string[]>();
  const stepOfFold = new Map<string, number>();
  input.ops.forEach((op, index) =>
    (op.foldKeys ?? []).forEach((key) => {
      if (!stepOfFold.has(key)) stepOfFold.set(key, index);
    }),
  );
  const turnedBy = new Map<EdgeId, number>();
  const hems = new Map<
    string,
    { index: number; fold: Omit<DollFold, 'seq'>; set: (seq: number) => void }[]
  >();

  input.ops.forEach((op, index) => {
    const inputKeys = (op.inputKeys ?? []).flatMap((raw) => {
      const key = raw.trim();
      if (!key) return [];
      return known.has(key.toUpperCase()) ? [key] : units.get(key) ?? [];
    });
    const output = (op.outputUnitKey ?? '').trim();
    const madeBefore = output ? units.get(output) ?? [] : [];
    if (output) units.set(output, [...new Set([...madeBefore, ...inputKeys])]);
    if (!isHemStep(op)) return;

    const step = op.operationNumber ?? index + 1;
    const say = (what: string, piece?: PieceGeom) =>
      words.push(`Hem step ${step}${piece ? `, ${piece.name || 'a piece'}` : ''}: ${what}`);
    const depthMm = hemDepthOf(op, input.standardMm);
    if (depthMm === null) return say('no allowance on the step or the card, not folded');
    if (depthMm === 0) return say('allowance 0 mm, nothing to turn');

    const own = new Set(op.foldKeys ?? []);
    const others = input.storedFolds.filter((row) => !own.has(row.foldKey));
    const asked = {
      pieces: input.pieces,
      inputKeys,
      seams: input.seams,
      ownSeamKeys: op.seamKeys,
      grainDeg: input.grainDeg,
    };
    const edge = hemEdgeOf({ ...asked, folds: others });
    let runs: Run[];
    if (edge.status === 'unknown') {
      // An explicit fold on the bottom is the hem already, not a hem edge nobody can find.
      const bare = edge.reason === 'no-free-bottom' ? hemEdgeOf({ ...asked, folds: [] }) : edge;
      const covered =
        bare.status === 'computed' &&
        bare.runs.every((run) => {
          const piece = byKey.get(run.pieceKey)!;
          const folded = foldedEdges(input.storedFolds, [piece], input.grainDeg);
          return run.edges.some((id) => folded.has(id));
        });
      if (covered && bare.status === 'computed') {
        for (const run of bare.runs)
          say('a stored fold already turns this edge', byKey.get(run.pieceKey));
        return;
      }
      return say(`hem edge unknown, ${REASON[edge.reason]}, not folded`);
    }
    if (edge.status === 'owner') {
      const read = runsOfParts(
        edge.parts.map((part) => part.target),
        input.pieces,
      );
      runs = read.runs;
      if (edge.parts.some((part) => part.range))
        say('its row sews a part of the edge, the crease runs the full width');
      for (const name of read.stray) say(`its row names separate edges of ${name}, not folded`);
      if (!runs.length && !read.stray.length) say('its row names no edge, not folded');
    } else runs = edge.runs;

    for (const run of runs) {
      const piece = byKey.get(run.pieceKey);
      if (!piece) continue;
      const folded = foldedEdges(input.storedFolds, [piece], input.grainDeg);
      if (run.edges.some((id) => folded.has(id))) {
        say('a stored fold already turns this edge', piece);
        continue;
      }
      const earlier = run.edges.map((id) => turnedBy.get(id)).find((at) => at !== undefined);
      if (earlier !== undefined) {
        say(`step ${earlier} already turns this edge`, piece);
        continue;
      }
      const laid = foldOfRun(piece, run, depthMm, input.grainDeg);
      if ('refused' in laid) {
        say(`${laid.refused}, not folded`, piece);
        continue;
      }
      if (laid.turned[1] - laid.turned[0] > HEM_FOLD.saySpreadMm)
        say(
          `the hem curves, the straight crease turns ${laid.turned[0].toFixed(1)} to ${laid.turned[1].toFixed(1)} mm`,
          piece,
        );
      run.edges.forEach((id) => turnedBy.set(id, step));
      const entry: HemFoldApplied = {
        step,
        pieceKey: piece.pieceKey,
        seq: 0,
        depthMm,
        cutLenMm: run.lenMm,
        finishedLenMm: laid.finishedLenMm,
        turned: laid.turned,
      };
      applied.push(entry);
      const list = hems.get(piece.pieceKey) ?? [];
      list.push({ index, fold: laid.fold, set: (seq) => (entry.seq = seq) });
      hems.set(piece.pieceKey, list);
    }
  });

  const folds: Record<string, DollFold[]> = { ...input.laid };
  for (const [pieceKey, list] of hems) {
    const rows = input.storedFolds.filter(
      (row) => row.pieceKey.toUpperCase() === pieceKey.toUpperCase(),
    );
    folds[pieceKey] = inOrder(
      input.laid?.[pieceKey] ?? [],
      (seq) => stepOfFold.get(rows.find((row) => row.seq === seq)?.foldKey ?? ''),
      list,
    );
  }
  return { folds, words, applied };
}

/** What in the card the hems are read from: part of the solve's identity, empty with no hem step. */
export function hemSigOf(ops: readonly HemStepLike[], standardMm?: string | number | null): string {
  if (!ops.some(isHemStep)) return '';
  return JSON.stringify([
    standardMm ?? '',
    ops.map((op) => [
      op.inputKeys,
      op.outputUnitKey,
      op.seamKeys,
      op.foldKeys,
      op.work,
      op.seamKind,
      op.seamClass,
      op.seamAllowanceMm,
    ]),
  ]);
}
