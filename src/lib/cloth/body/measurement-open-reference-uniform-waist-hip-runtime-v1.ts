import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type { MakeHuman2ArmLengthProxyAppliedV1 } from './makehuman2-pose-compatible-length-runtime-v1';
import {
  loadMakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaBundleV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import {
  createMakeHumanUniformWaistHipModesV1,
  type UniformWaistHipKeyV1,
  type UniformWaistHipModeV1,
} from './makehuman-uniform-waist-hip-modes-v1';
import {
  snapshotMeasurementOpenReferenceDisplayArtifactV1,
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from './measurement-open-reference-display-v1';
import {
  solveOpenReferenceUniformWaistHipV1,
  type UniformWaistHipSolverResultV1,
  type UniformWaistHipSolverDiagnosticCodeV1,
  type UniformWaistHipSolverModeResultV1,
} from './measurement-open-reference-uniform-waist-hip-solver-v1';
import type { MeasurementOpenReferenceDisplayQualityGateResultV1 } from './measurement-open-reference-display-quality-gate-v1';
import { evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1 } from './measurement-open-reference-display-quality-worker-v1';
import type { MeasurementOpenReferenceDisplayQualityWorkerOptionsV1 } from './measurement-open-reference-display-quality-worker-protocol-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_V1 =
  'measurement-open-reference-uniform-waist-hip-runtime/v1' as const;

export type MeasurementOpenReferenceUniformWaistHipRuntimeStatusV1 =
  | 'error'
  | 'partial'
  | 'represented'
  | 'unrepresented';

export interface MeasurementOpenReferenceUniformWaistHipRuntimeDiagnosticV1 {
  readonly code:
    | UniformWaistHipSolverDiagnosticCodeV1
    | 'base-mismatch'
    | 'base-not-uniform'
    | 'range-widened'
    | 'range-widening-rejected'
    | 'runtime-unavailable';
  readonly measurementKey: UniformWaistHipKeyV1 | null;
  readonly message: string;
}

export interface MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_V1;
  readonly role: 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES';
  readonly status: MeasurementOpenReferenceUniformWaistHipRuntimeStatusV1;
  /** Owner-isolated height-only provenance snapshot used as the proxy solve basis. */
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  /** Visible mesh after admitted proxies; never rewrites the base deformation receipt. */
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly requestedGeometricProxies: readonly UniformWaistHipKeyV1[];
  readonly representedGeometricProxies: readonly UniformWaistHipKeyV1[];
  readonly modeResults: readonly UniformWaistHipSolverModeResultV1[];
  readonly sectionModes?: readonly UniformWaistHipModeV1[];
  readonly diagnostics: readonly MeasurementOpenReferenceUniformWaistHipRuntimeDiagnosticV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
  /** Optional helper-backed arm-length proxy binding consumed by pose and joint-overlay runtimes. */
  readonly poseCompatibleArmLengthProxy?: MakeHuman2ArmLengthProxyAppliedV1;
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

export type MeasurementOpenReferenceUniformWaistHipBundleLoaderV1 =
  () => Promise<MakeHumanTorsoShapeDeltaBundleV1>;

const REQUESTED_PROXIES = Object.freeze([
  'waistCircumferenceMm',
  'hipCircumferenceMm',
] as const satisfies readonly UniformWaistHipKeyV1[]);

export const MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_CLAIMS_V1 = Object.freeze({
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

function runtimeResult(options: {
  readonly status: MeasurementOpenReferenceUniformWaistHipRuntimeStatusV1;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly displayMesh?: MeasurementSurfaceMeshV1;
  readonly representedGeometricProxies?: readonly UniformWaistHipKeyV1[];
  readonly modeResults?: readonly UniformWaistHipSolverModeResultV1[];
  readonly sectionModes?: readonly UniformWaistHipModeV1[];
  readonly diagnostics?: readonly MeasurementOpenReferenceUniformWaistHipRuntimeDiagnosticV1[];
  readonly qualityGate?: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
}): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  const openReference = snapshotMeasurementOpenReferenceDisplayArtifactV1(options.openReference);
  const displayMesh = snapshotMeasurementSurfaceMeshV1(options.displayMesh ?? openReference.mesh);
  const qualityGate = options.qualityGate
    ? Object.freeze({
        ...options.qualityGate,
        reasons: Object.freeze([...options.qualityGate.reasons]),
        metrics: Object.freeze({ ...options.qualityGate.metrics }),
        policy: Object.freeze({ ...options.qualityGate.policy }),
        claims: Object.freeze({ ...options.qualityGate.claims }),
      })
    : null;
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_V1,
    role: 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES' as const,
    status: options.status,
    openReference,
    displayMesh,
    requestedGeometricProxies: REQUESTED_PROXIES,
    representedGeometricProxies: Object.freeze([...(options.representedGeometricProxies ?? [])]),
    modeResults: Object.freeze(
      (options.modeResults ?? []).map((modeResult) => Object.freeze({ ...modeResult })),
    ),
    sectionModes: options.sectionModes ? Object.freeze([...options.sectionModes]) : undefined,
    diagnostics: Object.freeze(
      (options.diagnostics ?? []).map((diagnostic) => Object.freeze({ ...diagnostic })),
    ),
    qualityGate,
    claims: MEASUREMENT_OPEN_REFERENCE_UNIFORM_WAIST_HIP_RUNTIME_CLAIMS_V1,
  });
}

function assertUniformBaseBinding(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly heightMm: number;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
}): void {
  const { basis, heightMm, openReference } = options;
  if (openReference.provenance.basis.kind !== basis.kind) {
    throw new Error('Open-reference artifact and basis kind do not match.');
  }
  if (
    openReference.mesh.vertexCount !== basis.positionsSourceUnits.length / 3 ||
    openReference.mesh.indices.length !== basis.indices.length ||
    openReference.mesh.positions.length !== basis.positionsSourceUnits.length
  ) {
    throw new Error('Open-reference artifact and basis topology do not match.');
  }
  for (let index = 0; index < basis.indices.length; index += 1) {
    if (openReference.mesh.indices[index] !== basis.indices[index]) {
      throw new Error('Open-reference artifact and basis indices do not match.');
    }
  }

  const sourceHeightM = (basis.sourceMaximumY - basis.sourceMinimumY) * basis.sourceUnitScaleToM;
  const scaleMPerSourceUnit = (heightMm / 1000 / sourceHeightM) * basis.sourceUnitScaleToM;
  if (!Number.isFinite(scaleMPerSourceUnit) || scaleMPerSourceUnit <= 0) {
    throw new Error('Open-reference artifact height binding is invalid.');
  }
  for (let vertex = 0; vertex < openReference.mesh.vertexCount; vertex += 1) {
    const offset = vertex * 3;
    const expected = [
      basis.positionsSourceUnits[offset] * scaleMPerSourceUnit,
      (basis.positionsSourceUnits[offset + 1] - basis.sourceMinimumY) * scaleMPerSourceUnit,
      basis.positionsSourceUnits[offset + 2] * scaleMPerSourceUnit,
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(openReference.mesh.positions[offset + axis] - expected[axis]) > 1e-6) {
        throw new Error('Open-reference artifact and requested height do not match.');
      }
    }
  }
}

