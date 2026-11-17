import type { MeshSurfacePointV1 } from './mesh-surface-path-v1';
import { SURFACE_ANCHOR_TABLE_V1 } from './measurement-surface-anchors-v1';

/**
 * HM08 chest point: vertex 8454 is the female breast's most anterior vertex and the nipple point
 * on male and neutral; 1782 is its exact mirror on every uniform display. Same template the
 * measurement guide draws the chest ring through.
 */
export const HM08_CHEST_POINT_VERTICES_V1 = Object.freeze({ left: 8454, right: 1782 } as const);

/** The chest plane stays this far below the underarm so the arms remain separate loops. */
export const CHEST_POINT_UNDERARM_CLEARANCE_M = 0.03;

const UNDERARM_TEMPLATE: MeshSurfacePointV1 | undefined = SURFACE_ANCHOR_TABLE_V1.find(
  (anchor) => anchor.id === 'underarm-l',
)?.template;

function pointY(point: MeshSurfacePointV1, positionsM: Float32Array): number {
  if (point.kind === 'vertex') return positionsM[point.vertex * 3 + 1];
  const a = positionsM[point.a * 3 + 1];
  return a + (positionsM[point.b * 3 + 1] - a) * point.t;
}

/**
 * Chest-point level on an HM08 display: mean height of the two chest-point vertices, kept
 * `CHEST_POINT_UNDERARM_CLEARANCE_M` below the underarm anchor. It is the guide's chest-ring rule
 * (measurement-surface-active-measurement-guide-v1 `anchoredChestY`), so the solved and the drawn
 * chest share one plane. Geometric template, not a detected landmark.
 */
export function resolveMeasurementOpenReferenceChestPointYV1(positionsM: Float32Array): number {
  const { left, right } = HM08_CHEST_POINT_VERTICES_V1;
  if (!UNDERARM_TEMPLATE) throw new Error('Underarm anchor template is missing.');
  if (positionsM.length < (Math.max(left, right) + 1) * 3) {
    throw new RangeError('Chest point needs the HM08 display topology.');
  }
  const apexY = (positionsM[left * 3 + 1] + positionsM[right * 3 + 1]) / 2;
  const chestY = Math.min(
    apexY,
    pointY(UNDERARM_TEMPLATE, positionsM) - CHEST_POINT_UNDERARM_CLEARANCE_M,
  );
  if (!Number.isFinite(chestY)) throw new Error('Chest point level is not finite.');
  return chestY;
}
