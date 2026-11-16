import {
  meshSurfaceEdgePointV1,
  meshSurfaceVertexPointV1,
  mirrorMeshSurfacePointV1,
  type MeshSurfacePointV1,
  type MeshSurfaceVec3V1,
} from './mesh-surface-path-v1';
import {
  measureMeshPlaneSectionPerimetersV1,
  type MeshPlaneSectionLoopV1,
} from './mesh-plane-section-perimeter-v1';
import { MESH_SURFACE_TOPOLOGY_V1, type MeshSurfaceTopologyV1 } from './mesh-surface-topology-v1';

export const MEASUREMENT_SURFACE_ANCHORS_V1 = 'measurement-surface-anchors/v1' as const;

export type SurfaceAnchorIdV1 =
  | 'ssn'
  | 'c7'
  | 'hps-l'
  | 'hps-r'
  | 'underarm-l'
  | 'underarm-r'
  | 'crotch';

export type SurfaceAnchorClassV1 = 'robust' | 'limited';

export interface SurfaceAnchorV1 {
  readonly id: SurfaceAnchorIdV1;
  readonly rule: string;
  readonly template: MeshSurfacePointV1;
  readonly checkBandMm: number;
  readonly class: SurfaceAnchorClassV1;
  readonly mirrorOf?: SurfaceAnchorIdV1;
}

const ANCHOR_IDS = Object.freeze([
  'ssn',
  'c7',
  'hps-l',
  'hps-r',
  'underarm-l',
  'underarm-r',
  'crotch',
] as const satisfies readonly SurfaceAnchorIdV1[]);

function anchor(entry: SurfaceAnchorV1): SurfaceAnchorV1 {
  return Object.freeze(entry);
}

/**
 * Gender-base vertex votes (female/neutral/male; base is report-only):
 * SSN 815/815/815 (base 809), C7 857/857/857 (base 857),
 * HPS-L 8189/8189/8189 (base 7478), underarm-L 8337/8336/8336 (base 8304),
 * and crotch 4372/4372/4372 (base 4372). The underarm section consistently crosses
 * edge 8336-8340; its fixed interior point keeps the off-surface gap midpoint inside
 * the 10 mm band on all four bases. Mirrored points use the topology mirror map.
 *
 * MakeHuman's positive x side is the figure's left: HPS-L vertex 8189 has x > 0,
 * while its HPS-R mirror vertex 1505 has x < 0 on every reference basis.
 */
export const SURFACE_ANCHOR_TABLE_V1: readonly SurfaceAnchorV1[] = Object.freeze([
  anchor({
    id: 'ssn',
    rule: 'front-midline-min-z/0.80-0.86H',
    template: meshSurfaceVertexPointV1(815),
    checkBandMm: 15,
    class: 'limited',
  }),
  anchor({
    id: 'c7',
    rule: 'back-midline-max-turn/0.80-0.88H',
    template: meshSurfaceVertexPointV1(857),
    checkBandMm: 20,
    class: 'limited',
  }),
  anchor({
    id: 'hps-l',
    rule: 'coronal-neck-shoulder-chord/left',
    template: meshSurfaceVertexPointV1(8189),
    checkBandMm: 30,
    class: 'limited',
  }),
  anchor({
    id: 'hps-r',
    rule: 'mirror/hps-l',
    template: meshSurfaceVertexPointV1(1505),
    checkBandMm: 30,
    class: 'limited',
    mirrorOf: 'hps-l',
  }),
  anchor({
    id: 'underarm-l',
    rule: 'last-3-loop-gap-midpoint/left',
    template: meshSurfaceEdgePointV1(8336, 8340, 0.4),
    checkBandMm: 10,
    class: 'robust',
  }),
  anchor({
    id: 'underarm-r',
    rule: 'mirror/underarm-l',
    template: meshSurfaceEdgePointV1(1664, 1668, 0.4),
    checkBandMm: 10,
    class: 'robust',
    mirrorOf: 'underarm-l',
  }),
  anchor({
    id: 'crotch',
    rule: 'last-2-leg-loop-midline-min-y',
    template: meshSurfaceVertexPointV1(4372),
    checkBandMm: 10,
    class: 'robust',
  }),
]);

