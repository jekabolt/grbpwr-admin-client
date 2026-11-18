import {
  CANONICAL_MEASUREMENT_PLAUSIBILITY_MM,
  type CanonicalBodyMeasurementsMm,
} from './measurement-adapter';
import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
  type MeasurementOpenReferenceDisplayQualityPolicyV1,
} from './measurement-open-reference-display-quality-gate-v1';
import {
  UNIFORM_WAIST_HIP_KEYS_V1,
  type UniformWaistHipKeyV1,
  type UniformWaistHipModeV1,
  type UniformWaistHipSparseFieldV1,
} from './makehuman-uniform-waist-hip-modes-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';
import { meshPlaneSectionLoopTapePerimeterMV1 } from './mesh-plane-section-tape-girth-v1';

export const MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_SOLVER_V1 =
  'measurement-open-reference-uniform-waist-hip-solver/v1' as const;

export interface UniformWaistHipSolverPolicyV1 {
  readonly binarySearchIterations: number;
  readonly maximumResidualMm: number;
  readonly minimumDirectionalResponseMm: number;
  readonly minimumMonotonicStepMm: number;
  readonly maximumCrossTalkMm: number;
  readonly sectionTriangleStrategy: 'bounded-candidate' | 'full-mesh';
  /**
   * Largest mode coefficient. 1 = the finite morph asset. Above 1 the same linear field is
   * extrapolated; callers must prove the result (self-intersection) before admitting it.
   */
  readonly maximumCoefficient: number;
  /** Per-key override of `maximumCoefficient`, so only a limited key is extrapolated. */
  readonly maximumCoefficientByKey?: Readonly<Partial<Record<UniformWaistHipKeyV1, number>>>;
}

export const DEFAULT_UNIFORM_WAIST_HIP_SOLVER_POLICY_V1 = Object.freeze({
  binarySearchIterations: 16,
  maximumResidualMm: 0.1,
  minimumDirectionalResponseMm: 0.25,
  minimumMonotonicStepMm: 0.01,
  maximumCrossTalkMm: 0.1,
  sectionTriangleStrategy: 'bounded-candidate',
  maximumCoefficient: 1,
} satisfies UniformWaistHipSolverPolicyV1);

export const UNIFORM_WAIST_HIP_MAXIMUM_EXTRAPOLATION_COEFFICIENT_V1 = 3;

export type UniformWaistHipSolverDiagnosticCodeV1 =
  | 'combined-quality-unsafe'
  | 'cross-talk-unsafe'
  | 'direction-response-invalid'
  | 'mode-invalid'
  | 'mode-missing'
  | 'residual-exceeded'
  | 'section-invalid'
  | 'target-limited'
  | 'target-unreachable';

export interface UniformWaistHipSolverDiagnosticV1 {
  readonly severity: 'warning';
  readonly code: UniformWaistHipSolverDiagnosticCodeV1;
  readonly measurementKey: UniformWaistHipKeyV1;
  readonly message: string;
}

export interface UniformWaistHipSolverModeResultV1 {
  readonly measurementKey: UniformWaistHipKeyV1;
  readonly direction: 'decrease' | 'increase' | 'none';
  readonly coefficient: number;
  readonly targetMm: number;
  readonly baselineMm: number;
  readonly achievedMm: number;
  readonly residualMm: number;
  readonly crossTalkMm: number;
}

export interface UniformWaistHipSolverResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_SOLVER_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_CANDIDATE';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly UniformWaistHipKeyV1[];
  readonly modeResults: readonly UniformWaistHipSolverModeResultV1[];
  readonly diagnostics: readonly UniformWaistHipSolverDiagnosticV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricPlaneLoopOnly: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly selfIntersection: 'not-evaluated-after-deformation';
  };
}

const CLAIMS = Object.freeze({
  visualReferenceOnly: true as const,
  geometricPlaneLoopOnly: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  selfIntersection: 'not-evaluated-after-deformation' as const,
});

