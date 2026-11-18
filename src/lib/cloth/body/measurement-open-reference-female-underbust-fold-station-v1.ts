import { SURFACE_ANCHOR_TABLE_V1 } from './measurement-surface-anchors-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import type { MeshSurfacePointV1 } from './mesh-surface-path-v1';

/**
 * Female under-bust station read from the base mesh's own inframammary fold.
 *
 * The bounded height fallback put the female under-bust plane 0.04 H under the armpit line, i.e.
 * about 30 mm under the bust apex, on the lower slope of the breast, while the measurement guide
 * draws the under-bust ring at the fold (about 50 mm under the apex on the same body), where the
 * final mesh measures 32-63 mm less than the typed under-bust. The rule below is the guide's own
 * walk (`anchoredUnderBustY` in measurement-surface-active-measurement-guide-v1), run on the
 * uniform display before any torso stage so the solved and the drawn under-bust share a plane.
 *
 * Wired on the female bust path when no under-bust is typed: the station then sits on the fold.
 * With a typed under-bust the bounded plane above it stays, because solving a typed under-bust at
 * the fold leaves the female bust proxy too little flattening range (chest - under-bust pairs of
 * about 100 mm or less go from represented to limited at the authored coefficient endpoint). The
 * legacy chest path (bust bundle not loaded) keeps the bounded plane too: its anterior field and
 * depth support were tuned against it. Moving either case is the owner's call. The fold is only a
 * default for an untyped field, so it never costs a typed one: when the fold result leaves a typed
 * field unapplied, the beta runtime solves again on the bounded plane and keeps the fold only if
 * it applies every typed field at least as well.
 *
 * Every number is geometric: walk window and step of the guide, read off the CC0 MakeHuman HM08
 * female base. Nothing is fitted to scan or survey data; NOMO-3D, which shows the real gap is
 * still larger, is research-only and stays out of product code.
 */
/** Diagnostic pushed when the under-bust station sits on the fold. */
export const FEMALE_UNDERBUST_FOLD_DIAGNOSTIC_V1 =
  'underbust-station:female-fold-template' as const;

export const FEMALE_UNDERBUST_FOLD_STATION_RULE_V1 = Object.freeze({
  version: 'female-underbust-fold-station/v1',
  /** HM08 chest point: female breast's most anterior vertex and its exact mirror. */
  apexVertices: Object.freeze({ left: 8454, right: 1782 } as const),
  /** The chest plane stays this far below the underarm so the arms remain separate loops. */
  chestUnderarmClearanceM: 0.03,
  /** Walk window below the chest plane and its step (guide values). */
  walkStartBelowChestM: 0.03,
  walkEndBelowChestM: 0.09,
  walkStepM: 0.01,
  /** Half-width of the vertical column under the apex whose front surface is read. */
  apexColumnHalfWidthM: 0.015,
  sources: Object.freeze([
    Object.freeze({
      id: 'makehuman-hm08-female-base',
      licence: 'CC0-1.0',
      use: 'geometry the fold is read from',
    }),
    Object.freeze({
      id: 'measurement-guide-anchored-under-bust',
      licence: 'project code',
      use: 'walk rule shared with the drawn under-bust ring',
    }),
  ]),
  /** No constant here comes from body data. */
  dataFittedConstants: 0,
} as const);

const UNDERARM_TEMPLATE: MeshSurfacePointV1 | undefined = SURFACE_ANCHOR_TABLE_V1.find(
  (anchor) => anchor.id === 'underarm-l',
)?.template;

function pointY(point: MeshSurfacePointV1, positionsM: Float32Array): number {
  if (point.kind === 'vertex') return positionsM[point.vertex * 3 + 1];
  const a = positionsM[point.a * 3 + 1];
  return a + (positionsM[point.b * 3 + 1] - a) * point.t;
}

/** Highest z of the torso loop's front points in the column under the apex, or null. */
function frontZUnderApex(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly yM: number;
  readonly apexX: number;
}): number | null {
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: [0, options.yM, 0],
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: [0, options.yM, 0] },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!section.ok || !section.selectedLoop) return null;
  const loop = section.selectedLoop;
  const halfWidth = FEMALE_UNDERBUST_FOLD_STATION_RULE_V1.apexColumnHalfWidthM;
  let best: number | null = null;
  for (const point of loop.pointsM) {
    if (Math.abs(Math.abs(point[0]) - options.apexX) >= halfWidth) continue;
    if (point[2] <= loop.centroidM[2]) continue;
    if (best === null || point[2] > best) best = point[2];
  }
  return best;
}

/**
 * Fold height on an HM08 female display: walking down from 3 cm under the chest plane in 1 cm
 * steps, the first plane whose front surface under the apex stops receding. Null when no fold is
 * found within 9 cm or the mesh is not HM08; the caller keeps its bounded fallback then.
 */
export function resolveMeasurementOpenReferenceFemaleUnderBustFoldYV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
}): number | null {
  const rule = FEMALE_UNDERBUST_FOLD_STATION_RULE_V1;
  const { left, right } = rule.apexVertices;
  if (!UNDERARM_TEMPLATE || options.positionsM.length < (Math.max(left, right) + 1) * 3) {
    return null;
  }
  const { positionsM } = options;
  const apexX = Math.abs(positionsM[left * 3]);
  const apexY = (positionsM[left * 3 + 1] + positionsM[right * 3 + 1]) / 2;
  const chestY = Math.min(
    apexY,
    pointY(UNDERARM_TEMPLATE, positionsM) - rule.chestUnderarmClearanceM,
  );
  if (!Number.isFinite(apexX) || !Number.isFinite(chestY)) return null;
  const steps = Math.round((rule.walkEndBelowChestM - rule.walkStartBelowChestM) / rule.walkStepM);
  let previous: { readonly yM: number; readonly zM: number } | null = null;
  for (let step = 0; step <= steps; step += 1) {
    const yM = chestY - (rule.walkStartBelowChestM + step * rule.walkStepM);
    const zM = frontZUnderApex({ ...options, yM, apexX });
    if (zM === null) return null;
    if (previous && zM >= previous.zM) return previous.yM;
    previous = { yM, zM };
  }
  return null;
}