export type SurfaceAnchorFailureCodeV1 =
  | 'anchor-check-failed'
  | 'anchor-rule-failed'
  | 'height-order-broken'
  | 'topology-mismatch';

export interface SurfaceAnchorRuleSuccessV1 {
  readonly ok: true;
  readonly positionM: MeshSurfaceVec3V1;
  readonly nearest: MeshSurfacePointV1;
  readonly plateauMm?: number;
}

export interface SurfaceAnchorRuleFailureV1 {
  readonly ok: false;
  readonly code: 'anchor-rule-failed' | 'topology-mismatch';
  readonly detail: string;
}

export type SurfaceAnchorRuleResultV1 = SurfaceAnchorRuleSuccessV1 | SurfaceAnchorRuleFailureV1;

export type SurfaceAnchorRuleResultsV1 = Readonly<
  Record<SurfaceAnchorIdV1, SurfaceAnchorRuleResultV1>
>;

export interface CheckedSurfaceAnchorV1 {
  readonly template: MeshSurfacePointV1;
  readonly templatePositionM: MeshSurfaceVec3V1;
  readonly rulePositionM: MeshSurfaceVec3V1;
  readonly distanceMm: number;
  readonly plateauMm?: number;
}

export interface SurfaceAnchorFailureV1 {
  readonly id: SurfaceAnchorIdV1;
  readonly code: SurfaceAnchorFailureCodeV1;
  readonly distanceMm?: number;
  readonly detail: string;
}

export type SurfaceAnchorCheckResultV1 =
  | Readonly<{
      ok: true;
      anchors: Readonly<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>;
      heightFractions: Readonly<Record<SurfaceAnchorIdV1, number>>;
    }>
  | Readonly<{
      ok: false;
      code: SurfaceAnchorFailureCodeV1;
      failures: readonly SurfaceAnchorFailureV1[];
      anchors?: Readonly<Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>>;
    }>;

interface Bounds {
  readonly minimumY: number;
  readonly maximumY: number;
  readonly heightM: number;
}

interface MidlineProfiles {
  readonly front: readonly number[];
  readonly back: readonly number[];
  readonly crotch: number;
}

interface UnderarmRuleSuccess extends SurfaceAnchorRuleSuccessV1 {
  readonly sectionLevelM: number;
}

const EXPECTED_TOPOLOGY_HASH = '13380:80268:41ea4f028f3e74f6';
const SECTION_BISECTION_TOLERANCE_M = 0.0005;

function frozenVec3(x: number, y: number, z: number): MeshSurfaceVec3V1 {
  return Object.freeze([x, y, z]) as MeshSurfaceVec3V1;
}

function vertexPosition(positionsM: Float32Array, vertex: number): MeshSurfaceVec3V1 {
  const offset = vertex * 3;
  return frozenVec3(positionsM[offset], positionsM[offset + 1], positionsM[offset + 2]);
}

function pointPosition(
  point: MeshSurfacePointV1,
  positionsM: Float32Array,
): MeshSurfaceVec3V1 | null {
  if (point.kind === 'vertex') {
    if (
      !Number.isSafeInteger(point.vertex) ||
      point.vertex < 0 ||
      point.vertex * 3 + 2 >= positionsM.length
    )
      return null;
    return vertexPosition(positionsM, point.vertex);
  }
  if (
    !Number.isSafeInteger(point.a) ||
    !Number.isSafeInteger(point.b) ||
    point.a < 0 ||
    point.a >= point.b ||
    point.b * 3 + 2 >= positionsM.length ||
    !Number.isFinite(point.t) ||
    point.t <= 0 ||
    point.t >= 1
  ) {
    return null;
  }
  const a = point.a * 3;
  const b = point.b * 3;
  return frozenVec3(
    positionsM[a] + (positionsM[b] - positionsM[a]) * point.t,
    positionsM[a + 1] + (positionsM[b + 1] - positionsM[a + 1]) * point.t,
    positionsM[a + 2] + (positionsM[b + 2] - positionsM[a + 2]) * point.t,
  );
}

function bounds(positionsM: Float32Array): Bounds | null {
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < positionsM.length; offset += 3) {
    if (
      !Number.isFinite(positionsM[offset]) ||
      !Number.isFinite(positionsM[offset + 1]) ||
      !Number.isFinite(positionsM[offset + 2])
    ) {
      return null;
    }
    minimumY = Math.min(minimumY, positionsM[offset + 1]);
    maximumY = Math.max(maximumY, positionsM[offset + 1]);
  }
  const heightM = maximumY - minimumY;
  return Number.isFinite(heightM) && heightM > 0
    ? Object.freeze({ minimumY, maximumY, heightM })
    : null;
}

