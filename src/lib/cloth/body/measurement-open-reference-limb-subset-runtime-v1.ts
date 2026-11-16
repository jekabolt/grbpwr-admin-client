import {
  loadMakeHumanLimbCircumferenceDeltaBundleV1,
  type MakeHumanLimbCircumferenceDeltaBundleV1,
} from './makehuman-limb-circumference-delta-bundle-v1';
import { createMakeHumanLimbCircumferenceUniformModesV1 } from './makehuman-limb-circumference-uniform-modes-v1';
import {
  loadMakeHumanTorsoShapeDeltaBundleV1,
  type MakeHumanTorsoShapeDeltaBundleV1,
} from './makehuman-torso-shape-delta-bundle-v1';
import { createMakeHumanUniformWaistHipModesV1 } from './makehuman-uniform-waist-hip-modes-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import type { MeasurementOpenReferenceDisplayQualityGateResultV1 } from './measurement-open-reference-display-quality-gate-v1';
import { createLocalizedThighResearchModeV1 } from './measurement-open-reference-localized-thigh-research-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  snapshotMeasurementOpenReferenceDisplayArtifactV1,
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from './measurement-open-reference-display-v1';
import {
  type OpenReferenceLimbCoefficientEnvelopeV1,
  type OpenReferenceLimbFinalClosureDropV1,
  type OpenReferenceLimbFinalClosureModeResultV1,
} from './measurement-open-reference-limb-final-closure-v1';
import { solveMeasurementOpenReferenceLimbFinalClosureInWorkerV1 } from './measurement-open-reference-limb-final-closure-worker-v1';
import type {
  MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1,
  MeasurementOpenReferenceLimbFinalClosureWorkerResultV1,
} from './measurement-open-reference-limb-final-closure-worker-protocol-v1';
import type { OpenReferenceLimbCircumferenceKeyV1 } from './measurement-open-reference-limb-circumference-solver-v1';
import type {
  OpenReferenceLimbCircumferenceModeV1,
  OpenReferenceSparseDeltaFieldV1,
} from './measurement-open-reference-limb-circumference-solver-v1';
import { deriveOpenReferenceLimbSectionStationsV1 } from './measurement-open-reference-limb-section-station-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';
import { measureMeshPlaneSectionPerimetersV1 } from './mesh-plane-section-perimeter-v1';

export const MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_RUNTIME_V1 =
  'measurement-open-reference-limb-subset-runtime/v1' as const;

export const MEASUREMENT_OPEN_REFERENCE_LIMB_COMPOSITION_MEASURE_V1 =
  'measurement-open-reference-limb-composition/v1' as const;

function measuredCompositionStage<T>(stage: string, operation: () => T): T {
  const clock = globalThis.performance;
  const startedAt = clock?.now();
  try {
    return operation();
  } finally {
    if (clock && startedAt != null && typeof clock.measure === 'function') {
      try {
        clock.measure(MEASUREMENT_OPEN_REFERENCE_LIMB_COMPOSITION_MEASURE_V1, {
          start: startedAt,
          end: clock.now(),
          detail: Object.freeze({ stage }),
        });
      } catch {
        // Performance evidence must never affect the fail-closed geometry result.
      }
    }
  }
}

export const MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1 = Object.freeze([
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
] as const satisfies readonly OpenReferenceLimbCircumferenceKeyV1[]);

export type MeasurementOpenReferenceLimbSubsetKeyV1 =
  (typeof MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1)[number];

export const MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_ENVELOPE_V1 = Object.freeze({
  bicepCircumferenceMm: Object.freeze({ decrease: 0.75, increase: 1 }),
  wristCircumferenceMm: Object.freeze({ decrease: 1, increase: 1 }),
  thighCircumferenceMm: Object.freeze({ decrease: 1, increase: 1 }),
  calfCircumferenceMm: Object.freeze({ decrease: 1, increase: 1 }),
  ankleCircumferenceMm: Object.freeze({ decrease: 0.9, increase: 1 }),
} as const satisfies Readonly<
  Record<MeasurementOpenReferenceLimbSubsetKeyV1, OpenReferenceLimbCoefficientEnvelopeV1>
>);

export type MeasurementOpenReferenceLimbSubsetRuntimeStatusV1 =
  | 'error'
  | 'partial'
  | 'represented'
  | 'unrepresented';

