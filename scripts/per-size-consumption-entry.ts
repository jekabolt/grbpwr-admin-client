// Точка входа зонда Ф2.4: настоящие модули клиента, собранные esbuild'ом для node.
//
// Экспортируется ровно то, что зонд проверяет, плюс конструкторы фикстур — сами числа зонд
// собирает СВОЕЙ рукописной копией серверных формул, а не этими функциями.
export {
  compositionOf,
  consumptionCm,
  consumptionForSize,
  latestPerSize,
  perSizeComplete,
  scalarNormRefusal,
  sizeNormsOf,
} from 'components/managers/tech-card/components/nesting/marker-io';
export {
  AREA_ABS_TOL_CM2,
  AREA_REL_TOL,
  canContinue,
  checkClientAreas,
  continuationBasisOf,
  meanConsumptionCm,
  originLabel,
  perSizePlan,
  perSizeRefusal,
} from 'components/managers/tech-card/components/nesting/per-size-consumption';
export { sizeAreasFromParsed } from 'components/managers/tech-card/components/nesting/size-areas-from-dxf';

import type { common_TechCardMarker, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import type { PieceDTO } from 'lib/nesting/types';

// Прямоугольная деталь заданной площади: контур настоящий (его считает applySeamAllowance и
// геометрия), площадь совпадает с заявленной.
export function piece(id: number, blockName: string, areaCm2: number): PieceDTO {
  const w = 10;
  const h = areaCm2 / w;
  return {
    id,
    name: blockName,
    blockName,
    layer: '',
    source: 'probe.dxf',
    poly: [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ],
    bboxW: w,
    bboxH: h,
    areaCm2,
    inner: [],
  };
}

/** Деталь блоба: имя блока, количество на изделие, площадь, размер градации (0 = без размера). */
export type BlobPiece = { blockName: string; quantity: number; areaCm2: number; sizeId?: number };

export function marker(args: {
  summary: common_TechCardMarkerSummary;
  pieces: BlobPiece[];
}): common_TechCardMarker {
  return {
    summary: args.summary,
    layout: {
      schemaVersion: 4,
      params: undefined,
      composition: undefined,
      pieces: args.pieces.map((p, i) => ({
        pieceId: i + 1,
        name: p.blockName,
        blockName: p.blockName,
        source: 'probe.dxf',
        sourceUrl: '',
        quantity: p.quantity,
        poly: [],
        bboxWCm: 0,
        bboxHCm: 0,
        areaCm2: p.areaCm2,
        pieceLineKey: '',
        sizeId: p.sizeId && p.sizeId > 0 ? p.sizeId : undefined,
      })),
      placements: [],
      warnings: [],
    },
  };
}
