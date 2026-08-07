import { buildMarkerLayout, markerToView } from 'components/managers/tech-card/components/nesting/marker-io';
import type { NestResult, PieceDTO } from 'lib/nesting/types';

const piece = (id: number, name: string): PieceDTO => ({
  id, name, blockName: name, source: 'probe.dxf',
  poly: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
  bboxW: 10, bboxH: 20, areaCm2: 200,
});

export const PIECES = [piece(1,'FRONT_M'), piece(2,'BACK_M'), piece(3,'FRONT_L'), piece(4,'BACK_L'), piece(5,'POCKET')];

const result = (ids: number[]): NestResult => ({
  placements: ids.map((pieceId, i) => ({ pieceId, instance: 0, rot: 0 as const, x: i * 12, y: 0, flipped: false })),
  usedLengthCm: 300, efficiency: 0.7, placedCount: ids.length, totalCount: ids.length,
  unplaced: [], generation: 5, elapsedMs: 100, cancelled: false, warnings: [],
});

const common = {
  perSetQty: new Map([[1,1],[2,1],[3,1],[4,1],[5,2]]),
  urlBySource: new Map([['probe.dxf', 'https://cdn/probe.dxf']]),
  unit: 'cm' as const,
  config: { targetLengthCm: 0, rdpEpsCm: 0.05, timeBudgetMs: 20000 },
  tol: 0.02, tolChain: 0.05,
};

export function mixed() {
  return buildMarkerLayout({
    ...common, pieces: PIECES, result: result([1,2,3,4,5]),
    composition: [{ sizeId: 4, quantity: 1 }, { sizeId: 3, quantity: 2 }],
    sizeIdByPieceId: new Map([[1,3],[2,3],[3,4],[4,4]]),
  });
}

export function homogeneous() {
  return buildMarkerLayout({
    ...common, pieces: [PIECES[0], PIECES[1], PIECES[4]], result: result([1,2,5]),
    composition: [{ sizeId: 3, quantity: 3 }],
    sizeIdByPieceId: new Map([[1,3],[2,3]]),
  });
}

export { markerToView };
