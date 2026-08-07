// Round-trip / composition probe entry. Bundled by chirality-probe.mjs via esbuild.
// Imports the REAL modules — no restatement of the transform anywhere in here.
import {
  buildMarkerLayout,
  markerToView,
} from '../src/components/managers/tech-card/components/nesting/marker-io';
import {
  placedPoly,
  variantPoly,
  allowedRotations,
  allowsFlip,
} from '../src/lib/nesting/types';
import type {
  NestResult,
  PieceDTO,
  Placement,
  RotationDeg,
  Pt,
  FabricDirection,
} from '../src/lib/nesting/types';

export { placedPoly, variantPoly, allowedRotations, allowsFlip };
export type { Pt, Placement, RotationDeg, FabricDirection };

// A deliberately CHIRAL piece: an L / flag whose mirror image is reachable by no rotation.
// Coordinates are exact at 2 decimals so buildMarkerLayout's r2 rounding is a no-op and the
// round trip can be asserted as EQUALITY rather than as a tolerance.
export const PIECE: PieceDTO = {
  id: 7,
  name: 'полочка',
  blockName: 'FP_L',
  source: 'probe.dxf',
  poly: [
    { x: 0, y: 0 },
    { x: 12.5, y: 0 },
    { x: 12.5, y: 3.25 },
    { x: 4.75, y: 3.25 },
    { x: 4.75, y: 18.5 },
    { x: 0, y: 18.5 },
  ],
  bboxW: 12.5,
  bboxH: 18.5,
  areaCm2: 113.03,
};

export const PLACEMENTS: Placement[] = [
  { pieceId: 7, instance: 0, rot: 90, flipped: true, x: 30.25, y: 11.5 },
  { pieceId: 7, instance: 1, rot: 90, flipped: false, x: 60.5, y: 11.5 },
  { pieceId: 7, instance: 2, rot: 270, flipped: true, x: 90.75, y: 22 },
  { pieceId: 7, instance: 3, rot: 0, flipped: true, x: 120, y: 4.25 },
  { pieceId: 7, instance: 4, rot: 180, flipped: true, x: 150.5, y: 30 },
  { pieceId: 7, instance: 5, rot: 0, flipped: false, x: 180, y: 4.25 },
];

const RESULT: NestResult = {
  placements: PLACEMENTS,
  usedLengthCm: 210.5,
  efficiency: 0.62,
  placedCount: PLACEMENTS.length,
  totalCount: PLACEMENTS.length,
  unplaced: [],
  generation: 12,
  elapsedMs: 3400,
  cancelled: false,
  warnings: [],
};

/** run → blob, exactly as the save path builds it. */
export function build(): unknown {
  return buildMarkerLayout({
    pieces: [PIECE],
    perSetQty: new Map([[7, 6]]),
    urlBySource: new Map([['probe.dxf', 'https://cdn/probe.dxf']]),
    result: RESULT,
    unit: 'cm',
    config: { targetLengthCm: 250, rdpEpsCm: 0.05, timeBudgetMs: 20000 },
    tol: 0.02,
    tolChain: 0.05,
  });
}

/** blob → view model, exactly as opening a stored marker does. */
export function read(layout: unknown) {
  return markerToView({
    summary: {
      id: 1,
      sizeId: 3,
      fabricWidthCm: { value: '140' },
      usedLengthCm: { value: '210.5' },
      efficiencyPct: { value: '62' },
      placedCount: 6,
      totalCount: 6,
    },
    layout,
  } as never);
}
