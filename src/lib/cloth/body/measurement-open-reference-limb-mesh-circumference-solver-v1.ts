import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  deriveOpenReferenceLimbSectionStationsV1,
  type OpenReferenceLimbSectionStationV1,
} from './measurement-open-reference-limb-section-station-v1';
import {
  OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1,
  type OpenReferenceLimbCircumferenceKeyV1,
  type OpenReferenceLimbCircumferenceModeV1,
  type OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_MESH_CIRCUMFERENCE_SOLVER_V1 =
  'measurement-open-reference-limb-mesh-circumference-solver/v1' as const;

export interface OpenReferenceLimbMeshCircumferenceSolverPolicyV1 {
  readonly binarySearchIterations: number;
  readonly minimumDirectionalResponseMm: number;
  readonly bilateralResponseRatioLimit: number;
  readonly maximumResidualMm: number;
  readonly sectionTriangleStrategy: 'bounded-candidate' | 'full-mesh';
}

export const DEFAULT_OPEN_REFERENCE_LIMB_MESH_CIRCUMFERENCE_SOLVER_POLICY_V1 = Object.freeze({
  binarySearchIterations: 16,
  minimumDirectionalResponseMm: 0.25,
  bilateralResponseRatioLimit: 1.5,
  maximumResidualMm: 0.1,
  sectionTriangleStrategy: 'bounded-candidate',
} satisfies OpenReferenceLimbMeshCircumferenceSolverPolicyV1);

export type OpenReferenceLimbMeshCircumferenceDiagnosticCodeV1 =
  | 'bilateral-response-unsafe'
  | 'direction-response-invalid'
  | 'mode-invalid'
  | 'mode-missing'
  | 'residual-exceeded'
  | 'section-invalid'
  | 'target-unreachable';

export interface OpenReferenceLimbMeshCircumferenceDiagnosticV1 {
  readonly severity: 'warning';
  readonly code: OpenReferenceLimbMeshCircumferenceDiagnosticCodeV1;
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly message: string;
}

interface BilateralSectionMm {
  readonly negative: number;
  readonly positive: number;
  readonly average: number;
}

export interface OpenReferenceLimbMeshCircumferenceModeResultV1 {
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1;
  readonly direction: 'decrease' | 'increase' | 'none';
  readonly coefficient: number;
  readonly targetMm: number;
  readonly baselineMm: BilateralSectionMm;
  readonly achievedMm: BilateralSectionMm;
  readonly absoluteResidualMm: number;
}

export interface OpenReferenceLimbMeshCircumferenceSolverResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LIMB_MESH_CIRCUMFERENCE_SOLVER_V1;
  readonly role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[];
  readonly modeResults: readonly OpenReferenceLimbMeshCircumferenceModeResultV1[];
  readonly diagnostics: readonly OpenReferenceLimbMeshCircumferenceDiagnosticV1[];
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricPlaneLoopOnly: true;
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
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  selfIntersection: 'not-evaluated-after-deformation' as const,
});

function snapshotPolicy(
  input: Partial<OpenReferenceLimbMeshCircumferenceSolverPolicyV1> | undefined,
): OpenReferenceLimbMeshCircumferenceSolverPolicyV1 {
  const policy = {
    ...DEFAULT_OPEN_REFERENCE_LIMB_MESH_CIRCUMFERENCE_SOLVER_POLICY_V1,
    ...input,
  };
  if (
    !Number.isSafeInteger(policy.binarySearchIterations) ||
    policy.binarySearchIterations < 1 ||
    policy.binarySearchIterations > 32
  ) {
    throw new RangeError('binarySearchIterations must be an integer within 1..32.');
  }
  for (const key of ['minimumDirectionalResponseMm', 'maximumResidualMm'] as const) {
    if (!Number.isFinite(policy[key]) || policy[key] <= 0) {
      throw new RangeError(`${key} must be finite and positive.`);
    }
  }
  if (
    !Number.isFinite(policy.bilateralResponseRatioLimit) ||
    policy.bilateralResponseRatioLimit < 1 ||
    policy.bilateralResponseRatioLimit > 10
  ) {
    throw new RangeError('bilateralResponseRatioLimit must be finite and within 1..10.');
  }
  if (
    policy.sectionTriangleStrategy !== 'bounded-candidate' &&
    policy.sectionTriangleStrategy !== 'full-mesh'
  ) {
    throw new RangeError('sectionTriangleStrategy must be bounded-candidate or full-mesh.');
  }
  return Object.freeze(policy);
}

