import { describe, expect, it, vi } from 'vitest';

import { CANONICAL_BODY_MEASUREMENTS_VERSION } from './measurement-adapter';
import {
  MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
  type MeasurementOpenReferenceBetaShapeRuntimeResultV1,
} from './measurement-open-reference-beta-shape-runtime-v1';
import type { MeasurementOpenReferenceDisplayPoseRuntimeResultV1 } from './measurement-open-reference-display-pose-runtime-v1';
import type { MeasurementOpenReferenceLimbSubsetRuntimeResultV1 } from './measurement-open-reference-limb-subset-runtime-v1';
import {
  createMeasurementOpenReferenceDisplaySnapshotOwnerV1,
  type MeasurementOpenReferenceDisplaySnapshotDependenciesV1,
} from './measurement-open-reference-display-snapshot-owner-v1';
import {
  createMeasurementOpenReferenceDisplaySnapshotOwnerV2,
  measurementOpenReferenceDisplaySnapshotSourceRevisionV2,
  type MeasurementOpenReferenceDisplaySnapshotDependenciesV2,
  type MeasurementOpenReferenceDisplaySnapshotRequestV2,
} from './measurement-open-reference-display-snapshot-owner-v2';
import {
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_DISPLAY_POSE_RUNTIME_V2,
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2,
  linkedSymmetricDisplayPoseRuntimeSourceRevisionV2,
  type MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2,
} from './measurement-open-reference-linked-symmetric-display-pose-runtime-v2';
import {
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
  MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2,
} from './measurement-open-reference-linked-symmetric-pose-lanes-diagnostic-v2';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from './measurement-open-reference-display-v1';
import {
  DEFAULT_MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_POLICY_V1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_GATE_V1,
} from './measurement-open-reference-display-quality-gate-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 } from './measurement-open-reference-display-pose-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

const MEASUREMENTS = Object.freeze({
  schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  heightMm: 1720,
  shoulderBreadthMm: 410,
  chestCircumferenceMm: 920,
  waistCircumferenceMm: 760,
  hipCircumferenceMm: 980,
  armLengthMm: 590,
  inseamMm: 780,
  bicepCircumferenceMm: 310,
  wristCircumferenceMm: 165,
  calfCircumferenceMm: 370,
  ankleCircumferenceMm: 220,
});

function mesh(marker: number): MeasurementSurfaceMeshV1 {
  const positions = new Float32Array([marker, 0, 0, marker, 1, 0, marker, 0, 1]);
  const indices = new Uint32Array([0, 1, 2]);
  return Object.freeze({
    positions,
    indices,
    vertexCount: 3,
    triangleCount: 1,
    byteLength: positions.byteLength + indices.byteLength,
  });
}

function basis(kind: 'neutral' | 'male' | 'female' = 'neutral'): MakeHumanOpenReferenceBasisV1 {
  return Object.freeze({
    schemaVersion: MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
    kind,
    sourceUnitScaleToM: 1,
    sourceMinimumY: 0,
    sourceMaximumY: 1,
    positionsSourceUnits: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]),
    indices: new Uint16Array([0, 1, 2]),
  });
}

function qualityGate() {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_GATE_V1,
    safe: true,
    reasons: Object.freeze([]),
    metrics: Object.freeze({
      vertexCount: 3,
      triangleCount: 1,
      uniqueEdgeCount: 3,
      minimumEdgeStretch: 1,
      maximumEdgeStretch: 1,
      minimumTriangleAreaRatio: 1,
      maximumTriangleAreaRatio: 1,
      minimumTriangleAspectRetention: 1,
      minimumOutputTriangleAspectQuality: 1,
      flippedTriangleCount: 0,
    }),
    policy: DEFAULT_MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_POLICY_V1,
    claims: Object.freeze({
      localGeometryQualityOnly: true as const,
      selfIntersectionEvaluated: false as const,
      anatomicalAccuracyClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
    }),
  });
}