export interface MeasurementOpenReferenceLimbSubsetRuntimeDiagnosticV1 {
  readonly code:
    | 'base-mismatch'
    | 'channel-dropped'
    | 'pose-not-admitted'
    | 'runtime-unavailable'
    | 'target-limited'
    | 'whole-set-quality-rollback';
  readonly measurementKey: OpenReferenceLimbCircumferenceKeyV1 | null;
  readonly message: string;
  readonly reasons: readonly string[];
}

export interface MeasurementOpenReferenceLimbSubsetRuntimeResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_RUNTIME_V1;
  readonly role: 'CC0_OPEN_REFERENCE_A_POSE_LIMB_GEOMETRIC_PROXIES';
  readonly status: MeasurementOpenReferenceLimbSubsetRuntimeStatusV1;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  /** Owner-isolated final waist/hip display accepted as this solve's immutable input. */
  readonly waistHipDisplayMesh: MeasurementSurfaceMeshV1;
  /** A separate owner-isolated display mesh; the waist/hip input is never rewritten. */
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly requestedGeometricProxies: readonly MeasurementOpenReferenceLimbSubsetKeyV1[];
  readonly representedGeometricProxies: readonly MeasurementOpenReferenceLimbSubsetKeyV1[];
  /** Visible bounded endpoints that intentionally do not claim the requested value was reached. */
  readonly limitedGeometricProxies?: readonly MeasurementOpenReferenceLimbSubsetKeyV1[];
  readonly droppedGeometricProxies: readonly OpenReferenceLimbFinalClosureDropV1[];
  readonly modeResults: readonly OpenReferenceLimbFinalClosureModeResultV1[];
  readonly diagnostics: readonly MeasurementOpenReferenceLimbSubsetRuntimeDiagnosticV1[];
  readonly qualityGate: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
  readonly compiledContentRevision: string | null;
  readonly geometricProxyCount: {
    readonly requested: number;
    readonly represented: number;
    readonly limited?: number;
    readonly maximum: number;
  };
  readonly claims: {
    readonly visualReferenceOnly: true;
    readonly geometricPlaneLoopOnly: true;
    readonly exactRequiredMeasurementCoverageChanged: false;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly measurementProtocolEquivalent: false;
    readonly populationRepresentativenessClaimed: false;
    readonly realBodyValidationClaimed: false;
    readonly garmentFitClaimed: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
    readonly jointAnchorDeltasAdmitted: false;
    readonly nonAPoseSupported: false;
    readonly selfIntersection: 'not-evaluated-after-deformation';
  };
}

export type MeasurementOpenReferenceLimbSubsetBundleLoaderV1 =
  () => Promise<MakeHumanLimbCircumferenceDeltaBundleV1>;
export type MeasurementOpenReferenceLimbSubsetTorsoBundleLoaderV1 =
  () => Promise<MakeHumanTorsoShapeDeltaBundleV1>;
export type MeasurementOpenReferenceLimbFinalClosureEvaluatorV1 = (
  options: MeasurementOpenReferenceLimbFinalClosureWorkerOptionsV1,
  signal?: AbortSignal,
) => Promise<MeasurementOpenReferenceLimbFinalClosureWorkerResultV1>;

export const MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_RUNTIME_CLAIMS_V1 = Object.freeze({
  visualReferenceOnly: true as const,
  geometricPlaneLoopOnly: true as const,
  exactRequiredMeasurementCoverageChanged: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  measurementProtocolEquivalent: false as const,
  populationRepresentativenessClaimed: false as const,
  realBodyValidationClaimed: false as const,
  garmentFitClaimed: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  jointAnchorDeltasAdmitted: false as const,
  nonAPoseSupported: false as const,
  selfIntersection: 'not-evaluated-after-deformation' as const,
});

function qualitySnapshot(
  value: MeasurementOpenReferenceDisplayQualityGateResultV1 | null | undefined,
): MeasurementOpenReferenceDisplayQualityGateResultV1 | null {
  if (!value) return null;
  return Object.freeze({
    ...value,
    reasons: Object.freeze([...value.reasons]),
    metrics: Object.freeze({ ...value.metrics }),
    policy: Object.freeze({ ...value.policy }),
    claims: Object.freeze({ ...value.claims }),
  });
}

