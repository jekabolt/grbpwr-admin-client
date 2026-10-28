// CARD 58 «load balance» shirt (beta, 28.10) — its twenty-nine outlined pieces as the app reads them
// from the card's DXF (card58-real.json: seam outline, notches, inner lines; mm, y up) and its full
// step list (two pieces of the card have no outline and are left out). A regression fixture for the
// step picture and the step model: collar and stand layers sewn as two single-piece inputs (identical
// twins, opened out along their seam, never drawn on each other), a stand step of three inputs whose
// proposals all have to be laid for every input to hang together, and a front of three same-hand
// panels (FP_L, FP_1_L, FP_2_L) that must be allowed to meet.

import { segmentPiece, twins } from 'lib/assembly-skeleton/geometry';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  PieceGeom,
  Pt2,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { seamAssignmentInputOf } from '../assembly-seams/seam-assignment';
import real from './card58-real.json';
import type { FormOpLike } from './step-seams-model';

type RealPiece = { poly: number[][]; notches: number[][]; lines: number[][][] };
const PIECES: Record<string, RealPiece> = real.pieces;
const FUSED: ReadonlySet<string> = new Set(real.fused);
const PER_GARMENT: Record<string, number> = real.piecesPerGarment;
const SYMMETRY: Record<string, string> = real.cutSymmetry;

export type Card58Op = FormOpLike & { operationType: string; work: string; outputUnitName: string };

/** Every step of the card, as the form holds it (unit keys are the unit names here). */
export const CARD58_OPS: Card58Op[] = real.ops.map((o) => ({
  operationNumber: o.operationNumber,
  operationType: o.operationType,
  work: o.work,
  inputKeys: [...o.inputKeys],
  outputUnitKey: o.outputUnitKey,
  outputUnitName: o.outputUnitName || o.outputUnitKey,
}));

export const CARD58_PIECE_KEYS: ReadonlySet<string> = new Set(Object.keys(PIECES));

/** Step index in CARD58_OPS by operation number. */
export const card58Step = (opNumber: number) =>
  CARD58_OPS.findIndex((o) => o.operationNumber === opNumber);

const cm = (p: number[]) => ({ x: p[0] / 10, y: p[1] / 10 });

function pieceOf(key: string, i: number): PieceDTO {
  const src = PIECES[key];
  const poly = src.poly.map(cm);
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  let area = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  return {
    id: i + 1,
    name: key,
    blockName: key,
    source: 'card58',
    poly,
    inner: [
      ...src.notches.map((p) => ({ layer: '4', closed: false, pts: [cm(p)] })),
      ...src.lines.map((pts) => ({ layer: '8', closed: false, pts: pts.map(cm) })),
    ],
    bboxW: Math.max(...xs) - Math.min(...xs),
    bboxH: Math.max(...ys) - Math.min(...ys),
    areaCm2: Math.abs(area) / 2,
  };
}

export function card58Facts(): SkeletonFacts {
  const pieces: SkeletonPieceInput[] = Object.keys(PIECES).map((key, i) => ({
    pieceKey: key,
    name: key,
    piece: pieceOf(key, i),
    piecesPerGarment: PER_GARMENT[key] ?? 1,
    cutSymmetry: SYMMETRY[key] ?? null,
    cloth: null,
    fused: FUSED.has(key),
  }));
  return {
    pieces,
    category: 'shirt',
    bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
    defaultMachineType: null,
  };
}

/** The pieces' segmentation, as the picker's geometry hook hands it over. */
export function card58Geoms(): Map<string, PieceGeom> {
  return new Map(twins(card58Facts().pieces.map(segmentPiece)).map((g) => [g.pieceKey, g]));
}

/** Each piece's inner lines (placket folds, pocket marks), mm, y up — as the picker's hook reads them. */
export function card58InnerLines(): Map<string, Pt2[][]> {
  return new Map(
    Object.entries(PIECES).map(([key, p]) => [
      key,
      p.lines.map((line) => line.map((q): Pt2 => [q[0], q[1]])),
    ]),
  );
}

/**
 * The card's seam graph as the unit-pictures provider reads it: no stored seams, the global
 * assignment over the card's own order (the mode the app ships with).
 */
export function card58Graph(): SeamGraph {
  const facts = card58Facts();
  return readSeamGraph(
    facts,
    undefined,
    {},
    undefined,
    undefined,
    seamAssignmentInputOf(CARD58_OPS as never, CARD58_PIECE_KEYS),
  );
}