function fractionY(value: number, currentBounds: Bounds): number {
  return (value - currentBounds.minimumY) / currentBounds.heightM;
}

function ruleSuccess(
  positionM: MeshSurfaceVec3V1,
  nearest: MeshSurfacePointV1,
  plateauMm?: number,
): SurfaceAnchorRuleSuccessV1 {
  return Object.freeze({
    ok: true as const,
    positionM,
    nearest,
    ...(plateauMm === undefined ? {} : { plateauMm }),
  });
}

function ruleFailure(
  detail: string,
  code: 'anchor-rule-failed' | 'topology-mismatch' = 'anchor-rule-failed',
): SurfaceAnchorRuleFailureV1 {
  return Object.freeze({ ok: false as const, code, detail });
}

function topologyProblem(topology: MeshSurfaceTopologyV1, positionsM: Float32Array): string | null {
  if (
    topology.version !== MESH_SURFACE_TOPOLOGY_V1 ||
    topology.topologyHash !== EXPECTED_TOPOLOGY_HASH ||
    topology.vertexCount !== 13_380 ||
    topology.triangleIndices.length !== topology.triangleCount * 3 ||
    topology.mirrorVertexMap.length !== topology.vertexCount ||
    positionsM.length !== topology.vertexCount * 3
  ) {
    return 'Positions do not share the measured anchor topology.';
  }
  return null;
}

function midlineProfiles(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
): MidlineProfiles | SurfaceAnchorRuleFailureV1 {
  const component = topology.midlineVertexOrder.reduce<Uint32Array | null>(
    (longest, candidate) => (!longest || candidate.length > longest.length ? candidate : longest),
    null,
  );
  if (!component || component.length < 5) return ruleFailure('Midline profile is incomplete.');

  let crotchIndex = 0;
  for (let index = 1; index < component.length; index += 1) {
    const vertex = component[index];
    const best = component[crotchIndex];
    if (
      positionsM[vertex * 3 + 1] < positionsM[best * 3 + 1] ||
      (positionsM[vertex * 3 + 1] === positionsM[best * 3 + 1] && vertex < best)
    ) {
      crotchIndex = index;
    }
  }
  if (crotchIndex === 0 || crotchIndex === component.length - 1) {
    return ruleFailure('Midline does not split at the crotch.');
  }

  // The mouth-interior vertices remain in the walked arms. They are never z-filtered.
  const firstArm = [...component.slice(0, crotchIndex + 1)].reverse();
  const secondArm = [...component.slice(crotchIndex)];
  const torsoMeanZ = (vertices: readonly number[]): number | null => {
    let sum = 0;
    let count = 0;
    for (const vertex of vertices) {
      const yFraction = fractionY(positionsM[vertex * 3 + 1], currentBounds);
      if (yFraction < 0.7 || yFraction > 0.79) continue;
      sum += positionsM[vertex * 3 + 2];
      count += 1;
    }
    return count > 0 ? sum / count : null;
  };
  const firstMeanZ = torsoMeanZ(firstArm);
  const secondMeanZ = torsoMeanZ(secondArm);
  if (firstMeanZ === null || secondMeanZ === null || firstMeanZ === secondMeanZ) {
    return ruleFailure('Midline front and back profiles are ambiguous.');
  }
  const minimumY = positionsM[component[crotchIndex] * 3 + 1];
  const crotch = [...component]
    .filter((vertex) => positionsM[vertex * 3 + 1] <= minimumY + 0.002)
    .reduce((frontmost, vertex) =>
      positionsM[vertex * 3 + 2] > positionsM[frontmost * 3 + 2] ||
      (positionsM[vertex * 3 + 2] === positionsM[frontmost * 3 + 2] && vertex < frontmost)
        ? vertex
        : frontmost,
    );
  return Object.freeze({
    front: Object.freeze(firstMeanZ > secondMeanZ ? firstArm : secondArm),
    back: Object.freeze(firstMeanZ > secondMeanZ ? secondArm : firstArm),
    crotch,
  });
}