function snapshotPolicy(
  input: Partial<UniformWaistHipSolverPolicyV1> | undefined,
): UniformWaistHipSolverPolicyV1 {
  const policy = { ...DEFAULT_UNIFORM_WAIST_HIP_SOLVER_POLICY_V1, ...input };
  if (
    !Number.isSafeInteger(policy.binarySearchIterations) ||
    policy.binarySearchIterations < 1 ||
    policy.binarySearchIterations > 32
  ) {
    throw new RangeError('binarySearchIterations must be an integer within 1..32.');
  }
  for (const key of [
    'maximumResidualMm',
    'minimumDirectionalResponseMm',
    'minimumMonotonicStepMm',
    'maximumCrossTalkMm',
  ] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (
    policy.sectionTriangleStrategy !== 'bounded-candidate' &&
    policy.sectionTriangleStrategy !== 'full-mesh'
  ) {
    throw new RangeError('sectionTriangleStrategy must be bounded-candidate or full-mesh.');
  }
  for (const value of [
    policy.maximumCoefficient,
    ...Object.values(policy.maximumCoefficientByKey ?? {}),
  ]) {
    if (
      !Number.isFinite(value) ||
      value < 1 ||
      value > UNIFORM_WAIST_HIP_MAXIMUM_EXTRAPOLATION_COEFFICIENT_V1
    ) {
      throw new RangeError(
        `maximumCoefficient must be within 1..${UNIFORM_WAIST_HIP_MAXIMUM_EXTRAPOLATION_COEFFICIENT_V1}.`,
      );
    }
  }
  return Object.freeze({
    ...policy,
    ...(policy.maximumCoefficientByKey
      ? { maximumCoefficientByKey: Object.freeze({ ...policy.maximumCoefficientByKey }) }
      : {}),
  });
}

function validateMesh(positionsM: Float32Array, indices: Uint16Array | Uint32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('uniformPositionsM must be a non-empty XYZ Float32Array.');
  }
  if (![...positionsM].every(Number.isFinite)) {
    throw new TypeError('uniformPositionsM contains a non-finite coordinate.');
  }
  if (!(indices instanceof Uint16Array) && !(indices instanceof Uint32Array)) {
    throw new TypeError('triangleIndices must be Uint16Array or Uint32Array.');
  }
  if (indices.length === 0 || indices.length % 3) {
    throw new RangeError('triangleIndices must contain complete triangles.');
  }
  const vertexCount = positionsM.length / 3;
  if ([...indices].some((vertex) => vertex >= vertexCount)) {
    throw new RangeError('triangleIndices contains an out-of-range vertex.');
  }
}

function validateField(
  field: UniformWaistHipSparseFieldV1,
  vertexCount: number,
  label: string,
): void {
  if (!(field.vertexIndices instanceof Uint16Array) || !(field.deltasM instanceof Float32Array)) {
    throw new TypeError(`${label} must use Uint16Array indices and Float32Array deltas.`);
  }
  if (field.vertexIndices.length === 0 || field.deltasM.length !== field.vertexIndices.length * 3) {
    throw new TypeError(`${label} sparse field lengths are invalid.`);
  }
  let previous = -1;
  field.vertexIndices.forEach((vertex, index) => {
    if (vertex >= vertexCount) throw new RangeError(`${label} vertex is out of range.`);
    if (vertex <= previous) throw new TypeError(`${label} indices must be strictly sorted.`);
    const offset = index * 3;
    if (
      !Number.isFinite(field.deltasM[offset]) ||
      !Number.isFinite(field.deltasM[offset + 1]) ||
      !Number.isFinite(field.deltasM[offset + 2])
    ) {
      throw new TypeError(`${label} contains a non-finite delta.`);
    }
    previous = vertex;
  });
}

function diagnostic(
  code: UniformWaistHipSolverDiagnosticCodeV1,
  measurementKey: UniformWaistHipKeyV1,
  message: string,
): UniformWaistHipSolverDiagnosticV1 {
  return Object.freeze({ severity: 'warning' as const, code, measurementKey, message });
}

function addScaledField(
  source: Float32Array,
  field: UniformWaistHipSparseFieldV1,
  coefficient: number,
): Float32Array {
  const result = source.slice();
  field.vertexIndices.forEach((vertex, index) => {
    const positionOffset = vertex * 3;
    const deltaOffset = index * 3;
    result[positionOffset] += field.deltasM[deltaOffset] * coefficient;
    result[positionOffset + 1] += field.deltasM[deltaOffset + 1] * coefficient;
    result[positionOffset + 2] += field.deltasM[deltaOffset + 2] * coefficient;
  });
  return result;
}

