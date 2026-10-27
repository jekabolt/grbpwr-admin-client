// CARD 83 «semaphore shirt» (beta, 27.10) — its twelve pieces as the app reads them from the card's
// DXF (card83-real.json: seam outline, notches, inner lines; mm, y up), and its full step list.
// A regression fixture for the step model and the step picture: real seams (a collar's neck edge
// against a neckline with a box pleat and front folds, two sleeves on their own armholes, a sleeve
// closed on itself), no stored seams.

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
import real from './card83-real.json';
import type { FormOpLike } from './step-seams-model';

type RealPiece = { poly: number[][]; notches: number[][]; lines: number[][][] };
const PIECES: Record<string, RealPiece> = real.pieces;
/** The card's piece facts as the skeleton source read them on beta (no interlining usage: nothing fused). */
const FUSED: ReadonlySet<string> = new Set(real.fused);
const PER_GARMENT: Record<string, number> = real.piecesPerGarment;
const SYMMETRY: Record<string, string> = real.cutSymmetry;

const TYPE = 'TECH_CARD_OPERATION_TYPE_';

export type Card83Op = FormOpLike & { operationType: string; work: string; outputUnitName: string };

const op = (
  operationNumber: number,
  type: string,
  work: string,
  inputKeys: string[],
  outputUnitKey = '',
): Card83Op => ({
  operationNumber,
  operationType: `${TYPE}${type.toUpperCase()}`,
  work,
  inputKeys,
  outputUnitKey,
  outputUnitName: outputUnitKey,
});

/** Every step of the card, as the form holds it (unit keys are the unit names here). */
export const CARD83_OPS: Card83Op[] = [
  op(10, 'fusing', '', ['CLR_1']),
  op(20, 'press', 'press_to_one_side', ['CLR_1']),
  op(30, 'fusing', '', ['CLR']),
  op(40, 'press', 'press_to_one_side', ['CLR']),
  op(50, 'machine', 'join_lockstitch', ['CLR_1', 'CLR'], 'Collar'),
  op(60, 'press', 'press_flat', ['Collar']),
  op(70, 'machine', 'topstitch', ['Collar']),
  op(80, 'fusing', '', ['FL']),
  op(90, 'press', 'press_to_one_side', ['FL']),
  op(100, 'fusing', '', ['PLCK']),
  op(110, 'press', 'press_to_one_side', ['PLCK']),
  op(120, 'machine', 'buttonhole', ['PLCK']),
  op(130, 'machine', 'join_lockstitch', ['PLCK', 'FL'], 'left panel with placket'),
  op(140, 'press', 'press_flat', ['BP']),
  op(150, 'fusing', '', ['FR']),
  op(160, 'press', 'press_flat', ['FR']),
  op(170, 'machine', 'topstitch', ['FR']),
  op(180, 'machine', 'join_lockstitch', ['BP']),
  op(190, 'machine', 'button_attach', ['FR']),
  op(
    200,
    'machine',
    'join_lockstitch',
    ['FR', 'left panel with placket', 'BP'],
    'back panel with front',
  ),
  op(210, 'fusing', '', ['SLV_M_R']),
  op(220, 'fusing', '', ['SLV_M_R_1']),
  op(230, 'machine', 'join_lockstitch', ['SLV_M_R', 'SLV_M_R_1'], 'right sleeve cuff'),
  op(240, 'press', 'press_flat', ['right sleeve cuff']),
  op(250, 'machine', 'topstitch', ['right sleeve cuff']),
  op(260, 'machine', 'join_lockstitch', ['SLV_R']),
  op(270, 'press_open', 'press_open', ['SLV_R']),
  op(280, 'machine', 'join_lockstitch', ['SLV_R', 'right sleeve cuff'], 'right sleeve'),
  op(290, 'fusing', '', ['SLV_M_L']),
  op(300, 'fusing', '', ['SLV_M_L_1']),
  op(310, 'machine', 'join_lockstitch', ['SLV_M_L', 'SLV_M_L_1'], 'left sleeve cuff'),
  op(320, 'press', 'press_flat', ['left sleeve cuff']),
  op(330, 'machine', 'topstitch', ['left sleeve cuff']),
  op(340, 'machine', 'join_lockstitch', ['SLV_L']),
  op(350, 'press_open', 'press_open', ['SLV_L']),
  op(360, 'machine', 'join_lockstitch', ['SLV_L', 'left sleeve cuff'], 'left sleeve'),
  op(
    370,
    'machine',
    'join_lockstitch',
    ['back panel with front', 'right sleeve', 'left sleeve'],
    'Base',
  ),
  op(380, 'press_open', 'press_open', ['Base']),
  op(390, 'machine', 'attach_label', ['Base']),
  op(400, 'machine', 'join_lockstitch', ['Collar', 'Base'], 'shirt regular'),
  op(410, 'press', 'press_flat', ['shirt regular']),
  op(420, 'machine', 'topstitch', ['shirt regular']),
  op(430, 'press', 'press_final', ['shirt regular']),
  op(440, 'machine', 'buttonhole', ['shirt regular']),
  op(450, 'machine', 'button_attach', ['shirt regular']),
];

export const CARD83_PIECE_KEYS: ReadonlySet<string> = new Set(Object.keys(PIECES));

/** Step index in CARD83_OPS by operation number. */
export const card83Step = (opNumber: number) =>
  CARD83_OPS.findIndex((o) => o.operationNumber === opNumber);

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
    source: 'card83',
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

export function card83Facts(): SkeletonFacts {
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
    bom: { zipper: 0, buttons: 8, snaps: 0, tape: 0, elastic: 0, drawcord: 0, interlining: 1 },
    defaultMachineType: null,
  };
}

/** The pieces' segmentation, as the picker's geometry hook hands it over. */
export function card83Geoms(): Map<string, PieceGeom> {
  // As the live geometry: segmented, then twinned (identical cuff halves, mirrored sleeves).
  return new Map(twins(card83Facts().pieces.map(segmentPiece)).map((g) => [g.pieceKey, g]));
}

/** Each piece's inner lines (hem folds, pleat lines, button marks), mm, y up. */
export function card83InnerLines(): Map<string, Pt2[][]> {
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
export function card83Graph(): SeamGraph {
  const facts = card83Facts();
  return readSeamGraph(
    facts,
    undefined,
    {},
    undefined,
    undefined,
    seamAssignmentInputOf(CARD83_OPS as never, CARD83_PIECE_KEYS),
  );
}