function ssnRule(
  profile: readonly number[],
  positionsM: Float32Array,
  currentBounds: Bounds,
): SurfaceAnchorRuleResultV1 {
  const candidates = profile.filter((vertex) => {
    const value = fractionY(positionsM[vertex * 3 + 1], currentBounds);
    return value >= 0.8 && value <= 0.86;
  });
  if (candidates.length === 0) return ruleFailure('SSN profile band is empty.');
  const vertex = candidates.reduce((best, candidate) => {
    const candidateZ = positionsM[candidate * 3 + 2];
    const bestZ = positionsM[best * 3 + 2];
    return candidateZ < bestZ || (candidateZ === bestZ && candidate < best) ? candidate : best;
  });
  return ruleSuccess(vertexPosition(positionsM, vertex), meshSurfaceVertexPointV1(vertex));
}

function c7Rule(
  profile: readonly number[],
  positionsM: Float32Array,
  currentBounds: Bounds,
): SurfaceAnchorRuleResultV1 {
  let bestVertex = -1;
  let bestTurn = Number.NEGATIVE_INFINITY;
  for (let index = 1; index < profile.length - 1; index += 1) {
    const vertex = profile[index];
    const yFraction = fractionY(positionsM[vertex * 3 + 1], currentBounds);
    if (yFraction < 0.8 || yFraction > 0.88) continue;
    const previous = profile[index - 1];
    const next = profile[index + 1];
    const incoming = [
      positionsM[vertex * 3] - positionsM[previous * 3],
      positionsM[vertex * 3 + 1] - positionsM[previous * 3 + 1],
      positionsM[vertex * 3 + 2] - positionsM[previous * 3 + 2],
    ] as const;
    const outgoing = [
      positionsM[next * 3] - positionsM[vertex * 3],
      positionsM[next * 3 + 1] - positionsM[vertex * 3 + 1],
      positionsM[next * 3 + 2] - positionsM[vertex * 3 + 2],
    ] as const;
    const incomingLength = Math.hypot(...incoming);
    const outgoingLength = Math.hypot(...outgoing);
    if (incomingLength === 0 || outgoingLength === 0) continue;
    const cosine = Math.max(
      -1,
      Math.min(
        1,
        (incoming[0] * outgoing[0] + incoming[1] * outgoing[1] + incoming[2] * outgoing[2]) /
          (incomingLength * outgoingLength),
      ),
    );
    const turn = Math.acos(cosine);
    if (turn > bestTurn || (turn === bestTurn && vertex < bestVertex)) {
      bestTurn = turn;
      bestVertex = vertex;
    }
  }
  if (bestVertex < 0) return ruleFailure('C7 profile band has no valid turn.');
  return ruleSuccess(vertexPosition(positionsM, bestVertex), meshSurfaceVertexPointV1(bestVertex));
}

function horizontalLoops(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  levelM: number,
): readonly MeshPlaneSectionLoopV1[] | SurfaceAnchorRuleFailureV1 {
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM,
    triangleIndices: topology.triangleIndices,
    planeOriginM: [0, levelM, 0],
    planeNormal: [0, 1, 0],
  });
  return section.ok ? section.loops : ruleFailure(`Horizontal section failed: ${section.code}.`);
}

function bisectionLevel(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
  lowerFraction: number,
  upperFraction: number,
  lowerLoopCount: number,
  upperLoopCount: number,
): Readonly<{ lowerM: number; upperM: number }> | SurfaceAnchorRuleFailureV1 {
  let lowerM = currentBounds.minimumY + currentBounds.heightM * lowerFraction;
  let upperM = currentBounds.minimumY + currentBounds.heightM * upperFraction;
  const lower = horizontalLoops(topology, positionsM, lowerM);
  const upper = horizontalLoops(topology, positionsM, upperM);
  if ('ok' in lower) return lower;
  if ('ok' in upper) return upper;
  if (lower.length !== lowerLoopCount || upper.length !== upperLoopCount) {
    return ruleFailure(`Section transition is not ${lowerLoopCount}-to-${upperLoopCount} loops.`);
  }
  while (upperM - lowerM > SECTION_BISECTION_TOLERANCE_M) {
    const middleM = (lowerM + upperM) / 2;
    const middle = horizontalLoops(topology, positionsM, middleM);
    if ('ok' in middle) return middle;
    if (middle.length === lowerLoopCount) lowerM = middleM;
    else upperM = middleM;
  }
  return Object.freeze({ lowerM, upperM });
}