function openReference(
  sourceRevision: string,
  kind: 'neutral' | 'male' | 'female' = 'neutral',
): MeasurementOpenReferenceDisplayArtifactV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
    sourceRevision,
    pose: 'A' as const,
    mesh: mesh(1),
    provenance: Object.freeze({
      source: MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
      basis: MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1[kind],
      role: 'CC0_OPEN_REFERENCE_VISUAL_ONLY' as const,
      analyticalFrameRevision: 'measurement-body-frame-v2.0.1' as const,
    }),
    deformation: Object.freeze({
      status: 'uniform-height' as const,
      representedRequiredMeasurements: Object.freeze(['heightMm' as const]),
      discardedPersonalizedCandidate: false,
      personalizedCandidateEvaluated: false,
      selectionReason: 'production-uniform-policy' as const,
      qualityGateSubject: 'uniform-basis-invariant' as const,
      qualityGate: qualityGate(),
    }),
    claims: Object.freeze({
      visualReferenceOnly: true as const,
      measurementClosureClaimed: false as const,
      populationRepresentativenessClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
      selfIntersection: 'not-evaluated-after-deformation' as const,
    }),
  });
}

function waistHipRuntime(
  reference: MeasurementOpenReferenceDisplayArtifactV1,
  marker = 2,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  return Object.freeze({
    version: 'measurement-open-reference-uniform-waist-hip-runtime/v1' as const,
    role: 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES' as const,
    status: 'partial' as const,
    openReference: reference,
    displayMesh: mesh(marker),
    requestedGeometricProxies: Object.freeze([
      'waistCircumferenceMm' as const,
      'hipCircumferenceMm' as const,
    ]),
    representedGeometricProxies: Object.freeze([
      'waistCircumferenceMm' as const,
      'hipCircumferenceMm' as const,
    ]),
    modeResults: Object.freeze([]),
    diagnostics: Object.freeze([]),
    qualityGate: qualityGate(),
    claims: Object.freeze({
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
    }),
  });
}

function limbRuntime(
  reference: MeasurementOpenReferenceDisplayArtifactV1,
  waistHip: MeasurementSurfaceMeshV1,
): MeasurementOpenReferenceLimbSubsetRuntimeResultV1 {
  return Object.freeze({
    version: 'measurement-open-reference-limb-subset-runtime/v1' as const,
    role: 'CC0_OPEN_REFERENCE_A_POSE_LIMB_GEOMETRIC_PROXIES' as const,
    status: 'represented' as const,
    openReference: reference,
    waistHipDisplayMesh: waistHip,
    displayMesh: mesh(3),
    requestedGeometricProxies: Object.freeze([
      'bicepCircumferenceMm' as const,
      'wristCircumferenceMm' as const,
      'calfCircumferenceMm' as const,
      'ankleCircumferenceMm' as const,
    ]),
    representedGeometricProxies: Object.freeze([
      'bicepCircumferenceMm' as const,
      'wristCircumferenceMm' as const,
      'calfCircumferenceMm' as const,
      'ankleCircumferenceMm' as const,
    ]),
    droppedGeometricProxies: Object.freeze([]),
    modeResults: Object.freeze([]),
    diagnostics: Object.freeze([]),
    qualityGate: qualityGate(),
    compiledContentRevision: 'fixture',
    geometricProxyCount: Object.freeze({ requested: 4, represented: 4, maximum: 4 as const }),
    claims: Object.freeze({
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
    }),
  });
}

function impossiblePoseRuntime(): Promise<MeasurementOpenReferenceDisplayPoseRuntimeResultV1> {
  throw new Error('A-rest must never call the V1 pose runtime.');
}

function v1Dependencies(
  calls: string[] = [],
): MeasurementOpenReferenceDisplaySnapshotDependenciesV1 {
  return {
    loadBasis: async (kind) => {
      calls.push(`v1-basis:${kind}`);
      return basis(kind);
    },
    createUniformHeightDisplay: ({ basis: loaded, frame }) => {
      calls.push('v1-height');
      return openReference(frame.sourceRevision, loaded.kind as 'neutral' | 'male' | 'female');
    },
    createWaistHipRuntime: async ({ openReference: reference }) => {
      calls.push('v1-waist');
      return waistHipRuntime(reference);
    },
    createLimbRuntime: async ({ waistHipRuntime: waistHip }) => {
      calls.push('v1-limbs');
      return limbRuntime(waistHip.openReference, waistHip.displayMesh);
    },
    createPoseRuntime: impossiblePoseRuntime,
  };
}

const RUNTIME_CLAIMS = Object.freeze({
  displayOnly: true as const,
  linkedSymmetryOnly: true as const,
  discreteConfigurationsOnly: true as const,
  oneLaneAtATimeOnly: true as const,
  continuousIntervalSafetyClaimed: false as const,
  combinedLaneSafetyClaimed: false as const,
  actualRenderedGarmentPairEvaluated: false as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  initializationAdmitted: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
  persistenceAuthority: false as const,
  productionAuthority: false as const,
  deploymentAuthority: false as const,
});

