import {
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_CIRCUMFERENCE_SOLVER_V1 =
  'measurement-open-reference-limb-circumference-solver/v1' as const;

export const OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1 = Object.freeze([
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
] as const);

export type OpenReferenceLimbCircumferenceKeyV1 =
  (typeof OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1)[number];

export interface OpenReferenceSparseDeltaFieldV1 {
  readonly vertexIndices: Uint16Array;
  /** XYZ deltas in metres, aligned one-to-one with `vertexIndices`. */
  readonly deltasM: Float32Array;
}

export interface OpenReferenceLimbCircumferenceModeV1 {
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly decrease: OpenReferenceSparseDeltaFieldV1;
  readonly increase: OpenReferenceSparseDeltaFieldV1;
}

export interface OpenReferenceLimbCircumferenceSolverPolicyV1 {
  readonly maximumCoefficient: number;
  readonly binarySearchIterations: number;
  readonly bilateralResponseRatioLimit: number;
  readonly minimumResponseMm: number;
}

export const DEFAULT_OPEN_REFERENCE_LIMB_CIRCUMFERENCE_SOLVER_POLICY_V1 = Object.freeze({
  maximumCoefficient: 1,
  binarySearchIterations: 24,
  bilateralResponseRatioLimit: 1.5,
  minimumResponseMm: 0.25,
} satisfies OpenReferenceLimbCircumferenceSolverPolicyV1);

export type OpenReferenceLimbCircumferenceSolverDiagnosticCodeV1 =
  | 'bilateral-response-unsafe'
  | 'direction-response-invalid'
  | 'mode-missing'
  | 'proxy-support-incomplete'
  | 'target-clamped';

export interface OpenReferenceLimbCircumferenceSolverDiagnosticV1 {
  readonly severity: 'warning';
  readonly code: OpenReferenceLimbCircumferenceSolverDiagnosticCodeV1;
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly message: string;
}

export interface OpenReferenceLimbCircumferenceModeResultV1 {
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly direction: 'decrease' | 'increase';
  readonly coefficient: number;
  readonly targetMm: number;
  readonly baselineProxyMm: number;
  readonly achievedProxyMm: number;
  readonly clamped: boolean;
}

export interface OpenReferenceLimbCircumferenceSolverResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LIMB_CIRCUMFERENCE_SOLVER_V1;
  readonly role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly modeResults: readonly OpenReferenceLimbCircumferenceModeResultV1[];
  readonly diagnostics: readonly OpenReferenceLimbCircumferenceSolverDiagnosticV1[];
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly tapeMeasurementEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly selfIntersection: 'not-evaluated-after-deformation';
  };
}

const FALSE_CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  tapeMeasurementEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  selfIntersection: 'not-evaluated-after-deformation' as const,
});

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface BilateralProxyMm {
  readonly combined: number;
  readonly left: number;
  readonly right: number;
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function snapshotPolicy(
  policy: Partial<OpenReferenceLimbCircumferenceSolverPolicyV1> | undefined,
): OpenReferenceLimbCircumferenceSolverPolicyV1 {
  const value = { ...DEFAULT_OPEN_REFERENCE_LIMB_CIRCUMFERENCE_SOLVER_POLICY_V1, ...policy };
  if (!finitePositive(value.maximumCoefficient) || value.maximumCoefficient > 4) {
    throw new RangeError('maximumCoefficient must be finite and within 0..4.');
  }
  if (
    !Number.isSafeInteger(value.binarySearchIterations) ||
    value.binarySearchIterations < 1 ||
    value.binarySearchIterations > 64
  ) {
    throw new RangeError('binarySearchIterations must be an integer within 1..64.');
  }
  if (
    !Number.isFinite(value.bilateralResponseRatioLimit) ||
    value.bilateralResponseRatioLimit < 1 ||
    value.bilateralResponseRatioLimit > 10
  ) {
    throw new RangeError('bilateralResponseRatioLimit must be finite and within 1..10.');
  }
  if (!finitePositive(value.minimumResponseMm)) {
    throw new RangeError('minimumResponseMm must be finite and positive.');
  }
  return Object.freeze(value);
}

function validatePositions(positionsM: Float32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('positionsM must be a non-empty XYZ Float32Array.');
  }
  if (![...positionsM].every(Number.isFinite)) {
    throw new TypeError('positionsM contains a non-finite coordinate.');
  }
}