function nearestVertex(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  point: MeshSurfaceVec3V1,
): number {
  let bestVertex = 0;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < topology.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const dx = positionsM[offset] - point[0];
    const dy = positionsM[offset + 1] - point[1];
    const dz = positionsM[offset + 2] - point[2];
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared;
      bestVertex = vertex;
    }
  }
  return bestVertex;
}

function underarmLeftRule(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
): UnderarmRuleSuccess | SurfaceAnchorRuleFailureV1 {
  const transition = bisectionLevel(topology, positionsM, currentBounds, 0.65, 0.8, 3, 1);
  if ('ok' in transition) return transition;
  const loops = horizontalLoops(topology, positionsM, transition.lowerM);
  if ('ok' in loops) return loops;
  if (loops.length !== 3) return ruleFailure('Last underarm section does not have three loops.');

  const byCentrality = [...loops].sort(
    (left, right) => Math.abs(left.centroidM[0]) - Math.abs(right.centroidM[0]),
  );
  const torso = byCentrality[0];
  const leftArm = [...loops].sort((left, right) => right.centroidM[0] - left.centroidM[0])[0];
  if (torso === leftArm || leftArm.centroidM[0] <= 0) {
    return ruleFailure('Left arm and torso loops are ambiguous.');
  }

  let armIndex = -1;
  let torsoIndex = -1;
  let distanceSquared = Number.POSITIVE_INFINITY;
  for (let currentArm = 0; currentArm < leftArm.pointsM.length; currentArm += 1) {
    for (let currentTorso = 0; currentTorso < torso.pointsM.length; currentTorso += 1) {
      const armPoint = leftArm.pointsM[currentArm];
      const torsoPoint = torso.pointsM[currentTorso];
      const dx = armPoint[0] - torsoPoint[0];
      const dz = armPoint[2] - torsoPoint[2];
      const candidate = dx * dx + dz * dz;
      if (candidate < distanceSquared) {
        distanceSquared = candidate;
        armIndex = currentArm;
        torsoIndex = currentTorso;
      }
    }
  }
  if (armIndex < 0 || torsoIndex < 0) return ruleFailure('Underarm gap has no closest pair.');
  const armPoint = leftArm.pointsM[armIndex];
  const torsoPoint = torso.pointsM[torsoIndex];
  const positionM = frozenVec3(
    (armPoint[0] + torsoPoint[0]) / 2,
    transition.lowerM,
    (armPoint[2] + torsoPoint[2]) / 2,
  );
  return Object.freeze({
    ...ruleSuccess(
      positionM,
      meshSurfaceVertexPointV1(nearestVertex(topology, positionsM, positionM)),
    ),
    sectionLevelM: transition.lowerM,
  });
}

function crotchRule(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  crotchVertex: number,
): SurfaceAnchorRuleResultV1 {
  const positionM = vertexPosition(positionsM, crotchVertex);
  let lowerM = positionM[1] - 0.001;
  let upperM = positionM[1] + 0.001;
  const lower = horizontalLoops(topology, positionsM, lowerM);
  const upper = horizontalLoops(topology, positionsM, upperM);
  if ('ok' in lower) return lower;
  if ('ok' in upper) return upper;
  if (lower.length !== 2 || upper.length === 2) {
    return ruleFailure('Midline crotch is not within 2 mm of the leg-loop transition.');
  }
  while (upperM - lowerM > SECTION_BISECTION_TOLERANCE_M / 4) {
    const middleM = (lowerM + upperM) / 2;
    const middle = horizontalLoops(topology, positionsM, middleM);
    if ('ok' in middle) return middle;
    if (middle.length === 2) lowerM = middleM;
    else upperM = middleM;
  }
  return ruleSuccess(positionM, meshSurfaceVertexPointV1(crotchVertex));
}

function shorterArc(length: number, start: number, end: number): readonly number[] {
  const forward: number[] = [];
  for (let index = start; index !== end; index = (index + 1) % length) forward.push(index);
  forward.push(end);
  const backward: number[] = [];
  for (let index = start; index !== end; index = (index - 1 + length) % length)
    backward.push(index);
  backward.push(end);
  return forward.length <= backward.length ? forward : backward;
}