function runtimeResult(options: {
  readonly status: MeasurementOpenReferenceLimbSubsetRuntimeStatusV1;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly waistHipDisplayMesh: MeasurementSurfaceMeshV1;
  readonly displayMesh?: MeasurementSurfaceMeshV1;
  readonly requestedGeometricProxies?: readonly MeasurementOpenReferenceLimbSubsetKeyV1[];
  readonly representedGeometricProxies?: readonly MeasurementOpenReferenceLimbSubsetKeyV1[];
  readonly limitedGeometricProxies?: readonly MeasurementOpenReferenceLimbSubsetKeyV1[];
  readonly droppedGeometricProxies?: readonly OpenReferenceLimbFinalClosureDropV1[];
  readonly modeResults?: readonly OpenReferenceLimbFinalClosureModeResultV1[];
  readonly diagnostics?: readonly MeasurementOpenReferenceLimbSubsetRuntimeDiagnosticV1[];
  readonly qualityGate?: MeasurementOpenReferenceDisplayQualityGateResultV1 | null;
  readonly compiledContentRevision?: string | null;
}): MeasurementOpenReferenceLimbSubsetRuntimeResultV1 {
  const requested = Object.freeze([...(options.requestedGeometricProxies ?? [])]);
  const represented = Object.freeze([...(options.representedGeometricProxies ?? [])]);
  const limited = Object.freeze([...(options.limitedGeometricProxies ?? [])]);
  const openReference = snapshotMeasurementOpenReferenceDisplayArtifactV1(options.openReference);
  const waistHipDisplayMesh = snapshotMeasurementSurfaceMeshV1(options.waistHipDisplayMesh);
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_RUNTIME_V1,
    role: 'CC0_OPEN_REFERENCE_A_POSE_LIMB_GEOMETRIC_PROXIES' as const,
    status: options.status,
    openReference,
    waistHipDisplayMesh,
    displayMesh: snapshotMeasurementSurfaceMeshV1(options.displayMesh ?? waistHipDisplayMesh),
    requestedGeometricProxies: requested,
    representedGeometricProxies: represented,
    limitedGeometricProxies: limited,
    droppedGeometricProxies: Object.freeze(
      (options.droppedGeometricProxies ?? []).map((drop) =>
        Object.freeze({
          measurementKey: drop.measurementKey,
          reasons: Object.freeze([...drop.reasons]),
        }),
      ),
    ),
    modeResults: Object.freeze(
      (options.modeResults ?? []).map((modeResult) => Object.freeze({ ...modeResult })),
    ),
    diagnostics: Object.freeze(
      (options.diagnostics ?? []).map((diagnostic) =>
        Object.freeze({ ...diagnostic, reasons: Object.freeze([...diagnostic.reasons]) }),
      ),
    ),
    qualityGate: qualitySnapshot(options.qualityGate),
    compiledContentRevision: options.compiledContentRevision ?? null,
    geometricProxyCount: Object.freeze({
      requested: requested.length,
      represented: represented.length,
      limited: limited.length,
      maximum: 5 as const,
    }),
    claims: MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_RUNTIME_CLAIMS_V1,
  });
}

function assertMeshTopology(
  mesh: MeasurementSurfaceMeshV1,
  basis: MakeHumanOpenReferenceBasisV1,
  label: string,
): void {
  if (
    mesh.vertexCount !== basis.positionsSourceUnits.length / 3 ||
    mesh.triangleCount !== basis.indices.length / 3 ||
    mesh.positions.length !== basis.positionsSourceUnits.length ||
    mesh.indices.length !== basis.indices.length ||
    !mesh.positions.every(Number.isFinite)
  ) {
    throw new Error(`${label} geometry does not match the production basis topology.`);
  }
  for (let index = 0; index < basis.indices.length; index += 1) {
    if (mesh.indices[index] !== basis.indices[index]) {
      throw new Error(`${label} indices do not match the production basis topology.`);
    }
  }
}