interface SectionTrianglePlanV1 {
  readonly mode: UniformWaistHipModeV1;
  readonly sourceVertexIndices: Uint32Array | null;
  readonly triangleIndices: Uint16Array | Uint32Array;
}

/**
 * The section plane is horizontal and every sparse vertex follows an affine path while its
 * coefficient moves through [0,maximumCoefficient]. Baseline and decrease/increase endpoint Y
 * extrema therefore conservatively contain every triangle that can cross the fixed plane during
 * either bounded solve.
 */
function buildSectionTrianglePlanV1(options: {
  readonly baselinePositionsM: Float32Array;
  readonly decreasePositionsM: Float32Array;
  readonly increasePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly mode: UniformWaistHipModeV1;
  readonly strategy: UniformWaistHipSolverPolicyV1['sectionTriangleStrategy'];
}): SectionTrianglePlanV1 {
  if (options.strategy === 'full-mesh') {
    return Object.freeze({
      mode: options.mode,
      sourceVertexIndices: null,
      triangleIndices: options.triangleIndices,
    });
  }

  const planeY = options.mode.stationOriginM[1];
  const planeToleranceM = 1e-8;
  const positionFields = [
    options.baselinePositionsM,
    options.decreasePositionsM,
    options.increasePositionsM,
  ] as const;
  const candidates: number[] = [];
  for (let offset = 0; offset < options.triangleIndices.length; offset += 3) {
    let minimumDistance = Number.POSITIVE_INFINITY;
    let maximumDistance = Number.NEGATIVE_INFINITY;
    for (const positionsM of positionFields) {
      for (let localVertex = 0; localVertex < 3; localVertex += 1) {
        const vertex = options.triangleIndices[offset + localVertex];
        const distance = positionsM[vertex * 3 + 1] - planeY;
        minimumDistance = Math.min(minimumDistance, distance);
        maximumDistance = Math.max(maximumDistance, distance);
      }
    }
    if (minimumDistance > planeToleranceM || maximumDistance < -planeToleranceM) continue;
    candidates.push(
      options.triangleIndices[offset],
      options.triangleIndices[offset + 1],
      options.triangleIndices[offset + 2],
    );
  }

  const sourceVertexIndices = Uint32Array.from(
    [...new Set(candidates)].sort((left, right) => left - right),
  );
  const localVertexBySource = new Map<number, number>();
  sourceVertexIndices.forEach((sourceVertex, localVertex) => {
    localVertexBySource.set(sourceVertex, localVertex);
  });
  const localTriangleIndices = Uint32Array.from(candidates, (sourceVertex) => {
    const localVertex = localVertexBySource.get(sourceVertex);
    if (localVertex == null) throw new Error('Torso section triangle remap is incomplete.');
    return localVertex;
  });
  return Object.freeze({
    mode: options.mode,
    sourceVertexIndices,
    triangleIndices: localTriangleIndices,
  });
}

function compactSectionPositions(
  sourcePositionsM: Float32Array,
  sourceVertexIndices: Uint32Array | null,
): Float32Array {
  if (sourceVertexIndices === null) return sourcePositionsM;
  const compact = new Float32Array(sourceVertexIndices.length * 3);
  sourceVertexIndices.forEach((sourceVertex, localVertex) => {
    compact.set(sourcePositionsM.subarray(sourceVertex * 3, sourceVertex * 3 + 3), localVertex * 3);
  });
  return compact;
}