function hpsLeftRule(
  topology: MeshSurfaceTopologyV1,
  positionsM: Float32Array,
  currentBounds: Bounds,
  ssn: SurfaceAnchorRuleSuccessV1,
  c7: SurfaceAnchorRuleSuccessV1,
  underarm: UnderarmRuleSuccess,
): SurfaceAnchorRuleResultV1 {
  const sectionZ = (ssn.positionM[2] + c7.positionM[2]) / 2;
  const section = measureMeshPlaneSectionPerimetersV1({
    positionsM,
    triangleIndices: topology.triangleIndices,
    planeOriginM: [0, 0, sectionZ],
    planeNormal: [0, 0, 1],
  });
  if (!section.ok) return ruleFailure(`Coronal section failed: ${section.code}.`);
  const loop = [...section.loops]
    .filter((candidate) => {
      const hasNeck = candidate.pointsM.some(
        (point) =>
          point[0] > 0 && Math.abs(point[1] - c7.positionM[1]) <= currentBounds.heightM * 0.05,
      );
      const hasShoulder = candidate.pointsM.some(
        (point) =>
          point[0] > 0 && point[1] >= underarm.sectionLevelM && point[1] <= c7.positionM[1],
      );
      return hasNeck && hasShoulder;
    })
    .sort((left, right) => right.perimeterM - left.perimeterM)[0];
  if (!loop) return ruleFailure('Left neck/shoulder contour is missing.');

  const neckLimitX = currentBounds.heightM * 0.1;
  const neckCandidates = loop.pointsM.flatMap((point, index) =>
    point[0] > 0 && point[0] <= neckLimitX ? [{ point, index }] : [],
  );
  const shoulderCandidates = loop.pointsM.flatMap((point, index) =>
    point[0] > 0 && point[1] >= underarm.sectionLevelM && point[1] <= c7.positionM[1]
      ? [{ point, index }]
      : [],
  );
  if (neckCandidates.length === 0 || shoulderCandidates.length === 0) {
    return ruleFailure('Neck/shoulder chord endpoints are missing.');
  }
  const neck = neckCandidates.reduce((best, candidate) => {
    const candidateDistance = Math.abs(candidate.point[1] - c7.positionM[1]);
    const bestDistance = Math.abs(best.point[1] - c7.positionM[1]);
    return candidateDistance < bestDistance ||
      (candidateDistance === bestDistance && candidate.index < best.index)
      ? candidate
      : best;
  });
  const shoulder = shoulderCandidates.reduce((best, candidate) =>
    candidate.point[0] > best.point[0] ||
    (candidate.point[0] === best.point[0] && candidate.index < best.index)
      ? candidate
      : best,
  );
  const arc = shorterArc(loop.pointsM.length, neck.index, shoulder.index);
  if (arc.length < 3) return ruleFailure('Neck/shoulder contour arc is incomplete.');

  const chordX = shoulder.point[0] - neck.point[0];
  const chordY = shoulder.point[1] - neck.point[1];
  const chordLength = Math.hypot(chordX, chordY);
  if (chordLength === 0) return ruleFailure('Neck/shoulder chord is degenerate.');
  const distances = arc.map((index) => {
    const point = loop.pointsM[index];
    // Signed toward the outer neck bulge; the opposite sign is the shoulder's inward sag.
    return (
      (chordX * (neck.point[1] - point[1]) - (neck.point[0] - point[0]) * chordY) / chordLength
    );
  });
  const peakOffset = distances.reduce(
    (best, candidate, index) => (candidate > distances[best] ? index : best),
    0,
  );
  const peakDistance = distances[peakOffset];
  if (!(peakDistance > 0)) return ruleFailure('Neck/shoulder contour has no outward peak.');
  const peakIndex = arc[peakOffset];
  const positionM = frozenVec3(...loop.pointsM[peakIndex]);
  const plateauOffsets = distances.flatMap((distance, index) =>
    distance >= peakDistance * 0.9 ? [index] : [],
  );
  let plateauM = 0;
  for (
    let index = plateauOffsets[0];
    index < plateauOffsets[plateauOffsets.length - 1];
    index += 1
  ) {
    const left = loop.pointsM[arc[index]];
    const right = loop.pointsM[arc[index + 1]];
    plateauM += Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
  }
  return ruleSuccess(
    positionM,
    meshSurfaceVertexPointV1(nearestVertex(topology, positionsM, positionM)),
    plateauM * 1000,
  );
}

