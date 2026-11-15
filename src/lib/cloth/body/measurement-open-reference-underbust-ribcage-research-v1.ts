import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  evaluateMeasurementOpenReferenceDisplayQualityV1,
  type MeasurementOpenReferenceDisplayQualityGateResultV1,
} from './measurement-open-reference-display-quality-gate-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_UNDERBUST_RIBCAGE_RESEARCH_V1 =
  'measurement-open-reference-underbust-ribcage-research/v1' as const;

export interface MeasurementOpenReferenceUnderBustRibcageResearchResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_UNDERBUST_RIBCAGE_RESEARCH_V1;
  readonly role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY';
  readonly positionsM: Float32Array;
  readonly representedMeasurements: readonly 'underBustCircumferenceMm'[];
  readonly stationOriginM: readonly [number, number, number];
  readonly baselineMm: number | null;
  readonly targetMm: number | null;
  readonly achievedMm: number | null;
  readonly coefficient: number;
  readonly diagnostics: readonly string[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
  readonly claims: {
    readonly geometricProxyOnly: true;
    readonly ribcageBand360Degrees: true;
    readonly breastVolumeRepresented: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly productionRuntimeEligible: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

const CLAIMS = Object.freeze({
  geometricProxyOnly: true as const,
  ribcageBand360Degrees: true as const,
  breastVolumeRepresented: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  productionRuntimeEligible: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

function smoothstep01(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return bounded * bounded * (3 - 2 * bounded);
}

function section(options: {
  readonly positionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly stationOriginM: readonly [number, number, number];
}) {
  const measured = measureMeshPlaneSectionPerimetersV1({
    positionsM: options.positionsM,
    triangleIndices: options.triangleIndices,
    planeOriginM: options.stationOriginM,
    planeNormal: [0, 1, 0],
    selection: { kind: 'nearest-seed', seedM: options.stationOriginM },
    policy: { weldToleranceM: 0.00002 },
  });
  if (!measured.ok || !measured.selectedLoop) {
    throw new Error(measured.ok ? 'Under-bust loop selection failed.' : measured.errors.join('; '));
  }
  return measured.selectedLoop;
}

/**
 * Applies a bounded 360-degree ribcage band independently from the anterior chest field. This is
 * a display research proxy: missing, impossible, non-monotonic, unreachable, residual or quality
 * failures all return an owned unchanged source snapshot and no represented measurement claim.
 */
export function applyOpenReferenceUnderBustRibcageResearchV1(options: {
  readonly sourcePositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly stationOriginM: readonly [number, number, number];
}): MeasurementOpenReferenceUnderBustRibcageResearchResultV1 {
  const source = options.sourcePositionsM.slice();
  const diagnostics: string[] = [];
  const targetMm = options.measurements.underBustCircumferenceMm;
  const fail = (
    code: string,
    baselineMm: number | null = null,
  ): MeasurementOpenReferenceUnderBustRibcageResearchResultV1 => {
    diagnostics.push(code);
    return Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_UNDERBUST_RIBCAGE_RESEARCH_V1,
      role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY' as const,
      positionsM: source,
      representedMeasurements: Object.freeze([]),
      stationOriginM: Object.freeze([...options.stationOriginM]) as readonly [
        number,
        number,
        number,
      ],
      baselineMm,
      targetMm: targetMm ?? null,
      achievedMm: baselineMm,
      coefficient: 0,
      diagnostics: Object.freeze(diagnostics),
      qualityGate: null,
      claims: CLAIMS,
    });
  };

  if (targetMm == null) return fail('underbust-missing:ribcage-baseline-preserved');
  if (!Number.isFinite(targetMm) || targetMm <= 0) return fail('underbust-invalid:rollback');
  const ratioToChest = targetMm / options.measurements.chestCircumferenceMm;
  if (ratioToChest < 0.55 || ratioToChest > 1.05) {
    return fail('underbust-chest-correlation-impossible:rollback');
  }

  let baselineLoop;
  try {
    baselineLoop = section({
      positionsM: source,
      triangleIndices: options.triangleIndices,
      stationOriginM: options.stationOriginM,
    });
  } catch (reason: unknown) {
    return fail(
      `underbust-section-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
  const baselineMm = baselineLoop.perimeterM * 1000;
  const [centerX, stationY, centerZ] = baselineLoop.centroidM;
  const xRadius = Math.max(
    ...baselineLoop.pointsM.map((point) => Math.abs(point[0] - centerX)),
    0.001,
  );
  const zRadius = Math.max(
    ...baselineLoop.pointsM.map((point) => Math.abs(point[2] - centerZ)),
    0.001,
  );
  const bandRadiusM = Math.max(0.04, Math.min(0.075, options.measurements.heightMm / 25_000));
  const applyCoefficient = (coefficient: number): Float32Array => {
    const result = source.slice();
    for (let vertex = 0; vertex < result.length / 3; vertex += 1) {
      const offset = vertex * 3;
      const x = source[offset];
      const y = source[offset + 1];
      const z = source[offset + 2];
      if (Math.abs(x - centerX) > xRadius * 1.2 || Math.abs(z - centerZ) > zRadius * 1.25) {
        continue;
      }
      const weight = smoothstep01(1 - Math.abs(y - stationY) / bandRadiusM);
      if (weight <= 0) continue;
      result[offset] = x + (x - centerX) * coefficient * weight;
      result[offset + 2] = z + (z - centerZ) * coefficient * weight;
    }
    return result;
  };
  const measureMm = (positionsM: Float32Array) =>
    section({
      positionsM,
      triangleIndices: options.triangleIndices,
      stationOriginM: options.stationOriginM,
    }).perimeterM * 1000;

  if (Math.abs(targetMm - baselineMm) <= 0.5) {
    diagnostics.push('underbust-already-closed');
    const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
      uniformPositionsM: source,
      personalizedPositionsM: source,
      triangleIndices: options.triangleIndices,
    });
    return Object.freeze({
      version: MEASUREMENT_OPEN_REFERENCE_UNDERBUST_RIBCAGE_RESEARCH_V1,
      role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY' as const,
      positionsM: source,
      representedMeasurements: Object.freeze(['underBustCircumferenceMm'] as const),
      stationOriginM: Object.freeze([...options.stationOriginM]) as readonly [
        number,
        number,
        number,
      ],
      baselineMm,
      targetMm,
      achievedMm: baselineMm,
      coefficient: 0,
      diagnostics: Object.freeze(diagnostics),
      qualityGate,
      claims: CLAIMS,
    });
  }

  const direction = targetMm > baselineMm ? 1 : -1;
  const cap = 0.18 * direction;
  let endpointMm: number;
  try {
    const samples = [0, 0.25, 0.5, 0.75, 1].map((fraction) =>
      measureMm(applyCoefficient(cap * fraction)),
    );
    if (samples.slice(1).some((value, index) => (value - samples[index]) * direction <= 0.01)) {
      return fail('underbust-direction-nonmonotonic:rollback', baselineMm);
    }
    endpointMm = samples.at(-1)!;
  } catch (reason: unknown) {
    return fail(
      `underbust-candidate-section-unavailable:${reason instanceof Error ? reason.message : String(reason)}`,
      baselineMm,
    );
  }
  if ((targetMm - endpointMm) * direction > 0) {
    return fail('underbust-target-outside-bounded-envelope:rollback', baselineMm);
  }

  let lower = 0;
  let upper = Math.abs(cap);
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const magnitude = (lower + upper) / 2;
    const measuredMm = measureMm(applyCoefficient(magnitude * direction));
    if ((measuredMm - targetMm) * direction < 0) lower = magnitude;
    else upper = magnitude;
  }
  const coefficient = ((lower + upper) / 2) * direction;
  const candidate = applyCoefficient(coefficient);
  const achievedMm = measureMm(candidate);
  if (Math.abs(achievedMm - targetMm) > 0.5) {
    return fail('underbust-final-residual:rollback', baselineMm);
  }
  const qualityGate = evaluateMeasurementOpenReferenceDisplayQualityV1({
    uniformPositionsM: source,
    personalizedPositionsM: candidate,
    triangleIndices: options.triangleIndices,
  });
  if (!qualityGate.safe) return fail('underbust-quality-gate:rollback', baselineMm);

  diagnostics.push('underbust-360-ribcage-proxy-applied');
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_UNDERBUST_RIBCAGE_RESEARCH_V1,
    role: 'CC0_OPEN_REFERENCE_RESEARCH_ONLY' as const,
    positionsM: candidate,
    representedMeasurements: Object.freeze(['underBustCircumferenceMm'] as const),
    stationOriginM: Object.freeze([...options.stationOriginM]) as readonly [number, number, number],
    baselineMm,
    targetMm,
    achievedMm,
    coefficient,
    diagnostics: Object.freeze(diagnostics),
    qualityGate,
    claims: CLAIMS,
  });
}