/**
 * Fail-closed result used when the lazy runtime chunk or its CC0 bundle cannot be loaded. Keeping
 * this factory in the lazy module also makes the error contract testable without the React layer.
 */
export function createMeasurementOpenReferenceUniformWaistHipRuntimeFailureV1(options: {
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly message: string;
}): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  return runtimeResult({
    status: 'error',
    openReference: options.openReference,
    diagnostics: [
      Object.freeze({
        code: 'runtime-unavailable' as const,
        measurementKey: null,
        message: options.message,
      }),
    ],
  });
}

/**
 * Applies only the two CC0 directions that passed the uniform-basis combined audit. The rejected
 * general torso/Y candidate is never used as an input. Waist and hip remain geometric display
 * proxies, not canonical tape-protocol matches.
 */
export async function createMeasurementOpenReferenceUniformWaistHipRuntimeV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly loadBundle?: MeasurementOpenReferenceUniformWaistHipBundleLoaderV1;
  /**
   * Opt-in (the model-form preview passes true): a waist or hip beyond the finite morph asset is
   * re-solved with only that key's field extrapolated, and admitted only when the whole body passes
   * the quality gate including self-intersection against the admitted basis. Otherwise `limited`.
   */
  readonly widenSafeRange?: boolean;
  readonly evaluateWidenedQualityGate?: (
    options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1,
  ) => Promise<MeasurementOpenReferenceDisplayQualityGateResultV1>;
}): Promise<MeasurementOpenReferenceUniformWaistHipRuntimeResultV1> {
  const basis: MakeHumanOpenReferenceBasisV1 = Object.freeze({
    ...options.basis,
    positionsSourceUnits: options.basis.positionsSourceUnits.slice(),
    indices: options.basis.indices.slice(),
  });
  const measurements = Object.freeze({ ...options.measurements });
  const openReference = snapshotMeasurementOpenReferenceDisplayArtifactV1(options.openReference);
  if (
    openReference.deformation.status !== 'fallback-uniform' &&
    openReference.deformation.status !== 'uniform-height'
  ) {
    return runtimeResult({
      status: 'unrepresented',
      openReference,
      diagnostics: [
        Object.freeze({
          code: 'base-not-uniform' as const,
          measurementKey: null,
          message: 'Waist and hip geometric proxies require the uniform height basis.',
        }),
      ],
    });
  }
  try {
    assertUniformBaseBinding({ basis, heightMm: measurements.heightMm, openReference });
  } catch (reason: unknown) {
    return runtimeResult({
      status: 'error',
      openReference,
      diagnostics: [
        Object.freeze({
          code: 'base-mismatch' as const,
          measurementKey: null,
          message:
            reason instanceof Error ? reason.message : 'Open-reference base binding is invalid.',
        }),
      ],
    });
  }

  const bundle = await (options.loadBundle ?? loadMakeHumanTorsoShapeDeltaBundleV1)();
  const modes = createMakeHumanUniformWaistHipModesV1({
    basis,
    heightMm: measurements.heightMm,
    bundle,
  });
  const solve = (maximumCoefficientByKey?: Partial<Record<UniformWaistHipKeyV1, number>>) =>
    solveOpenReferenceUniformWaistHipV1({
      uniformPositionsM: modes.uniformPositionsM,
      triangleIndices: basis.indices,
      measurements: {
        waistCircumferenceMm: measurements.waistCircumferenceMm,
        hipCircumferenceMm: measurements.hipCircumferenceMm,
      },
      modes: modes.modes,
      ...(maximumCoefficientByKey ? { policy: { maximumCoefficientByKey } } : {}),
    });
  const bounded = solve();
  const widened = options.widenSafeRange
    ? await widenLimitedWaistHipV1({
        bounded,
        solve,
        openReference,
        triangleIndices: basis.indices,
        evaluate:
          options.evaluateWidenedQualityGate ??
          evaluateMeasurementOpenReferenceDisplayQualityInWorkerV1,
      })
    : null;
  const solved = widened?.solved ?? bounded;
  const represented = solved.representedMeasurements;
  const status =
    represented.length === REQUESTED_PROXIES.length
      ? ('represented' as const)
      : represented.length > 0
        ? ('partial' as const)
        : ('unrepresented' as const);
  const mesh = Object.freeze({
    ...openReference.mesh,
    positions: solved.positionsM,
    byteLength: solved.positionsM.byteLength + openReference.mesh.indices.byteLength,
  });
  return runtimeResult({
    status,
    openReference,
    displayMesh: mesh,
    representedGeometricProxies: represented,
    modeResults: solved.modeResults,
    sectionModes: modes.modes,
    diagnostics: [
      ...solved.diagnostics.map((diagnostic) =>
        Object.freeze({
          code: diagnostic.code,
          measurementKey: diagnostic.measurementKey,
          message: diagnostic.message,
        }),
      ),
      ...(widened?.diagnostics ?? []),
    ],
    // The local gate stays the bound receipt (pose runtime v2 recomputes and compares it).
    qualityGate: solved.qualityGate,
  });
}