function validateField(
  field: OpenReferenceSparseDeltaFieldV1,
  vertexCount: number,
  label: string,
): void {
  if (!(field.vertexIndices instanceof Uint16Array) || !(field.deltasM instanceof Float32Array)) {
    throw new TypeError(`${label} must use Uint16Array indices and Float32Array deltasM.`);
  }
  if (field.vertexIndices.length === 0 || field.deltasM.length !== field.vertexIndices.length * 3) {
    throw new TypeError(`${label} sparse field lengths are invalid.`);
  }
  const seen = new Set<number>();
  for (let index = 0; index < field.vertexIndices.length; index += 1) {
    const vertex = field.vertexIndices[index];
    if (vertex >= vertexCount) throw new RangeError(`${label} vertex index is out of range.`);
    if (seen.has(vertex)) throw new TypeError(`${label} contains a duplicate vertex index.`);
    seen.add(vertex);
    const offset = index * 3;
    if (
      !Number.isFinite(field.deltasM[offset]) ||
      !Number.isFinite(field.deltasM[offset + 1]) ||
      !Number.isFinite(field.deltasM[offset + 2])
    ) {
      throw new TypeError(`${label} contains a non-finite delta.`);
    }
  }
}

function support(mode: OpenReferenceLimbCircumferenceModeV1): Uint16Array {
  return Uint16Array.from(
    [...new Set([...mode.decrease.vertexIndices, ...mode.increase.vertexIndices])].sort(
      (left, right) => left - right,
    ),
  );
}

function addScaledField(
  target: Float32Array,
  source: Float32Array,
  field: OpenReferenceSparseDeltaFieldV1,
  coefficient: number,
): void {
  target.set(source);
  for (let index = 0; index < field.vertexIndices.length; index += 1) {
    const vertexOffset = field.vertexIndices[index] * 3;
    const deltaOffset = index * 3;
    target[vertexOffset] += field.deltasM[deltaOffset] * coefficient;
    target[vertexOffset + 1] += field.deltasM[deltaOffset + 1] * coefficient;
    target[vertexOffset + 2] += field.deltasM[deltaOffset + 2] * coefficient;
  }
}

function centroid(positionsM: Float32Array, vertices: readonly number[]): Vec3 {
  const total = vertices.reduce(
    (sum, vertex) => {
      const offset = vertex * 3;
      sum.x += positionsM[offset];
      sum.y += positionsM[offset + 1];
      sum.z += positionsM[offset + 2];
      return sum;
    },
    { x: 0, y: 0, z: 0 },
  );
  return {
    x: total.x / vertices.length,
    y: total.y / vertices.length,
    z: total.z / vertices.length,
  };
}

/** Fixed-iteration power method. The initial axis is the largest covariance diagonal. */
function principalAxis(positionsM: Float32Array, vertices: readonly number[], center: Vec3): Vec3 {
  const covariance = [0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number];
  for (const vertex of vertices) {
    const offset = vertex * 3;
    const x = positionsM[offset] - center.x;
    const y = positionsM[offset + 1] - center.y;
    const z = positionsM[offset + 2] - center.z;
    covariance[0] += x * x;
    covariance[1] += y * y;
    covariance[2] += z * z;
    covariance[3] += x * y;
    covariance[4] += x * z;
    covariance[5] += y * z;
  }
  let axis: Vec3 =
    covariance[0] >= covariance[1] && covariance[0] >= covariance[2]
      ? { x: 1, y: 0, z: 0 }
      : covariance[1] >= covariance[2]
        ? { x: 0, y: 1, z: 0 }
        : { x: 0, y: 0, z: 1 };
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const next = {
      x: covariance[0] * axis.x + covariance[3] * axis.y + covariance[4] * axis.z,
      y: covariance[3] * axis.x + covariance[1] * axis.y + covariance[5] * axis.z,
      z: covariance[4] * axis.x + covariance[5] * axis.y + covariance[2] * axis.z,
    };
    const length = Math.hypot(next.x, next.y, next.z);
    if (length <= Number.EPSILON) return axis;
    axis = { x: next.x / length, y: next.y / length, z: next.z / length };
  }
  return axis;
}

function sideProxyMm(positionsM: Float32Array, vertices: readonly number[]): number | null {
  if (vertices.length < 6) return null;
  const center = centroid(positionsM, vertices);
  const axis = principalAxis(positionsM, vertices, center);
  let radialSquared = 0;
  for (const vertex of vertices) {
    const offset = vertex * 3;
    const x = positionsM[offset] - center.x;
    const y = positionsM[offset + 1] - center.y;
    const z = positionsM[offset + 2] - center.z;
    const axial = x * axis.x + y * axis.y + z * axis.z;
    radialSquared += Math.max(0, x * x + y * y + z * z - axial * axial);
  }
  const rmsRadiusM = Math.sqrt(radialSquared / vertices.length);
  return finitePositive(rmsRadiusM) ? rmsRadiusM * 2 * Math.PI * 1000 : null;
}

