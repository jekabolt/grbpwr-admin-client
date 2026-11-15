import { CANONICAL_MEASUREMENT_PLAUSIBILITY_MM } from './measurement-adapter';

export const MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_WARP_V1 =
  'makehuman-open-reference-arm-length-warp/v1' as const;

type Vec3 = readonly [number, number, number];
type Side = 'left' | 'right';
type Joint = 'shoulder' | 'elbow' | 'wrist';

export interface MakeHumanArmAnchorsV1 {
  readonly left: Readonly<Record<Joint, Vec3>>;
  readonly right: Readonly<Record<Joint, Vec3>>;
}

export interface MakeHumanSparseArmLengthModeV1 {
  readonly id:
    | 'upperarm-length-decr'
    | 'upperarm-length-incr'
    | 'lowerarm-length-decr'
    | 'lowerarm-length-incr';
  readonly vertexIndices: Uint16Array;
  readonly deltasSourceUnits: Float32Array;
  readonly anchorDeltasSourceUnits: MakeHumanArmAnchorsV1;
}

export interface MakeHumanArmLengthModesV1 {
  readonly upperDecr: MakeHumanSparseArmLengthModeV1;
  readonly upperIncr: MakeHumanSparseArmLengthModeV1;
  readonly lowerDecr: MakeHumanSparseArmLengthModeV1;
  readonly lowerIncr: MakeHumanSparseArmLengthModeV1;
}

/** Exact CC0 inputs used to derive the skeleton proxy and the four sparse length modes. */
export const MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_PROVENANCE_V1 = Object.freeze({
  repository: 'makehumancommunity/makehuman',
  release: 'v1.3.0',
  commit: '1f508f6083b2f823dab15de924b3bde72e08d77c',
  licenseId: 'CC0-1.0',
  skeleton: Object.freeze({
    path: 'makehuman/data/rigs/default.mhskel',
    byteSize: 117_790,
    sha256: '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24',
    jointConvention:
      'project-owned arithmetic mean of the pinned upperarm01 head, lowerarm01 head and wrist head vertex lists',
  }),
  targets: Object.freeze({
    upperDecr: Object.freeze({
      path: 'makehuman/data/targets/measure/measure-upperarm-length-decr.target',
      byteSize: 88_564,
      sha256: 'abe56f2b05ed531af994f50549730183bbc00b868ddc96aceb296ab997fbea44',
    }),
    upperIncr: Object.freeze({
      path: 'makehuman/data/targets/measure/measure-upperarm-length-incr.target',
      byteSize: 93_539,
      sha256: '274fef021ec84e4f646e82aa1df39fe9cc781fc872f0159ee815a04f970248a9',
    }),
    lowerDecr: Object.freeze({
      path: 'makehuman/data/targets/measure/measure-lowerarm-length-decr.target',
      byteSize: 92_768,
      sha256: '87287a1546234e55b7081192659a335af0ac0ff88bdebb732577352a088d87fa',
    }),
    lowerIncr: Object.freeze({
      path: 'makehuman/data/targets/measure/measure-lowerarm-length-incr.target',
      byteSize: 89_495,
      sha256: '6a5c5d34fbc5051f75d6c3511911f7542da96b8ae9cdbcbccf346411a9bf1afb',
    }),
  }),
});

function mirroredAnchors(shoulder: Vec3, elbow: Vec3, wrist: Vec3): MakeHumanArmAnchorsV1 {
  const mirror = (value: Vec3): Vec3 => [-value[0], value[1], value[2]];
  return Object.freeze({
    left: Object.freeze({ shoulder, elbow, wrist }),
    right: Object.freeze({
      shoulder: mirror(shoulder),
      elbow: mirror(elbow),
      wrist: mirror(wrist),
    }),
  });
}

/**
 * Project-derived joint proxies in source units. The raw skeleton/helper vertices remain outside
 * the repository; a future generator must reproduce these values from the exact provenance above.
 */
