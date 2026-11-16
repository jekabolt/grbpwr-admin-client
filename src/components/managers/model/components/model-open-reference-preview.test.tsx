import type { common_GenderEnum } from 'api/proto-http/admin';
import { readFileSync } from 'node:fs';
import {
  CANONICAL_BODY_MEASUREMENTS_VERSION,
  type CanonicalBodyMeasurementsMm,
} from 'lib/cloth/body/measurement-adapter';
import {
  MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1,
  MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
  MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from 'lib/cloth/body/measurement-open-reference-display-v1';
import { MEASUREMENT_OPEN_REFERENCE_DISPLAY_QUALITY_GATE_V1 } from 'lib/cloth/body/measurement-open-reference-display-quality-gate-v1';
import type { MeasurementSurfaceMeshV1 } from 'lib/cloth/body/measurement-watertight-surface-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from 'lib/cloth/body/measurement-open-reference-uniform-waist-hip-runtime-v1';
import {
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2,
  type MeasurementOpenReferenceDisplaySnapshotBindingV2,
} from 'lib/cloth/body/measurement-open-reference-display-snapshot-owner-v2';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { Form } from 'ui';
import {
  createModelMannequinPoseDocumentV2,
  encodeModelMannequinPoseDocumentV2,
} from './model-mannequin-pose-document-v2';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import {
  ModelOpenReferencePreview,
  MODEL_OPEN_REFERENCE_MEASUREMENT_BUILD_DEBOUNCE_MS_V12,
  MODEL_OPEN_REFERENCE_FULL_BODY_JOINT_OVERLAY_BINDING_ERROR_V5,
  createModelOpenReferencePreviewSnapshotOwnerV1,
  modelOpenReferencePreviewBuildFingerprintV1,
  modelOpenReferencePreviewCoverageV1,
  modelOpenReferencePreviewFingerprintV1,
  modelOpenReferencePreviewLimbOutcomeV1,
  modelOpenReferencePreviewLimbOutcomeFromSnapshotV1,
  modelOpenReferencePreviewPoseOutcomeFromSnapshotV1,
  modelOpenReferencePreviewRequestedLimbKeysV1,
  modelOpenReferencePreviewSnapshotCommitAllowedV1,
  modelOpenReferencePreviewSnapshotBindingMatchesV1,
  modelOpenReferencePreviewSourceRevisionV1,
  modelOpenReferenceLinkedPreviewBindingMatchesV2,
  modelOpenReferenceLinkedPreviewBodyFingerprintV2,
  modelOpenReferenceLinkedPreviewCommitAllowedV2,
  modelOpenReferenceLinkedPreviewDraftTransitionV2,
  modelOpenReferenceLinkedPreviewNextBuiltV2,
  modelOpenReferenceFullBodyPoseSourceRevisionV3,
  modelOpenReferenceFullBodyPoseSourceRevisionV4,
  modelOpenReferenceFullBodyPoseSourceRevisionV6,
  modelOpenReferenceFullBodyPoseSourceRevisionV7,
  modelOpenReferenceFullBodyJointOverlayNextBuiltV5,
  modelOpenReferenceLiveJointOverlaySignatureV10,
  modelOpenReferenceLivePoseFrameNextV10,
  modelOpenReferenceBodyDisplayOwnershipV11,
  modelOpenReferenceFullBodyBuildDelayV12,
  modelOpenReferenceAllBuildsOrAbortSiblingsV13,
  modelOpenReferencePoseBlockedMessageV11,
  modelOpenReferenceSideSeamCapabilityV12,
  modelOpenReferenceJointEditorEffectiveModeV5,
  modelOpenReferenceFullBodyRuntimePoseV3,
  modelOpenReferenceFullBodyRuntimePoseV4,
  type ModelOpenReferenceDirectPoseBindingV9,
} from './model-open-reference-preview';
import { modelDefaultData, type ModelFormData } from './schema';

const VALID_MEASUREMENTS: ModelFormData['measurements'] = {
  BODY_MEASUREMENT_NAME_HEIGHT: 1720,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
  BODY_MEASUREMENT_NAME_CHEST: 920,
  BODY_MEASUREMENT_NAME_WAIST: 740,
  BODY_MEASUREMENT_NAME_HIP: 980,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
  BODY_MEASUREMENT_NAME_INSEAM: 800,
};

const CANONICAL_MEASUREMENTS: CanonicalBodyMeasurementsMm = Object.freeze({
  schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
  heightMm: 1720,
  shoulderBreadthMm: 420,
  chestCircumferenceMm: 920,
  waistCircumferenceMm: 740,
  hipCircumferenceMm: 980,
  armLengthMm: 600,
  inseamMm: 800,
  bicepCircumferenceMm: 300,
});

function ownerMesh(marker: number): MeasurementSurfaceMeshV1 {
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

function ownerBasis(): MakeHumanOpenReferenceBasisV1 {
  return Object.freeze({
    schemaVersion: MAKEHUMAN_OPEN_REFERENCE_BASIS_V1,
    kind: 'neutral' as const,
    sourceUnitScaleToM: 1,
    sourceMinimumY: 0,
    sourceMaximumY: 1,
    positionsSourceUnits: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 0]),
    indices: new Uint16Array([0, 1, 2]),
  });
}

function ownerQualityGate() {
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
    policy: Object.freeze({
      maximumVertexCount: 20_000,
      maximumTriangleCount: 30_000,
      minimumEdgeStretch: 0.45,
      maximumEdgeStretch: 2.5,
      minimumTriangleAreaRatio: 0.2,
      maximumTriangleAreaRatio: 4,
      minimumTriangleAspectRetention: 0.4,
      maximumFlippedTriangleCount: 0,
    }),
    claims: Object.freeze({
      localGeometryQualityOnly: true as const,
      selfIntersectionEvaluated: false as const,
      anatomicalAccuracyClaimed: false as const,
      fitClaimEligible: false as const,
      runtimeCollisionEligible: false as const,
    }),
  });
}