function assertInputBinding(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly waistHipDisplayMesh: MeasurementSurfaceMeshV1;
}): void {
  const { basis, measurements, openReference, waistHipDisplayMesh } = options;
  if (basis.schemaVersion !== MAKEHUMAN_OPEN_REFERENCE_BASIS_V1) {
    throw new Error('A parsed production MakeHuman basis is required.');
  }
  const metadata = MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[basis.kind];
  if (
    openReference.provenance.basis.kind !== basis.kind ||
    openReference.provenance.basis.derivedBasisSha256 !== metadata.derivedBasisSha256 ||
    openReference.provenance.basis.basisAssetRevision !== metadata.basisAssetRevision ||
    openReference.provenance.basis.postprocessRevision !== metadata.postprocessRevision
  ) {
    throw new Error('Open-reference provenance does not match the repaired production basis.');
  }
  assertMeshTopology(openReference.mesh, basis, 'Open-reference input');
  assertMeshTopology(waistHipDisplayMesh, basis, 'Waist/hip display input');

  const sourceHeight = basis.sourceMaximumY - basis.sourceMinimumY;
  const scaleMPerSourceUnit = measurements.heightMm / 1000 / sourceHeight;
  if (!Number.isFinite(scaleMPerSourceUnit) || scaleMPerSourceUnit <= 0) {
    throw new Error('Requested height cannot bind the repaired production basis.');
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
        throw new Error('Open-reference input and requested height do not match.');
      }
    }
  }
}