export const MAKEHUMAN_OPEN_REFERENCE_ARM_ANCHORS_SOURCE_UNITS_V1 = Object.freeze({
  base: mirroredAnchors(
    [1.677125, 5.2458, 0.14605],
    [3.1293625, 3.4931875, 0.1320125],
    [4.311725, 2.4518125, 1.75655],
  ),
  neutral: mirroredAnchors(
    [1.700395833333, 5.021341666667, 0.1931125],
    [3.313508333333, 3.215395833333, 0.2012625],
    [4.5331625, 1.973104166667, 1.83305],
  ),
  male: mirroredAnchors(
    [1.864916666667, 5.60755, 0.178341666667],
    [3.522070833333, 3.709104166667, 0.1563875],
    [4.868475, 2.4223125, 2.076216666667],
  ),
  female: mirroredAnchors(
    [1.535875, 4.435133333333, 0.207883333333],
    [3.104945833333, 2.7216875, 0.2461375],
    [4.19785, 1.523895833333, 1.589883333333],
  ),
});

const ZERO: Vec3 = Object.freeze([0, 0, 0]);

function pinnedModeAnchorDeltas(elbowLeft: Vec3, wristLeft: Vec3): MakeHumanArmAnchorsV1 {
  const mirror = (value: Vec3): Vec3 => [-value[0], value[1], value[2]];
  return Object.freeze({
    left: Object.freeze({ shoulder: ZERO, elbow: elbowLeft, wrist: wristLeft }),
    right: Object.freeze({
      shoulder: ZERO,
      elbow: mirror(elbowLeft),
      wrist: mirror(wristLeft),
    }),
  });
}

/** Exact arithmetic-mean helper-joint deltas at coefficient 1 for the pinned targets. */
export const MAKEHUMAN_ARM_LENGTH_MODE_ANCHOR_DELTAS_SOURCE_UNITS_V1 = Object.freeze({
  upperDecr: pinnedModeAnchorDeltas([-0.343, 0.343, 0], [-0.343, 0.343, 0]),
  upperIncr: pinnedModeAnchorDeltas([0.493, -0.493, 0], [0.493, -0.493, 0]),
  lowerDecr: pinnedModeAnchorDeltas(ZERO, [-0.209, 0.198, -0.348]),
  lowerIncr: pinnedModeAnchorDeltas(ZERO, [0.213, -0.323, 0.534]),
});

export interface MakeHumanOpenReferenceArmLengthWarpInputV1 {
  readonly positionsSourceUnits: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly anchorsSourceUnits: MakeHumanArmAnchorsV1;
  readonly modes: MakeHumanArmLengthModesV1;
  readonly armLengthMm: number;
  /** Explicit scale after any height normalization; no source-unit guess is made here. */
  readonly metricScaleMPerSourceUnit: number;
  /** Vertices that the admitted mode bundle must never move. */
  readonly protectedTorsoVertexIndices?: Uint16Array;
  readonly maximumSymmetryErrorSourceUnits?: number;
  readonly maximumEdgeStretchRatio?: number;
}

export type MakeHumanOpenReferenceArmLengthWarpFailureCodeV1 =
  | 'edge-stretch-exceeded'
  | 'input-invalid'
  | 'target-out-of-bounds';

export type MakeHumanOpenReferenceArmLengthWarpResultV1 =
  | {
      readonly ok: true;
      readonly version: typeof MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_WARP_V1;
      readonly role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY';
      readonly positionsSourceUnits: Float32Array;
      readonly coefficients: Readonly<{ upper: number; lower: number }>;
      readonly requestedArmLengthMm: number;
      readonly achievedArmLengthMm: number;
      readonly maximumEdgeStretchRatio: number;
      readonly diagnostics: readonly string[];
      readonly claims: typeof FALSE_CLAIMS;
    }
  | {
      readonly ok: false;
      readonly version: typeof MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_WARP_V1;
      readonly role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY';
      readonly code: MakeHumanOpenReferenceArmLengthWarpFailureCodeV1;
      readonly errors: readonly string[];
      readonly diagnostics: readonly string[];
      readonly claims: typeof FALSE_CLAIMS;
    };

