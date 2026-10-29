// CARD 63 «Pants» (beta, 29.10) — its twenty-five pieces as the app reads them from the card's DXF
// (card63-real.json: seam outline, notches, inner lines; mm, y up) and its full step list. A
// regression fixture for hand placement: each back carries a pocket bag (PCK_BACK_1L / 1R,
// identical twins) sewn to its top edge in a step of its own (op 100 left, op 70 right), the backs
// themselves are mirror twins (Back_L / Back_R), and later steps (op 160, op 130) take the bag and
// the back as one unit.

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
import real from './card63-real.json';
import type { FormOpLike } from './step-seams-model';

type RealPiece = { poly: number[][]; notches: number[][]; lines: number[][][] };
const PIECES: Record<string, RealPiece> = real.pieces;
const FUSED: ReadonlySet<string> = new Set(real.fused);
const CLOTH: Record<string, string> = real.cloth;
const PER_GARMENT: Record<string, number> = real.piecesPerGarment;
const SYMMETRY: Record<string, string> = real.cutSymmetry;

export type Card63Op = FormOpLike & { operationType: string; outputUnitName: string };

/** Every step of the card, as the form holds it (unit keys are the unit names here). */
export const CARD63_OPS: Card63Op[] = real.ops.map((o) => ({
  operationNumber: o.operationNumber,
  operationType: o.operationType,
  inputKeys: [...o.inputKeys],
  outputUnitKey: o.outputUnitKey,
  outputUnitName: o.outputUnitName || o.outputUnitKey,
}));

export const CARD63_PIECE_KEYS: ReadonlySet<string> = new Set(Object.keys(PIECES));

/** Step index in CARD63_OPS by operation number. */
export const card63Step = (opNumber: number) =>
  CARD63_OPS.findIndex((o) => o.operationNumber === opNumber);

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
    source: 'card63',
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

export function card63Facts(): SkeletonFacts {
  const pieces: SkeletonPieceInput[] = Object.keys(PIECES).map((key, i) => ({
    pieceKey: key,
    name: key,
    piece: pieceOf(key, i),
    piecesPerGarment: PER_GARMENT[key] ?? 1,
    cutSymmetry: SYMMETRY[key] ?? null,
    cloth: (CLOTH[key] as SkeletonPieceInput['cloth']) ?? null,
    fused: FUSED.has(key),
  }));
  return {
    pieces,
    category: 'bottom',
    bom: { zipper: 0, buttons: 0, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 0 },
    defaultMachineType: null,
  };
}

/** The pieces' segmentation, as the picker's geometry hook hands it over. */
export function card63Geoms(): Map<string, PieceGeom> {
  return new Map(twins(card63Facts().pieces.map(segmentPiece)).map((g) => [g.pieceKey, g]));
}

/** Each piece's inner lines, mm, y up — as the picker's hook reads them. */
export function card63InnerLines(): Map<string, Pt2[][]> {
  return new Map(
    Object.entries(PIECES).map(([key, p]) => [
      key,
      p.lines.map((line) => line.map((q): Pt2 => [q[0], q[1]])),
    ]),
  );
}

/** The card's seam graph with no stored seams, the global assignment over the card's own order. */
export function card63Graph(): SeamGraph {
  const facts = card63Facts();
  return readSeamGraph(
    facts,
    undefined,
    {},
    undefined,
    undefined,
    seamAssignmentInputOf(CARD63_OPS as never, CARD63_PIECE_KEYS),
  );
}