function diagnostic(
  code: MeasurementOpenReferenceLimbSubsetRuntimeDiagnosticV1['code'],
  measurementKey: OpenReferenceLimbCircumferenceKeyV1 | null,
  message: string,
  reasons: readonly string[] = [],
): MeasurementOpenReferenceLimbSubsetRuntimeDiagnosticV1 {
  return Object.freeze({ code, measurementKey, message, reasons: Object.freeze([...reasons]) });
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

function measureModeMm(options: {
  readonly positionsM: Float32Array;
  readonly stationPositionsM: Float32Array;
  readonly triangleIndices: Uint16Array | Uint32Array;
  readonly mode: OpenReferenceLimbCircumferenceModeV1;
}): number {
  const stations = deriveOpenReferenceLimbSectionStationsV1({
    positionsM: options.stationPositionsM,
    mode: options.mode,
  });
  const values = stations.map((station) => {
    const measured = measureMeshPlaneSectionPerimetersV1({
      positionsM: options.positionsM,
      triangleIndices: options.triangleIndices,
      planeOriginM: station.originM,
      planeNormal: station.normal,
      selection: { kind: 'nearest-seed', seedM: station.originM },
    });
    if (!measured.ok || !measured.selectedLoop) {
      throw new Error('Localized thigh bounded endpoint could not be measured.');
    }
    return measured.selectedLoop.perimeterM * 1000;
  });
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function createMeasurementOpenReferenceLimbSubsetRuntimeFailureV1(options: {
  readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly message: string;
}): MeasurementOpenReferenceLimbSubsetRuntimeResultV1 {
  return runtimeResult({
    status: 'error',
    openReference: options.waistHipRuntime.openReference,
    waistHipDisplayMesh: options.waistHipRuntime.displayMesh,
    diagnostics: [diagnostic('runtime-unavailable', null, options.message)],
  });
}

/**
 * Code-only A-pose runtime for four robust limb proxies plus the spatially localized thigh
 * candidate. It snapshots every caller-owned view before the first await, never rewrites the final
 * waist/hip display, and keeps non-A poses disabled until joint-anchor deltas receive an independent
 * admission. A thigh request beyond the localized coefficient envelope is visibly clamped and
 * typed as limited; it is never reported as exact representation.
 */
export async function createMeasurementOpenReferenceLimbSubsetRuntimeV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly loadLimbBundle?: MeasurementOpenReferenceLimbSubsetBundleLoaderV1;
  readonly loadTorsoBundle?: MeasurementOpenReferenceLimbSubsetTorsoBundleLoaderV1;
  readonly solveFinalClosure?: MeasurementOpenReferenceLimbFinalClosureEvaluatorV1;
  readonly signal?: AbortSignal;
}): Promise<MeasurementOpenReferenceLimbSubsetRuntimeResultV1> {
  const basis: MakeHumanOpenReferenceBasisV1 = Object.freeze({
    ...options.basis,
    positionsSourceUnits: options.basis.positionsSourceUnits.slice(),
    indices: options.basis.indices.slice(),
  });
  const measurements: CanonicalBodyMeasurementsMm = Object.freeze({ ...options.measurements });
  const openReference = snapshotMeasurementOpenReferenceDisplayArtifactV1(
    options.waistHipRuntime.openReference,
  );
  const waistHipDisplayMesh = snapshotMeasurementSurfaceMeshV1(options.waistHipRuntime.displayMesh);
  const requested = MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1.filter(
    (key) => measurements[key] != null,
  );
  const preflightDiagnostics: MeasurementOpenReferenceLimbSubsetRuntimeDiagnosticV1[] = [];

  if (openReference.pose !== 'A') {
    return runtimeResult({
      status: 'error',
      openReference,
      waistHipDisplayMesh,
      requestedGeometricProxies: requested,
      diagnostics: [
        ...preflightDiagnostics,
        diagnostic(
          'pose-not-admitted',
          null,
          'Limb geometric proxies are disabled outside the A pose until joint-anchor deltas are admitted.',
        ),
      ],
    });
  }
  try {
    assertInputBinding({ basis, measurements, openReference, waistHipDisplayMesh });
  } catch (reason: unknown) {
    return runtimeResult({
      status: 'error',
      openReference,
      waistHipDisplayMesh,
      requestedGeometricProxies: requested,
      diagnostics: [
        ...preflightDiagnostics,
        diagnostic(
          'base-mismatch',
          null,
          reason instanceof Error ? reason.message : 'Limb runtime input binding is invalid.',
        ),
      ],
    });
  }
  if (requested.length === 0) {
    return runtimeResult({
      status: 'unrepresented',
      openReference,
      waistHipDisplayMesh,
      requestedGeometricProxies: requested,
      diagnostics: preflightDiagnostics,
    });
  }

  try {
    const [limbBundle, torsoBundle] = await Promise.all([
      (options.loadLimbBundle ?? loadMakeHumanLimbCircumferenceDeltaBundleV1)(),
      (options.loadTorsoBundle ?? loadMakeHumanTorsoShapeDeltaBundleV1)(),
    ]);
    const { limb, torso } = measuredCompositionStage('compile-modes', () => ({
      limb: createMakeHumanLimbCircumferenceUniformModesV1({
        basis,
        heightMm: measurements.heightMm,
        bundle: limbBundle,
      }),
      torso: createMakeHumanUniformWaistHipModesV1({
        basis,
        heightMm: measurements.heightMm,
        bundle: torsoBundle,
      }),
    }));
    const hipMode = torso.modes.find(
      ({ measurementKey }) => measurementKey === 'hipCircumferenceMm',
    );
    const thighMode = limb.modes.find(
      ({ measurementKey }) => measurementKey === 'thighCircumferenceMm',
    );
    if (!hipMode || !thighMode) {
      throw new Error('Localized thigh production inputs are missing.');
    }
    const localizedThigh = measuredCompositionStage('localize-thigh', () =>
      createLocalizedThighResearchModeV1({
        mode: thighMode,
        positionsM: waistHipDisplayMesh.positions,
        hipStationYM: hipMode.stationOriginM[1],
        fadeDepthM: 0.12,
      }),
    );
    const limbModes = Object.freeze(
      limb.modes
        .map((mode) =>
          mode.measurementKey === 'thighCircumferenceMm' ? localizedThigh.mode : mode,
        )
        .filter(({ measurementKey }) =>
          MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1.includes(
            measurementKey as MeasurementOpenReferenceLimbSubsetKeyV1,
          ),
        ),
    );
    const solveMeasurements = { ...measurements };
    const limited: MeasurementOpenReferenceLimbSubsetKeyV1[] = [];
    if (measurements.thighCircumferenceMm != null) {
      const { baselineMm, decreaseMm, increaseMm } = measuredCompositionStage(
        'measure-thigh-envelope',
        () => ({
          baselineMm: measureModeMm({
            positionsM: waistHipDisplayMesh.positions,
            stationPositionsM: waistHipDisplayMesh.positions,
            triangleIndices: basis.indices,
            mode: localizedThigh.mode,
          }),
          decreaseMm: measureModeMm({
            positionsM: addScaledField(
              waistHipDisplayMesh.positions,
              localizedThigh.mode.decrease,
              MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_ENVELOPE_V1.thighCircumferenceMm.decrease,
            ),
            stationPositionsM: waistHipDisplayMesh.positions,
            triangleIndices: basis.indices,
            mode: localizedThigh.mode,
          }),
          increaseMm: measureModeMm({
            positionsM: addScaledField(
              waistHipDisplayMesh.positions,
              localizedThigh.mode.increase,
              MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_ENVELOPE_V1.thighCircumferenceMm.increase,
            ),
            stationPositionsM: waistHipDisplayMesh.positions,
            triangleIndices: basis.indices,
            mode: localizedThigh.mode,
          }),
        }),
      );
      if (!(decreaseMm < baselineMm && baselineMm < increaseMm)) {
        throw new Error('Localized thigh bounded endpoints are not monotonic.');
      }
      const boundedTargetMm = Math.min(
        increaseMm,
        Math.max(decreaseMm, measurements.thighCircumferenceMm),
      );
      if (boundedTargetMm !== measurements.thighCircumferenceMm) {
        solveMeasurements.thighCircumferenceMm = boundedTargetMm;
        limited.push('thighCircumferenceMm');
        preflightDiagnostics.push(
          diagnostic(
            'target-limited',
            'thighCircumferenceMm',
            `Thigh ${measurements.thighCircumferenceMm.toFixed(3)} mm is outside the localized safe range ${decreaseMm.toFixed(3)}..${increaseMm.toFixed(3)} mm; the nearest bounded endpoint is displayed.`,
          ),
        );
      }
    }
    const solvedClosure = await (
      options.solveFinalClosure ?? solveMeasurementOpenReferenceLimbFinalClosureInWorkerV1
    )(
      {
        uniformPositionsM: limb.positionsM,
        waistHipPositionsM: waistHipDisplayMesh.positions,
        triangleIndices: basis.indices,
        measurements: solveMeasurements,
        limbModes,
        torsoModes: torso.modes,
        measurementKeys: MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1,
        coefficientEnvelope: MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_ENVELOPE_V1,
        binarySearchIterations: 16,
      },
      options.signal,
    );
    const solved = solvedClosure.result;
    const solvedRepresented = solved.representedMeasurements.filter(
      (key): key is MeasurementOpenReferenceLimbSubsetKeyV1 =>
        MEASUREMENT_OPEN_REFERENCE_LIMB_SUBSET_KEYS_V1.includes(
          key as MeasurementOpenReferenceLimbSubsetKeyV1,
        ),
    );
    const limitedSet = new Set(limited);
    const represented = solvedRepresented.filter((key) => !limitedSet.has(key));
    const appliedLimited = limited.filter((key) => solvedRepresented.includes(key));
    const diagnostics = [
      ...preflightDiagnostics,
      ...solved.droppedMeasurements.map((drop) =>
        diagnostic(
          drop.reasons.includes('combined-quality-unsafe')
            ? 'whole-set-quality-rollback'
            : 'channel-dropped',
          drop.measurementKey,
          `Limb geometric proxy ${drop.measurementKey} failed closed.`,
          drop.reasons,
        ),
      ),
    ];
    const status =
      represented.length === requested.length
        ? ('represented' as const)
        : represented.length + appliedLimited.length > 0
          ? ('partial' as const)
          : ('unrepresented' as const);
    const displayMesh = Object.freeze({
      ...waistHipDisplayMesh,
      positions: solved.positionsM,
      byteLength: solved.positionsM.byteLength + waistHipDisplayMesh.indices.byteLength,
    });
    return runtimeResult({
      status,
      openReference,
      waistHipDisplayMesh,
      displayMesh,
      requestedGeometricProxies: requested,
      representedGeometricProxies: represented,
      limitedGeometricProxies: appliedLimited,
      droppedGeometricProxies: solved.droppedMeasurements,
      modeResults: solved.modeResults,
      diagnostics,
      qualityGate: solved.qualityGate,
      compiledContentRevision: solvedClosure.contentRevision,
    });
  } catch (reason: unknown) {
    return runtimeResult({
      status: 'error',
      openReference,
      waistHipDisplayMesh,
      requestedGeometricProxies: requested,
      diagnostics: [
        ...preflightDiagnostics,
        diagnostic(
          'runtime-unavailable',
          null,
          reason instanceof Error ? reason.message : 'Limb runtime is unavailable.',
        ),
      ],
    });
  }
}