/**
 * Coefficients tried, largest first, for a key the finite asset cannot reach. Checked through the
 * full preview pipeline on the ANSUR II p1/p99 waist and hip subjects of every base: no new
 * self-intersection and the local gate passes up to 3; 2 keeps that margin.
 */
export const UNIFORM_WAIST_HIP_WIDENED_COEFFICIENTS_V1 = Object.freeze([2, 1.5] as const);

async function widenLimitedWaistHipV1(options: {
  readonly bounded: UniformWaistHipSolverResultV1;
  readonly solve: (
    maximumCoefficientByKey: Partial<Record<UniformWaistHipKeyV1, number>>,
  ) => UniformWaistHipSolverResultV1;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly evaluate: (
    options: MeasurementOpenReferenceDisplayQualityWorkerOptionsV1,
  ) => Promise<MeasurementOpenReferenceDisplayQualityGateResultV1>;
}): Promise<{
  readonly solved?: UniformWaistHipSolverResultV1;
  readonly diagnostics: readonly MeasurementOpenReferenceUniformWaistHipRuntimeDiagnosticV1[];
} | null> {
  const limitedKeys = [
    ...new Set(
      options.bounded.diagnostics
        .filter(({ code }) => code === 'target-limited')
        .map(({ measurementKey }) => measurementKey),
    ),
  ];
  if (limitedKeys.length === 0 || !options.bounded.qualityGate.safe) return null;
  // A limited key progresses when the wider solve represents it or limits it again at the farther
  // endpoint (the solver checks the field is monotonic up to the ceiling). Anything else, such as
  // a section that no longer measures, would drop the key, so the candidate is refused.
  const progressed = (result: UniformWaistHipSolverResultV1, key: UniformWaistHipKeyV1) =>
    result.representedMeasurements.includes(key) ||
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === 'target-limited' && diagnostic.measurementKey === key,
    );
  const rejected: string[] = [];
  for (const coefficient of UNIFORM_WAIST_HIP_WIDENED_COEFFICIENTS_V1) {
    try {
      const candidate = options.solve(
        Object.fromEntries(limitedKeys.map((key) => [key, coefficient])),
      );
      const keepsRepresented = options.bounded.representedMeasurements.every((key) =>
        candidate.representedMeasurements.includes(key),
      );
      const moved =
        limitedKeys.every((key) => progressed(candidate, key)) &&
        candidate.positionsM.some((value, index) => value !== options.bounded.positionsM[index]);
      if (!candidate.qualityGate.safe || !keepsRepresented || !moved) {
        rejected.push(`${coefficient}:solve`);
        continue;
      }
      const qualityGate = await options.evaluate({
        uniformPositionsM: options.openReference.mesh.positions,
        personalizedPositionsM: candidate.positionsM,
        triangleIndices: options.triangleIndices,
        admittedBasisRevision: options.openReference.provenance.basis.derivedBasisSha256,
      });
      if (!qualityGate.safe || !qualityGate.claims.selfIntersectionEvaluated) {
        rejected.push(`${coefficient}:${qualityGate.reasons.join('+') || 'unevaluated'}`);
        continue;
      }
      return {
        solved: candidate,
        diagnostics: limitedKeys.map((key) =>
          Object.freeze({
            code: 'range-widened' as const,
            measurementKey: key,
            message: `${key} solved with its morph field extrapolated up to ${coefficient}x the finite asset; admitted after the self-intersection gate.`,
          }),
        ),
      };
    } catch (reason: unknown) {
      rejected.push(`${coefficient}:${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }
  return {
    diagnostics: [
      Object.freeze({
        code: 'range-widening-rejected' as const,
        measurementKey: null,
        message: `Widened waist/hip range rejected (${rejected.join(', ')}); the bounded endpoint is kept.`,
      }),
    ],
  };
}