function ownerOpenReference(sourceRevision: string): MeasurementOpenReferenceDisplayArtifactV1 {
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_V1,
    sourceRevision,
    pose: 'A' as const,
    mesh: ownerMesh(1),
    provenance: Object.freeze({
      source: MAKEHUMAN_OPEN_REFERENCE_PROVENANCE_V1,
      basis: MAKEHUMAN_OPEN_REFERENCE_BASIS_METADATA_V1.neutral,
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
      qualityGate: ownerQualityGate(),
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

function ownerWaistHipRuntime(
  openReference: MeasurementOpenReferenceDisplayArtifactV1,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  return Object.freeze({
    version: 'measurement-open-reference-uniform-waist-hip-runtime/v1' as const,
    role: 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES' as const,
    status: 'represented' as const,
    openReference,
    displayMesh: ownerMesh(2),
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
    qualityGate: ownerQualityGate(),
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

function ownerRequest(posePresetId: 'a-rest' | 'near-t' = 'a-rest') {
  return {
    modelId: 'model-form:model:41',
    modelContentRevision: 'model-form:edit:41:v1',
    inputFingerprint: 'owner-input-a',
    basisKind: 'neutral' as const,
    measurements: CANONICAL_MEASUREMENTS,
    posePresetId,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function Harness({
  gender,
  measurements,
  initialPosePreset,
  poseControls,
  directPoseBindingV9,
}: {
  gender?: common_GenderEnum;
  measurements: ModelFormData['measurements'];
  initialPosePreset?: 'a-rest' | 'near-t' | 'relaxed-symmetric';
  poseControls?:
    | 'presets-v1'
    | 'linked-v2'
    | 'full-body-v3'
    | 'full-body-v4'
    | 'full-body-v5'
    | 'full-body-v6'
    | 'full-body-v7'
    | 'full-body-v8'
    | 'full-body-v9';
  directPoseBindingV9?: ModelOpenReferenceDirectPoseBindingV9;
}) {
  const form = useForm<ModelFormData>({
    defaultValues: {
      ...modelDefaultData,
      name: 'preview test',
      gender: gender ?? '',
      measurements,
    },
  });
  return (
    <Form {...form}>
      <ModelOpenReferencePreview
        initialPosePreset={initialPosePreset}
        poseControls={poseControls}
        directPoseBindingV9={directPoseBindingV9}
      />
    </Form>
  );
}

describe('model open-reference preview', () => {
  it('aborts sibling workers immediately while preserving the primary parallel-build failure', async () => {
    const controller = new AbortController();
    const primaryFailure = new Error('pose runtime failed');
    let siblingAborted = false;
    const sibling = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        'abort',
        () => {
          siblingAborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });

    const result = modelOpenReferenceAllBuildsOrAbortSiblingsV13(controller, [
      Promise.reject(primaryFailure),
      sibling,
    ] as const);

    await expect(result).rejects.toBe(primaryFailure);
    expect(controller.signal.aborted).toBe(true);
    expect(siblingAborted).toBe(true);
  });

  it('reports a partial side-seam capability without blocking free anatomical drag', () => {
    const session = {
      version: 'makehuman-full-body-live-fk-session/v5',
      sideSeamAssistOutcomes: {
        left: { status: 'unavailable' },
        right: { status: 'available' },
      },
    } as unknown as NonNullable<Parameters<typeof modelOpenReferenceSideSeamCapabilityV12>[0]>;

    expect(modelOpenReferenceSideSeamCapabilityV12(session)).toEqual({
      unavailableSides: ['left'],
      message:
        'Side-seam snap is unavailable for the left arm; free anatomical drag remains available.',
    });
  });

  it('retains last-valid V9 body ownership until replacement geometry is ready', () => {
    const base = {
      builtFingerprint: 'body:old',
      requestedFingerprint: 'body:new',
      resolutionOk: true,
      updateStatus: 'building' as const,
      stageStatus: 'ready' as const,
    };

    expect(modelOpenReferenceBodyDisplayOwnershipV11(base)).toBe('retained-pending');
    expect(
      modelOpenReferenceBodyDisplayOwnershipV11({
        ...base,
        resolutionOk: false,
        updateStatus: 'idle',
      }),
    ).toBe('retained-invalid');
    expect(
      modelOpenReferenceBodyDisplayOwnershipV11({
        ...base,
        updateStatus: 'error',
      }),
    ).toBe('retained-error');
    expect(
      modelOpenReferenceBodyDisplayOwnershipV11({
        ...base,
        builtFingerprint: 'body:new',
        stageStatus: 'initializing',
      }),
    ).toBe('preparing');
    expect(
      modelOpenReferenceBodyDisplayOwnershipV11({
        ...base,
        builtFingerprint: 'body:new',
      }),
    ).toBe('current');
    expect(
      modelOpenReferenceBodyDisplayOwnershipV11({
        ...base,
        builtFingerprint: null,
      }),
    ).toBe('empty');
  });

  it('debounces only measurement replacements that already have a last-valid body', () => {
    expect(
      modelOpenReferenceFullBodyBuildDelayV12({
        intent: 'measurement-change',
        retainsLastValidBody: true,
      }),
    ).toBe(MODEL_OPEN_REFERENCE_MEASUREMENT_BUILD_DEBOUNCE_MS_V12);
    expect(
      modelOpenReferenceFullBodyBuildDelayV12({
        intent: 'measurement-change',
        retainsLastValidBody: false,
      }),
    ).toBe(0);
    expect(
      modelOpenReferenceFullBodyBuildDelayV12({
        intent: 'immediate',
        retainsLastValidBody: true,
      }),
    ).toBe(0);
  });

  it('maps typed pose blockers to concise feedback without leaking internal blocker IDs', () => {
    const overlap = modelOpenReferencePoseBlockedMessageV11([
      'right-arm-overlap',
      'right-elbow-direction',
    ]);
    expect(overlap).toBe(
      'Pose blocked: a limb would overlap the body or another limb; a joint would bend in the wrong direction. Showing the last valid pose.',
    );
    expect(overlap).not.toMatch(/right-arm|right-elbow/u);
    expect(modelOpenReferencePoseBlockedMessageV11(['no-grounded-foot', 'foot-below-ground'])).toBe(
      'Pose blocked: at least one foot must stay grounded; a foot cannot move below the ground. Showing the last valid pose.',
    );
    expect(modelOpenReferencePoseBlockedMessageV11([])).toBeNull();
  });

  it('publishes accepted mesh and joint-overlay frames atomically and retains the last valid frame', () => {
    const positions = new Float32Array([1, 2, 3]);
    const accepted = modelOpenReferenceLivePoseFrameNextV10(null, {
      status: 'accepted',
      bodyBuildFingerprint: 'body:1',
      bodySourceRevision: 'source:1',
      positions,
      groups: [],
    });

    expect(accepted).toMatchObject({
      bodyBuildFingerprint: 'body:1',
      bodySourceRevision: 'source:1',
      positions,
      groups: [],
      jointOverlaySignature: '[]',
    });
    expect(modelOpenReferenceLivePoseFrameNextV10(accepted, { status: 'rejected' })).toBe(accepted);
  });

  it('derives a deterministic live joint-overlay signature from pivots and local frames', () => {
    const group = {
      id: 'right-wrist' as const,
      headM: [0.1, 0.2, 0.3] as const,
      tailM: [0.4, 0.5, 0.6] as const,
      localToWorld: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
    };
    const signature = modelOpenReferenceLiveJointOverlaySignatureV10([group]);

    expect(modelOpenReferenceLiveJointOverlaySignatureV10([{ ...group }])).toBe(signature);
    expect(
      modelOpenReferenceLiveJointOverlaySignatureV10([
        { ...group, headM: [0.11, 0.2, 0.3] as const },
      ]),
    ).not.toBe(signature);
  });

  it('blocks rendering without a complete plausible seven-measurement input', () => {
    const html = renderToStaticMarkup(<Harness measurements={{}} />);

    expect(html).toContain('visual reference only');
    expect(html).toContain('preview blocked');
    expect(html).toContain('height is required.');
    expect(html).toContain('inseam is required.');
    expect(html).not.toContain('build preview');
    expect(html).not.toContain('measurement-watertight-surface-v1-canvas');
  });

  it('admits valid measurements but requires an explicit build action', () => {
    const html = renderToStaticMarkup(
      <Harness gender='GENDER_ENUM_FEMALE' measurements={VALID_MEASUREMENTS} />,
    );

    expect(html).toContain('basis female');
    expect(html).toContain('pose A-rest');
    expect(html).toContain('data-testid="model-open-reference-pose-control"');
    expect(html).toContain('Select A-rest display pose');
    expect(html).toContain('Select Bounded near-T display pose');
    expect(html).toContain('Select Relaxed symmetric display pose');
    expect(html).toContain('Display pose A-rest selected. Build preview to apply it.');
    expect(html).toContain('visual coverage pending');
    expect(html).toContain('geometric proxies pending');
    expect(html).toContain('limb proxies 0/4');
    expect(html).toContain('No optional bicep, wrist, calf or ankle value was entered');
    expect(html).toContain('starts from a clean height-scaled CC0 basis');
    expect(html).not.toContain('open CC0 geometry represents height, shoulder');
    expect(html).toContain('build preview');
    expect(html).toContain('Preview not built. Select BUILD PREVIEW to render it.');
    expect(html).toContain('fitClaimEligible=false');
    expect(html).toContain('runtimeCollisionEligible=false');
    expect(html).toContain('collisionCandidateEligible=false');
    expect(html).toContain('data-testid="model-open-reference-proxy-outcome"');
    expect(html).toContain('aria-live="polite"');
    expect(html).not.toContain('measurement-watertight-surface-v1-canvas');
  });

  it('keeps prior pose editors available and opts the live form into full-body V9', () => {
    const linked = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='linked-v2'
      />,
    );

    expect(linked).toContain('data-pose-controls="linked-v2"');
    expect(linked).toContain('data-testid="model-open-reference-linked-pose-control-v2"');
    expect(linked).toContain('actualRenderedGarmentPairEvaluated=false');
    expect(linked).toContain('Draft A-rest. Build preview to apply it.');
    expect(linked).toContain('Pose is preview-only and is not saved with the model.');
    expect(linked).not.toContain('data-testid="model-open-reference-pose-control"');

    const fullBody = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v3'
      />,
    );
    expect(fullBody).toContain('data-pose-controls="full-body-v3"');
    expect(fullBody).toContain('data-testid="model-open-reference-full-body-pose-control-v3"');
    expect((fullBody.match(/type="range"/g) ?? []).length).toBe(7);
    expect(fullBody).toContain('inverseKinematicsApplied=false');
    expect(fullBody).toContain('Pose is not saved with the model.');
    expect(fullBody).not.toContain('data-testid="model-open-reference-linked-pose-control-v2"');

    const fullBodyV4 = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v4'
      />,
    );
    expect(fullBodyV4).toContain('data-pose-controls="full-body-v4"');
    expect(fullBodyV4).toContain('data-testid="model-open-reference-full-body-pose-control-v4"');
    expect(fullBodyV4.match(/type="range"/gu) ?? []).toHaveLength(7);
    expect(fullBodyV4).toContain('unlink arms');

    const fullBodyV5 = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v5'
      />,
    );
    expect(fullBodyV5).toContain('data-pose-controls="full-body-v5"');
    expect(fullBodyV5).toContain('data-testid="model-open-reference-joint-pose-control-v5"');
    expect(fullBodyV5).toContain('Build the preview to enable scene joint markers.');
    expect(fullBodyV5).toContain('inverseKinematicsApplied=false');

    const fullBodyV6 = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v6'
      />,
    );
    expect(fullBodyV6).toContain('data-pose-controls="full-body-v6"');
    expect(fullBodyV6).toContain('data-testid="model-open-reference-joint-pose-control-v6"');
    expect(fullBodyV6).toContain('data-testid="model-open-reference-joint-pose-control-v5"');
    expect(fullBodyV6).toContain('draft-only local rotation ring');
    expect(fullBodyV6).toContain('inverseKinematicsApplied=false');

    const fullBodyV7 = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v7'
      />,
    );
    expect(fullBodyV7).toContain('data-pose-controls="full-body-v7"');
    expect(fullBodyV7).toContain('data-testid="model-open-reference-joint-pose-control-v7"');
    expect(fullBodyV7.match(/type="number"/gu) ?? []).toHaveLength(1);
    expect(fullBodyV7).not.toContain(
      'data-testid="model-open-reference-full-body-pose-control-v4"',
    );
    expect(fullBodyV7).not.toContain('type="range"');
    expect(fullBodyV7).toContain('select the joint directly on the mannequin');
    expect(fullBodyV7).toContain('inverseKinematicsApplied=false');

    const fullBodyV8 = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v8'
      />,
    );
    expect(fullBodyV8).toContain('data-pose-controls="full-body-v8"');
    expect(fullBodyV8).toContain('data-testid="model-open-reference-joint-pose-control-v8"');
    expect(fullBodyV8).toContain('Direct mannequin pose editor');
    expect(fullBodyV8).not.toContain('<b>visual reference only</b>');
    expect(fullBodyV8).not.toContain('inverseKinematicsApplied=false');

    const fullBodyV9 = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v9'
      />,
    );
    expect(fullBodyV9).toContain('data-pose-controls="full-body-v9"');
    expect(fullBodyV9).toContain('data-testid="model-open-reference-direct-pose-control-v9"');
    expect(fullBodyV9).toContain('Direct mannequin pose editor');
    expect(fullBodyV9).toContain('data-pose-session="temporary"');
    expect(fullBodyV9).toContain('data-pose-draft="neutral"');
    expect(fullBodyV9).toContain('temporary pose · not saved');
    expect(fullBodyV9).not.toContain('<b>visual reference only</b>');

    const liveFormSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
    expect(liveFormSource).toMatch(/<ModelOpenReferencePreview[\s\S]*poseControls='full-body-v9'/u);
  });

  it('renders a caller-owned non-neutral V9 document without a private persistence claim', () => {
    const pose: ModelOpenReferenceDirectPoseV9 = Object.freeze({
      ...MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      bodyFlexionDegrees: 8,
      headYawDeg: 6,
    });
    const document = createModelMannequinPoseDocumentV2(pose);
    const binding: ModelOpenReferenceDirectPoseBindingV9 = {
      document,
      canonicalKey: encodeModelMannequinPoseDocumentV2(document),
      dirty: true,
      canUndo: true,
      onBeginGesture: () => undefined,
      onUpdateGesture: () => undefined,
      onFinishGesture: () => undefined,
      onDiscreteEdit: () => undefined,
      onUndo: () => pose,
      onReset: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    };

    const html = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v9'
        directPoseBindingV9={binding}
      />,
    );

    expect(html).toContain('data-pose-session="controlled"');
    expect(html).toContain('data-pose-draft="custom"');
    expect(html).toContain('session pose · not saved · changed');
    expect(html).not.toContain('temporary pose · not saved');
  });

  it('renders the durable saved/unsaved contract and compact save action only when provided', () => {
    const document = createModelMannequinPoseDocumentV2(
      MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    );
    const binding: ModelOpenReferenceDirectPoseBindingV9 = {
      document,
      canonicalKey: encodeModelMannequinPoseDocumentV2(document),
      dirty: true,
      canUndo: true,
      onBeginGesture: () => undefined,
      onUpdateGesture: () => undefined,
      onFinishGesture: () => undefined,
      onDiscreteEdit: () => undefined,
      onUndo: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      onReset: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      persistence: {
        statusText: 'pose · unsaved',
        errorText: null,
        showSave: true,
        canSave: true,
        saving: false,
        conflict: false,
        onSave: () => undefined,
        onKeepMine: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
        onReloadTheirs: () => MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
      },
    };

    const html = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        poseControls='full-body-v9'
        directPoseBindingV9={binding}
      />,
    );

    expect(html).toContain('pose · unsaved');
    expect(html).toContain('save pose');
    expect(html).not.toContain('session pose · not saved · changed');
  });

  it('keeps V6 pose source revisions distinct from the admitted V4/V5 lanes', () => {
    const pose = {
      bodyFlexionDegrees: 0,
      bodySideBendDegrees: 0,
      bodyTwistDegrees: 0,
      armMode: 'linked' as const,
      leftArm: {
        shoulderRaiseDegrees: 0,
        shoulderForwardDegrees: 0,
        elbowBendDegrees: 0,
        wristBendDegrees: 0,
      },
      rightArm: {
        shoulderRaiseDegrees: 0,
        shoulderForwardDegrees: 0,
        elbowBendDegrees: 0,
        wristBendDegrees: 0,
      },
    };
    const revision = modelOpenReferenceFullBodyPoseSourceRevisionV6({
      inputFingerprint: 'input-v6',
      basisKind: 'female',
      pose,
    });
    expect(revision).toContain('editorPoseV6=');
    expect(revision).not.toContain('editorPoseV4=');
    expect(revision).not.toContain('editorPoseV5=');

    const v7Revision = modelOpenReferenceFullBodyPoseSourceRevisionV7({
      inputFingerprint: 'input-v7',
      basisKind: 'female',
      pose,
    });
    expect(v7Revision).toContain('editorPoseV7=');
    expect(v7Revision).not.toContain('editorPoseV6=');
  });

  it('retains an applied mesh for pose work and clears it only for a different body', () => {
    const applied: Readonly<{ id: string }> = Object.freeze({ id: 'applied-a-rest' });
    const next: Readonly<{ id: string }> = Object.freeze({ id: 'applied-raise-10' });

    expect(modelOpenReferenceLinkedPreviewNextBuiltV2(applied, { type: 'pose-building' })).toBe(
      applied,
    );
    expect(modelOpenReferenceLinkedPreviewNextBuiltV2(applied, { type: 'pose-blocked' })).toBe(
      applied,
    );
    expect(
      modelOpenReferenceLinkedPreviewNextBuiltV2(applied, {
        type: 'pose-committed',
        next,
      }),
    ).toBe(next);
    expect(
      modelOpenReferenceLinkedPreviewNextBuiltV2(applied, { type: 'body-invalidated' }),
    ).toBeNull();
  });

  it('refuses to publish a deferred V5 overlay onto a superseding body build', () => {
    const supersedingBody = Object.freeze({
      bodyBuildFingerprint: 'body:new',
      runtime: Object.freeze({ sourceRevision: 'runtime:new' }),
      jointOverlay: null as null | Readonly<{
        id: string;
        binding: Readonly<{ bodySourceRevision: string }>;
      }>,
      jointOverlayError: null,
    });
    const overlay = (id: string, bodySourceRevision: string) =>
      Object.freeze({ id, binding: Object.freeze({ bodySourceRevision }) });
    const staleResult = modelOpenReferenceFullBodyJointOverlayNextBuiltV5(
      supersedingBody,
      'body:old',
      'runtime:old',
      { jointOverlay: overlay('overlay:old', 'runtime:old'), jointOverlayError: null },
    );
    expect(staleResult).toBe(supersedingBody);

    const currentResult = modelOpenReferenceFullBodyJointOverlayNextBuiltV5(
      supersedingBody,
      'body:new',
      'runtime:new',
      { jointOverlay: overlay('overlay:new', 'runtime:new'), jointOverlayError: null },
    );
    expect(currentResult).not.toBe(supersedingBody);
    expect(currentResult?.jointOverlay).toEqual(overlay('overlay:new', 'runtime:new'));
  });

  it('fails soft when a V5 overlay does not match the exact visible runtime source', () => {
    const currentBody = Object.freeze({
      bodyBuildFingerprint: 'body:current',
      runtime: Object.freeze({ sourceRevision: 'runtime:current' }),
      jointOverlay: null as null | Readonly<{
        id: string;
        binding: Readonly<{ bodySourceRevision: string }>;
      }>,
      jointOverlayError: null,
    });
    const staleOverlay = Object.freeze({
      id: 'overlay:stale',
      binding: Object.freeze({ bodySourceRevision: 'runtime:stale' }),
    });

    const staleCurrent = modelOpenReferenceFullBodyJointOverlayNextBuiltV5(
      currentBody,
      'body:current',
      'runtime:superseding',
      { jointOverlay: staleOverlay, jointOverlayError: null },
    );
    expect(staleCurrent).toBe(currentBody);

    const bindingMismatch = modelOpenReferenceFullBodyJointOverlayNextBuiltV5(
      currentBody,
      'body:current',
      'runtime:current',
      { jointOverlay: staleOverlay, jointOverlayError: null },
    );
    expect(bindingMismatch).toMatchObject({
      runtime: { sourceRevision: 'runtime:current' },
      jointOverlay: null,
      jointOverlayError: MODEL_OPEN_REFERENCE_FULL_BODY_JOINT_OVERLAY_BINDING_ERROR_V5,
    });
  });

  it('forces camera mode until the exact V5 joint overlay is ready', () => {
    expect(modelOpenReferenceJointEditorEffectiveModeV5('edit-pose', null)).toBe('camera');
    expect(modelOpenReferenceJointEditorEffectiveModeV5('edit-pose', 'unavailable')).toBe('camera');
    expect(modelOpenReferenceJointEditorEffectiveModeV5('edit-pose', 'ready')).toBe('edit-pose');
    expect(modelOpenReferenceJointEditorEffectiveModeV5('camera', 'ready')).toBe('camera');
  });

  it('maps linked editor channels into the strict mirrored full-body runtime command', () => {
    const pose = {
      bodyFlexionDegrees: 12,
      bodySideBendDegrees: -6,
      bodyTwistDegrees: 8,
      linkedArmRaiseDegrees: 30,
      linkedArmForwardDegrees: 10,
      linkedElbowBendDegrees: 45,
      linkedWristBendDegrees: -8,
    } as const;
    const runtime = modelOpenReferenceFullBodyRuntimePoseV3(pose);

    expect(runtime).toEqual({
      torsoFlexionDeg: 12,
      torsoSideBendDeg: -6,
      torsoTwistDeg: 8,
      symmetry: 'bilateral',
      arm: {
        shoulderRaiseDeg: 30,
        shoulderForwardDeg: 10,
        elbowBendDeg: 45,
        wristBendDeg: -8,
      },
    });
    const sourceRevision = modelOpenReferenceFullBodyPoseSourceRevisionV3({
      inputFingerprint: 'model-input',
      basisKind: 'male',
      pose,
    });
    expect(sourceRevision).toContain('basisKind=male');
    expect(sourceRevision).toMatch(/inputHash=[0-9a-f]{8}/u);
    expect(sourceRevision).toContain('editorPose=');
    expect(sourceRevision).not.toContain('model-input');
    expect(sourceRevision.match(/editorPose=/gu)).toHaveLength(1);
  });

  it('maps V4 linked and independent arms without changing the shared runtime contract', () => {
    const linked = {
      bodyFlexionDegrees: 5,
      bodySideBendDegrees: -3,
      bodyTwistDegrees: 4,
      armMode: 'linked' as const,
      leftArm: {
        shoulderRaiseDegrees: 30,
        shoulderForwardDegrees: 10,
        elbowBendDegrees: 45,
        wristBendDegrees: -8,
      },
      rightArm: {
        shoulderRaiseDegrees: 30,
        shoulderForwardDegrees: 10,
        elbowBendDegrees: 45,
        wristBendDegrees: -8,
      },
    };
    expect(modelOpenReferenceFullBodyRuntimePoseV4(linked)).toMatchObject({
      symmetry: 'bilateral',
      arm: { shoulderRaiseDeg: 30, elbowBendDeg: 45 },
    });

    const independent = {
      ...linked,
      armMode: 'independent' as const,
      rightArm: { ...linked.rightArm, shoulderRaiseDegrees: 12, elbowBendDegrees: 20 },
    };
    expect(modelOpenReferenceFullBodyRuntimePoseV4(independent)).toMatchObject({
      symmetry: 'independent',
      leftArm: { shoulderRaiseDeg: 30, elbowBendDeg: 45 },
      rightArm: { shoulderRaiseDeg: 12, elbowBendDeg: 20 },
    });
    expect(() =>
      modelOpenReferenceFullBodyRuntimePoseV4({ ...independent, armMode: 'linked' }),
    ).toThrow(/must be identical/u);

    const revision = modelOpenReferenceFullBodyPoseSourceRevisionV4({
      inputFingerprint: 'private-measurements',
      basisKind: 'female',
      pose: independent,
    });
    expect(revision).toContain('editorPoseV4=');
    expect(revision).not.toContain('private-measurements');
  });

  it('clears a failed pose update when reset to the applied pose without starting a build', () => {
    const applied = Object.freeze({ lane: 'relax' as const, degrees: 0 as const });

    expect(
      modelOpenReferenceLinkedPreviewDraftTransitionV2({
        currentStatus: 'error',
        nextDraftSelection: applied,
        appliedSelection: applied,
        hasBuiltPreview: true,
      }),
    ).toEqual({
      cancelActiveBuild: false,
      nextUpdateStatus: 'idle',
      nextUpdateError: '',
      nextControlStatus: 'idle',
      requestsBuild: false,
    });

    expect(
      modelOpenReferenceLinkedPreviewDraftTransitionV2({
        currentStatus: 'error',
        nextDraftSelection: { lane: 'raise', degrees: 10 },
        appliedSelection: applied,
        hasBuiltPreview: true,
      }).nextControlStatus,
    ).toBe('pending');

    const previewSource = readFileSync(
      new URL('./model-open-reference-preview.tsx', import.meta.url),
      'utf8',
    );
    const draftHandler = previewSource.match(
      /const handleDraftChange = \(selection: LinkedPoseSelectionV2\) => \{[\s\S]*?\n {2}\};/u,
    )?.[0];
    expect(draftHandler).toContain('modelOpenReferenceLinkedPreviewDraftTransitionV2');
    expect(draftHandler).toContain('setUpdateError(transition.nextUpdateError)');
    expect(draftHandler).not.toContain('buildLinkedPreview');
  });

  it('binds a linked commit to the exact requested model, body and pose selection', () => {
    const bodyFingerprint = modelOpenReferenceLinkedPreviewBodyFingerprintV2({
      modelId: 'model-form:model:41',
      modelContentRevision: 'model-form:edit:41:v1',
      inputFingerprint: 'input-a',
      basisKind: 'female',
    });
    expect(bodyFingerprint).toBe(
      modelOpenReferenceLinkedPreviewBodyFingerprintV2({
        modelId: 'model-form:model:41',
        modelContentRevision: 'model-form:edit:41:v1',
        inputFingerprint: 'input-a',
        basisKind: 'female',
      }),
    );

    const current = Object.freeze({
      modelId: 'model-form:model:41',
      modelContentRevision: 'model-form:edit:41:v1',
      inputFingerprint: 'input-a',
      basisKind: 'female' as const,
      poseSelection: Object.freeze({ lane: 'raise' as const, degrees: 10 as const }),
      sourceRevision: 'source-a',
    });
    const binding: MeasurementOpenReferenceDisplaySnapshotBindingV2 = Object.freeze({
      generation: 2,
      modelId: current.modelId,
      modelContentRevision: current.modelContentRevision,
      inputFingerprint: current.inputFingerprint,
      canonicalContentFingerprint: 'canonical-a',
      basisKind: current.basisKind,
      poseConfigurationKey: 'linked-symmetric:raise-10',
      matrixSha256: MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_MATRIX_SHA256_V2,
      sourceRevision: current.sourceRevision,
      delegatedV1SourceRevision: null,
    });

    expect(modelOpenReferenceLinkedPreviewBindingMatchesV2(binding, current)).toBe(true);
    expect(
      modelOpenReferenceLinkedPreviewBindingMatchesV2(binding, {
        ...current,
        poseSelection: { lane: 'raise', degrees: 15 },
      }),
    ).toBe(false);
    expect(
      modelOpenReferenceLinkedPreviewCommitAllowedV2({
        requestedGeneration: 7,
        currentGeneration: 7,
        mounted: true,
        owner: { isCurrent: () => true },
        binding,
        currentBinding: current,
      }),
    ).toBe(true);
    expect(
      modelOpenReferenceLinkedPreviewCommitAllowedV2({
        requestedGeneration: 7,
        currentGeneration: 8,
        mounted: true,
        owner: { isCurrent: () => true },
        binding,
        currentBinding: current,
      }),
    ).toBe(false);
  });

  it('surfaces the neutral fallback instead of guessing a gendered basis', () => {
    const html = renderToStaticMarkup(
      <Harness gender='GENDER_ENUM_UNISEX' measurements={VALID_MEASUREMENTS} />,
    );

    expect(html).toContain('basis neutral');
    expect(html).toContain(
      'Unisex fit-model gender uses the neutral open-reference display basis.',
    );
  });

  it('uses an order-independent key and invalidates on either gender or value changes', () => {
    const forward = modelOpenReferencePreviewFingerprintV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: { first: 100, second: 200 },
    });
    const reversed = modelOpenReferencePreviewFingerprintV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: { second: 200, first: 100 },
    });

    expect(reversed).toBe(forward);
    expect(
      modelOpenReferencePreviewFingerprintV1({
        gender: 'GENDER_ENUM_MALE',
        measurements: { first: 100, second: 200 },
      }),
    ).not.toBe(forward);
    expect(
      modelOpenReferencePreviewFingerprintV1({
        gender: 'GENDER_ENUM_FEMALE',
        measurements: { first: 101, second: 200 },
      }),
    ).not.toBe(forward);
    const sourceRevision = modelOpenReferencePreviewSourceRevisionV1(forward, 'female');
    expect(sourceRevision).toMatch(
      /^model-form-open-reference-preview-v1;inputHash=[0-9a-f]{8};basisAssetRevision=makehuman-open-reference-basis-assets\/repaired-v1;basisPostprocessRevision=makehuman-baseline-local-repair\/v1;basisKind=female;basisSha256=77d5d084[0-9a-f]{56};displayPoseRevision=makehuman-repaired-display-pose-runtime\/v1;displayPosePreset=a-rest;displayPoseRigSha256=be638f3c[0-9a-f]{56};displayPoseAnchorSha256=8075c886[0-9a-f]{56}$/,
    );
    expect(modelOpenReferencePreviewSourceRevisionV1(reversed, 'female')).toBe(
      modelOpenReferencePreviewSourceRevisionV1(forward, 'female'),
    );
    expect(modelOpenReferencePreviewSourceRevisionV1(forward, 'male')).not.toBe(
      modelOpenReferencePreviewSourceRevisionV1(forward, 'female'),
    );
    expect(modelOpenReferencePreviewSourceRevisionV1(forward, 'female', 'near-t')).not.toBe(
      sourceRevision,
    );
    expect(modelOpenReferencePreviewSourceRevisionV1(forward, 'female', 'near-t')).toContain(
      'displayPosePreset=near-t',
    );
    expect(modelOpenReferencePreviewBuildFingerprintV1(forward, 'near-t')).not.toBe(
      modelOpenReferencePreviewBuildFingerprintV1(forward, 'a-rest'),
    );
    const limbFingerprint = modelOpenReferencePreviewFingerprintV1({
      gender: 'GENDER_ENUM_FEMALE',
      measurements: { first: 100, second: 200, BODY_MEASUREMENT_NAME_BICEP: 300 },
    });
    expect(limbFingerprint).not.toBe(forward);
    const limbSourceRevision = modelOpenReferencePreviewSourceRevisionV1(
      limbFingerprint,
      'female',
      'a-rest',
      true,
    );
    expect(limbSourceRevision).toContain(
      'limbSubsetRequestedRevision=measurement-open-reference-limb-subset-runtime/v1',
    );
    expect(limbSourceRevision).toContain(
      'limbBundleSha256=7a852519ce230ac82aa6b8beea404b49f04305532a9ea26cdd30151015464a2c',
    );
    expect(modelOpenReferencePreviewSourceRevisionV1(limbFingerprint, 'female')).not.toBe(
      limbSourceRevision,
    );
  });

  it('rejects a late owner snapshot after model revision or pose changes', () => {
    const binding = Object.freeze({
      generation: 3,
      modelId: 'model-form:model:41',
      modelContentRevision: 'model-form:edit:41:v1',
      inputFingerprint: 'input-a',
      canonicalContentFingerprint: 'canonical-a',
      basisKind: 'female' as const,
      posePresetId: 'a-rest' as const,
      sourceRevision: 'source-a',
    });
    const current = Object.freeze({
      modelId: binding.modelId,
      modelContentRevision: binding.modelContentRevision,
      inputFingerprint: binding.inputFingerprint,
      basisKind: binding.basisKind,
      posePresetId: binding.posePresetId,
      sourceRevision: binding.sourceRevision,
    });

    expect(modelOpenReferencePreviewSnapshotBindingMatchesV1(binding, current)).toBe(true);
    expect(
      modelOpenReferencePreviewSnapshotBindingMatchesV1(binding, {
        ...current,
        modelId: 'model-form:model:42',
      }),
    ).toBe(false);
    expect(
      modelOpenReferencePreviewSnapshotBindingMatchesV1(binding, {
        ...current,
        modelContentRevision: 'model-form:edit:41:v2',
      }),
    ).toBe(false);
    expect(
      modelOpenReferencePreviewSnapshotBindingMatchesV1(binding, {
        ...current,
        posePresetId: 'near-t',
        sourceRevision: 'source-near-t',
      }),
    ).toBe(false);
    expect(modelOpenReferencePreviewSnapshotBindingMatchesV1(binding, null)).toBe(false);
  });

  it('preserves exact limb and pose runtime failures without promoting authority', async () => {
    const baseDependencies = {
      loadBasis: async () => ownerBasis(),
      createUniformHeightDisplay: ({ frame }: { frame: { sourceRevision: string } }) =>
        ownerOpenReference(frame.sourceRevision),
      buildProxyRuntime: async ({
        openReference,
      }: {
        openReference: MeasurementOpenReferenceDisplayArtifactV1;
      }) => ownerWaistHipRuntime(openReference),
    };
    const limbOwner = createModelOpenReferencePreviewSnapshotOwnerV1({
      ...baseDependencies,
      loadLimbRuntime: async () => {
        throw new Error('Exact limb bundle authentication failure.');
      },
    });
    const limbResult = await limbOwner.build(ownerRequest());
    expect(limbResult.status).toBe('committed');
    if (limbResult.status !== 'committed') return;
    expect(limbResult.runtimeDiagnostics.limbRuntimeMessage).toBe(
      'Exact limb bundle authentication failure.',
    );
    const limbOutcome = modelOpenReferencePreviewLimbOutcomeFromSnapshotV1(
      limbResult.snapshot,
      limbResult.runtimeDiagnostics,
    );
    expect(limbOutcome.warning).toContain('Exact limb bundle authentication failure.');

    const poseOwner = createModelOpenReferencePreviewSnapshotOwnerV1({
      ...baseDependencies,
      loadPoseRuntime: async () => {
        throw new Error('Exact pose rig SHA-256 failure.');
      },
    });
    const poseResult = await poseOwner.build(ownerRequest('near-t'));
    expect(poseResult.status).toBe('committed');
    if (poseResult.status !== 'committed') return;
    expect(poseResult.runtimeDiagnostics.poseRuntimeMessage).toBe(
      'Exact pose rig SHA-256 failure.',
    );
    const poseOutcome = modelOpenReferencePreviewPoseOutcomeFromSnapshotV1(
      poseResult.snapshot,
      poseResult.runtimeDiagnostics,
    );
    expect(poseOutcome.message).toBe(
      'Exact pose rig SHA-256 failure. A-rest shaped mesh retained.',
    );
    expect(limbResult.snapshot.claims.fitClaimEligible).toBe(false);
    expect(poseResult.snapshot.claims.runtimeCollisionEligible).toBe(false);
  });

  it.each(['rerender', 'unmount'] as const)(
    'drops a late owner completion after %s without a state or stage commit',
    async (boundary) => {
      const basisGate = deferred<MakeHumanOpenReferenceBasisV1>();
      const owner = createModelOpenReferencePreviewSnapshotOwnerV1({
        loadBasis: () => basisGate.promise,
        createUniformHeightDisplay: ({ frame }) => ownerOpenReference(frame.sourceRevision),
        buildProxyRuntime: async ({ openReference }) => ownerWaistHipRuntime(openReference),
      });
      const request = ownerRequest();
      let currentGeneration = 1;
      let mounted = true;
      let currentBinding = {
        modelId: request.modelId,
        modelContentRevision: request.modelContentRevision,
        inputFingerprint: request.inputFingerprint,
        basisKind: request.basisKind,
        posePresetId: request.posePresetId,
        sourceRevision: modelOpenReferencePreviewSourceRevisionV1(
          request.inputFingerprint,
          request.basisKind,
          request.posePresetId,
          true,
        ),
      };
      const requestedGeneration = currentGeneration;
      const buildPromise = owner.build(request);
      if (boundary === 'rerender') {
        currentBinding = {
          ...currentBinding,
          modelContentRevision: 'model-form:edit:41:v2',
        };
      } else {
        mounted = false;
      }
      currentGeneration += 1;
      owner.invalidate();
      basisGate.resolve(ownerBasis());
      const result = await buildPromise;
      let stateCommitCount = 0;
      let stageCommitCount = 0;
      if (
        result.status === 'committed' &&
        modelOpenReferencePreviewSnapshotCommitAllowedV1({
          requestedGeneration,
          currentGeneration,
          mounted,
          owner,
          binding: result.snapshot.binding,
          currentBinding,
        })
      ) {
        stateCommitCount += 1;
        stageCommitCount += 1;
      }

      expect(result.status).toBe('stale');
      expect(stateCommitCount).toBe(0);
      expect(stageCommitCount).toBe(0);
    },
  );

  it('renders the requested display-only preset without implying fit or collision authority', () => {
    const html = renderToStaticMarkup(
      <Harness
        gender='GENDER_ENUM_FEMALE'
        measurements={VALID_MEASUREMENTS}
        initialPosePreset='near-t'
      />,
    );

    expect(html).toContain('pose Near-T');
    expect(html).toContain('Display pose Bounded near-T selected. Build preview to apply it.');
    expect(html).toContain('fitClaimEligible=false');
    expect(html).toContain('runtimeCollisionEligible=false');
    expect(html).toContain('collisionCandidateEligible=false');
  });

  it('reports coverage only after the quality gate result is known', () => {
    const pending = modelOpenReferencePreviewCoverageV1(null);
    expect(pending).toMatchObject({
      label: 'visual coverage pending',
      status: 'pending',
      proxyLabel: 'geometric proxies pending',
      proxyStatus: 'pending',
      warning: null,
    });
    expect(pending.message).toContain('starts from a clean height-scaled CC0 basis');
    const researchOnly = modelOpenReferencePreviewCoverageV1({ status: 'personalized' });
    expect(researchOnly).toMatchObject({
      label: 'visual coverage 1/7',
      status: 'fallback-uniform',
      proxyLabel: 'geometric proxies 0/2',
      proxyStatus: 'error',
    });
    expect(researchOnly.warning).toContain('research-only personalized candidate');
    expect(JSON.stringify(researchOnly)).not.toContain('visual coverage 6/7');
    const represented = modelOpenReferencePreviewCoverageV1(
      { status: 'fallback-uniform' },
      {
        status: 'represented',
        representedGeometricProxies: ['waistCircumferenceMm', 'hipCircumferenceMm'],
      },
    );
    expect(represented).toMatchObject({
      label: 'visual coverage 1/7',
      status: 'fallback-uniform',
      proxyLabel: 'geometric proxies 2/2',
      proxyStatus: 'represented',
    });
    expect(represented.message).toContain('represents height as an exact measurement');
    expect(represented.message).toContain('Waist and hip');
    expect(represented.warning).toContain('not canonical tape-protocol matches');
    expect(represented.message).not.toContain('represents height, shoulder');

    const partial = modelOpenReferencePreviewCoverageV1(
      { status: 'fallback-uniform' },
      { status: 'partial', representedGeometricProxies: ['hipCircumferenceMm'] },
    );
    expect(partial).toMatchObject({
      proxyLabel: 'geometric proxies 1/2',
      proxyStatus: 'partial',
    });
    expect(partial.message).toContain('hip closed-loop proxy');
    expect(partial.warning).toContain('waist did not pass the bounded CC0 proxy policy');

    const failed = modelOpenReferencePreviewCoverageV1(
      { status: 'fallback-uniform' },
      { status: 'error', representedGeometricProxies: [] },
    );
    expect(failed).toMatchObject({
      proxyLabel: 'geometric proxies 0/2',
      proxyStatus: 'error',
    });
    expect(failed.message).toContain('represents height only');
    expect(failed.warning).toContain('could not be loaded');
  });

  it('reports limb proxies separately without expanding exact measurement coverage', () => {
    const requestedKeys = modelOpenReferencePreviewRequestedLimbKeysV1({
      schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
      heightMm: 1720,
      shoulderBreadthMm: 420,
      chestCircumferenceMm: 920,
      waistCircumferenceMm: 740,
      hipCircumferenceMm: 980,
      armLengthMm: 600,
      inseamMm: 800,
      bicepCircumferenceMm: 300,
      wristCircumferenceMm: 170,
      thighCircumferenceMm: 520,
      calfCircumferenceMm: 370,
      ankleCircumferenceMm: 230,
    });
    expect(requestedKeys).toEqual([
      'bicepCircumferenceMm',
      'wristCircumferenceMm',
      'calfCircumferenceMm',
      'ankleCircumferenceMm',
    ]);

    expect(
      modelOpenReferencePreviewLimbOutcomeV1({
        posePresetId: 'a-rest',
        requestedKeys,
        completed: false,
      }),
    ).toMatchObject({ status: 'pending', label: 'limb proxies 0/4' });
    expect(
      modelOpenReferencePreviewLimbOutcomeV1({
        posePresetId: 'a-rest',
        requestedKeys,
        completed: true,
        runtime: {
          status: 'partial',
          diagnostics: [],
          representedGeometricProxies: [
            'bicepCircumferenceMm',
            'wristCircumferenceMm',
            'calfCircumferenceMm',
          ],
        },
      }),
    ).toMatchObject({ status: 'partial', label: 'limb proxies 3/4' });
    const nonA = modelOpenReferencePreviewLimbOutcomeV1({
      posePresetId: 'near-t',
      requestedKeys,
      completed: true,
    });
    expect(nonA).toMatchObject({ status: 'omitted-non-a', label: 'limb proxies 0/4' });
    expect(nonA.warning).toContain('joint-anchor deltas are not admitted');
    expect(JSON.stringify(nonA)).not.toContain('visual coverage 5/7');
  });
});