type NonZeroLinkedInput =
  | { readonly lane: 'relax'; readonly degrees: 1 | 2 | 3 | 4 }
  | { readonly lane: 'raise'; readonly degrees: 5 | 10 | 15 | 20 | 25 };

function requireNonZeroLinkedInput(
  input: Parameters<
    MeasurementOpenReferenceDisplaySnapshotDependenciesV2['createLinkedPoseRuntime']
  >[0]['input'],
): NonZeroLinkedInput {
  if (input.lane === 'relax' && input.degrees === 0) {
    throw new Error('A-rest must never call the V2 pose runtime.');
  }
  return input as NonZeroLinkedInput;
}

function linkedRuntime(
  input: NonZeroLinkedInput,
  sourceRevision: string,
  marker = 4,
): MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2 {
  const id =
    input.lane === 'relax'
      ? (`relax-${input.degrees}` as const)
      : (`raise-${input.degrees}` as const);
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_DISPLAY_POSE_RUNTIME_V2,
    validatedByDiagnosticContract:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_DIAGNOSTIC_V2,
    parameterRevision:
      MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_LANES_PARAMETERS_V2.revision,
    configurationId: id,
    configurationKey: `linked-symmetric:${id}` as const,
    input: Object.freeze({ ...input }),
    sourceRevision: linkedSymmetricDisplayPoseRuntimeSourceRevisionV2(sourceRevision, input),
    displayMesh: mesh(marker),
    maximumJointPivotResidualM: 0,
    source: Object.freeze({
      matrixSha256: MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2,
      rigSha256: metadata.rigSha256,
      anchorSha256: metadata.anchorSha256,
      poseResourcesLoaded: true,
    }),
    claims: RUNTIME_CLAIMS,
  });
}

function betaShapeRuntime(
  proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
): MeasurementOpenReferenceBetaShapeRuntimeResultV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
    role: 'CC0_OPEN_REFERENCE_BETA_VISUAL_SHAPE' as const,
    status: 'represented' as const,
    fkProxyRuntime: Object.freeze({ ...proxyRuntime, displayMesh: mesh(3) }),
    representedVisualControls: Object.freeze([
      'heightMm' as const,
      'shoulderBreadthMm' as const,
      'chestCircumferenceMm' as const,
      'waistCircumferenceMm' as const,
      'hipCircumferenceMm' as const,
      'bicepCircumferenceMm' as const,
      'wristCircumferenceMm' as const,
      'calfCircumferenceMm' as const,
      'ankleCircumferenceMm' as const,
    ]),
    limitedVisualControls: Object.freeze(['armLengthMm' as const]),
    unrepresentedRequiredControls: Object.freeze(['inseamMm' as const]),
    chestShoulderDiagnostics: Object.freeze([]),
    limbStatus: 'represented' as const,
    sourceRevisionSuffix: `${MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1};represented=heightMm,shoulderBreadthMm,chestCircumferenceMm,waistCircumferenceMm,hipCircumferenceMm,bicepCircumferenceMm,wristCircumferenceMm,calfCircumferenceMm,ankleCircumferenceMm;limited=armLengthMm;armLengthMm=limited-centerline-proxy;inseamMm=unrepresented`,
    claims: Object.freeze({
      visualReferenceOnly: true as const,
      geometricProxyOnly: true as const,
      exactHeightOnly: true as const,
      anteriorChestPosteriorHeldFixed: true as const,
      underBustIndependentRibcageBand: true as const,
      armLengthCenterlineProxyOnly: true as const,
      sleeveLengthRepresented: false as const,
      inseamRepresented: false as const,
      canonicalMeasurementSemanticMatchClaimed: false as const,
      anatomicalTapePathEquivalent: false as const,
      measurementProtocolEquivalent: false as const,
      populationRepresentativenessClaimed: false as const,
      realBodyValidationClaimed: false as const,
      garmentFitClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
      collisionCandidateEligible: false as const,
      productionAuthority: false as const,
    }),
  });
}