/**
 * Project-owned geometric proxy, not a tape-measure claim. The sparse support is split at the
 * sagittal plane, a fixed PCA axis is fitted to each side, and circumference is represented by
 * `2π × RMS radial distance` around that axis.
 */
export function measureOpenReferenceBilateralCircumferenceProxyMmV1(
  positionsM: Float32Array,
  vertexIndices: Uint16Array,
): BilateralProxyMm | null {
  const left = [...vertexIndices].filter((vertex) => positionsM[vertex * 3] > 0);
  const right = [...vertexIndices].filter((vertex) => positionsM[vertex * 3] < 0);
  const leftMm = sideProxyMm(positionsM, left);
  const rightMm = sideProxyMm(positionsM, right);
  if (leftMm == null || rightMm == null) return null;
  return Object.freeze({ combined: (leftMm + rightMm) / 2, left: leftMm, right: rightMm });
}

function diagnostic(
  code: OpenReferenceLimbCircumferenceSolverDiagnosticCodeV1,
  measurementKey: OpenReferenceLimbCircumferenceKeyV1,
  message: string,
): OpenReferenceLimbCircumferenceSolverDiagnosticV1 {
  return Object.freeze({ severity: 'warning' as const, code, measurementKey, message });
}

function safeBilateralResponse(
  baseline: BilateralProxyMm,
  endpoint: BilateralProxyMm,
  direction: 'decrease' | 'increase',
  policy: OpenReferenceLimbCircumferenceSolverPolicyV1,
): boolean {
  const sign = direction === 'increase' ? 1 : -1;
  const left = (endpoint.left - baseline.left) * sign;
  const right = (endpoint.right - baseline.right) * sign;
  if (left < policy.minimumResponseMm || right < policy.minimumResponseMm) return false;
  return Math.max(left, right) / Math.min(left, right) <= policy.bilateralResponseRatioLimit;
}

function frozenResult(
  positionsM: Float32Array,
  representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[],
  modeResults: readonly OpenReferenceLimbCircumferenceModeResultV1[],
  diagnostics: readonly OpenReferenceLimbCircumferenceSolverDiagnosticV1[],
): OpenReferenceLimbCircumferenceSolverResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LIMB_CIRCUMFERENCE_SOLVER_V1,
    role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
    positionsM,
    representedMeasurements: Object.freeze([...representedMeasurements]),
    modeResults: Object.freeze(modeResults.map((value) => Object.freeze({ ...value }))),
    diagnostics: Object.freeze([...diagnostics]),
    claims: FALSE_CLAIMS,
  });
}

/**
 * Applies only explicitly supplied optional circumference measurements. Missing values preserve
 * the basis byte-for-byte. Each coefficient is bounded and solved against a deterministic visual
 * proxy; the result is not asserted to equal an anatomical tape path.
 */