function validateMesh(positionsM: Float32Array, triangleIndices: Uint16Array | Uint32Array): void {
  if (!(positionsM instanceof Float32Array) || positionsM.length === 0 || positionsM.length % 3) {
    throw new TypeError('positionsM must be a non-empty XYZ Float32Array.');
  }
  for (const value of positionsM) {
    if (!Number.isFinite(value))
      throw new TypeError('positionsM contains a non-finite coordinate.');
  }
  if (!(triangleIndices instanceof Uint16Array) && !(triangleIndices instanceof Uint32Array)) {
    throw new TypeError('triangleIndices must be Uint16Array or Uint32Array.');
  }
  if (triangleIndices.length === 0 || triangleIndices.length % 3) {
    throw new RangeError('triangleIndices must contain complete triangles.');
  }
  const vertexCount = positionsM.length / 3;
  for (const vertex of triangleIndices) {
    if (vertex >= vertexCount) throw new RangeError('triangleIndices contains an invalid vertex.');
  }
}

function diagnostic(
  code: OpenReferenceLimbMeshCircumferenceDiagnosticCodeV1,
  measurementKey: OpenReferenceLimbCircumferenceKeyV1,
  message: string,
): OpenReferenceLimbMeshCircumferenceDiagnosticV1 {
  return Object.freeze({ severity: 'warning' as const, code, measurementKey, message });
}

function addScaledField(
  source: Float32Array,
  field: OpenReferenceSparseDeltaFieldV1,
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

interface SectionStationTrianglePlanV1 {
  readonly station: OpenReferenceLimbSectionStationV1;
  readonly sourceVertexIndices: Uint32Array | null;
  readonly triangleIndices: Uint32Array | Uint16Array;
}

function signedDistanceToStation(
  positionsM: Float32Array,
  vertex: number,
  station: OpenReferenceLimbSectionStationV1,
): number {
  const offset = vertex * 3;
  return (
    (positionsM[offset] - station.originM[0]) * station.normal[0] +
    (positionsM[offset + 1] - station.originM[1]) * station.normal[1] +
    (positionsM[offset + 2] - station.originM[2]) * station.normal[2]
  );
}

function stationDistances(
  positionsM: Float32Array,
  station: OpenReferenceLimbSectionStationV1,
): Float64Array {
  const distances = new Float64Array(positionsM.length / 3);
  for (let vertex = 0; vertex < distances.length; vertex += 1) {
    distances[vertex] = signedDistanceToStation(positionsM, vertex, station);
  }
  return distances;
}

/**
 * A vertex's signed plane distance is linear while a sparse field coefficient moves from 0 to 1.
 * Therefore the extrema at the baseline and both named endpoints conservatively contain every
 * triangle that can intersect the fixed station plane during either bounded solve. Extra triangles
 * are harmless; omitting a possible crossing would make the section graph incomplete.
 */
function buildSectionStationTrianglePlansV1(options: {
  readonly baselinePositionsM: Float32Array;
  readonly decreasePositionsM: Float32Array;
  readonly increasePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly stations: readonly OpenReferenceLimbSectionStationV1[];
  readonly strategy: OpenReferenceLimbMeshCircumferenceSolverPolicyV1['sectionTriangleStrategy'];
}): readonly SectionStationTrianglePlanV1[] {
  if (options.strategy === 'full-mesh') {
    return Object.freeze(
      options.stations.map((station) =>
        Object.freeze({
          station,
          sourceVertexIndices: null,
          triangleIndices: options.triangleIndices,
        }),
      ),
    );
  }

  const planeToleranceM = 1e-8;
  return Object.freeze(
    options.stations.map((station) => {
      const baselineDistances = stationDistances(options.baselinePositionsM, station);
      const decreaseDistances = stationDistances(options.decreasePositionsM, station);
      const increaseDistances = stationDistances(options.increasePositionsM, station);
      const distanceFields = [baselineDistances, decreaseDistances, increaseDistances] as const;
      const candidates: number[] = [];
      for (let offset = 0; offset < options.triangleIndices.length; offset += 3) {
        let minimumDistance = Number.POSITIVE_INFINITY;
        let maximumDistance = Number.NEGATIVE_INFINITY;
        for (const distances of distanceFields) {
          for (let localVertex = 0; localVertex < 3; localVertex += 1) {
            const distance = distances[options.triangleIndices[offset + localVertex]];
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
        if (localVertex == null) throw new Error('Section triangle remap is incomplete.');
        return localVertex;
      });
      return Object.freeze({
        station,
        sourceVertexIndices,
        triangleIndices: localTriangleIndices,
      });
    }),
  );
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

function measureAtStations(
  positionsM: Float32Array,
  plans: readonly SectionStationTrianglePlanV1[],
): BilateralSectionMm {
  if (plans.length !== 2) throw new Error('Exactly two limb section stations are required.');
  const values = new Map<'negative' | 'positive', number>();
  plans.forEach(({ station, sourceVertexIndices, triangleIndices }) => {
    const result = measureMeshPlaneSectionPerimetersV1({
      positionsM: compactSectionPositions(positionsM, sourceVertexIndices),
      triangleIndices,
      planeOriginM: station.originM,
      planeNormal: station.normal,
      selection: { kind: 'nearest-seed', seedM: station.originM },
    });
    if (!result.ok || !result.selectedLoop) {
      throw new Error(result.ok ? 'Section loop selection failed.' : result.errors.join('; '));
    }
    const value = result.selectedLoop.perimeterM * 1000;
    if (!Number.isFinite(value) || value <= 0) throw new Error('Section perimeter is invalid.');
    values.set(station.side, value);
  });
  const negative = values.get('negative');
  const positive = values.get('positive');
  if (negative == null || positive == null) throw new Error('Bilateral section is incomplete.');
  return Object.freeze({ negative, positive, average: (negative + positive) / 2 });
}

function safeBilateralResponse(
  baseline: BilateralSectionMm,
  endpoint: BilateralSectionMm,
  direction: 'decrease' | 'increase',
  policy: OpenReferenceLimbMeshCircumferenceSolverPolicyV1,
): boolean {
  const sign = direction === 'increase' ? 1 : -1;
  const negative = (endpoint.negative - baseline.negative) * sign;
  const positive = (endpoint.positive - baseline.positive) * sign;
  if (
    negative < policy.minimumDirectionalResponseMm ||
    positive < policy.minimumDirectionalResponseMm
  ) {
    return false;
  }
  return (
    Math.max(negative, positive) / Math.min(negative, positive) <=
    policy.bilateralResponseRatioLimit
  );
}

function freezeResult(
  positionsM: Float32Array,
  representedMeasurements: readonly OpenReferenceLimbCircumferenceKeyV1[],
  modeResults: readonly OpenReferenceLimbMeshCircumferenceModeResultV1[],
  diagnostics: readonly OpenReferenceLimbMeshCircumferenceDiagnosticV1[],
): OpenReferenceLimbMeshCircumferenceSolverResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LIMB_MESH_CIRCUMFERENCE_SOLVER_V1,
    role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
    positionsM,
    representedMeasurements: Object.freeze([...representedMeasurements]),
    modeResults: Object.freeze(modeResults.map((result) => Object.freeze({ ...result }))),
    diagnostics: Object.freeze([...diagnostics]),
    claims: CLAIMS,
  });
}