function mirroredRule(
  source: SurfaceAnchorRuleResultV1,
  topology: MeshSurfaceTopologyV1,
): SurfaceAnchorRuleResultV1 {
  if (!source.ok) return source;
  return ruleSuccess(
    frozenVec3(-source.positionM[0], source.positionM[1], source.positionM[2]),
    mirrorMeshSurfacePointV1(source.nearest, topology),
    source.plateauMm,
  );
}

function failedRuleRecord(failure: SurfaceAnchorRuleFailureV1): SurfaceAnchorRuleResultsV1 {
  return Object.freeze(
    Object.fromEntries(ANCHOR_IDS.map((id) => [id, failure])) as Record<
      SurfaceAnchorIdV1,
      SurfaceAnchorRuleResultV1
    >,
  );
}

export function evaluateSurfaceAnchorRulesV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
}): SurfaceAnchorRuleResultsV1 {
  const problem = topologyProblem(options.topology, options.positionsM);
  const currentBounds = bounds(options.positionsM);
  if (problem || !currentBounds) {
    return failedRuleRecord(
      ruleFailure(problem ?? 'Positions contain invalid coordinates.', 'topology-mismatch'),
    );
  }
  const profiles = midlineProfiles(options.topology, options.positionsM, currentBounds);
  if ('ok' in profiles) return failedRuleRecord(profiles);

  const ssn = ssnRule(profiles.front, options.positionsM, currentBounds);
  const c7 = c7Rule(profiles.back, options.positionsM, currentBounds);
  const underarmLeft = underarmLeftRule(options.topology, options.positionsM, currentBounds);
  const crotch = crotchRule(options.topology, options.positionsM, profiles.crotch);
  const hpsLeft =
    ssn.ok && c7.ok && underarmLeft.ok
      ? hpsLeftRule(options.topology, options.positionsM, currentBounds, ssn, c7, underarmLeft)
      : ruleFailure('HPS prerequisites failed.');

  return Object.freeze({
    ssn,
    c7,
    'hps-l': hpsLeft,
    'hps-r': mirroredRule(hpsLeft, options.topology),
    'underarm-l': underarmLeft,
    'underarm-r': mirroredRule(underarmLeft, options.topology),
    crotch,
  });
}

function distanceMm(left: MeshSurfaceVec3V1, right: MeshSurfaceVec3V1): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]) * 1000;
}

function frozenCheckedAnchor(
  tableAnchor: SurfaceAnchorV1,
  templatePositionM: MeshSurfaceVec3V1,
  ruleResult: SurfaceAnchorRuleSuccessV1,
): CheckedSurfaceAnchorV1 {
  return Object.freeze({
    template: tableAnchor.template,
    templatePositionM,
    rulePositionM: ruleResult.positionM,
    distanceMm: distanceMm(templatePositionM, ruleResult.positionM),
    ...(ruleResult.plateauMm === undefined ? {} : { plateauMm: ruleResult.plateauMm }),
  });
}

function failureResult(
  code: SurfaceAnchorFailureCodeV1,
  failures: readonly SurfaceAnchorFailureV1[],
  anchors?: Readonly<Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>>>,
): SurfaceAnchorCheckResultV1 {
  return Object.freeze({
    ok: false as const,
    code,
    failures: Object.freeze([...failures]),
    ...(anchors && Object.keys(anchors).length > 0
      ? { anchors: Object.freeze({ ...anchors }) }
      : {}),
  });
}