export function solveOpenReferenceLimbCircumferencesV1(options: {
  readonly positionsM: Float32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly modes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly policy?: Partial<OpenReferenceLimbCircumferenceSolverPolicyV1>;
}): OpenReferenceLimbCircumferenceSolverResultV1 {
  validatePositions(options.positionsM);
  const vertexCount = options.positionsM.length / 3;
  const policy = snapshotPolicy(options.policy);
  const positionsM = options.positionsM.slice();
  const representedMeasurements: OpenReferenceLimbCircumferenceKeyV1[] = [];
  const modeResults: OpenReferenceLimbCircumferenceModeResultV1[] = [];
  const diagnostics: OpenReferenceLimbCircumferenceSolverDiagnosticV1[] = [];
  const modeKeys = new Set<OpenReferenceLimbCircumferenceKeyV1>();

  for (const mode of options.modes) {
    if (!OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1.includes(mode.measurementKey)) {
      throw new TypeError(`Unsupported limb circumference mode ${String(mode.measurementKey)}.`);
    }
    if (modeKeys.has(mode.measurementKey)) {
      throw new TypeError(`Duplicate limb circumference mode ${mode.measurementKey}.`);
    }
    modeKeys.add(mode.measurementKey);
    validateField(mode.decrease, vertexCount, `${mode.measurementKey}.decrease`);
    validateField(mode.increase, vertexCount, `${mode.measurementKey}.increase`);

    const targetMm = options.measurements[mode.measurementKey];
    if (targetMm == null) continue;
    if (!finitePositive(targetMm)) {
      throw new RangeError(`${mode.measurementKey} must be finite and positive when supplied.`);
    }
    const [minimumMm, maximumMm] = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM[mode.measurementKey];
    if (targetMm < minimumMm || targetMm > maximumMm) {
      throw new RangeError(
        `${mode.measurementKey} must be within ${minimumMm}..${maximumMm} mm when supplied.`,
      );
    }

    const proxySupport = support(mode);
    const baseline = measureOpenReferenceBilateralCircumferenceProxyMmV1(positionsM, proxySupport);
    if (!baseline) {
      diagnostics.push(
        diagnostic(
          'proxy-support-incomplete',
          mode.measurementKey,
          `${mode.measurementKey} mode has insufficient bilateral proxy support.`,
        ),
      );
      continue;
    }

    const direction = targetMm < baseline.combined ? 'decrease' : 'increase';
    const field = mode[direction];
    const endpointPositions = positionsM.slice();
    addScaledField(endpointPositions, positionsM, field, policy.maximumCoefficient);
    const endpoint = measureOpenReferenceBilateralCircumferenceProxyMmV1(
      endpointPositions,
      proxySupport,
    );
    if (!endpoint) {
      diagnostics.push(
        diagnostic(
          'direction-response-invalid',
          mode.measurementKey,
          `${mode.measurementKey} ${direction} mode produced an invalid proxy.`,
        ),
      );
      continue;
    }
    const sign = direction === 'increase' ? 1 : -1;
    if ((endpoint.combined - baseline.combined) * sign < policy.minimumResponseMm) {
      diagnostics.push(
        diagnostic(
          'direction-response-invalid',
          mode.measurementKey,
          `${mode.measurementKey} ${direction} mode does not move the proxy monotonically.`,
        ),
      );
      continue;
    }
    if (!safeBilateralResponse(baseline, endpoint, direction, policy)) {
      diagnostics.push(
        diagnostic(
          'bilateral-response-unsafe',
          mode.measurementKey,
          `${mode.measurementKey} ${direction} response is not safely bilateral.`,
        ),
      );
      continue;
    }

    const endpointPassedTarget =
      direction === 'increase' ? endpoint.combined >= targetMm : endpoint.combined <= targetMm;
    let coefficient = policy.maximumCoefficient;
    let achieved = endpoint;
    if (endpointPassedTarget) {
      let lower = 0;
      let upper = policy.maximumCoefficient;
      const candidatePositions = positionsM.slice();
      for (let iteration = 0; iteration < policy.binarySearchIterations; iteration += 1) {
        const middle = (lower + upper) / 2;
        addScaledField(candidatePositions, positionsM, field, middle);
        const candidate = measureOpenReferenceBilateralCircumferenceProxyMmV1(
          candidatePositions,
          proxySupport,
        );
        if (!candidate) throw new Error('Limb circumference proxy became invalid during solve.');
        const belowTarget = candidate.combined < targetMm;
        if (
          (direction === 'increase' && belowTarget) ||
          (direction === 'decrease' && !belowTarget)
        ) {
          lower = middle;
        } else {
          upper = middle;
        }
      }
      coefficient = (lower + upper) / 2;
      addScaledField(endpointPositions, positionsM, field, coefficient);
      const solved = measureOpenReferenceBilateralCircumferenceProxyMmV1(
        endpointPositions,
        proxySupport,
      );
      if (!solved) throw new Error('Limb circumference proxy became invalid after solve.');
      achieved = solved;
    } else {
      diagnostics.push(
        diagnostic(
          'target-clamped',
          mode.measurementKey,
          `${mode.measurementKey} target is outside the bounded visual mode response and was clamped.`,
        ),
      );
    }

    positionsM.set(endpointPositions);
    if (![...positionsM].every(Number.isFinite)) {
      throw new Error(`${mode.measurementKey} solve produced a non-finite coordinate.`);
    }
    representedMeasurements.push(mode.measurementKey);
    modeResults.push({
      measurementKey: mode.measurementKey,
      direction,
      coefficient,
      targetMm,
      baselineProxyMm: baseline.combined,
      achievedProxyMm: achieved.combined,
      clamped: !endpointPassedTarget,
    });
  }

  for (const measurementKey of OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1) {
    if (options.measurements[measurementKey] == null || modeKeys.has(measurementKey)) continue;
    diagnostics.push(
      diagnostic(
        'mode-missing',
        measurementKey,
        `${measurementKey} was supplied but its visual delta mode is unavailable.`,
      ),
    );
  }

  return frozenResult(positionsM, representedMeasurements, modeResults, diagnostics);
}