/**
 * Candidate visual-only solver. It maps an optional value to an actual closed mesh-plane section,
 * but deliberately makes no claim that the project-owned section station equals an anatomical
 * tape path or measurement protocol.
 */
export function solveOpenReferenceLimbMeshCircumferencesV1(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly modes: readonly OpenReferenceLimbCircumferenceModeV1[];
  readonly policy?: Partial<OpenReferenceLimbMeshCircumferenceSolverPolicyV1>;
}): OpenReferenceLimbMeshCircumferenceSolverResultV1 {
  validateMesh(options.positionsM, options.triangleIndices);
  const policy = snapshotPolicy(options.policy);
  let positionsM: Float32Array = options.positionsM.slice();
  const representedMeasurements: OpenReferenceLimbCircumferenceKeyV1[] = [];
  const modeResults: OpenReferenceLimbMeshCircumferenceModeResultV1[] = [];
  const diagnostics: OpenReferenceLimbMeshCircumferenceDiagnosticV1[] = [];

  for (const measurementKey of OPEN_REFERENCE_LIMB_CIRCUMFERENCE_KEYS_V1) {
    const targetMm = options.measurements[measurementKey];
    if (targetMm == null) continue;
    if (!Number.isFinite(targetMm) || targetMm <= 0) {
      diagnostics.push(
        diagnostic('target-unreachable', measurementKey, `${measurementKey} target is invalid.`),
      );
      continue;
    }
    const matches = options.modes.filter((mode) => mode.measurementKey === measurementKey);
    if (matches.length === 0) {
      diagnostics.push(
        diagnostic(
          'mode-missing',
          measurementKey,
          `${measurementKey} requires exactly one sparse direction mode.`,
        ),
      );
      continue;
    }
    if (matches.length > 1) {
      diagnostics.push(
        diagnostic(
          'mode-invalid',
          measurementKey,
          `${measurementKey} has more than one sparse direction mode.`,
        ),
      );
      continue;
    }
    const mode = matches[0];
    let stations: readonly OpenReferenceLimbSectionStationV1[];
    try {
      stations = deriveOpenReferenceLimbSectionStationsV1({ positionsM, mode });
    } catch (reason: unknown) {
      diagnostics.push(
        diagnostic(
          'mode-invalid',
          measurementKey,
          reason instanceof Error ? reason.message : String(reason),
        ),
      );
      continue;
    }

    let baseline: BilateralSectionMm;
    let decreaseEndpoint: BilateralSectionMm;
    let increaseEndpoint: BilateralSectionMm;
    let stationPlans: readonly SectionStationTrianglePlanV1[];
    try {
      const decreasePositionsM = addScaledField(positionsM, mode.decrease, 1);
      const increasePositionsM = addScaledField(positionsM, mode.increase, 1);
      stationPlans = buildSectionStationTrianglePlansV1({
        baselinePositionsM: positionsM,
        decreasePositionsM,
        increasePositionsM,
        triangleIndices: options.triangleIndices,
        stations,
        strategy: policy.sectionTriangleStrategy,
      });
      baseline = measureAtStations(positionsM, stationPlans);
      decreaseEndpoint = measureAtStations(decreasePositionsM, stationPlans);
      increaseEndpoint = measureAtStations(increasePositionsM, stationPlans);
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
      decreaseEndpoint.average >= baseline.average ||
      increaseEndpoint.average <= baseline.average
    ) {
      diagnostics.push(
        diagnostic(
          'direction-response-invalid',
          measurementKey,
          `${measurementKey} endpoints do not move the closed section as named (${decreaseEndpoint.average.toFixed(3)} < ${baseline.average.toFixed(3)} < ${increaseEndpoint.average.toFixed(3)} mm required).`,
        ),
      );
      continue;
    }
    if (
      !safeBilateralResponse(baseline, decreaseEndpoint, 'decrease', policy) ||
      !safeBilateralResponse(baseline, increaseEndpoint, 'increase', policy)
    ) {
      diagnostics.push(
        diagnostic(
          'bilateral-response-unsafe',
          measurementKey,
          `${measurementKey} endpoint response is not safely bilateral.`,
        ),
      );
      continue;
    }

    const direction =
      targetMm < baseline.average - policy.maximumResidualMm
        ? 'decrease'
        : targetMm > baseline.average + policy.maximumResidualMm
          ? 'increase'
          : 'none';
    if (direction === 'none') {
      representedMeasurements.push(measurementKey);
      modeResults.push({
        measurementKey,
        direction,
        coefficient: 0,
        targetMm,
        baselineMm: baseline,
        achievedMm: baseline,
        absoluteResidualMm: Math.abs(baseline.average - targetMm),
      });
      continue;
    }

    const endpoint = direction === 'decrease' ? decreaseEndpoint : increaseEndpoint;
    const reachable =
      direction === 'decrease'
        ? targetMm >= endpoint.average - policy.maximumResidualMm
        : targetMm <= endpoint.average + policy.maximumResidualMm;
    if (!reachable) {
      diagnostics.push(
        diagnostic(
          'target-unreachable',
          measurementKey,
          `${measurementKey} target ${targetMm} mm is outside the bounded ${direction} section interval.`,
        ),
      );
      continue;
    }

    const field = direction === 'decrease' ? mode.decrease : mode.increase;
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < policy.binarySearchIterations; iteration += 1) {
      const coefficient = (lower + upper) / 2;
      let measured: BilateralSectionMm;
      try {
        measured = measureAtStations(addScaledField(positionsM, field, coefficient), stationPlans);
      } catch (reason: unknown) {
        diagnostics.push(
          diagnostic(
            'section-invalid',
            measurementKey,
            reason instanceof Error ? reason.message : String(reason),
          ),
        );
        lower = Number.NaN;
        break;
      }
      if (direction === 'increase') {
        if (measured.average < targetMm) lower = coefficient;
        else upper = coefficient;
      } else if (measured.average > targetMm) lower = coefficient;
      else upper = coefficient;
    }
    if (!Number.isFinite(lower)) continue;

    const coefficient = (lower + upper) / 2;
    const candidate = addScaledField(positionsM, field, coefficient);
    let achieved: BilateralSectionMm;
    try {
      achieved = measureAtStations(candidate, stationPlans);
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
    const residual = Math.abs(achieved.average - targetMm);
    if (residual > policy.maximumResidualMm) {
      diagnostics.push(
        diagnostic(
          'residual-exceeded',
          measurementKey,
          `${measurementKey} closed-section residual ${residual.toFixed(3)} mm exceeds the policy.`,
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
      baselineMm: baseline,
      achievedMm: achieved,
      absoluteResidualMm: residual,
    });
  }

  return freezeResult(positionsM, representedMeasurements, modeResults, diagnostics);
}