const FALSE_CLAIMS = Object.freeze({
  surfacePathEquivalentClaimed: false as const,
  populationRepresentativenessClaimed: false as const,
  realBodyValidationClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

const DIAGNOSTICS = Object.freeze([
  'armLengthMm is represented by the CC0 skeleton shoulder-elbow-wrist centerline proxy, not by a validated sleeve surface path.',
  'The upper/lower split preserves the selected CC0 basis segment ratio; it is not population calibration.',
]);

const EXPECTED_MODE_IDS = Object.freeze({
  upperDecr: 'upperarm-length-decr',
  upperIncr: 'upperarm-length-incr',
  lowerDecr: 'lowerarm-length-decr',
  lowerIncr: 'lowerarm-length-incr',
} as const);

function failure(
  code: MakeHumanOpenReferenceArmLengthWarpFailureCodeV1,
  errors: readonly string[],
): MakeHumanOpenReferenceArmLengthWarpResultV1 {
  return Object.freeze({
    ok: false as const,
    version: MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_WARP_V1,
    role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
    code,
    errors: Object.freeze([...new Set(errors)]),
    diagnostics: DIAGNOSTICS,
    claims: FALSE_CLAIMS,
  });
}

function finiteVec(value: Vec3, label: string): void {
  if (value.length !== 3 || !value.every(Number.isFinite)) {
    throw new TypeError(`${label} must contain three finite coordinates.`);
  }
}

function addScaled(a: Vec3, b: Vec3, scale: number): Vec3 {
  return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function segmentLength(
  anchors: MakeHumanArmAnchorsV1,
  mode: MakeHumanSparseArmLengthModeV1 | null,
  coefficient: number,
  side: Side,
  segment: 'upper' | 'lower',
): number {
  const firstJoint: Joint = segment === 'upper' ? 'shoulder' : 'elbow';
  const secondJoint: Joint = segment === 'upper' ? 'elbow' : 'wrist';
  const first = mode
    ? addScaled(
        anchors[side][firstJoint],
        mode.anchorDeltasSourceUnits[side][firstJoint],
        coefficient,
      )
    : anchors[side][firstJoint];
  const second = mode
    ? addScaled(
        anchors[side][secondJoint],
        mode.anchorDeltasSourceUnits[side][secondJoint],
        coefficient,
      )
    : anchors[side][secondJoint];
  return distance(first, second);
}

function averageSegmentLength(
  anchors: MakeHumanArmAnchorsV1,
  mode: MakeHumanSparseArmLengthModeV1 | null,
  coefficient: number,
  segment: 'upper' | 'lower',
): number {
  return (
    (segmentLength(anchors, mode, coefficient, 'left', segment) +
      segmentLength(anchors, mode, coefficient, 'right', segment)) /
    2
  );
}

function validateMode(
  mode: MakeHumanSparseArmLengthModeV1,
  expectedId: MakeHumanSparseArmLengthModeV1['id'],
  vertexCount: number,
  protectedVertices: ReadonlySet<number>,
): void {
  if (mode.id !== expectedId) throw new TypeError(`Expected ${expectedId}, received ${mode.id}.`);
  if (!(mode.vertexIndices instanceof Uint16Array)) {
    throw new TypeError(`${mode.id} vertexIndices must be Uint16Array.`);
  }
  if (!(mode.deltasSourceUnits instanceof Float32Array)) {
    throw new TypeError(`${mode.id} deltasSourceUnits must be Float32Array.`);
  }
  if (mode.deltasSourceUnits.length !== mode.vertexIndices.length * 3) {
    throw new TypeError(`${mode.id} sparse delta layout is invalid.`);
  }
  let previous = -1;
  for (let offset = 0; offset < mode.vertexIndices.length; offset += 1) {
    const vertex = mode.vertexIndices[offset];
    if (vertex <= previous || vertex >= vertexCount) {
      throw new RangeError(`${mode.id} vertex indices must be sorted, unique and in range.`);
    }
    if (protectedVertices.has(vertex)) {
      throw new RangeError(`${mode.id} attempts to move protected torso vertex ${vertex}.`);
    }
    previous = vertex;
    for (let axis = 0; axis < 3; axis += 1) {
      if (!Number.isFinite(mode.deltasSourceUnits[offset * 3 + axis])) {
        throw new TypeError(`${mode.id} contains a non-finite delta.`);
      }
    }
  }
  for (const side of ['left', 'right'] as const) {
    for (const joint of ['shoulder', 'elbow', 'wrist'] as const) {
      finiteVec(
        mode.anchorDeltasSourceUnits[side][joint],
        `${mode.id}.${side}.${joint} anchor delta`,
      );
    }
  }
}

function nearZero(value: Vec3, tolerance = 1e-6): boolean {
  return Math.hypot(...value) <= tolerance;
}

function validateModeSemantics(
  anchors: MakeHumanArmAnchorsV1,
  modes: MakeHumanArmLengthModesV1,
  symmetryTolerance: number,
): void {
  for (const side of ['left', 'right'] as const) {
    if (
      !nearZero(modes.upperDecr.anchorDeltasSourceUnits[side].shoulder) ||
      !nearZero(modes.upperIncr.anchorDeltasSourceUnits[side].shoulder)
    ) {
      throw new RangeError('Upper-arm modes must keep the shoulder anchor fixed.');
    }
    for (const mode of [modes.lowerDecr, modes.lowerIncr]) {
      if (
        !nearZero(mode.anchorDeltasSourceUnits[side].shoulder) ||
        !nearZero(mode.anchorDeltasSourceUnits[side].elbow)
      ) {
        throw new RangeError('Lower-arm modes must keep shoulder and elbow anchors fixed.');
      }
    }
  }

  const baseUpperLeft = segmentLength(anchors, null, 0, 'left', 'upper');
  const baseUpperRight = segmentLength(anchors, null, 0, 'right', 'upper');
  const baseLowerLeft = segmentLength(anchors, null, 0, 'left', 'lower');
  const baseLowerRight = segmentLength(anchors, null, 0, 'right', 'lower');
  if (
    Math.abs(baseUpperLeft - baseUpperRight) > symmetryTolerance ||
    Math.abs(baseLowerLeft - baseLowerRight) > symmetryTolerance
  ) {
    throw new RangeError(
      'Arm anchors are not bilaterally symmetric within the admitted tolerance.',
    );
  }

  const checks = [
    [modes.upperDecr, 'upper', -1],
    [modes.upperIncr, 'upper', 1],
    [modes.lowerDecr, 'lower', -1],
    [modes.lowerIncr, 'lower', 1],
  ] as const;
  for (const [mode, segment, expectedDirection] of checks) {
    const baseline = averageSegmentLength(anchors, null, 0, segment);
    let previous = baseline;
    for (let step = 1; step <= 32; step += 1) {
      const next = averageSegmentLength(anchors, mode, step / 32, segment);
      if ((next - previous) * expectedDirection <= 0) {
        throw new RangeError(`${mode.id} is not strictly monotonic for its skeleton segment.`);
      }
      previous = next;
    }
    const left = segmentLength(anchors, mode, 1, 'left', segment);
    const right = segmentLength(anchors, mode, 1, 'right', segment);
    if (Math.abs(left - right) > symmetryTolerance) {
      throw new RangeError(`${mode.id} is not bilaterally symmetric.`);
    }
  }
}

function solveCoefficient(
  anchors: MakeHumanArmAnchorsV1,
  mode: MakeHumanSparseArmLengthModeV1,
  segment: 'upper' | 'lower',
  targetLength: number,
): number | null {
  const atZero = averageSegmentLength(anchors, mode, 0, segment);
  const atOne = averageSegmentLength(anchors, mode, 1, segment);
  const minimum = Math.min(atZero, atOne);
  const maximum = Math.max(atZero, atOne);
  if (targetLength < minimum - 1e-9 || targetLength > maximum + 1e-9) return null;
  if (Math.abs(targetLength - atZero) <= 1e-12) return 0;
  let low = 0;
  let high = 1;
  const increasing = atOne > atZero;
  for (let iteration = 0; iteration < 52; iteration += 1) {
    const middle = (low + high) / 2;
    const value = averageSegmentLength(anchors, mode, middle, segment);
    if (value < targetLength === increasing) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function applyMode(
  positions: Float32Array,
  mode: MakeHumanSparseArmLengthModeV1,
  coefficient: number,
): void {
  for (let offset = 0; offset < mode.vertexIndices.length; offset += 1) {
    const positionOffset = mode.vertexIndices[offset] * 3;
    const deltaOffset = offset * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      positions[positionOffset + axis] += mode.deltasSourceUnits[deltaOffset + axis] * coefficient;
    }
  }
}

function transformedAnchors(
  anchors: MakeHumanArmAnchorsV1,
  upperMode: MakeHumanSparseArmLengthModeV1,
  upperCoefficient: number,
  lowerMode: MakeHumanSparseArmLengthModeV1,
  lowerCoefficient: number,
): MakeHumanArmAnchorsV1 {
  const side = (name: Side): Readonly<Record<Joint, Vec3>> =>
    Object.freeze({
      shoulder: addScaled(
        addScaled(
          anchors[name].shoulder,
          upperMode.anchorDeltasSourceUnits[name].shoulder,
          upperCoefficient,
        ),
        lowerMode.anchorDeltasSourceUnits[name].shoulder,
        lowerCoefficient,
      ),
      elbow: addScaled(
        addScaled(
          anchors[name].elbow,
          upperMode.anchorDeltasSourceUnits[name].elbow,
          upperCoefficient,
        ),
        lowerMode.anchorDeltasSourceUnits[name].elbow,
        lowerCoefficient,
      ),
      wrist: addScaled(
        addScaled(
          anchors[name].wrist,
          upperMode.anchorDeltasSourceUnits[name].wrist,
          upperCoefficient,
        ),
        lowerMode.anchorDeltasSourceUnits[name].wrist,
        lowerCoefficient,
      ),
    });
  return Object.freeze({ left: side('left'), right: side('right') });
}

function validateTriangles(indices: Uint16Array | Uint32Array, vertexCount: number): void {
  if (!(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
    throw new TypeError('triangleIndices must be Uint16Array or Uint32Array.');
  }
  if (indices.length === 0 || indices.length % 3 !== 0) {
    throw new RangeError('triangleIndices must contain complete triangles.');
  }
  for (const index of indices) {
    if (index >= vertexCount)
      throw new RangeError('triangleIndices contains an out-of-range vertex.');
  }
}

function maximumEdgeStretch(
  before: Float32Array,
  after: Float32Array,
  indices: Uint16Array | Uint32Array,
): number {
  let maximum = 1;
  const edges = new Set<string>();
  const edge = (first: number, second: number) => {
    const a = Math.min(first, second);
    const b = Math.max(first, second);
    const key = `${a}:${b}`;
    if (edges.has(key)) return;
    edges.add(key);
    const length = (positions: Float32Array) =>
      Math.hypot(
        positions[a * 3] - positions[b * 3],
        positions[a * 3 + 1] - positions[b * 3 + 1],
        positions[a * 3 + 2] - positions[b * 3 + 2],
      );
    const oldLength = length(before);
    const newLength = length(after);
    if (oldLength <= 1e-9 || newLength <= 1e-9) {
      maximum = Number.POSITIVE_INFINITY;
      return;
    }
    maximum = Math.max(maximum, oldLength / newLength, newLength / oldLength);
  };
  for (let offset = 0; offset < indices.length; offset += 3) {
    edge(indices[offset], indices[offset + 1]);
    edge(indices[offset + 1], indices[offset + 2]);
    edge(indices[offset + 2], indices[offset]);
  }
  return maximum;
}

/**
 * Applies only pinned sparse CC0 length modes. The project-owned mapping uses a skeleton-centerline
 * proxy and preserves the selected basis' upper/lower segment ratio. It deliberately makes no fit,
 * collision, population or tape-path equivalence claim.
 */
export function warpMakeHumanOpenReferenceArmLengthV1(
  input: MakeHumanOpenReferenceArmLengthWarpInputV1,
): MakeHumanOpenReferenceArmLengthWarpResultV1 {
  try {
    if (!(input.positionsSourceUnits instanceof Float32Array)) {
      throw new TypeError('positionsSourceUnits must be Float32Array.');
    }
    if (input.positionsSourceUnits.length === 0 || input.positionsSourceUnits.length % 3 !== 0) {
      throw new RangeError('positionsSourceUnits must contain complete vertices.');
    }
    for (const value of input.positionsSourceUnits) {
      if (!Number.isFinite(value)) throw new TypeError('positionsSourceUnits must be finite.');
    }
    if (!Number.isFinite(input.metricScaleMPerSourceUnit) || input.metricScaleMPerSourceUnit <= 0) {
      throw new RangeError('metricScaleMPerSourceUnit must be finite and positive.');
    }
    const [minimumArmMm, maximumArmMm] = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM.armLengthMm;
    if (
      !Number.isFinite(input.armLengthMm) ||
      input.armLengthMm < minimumArmMm ||
      input.armLengthMm > maximumArmMm
    ) {
      throw new RangeError(`armLengthMm must be within ${minimumArmMm}..${maximumArmMm}.`);
    }
    for (const side of ['left', 'right'] as const) {
      for (const joint of ['shoulder', 'elbow', 'wrist'] as const) {
        finiteVec(input.anchorsSourceUnits[side][joint], `${side}.${joint} anchor`);
      }
    }
    const vertexCount = input.positionsSourceUnits.length / 3;
    validateTriangles(input.triangleIndices, vertexCount);
    const protectedVertices = new Set<number>(input.protectedTorsoVertexIndices ?? []);
    for (const [key, expectedId] of Object.entries(EXPECTED_MODE_IDS) as [
      keyof MakeHumanArmLengthModesV1,
      MakeHumanSparseArmLengthModeV1['id'],
    ][]) {
      validateMode(input.modes[key], expectedId, vertexCount, protectedVertices);
    }
    const symmetryTolerance = input.maximumSymmetryErrorSourceUnits ?? 1e-5;
    if (!Number.isFinite(symmetryTolerance) || symmetryTolerance < 0) {
      throw new RangeError('maximumSymmetryErrorSourceUnits must be finite and non-negative.');
    }
    validateModeSemantics(input.anchorsSourceUnits, input.modes, symmetryTolerance);

    const baseUpper = averageSegmentLength(input.anchorsSourceUnits, null, 0, 'upper');
    const baseLower = averageSegmentLength(input.anchorsSourceUnits, null, 0, 'lower');
    const baseTotal = baseUpper + baseLower;
    const requestedSourceLength = input.armLengthMm / 1000 / input.metricScaleMPerSourceUnit;
    const targetUpper = requestedSourceLength * (baseUpper / baseTotal);
    const targetLower = requestedSourceLength - targetUpper;
    const upperMode = targetUpper < baseUpper ? input.modes.upperDecr : input.modes.upperIncr;
    const lowerMode = targetLower < baseLower ? input.modes.lowerDecr : input.modes.lowerIncr;
    const upperCoefficient = solveCoefficient(
      input.anchorsSourceUnits,
      upperMode,
      'upper',
      targetUpper,
    );
    const lowerCoefficient = solveCoefficient(
      input.anchorsSourceUnits,
      lowerMode,
      'lower',
      targetLower,
    );
    if (upperCoefficient == null || lowerCoefficient == null) {
      return failure('target-out-of-bounds', [
        'The requested arm length is outside the bounded [0,1] capacity of the pinned CC0 length modes.',
      ]);
    }

    const positions = input.positionsSourceUnits.slice();
    applyMode(positions, upperMode, upperCoefficient);
    applyMode(positions, lowerMode, lowerCoefficient);
    for (const value of positions) {
      if (!Number.isFinite(value))
        throw new TypeError('Arm-length warp produced a non-finite vertex.');
    }
    const edgeStretch = maximumEdgeStretch(
      input.positionsSourceUnits,
      positions,
      input.triangleIndices,
    );
    const edgeStretchLimit = input.maximumEdgeStretchRatio ?? 1.75;
    if (!Number.isFinite(edgeStretchLimit) || edgeStretchLimit < 1) {
      throw new RangeError('maximumEdgeStretchRatio must be finite and at least 1.');
    }
    if (edgeStretch > edgeStretchLimit) {
      return failure('edge-stretch-exceeded', [
        `Arm-length warp edge-stretch ratio ${edgeStretch.toFixed(6)} exceeds ${edgeStretchLimit.toFixed(6)}.`,
      ]);
    }

    const anchors = transformedAnchors(
      input.anchorsSourceUnits,
      upperMode,
      upperCoefficient,
      lowerMode,
      lowerCoefficient,
    );
    const achievedSourceLength =
      (distance(anchors.left.shoulder, anchors.left.elbow) +
        distance(anchors.left.elbow, anchors.left.wrist) +
        distance(anchors.right.shoulder, anchors.right.elbow) +
        distance(anchors.right.elbow, anchors.right.wrist)) /
      2;
    const achievedArmLengthMm = achievedSourceLength * input.metricScaleMPerSourceUnit * 1000;
    if (Math.abs(achievedArmLengthMm - input.armLengthMm) > 1e-5) {
      throw new RangeError('Arm-length coefficient solve did not converge to the requested proxy.');
    }

    return Object.freeze({
      ok: true as const,
      version: MAKEHUMAN_OPEN_REFERENCE_ARM_LENGTH_WARP_V1,
      role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
      positionsSourceUnits: positions,
      coefficients: Object.freeze({ upper: upperCoefficient, lower: lowerCoefficient }),
      requestedArmLengthMm: input.armLengthMm,
      achievedArmLengthMm,
      maximumEdgeStretchRatio: edgeStretch,
      diagnostics: DIAGNOSTICS,
      claims: FALSE_CLAIMS,
    });
  } catch (reason: unknown) {
    return failure('input-invalid', [reason instanceof Error ? reason.message : String(reason)]);
  }
}