function request(
  values: Partial<MeasurementOpenReferenceDisplaySnapshotRequestV2> = {},
): MeasurementOpenReferenceDisplaySnapshotRequestV2 {
  return {
    modelId: 'model-a',
    modelContentRevision: 'model-content-a',
    inputFingerprint: 'model-a-form-values-v2',
    basisKind: 'neutral',
    measurements: MEASUREMENTS,
    poseSelection: Object.freeze({ lane: 'raise' as const, degrees: 10 as const }),
    ...values,
  };
}

function linkedDependencies(
  calls: string[] = [],
): MeasurementOpenReferenceDisplaySnapshotDependenciesV2 {
  return {
    aRestOwner: createMeasurementOpenReferenceDisplaySnapshotOwnerV1(v1Dependencies(calls)),
    loadBasis: async (kind) => {
      calls.push(`basis:${kind}`);
      return basis(kind);
    },
    createUniformHeightDisplay: ({ basis: loaded, frame }) => {
      calls.push('height');
      return openReference(frame.sourceRevision, loaded.kind as 'neutral' | 'male' | 'female');
    },
    createWaistHipRuntime: async ({ openReference: reference }) => {
      calls.push('waist');
      return waistHipRuntime(reference);
    },
    createBetaShapeRuntime: async ({ waistHipRuntime: proxyRuntime }) => {
      calls.push('shape');
      return betaShapeRuntime(proxyRuntime);
    },
    createLinkedPoseRuntime: async ({ input, sourceRevision }) => {
      calls.push(`pose:${input.lane}-${input.degrees}`);
      return linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision);
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

describe('per-model open-reference linked-pose display snapshot owner v2', () => {
  it('delegates A-rest to V1, retains limb behavior, and never enters linked pose work', async () => {
    const calls: string[] = [];
    const deps = linkedDependencies(calls);
    const loadBasis = vi.fn(deps.loadBasis);
    const createLinkedPoseRuntime = vi.fn(deps.createLinkedPoseRuntime);
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      loadBasis,
      createLinkedPoseRuntime,
    });
    const result = await owner.build(
      request({ poseSelection: Object.freeze({ lane: 'relax' as const, degrees: 0 as const }) }),
    );

    expect(result.status).toBe('committed');
    if (result.status !== 'committed') return;
    expect(calls).toEqual(['v1-basis:neutral', 'v1-height', 'v1-waist', 'v1-limbs']);
    expect(loadBasis).not.toHaveBeenCalled();
    expect(createLinkedPoseRuntime).not.toHaveBeenCalled();
    expect(result.snapshot.pose).toMatchObject({
      configurationKey: 'linked-symmetric:relax-0',
      status: 'a-rest',
      maximumJointPivotResidualM: 0,
      poseResourcesLoaded: false,
      runtimeSourceRevision: null,
    });
    expect(result.snapshot.limbs).toMatchObject({
      status: 'represented',
      requestedGeometricProxies: [
        'bicepCircumferenceMm',
        'wristCircumferenceMm',
        'calfCircumferenceMm',
        'ankleCircumferenceMm',
      ],
      representedGeometricProxies: [
        'bicepCircumferenceMm',
        'wristCircumferenceMm',
        'calfCircumferenceMm',
        'ankleCircumferenceMm',
      ],
    });
    expect(result.snapshot.binding.delegatedV1SourceRevision).not.toBeNull();
  });

  it('builds the product card A-rest once through the shared beta shape owner', async () => {
    const calls: string[] = [];
    const configured = linkedDependencies(calls);
    const dependencies = {
      loadBasis: configured.loadBasis,
      createUniformHeightDisplay: configured.createUniformHeightDisplay,
      createWaistHipRuntime: configured.createWaistHipRuntime,
      createBetaShapeRuntime: configured.createBetaShapeRuntime,
      createLinkedPoseRuntime: configured.createLinkedPoseRuntime,
    };
    const createLinkedPoseRuntime = vi.fn(dependencies.createLinkedPoseRuntime);
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...dependencies,
      createLinkedPoseRuntime,
    });
    const result = await owner.build(
      request({ poseSelection: Object.freeze({ lane: 'relax' as const, degrees: 0 as const }) }),
    );

    expect(result.status).toBe('committed');
    if (result.status !== 'committed') return;
    expect(calls).toEqual(['basis:neutral', 'height', 'waist', 'shape']);
    expect(createLinkedPoseRuntime).not.toHaveBeenCalled();
    expect(result.snapshot.binding.delegatedV1SourceRevision).toBeNull();
    expect(result.snapshot.binding.sourceRevision).toContain(
      `shapeRuntimeRevision=${MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1}`,
    );
    expect(result.snapshot.shape).toMatchObject({
      status: 'represented',
      runtimeRevision: MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_RUNTIME_V1,
      representedVisualControls: expect.arrayContaining([
        'shoulderBreadthMm',
        'chestCircumferenceMm',
        'waistCircumferenceMm',
        'hipCircumferenceMm',
      ]),
    });
    expect(result.snapshot.displayMesh.positions[0]).toBe(3);
    expect(result.snapshot.pose.status).toBe('a-rest');
  });

  it('commits the linked order with exact binding, no limbs, owned arrays, and negative authority', async () => {
    const calls: string[] = [];
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2(linkedDependencies(calls));
    const result = await owner.build(request());

    expect(result.status).toBe('committed');
    if (result.status !== 'committed') return;
    expect(calls).toEqual(['basis:neutral', 'height', 'waist', 'shape', 'pose:raise-10']);
    expect(result.snapshot.binding).toMatchObject({
      modelId: 'model-a',
      modelContentRevision: 'model-content-a',
      inputFingerprint: 'model-a-form-values-v2',
      basisKind: 'neutral',
      poseConfigurationKey: 'linked-symmetric:raise-10',
      matrixSha256: MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2,
      delegatedV1SourceRevision: null,
    });
    expect(result.snapshot.binding.sourceRevision).toContain(
      `linkedPoseMatrixSha256=${MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2}`,
    );
    expect(result.snapshot.limbs).toEqual({
      status: 'omitted-linked-pose',
      requestedGeometricProxies: [
        'bicepCircumferenceMm',
        'wristCircumferenceMm',
        'calfCircumferenceMm',
        'ankleCircumferenceMm',
      ],
      representedGeometricProxies: [],
    });
    expect(result.snapshot.claims).toEqual({
      displayOnly: true,
      linkedSymmetryOnly: true,
      discreteConfigurationsOnly: true,
      oneLaneAtATimeOnly: true,
      continuousIntervalSafetyClaimed: false,
      combinedLaneSafetyClaimed: false,
      actualRenderedGarmentPairEvaluated: false,
      initializationAdmitted: false,
      garmentFitClaimed: false,
      fitClaimEligible: false,
      runtimeCollisionEligible: false,
      collisionCandidateEligible: false,
      persistenceAuthority: false,
      productionAuthority: false,
      deploymentAuthority: false,
    });
    const first = result.snapshot.displayMesh.positions[0];
    result.snapshot.displayMesh.positions[0] = 999;
    expect(owner.current()?.displayMesh.positions[0]).toBe(first);
    const publicCurrent = owner.current()!;
    publicCurrent.displayMesh.positions[0] = 777;
    expect(owner.current()?.displayMesh.positions[0]).toBe(first);
  });

  it('uses deterministic, configuration-distinct source revisions', () => {
    const shared = {
      inputFingerprint: 'same-input',
      basisKind: 'female' as const,
      limbSubsetRequested: false,
    };
    const raise = measurementOpenReferenceDisplaySnapshotSourceRevisionV2({
      ...shared,
      poseSelection: { lane: 'raise', degrees: 15 },
    });
    expect(
      measurementOpenReferenceDisplaySnapshotSourceRevisionV2({
        ...shared,
        poseSelection: { lane: 'raise', degrees: 15 },
      }),
    ).toBe(raise);
    expect(
      measurementOpenReferenceDisplaySnapshotSourceRevisionV2({
        ...shared,
        poseSelection: { lane: 'relax', degrees: 3 },
      }),
    ).not.toBe(raise);
    expect(raise).toContain('poseConfigurationKey=linked-symmetric:raise-15');
    expect(raise).toContain(MEASUREMENT_OPEN_REFERENCE_LINKED_SYMMETRIC_POSE_MATRIX_SHA256_V2);
  });

  it('snapshots a shifting request proxy once without reading its properties', async () => {
    const deps = linkedDependencies();
    let getReads = 0;
    const target = request();
    const shifting = new Proxy(target, {
      get: (record, key, receiver) => {
        getReads += 1;
        if (key === 'basisKind') return getReads % 2 === 0 ? 'male' : 'female';
        return Reflect.get(record, key, receiver);
      },
    });
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2(deps);
    const result = await owner.build(shifting);

    expect(result.status).toBe('committed');
    if (result.status !== 'committed') return;
    expect(getReads).toBe(0);
    expect(result.snapshot.binding.basisKind).toBe('neutral');
    expect(result.snapshot.binding.sourceRevision).toContain('basisKind=neutral');
  });

  it('rejects an accessor-backed request without invoking the accessor', async () => {
    const deps = linkedDependencies();
    const loadBasis = vi.fn(deps.loadBasis);
    let getterReads = 0;
    const accessorRequest = { ...request() } as Record<string, unknown>;
    Object.defineProperty(accessorRequest, 'basisKind', {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return 'neutral';
      },
    });
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({ ...deps, loadBasis });
    const result = await owner.build(accessorRequest as never);

    expect(result.status).toBe('blocked');
    expect(getterReads).toBe(0);
    expect(loadBasis).not.toHaveBeenCalled();
  });

  it.each(['basis', 'waist', 'pose'] as const)(
    'does not commit a result superseded after the %s await',
    async (phase) => {
      const calls: string[] = [];
      const deps = linkedDependencies(calls);
      const basisGate = deferred<MakeHumanOpenReferenceBasisV1>();
      const waistGate = deferred<MeasurementOpenReferenceUniformWaistHipRuntimeResultV1>();
      const poseGate =
        deferred<MeasurementOpenReferenceLinkedSymmetricDisplayPoseRuntimeResultV2>();
      let basisCalls = 0;
      let waistCalls = 0;
      let poseCalls = 0;
      const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
        ...deps,
        loadBasis: async (kind) => {
          basisCalls += 1;
          return phase === 'basis' && basisCalls === 1 ? basisGate.promise : basis(kind);
        },
        createWaistHipRuntime: async ({ openReference: reference }) => {
          waistCalls += 1;
          return phase === 'waist' && waistCalls === 1
            ? waistGate.promise
            : waistHipRuntime(reference);
        },
        createLinkedPoseRuntime: async ({ input, sourceRevision }) => {
          poseCalls += 1;
          return phase === 'pose' && poseCalls === 1
            ? poseGate.promise
            : linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision, 6);
        },
      });
      const firstPromise = owner.build(request());
      await vi.waitFor(() =>
        expect(phase === 'basis' ? basisCalls : phase === 'waist' ? waistCalls : poseCalls).toBe(1),
      );
      const second = await owner.build(
        request({
          modelId: 'model-b',
          modelContentRevision: 'model-b:2',
          poseSelection: { lane: 'raise', degrees: 20 },
        }),
      );
      if (phase === 'basis') basisGate.resolve(basis());
      if (phase === 'waist') waistGate.resolve(waistHipRuntime(openReference('stale')));
      if (phase === 'pose')
        poseGate.resolve(linkedRuntime({ lane: 'raise', degrees: 10 }, 'stale'));
      const first = await firstPromise;

      expect(first.status).toBe('stale');
      expect(second.status).toBe('committed');
      if (second.status !== 'committed') return;
      expect(owner.current()?.binding).toEqual(second.snapshot.binding);
    },
  );

  it('blocks runtime failure without committing an A-rest fallback', async () => {
    const deps = linkedDependencies();
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      createLinkedPoseRuntime: async () => {
        throw new Error('pose solve failed');
      },
    });
    const result = await owner.build(request());

    expect(result).toEqual({
      status: 'blocked',
      code: 'build-failed',
      message: 'pose solve failed',
    });
    expect(owner.current()).toBeNull();
  });

  it('blocks a linked runtime result whose source binding was substituted', async () => {
    const deps = linkedDependencies();
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      createLinkedPoseRuntime: async ({ input, sourceRevision }) => {
        const valid = linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision);
        return Object.freeze({ ...valid, sourceRevision: `${valid.sourceRevision};forged=true` });
      },
    });
    const result = await owner.build(request());

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.message).toMatch(/does not match the V2 snapshot binding/);
    expect(owner.current()).toBeNull();
  });

  it('snapshots an adversarial linked-runtime proxy once without property reads', async () => {
    const deps = linkedDependencies();
    const propertyReads: PropertyKey[] = [];
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      createLinkedPoseRuntime: async ({ input, sourceRevision }) => {
        const valid = linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision);
        return new Proxy(valid, {
          get: (record, key, receiver) => {
            propertyReads.push(key);
            if (key === 'maximumJointPivotResidualM') return Number.NaN;
            if (key === 'configurationKey') return 'linked-symmetric:raise-25';
            return Reflect.get(record, key, receiver);
          },
        });
      },
    });
    const result = await owner.build(request());

    expect(result.status).toBe('committed');
    // Promise resolution performs the one language-level `then` lookup. The owner reads no fields.
    expect(propertyReads).toEqual(['then']);
  });

  it('rejects accessor-backed linked-runtime output without invoking the accessor', async () => {
    const deps = linkedDependencies();
    let getterReads = 0;
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      createLinkedPoseRuntime: async ({ input, sourceRevision }) => {
        const valid = { ...linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision) };
        Object.defineProperty(valid, 'maximumJointPivotResidualM', {
          enumerable: true,
          get: () => {
            getterReads += 1;
            return 0;
          },
        });
        return valid as never;
      },
    });
    const result = await owner.build(request());

    expect(result.status).toBe('blocked');
    expect(getterReads).toBe(0);
  });

  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    'rejects invalid linked-runtime pivot residual %s',
    async (residual) => {
      const deps = linkedDependencies();
      const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
        ...deps,
        createLinkedPoseRuntime: async ({ input, sourceRevision }) => ({
          ...linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision),
          maximumJointPivotResidualM: residual,
        }),
      });
      const result = await owner.build(request());

      expect(result.status).toBe('blocked');
      if (result.status !== 'blocked') return;
      expect(result.message).toMatch(/joint-pivot residual is invalid/);
    },
  );

  it('rejects a nonzero runtime that did not load authenticated pose resources', async () => {
    const deps = linkedDependencies();
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      createLinkedPoseRuntime: async ({ input, sourceRevision }) => {
        const valid = linkedRuntime(requireNonZeroLinkedInput(input), sourceRevision);
        return {
          ...valid,
          source: { ...valid.source, poseResourcesLoaded: false },
        } as never;
      },
    });
    const result = await owner.build(request());

    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.message).toMatch(/does not match the V2 snapshot binding/);
  });

  it('blocks basis mismatch before waist or pose work', async () => {
    const deps = linkedDependencies();
    const createWaistHipRuntime = vi.fn(deps.createWaistHipRuntime);
    const createLinkedPoseRuntime = vi.fn(deps.createLinkedPoseRuntime);
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      loadBasis: async () => basis('male'),
      createWaistHipRuntime,
      createLinkedPoseRuntime,
    });
    const result = await owner.build(request({ basisKind: 'female' }));

    expect(result.status).toBe('blocked');
    expect(createWaistHipRuntime).not.toHaveBeenCalled();
    expect(createLinkedPoseRuntime).not.toHaveBeenCalled();
  });

  it('invalidates an in-flight delegated A-rest build before it can commit', async () => {
    const basisGate = deferred<MakeHumanOpenReferenceBasisV1>();
    let delegatedBasisCalls = 0;
    const delegatedDependencies = v1Dependencies();
    const aRestOwner = createMeasurementOpenReferenceDisplaySnapshotOwnerV1({
      ...delegatedDependencies,
      loadBasis: async () => {
        delegatedBasisCalls += 1;
        return basisGate.promise;
      },
    });
    const deps = linkedDependencies();
    const createLinkedPoseRuntime = vi.fn(deps.createLinkedPoseRuntime);
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({
      ...deps,
      aRestOwner,
      createLinkedPoseRuntime,
    });
    const buildPromise = owner.build(request({ poseSelection: { lane: 'relax', degrees: 0 } }));
    await vi.waitFor(() => expect(delegatedBasisCalls).toBe(1));
    owner.invalidate();
    basisGate.resolve(basis());
    const result = await buildPromise;

    expect(result.status).toBe('stale');
    expect(owner.current()).toBeNull();
    expect(createLinkedPoseRuntime).not.toHaveBeenCalled();
  });

  it('fails closed at the pose accessor gate before async work', async () => {
    const deps = linkedDependencies();
    const loadBasis = vi.fn(deps.loadBasis);
    const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV2({ ...deps, loadBasis });
    let getterReads = 0;
    const invalidSelection = Object.defineProperty({ lane: 'raise' }, 'degrees', {
      enumerable: true,
      get: () => {
        getterReads += 1;
        return 12.5;
      },
    });
    const result = await owner.build(request({ poseSelection: invalidSelection as never }));

    expect(result.status).toBe('blocked');
    expect(getterReads).toBe(0);
    expect(loadBasis).not.toHaveBeenCalled();
  });
});