function measureSectionMm(positionsM: Float32Array, plan: SectionTrianglePlanV1): number {
  const result = measureMeshPlaneSectionPerimetersV1({
    positionsM: compactSectionPositions(positionsM, plan.sourceVertexIndices),
    triangleIndices: plan.triangleIndices,
    planeOriginM: plan.mode.stationOriginM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: plan.mode.stationOriginM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!result.ok || !result.selectedLoop) {
    throw new Error(result.ok ? 'Torso section selection failed.' : result.errors.join('; '));
  }
  // The typed waist/hip is a tape girth: the taut hull bridges the gluteal cleft and spine
  // groove that the raw loop follows, so the solve targets the hull, not the loop.
  const perimeterMm = meshPlaneSectionLoopTapePerimeterMV1(result.selectedLoop) * 1000;
  if (!Number.isFinite(perimeterMm) || perimeterMm <= 0) {
    throw new Error('Torso section perimeter is invalid.');
  }
  return perimeterMm;
}

function monotonicSeries(
  positionsM: Float32Array,
  plan: SectionTrianglePlanV1,
  field: UniformWaistHipSparseFieldV1,
  maximumCoefficient: number,
): readonly number[] {
  const steps =
    maximumCoefficient === 1
      ? [0, 0.25, 0.5, 0.75, 1]
      : Array.from({ length: Math.ceil(maximumCoefficient * 4) + 1 }, (_, index) =>
          Math.min(index / 4, maximumCoefficient),
        );
  return Object.freeze(
    steps.map((coefficient) =>
      measureSectionMm(
        coefficient === 0 ? positionsM : addScaledField(positionsM, field, coefficient),
        plan,
      ),
    ),
  );
}

function namedMonotonic(
  series: readonly number[],
  direction: 'decrease' | 'increase',
  policy: UniformWaistHipSolverPolicyV1,
): boolean {
  const sign = direction === 'increase' ? 1 : -1;
  if ((series.at(-1)! - series[0]) * sign < policy.minimumDirectionalResponseMm) return false;
  return series.slice(1).every((value, index) => {
    const signedStep = (value - series[index]) * sign;
    return signedStep >= policy.minimumMonotonicStepMm;
  });
}

function freezeResult(options: {
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly UniformWaistHipKeyV1[];
  readonly modeResults: readonly UniformWaistHipSolverModeResultV1[];
  readonly diagnostics: readonly UniformWaistHipSolverDiagnosticV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1;
}): UniformWaistHipSolverResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_SOLVER_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_CANDIDATE' as const,
    positionsM: options.positionsM,
    representedMeasurements: Object.freeze([...options.representedMeasurements]),
    modeResults: Object.freeze(options.modeResults.map((value) => Object.freeze({ ...value }))),
    diagnostics: Object.freeze([...options.diagnostics]),
    qualityGate: options.qualityGate,
    claims: CLAIMS,
  });
}

/**
 * Research-only closed-loop solver for the two uniform-space directions that passed the isolated
 * geometry probe. A combined final quality failure rolls back every accepted deformation.
 */