export function checkSurfaceAnchorsV1(options: {
  readonly topology: MeshSurfaceTopologyV1;
  readonly positionsM: Float32Array;
  readonly table?: readonly SurfaceAnchorV1[];
}): SurfaceAnchorCheckResultV1 {
  const problem = topologyProblem(options.topology, options.positionsM);
  const currentBounds = bounds(options.positionsM);
  if (problem || !currentBounds) {
    const detail = problem ?? 'Positions contain invalid coordinates.';
    return failureResult(
      'topology-mismatch',
      ANCHOR_IDS.map((id) => Object.freeze({ id, code: 'topology-mismatch' as const, detail })),
    );
  }

  const table = options.table ?? SURFACE_ANCHOR_TABLE_V1;
  const tableById = new Map<SurfaceAnchorIdV1, SurfaceAnchorV1>();
  for (const entry of table) {
    if (!ANCHOR_IDS.includes(entry.id) || tableById.has(entry.id)) {
      return failureResult('anchor-check-failed', [
        Object.freeze({
          id: entry.id,
          code: 'anchor-check-failed' as const,
          detail: 'Anchor table contains an unknown or duplicate id.',
        }),
      ]);
    }
    tableById.set(entry.id, entry);
  }
  const missing = ANCHOR_IDS.find((id) => !tableById.has(id));
  if (missing) {
    return failureResult('anchor-check-failed', [
      Object.freeze({
        id: missing,
        code: 'anchor-check-failed' as const,
        detail: 'Anchor table is missing this id.',
      }),
    ]);
  }

  const rules = evaluateSurfaceAnchorRulesV1(options);
  const failures: SurfaceAnchorFailureV1[] = [];
  const checked: Partial<Record<SurfaceAnchorIdV1, CheckedSurfaceAnchorV1>> = {};
  for (const id of ANCHOR_IDS) {
    const rule = rules[id];
    if (!rule.ok) {
      failures.push(Object.freeze({ id, code: rule.code, detail: rule.detail }));
      continue;
    }
    const tableAnchor = tableById.get(id)!;
    const templatePositionM = pointPosition(tableAnchor.template, options.positionsM);
    if (!templatePositionM) {
      failures.push(
        Object.freeze({
          id,
          code: 'topology-mismatch' as const,
          detail: 'Template point is invalid for this topology.',
        }),
      );
      continue;
    }
    const current = frozenCheckedAnchor(tableAnchor, templatePositionM, rule);
    checked[id] = current;
    if (current.distanceMm > tableAnchor.checkBandMm) {
      failures.push(
        Object.freeze({
          id,
          code: 'anchor-check-failed' as const,
          distanceMm: current.distanceMm,
          detail: `Template is outside the ${tableAnchor.checkBandMm} mm check band.`,
        }),
      );
    }
    if ((id === 'hps-l' || id === 'hps-r') && (current.plateauMm ?? 0) > 30) {
      failures.push(
        Object.freeze({
          id,
          code: 'anchor-check-failed' as const,
          detail: 'HPS plateau exceeds 30 mm.',
        }),
      );
    }
  }

  if (ANCHOR_IDS.every((id) => checked[id])) {
    const ssnY = checked.ssn!.rulePositionM[1];
    const c7Y = checked.c7!.rulePositionM[1];
    if (!(ssnY < c7Y)) {
      failures.push(
        Object.freeze({
          id: 'c7',
          code: 'height-order-broken' as const,
          detail: 'SSN must be below C7.',
        }),
      );
    }
    for (const id of ['hps-l', 'hps-r'] as const) {
      const y = checked[id]!.rulePositionM[1];
      if (y < ssnY - 0.01 || y > c7Y + 0.01) {
        failures.push(
          Object.freeze({
            id,
            code: 'height-order-broken' as const,
            detail: 'HPS is outside the neck height order.',
          }),
        );
      }
    }
  }

  if (failures.length > 0) {
    const code = failures.some((failure) => failure.code === 'topology-mismatch')
      ? 'topology-mismatch'
      : failures.some((failure) => failure.code === 'anchor-rule-failed')
        ? 'anchor-rule-failed'
        : failures.some((failure) => failure.code === 'height-order-broken')
          ? 'height-order-broken'
          : 'anchor-check-failed';
    return failureResult(code, failures, checked);
  }

  const anchors = Object.freeze(
    Object.fromEntries(ANCHOR_IDS.map((id) => [id, checked[id]!])) as Record<
      SurfaceAnchorIdV1,
      CheckedSurfaceAnchorV1
    >,
  );
  const heightFractions = Object.freeze(
    Object.fromEntries(
      ANCHOR_IDS.map((id) => [id, fractionY(anchors[id].rulePositionM[1], currentBounds)]),
    ) as Record<SurfaceAnchorIdV1, number>,
  );
  return Object.freeze({ ok: true as const, anchors, heightFractions });
}
