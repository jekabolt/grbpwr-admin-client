// Job → sparrow instance. Pure: no wasm, no worker — the unit tests and both runtimes share it.
//
// Sparrow solves the strip-packing problem of jagua-rs (`spp`): a strip of fixed HEIGHT that is
// as short as possible along its WIDTH. Our strip is the same picture turned the same way:
// x along the fabric (sparrow's strip width = our used length), y across (sparrow's strip height
// = our fabric width). Its transformation is "rotate about the origin, then translate", which is
// exactly our placedPt with the mirror applied beforehand — so a mirrored copy is simply a
// separate item whose contour is pre-mirrored, and no transform has to be re-derived.
//
// GAP AND EDGES. Sparrow keeps `min_item_separation` between items by inflating every item by
// half of it — so items also stay half a separation away from the strip's own edges. The strip
// height therefore gets one separation added on top of the usable width (W − 2·margin), and the
// result is shifted back by (margin − separation/2) across: the usable band [sep/2, H − sep/2]
// lands on [margin, W − margin]. Along the fabric the layout is shifted so that its left-most
// contour point sits on the margin (acceptance measures length from the roll's zero).
import type { NestConfig, PieceDTO, RotationDeg, UnplacedPiece } from '../types';
import { allowedRotations, allowsFlip, variantPoly } from '../types';
import { bounds } from '../geom/polygon';
import { fittingRotations, mirroredCount } from '../nest/estimate';
import { mirrorRefusedWarning } from '../nest/warnings';

// Sparrow's separation is an approximate offset of a simplified contour; measured layouts came
// out 0.5000–0.5017 cm apart on a 0.5 cm gap, i.e. right on the line. Asking for 20 µm more
// keeps every layout clear of our own true-contour check (geom/clearance.ts, 1 µm tolerance)
// for a length cost nobody can measure.
export const SEPARATION_SAFETY_CM = 0.002;

export type SparrowItem = {
  id: number;
  demand: number;
  orientation: { rotation: { mode: 'discrete'; angles: number[] } };
  shape: { type: 'simple_polygon'; data: [number, number][] };
};

export type SparrowInstance = {
  name: string;
  min_item_separation: number;
  strip_height: number;
  items: SparrowItem[];
};

// What one sparrow item stands for on our side: a piece in one chirality, and the instance
// numbers its copies take, in order. Instance numbering follows the engine contract
// (types.ts, NestPieceConfig.flippedQuantity): the LAST flippedQuantity copies are mirrored.
export type ItemRef = { pieceId: number; flipped: boolean; instances: number[] };

export type SparrowJob = {
  instance: SparrowInstance;
  items: ItemRef[];
  // Instances that never reach the solver, with the reason (width / missing / mirror / fold).
  unplacedUpFront: UnplacedPiece[];
  warnings: string[];
  totalCount: number;
  areaById: Map<number, number>;
  // Shift from sparrow's strip frame to ours, across the fabric (y). Along (x) it depends on the
  // layout and is taken from the solution.
  shiftY: number;
  separationCm: number;
};

export function buildSparrowJob(allPieces: readonly PieceDTO[], config: NestConfig): SparrowJob {
  const warnings: string[] = [];
  const unplacedUpFront: UnplacedPiece[] = [];
  const items: ItemRef[] = [];
  const sItems: SparrowItem[] = [];
  const areaById = new Map<number, number>();
  const mirrorRefused = new Map<number, string>();
  const foldRefused = new Map<number, string>();

  const rotations = allowedRotations(config.fabricDirection, config.allowCrossGrain);
  const canFlip = allowsFlip(config.fabricDirection);
  const usableWidth = config.fabricWidthCm - 2 * config.edgeMarginCm;
  const byId = new Map(allPieces.map((p) => [p.id, p]));

  const push = (dto: PieceDTO, flipped: boolean, instances: number[], rots: RotationDeg[]) => {
    if (instances.length === 0) return;
    const poly = variantPoly(dto.poly, 0, flipped);
    items.push({ pieceId: dto.id, flipped, instances });
    sItems.push({
      id: sItems.length,
      demand: instances.length,
      orientation: { rotation: { mode: 'discrete', angles: [...rots] } },
      shape: { type: 'simple_polygon', data: poly.map((q) => [q.x, q.y]) },
    });
  };

  for (const pc of config.pieces) {
    if (pc.quantity <= 0) continue;
    const dto = byId.get(pc.pieceId);
    if (!dto) {
      for (let inst = 0; inst < pc.quantity; inst++) {
        unplacedUpFront.push({ pieceId: pc.pieceId, instance: inst, reason: 'missing' });
      }
      continue;
    }
    if (dto.fold?.kind === 'refused') {
      for (let inst = 0; inst < pc.quantity; inst++) {
        unplacedUpFront.push({ pieceId: dto.id, instance: inst, reason: 'fold' });
      }
      foldRefused.set(dto.id, `${dto.name} (${dto.fold.reason})`);
      continue;
    }
    areaById.set(dto.id, dto.areaCm2);
    // Mirroring changes neither span across (see nest/index.ts), so one check covers both.
    const b0 = bounds(dto.poly);
    const fitting = fittingRotations(
      (r) => (r === 0 || r === 180 ? b0.maxY - b0.minY : b0.maxX - b0.minX),
      rotations,
      usableWidth,
    );
    if (fitting.length === 0) {
      for (let inst = 0; inst < pc.quantity; inst++) {
        unplacedUpFront.push({ pieceId: dto.id, instance: inst, reason: 'width' });
      }
      continue;
    }
    const flippedCount = mirroredCount(pc.quantity, pc.flippedQuantity);
    const plain: number[] = [];
    const mirrored: number[] = [];
    for (let inst = 0; inst < pc.quantity; inst++) {
      if (inst < pc.quantity - flippedCount) plain.push(inst);
      else if (canFlip) mirrored.push(inst);
      else {
        // Directional cloth: a plain copy instead of the mirror would be worse than nothing —
        // on the marker they look the same and the cutting room cuts only left fronts.
        unplacedUpFront.push({ pieceId: dto.id, instance: inst, reason: 'mirror' });
        mirrorRefused.set(dto.id, dto.name);
      }
    }
    push(dto, false, plain, fitting);
    push(dto, true, mirrored, fitting);
  }

  if (mirrorRefused.size > 0)
    warnings.push(mirrorRefusedWarning(config.fabricDirection, mirrorRefused));
  if (foldRefused.size > 0) {
    warnings.push(`half on fold, not placed: ${[...foldRefused.values()].join('; ')}`);
  }

  const separationCm = Math.max(0, config.gapCm) + SEPARATION_SAFETY_CM;
  return {
    instance: {
      name: 'marker',
      min_item_separation: separationCm,
      strip_height: usableWidth + separationCm,
      items: sItems,
    },
    items,
    unplacedUpFront,
    warnings,
    totalCount: config.pieces.reduce((s, pc) => s + Math.max(0, pc.quantity), 0),
    areaById,
    shiftY: config.edgeMarginCm - separationCm / 2,
    separationCm,
  };
}