export function solveOpenReferenceUniformWaistHipV1(options: {
  readonly uniformPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: Partial<Pick<CanonicalBodyMeasurementsMm, UniformWaistHipKeyV1>>;
  readonly modes: readonly UniformWaistHipModeV1[];
  readonly policy?: Partial<UniformWaistHipSolverPolicyV1>;
  readonly qualityPolicy?: Partial<MeasurementOpenReferenceDisplayQualityPolicyV1>;
}): UniformWaistHipSolverResultV1 {
  validateMesh(options.uniformPositionsM, options.triangleIndices);
  const policy = snapshotPolicy(options.policy);
  const original = options.uniformPositionsM.slice();
  let positionsM: Float32Array = original.slice();
  const representedMeasurements: UniformWaistHipKeyV1[] = [];
  const limitedMeasurements = new Set<UniformWaistHipKeyV1>();
  const modeResults: UniformWaistHipSolverModeResultV1[] = [];
  const diagnostics: UniformWaistHipSolverDiagnosticV1[] = [];
  const vertexCount = original.length / 3;

  const modeByKey = new Map<UniformWaistHipKeyV1, UniformWaistHipModeV1>();
  for (const measurementKey of UNIFORM_WAIST_HIP_KEYS_V1) {
    const matches = options.modes.filter((mode) => mode.measurementKey === measurementKey);
    if (matches.length !== 1) continue;
    const mode = matches[0];
    try {
      if (
        mode.stationOriginM.length !== 3 ||
        !mode.stationOriginM.every(Number.isFinite) ||
        mode.sourceChannel !==
          (measurementKey === 'waistCircumferenceMm'
            ? 'waistCircumferenceCandidate'
            : 'hipCircumferenceCandidate')
      ) {
        throw new TypeError(`${measurementKey} mode metadata is invalid.`);
      }
      validateField(mode.decrease, vertexCount, `${measurementKey}:decrease`);
      validateField(mode.increase, vertexCount, `${measurementKey}:increase`);
      modeByKey.set(measurementKey, mode);
    } catch (reason: unknown) {
      if (options.measurements[measurementKey] != null) {
        diagnostics.push(
          diagnostic(
            'mode-invalid',
            measurementKey,
            reason instanceof Error ? reason.message : String(reason),
          ),
        );
      }
    }
  }

  for (const measurementKey of UNIFORM_WAIST_HIP_KEYS_V1) {
    const targetMm = options.measurements[measurementKey];
    if (targetMm == null) continue;
    if (!Number.isFinite(targetMm) || targetMm <= 0) {
      diagnostics.push(
        diagnostic('target-unreachable', measurementKey, `${measurementKey} target is invalid.`),
      );
      continue;
    }
    const mode = modeByKey.get(measurementKey);
    const otherKey =
      measurementKey === 'waistCircumferenceMm' ? 'hipCircumferenceMm' : 'waistCircumferenceMm';
    const otherMode = modeByKey.get(otherKey);
    const ceiling = policy.maximumCoefficientByKey?.[measurementKey] ?? policy.maximumCoefficient;
    if (!mode) {
      if (!diagnostics.some((value) => value.measurementKey === measurementKey)) {
        diagnostics.push(
          diagnostic('mode-missing', measurementKey, `${measurementKey} mode is missing.`),
        );
      }
      continue;
    }
    if (!otherMode) {
      diagnostics.push(
        diagnostic(
          'mode-missing',
          measurementKey,
          `${measurementKey} cannot prove cross-talk without the paired torso mode.`,
        ),
      );
      continue;
    }

    let baselineMm: number;
    let decreaseSeries: readonly number[];
    let increaseSeries: readonly number[];
    let modePlan: SectionTrianglePlanV1;
    let otherModePlan: SectionTrianglePlanV1;
    try {
      const decreasePositionsM = addScaledField(positionsM, mode.decrease, ceiling);
      const increasePositionsM = addScaledField(positionsM, mode.increase, ceiling);
      modePlan = buildSectionTrianglePlanV1({
        baselinePositionsM: positionsM,
        decreasePositionsM,
        increasePositionsM,
        triangleIndices: options.triangleIndices,
        mode,
        strategy: policy.sectionTriangleStrategy,
      });
      otherModePlan = buildSectionTrianglePlanV1({
        baselinePositionsM: positionsM,
        decreasePositionsM,
        increasePositionsM,
        triangleIndices: options.triangleIndices,
        mode: otherMode,
        strategy: policy.sectionTriangleStrategy,
      });
      baselineMm = measureSectionMm(positionsM, modePlan);
      decreaseSeries = monotonicSeries(positionsM, modePlan, mode.decrease, ceiling);
      increaseSeries = monotonicSeries(positionsM, modePlan, mode.increase, ceiling);
    } catch (reason: unknown) {
      diagnostics.push(
        diagnostic(
          'section-invalid',
          measurementKey,
          reason instanceof Error ? reason.message : String(reason),
        ),
      );
      continue;
    }
    if (
      !namedMonotonic(decreaseSeries, 'decrease', policy) ||
      !namedMonotonic(increaseSeries, 'increase', policy)
    ) {
      diagnostics.push(
        diagnostic(
          'direction-response-invalid',
          measurementKey,
          `${measurementKey} direction response is not safely monotonic.`,
        ),
      );
      continue;
    }

    const direction =
      targetMm < baselineMm - policy.maximumResidualMm
        ? 'decrease'
        : targetMm > baselineMm + policy.maximumResidualMm
          ? 'increase'
          : 'none';
    if (direction === 'none') {
      representedMeasurements.push(measurementKey);
      modeResults.push({
        measurementKey,
        direction,
        coefficient: 0,
        targetMm,
        baselineMm,
        achievedMm: baselineMm,
        residualMm: Math.abs(baselineMm - targetMm),
        crossTalkMm: 0,
      });
      continue;
    }

    const series = direction === 'decrease' ? decreaseSeries : increaseSeries;
    const endpointMm = series.at(-1)!;
    const reachable = direction === 'decrease' ? targetMm >= endpointMm : targetMm <= endpointMm;
    if (!reachable) {
      const [minimumMm, maximumMm] = CANONICAL_MEASUREMENT_PLAUSIBILITY_MM[measurementKey];
      if (targetMm < minimumMm || targetMm > maximumMm) {
        diagnostics.push(
          diagnostic(
            'target-unreachable',
            measurementKey,
            `${measurementKey} target ${targetMm} mm is outside the plausible input interval.`,
          ),
        );
        continue;
      }
      const field = direction === 'decrease' ? mode.decrease : mode.increase;
      const candidate = addScaledField(positionsM, field, ceiling);
      let crossTalkMm: number;
      try {
        crossTalkMm = Math.abs(
          measureSectionMm(candidate, otherModePlan) - measureSectionMm(positionsM, otherModePlan),
        );
      } catch (reason: unknown) {
        diagnostics.push(
          diagnostic(
            'section-invalid',
            measurementKey,
            reason instanceof Error ? reason.message : String(reason),
          ),
        );
        continue;
      }
      if (crossTalkMm > policy.maximumCrossTalkMm) {
        diagnostics.push(
          diagnostic(
            'cross-talk-unsafe',
            measurementKey,
            `${measurementKey} bounded endpoint changes ${otherKey} by ${crossTalkMm.toFixed(3)} mm.`,
          ),
        );
        continue;
      }
      positionsM = candidate;
      limitedMeasurements.add(measurementKey);
      diagnostics.push(
        diagnostic(
          'target-limited',
          measurementKey,
          `${measurementKey} target ${targetMm} mm is outside the finite morph asset; the visual response is limited to ${endpointMm.toFixed(1)} mm.`,
        ),
      );
      continue;
    }

    const field = direction === 'decrease' ? mode.decrease : mode.increase;
    let lower = 0;
    let upper = ceiling;
    let failed = false;
    for (let iteration = 0; iteration < policy.binarySearchIterations; iteration += 1) {
      const coefficient = (lower + upper) / 2;
      try {
        const measuredMm = measureSectionMm(
          addScaledField(positionsM, field, coefficient),
          modePlan,
        );
        if (direction === 'increase') {
          if (measuredMm < targetMm) lower = coefficient;
          else upper = coefficient;
        } else if (measuredMm > targetMm) lower = coefficient;
        else upper = coefficient;
      } catch (reason: unknown) {
        diagnostics.push(
          diagnostic(
            'section-invalid',
            measurementKey,
            reason instanceof Error ? reason.message : String(reason),
          ),
        );
        failed = true;
        break;
      }
    }
    if (failed) continue;

    const coefficient = (lower + upper) / 2;
    const candidate = addScaledField(positionsM, field, coefficient);
    let achievedMm: number;
    let crossTalkMm: number;
    try {
      achievedMm = measureSectionMm(candidate, modePlan);
      crossTalkMm = Math.abs(
        measureSectionMm(candidate, otherModePlan) - measureSectionMm(positionsM, otherModePlan),
      );
    } catch (reason: unknown) {
      diagnostics.push(
        diagnostic(
          'section-invalid',
          measurementKey,
          reason instanceof Error ? reason.message : String(reason),
        ),
      );
      continue;
    }
    const residualMm = Math.abs(achievedMm - targetMm);
    if (residualMm > policy.maximumResidualMm) {
      diagnostics.push(
        diagnostic(
          'residual-exceeded',
          measurementKey,
          `${measurementKey} residual ${residualMm.toFixed(3)} mm exceeds the policy.`,
        ),
      );
      continue;
    }
    if (crossTalkMm > policy.maximumCrossTalkMm) {
      diagnostics.push(
        diagnostic(
          'cross-talk-unsafe',
          measurementKey,
          `${measurementKey} changes ${otherKey} by ${crossTalkMm.toFixed(3)} mm.`,
        ),
      );
      continue;
    }

    positionsM = candidate;
    representedMeasurements.push(measurementKey);
    modeResults.push({
      measurementKey,
      direction,
      coefficient,
      targetMm,
      baselineMm,
      achievedMm,
      residualMm,
      crossTalkMm,
    });
  }

  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: original,
    personalizedPositionsM: positionsM,
    triangleIndices: options.triangleIndices,
    policy: options.qualityPolicy,
  });
  const finalModeResults: UniformWaistHipSolverModeResultV1[] = [];
  let finalClosureSafe = true;
  for (const result of modeResults) {
    const mode = modeByKey.get(result.measurementKey)!;
    const otherKey =
      result.measurementKey === 'waistCircumferenceMm'
        ? 'hipCircumferenceMm'
        : 'waistCircumferenceMm';
    const otherMode = modeByKey.get(otherKey)!;
    try {
      const modePlan = buildSectionTrianglePlanV1({
        baselinePositionsM: positionsM,
        decreasePositionsM: addScaledField(positionsM, mode.decrease, 1),
        increasePositionsM: addScaledField(positionsM, mode.increase, 1),
        triangleIndices: options.triangleIndices,
        mode,
        strategy: policy.sectionTriangleStrategy,
      });
      const achievedMm = measureSectionMm(positionsM, modePlan);
      const residualMm = Math.abs(achievedMm - result.targetMm);
      const appliedField = result.direction === 'increase' ? mode.increase : mode.decrease;
      const withoutOwnMode = addScaledField(positionsM, appliedField, -result.coefficient);
      const otherModePlan = buildSectionTrianglePlanV1({
        baselinePositionsM: withoutOwnMode,
        decreasePositionsM: positionsM,
        increasePositionsM: positionsM,
        triangleIndices: options.triangleIndices,
        mode: otherMode,
        strategy: policy.sectionTriangleStrategy,
      });
      const finalCrossTalkMm = Math.abs(
        measureSectionMm(positionsM, otherModePlan) -
          measureSectionMm(withoutOwnMode, otherModePlan),
      );
      const crossTalkMm = Math.max(result.crossTalkMm, finalCrossTalkMm);
      if (residualMm > policy.maximumResidualMm) {
        finalClosureSafe = false;
        diagnostics.push(
          diagnostic(
            'residual-exceeded',
            result.measurementKey,
            `${result.measurementKey} final residual ${residualMm.toFixed(3)} mm exceeds the policy.`,
          ),
        );
      }
      if (crossTalkMm > policy.maximumCrossTalkMm) {
        finalClosureSafe = false;
        diagnostics.push(
          diagnostic(
            'cross-talk-unsafe',
            result.measurementKey,
            `${result.measurementKey} final cross-talk changes ${otherKey} by ${crossTalkMm.toFixed(3)} mm.`,
          ),
        );
      }
      finalModeResults.push({ ...result, achievedMm, residualMm, crossTalkMm });
    } catch (reason: unknown) {
      finalClosureSafe = false;
      diagnostics.push(
        diagnostic(
          'section-invalid',
          result.measurementKey,
          reason instanceof Error ? reason.message : String(reason),
        ),
      );
    }
  }
  if (!qualityGate.safe && (representedMeasurements.length > 0 || limitedMeasurements.size > 0)) {
    [...representedMeasurements, ...limitedMeasurements].forEach((measurementKey) => {
      diagnostics.push(
        diagnostic(
          'combined-quality-unsafe',
          measurementKey,
          `${measurementKey} was rolled back because the combined deformation failed the local quality gate.`,
        ),
      );
    });
    return freezeResult({
      positionsM: original,
      representedMeasurements: [],
      modeResults: [],
      diagnostics,
      qualityGate,
    });
  }
  if (!finalClosureSafe && representedMeasurements.length > 0) {
    return freezeResult({
      positionsM: original,
      representedMeasurements: [],
      modeResults: [],
      diagnostics,
      qualityGate,
    });
  }

  return freezeResult({
    positionsM,
    representedMeasurements,
    modeResults: finalModeResults,
    diagnostics,
    qualityGate,
  });
}
