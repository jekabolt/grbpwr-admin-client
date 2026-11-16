import type { common_BodyMeasurementName, common_GenderEnum } from 'api/proto-http/admin';
import type {
  MeasurementSurfacePatternPieceOverlayV1,
  MeasurementSurfaceStageStatus,
  MeasurementSurfaceViewPreset,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import {
  createMeasurementOpenReferenceFullBodyLocalFkRuntimeV3,
  type MakeHumanFullBodyLocalFkPoseV3,
  type MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV3,
} from 'lib/cloth/body/makehuman-full-body-local-fk-runtime-v3';
import {
  createMakeHumanFullBodyJointOverlayRuntimeV4,
  MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4,
  type MakeHumanFullBodyJointOverlayGroupV4,
  type MakeHumanFullBodyJointOverlayGroupIdV4,
  type MakeHumanFullBodyJointOverlayRuntimeResultV4,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v4';
import {
  createMakeHumanFullBodyJointOverlayRuntimeV5,
  makeHumanFullBodyJointOverlayGroupsFromBonesV5,
  type MakeHumanFullBodyJointOverlayGroupV5,
  type MakeHumanFullBodyJointOverlayGroupIdV5,
  type MakeHumanFullBodyJointOverlayRuntimeResultV5,
} from 'lib/cloth/body/makehuman-full-body-joint-overlay-runtime-v5';
import {
  solveMakeHumanArmBodyPartIkV1,
  type MakeHumanArmBodyPartIkSideV1,
} from 'lib/cloth/body/makehuman-arm-body-part-ik-v1';
import type {
  MakeHumanCloLikeArmControlsV3,
  MakeHumanCloLikeTorsoControlsV3,
} from 'lib/cloth/body/makehuman-clo-like-pose-display-v3';
import {
  createMakeHumanFullBodyLiveFkSessionV4,
  type MakeHumanFullBodyLiveFkSessionV4,
} from 'lib/cloth/body/makehuman-full-body-live-fk-session-v4';
import {
  createMakeHumanFullBodyLiveFkSessionV5,
  type MakeHumanFullBodyLiveFkSessionV5,
} from 'lib/cloth/body/makehuman-full-body-live-fk-session-v5';
import {
  createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4,
  type MakeHumanFullBodyLocalFkPoseV4,
  type MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV4,
} from 'lib/cloth/body/makehuman-full-body-local-fk-runtime-v4';
import type { MakeHumanShoulderPostureControlsV4 } from 'lib/cloth/body/makehuman-full-body-pose-v4';
import { solveMakeHumanHeadAimIkV1 } from 'lib/cloth/body/makehuman-head-aim-ik-v1';
import {
  solveMakeHumanLegBodyPartIkV1,
  type MakeHumanLegBodyPartIkControlsV1,
  type MakeHumanLegBodyPartIkSideV1,
} from 'lib/cloth/body/makehuman-leg-body-part-ik-v1';
import {
  evaluateMakeHumanLivePoseAdmissibilityV1,
  type MakeHumanLivePoseBlockerV1,
} from 'lib/cloth/body/makehuman-live-pose-admissibility-v1';
import { solveMakeHumanTorsoAimIkV1 } from 'lib/cloth/body/makehuman-torso-aim-ik-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from 'lib/cloth/body/measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementOpenReferenceBetaShapeRuntimeResultV1 } from 'lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1';
import type { MeasurementOpenReferenceDisplayPoseRuntimeResultV1 } from 'lib/cloth/body/measurement-open-reference-display-pose-runtime-v1';
import type { MeasurementOpenReferenceLimbSubsetRuntimeResultV1 } from 'lib/cloth/body/measurement-open-reference-limb-subset-runtime-v1';
import {
  loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1,
  type MeasurementOpenReferenceLimbSubsetRuntimeModuleV1,
} from 'lib/cloth/body/measurement-open-reference-limb-subset-runtime-loader-v1';
import {
  createMeasurementOpenReferenceDisplaySnapshotOwnerV2,
  measurementOpenReferenceDisplaySnapshotSourceRevisionV2,
  type MeasurementOpenReferenceDisplaySnapshotBindingV2,
  type MeasurementOpenReferenceDisplaySnapshotV2,
} from 'lib/cloth/body/measurement-open-reference-display-snapshot-owner-v2';
import type { MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2 } from 'lib/cloth/body/measurement-open-reference-linked-symmetric-pose-lanes-diagnostic-v2';
import {
  createMeasurementBodyFrameV2,
  type MeasurementBodyFrameV2,
} from 'lib/cloth/body/measurement-body-frame-v2';
import type {
  CanonicalBodyMeasurementsMm,
  MeasurementAdapterDiagnostic,
} from 'lib/cloth/body/measurement-adapter';
import {
  createMeasurementOpenReferenceDisplaySnapshotOwnerV1,
  measurementOpenReferenceDisplaySnapshotSourceRevisionV1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_BUNDLE_SHA256_V1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_REVISION_V1,
  type MeasurementOpenReferenceDisplaySnapshotBindingV1,
  type MeasurementOpenReferenceDisplaySnapshotBuildResultV1,
  type MeasurementOpenReferenceDisplaySnapshotRequestV1,
  type MeasurementOpenReferenceDisplaySnapshotV1,
} from 'lib/cloth/body/measurement-open-reference-display-snapshot-owner-v1';
import {
  createMeasurementOpenReferenceUniformHeightDisplayV1,
  loadMakeHumanOpenReferenceBasisV1,
  snapshotMeasurementOpenReferenceDisplayArtifactV1,
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
  type MeasurementOpenReferenceDisplayArtifactV1,
} from 'lib/cloth/body/measurement-open-reference-display-v1';
import {
  measurementOpenReferenceDisplayPosePresetV1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_PRESETS_V1,
  type MeasurementOpenReferenceDisplayPosePresetIdV1,
} from 'lib/cloth/body/measurement-open-reference-display-pose-v1';
import {
  createMeasurementWatertightSurfaceV1,
  type MeasurementSurfaceMeshV1,
  type MeasurementWatertightSurfaceArtifactV1,
} from 'lib/cloth/body/measurement-watertight-surface-v1';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, CalloutBox, Chip, ChipRow, Pill, SkeletonBlocks, Text } from 'ui';
import {
  resolveModelOpenReferencePreviewInputV1,
  type ModelOpenReferencePreviewInputV1,
} from './model-open-reference-preview-input-v1';
import {
  modelOpenReferenceMeasurementApplicationSummaryV1,
  modelOpenReferenceMeasurementApplicationV1,
  type ModelOpenReferenceMeasurementApplicationV1,
} from './model-open-reference-measurement-application-v1';
import { buildMeasurementSurfaceActiveMeasurementGuideV1 } from 'components/shared/measurement-surface-active-measurement-guide-v1';
import {
  MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V3,
  ModelOpenReferenceFullBodyPoseControlV3,
  modelOpenReferenceFullBodyPoseEqualV3,
  type ModelOpenReferenceFullBodyPoseControlStatusV3,
  type ModelOpenReferenceFullBodyPoseV3,
} from './model-open-reference-full-body-pose-control-v3';
import {
  MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
  ModelOpenReferenceFullBodyPoseControlV4,
  modelOpenReferenceFullBodyPoseGeometryEqualV4,
  snapshotModelOpenReferenceFullBodyPoseV4,
  type ModelOpenReferenceFullBodyPoseControlStatusV4,
  type ModelOpenReferenceFullBodyPoseV4,
} from './model-open-reference-full-body-pose-control-v4';
import {
  ModelOpenReferenceJointPoseControlV5,
  modelOpenReferenceJointSelectionV5,
  type ModelOpenReferenceJointEditorModeV5,
  type ModelOpenReferenceJointSelectionV5,
} from './model-open-reference-joint-pose-control-v5';
import {
  modelOpenReferenceJointRingBeginV6,
  modelOpenReferenceJointRingFinishV6,
  modelOpenReferenceJointRingMoveV6,
  type ModelOpenReferenceJointRingDraggingV6,
} from './model-open-reference-joint-ring-contract-v6';
import { ModelOpenReferenceJointPoseControlV6 } from './model-open-reference-joint-pose-control-v6';
import { ModelOpenReferenceJointPoseControlV7 } from './model-open-reference-joint-pose-control-v7';
import { ModelOpenReferenceJointPoseControlV8 } from './model-open-reference-joint-pose-control-v8';
import { ModelOpenReferenceDirectPoseControlV9 } from './model-open-reference-direct-pose-control-v9';
import {
  modelOpenReferenceDirectJointRingBeginV9,
  modelOpenReferenceDirectJointRingFinishV9,
  modelOpenReferenceDirectJointRingMoveV9,
  modelOpenReferenceDirectJointSelectionV9,
  type ModelOpenReferenceDirectJointRingDraggingV9,
  type ModelOpenReferenceDirectJointSelectionV9,
} from './model-open-reference-direct-joint-ring-v9';
import {
  MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
  modelOpenReferenceDirectApplyArmIkV9,
  modelOpenReferenceDirectApplyHeadV9,
  modelOpenReferenceDirectApplyLegIkV9,
  modelOpenReferenceDirectApplyShoulderPostureV9,
  modelOpenReferenceDirectApplyTorsoIkV9,
  modelOpenReferenceDirectArmForIkV9,
  modelOpenReferenceBeginDirectPoseGestureV9,
  modelOpenReferenceDirectLegForIkV9,
  modelOpenReferenceDirectPoseGeometryEqualV9,
  modelOpenReferenceDirectRuntimePoseV9,
  modelOpenReferenceDirectShoulderPostureV9,
  modelOpenReferenceDirectSolveShoulderPostureDragV9,
  snapshotModelOpenReferenceDirectPoseV9,
  type ModelOpenReferenceDirectPoseV9,
} from './model-open-reference-direct-pose-v9';
import type { ModelMannequinPoseDocumentV2 } from './model-mannequin-pose-document-v2';
import {
  ModelOpenReferenceLinkedPoseControlV2,
  modelOpenReferenceLinkedPoseSelectionEqualV2,
  modelOpenReferenceLinkedPoseSelectionLabelV2,
  type ModelOpenReferenceLinkedPoseControlStatusV2,
} from './model-open-reference-linked-pose-control-v2';
import type { ModelFormData } from './schema';

type PreviewStatus = 'idle' | 'building' | MeasurementSurfaceStageStatus;

interface BuiltPreview {
  readonly artifact: MeasurementWatertightSurfaceArtifactV1;
  readonly frame: MeasurementBodyFrameV2;
  readonly snapshot: MeasurementOpenReferenceDisplaySnapshotV1;
  readonly limbOutcome: PreviewLimbOutcomeV1;
  readonly rendererDisplayMesh: MeasurementSurfaceMeshV1;
  readonly buildFingerprint: string;
  readonly poseOutcome: PreviewPoseOutcomeV1;
}

type LinkedPoseSelectionV2 = MeasurementOpenReferenceLinkedSymmetricPoseLaneInputV2;
type LinkedPreviewUpdateStatusV2 = 'idle' | 'building' | 'error';
type LinkedSnapshotOwnerV2 = ReturnType<
  typeof createMeasurementOpenReferenceDisplaySnapshotOwnerV2
>;

interface LinkedBuiltPreviewV2 {
  readonly artifact: MeasurementWatertightSurfaceArtifactV1;
  readonly frame: MeasurementBodyFrameV2;
  readonly snapshot: MeasurementOpenReferenceDisplaySnapshotV2;
  readonly rendererDisplayMesh: MeasurementSurfaceMeshV1;
  readonly bodyBuildFingerprint: string;
}

interface FullBodyBuiltPreviewV3 {
  readonly artifact: MeasurementWatertightSurfaceArtifactV1;
  readonly frame: MeasurementBodyFrameV2;
  readonly runtime:
    | MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV3
    | MeasurementOpenReferenceFullBodyLocalFkRuntimeResultV4;
  readonly measurementGuideSourceMesh: MeasurementSurfaceMeshV1;
  readonly waistHipStatus: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1['status'];
  readonly representedWaistHipProxies: readonly string[];
  readonly jointOverlay:
    | MakeHumanFullBodyJointOverlayRuntimeResultV4
    | MakeHumanFullBodyJointOverlayRuntimeResultV5
    | null;
  readonly jointOverlayError: string | null;
  readonly liveFkSession:
    | MakeHumanFullBodyLiveFkSessionV4
    | MakeHumanFullBodyLiveFkSessionV5
    | null;
  readonly measurementApplication: ModelOpenReferenceMeasurementApplicationV1 | null;
  readonly bodyBuildFingerprint: string;
}

export type ModelOpenReferenceBodyDisplayOwnershipV11 =
  | 'empty'
  | 'current'
  | 'preparing'
  | 'retained-pending'
  | 'retained-invalid'
  | 'retained-error';

export const MODEL_OPEN_REFERENCE_MEASUREMENT_BUILD_DEBOUNCE_MS_V12 = 120;

export function modelOpenReferenceFullBodyBuildDelayV12(options: {
  readonly intent: 'immediate' | 'measurement-change';
  readonly retainsLastValidBody: boolean;
}): number {
  return options.intent === 'measurement-change' && options.retainsLastValidBody
    ? MODEL_OPEN_REFERENCE_MEASUREMENT_BUILD_DEBOUNCE_MS_V12
    : 0;
}

export function modelOpenReferenceBodyDisplayOwnershipV11(options: {
  readonly builtFingerprint: string | null;
  readonly requestedFingerprint: string;
  readonly resolutionOk: boolean;
  readonly updateStatus: 'idle' | 'building' | 'error';
  readonly stageStatus: 'idle' | MeasurementSurfaceStageStatus;
}): ModelOpenReferenceBodyDisplayOwnershipV11 {
  if (options.builtFingerprint === null) return 'empty';
  if (!options.resolutionOk) return 'retained-invalid';
  if (options.builtFingerprint !== options.requestedFingerprint) {
    return options.updateStatus === 'error' ? 'retained-error' : 'retained-pending';
  }
  return options.stageStatus === 'ready' ? 'current' : 'preparing';
}

export function modelOpenReferencePoseBlockedMessageV11(
  blockers: readonly MakeHumanLivePoseBlockerV1[],
): string | null {
  if (blockers.length === 0) return null;
  const reasons: string[] = [];
  if (blockers.some((blocker) => blocker.endsWith('-overlap'))) {
    reasons.push('a limb would overlap the body or another limb');
  }
  if (blockers.some((blocker) => blocker.endsWith('-direction'))) {
    reasons.push('a joint would bend in the wrong direction');
  }
  if (blockers.includes('no-grounded-foot')) reasons.push('at least one foot must stay grounded');
  if (blockers.includes('foot-below-ground')) reasons.push('a foot cannot move below the ground');
  const explanation = reasons.length > 0 ? reasons.join('; ') : 'the pose is outside safe limits';
  return `Pose blocked: ${explanation}. Showing the last valid pose.`;
}

export interface ModelOpenReferenceLivePoseFrameV10 {
  readonly bodyBuildFingerprint: string;
  readonly bodySourceRevision: string;
  readonly positions: Float32Array;
  readonly groups: readonly MakeHumanFullBodyJointOverlayGroupV5[] | null;
  readonly jointOverlaySignature: string | null;
}

export function modelOpenReferenceLiveJointOverlaySignatureV10(
  groups: readonly Pick<
    MakeHumanFullBodyJointOverlayGroupV5,
    'id' | 'headM' | 'tailM' | 'localToWorld'
  >[],
): string {
  return JSON.stringify(
    groups.map(({ id, headM, tailM, localToWorld }) => [id, ...headM, ...tailM, ...localToWorld]),
  );
}

export type ModelOpenReferenceLivePoseAttemptV10 =
  | Readonly<{ status: 'rejected' }>
  | Readonly<{
      status: 'accepted';
      bodyBuildFingerprint: string;
      bodySourceRevision: string;
      positions: Float32Array;
      groups: readonly MakeHumanFullBodyJointOverlayGroupV5[] | null;
    }>;

export function modelOpenReferenceLivePoseFrameNextV10(
  current: ModelOpenReferenceLivePoseFrameV10 | null,
  attempt: ModelOpenReferenceLivePoseAttemptV10,
): ModelOpenReferenceLivePoseFrameV10 | null {
  if (attempt.status === 'rejected') return current;
  return Object.freeze({
    bodyBuildFingerprint: attempt.bodyBuildFingerprint,
    bodySourceRevision: attempt.bodySourceRevision,
    positions: attempt.positions,
    groups: attempt.groups,
    jointOverlaySignature: attempt.groups
      ? modelOpenReferenceLiveJointOverlaySignatureV10(attempt.groups)
      : null,
  });
}

export interface ModelOpenReferencePreviewProps {
  readonly buildDependencies?: Partial<ModelOpenReferencePreviewBuildDependenciesV1>;
  readonly initialPosePreset?: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly modelId?: string;
  readonly modelContentRevision?: string;
  readonly poseControls?:
    | 'presets-v1'
    | 'linked-v2'
    | 'full-body-v3'
    | 'full-body-v4'
    | 'full-body-v5'
    | 'full-body-v6'
    | 'full-body-v7'
    | 'full-body-v8'
    | 'full-body-v9';
  readonly directPoseBindingV9?: ModelOpenReferenceDirectPoseBindingV9;
  /** Workbench-only boundary: keep the V9 owner mounted while direct viewport posing is off. */
  readonly directPoseViewportEditingEnabledV9?: boolean;
  /** Workbench embeds expose their own single pose toggle instead of the model-form toolbar. */
  readonly hideDirectPoseControlV9?: boolean;
  readonly variant?: 'form' | 'workbench' | 'card';
  /** Existing renderer camera preset. Orbit and wheel zoom remain direct viewport gestures. */
  readonly viewPreset?: MeasurementSurfaceViewPreset;
  /** Caller-owned exact pattern pieces rendered by the existing mannequin Three stage. */
  readonly patternPieceOverlay?: MeasurementSurfacePatternPieceOverlayV1;
  /** Measurement field currently focused or hovered in the model form. */
  readonly activeMeasurementName?: common_BodyMeasurementName;
}

export interface ModelOpenReferenceDirectPoseBindingV9 {
  readonly document: ModelMannequinPoseDocumentV2;
  /** Canonical document JSON. It is a local render key, never a persistence receipt. */
  readonly canonicalKey: string;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly onBeginGesture: () => void;
  readonly onUpdateGesture: (pose: ModelOpenReferenceDirectPoseV9) => void;
  readonly onFinishGesture: (
    outcome: 'commit' | 'cancel',
    pose: ModelOpenReferenceDirectPoseV9,
  ) => void;
  readonly onDiscreteEdit: (pose: ModelOpenReferenceDirectPoseV9) => void;
  readonly onUndo: () => ModelOpenReferenceDirectPoseV9;
  readonly onReset: () => ModelOpenReferenceDirectPoseV9;
  readonly persistence?: ModelOpenReferenceDirectPosePersistenceV1;
}

export interface ModelOpenReferenceDirectPosePersistenceV1 {
  readonly statusText: string;
  readonly errorText: string | null;
  readonly showSave: boolean;
  readonly canSave: boolean;
  readonly saving: boolean;
  readonly conflict: boolean;
  readonly onSave: () => void;
  readonly onKeepMine: () => ModelOpenReferenceDirectPoseV9;
  readonly onReloadTheirs: () => ModelOpenReferenceDirectPoseV9;
}

export interface ModelOpenReferencePreviewFromInputProps extends ModelOpenReferencePreviewProps {
  /** Saved or otherwise caller-owned model values; no nested React Hook Form owner is created. */
  readonly input: ModelOpenReferencePreviewInputV1;
}

const LINKED_A_REST_SELECTION_V2 = Object.freeze({ lane: 'relax' as const, degrees: 0 as const });

export const MODEL_OPEN_REFERENCE_PREVIEW_LIMB_KEYS_V1 = Object.freeze([
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
] as const);

export type ModelOpenReferencePreviewLimbKeyV1 =
  (typeof MODEL_OPEN_REFERENCE_PREVIEW_LIMB_KEYS_V1)[number];

export interface PreviewLimbOutcomeV1 {
  readonly requestedKeys: readonly ModelOpenReferencePreviewLimbKeyV1[];
  readonly representedKeys: readonly ModelOpenReferencePreviewLimbKeyV1[];
  readonly status:
    | 'error'
    | 'not-requested'
    | 'omitted-non-a'
    | 'partial'
    | 'pending'
    | 'represented'
    | 'unrepresented';
  readonly label:
    | 'limb proxies 0/4'
    | 'limb proxies 1/4'
    | 'limb proxies 2/4'
    | 'limb proxies 3/4'
    | 'limb proxies 4/4';
  readonly message: string;
  readonly warning: string | null;
}

interface PreviewPoseOutcomeV1 {
  readonly requestedPresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly resolvedPresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly status: 'a-rest' | 'fallback' | 'posed';
  readonly message: string;
  readonly maximumJointPivotResidualM: number | null;
}

const DISPLAY_OVERLAYS = Object.freeze({
  wireframe: false,
  normals: false,
  landmarks: false,
  sectionPlanes: false,
});

export const MODEL_OPEN_REFERENCE_PREVIEW_LIMB_RUNTIME_REVISION_V1 =
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_REVISION_V1;
export const MODEL_OPEN_REFERENCE_PREVIEW_LIMB_BUNDLE_SHA256_V1 =
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_SNAPSHOT_OWNER_LIMB_BUNDLE_SHA256_V1;
const NOOP = () => undefined;
const MeasurementWatertightSurfaceV1Stage = lazy(() =>
  import('components/shared/measurement-watertight-surface-v1-stage').then((module) => ({
    default: module.MeasurementWatertightSurfaceV1Stage,
  })),
);

function statusTone(status: PreviewStatus): 'mut' | 'attention' | 'ok' | 'warn' {
  if (status === 'ready') return 'ok';
  if (status === 'error') return 'warn';
  if (status === 'building' || status === 'initializing') return 'attention';
  return 'mut';
}

function limbOutcomeTone(
  status: PreviewLimbOutcomeV1['status'],
): 'mut' | 'attention' | 'ok' | 'warn' {
  if (status === 'represented') return 'ok';
  if (status === 'partial' || status === 'pending') return 'attention';
  if (status === 'error' || status === 'omitted-non-a' || status === 'unrepresented') return 'warn';
  return 'mut';
}

/** Stable invalidation key. It stays local and is never emitted as preview provenance. */
export function modelOpenReferencePreviewFingerprintV1(
  input: ModelOpenReferencePreviewInputV1,
): string {
  const measurements = Object.entries(input.measurements)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([input.gender ?? null, measurements]);
}

/** Short local binding for provenance and stage consistency; it never leaves the browser. */
export function modelOpenReferencePreviewSourceRevisionV1(
  fingerprint: string,
  basisKind: MakeHumanOpenReferenceBasisV1['kind'],
  posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1 = 'a-rest',
  limbSubsetRequested = false,
): string {
  if (basisKind === 'base') throw new RangeError('The base basis is not a display basis.');
  return measurementOpenReferenceDisplaySnapshotSourceRevisionV1({
    inputFingerprint: fingerprint,
    basisKind,
    posePresetId,
    limbSubsetRequested,
  });
}

export function modelOpenReferencePreviewBuildFingerprintV1(
  inputFingerprint: string,
  posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1,
): string {
  return `${inputFingerprint};displayPosePreset=${posePresetId}`;
}

export function modelOpenReferencePreviewRequestedLimbKeysV1(
  measurements: CanonicalBodyMeasurementsMm,
): readonly ModelOpenReferencePreviewLimbKeyV1[] {
  return Object.freeze(
    MODEL_OPEN_REFERENCE_PREVIEW_LIMB_KEYS_V1.filter((key) => measurements[key] != null),
  );
}

export function modelOpenReferencePreviewLimbOutcomeV1(options: {
  readonly posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly requestedKeys: readonly ModelOpenReferencePreviewLimbKeyV1[];
  readonly completed: boolean;
  readonly runtime?: Pick<
    MeasurementOpenReferenceLimbSubsetRuntimeResultV1,
    'diagnostics' | 'representedGeometricProxies' | 'status'
  > | null;
  readonly error?: string | null;
}): PreviewLimbOutcomeV1 {
  const requestedKeys = Object.freeze([...options.requestedKeys]);
  const representedKeys = Object.freeze(
    (options.runtime?.representedGeometricProxies ?? []).filter(
      (key): key is ModelOpenReferencePreviewLimbKeyV1 =>
        MODEL_OPEN_REFERENCE_PREVIEW_LIMB_KEYS_V1.includes(
          key as ModelOpenReferencePreviewLimbKeyV1,
        ),
    ),
  );
  const label = `limb proxies ${representedKeys.length}/4` as PreviewLimbOutcomeV1['label'];
  const base = { requestedKeys, representedKeys, label };

  if (requestedKeys.length === 0) {
    return Object.freeze({
      ...base,
      status: 'not-requested' as const,
      message:
        'No optional bicep, wrist, calf or ankle value was entered. Limb assets were not loaded.',
      warning: null,
    });
  }
  if (options.posePresetId !== 'a-rest') {
    return Object.freeze({
      ...base,
      status: 'omitted-non-a' as const,
      message:
        'Limb proxies are omitted for non-A display poses. Pose starts from the final waist/hip mesh.',
      warning:
        'Non-A limb joint-anchor deltas are not admitted, so no limb value is represented in this pose.',
    });
  }
  if (!options.completed) {
    return Object.freeze({
      ...base,
      status: 'pending' as const,
      message: `Build preview to evaluate ${requestedKeys.length} optional limb ${requestedKeys.length === 1 ? 'proxy' : 'proxies'}.`,
      warning: null,
    });
  }
  if (options.error || options.runtime?.status === 'error') {
    const runtimeMessage =
      options.error ??
      options.runtime?.diagnostics.find(({ code }) => code === 'runtime-unavailable')?.message ??
      'Limb proxy runtime failed closed.';
    return Object.freeze({
      ...base,
      status: 'error' as const,
      message: 'The final waist/hip display was retained.',
      warning: `${runtimeMessage} No guessed limb deformation was applied.`,
    });
  }
  if (options.runtime?.status === 'represented') {
    return Object.freeze({
      ...base,
      status: 'represented' as const,
      message: `${representedKeys.length} optional limb ${representedKeys.length === 1 ? 'proxy is' : 'proxies are'} visible on the A-rest display.`,
      warning: 'Limb proxies are bounded geometric controls, not canonical tape-protocol matches.',
    });
  }
  if (options.runtime?.status === 'partial') {
    return Object.freeze({
      ...base,
      status: 'partial' as const,
      message: `${representedKeys.length} of ${requestedKeys.length} requested limb proxies passed the bounded geometry policy.`,
      warning:
        'Rejected limb channels were rolled back independently. Limb proxies are not canonical tape-protocol matches.',
    });
  }
  return Object.freeze({
    ...base,
    status: 'unrepresented' as const,
    message: 'The final waist/hip display was retained.',
    warning:
      'No requested limb proxy passed the bounded geometry policy. No guessed limb deformation was applied.',
  });
}

function diagnosticKey(code: string, canonicalKey: string | undefined, index: number): string {
  return `${code}:${canonicalKey ?? 'unassigned'}:${index}`;
}

function measurementName(key: string): string {
  return key
    .replace(/Mm$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

export interface ModelOpenReferencePreviewCoverageV1 {
  readonly label: 'visual coverage pending' | 'visual coverage 1/7';
  readonly status: 'pending' | 'fallback-uniform';
  readonly proxyLabel:
    | 'geometric proxies pending'
    | 'geometric proxies 0/2'
    | 'geometric proxies 1/2'
    | 'geometric proxies 2/2';
  readonly proxyStatus: 'error' | 'partial' | 'pending' | 'represented' | 'unrepresented';
  readonly message: string;
  readonly warning: string | null;
}

export function modelOpenReferencePreviewCoverageV1(
  deformation: Pick<MeasurementOpenReferenceDisplayArtifactV1['deformation'], 'status'> | null,
  proxyRuntime: Pick<
    MeasurementOpenReferenceUniformWaistHipRuntimeResultV1,
    'status' | 'representedGeometricProxies'
  > | null = null,
): ModelOpenReferencePreviewCoverageV1 {
  if (!deformation) {
    return Object.freeze({
      label: 'visual coverage pending' as const,
      status: 'pending' as const,
      proxyLabel: 'geometric proxies pending' as const,
      proxyStatus: 'pending' as const,
      message:
        'BUILD PREVIEW starts from a clean height-scaled CC0 basis before reporting exact measurement coverage and bounded waist/hip geometric proxies.',
      warning: null,
    });
  }
  if (deformation.status === 'fallback-uniform' || deformation.status === 'uniform-height') {
    const represented = proxyRuntime?.representedGeometricProxies ?? [];
    const proxyCount = represented.length;
    const proxyStatus = proxyRuntime?.status ?? 'error';
    const proxyLabel = `geometric proxies ${proxyCount}/2` as
      | 'geometric proxies 0/2'
      | 'geometric proxies 1/2'
      | 'geometric proxies 2/2';
    const representedNames: ReadonlyArray<'waist' | 'hip'> = represented.map((key) =>
      key === 'waistCircumferenceMm' ? 'waist' : 'hip',
    );
    const missingNames = (['waist', 'hip'] as const).filter(
      (name) => !representedNames.includes(name),
    );
    if (proxyStatus === 'represented') {
      return Object.freeze({
        label: 'visual coverage 1/7' as const,
        status: 'fallback-uniform' as const,
        proxyLabel,
        proxyStatus,
        message:
          'The clean CC0 basis represents height as an exact measurement. Waist and hip additionally drive bounded closed-loop geometric proxies.',
        warning:
          'Waist and hip proxies are visual controls, not canonical tape-protocol matches. Shoulder, chest, inseam and sleeve length are not represented.',
      });
    }
    if (proxyStatus === 'partial') {
      return Object.freeze({
        label: 'visual coverage 1/7' as const,
        status: 'fallback-uniform' as const,
        proxyLabel,
        proxyStatus,
        message: `The clean CC0 basis represents height. The bounded ${representedNames.join(' and ')} closed-loop proxy is also visible.`,
        warning: `${missingNames.join(' and ')} did not pass the bounded CC0 proxy policy (range, closed section, cross-talk and quality gates). Geometric proxies are not canonical tape-protocol matches.`,
      });
    }
    if (proxyStatus === 'error') {
      return Object.freeze({
        label: 'visual coverage 1/7' as const,
        status: 'fallback-uniform' as const,
        proxyLabel,
        proxyStatus,
        message: 'The visible clean CC0 basis represents height only.',
        warning:
          'Waist and hip proxy data could not be loaded, so the height-only mesh was retained. No guessed deformation was applied.',
      });
    }
    return Object.freeze({
      label: 'visual coverage 1/7' as const,
      status: 'fallback-uniform' as const,
      proxyLabel,
      proxyStatus,
      message: 'The visible clean CC0 basis represents height only.',
      warning:
        'Entered waist and hip did not pass the bounded proxy policy (range, closed section, cross-talk and quality gates). No guessed deformation was applied; shoulder, chest, inseam and sleeve length are also not represented.',
    });
  }
  return Object.freeze({
    label: 'visual coverage 1/7' as const,
    status: 'fallback-uniform' as const,
    proxyLabel: 'geometric proxies 0/2' as const,
    proxyStatus: 'error' as const,
    message: 'The visible clean CC0 basis represents height only.',
    warning:
      'A research-only personalized candidate is not eligible for production display. The preview retained the height-only policy.',
  });
}

function failedProxyRuntime(
  openReference: MeasurementOpenReferenceDisplayArtifactV1,
  reason: unknown,
): MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 {
  const openReferenceSnapshot = snapshotMeasurementOpenReferenceDisplayArtifactV1(openReference);
  return Object.freeze({
    version: 'measurement-open-reference-uniform-waist-hip-runtime/v1' as const,
    role: 'CC0_OPEN_REFERENCE_DISPLAY_GEOMETRIC_PROXIES' as const,
    status: 'error' as const,
    openReference: openReferenceSnapshot,
    displayMesh: snapshotMeasurementSurfaceMeshV1(openReferenceSnapshot.mesh),
    requestedGeometricProxies: Object.freeze([
      'waistCircumferenceMm' as const,
      'hipCircumferenceMm' as const,
    ]),
    representedGeometricProxies: Object.freeze([]),
    modeResults: Object.freeze([]),
    diagnostics: Object.freeze([
      Object.freeze({
        code: 'runtime-unavailable' as const,
        measurementKey: null,
        message: reason instanceof Error ? reason.message : 'Waist/hip proxy runtime unavailable.',
      }),
    ]),
    qualityGate: null,
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

interface ModelOpenReferenceProxyRuntimeModuleV1 {
  readonly createMeasurementOpenReferenceUniformWaistHipRuntimeV1: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  }) => Promise<MeasurementOpenReferenceUniformWaistHipRuntimeResultV1>;
}

export interface ModelOpenReferencePoseRuntimeModuleV1 {
  readonly createMeasurementOpenReferenceDisplayPoseRuntimeV1: (options: {
    readonly basis: MakeHumanOpenReferenceBasisV1;
    readonly measurements: CanonicalBodyMeasurementsMm;
    readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
    readonly presetId: Exclude<MeasurementOpenReferenceDisplayPosePresetIdV1, 'a-rest'>;
  }) => Promise<MeasurementOpenReferenceDisplayPoseRuntimeResultV1>;
}

export interface ModelOpenReferencePreviewBuildDependenciesV1 {
  readonly loadBasis: typeof loadMakeHumanOpenReferenceBasisV1;
  readonly createUniformHeightDisplay: typeof createMeasurementOpenReferenceUniformHeightDisplayV1;
  readonly buildProxyRuntime: typeof buildModelOpenReferenceProxyRuntimeV1;
  readonly buildBetaShapeRuntime: typeof buildModelOpenReferenceBetaShapeRuntimeV1;
  readonly loadLimbRuntime: typeof loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1;
  readonly buildLimbDisplay: typeof buildModelOpenReferenceLimbDisplayV1;
  readonly loadPoseRuntime: typeof loadModelOpenReferencePoseRuntimeV1;
  readonly buildPoseDisplay: typeof buildModelOpenReferencePoseDisplayV1;
  readonly buildFullBodyLocalFkDisplay: typeof createMeasurementOpenReferenceFullBodyLocalFkRuntimeV3;
  readonly buildFullBodyJointOverlay: typeof createMakeHumanFullBodyJointOverlayRuntimeV4;
  readonly buildFullBodyLiveFkSession: typeof createMakeHumanFullBodyLiveFkSessionV4;
  readonly buildFullBodyLocalFkDisplayV4: typeof createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4;
  readonly buildFullBodyJointOverlayV5: typeof createMakeHumanFullBodyJointOverlayRuntimeV5;
  readonly buildFullBodyLiveFkSessionV5: typeof createMakeHumanFullBodyLiveFkSessionV5;
  readonly scheduleBuild: (callback: () => void, delayMs?: number) => ReturnType<typeof setTimeout>;
}

const DEFAULT_BUILD_DEPENDENCIES: ModelOpenReferencePreviewBuildDependenciesV1 = Object.freeze({
  loadBasis: loadMakeHumanOpenReferenceBasisV1,
  createUniformHeightDisplay: createMeasurementOpenReferenceUniformHeightDisplayV1,
  buildProxyRuntime: buildModelOpenReferenceProxyRuntimeV1,
  buildBetaShapeRuntime: buildModelOpenReferenceBetaShapeRuntimeV1,
  loadLimbRuntime: loadMeasurementOpenReferenceLimbSubsetRuntimeModuleV1,
  buildLimbDisplay: buildModelOpenReferenceLimbDisplayV1,
  loadPoseRuntime: loadModelOpenReferencePoseRuntimeV1,
  buildPoseDisplay: buildModelOpenReferencePoseDisplayV1,
  buildFullBodyLocalFkDisplay: createMeasurementOpenReferenceFullBodyLocalFkRuntimeV3,
  buildFullBodyJointOverlay: createMakeHumanFullBodyJointOverlayRuntimeV4,
  buildFullBodyLiveFkSession: createMakeHumanFullBodyLiveFkSessionV4,
  buildFullBodyLocalFkDisplayV4: createMeasurementOpenReferenceFullBodyLocalFkRuntimeV4,
  buildFullBodyJointOverlayV5: createMakeHumanFullBodyJointOverlayRuntimeV5,
  buildFullBodyLiveFkSessionV5: createMakeHumanFullBodyLiveFkSessionV5,
  scheduleBuild: (callback: () => void, delayMs = 0) => setTimeout(callback, delayMs),
});

export interface ModelOpenReferencePreviewRuntimeDiagnosticsV1 {
  readonly limbRuntimeMessage: string | null;
  readonly poseRuntimeMessage: string | null;
}

type ModelOpenReferencePreviewSnapshotBuildResultV1 =
  | Exclude<MeasurementOpenReferenceDisplaySnapshotBuildResultV1, { status: 'committed' }>
  | Readonly<{
      status: 'committed';
      snapshot: MeasurementOpenReferenceDisplaySnapshotV1;
      runtimeDiagnostics: ModelOpenReferencePreviewRuntimeDiagnosticsV1;
    }>;

interface ModelOpenReferenceDisplaySnapshotOwnerV1 {
  readonly build: (
    request: MeasurementOpenReferenceDisplaySnapshotRequestV1,
  ) => Promise<ModelOpenReferencePreviewSnapshotBuildResultV1>;
  readonly invalidate: () => void;
  readonly current: () => MeasurementOpenReferenceDisplaySnapshotV1 | null;
  readonly isCurrent: (binding: MeasurementOpenReferenceDisplaySnapshotBindingV1) => boolean;
}

export interface ModelOpenReferencePreviewCurrentBindingV1 {
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly posePresetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly sourceRevision: string;
}

/** Final UI-side guard in addition to the owner's private generation check. */
export function modelOpenReferencePreviewSnapshotBindingMatchesV1(
  binding: MeasurementOpenReferenceDisplaySnapshotBindingV1,
  current: ModelOpenReferencePreviewCurrentBindingV1 | null,
): boolean {
  return (
    current !== null &&
    binding.modelId === current.modelId &&
    binding.modelContentRevision === current.modelContentRevision &&
    binding.inputFingerprint === current.inputFingerprint &&
    binding.basisKind === current.basisKind &&
    binding.posePresetId === current.posePresetId &&
    binding.sourceRevision === current.sourceRevision
  );
}

/** Shared React commit guard for post-await, rerender and unmount boundaries. */
export function modelOpenReferencePreviewSnapshotCommitAllowedV1(options: {
  readonly requestedGeneration: number;
  readonly currentGeneration: number;
  readonly mounted: boolean;
  readonly owner: Pick<ModelOpenReferenceDisplaySnapshotOwnerV1, 'isCurrent'>;
  readonly binding: MeasurementOpenReferenceDisplaySnapshotBindingV1;
  readonly currentBinding: ModelOpenReferencePreviewCurrentBindingV1 | null;
}): boolean {
  return (
    options.mounted &&
    options.requestedGeneration === options.currentGeneration &&
    options.owner.isCurrent(options.binding) &&
    modelOpenReferencePreviewSnapshotBindingMatchesV1(options.binding, options.currentBinding)
  );
}

export interface ModelOpenReferenceLinkedPreviewCurrentBindingV2 {
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly poseSelection: LinkedPoseSelectionV2;
  readonly sourceRevision: string;
}

export function modelOpenReferenceLinkedPreviewBodyFingerprintV2(options: {
  readonly modelId: string;
  readonly modelContentRevision: string;
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
}): string {
  return JSON.stringify([
    options.modelId,
    options.modelContentRevision,
    options.inputFingerprint,
    options.basisKind,
  ]);
}

export function modelOpenReferenceLinkedPreviewBindingMatchesV2(
  binding: MeasurementOpenReferenceDisplaySnapshotBindingV2,
  current: ModelOpenReferenceLinkedPreviewCurrentBindingV2 | null,
): boolean {
  return (
    current !== null &&
    binding.modelId === current.modelId &&
    binding.modelContentRevision === current.modelContentRevision &&
    binding.inputFingerprint === current.inputFingerprint &&
    binding.basisKind === current.basisKind &&
    binding.sourceRevision === current.sourceRevision &&
    binding.poseConfigurationKey ===
      `linked-symmetric:${current.poseSelection.lane}-${current.poseSelection.degrees}`
  );
}

export function modelOpenReferenceLinkedPreviewCommitAllowedV2(options: {
  readonly requestedGeneration: number;
  readonly currentGeneration: number;
  readonly mounted: boolean;
  readonly owner: Pick<LinkedSnapshotOwnerV2, 'isCurrent'>;
  readonly binding: MeasurementOpenReferenceDisplaySnapshotBindingV2;
  readonly currentBinding: ModelOpenReferenceLinkedPreviewCurrentBindingV2 | null;
}): boolean {
  return (
    options.mounted &&
    options.requestedGeneration === options.currentGeneration &&
    options.owner.isCurrent(options.binding) &&
    modelOpenReferenceLinkedPreviewBindingMatchesV2(options.binding, options.currentBinding)
  );
}

export function modelOpenReferenceLinkedPreviewNextBuiltV2<T>(
  current: T | null,
  transition:
    | Readonly<{ type: 'body-invalidated' }>
    | Readonly<{ type: 'pose-building' | 'pose-blocked' }>
    | Readonly<{ type: 'pose-committed'; next: T }>,
): T | null {
  if (transition.type === 'body-invalidated') return null;
  if (transition.type === 'pose-committed') return transition.next;
  return current;
}

export function modelOpenReferenceLinkedPreviewDraftTransitionV2(options: {
  readonly currentStatus: LinkedPreviewUpdateStatusV2;
  readonly nextDraftSelection: LinkedPoseSelectionV2;
  readonly appliedSelection: LinkedPoseSelectionV2 | null;
  readonly hasBuiltPreview: boolean;
}) {
  const nextControlStatus =
    options.hasBuiltPreview &&
    !modelOpenReferenceLinkedPoseSelectionEqualV2(
      options.nextDraftSelection,
      options.appliedSelection,
    )
      ? ('pending' as const)
      : ('idle' as const);

  return Object.freeze({
    cancelActiveBuild: options.currentStatus === 'building',
    nextUpdateStatus: 'idle' as const,
    nextUpdateError: '',
    nextControlStatus,
    requestsBuild: false as const,
  });
}

/** Maps the editor's linked five-channel surface onto the stricter independent-arm runtime. */
export function modelOpenReferenceFullBodyRuntimePoseV3(
  pose: ModelOpenReferenceFullBodyPoseV3,
): MakeHumanFullBodyLocalFkPoseV3 {
  return Object.freeze({
    torsoFlexionDeg: pose.bodyFlexionDegrees,
    torsoSideBendDeg: pose.bodySideBendDegrees,
    torsoTwistDeg: pose.bodyTwistDegrees,
    symmetry: 'bilateral' as const,
    arm: Object.freeze({
      shoulderRaiseDeg: pose.linkedArmRaiseDegrees,
      shoulderForwardDeg: pose.linkedArmForwardDegrees,
      elbowBendDeg: pose.linkedElbowBendDegrees,
      wristBendDeg: pose.linkedWristBendDegrees,
    }),
  });
}

function modelOpenReferenceFullBodyArmRuntimePoseV4(
  arm: ModelOpenReferenceFullBodyPoseV4['leftArm'],
) {
  return Object.freeze({
    shoulderRaiseDeg: arm.shoulderRaiseDegrees,
    shoulderForwardDeg: arm.shoulderForwardDegrees,
    elbowBendDeg: arm.elbowBendDegrees,
    wristBendDeg: arm.wristBendDegrees,
  });
}

function modelOpenReferenceFullBodyArmsEqualV4(pose: ModelOpenReferenceFullBodyPoseV4): boolean {
  return (
    pose.leftArm.shoulderRaiseDegrees === pose.rightArm.shoulderRaiseDegrees &&
    pose.leftArm.shoulderForwardDegrees === pose.rightArm.shoulderForwardDegrees &&
    pose.leftArm.elbowBendDegrees === pose.rightArm.elbowBendDegrees &&
    pose.leftArm.wristBendDegrees === pose.rightArm.wristBendDegrees
  );
}

export function modelOpenReferenceFullBodyRuntimePoseV4(
  pose: ModelOpenReferenceFullBodyPoseV4,
): MakeHumanFullBodyLocalFkPoseV3 {
  const torso = Object.freeze({
    torsoFlexionDeg: pose.bodyFlexionDegrees,
    torsoSideBendDeg: pose.bodySideBendDegrees,
    torsoTwistDeg: pose.bodyTwistDegrees,
  });
  if (pose.armMode === 'linked') {
    if (!modelOpenReferenceFullBodyArmsEqualV4(pose)) {
      throw new Error('Linked V4 arm values must be identical before runtime compilation.');
    }
    return Object.freeze({
      ...torso,
      symmetry: 'bilateral' as const,
      arm: modelOpenReferenceFullBodyArmRuntimePoseV4(pose.leftArm),
    });
  }
  return Object.freeze({
    ...torso,
    symmetry: 'independent' as const,
    leftArm: modelOpenReferenceFullBodyArmRuntimePoseV4(pose.leftArm),
    rightArm: modelOpenReferenceFullBodyArmRuntimePoseV4(pose.rightArm),
  });
}

function modelOpenReferenceFullBodyArmForIkV8(
  pose: ModelOpenReferenceFullBodyPoseV4,
  side: MakeHumanArmBodyPartIkSideV1,
): MakeHumanCloLikeArmControlsV3 {
  return modelOpenReferenceFullBodyArmRuntimePoseV4(side === 'left' ? pose.leftArm : pose.rightArm);
}

function modelOpenReferenceFullBodyApplyArmIkV8(
  pose: ModelOpenReferenceFullBodyPoseV4,
  side: MakeHumanArmBodyPartIkSideV1,
  arm: MakeHumanCloLikeArmControlsV3,
): ModelOpenReferenceFullBodyPoseV4 {
  const nextArm = Object.freeze({
    shoulderRaiseDegrees: arm.shoulderRaiseDeg,
    shoulderForwardDegrees: arm.shoulderForwardDeg,
    elbowBendDegrees: arm.elbowBendDeg,
    wristBendDegrees: arm.wristBendDeg,
  });
  return snapshotModelOpenReferenceFullBodyPoseV4(
    pose.armMode === 'linked'
      ? { ...pose, leftArm: nextArm, rightArm: nextArm }
      : { ...pose, [side === 'left' ? 'leftArm' : 'rightArm']: nextArm },
  );
}

function modelOpenReferenceFullBodyTorsoForIkV8(
  pose: ModelOpenReferenceFullBodyPoseV4,
): MakeHumanCloLikeTorsoControlsV3 {
  return Object.freeze({
    torsoFlexionDeg: pose.bodyFlexionDegrees,
    torsoSideBendDeg: pose.bodySideBendDegrees,
    torsoTwistDeg: pose.bodyTwistDegrees,
  });
}

function modelOpenReferenceFullBodyApplyTorsoIkV8(
  pose: ModelOpenReferenceFullBodyPoseV4,
  torso: MakeHumanCloLikeTorsoControlsV3,
): ModelOpenReferenceFullBodyPoseV4 {
  return snapshotModelOpenReferenceFullBodyPoseV4({
    ...pose,
    bodyFlexionDegrees: torso.torsoFlexionDeg,
    bodySideBendDegrees: torso.torsoSideBendDeg,
    bodyTwistDegrees: torso.torsoTwistDeg,
  });
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV3(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceFullBodyPoseV3;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPose=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV4(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPoseV4=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV5(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPoseV5=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV6(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPoseV6=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV7(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPoseV7=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV8(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceFullBodyPoseV4;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPoseV8=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export function modelOpenReferenceFullBodyPoseSourceRevisionV9(options: {
  readonly inputFingerprint: string;
  readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
  readonly pose: ModelOpenReferenceDirectPoseV9;
}): string {
  const baseRevision = modelOpenReferencePreviewSourceRevisionV1(
    options.inputFingerprint,
    options.basisKind,
  );
  return `${baseRevision};editorPoseV9=${encodeURIComponent(JSON.stringify(options.pose))}`;
}

export const MODEL_OPEN_REFERENCE_FULL_BODY_JOINT_OVERLAY_BINDING_ERROR_V5 =
  'Joint controls were discarded because they did not match the visible body.';

interface ModelOpenReferenceBoundJointOverlayV5 {
  readonly binding: Readonly<{ readonly bodySourceRevision: string }>;
}

export function modelOpenReferenceJointEditorEffectiveModeV5(
  requestedMode: ModelOpenReferenceJointEditorModeV5,
  overlayStatus: MakeHumanFullBodyJointOverlayRuntimeResultV4['status'] | null,
): ModelOpenReferenceJointEditorModeV5 {
  return overlayStatus === 'ready' ? requestedMode : 'camera';
}

export function modelOpenReferenceFullBodyJointOverlayNextBuiltV5<
  Overlay extends ModelOpenReferenceBoundJointOverlayV5,
  T extends {
    readonly bodyBuildFingerprint: string;
    readonly runtime: Readonly<{ readonly sourceRevision: string }>;
    readonly jointOverlay: Overlay | null;
    readonly jointOverlayError: string | null;
  },
>(
  current: T | null,
  requestedBodyBuildFingerprint: string,
  expectedRuntimeSourceRevision: string,
  next: Pick<T, 'jointOverlay' | 'jointOverlayError'>,
): T | null {
  if (
    current?.bodyBuildFingerprint !== requestedBodyBuildFingerprint ||
    current.runtime.sourceRevision !== expectedRuntimeSourceRevision
  ) {
    return current;
  }
  if (
    next.jointOverlay !== null &&
    next.jointOverlay.binding.bodySourceRevision !== expectedRuntimeSourceRevision
  ) {
    return Object.assign({}, current, {
      jointOverlay: null,
      jointOverlayError: MODEL_OPEN_REFERENCE_FULL_BODY_JOINT_OVERLAY_BINDING_ERROR_V5,
    });
  }
  return Object.assign({}, current, next);
}

function modelOpenReferenceFullBodyPoseLabelV3(pose: ModelOpenReferenceFullBodyPoseV3): string {
  if (modelOpenReferenceFullBodyPoseEqualV3(pose, MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V3)) {
    return 'A-rest';
  }
  return `body ${pose.bodyFlexionDegrees}/${pose.bodySideBendDegrees}/${pose.bodyTwistDegrees}°, arms raise ${pose.linkedArmRaiseDegrees}° / forward ${pose.linkedArmForwardDegrees}°, elbows ${pose.linkedElbowBendDegrees}°, wrists ${pose.linkedWristBendDegrees}°`;
}

function modelOpenReferenceFullBodyPoseLabelV4(pose: ModelOpenReferenceFullBodyPoseV4): string {
  if (
    modelOpenReferenceFullBodyPoseGeometryEqualV4(
      pose,
      MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    )
  ) {
    return 'A-rest';
  }
  const body = `body ${pose.bodyFlexionDegrees}/${pose.bodySideBendDegrees}/${pose.bodyTwistDegrees}°`;
  const arm = (side: ModelOpenReferenceFullBodyPoseV4['leftArm']) =>
    `${side.shoulderRaiseDegrees}/${side.shoulderForwardDegrees}/${side.elbowBendDegrees}/${side.wristBendDegrees}°`;
  return pose.armMode === 'linked'
    ? `${body}, linked arms raise/forward/elbow/wrist ${arm(pose.leftArm)}`
    : `${body}, left arm ${arm(pose.leftArm)}, right arm ${arm(pose.rightArm)}`;
}

export function createModelOpenReferencePreviewSnapshotOwnerV1(
  dependencies: Partial<ModelOpenReferencePreviewBuildDependenciesV1> = {},
): ModelOpenReferenceDisplaySnapshotOwnerV1 {
  const resolved = Object.freeze({ ...DEFAULT_BUILD_DEPENDENCIES, ...dependencies });
  const diagnosticsBySourceRevision = new Map<
    string,
    { limbRuntimeMessage: string | null; poseRuntimeMessage: string | null }
  >();
  const diagnostics = (sourceRevision: string) => {
    const existing = diagnosticsBySourceRevision.get(sourceRevision);
    if (existing) return existing;
    const created = { limbRuntimeMessage: null, poseRuntimeMessage: null };
    diagnosticsBySourceRevision.set(sourceRevision, created);
    return created;
  };
  const reasonMessage = (reason: unknown, fallback: string) =>
    reason instanceof Error && reason.message ? reason.message : fallback;
  const owner = createMeasurementOpenReferenceDisplaySnapshotOwnerV1({
    loadBasis: resolved.loadBasis,
    createUniformHeightDisplay: resolved.createUniformHeightDisplay,
    createWaistHipRuntime: resolved.buildProxyRuntime,
    createLimbRuntime: async ({ basis, measurements, waistHipRuntime }) => {
      const sourceRevision = waistHipRuntime.openReference.sourceRevision;
      try {
        const runtimeModule = await resolved.loadLimbRuntime();
        const runtime = await resolved.buildLimbDisplay({
          runtimeModule,
          basis,
          measurements,
          waistHipRuntime,
        });
        if (runtime.status === 'error') {
          diagnostics(sourceRevision).limbRuntimeMessage =
            runtime.diagnostics.find(({ code }) => code === 'runtime-unavailable')?.message ??
            runtime.diagnostics[0]?.message ??
            null;
        }
        return runtime;
      } catch (reason: unknown) {
        diagnostics(sourceRevision).limbRuntimeMessage = reasonMessage(
          reason,
          'Limb proxy runtime unavailable.',
        );
        throw reason;
      }
    },
    createPoseRuntime: async ({ basis, measurements, proxyRuntime, presetId }) => {
      const sourceRevision = proxyRuntime.openReference.sourceRevision;
      try {
        const runtimeModule = await resolved.loadPoseRuntime();
        return await resolved.buildPoseDisplay({
          runtimeModule,
          basis,
          measurements,
          proxyRuntime,
          presetId,
        });
      } catch (reason: unknown) {
        diagnostics(sourceRevision).poseRuntimeMessage = reasonMessage(
          reason,
          'Display pose runtime unavailable.',
        );
        throw reason;
      }
    },
  });
  return Object.freeze({
    build: async (request: MeasurementOpenReferenceDisplaySnapshotRequestV1) => {
      const expectedSourceRevision = measurementOpenReferenceDisplaySnapshotSourceRevisionV1({
        inputFingerprint: request.inputFingerprint,
        basisKind: request.basisKind,
        posePresetId: request.posePresetId,
        limbSubsetRequested:
          request.posePresetId === 'a-rest' &&
          modelOpenReferencePreviewRequestedLimbKeysV1(request.measurements).length > 0,
      });
      diagnosticsBySourceRevision.delete(expectedSourceRevision);
      const result = await owner.build(request);
      if (result.status !== 'committed') return result;
      const captured = diagnosticsBySourceRevision.get(result.snapshot.binding.sourceRevision);
      diagnosticsBySourceRevision.delete(result.snapshot.binding.sourceRevision);
      return Object.freeze({
        ...result,
        runtimeDiagnostics: Object.freeze({
          limbRuntimeMessage: captured?.limbRuntimeMessage ?? null,
          poseRuntimeMessage: captured?.poseRuntimeMessage ?? null,
        }),
      });
    },
    invalidate: () => {
      diagnosticsBySourceRevision.clear();
      owner.invalidate();
    },
    current: owner.current,
    isCurrent: owner.isCurrent,
  });
}

export async function buildModelOpenReferenceProxyRuntimeV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly openReference: MeasurementOpenReferenceDisplayArtifactV1;
  readonly loadRuntimeModule?: () => Promise<ModelOpenReferenceProxyRuntimeModuleV1>;
}): Promise<MeasurementOpenReferenceUniformWaistHipRuntimeResultV1> {
  try {
    const runtimeModule = await (
      options.loadRuntimeModule ??
      (() => import('lib/cloth/body/measurement-open-reference-uniform-waist-hip-runtime-v1'))
    )();
    return await runtimeModule.createMeasurementOpenReferenceUniformWaistHipRuntimeV1({
      basis: options.basis,
      measurements: options.measurements,
      openReference: options.openReference,
    });
  } catch (reason: unknown) {
    return failedProxyRuntime(options.openReference, reason);
  }
}

/** Lazy beta visual-shape boundary; failure retains the already admitted height/waist/hip mesh. */
export async function buildModelOpenReferenceBetaShapeRuntimeV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly signal?: AbortSignal;
}): Promise<MeasurementOpenReferenceBetaShapeRuntimeResultV1 | null> {
  const runtimeModule = await import(
    'lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1'
  );
  try {
    return await runtimeModule.createMeasurementOpenReferenceBetaShapeRuntimeV1(options);
  } catch (reason: unknown) {
    if (reason instanceof runtimeModule.MeasurementOpenReferenceBetaShapeSafetyErrorV1) {
      throw reason;
    }
    if (reason instanceof Error && reason.name === 'AbortError') throw reason;
    return null;
  }
}

/** Separate await boundary so stale optional limb solves cannot commit after input or unmount. */
export async function buildModelOpenReferenceLimbDisplayV1(options: {
  readonly runtimeModule: MeasurementOpenReferenceLimbSubsetRuntimeModuleV1;
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly waistHipRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
}): Promise<MeasurementOpenReferenceLimbSubsetRuntimeResultV1> {
  return options.runtimeModule.createMeasurementOpenReferenceLimbSubsetRuntimeV1({
    basis: options.basis,
    measurements: options.measurements,
    waistHipRuntime: options.waistHipRuntime,
  });
}

/** Literal production boundary. It is reached only from BUILD PREVIEW for a non-A preset. */
export function loadModelOpenReferencePoseRuntimeV1(): Promise<ModelOpenReferencePoseRuntimeModuleV1> {
  return import('lib/cloth/body/measurement-open-reference-display-pose-runtime-v1');
}

/** Separate await boundary so a stale pose solve cannot commit after input, pose, or unmount. */
export async function buildModelOpenReferencePoseDisplayV1(options: {
  readonly runtimeModule: ModelOpenReferencePoseRuntimeModuleV1;
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly presetId: Exclude<MeasurementOpenReferenceDisplayPosePresetIdV1, 'a-rest'>;
}): Promise<MeasurementOpenReferenceDisplayPoseRuntimeResultV1> {
  return options.runtimeModule.createMeasurementOpenReferenceDisplayPoseRuntimeV1({
    basis: options.basis,
    measurements: options.measurements,
    proxyRuntime: options.proxyRuntime,
    presetId: options.presetId,
  });
}

export function modelOpenReferencePreviewLimbOutcomeFromSnapshotV1(
  snapshot: MeasurementOpenReferenceDisplaySnapshotV1,
  diagnostics: ModelOpenReferencePreviewRuntimeDiagnosticsV1,
): PreviewLimbOutcomeV1 {
  const status = snapshot.limbs.status;
  return modelOpenReferencePreviewLimbOutcomeV1({
    posePresetId: snapshot.pose.requestedPresetId,
    requestedKeys: snapshot.limbs.requestedGeometricProxies,
    completed: true,
    runtime:
      status === 'represented' ||
      status === 'partial' ||
      status === 'unrepresented' ||
      status === 'error'
        ? {
            status,
            diagnostics: [],
            representedGeometricProxies: snapshot.limbs.representedGeometricProxies,
          }
        : null,
    error:
      status === 'runtime-fallback' || status === 'error'
        ? diagnostics.limbRuntimeMessage ?? 'Limb proxy runtime unavailable.'
        : null,
  });
}

export function modelOpenReferencePreviewPoseOutcomeFromSnapshotV1(
  snapshot: MeasurementOpenReferenceDisplaySnapshotV1,
  diagnostics: ModelOpenReferencePreviewRuntimeDiagnosticsV1,
): PreviewPoseOutcomeV1 {
  const { pose } = snapshot;
  if (pose.status === 'posed') {
    return Object.freeze({
      ...pose,
      message: `${measurementOpenReferenceDisplayPosePresetV1(pose.resolvedPresetId).label} applied to the shaped display mesh.`,
    });
  }
  if (pose.status === 'fallback') {
    return Object.freeze({
      ...pose,
      message: `${diagnostics.poseRuntimeMessage ?? 'Display pose runtime unavailable.'} A-rest shaped mesh retained.`,
    });
  }
  return Object.freeze({
    ...pose,
    message: 'A-rest uses the shaped display mesh without loading pose assets.',
  });
}

export function modelOpenReferencePreviewDiagnosticMessageV1(
  diagnostic: MeasurementAdapterDiagnostic,
): string {
  if (diagnostic.code === 'missing-required' && diagnostic.canonicalKey) {
    return `${measurementName(diagnostic.canonicalKey)} is required.`;
  }
  return diagnostic.message
    .replace(/\b[a-z][A-Za-z]+Mm\b/g, measurementName)
    .replace('analytical-body-v0', 'preview body model');
}

/**
 * Editable model measurements drive this visual reference only. This component deliberately has no
 * path to a collision candidate, a fit claim, or a guessed fallback body.
 */
function ModelOpenReferencePresetPreviewV1({
  buildDependencies,
  initialPosePreset = 'a-rest',
  modelId = 'model-form:create',
  modelContentRevision = 'model-form:create:unbound',
  input,
  viewPreset = 'front',
}: ModelOpenReferencePreviewFromInputProps) {
  const resolution = useMemo(() => resolveModelOpenReferencePreviewInputV1(input), [input]);
  const requestedLimbKeys = useMemo(
    () =>
      resolution.ok ? modelOpenReferencePreviewRequestedLimbKeysV1(resolution.measurements) : [],
    [resolution],
  );
  const fingerprint = useMemo(() => modelOpenReferencePreviewFingerprintV1(input), [input]);
  const [posePresetId, setPosePresetId] =
    useState<MeasurementOpenReferenceDisplayPosePresetIdV1>(initialPosePreset);
  const posePreset = measurementOpenReferenceDisplayPosePresetV1(posePresetId);
  const previewBuildFingerprint = useMemo(
    () => modelOpenReferencePreviewBuildFingerprintV1(fingerprint, posePresetId),
    [fingerprint, posePresetId],
  );
  const buildFingerprint = useMemo(
    () => JSON.stringify([modelId, modelContentRevision, previewBuildFingerprint]),
    [modelContentRevision, modelId, previewBuildFingerprint],
  );
  const currentBinding = useMemo<ModelOpenReferencePreviewCurrentBindingV1 | null>(() => {
    if (!resolution.ok) return null;
    return Object.freeze({
      modelId,
      modelContentRevision,
      inputFingerprint: fingerprint,
      basisKind: resolution.basis.basisKind,
      posePresetId,
      sourceRevision: modelOpenReferencePreviewSourceRevisionV1(
        fingerprint,
        resolution.basis.basisKind,
        posePresetId,
        posePresetId === 'a-rest' && requestedLimbKeys.length > 0,
      ),
    });
  }, [
    fingerprint,
    modelContentRevision,
    modelId,
    posePresetId,
    requestedLimbKeys.length,
    resolution,
  ]);
  const currentBindingRef = useRef<ModelOpenReferencePreviewCurrentBindingV1 | null>(
    currentBinding,
  );
  currentBindingRef.current = currentBinding;
  const resolvedBuildDependencies = useMemo(
    () => Object.freeze({ ...DEFAULT_BUILD_DEPENDENCIES, ...buildDependencies }),
    [buildDependencies],
  );
  const snapshotOwner = useMemo(
    () => createModelOpenReferencePreviewSnapshotOwnerV1(resolvedBuildDependencies),
    [resolvedBuildDependencies],
  );
  const [built, setBuilt] = useState<BuiltPreview | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [error, setError] = useState('');
  const generationRef = useRef(0);
  const buildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cancelBuild = useCallback(() => {
    generationRef.current += 1;
    snapshotOwner.invalidate();
    if (buildTimerRef.current !== null) clearTimeout(buildTimerRef.current);
    buildTimerRef.current = null;
  }, [snapshotOwner]);

  useEffect(() => {
    cancelBuild();
    setBuilt(null);
    setStatus('idle');
    setError('');
  }, [buildFingerprint, cancelBuild]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelBuild();
    };
  }, [cancelBuild]);

  const buildPreview = () => {
    if (!resolution.ok || currentBinding === null) return;
    cancelBuild();
    const generation = generationRef.current;
    const requestedMeasurements = resolution.measurements;
    const requestedBuildFingerprint = buildFingerprint;
    const requestedPosePresetId = posePresetId;
    const requestedBinding = currentBinding;
    setBuilt(null);
    setStatus('building');
    setError('');

    // Yield once so the BUILDING receipt paints before the CPU-bound analytical support surface.
    buildTimerRef.current = resolvedBuildDependencies.scheduleBuild(() => {
      buildTimerRef.current = null;
      void (async () => {
        try {
          const result = await snapshotOwner.build({
            modelId: requestedBinding.modelId,
            modelContentRevision: requestedBinding.modelContentRevision,
            inputFingerprint: requestedBinding.inputFingerprint,
            basisKind: requestedBinding.basisKind,
            measurements: requestedMeasurements,
            posePresetId: requestedPosePresetId,
          });
          if (
            !mountedRef.current ||
            generationRef.current !== generation ||
            result.status === 'stale'
          )
            return;
          if (result.status === 'blocked') {
            setStatus('error');
            setError(result.message);
            return;
          }
          const snapshot = result.snapshot;
          if (
            !modelOpenReferencePreviewSnapshotCommitAllowedV1({
              requestedGeneration: generation,
              currentGeneration: generationRef.current,
              mounted: mountedRef.current,
              owner: snapshotOwner,
              binding: snapshot.binding,
              currentBinding: currentBindingRef.current,
            })
          ) {
            return;
          }
          const artifact = createMeasurementWatertightSurfaceV1({
            measurements: requestedMeasurements,
            sourceRevision: snapshot.binding.sourceRevision,
            pose: 'A',
          });
          const frame = createMeasurementBodyFrameV2({
            measurements: requestedMeasurements,
            sourceRevision: snapshot.binding.sourceRevision,
            pose: 'A',
          });
          if (
            !modelOpenReferencePreviewSnapshotCommitAllowedV1({
              requestedGeneration: generation,
              currentGeneration: generationRef.current,
              mounted: mountedRef.current,
              owner: snapshotOwner,
              binding: snapshot.binding,
              currentBinding: currentBindingRef.current,
            })
          ) {
            return;
          }
          setBuilt({
            artifact,
            frame,
            snapshot,
            limbOutcome: modelOpenReferencePreviewLimbOutcomeFromSnapshotV1(
              snapshot,
              result.runtimeDiagnostics,
            ),
            rendererDisplayMesh: snapshotMeasurementSurfaceMeshV1(snapshot.displayMesh),
            buildFingerprint: requestedBuildFingerprint,
            poseOutcome: modelOpenReferencePreviewPoseOutcomeFromSnapshotV1(
              snapshot,
              result.runtimeDiagnostics,
            ),
          });
          setStatus('initializing');
        } catch (reason: unknown) {
          if (!mountedRef.current || generationRef.current !== generation) return;
          setStatus('error');
          setError(reason instanceof Error ? reason.message : 'Preview build failed.');
        }
      })();
    });
  };

  const basisDiagnostics = resolution.basis.diagnostics;
  const currentBuilt = built?.buildFingerprint === buildFingerprint ? built : null;
  const coverage = modelOpenReferencePreviewCoverageV1(
    currentBuilt ? { status: 'uniform-height' } : null,
    currentBuilt
      ? {
          status: currentBuilt.snapshot.waistHip.status,
          representedGeometricProxies: currentBuilt.snapshot.waistHip.representedGeometricProxies,
        }
      : null,
  );
  const limbOutcome =
    currentBuilt?.limbOutcome ??
    modelOpenReferencePreviewLimbOutcomeV1({
      posePresetId,
      requestedKeys: requestedLimbKeys,
      completed: false,
    });

  return (
    <div className='flex flex-col gap-stack' data-testid='model-open-reference-preview'>
      <CalloutBox tone='note'>
        <Text component='p' size='micro'>
          <b>visual reference only</b> · {coverage.message}
        </Text>
        <Text component='p' size='micro' className='mt-1'>
          It is not proof of garment fit and is never used as collision authority.
        </Text>
        <Text component='p' size='micro' className='mt-1 font-mono'>
          fitClaimEligible=false · runtimeCollisionEligible=false · collisionCandidateEligible=false
        </Text>
      </CalloutBox>

      {!resolution.ok ? (
        <CalloutBox tone='warning'>
          <Text component='p' size='micro'>
            <b>preview blocked</b> · enter a plausible value for every required mannequin
            measurement.
          </Text>
          <ul className='mt-1 grid gap-0.5 md:grid-cols-2'>
            {resolution.diagnostics.map((diagnostic, index) => (
              <li
                key={diagnosticKey(diagnostic.code, diagnostic.canonicalKey, index)}
                className='text-micro'
              >
                ! {modelOpenReferencePreviewDiagnosticMessageV1(diagnostic)}
              </li>
            ))}
          </ul>
        </CalloutBox>
      ) : (
        <>
          <fieldset className='flex flex-col gap-1' data-testid='model-open-reference-pose-control'>
            <legend className='sr-only'>Display pose preset</legend>
            <div className='flex flex-wrap items-center justify-between gap-stack'>
              <Text component='p' size='micro' variant='label'>
                display pose
              </Text>
              <ChipRow>
                {MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_PRESETS_V1.map((preset) => (
                  <Chip
                    key={preset.id}
                    selected={posePresetId === preset.id}
                    pressed={posePresetId === preset.id}
                    onClick={() => setPosePresetId(preset.id)}
                    aria-label={`Select ${preset.label} display pose`}
                    title={preset.description}
                    data-pose-preset={preset.id}
                  >
                    {preset.shortLabel}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <Text component='p' size='micro' variant='label'>
              {posePreset.description} Changing pose clears the built preview.
            </Text>
          </fieldset>

          <div className='flex flex-wrap items-center justify-between gap-stack'>
            <div className='flex flex-wrap items-center gap-2'>
              <Pill tone='ink'>basis {resolution.basis.basisKind}</Pill>
              <Pill tone='mut'>pose {posePreset.shortLabel}</Pill>
              <Pill tone={coverage.status === 'fallback-uniform' ? 'warn' : 'attention'}>
                {coverage.label}
              </Pill>
              <Pill
                tone={
                  coverage.proxyStatus === 'represented'
                    ? 'ok'
                    : coverage.proxyStatus === 'pending'
                      ? 'mut'
                      : coverage.proxyStatus === 'partial'
                        ? 'attention'
                        : 'warn'
                }
              >
                {coverage.proxyLabel}
              </Pill>
              <Pill tone={limbOutcomeTone(limbOutcome.status)}>{limbOutcome.label}</Pill>
              <Pill
                tone={
                  currentBuilt?.poseOutcome.status === 'posed'
                    ? 'ok'
                    : currentBuilt?.poseOutcome.status === 'fallback'
                      ? 'warn'
                      : 'mut'
                }
              >
                pose {currentBuilt?.poseOutcome.status ?? 'pending'}
              </Pill>
              <Pill tone={statusTone(status)}>{status}</Pill>
            </div>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='cursor-pointer'
              disabled={status === 'building' || status === 'initializing'}
              onClick={buildPreview}
            >
              {currentBuilt ? 'rebuild preview' : 'build preview'}
            </Button>
          </div>

          {basisDiagnostics.map((diagnostic) => (
            <Text
              key={diagnostic.code}
              component='p'
              size='micro'
              variant='label'
              className='leading-tight'
            >
              {diagnostic.message}
            </Text>
          ))}

          {coverage.warning && (
            <CalloutBox tone='warning'>
              <Text component='p' size='micro'>
                <b>proxy boundary</b> · {coverage.warning}
              </Text>
            </CalloutBox>
          )}

          {limbOutcome.warning && (
            <CalloutBox tone='warning'>
              <Text component='p' size='micro'>
                <b>limb proxy boundary</b> · {limbOutcome.warning}
              </Text>
            </CalloutBox>
          )}

          <Text
            component='p'
            size='micro'
            className='sr-only'
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-testid='model-open-reference-proxy-outcome'
          >
            {coverage.proxyLabel}. {coverage.warning ?? coverage.message}
          </Text>

          <Text
            component='p'
            size='micro'
            className='sr-only'
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-testid='model-open-reference-limb-outcome'
          >
            {limbOutcome.label}. {limbOutcome.warning ?? limbOutcome.message}
          </Text>

          <Text
            component='p'
            size='micro'
            variant={currentBuilt?.poseOutcome.status === 'fallback' ? 'errorLabel' : 'label'}
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-testid='model-open-reference-pose-outcome'
          >
            {currentBuilt
              ? `Display pose ${measurementOpenReferenceDisplayPosePresetV1(currentBuilt.poseOutcome.resolvedPresetId).label}: ${currentBuilt.poseOutcome.message}`
              : `Display pose ${posePreset.label} selected. Build preview to apply it.`}
          </Text>

          <Text
            component='p'
            size='micro'
            variant={status === 'error' ? 'errorLabel' : 'label'}
            role={status === 'error' ? 'alert' : 'status'}
            aria-live={status === 'error' ? 'assertive' : 'polite'}
            aria-atomic='true'
            data-testid='model-open-reference-preview-status'
          >
            {status === 'idle' && 'Preview not built. Select BUILD PREVIEW to render it.'}
            {status === 'building' && 'Building the measurement-driven preview.'}
            {status === 'initializing' && 'Preparing the interactive 3D view.'}
            {status === 'ready' && 'Preview ready. Drag to orbit and use the wheel to zoom.'}
            {status === 'error' && `Preview failed: ${error}`}
          </Text>

          {currentBuilt && (
            <Suspense fallback={<SkeletonBlocks count={1} height={320} className='w-full' />}>
              <MeasurementWatertightSurfaceV1Stage
                artifact={currentBuilt.artifact}
                frame={currentBuilt.frame}
                lod='display'
                displayMeshOverride={currentBuilt.rendererDisplayMesh}
                viewPreset={viewPreset}
                overlays={DISPLAY_OVERLAYS}
                className='h-[42vh] min-h-80 max-h-[32rem] border border-hairline'
                onStatus={(nextStatus, nextError) => {
                  setStatus(nextStatus);
                  setError(nextError ?? '');
                }}
                onRenderCount={NOOP}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}

function linkedPoseLimbOutcomeV2(
  snapshot: MeasurementOpenReferenceDisplaySnapshotV2 | null,
  selection: LinkedPoseSelectionV2,
  requestedKeys: readonly ModelOpenReferencePreviewLimbKeyV1[],
): PreviewLimbOutcomeV1 {
  const isARest = selection.lane === 'relax' && selection.degrees === 0;
  if (snapshot === null) {
    return modelOpenReferencePreviewLimbOutcomeV1({
      posePresetId: isARest ? 'a-rest' : 'near-t',
      requestedKeys,
      completed: false,
    });
  }
  if (snapshot.pose.status === 'posed') {
    return modelOpenReferencePreviewLimbOutcomeV1({
      posePresetId: 'near-t',
      requestedKeys: snapshot.limbs.requestedGeometricProxies,
      completed: true,
    });
  }
  const status = snapshot.limbs.status;
  return modelOpenReferencePreviewLimbOutcomeV1({
    posePresetId: 'a-rest',
    requestedKeys: snapshot.limbs.requestedGeometricProxies,
    completed: true,
    runtime:
      status === 'represented' ||
      status === 'partial' ||
      status === 'unrepresented' ||
      status === 'error'
        ? {
            status,
            diagnostics: [],
            representedGeometricProxies: snapshot.limbs.representedGeometricProxies,
          }
        : null,
    error:
      status === 'runtime-fallback' || status === 'error'
        ? 'Limb proxy runtime unavailable.'
        : null,
  });
}

type FullBodyPoseControlStatus = ModelOpenReferenceFullBodyPoseControlStatusV3 &
  ModelOpenReferenceFullBodyPoseControlStatusV4;

interface FullBodyJointEditorControlContextV5 {
  readonly overlay: MakeHumanFullBodyJointOverlayRuntimeResultV4 | null;
  readonly overlayStatus: 'pending' | 'ready' | 'unavailable';
  readonly overlayError: string | null;
  readonly mode: ModelOpenReferenceJointEditorModeV5;
  readonly selection: ModelOpenReferenceJointSelectionV5;
  readonly onModeChange: (mode: ModelOpenReferenceJointEditorModeV5) => void;
  readonly onSelectionChange: (selection: ModelOpenReferenceJointSelectionV5) => void;
}

type FullBodyJointSelectionV9 =
  | ModelOpenReferenceJointSelectionV5
  | ModelOpenReferenceDirectJointSelectionV9;
type FullBodyJointRingDraggingV9 =
  | ModelOpenReferenceJointRingDraggingV6
  | ModelOpenReferenceDirectJointRingDraggingV9;

interface FullBodyJointRingAdapterV6<Pose extends object> {
  readonly begin: (
    pose: Pose,
    selection: FullBodyJointSelectionV9,
    angleDegrees: number,
  ) => FullBodyJointRingDraggingV9;
  readonly move: (
    transaction: FullBodyJointRingDraggingV9,
    angleDegrees: number,
  ) => Readonly<{
    transaction: FullBodyJointRingDraggingV9;
    pose: Pose;
  }>;
  readonly finish: (transaction: FullBodyJointRingDraggingV9, outcome: 'commit' | 'cancel') => Pose;
}

interface FullBodyPoseEditorRenderProps<Pose extends object> {
  readonly draftPose: Pose;
  readonly appliedPose: Pose | null;
  readonly status: FullBodyPoseControlStatus;
  readonly onDraftChange: (pose: Pose) => void;
  readonly onApply: (pose: Pose) => void;
  readonly jointEditor: FullBodyJointEditorControlContextV5;
  readonly sessionPose?: Readonly<{
    readonly dirty: boolean;
    readonly canUndo: boolean;
    readonly onUndo: () => Pose;
    readonly onReset: () => Pose;
    readonly persistence?: ModelOpenReferenceDirectPosePersistenceV1;
  }>;
}

interface FullBodyPoseEditorAdapter<Pose extends object> {
  readonly version:
    | 'full-body-v3'
    | 'full-body-v4'
    | 'full-body-v5'
    | 'full-body-v6'
    | 'full-body-v7'
    | 'full-body-v8'
    | 'full-body-v9';
  readonly buildsJointOverlay: boolean;
  readonly jointRing: FullBodyJointRingAdapterV6<Pose> | null;
  readonly autoApplyJointRingOnCommit?: true;
  readonly autoBuildInitial?: true;
  readonly initialJointEditorMode?: ModelOpenReferenceJointEditorModeV5;
  readonly minimalViewportUi?: true;
  readonly preserveJointEditorModeAfterBuild?: true;
  readonly unifiedViewportInteraction?: true;
  readonly livePose?: true;
  readonly extendedRuntimeV4?: true;
  readonly extendedOverlayV5?: true;
  readonly extendedLiveSessionV5?: true;
  readonly armBodyPartIk?: Readonly<{
    currentArm: (pose: Pose, side: MakeHumanArmBodyPartIkSideV1) => MakeHumanCloLikeArmControlsV3;
    applyArm: (
      pose: Pose,
      side: MakeHumanArmBodyPartIkSideV1,
      arm: MakeHumanCloLikeArmControlsV3,
    ) => Pose;
  }>;
  readonly torsoAimIk?: Readonly<{
    currentTorso: (pose: Pose) => MakeHumanCloLikeTorsoControlsV3;
    applyTorso: (pose: Pose, torso: MakeHumanCloLikeTorsoControlsV3) => Pose;
  }>;
  readonly legBodyPartIk?: Readonly<{
    currentLeg: (
      pose: Pose,
      side: MakeHumanLegBodyPartIkSideV1,
    ) => MakeHumanLegBodyPartIkControlsV1;
    applyLeg: (
      pose: Pose,
      side: MakeHumanLegBodyPartIkSideV1,
      leg: MakeHumanLegBodyPartIkControlsV1,
    ) => Pose;
  }>;
  readonly headAimIk?: Readonly<{
    currentHead: (pose: Pose) => Readonly<{
      headPitchDeg: number;
      headYawDeg: number;
      headSideDeg: number;
    }>;
    applyHead: (
      pose: Pose,
      head: Readonly<{ headPitchDeg: number; headYawDeg: number; headSideDeg: number }>,
    ) => Pose;
  }>;
  readonly shoulderPosture?: Readonly<{
    current: (pose: Pose) => MakeHumanShoulderPostureControlsV4;
    apply: (pose: Pose, posture: MakeHumanShoulderPostureControlsV4) => Pose;
    linked: (pose: Pose) => boolean;
  }>;
  readonly neutralPose: Pose;
  readonly resetDraftOnBodyChange: boolean;
  readonly scopeDescription: string;
  readonly equalGeometry: (left: Pose | null, right: Pose | null) => boolean;
  readonly snapshot: (pose: Pose) => Pose;
  readonly runtimePose: (
    pose: Pose,
  ) => MakeHumanFullBodyLocalFkPoseV3 | MakeHumanFullBodyLocalFkPoseV4;
  readonly sourceRevision: (options: {
    readonly inputFingerprint: string;
    readonly basisKind: Exclude<MakeHumanOpenReferenceBasisV1['kind'], 'base'>;
    readonly pose: Pose;
  }) => string;
  readonly label: (pose: Pose) => string;
  readonly renderControl: (props: FullBodyPoseEditorRenderProps<Pose>) => ReactNode;
}

const FULL_BODY_EDITOR_V3: FullBodyPoseEditorAdapter<ModelOpenReferenceFullBodyPoseV3> =
  Object.freeze({
    version: 'full-body-v3',
    buildsJointOverlay: false,
    jointRing: null,
    neutralPose: MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V3,
    resetDraftOnBodyChange: false,
    scopeDescription: 'linked arms',
    equalGeometry: modelOpenReferenceFullBodyPoseEqualV3,
    snapshot: (pose: ModelOpenReferenceFullBodyPoseV3) => Object.freeze({ ...pose }),
    runtimePose: modelOpenReferenceFullBodyRuntimePoseV3,
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV3,
    label: modelOpenReferenceFullBodyPoseLabelV3,
    renderControl: (props: FullBodyPoseEditorRenderProps<ModelOpenReferenceFullBodyPoseV3>) => (
      <ModelOpenReferenceFullBodyPoseControlV3 {...props} />
    ),
  });

const FULL_BODY_EDITOR_V4: FullBodyPoseEditorAdapter<ModelOpenReferenceFullBodyPoseV4> =
  Object.freeze({
    version: 'full-body-v4',
    buildsJointOverlay: false,
    jointRing: null,
    neutralPose: MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    resetDraftOnBodyChange: true,
    scopeDescription: 'linked or independently editable arms',
    equalGeometry: modelOpenReferenceFullBodyPoseGeometryEqualV4,
    snapshot: snapshotModelOpenReferenceFullBodyPoseV4,
    runtimePose: modelOpenReferenceFullBodyRuntimePoseV4,
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV4,
    label: modelOpenReferenceFullBodyPoseLabelV4,
    renderControl: (props: FullBodyPoseEditorRenderProps<ModelOpenReferenceFullBodyPoseV4>) => (
      <ModelOpenReferenceFullBodyPoseControlV4 {...props} />
    ),
  });

const FULL_BODY_EDITOR_V5: FullBodyPoseEditorAdapter<ModelOpenReferenceFullBodyPoseV4> =
  Object.freeze({
    version: 'full-body-v5',
    buildsJointOverlay: true,
    jointRing: null,
    neutralPose: MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    resetDraftOnBodyChange: true,
    scopeDescription: 'linked or independently editable arms with allowlisted joint markers',
    equalGeometry: modelOpenReferenceFullBodyPoseGeometryEqualV4,
    snapshot: snapshotModelOpenReferenceFullBodyPoseV4,
    runtimePose: modelOpenReferenceFullBodyRuntimePoseV4,
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV5,
    label: modelOpenReferenceFullBodyPoseLabelV4,
    renderControl: ({
      jointEditor,
      ...props
    }: FullBodyPoseEditorRenderProps<ModelOpenReferenceFullBodyPoseV4>) => (
      <ModelOpenReferenceJointPoseControlV5 {...props} {...jointEditor} />
    ),
  });

const FULL_BODY_EDITOR_V6: FullBodyPoseEditorAdapter<ModelOpenReferenceFullBodyPoseV4> =
  Object.freeze({
    version: 'full-body-v6',
    buildsJointOverlay: true,
    jointRing: Object.freeze({
      begin: (
        pose: ModelOpenReferenceFullBodyPoseV4,
        selection: FullBodyJointSelectionV9,
        angleDegrees: number,
      ) =>
        modelOpenReferenceJointRingBeginV6({
          pose,
          selection: selection as ModelOpenReferenceJointSelectionV5,
          pointerAngleDegrees: angleDegrees,
        }),
      move: (transaction: FullBodyJointRingDraggingV9, angleDegrees: number) => {
        const next = modelOpenReferenceJointRingMoveV6(
          transaction as ModelOpenReferenceJointRingDraggingV6,
          angleDegrees,
        );
        return Object.freeze({ transaction: next, pose: next.draftPose });
      },
      finish: (transaction: FullBodyJointRingDraggingV9, outcome: 'commit' | 'cancel') =>
        modelOpenReferenceJointRingFinishV6(
          transaction as ModelOpenReferenceJointRingDraggingV6,
          outcome,
        ).pose,
    }),
    neutralPose: MODEL_OPEN_REFERENCE_FULL_BODY_NEUTRAL_POSE_V4,
    resetDraftOnBodyChange: true,
    scopeDescription:
      'linked or independently editable arms with allowlisted joint markers and a draft-only local rotation ring',
    equalGeometry: modelOpenReferenceFullBodyPoseGeometryEqualV4,
    snapshot: snapshotModelOpenReferenceFullBodyPoseV4,
    runtimePose: modelOpenReferenceFullBodyRuntimePoseV4,
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV6,
    label: modelOpenReferenceFullBodyPoseLabelV4,
    renderControl: ({
      jointEditor,
      ...props
    }: FullBodyPoseEditorRenderProps<ModelOpenReferenceFullBodyPoseV4>) => (
      <ModelOpenReferenceJointPoseControlV6 {...props} {...jointEditor} />
    ),
  });

const FULL_BODY_EDITOR_V7: FullBodyPoseEditorAdapter<ModelOpenReferenceFullBodyPoseV4> =
  Object.freeze({
    ...FULL_BODY_EDITOR_V6,
    version: 'full-body-v7',
    autoApplyJointRingOnCommit: true,
    initialJointEditorMode: 'edit-pose',
    preserveJointEditorModeAfterBuild: true,
    scopeDescription:
      'viewport-first local joint editing with one compact precision inspector and automatic rebuild after direct rotation',
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV7,
    renderControl: ({
      jointEditor,
      ...props
    }: FullBodyPoseEditorRenderProps<ModelOpenReferenceFullBodyPoseV4>) => (
      <ModelOpenReferenceJointPoseControlV7 {...props} {...jointEditor} />
    ),
  });

const FULL_BODY_EDITOR_V8: FullBodyPoseEditorAdapter<ModelOpenReferenceFullBodyPoseV4> =
  Object.freeze({
    ...FULL_BODY_EDITOR_V7,
    version: 'full-body-v8',
    autoBuildInitial: true,
    minimalViewportUi: true,
    unifiedViewportInteraction: true,
    livePose: true,
    armBodyPartIk: Object.freeze({
      currentArm: modelOpenReferenceFullBodyArmForIkV8,
      applyArm: modelOpenReferenceFullBodyApplyArmIkV8,
    }),
    torsoAimIk: Object.freeze({
      currentTorso: modelOpenReferenceFullBodyTorsoForIkV8,
      applyTorso: modelOpenReferenceFullBodyApplyTorsoIkV8,
    }),
    scopeDescription: 'direct viewport joint posing',
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV8,
    renderControl: ({
      jointEditor,
      ...props
    }: FullBodyPoseEditorRenderProps<ModelOpenReferenceFullBodyPoseV4>) => (
      <ModelOpenReferenceJointPoseControlV8 {...props} {...jointEditor} />
    ),
  });

const FULL_BODY_EDITOR_V9: FullBodyPoseEditorAdapter<ModelOpenReferenceDirectPoseV9> =
  Object.freeze({
    version: 'full-body-v9',
    buildsJointOverlay: true,
    jointRing: Object.freeze({
      begin: (
        pose: ModelOpenReferenceDirectPoseV9,
        selection: FullBodyJointSelectionV9,
        angleDegrees: number,
      ) =>
        modelOpenReferenceDirectJointRingBeginV9({
          pose,
          selection: selection as ModelOpenReferenceDirectJointSelectionV9,
          pointerAngleDegrees: angleDegrees,
        }),
      move: (transaction: FullBodyJointRingDraggingV9, angleDegrees: number) => {
        const next = modelOpenReferenceDirectJointRingMoveV9(
          transaction as ModelOpenReferenceDirectJointRingDraggingV9,
          angleDegrees,
        );
        return Object.freeze({
          transaction: next,
          pose: snapshotModelOpenReferenceDirectPoseV9(next.draftPose),
        });
      },
      finish: (transaction: FullBodyJointRingDraggingV9, outcome: 'commit' | 'cancel') =>
        snapshotModelOpenReferenceDirectPoseV9(
          modelOpenReferenceDirectJointRingFinishV9(
            transaction as ModelOpenReferenceDirectJointRingDraggingV9,
            outcome,
          ).pose,
        ),
    }),
    autoApplyJointRingOnCommit: true,
    autoBuildInitial: true,
    initialJointEditorMode: 'edit-pose',
    minimalViewportUi: true,
    preserveJointEditorModeAfterBuild: true,
    unifiedViewportInteraction: true,
    livePose: true,
    extendedRuntimeV4: true,
    extendedOverlayV5: true,
    extendedLiveSessionV5: true,
    armBodyPartIk: Object.freeze({
      currentArm: modelOpenReferenceDirectArmForIkV9,
      applyArm: modelOpenReferenceDirectApplyArmIkV9,
    }),
    torsoAimIk: Object.freeze({
      currentTorso: (pose: ModelOpenReferenceDirectPoseV9) =>
        Object.freeze({
          torsoFlexionDeg: pose.bodyFlexionDegrees,
          torsoSideBendDeg: pose.bodySideBendDegrees,
          torsoTwistDeg: pose.bodyTwistDegrees,
        }),
      applyTorso: modelOpenReferenceDirectApplyTorsoIkV9,
    }),
    legBodyPartIk: Object.freeze({
      currentLeg: modelOpenReferenceDirectLegForIkV9,
      applyLeg: modelOpenReferenceDirectApplyLegIkV9,
    }),
    headAimIk: Object.freeze({
      currentHead: (pose: ModelOpenReferenceDirectPoseV9) =>
        Object.freeze({
          headPitchDeg: pose.headPitchDeg,
          headYawDeg: pose.headYawDeg,
          headSideDeg: pose.headSideDeg,
        }),
      applyHead: modelOpenReferenceDirectApplyHeadV9,
    }),
    shoulderPosture: Object.freeze({
      current: modelOpenReferenceDirectShoulderPostureV9,
      apply: modelOpenReferenceDirectApplyShoulderPostureV9,
      linked: (pose: ModelOpenReferenceDirectPoseV9) => pose.armMode === 'linked',
    }),
    neutralPose: MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9,
    resetDraftOnBodyChange: true,
    scopeDescription: 'direct full-body viewport posing',
    equalGeometry: modelOpenReferenceDirectPoseGeometryEqualV9,
    snapshot: snapshotModelOpenReferenceDirectPoseV9,
    runtimePose: modelOpenReferenceDirectRuntimePoseV9,
    sourceRevision: modelOpenReferenceFullBodyPoseSourceRevisionV9,
    label: (pose: ModelOpenReferenceDirectPoseV9) =>
      modelOpenReferenceDirectPoseGeometryEqualV9(pose, MODEL_OPEN_REFERENCE_DIRECT_NEUTRAL_POSE_V9)
        ? 'A-rest'
        : 'custom full-body pose',
    renderControl: ({
      jointEditor,
      ...props
    }: FullBodyPoseEditorRenderProps<ModelOpenReferenceDirectPoseV9>) => (
      <ModelOpenReferenceDirectPoseControlV9
        {...props}
        overlayStatus={jointEditor.overlayStatus}
        overlayError={jointEditor.overlayError}
      />
    ),
  });

function ModelOpenReferenceFullBodyPreviewEditor<Pose extends object>({
  activeMeasurementName,
  buildDependencies,
  directPoseBindingV9,
  directPoseViewportEditingEnabledV9 = true,
  hideDirectPoseControlV9 = false,
  modelId = 'model-form:create',
  modelContentRevision = 'model-form:create:unbound',
  input,
  editor,
  patternPieceOverlay,
  variant = 'form',
  viewPreset = 'front',
}: ModelOpenReferencePreviewFromInputProps & {
  readonly editor: FullBodyPoseEditorAdapter<Pose>;
}) {
  const resolution = useMemo(() => resolveModelOpenReferencePreviewInputV1(input), [input]);
  const inputFingerprint = useMemo(() => modelOpenReferencePreviewFingerprintV1(input), [input]);
  const bodyBuildFingerprint = useMemo(
    () =>
      resolution.ok
        ? JSON.stringify([
            `model-open-reference-${editor.version}-preview`,
            modelId,
            modelContentRevision,
            inputFingerprint,
            resolution.basis.basisKind,
          ])
        : JSON.stringify([
            `model-open-reference-${editor.version}-preview`,
            modelId,
            modelContentRevision,
            inputFingerprint,
            null,
          ]),
    [editor.version, inputFingerprint, modelContentRevision, modelId, resolution],
  );
  const resolvedBuildDependencies = useMemo(
    () => Object.freeze({ ...DEFAULT_BUILD_DEPENDENCIES, ...buildDependencies }),
    [buildDependencies],
  );
  const controlledDirectPose =
    editor.version === 'full-body-v9' && directPoseBindingV9
      ? (directPoseBindingV9.document.pose as Pose)
      : null;
  const directPoseViewportEditingEnabled =
    editor.version !== 'full-body-v9' || directPoseViewportEditingEnabledV9;
  const directPoseControlHidden = editor.version === 'full-body-v9' && hideDirectPoseControlV9;
  const workbench = variant === 'workbench';
  const [uncontrolledDraftPose, setUncontrolledDraftPose] = useState<Pose>(editor.neutralPose);
  const draftPose = controlledDirectPose ?? uncontrolledDraftPose;
  const [appliedPose, setAppliedPose] = useState<Pose | null>(null);
  const [built, setBuilt] = useState<FullBodyBuiltPreviewV3 | null>(null);
  const [livePoseFrame, setLivePoseFrame] = useState<ModelOpenReferenceLivePoseFrameV10 | null>(
    null,
  );
  const [jointEditorMode, setJointEditorMode] = useState<ModelOpenReferenceJointEditorModeV5>(
    editor.initialJointEditorMode ?? 'camera',
  );
  const [jointSelection, setJointSelection] = useState<FullBodyJointSelectionV9>(() =>
    modelOpenReferenceJointSelectionV5('torso-group'),
  );
  const [directSelectedGroupId, setDirectSelectedGroupId] = useState('torso-group');
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'building' | 'error'>('idle');
  const [stageStatus, setStageStatus] = useState<'idle' | MeasurementSurfaceStageStatus>('idle');
  const [updateError, setUpdateError] = useState('');
  const [stageError, setStageError] = useState('');
  const [poseAdmissibility, setPoseAdmissibility] = useState<{
    readonly status: 'idle' | 'admitted' | 'blocked';
    readonly blockers: readonly MakeHumanLivePoseBlockerV1[];
  }>(() => Object.freeze({ status: 'idle', blockers: Object.freeze([]) }));
  const generationRef = useRef(0);
  const buildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const jointRingTransactionRef = useRef<{
    readonly revision: string;
    readonly gizmoGroup:
      | MakeHumanFullBodyJointOverlayGroupV4
      | MakeHumanFullBodyJointOverlayGroupV5;
    readonly originalPose: Pose;
    transaction: FullBodyJointRingDraggingV9;
    lastAdmittedPose: Pose;
  } | null>(null);
  const currentJointRingRevisionRef = useRef<string | null>(null);
  const armIkTransactionRef = useRef<{
    readonly revision: string;
    readonly side: MakeHumanArmBodyPartIkSideV1;
    readonly originalPose: Pose;
    readonly currentArm: MakeHumanCloLikeArmControlsV3;
    lastPose: Pose;
  } | null>(null);
  const torsoIkTransactionRef = useRef<{
    readonly revision: string;
    readonly originalPose: Pose;
    readonly currentTorso: MakeHumanCloLikeTorsoControlsV3;
    lastPose: Pose;
  } | null>(null);
  const legIkTransactionRef = useRef<{
    readonly revision: string;
    readonly side: MakeHumanLegBodyPartIkSideV1;
    readonly originalPose: Pose;
    readonly currentLeg: MakeHumanLegBodyPartIkControlsV1;
    lastPose: Pose;
  } | null>(null);
  const headIkTransactionRef = useRef<{
    readonly revision: string;
    readonly originalPose: Pose;
    readonly currentHead: Readonly<{
      headPitchDeg: number;
      headYawDeg: number;
      headSideDeg: number;
    }>;
    lastPose: Pose;
  } | null>(null);
  const shoulderPostureTransactionRef = useRef<{
    readonly revision: string;
    readonly side: MakeHumanArmBodyPartIkSideV1;
    readonly linked: boolean;
    readonly originalPose: Pose;
    readonly sourceM: readonly [number, number, number];
    readonly current: MakeHumanShoulderPostureControlsV4;
    lastPose: Pose;
  } | null>(null);
  const autoBuildAttemptRef = useRef<string | null>(null);
  const bodyOwnerRef = useRef(`${editor.version}:${modelId}:${modelContentRevision}`);
  const retainedBodyForMeasurementDebounceRef = useRef(false);
  const builtRef = useRef(built);
  const controlledGestureActiveRef = useRef(false);
  const directPoseBindingRef = useRef(directPoseBindingV9);
  const draftPoseRef = useRef(draftPose);
  directPoseBindingRef.current = directPoseBindingV9;
  draftPoseRef.current = draftPose;
  builtRef.current = built;

  const updateUncontrolledDraft = (pose: Pose) => {
    if (!(directPoseBindingRef.current && editor.version === 'full-body-v9')) {
      setUncontrolledDraftPose(pose);
    }
  };

  const publishGestureUpdate = (pose: Pose) => {
    const binding = directPoseBindingRef.current;
    if (binding && editor.version === 'full-body-v9') {
      if (controlledGestureActiveRef.current) {
        binding.onUpdateGesture(pose as ModelOpenReferenceDirectPoseV9);
      }
      return;
    }
    setUncontrolledDraftPose(pose);
  };

  const finishControlledGesture = (outcome: 'commit' | 'cancel', pose: Pose) => {
    const binding = directPoseBindingRef.current;
    if (!binding || editor.version !== 'full-body-v9' || !controlledGestureActiveRef.current) {
      updateUncontrolledDraft(pose);
      return;
    }
    controlledGestureActiveRef.current = false;
    binding.onFinishGesture(outcome, pose as ModelOpenReferenceDirectPoseV9);
  };

  const cancelBuild = useCallback(() => {
    generationRef.current += 1;
    buildAbortRef.current?.abort();
    buildAbortRef.current = null;
    if (buildTimerRef.current !== null) clearTimeout(buildTimerRef.current);
    buildTimerRef.current = null;
  }, []);

  useEffect(() => {
    const bodyOwner = `${editor.version}:${modelId}:${modelContentRevision}`;
    const retainLastValidBody =
      editor.version === 'full-body-v9' && bodyOwnerRef.current === bodyOwner;
    retainedBodyForMeasurementDebounceRef.current =
      retainLastValidBody && builtRef.current !== null;
    bodyOwnerRef.current = bodyOwner;
    autoBuildAttemptRef.current = null;
    cancelBuild();
    if (controlledGestureActiveRef.current) {
      controlledGestureActiveRef.current = false;
      directPoseBindingRef.current?.onFinishGesture(
        'cancel',
        draftPoseRef.current as ModelOpenReferenceDirectPoseV9,
      );
    }
    jointRingTransactionRef.current = null;
    armIkTransactionRef.current = null;
    torsoIkTransactionRef.current = null;
    legIkTransactionRef.current = null;
    headIkTransactionRef.current = null;
    shoulderPostureTransactionRef.current = null;
    currentJointRingRevisionRef.current = null;
    if (
      editor.resetDraftOnBodyChange &&
      !(editor.version === 'full-body-v9' && directPoseBindingRef.current)
    ) {
      setUncontrolledDraftPose(editor.neutralPose);
    }
    if (!retainLastValidBody) setBuilt(null);
    setLivePoseFrame(null);
    if (!retainLastValidBody) setAppliedPose(null);
    setUpdateStatus('idle');
    if (!retainLastValidBody) setStageStatus('idle');
    setUpdateError('');
    setStageError('');
    setPoseAdmissibility(Object.freeze({ status: 'idle', blockers: Object.freeze([]) }));
    setJointEditorMode(editor.initialJointEditorMode ?? 'camera');
    setJointSelection(modelOpenReferenceJointSelectionV5('torso-group'));
    setDirectSelectedGroupId('torso-group');
  }, [bodyBuildFingerprint, cancelBuild, editor, modelContentRevision, modelId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (controlledGestureActiveRef.current) {
        controlledGestureActiveRef.current = false;
        directPoseBindingRef.current?.onFinishGesture(
          'cancel',
          draftPoseRef.current as ModelOpenReferenceDirectPoseV9,
        );
      }
      // React StrictMode replays effects in development. Let the replay schedule the initial build
      // after this cleanup cancels the first attempt.
      autoBuildAttemptRef.current = null;
      jointRingTransactionRef.current = null;
      armIkTransactionRef.current = null;
      torsoIkTransactionRef.current = null;
      legIkTransactionRef.current = null;
      headIkTransactionRef.current = null;
      shoulderPostureTransactionRef.current = null;
      currentJointRingRevisionRef.current = null;
      cancelBuild();
    };
  }, [cancelBuild]);

  const buildFullBodyPreview = useCallback(
    (pose: Pose, intent: 'immediate' | 'measurement-change' = 'immediate') => {
      if (!resolution.ok) return;
      const activeJointRing = jointRingTransactionRef.current;
      const poseForBuild =
        activeJointRing && editor.jointRing
          ? editor.jointRing.finish(activeJointRing.transaction, 'commit')
          : pose;
      jointRingTransactionRef.current = null;
      armIkTransactionRef.current = null;
      torsoIkTransactionRef.current = null;
      legIkTransactionRef.current = null;
      headIkTransactionRef.current = null;
      shoulderPostureTransactionRef.current = null;
      const requestedPose = editor.snapshot(poseForBuild);
      updateUncontrolledDraft(requestedPose);
      const runtimePose = editor.runtimePose(requestedPose);
      const requestedMeasurements = resolution.measurements;
      const requestedRawMeasurements = input.measurements;
      const requestedBasisKind = resolution.basis.basisKind;
      const requestedBodyBuildFingerprint = bodyBuildFingerprint;
      const sourceRevision = editor.sourceRevision({
        inputFingerprint,
        basisKind: requestedBasisKind,
        pose: requestedPose,
      });
      const buildDelayMs = modelOpenReferenceFullBodyBuildDelayV12({
        intent,
        retainsLastValidBody: retainedBodyForMeasurementDebounceRef.current,
      });
      cancelBuild();
      const buildAbortController = new AbortController();
      buildAbortRef.current = buildAbortController;
      const requestedGeneration = generationRef.current;
      setUpdateStatus('building');
      setUpdateError('');

      buildTimerRef.current = resolvedBuildDependencies.scheduleBuild(() => {
        buildTimerRef.current = null;
        if (
          !mountedRef.current ||
          generationRef.current !== requestedGeneration ||
          buildAbortController.signal.aborted
        ) {
          return;
        }
        void (async () => {
          const stale = () =>
            !mountedRef.current ||
            generationRef.current !== requestedGeneration ||
            buildAbortController.signal.aborted;
          try {
            const basis = await resolvedBuildDependencies.loadBasis(requestedBasisKind);
            if (stale()) return;
            const frame = createMeasurementBodyFrameV2({
              measurements: requestedMeasurements,
              sourceRevision,
              pose: 'A',
            });
            const openReference = resolvedBuildDependencies.createUniformHeightDisplay({
              basis,
              frame,
            });
            const proxyRuntime = await resolvedBuildDependencies.buildProxyRuntime({
              basis,
              measurements: requestedMeasurements,
              openReference,
            });
            if (stale()) return;
            const betaShapeRuntime =
              editor.version === 'full-body-v9'
                ? await resolvedBuildDependencies.buildBetaShapeRuntime({
                    basis,
                    measurements: requestedMeasurements,
                    waistHipRuntime: proxyRuntime,
                    signal: buildAbortController.signal,
                  })
                : null;
            if (stale()) return;
            const fkProxyRuntime = betaShapeRuntime?.fkProxyRuntime ?? proxyRuntime;
            const shapedSourceRevision = betaShapeRuntime
              ? `${sourceRevision};${betaShapeRuntime.sourceRevisionSuffix}`
              : sourceRevision;
            const runtimePromise = editor.extendedRuntimeV4
              ? resolvedBuildDependencies.buildFullBodyLocalFkDisplayV4({
                  basis,
                  measurements: requestedMeasurements,
                  proxyRuntime: fkProxyRuntime,
                  input: runtimePose,
                  sourceRevision: shapedSourceRevision,
                })
              : resolvedBuildDependencies.buildFullBodyLocalFkDisplay({
                  basis,
                  measurements: requestedMeasurements,
                  proxyRuntime: fkProxyRuntime,
                  input: runtimePose as MakeHumanFullBodyLocalFkPoseV3,
                  sourceRevision: shapedSourceRevision,
                });
            const liveSessionPromise = editor.livePose
              ? editor.extendedLiveSessionV5
                ? resolvedBuildDependencies.buildFullBodyLiveFkSessionV5({
                    basis,
                    measurements: requestedMeasurements,
                    proxyRuntime: fkProxyRuntime,
                    sourceRevision: shapedSourceRevision,
                  })
                : resolvedBuildDependencies.buildFullBodyLiveFkSession({
                    basis,
                    measurements: requestedMeasurements,
                    proxyRuntime: fkProxyRuntime,
                    sourceRevision: shapedSourceRevision,
                  })
              : Promise.resolve(null);
            const [runtime, liveFkSession] = await Promise.all([
              runtimePromise,
              liveSessionPromise,
            ]);
            if (stale()) return;
            const finalFrame = createMeasurementBodyFrameV2({
              measurements: requestedMeasurements,
              sourceRevision: runtime.sourceRevision,
              pose: 'A',
            });
            const artifact = createMeasurementWatertightSurfaceV1({
              measurements: requestedMeasurements,
              sourceRevision: runtime.sourceRevision,
              pose: 'A',
            });
            const bodyBuilt: FullBodyBuiltPreviewV3 = {
              artifact,
              frame: finalFrame,
              runtime,
              measurementGuideSourceMesh: snapshotMeasurementSurfaceMeshV1(
                fkProxyRuntime.displayMesh,
              ),
              waistHipStatus: proxyRuntime.status,
              representedWaistHipProxies: Object.freeze([
                ...proxyRuntime.representedGeometricProxies,
              ]),
              jointOverlay: null,
              jointOverlayError: null,
              liveFkSession,
              measurementApplication: betaShapeRuntime
                ? modelOpenReferenceMeasurementApplicationV1({
                    measurements: requestedMeasurements,
                    rawMeasurements: requestedRawMeasurements,
                    beta: betaShapeRuntime,
                  })
                : null,
              bodyBuildFingerprint: requestedBodyBuildFingerprint,
            };
            if (editor.buildsJointOverlay && !editor.preserveJointEditorModeAfterBuild) {
              setJointEditorMode('camera');
            }
            setBuilt(bodyBuilt);
            setLivePoseFrame(null);
            setAppliedPose(requestedPose);
            setStageStatus('initializing');
            setStageError('');
            setUpdateStatus('idle');
            setUpdateError('');

            if (editor.buildsJointOverlay) {
              try {
                const jointOverlay = editor.extendedOverlayV5
                  ? await resolvedBuildDependencies.buildFullBodyJointOverlayV5({
                      basis,
                      measurements: requestedMeasurements,
                      proxyRuntime: fkProxyRuntime,
                      input: runtimePose,
                      sourceRevision: runtime.sourceRevision,
                    })
                  : await resolvedBuildDependencies.buildFullBodyJointOverlay({
                      basis,
                      measurements: requestedMeasurements,
                      proxyRuntime: fkProxyRuntime,
                      input: runtimePose as MakeHumanFullBodyLocalFkPoseV3,
                      sourceRevision: runtime.sourceRevision,
                    });
                if (stale()) return;
                setBuilt((current) =>
                  modelOpenReferenceFullBodyJointOverlayNextBuiltV5(
                    current,
                    requestedBodyBuildFingerprint,
                    runtime.sourceRevision,
                    { jointOverlay, jointOverlayError: null },
                  ),
                );
                if (
                  jointOverlay.status === 'unavailable' ||
                  jointOverlay.binding.bodySourceRevision !== runtime.sourceRevision
                ) {
                  setJointEditorMode('camera');
                }
              } catch (reason: unknown) {
                if (stale()) return;
                setBuilt((current) =>
                  modelOpenReferenceFullBodyJointOverlayNextBuiltV5(
                    current,
                    requestedBodyBuildFingerprint,
                    runtime.sourceRevision,
                    {
                      jointOverlay: null,
                      jointOverlayError:
                        reason instanceof Error
                          ? reason.message
                          : 'Joint controls are unavailable.',
                    },
                  ),
                );
                setJointEditorMode('camera');
              }
            }
          } catch (reason: unknown) {
            if (stale()) return;
            setUpdateStatus('error');
            setUpdateError(reason instanceof Error ? reason.message : 'Full-body preview failed.');
          } finally {
            if (buildAbortRef.current === buildAbortController) buildAbortRef.current = null;
          }
        })();
      }, buildDelayMs);
    },
    [
      bodyBuildFingerprint,
      cancelBuild,
      editor,
      inputFingerprint,
      input.measurements,
      resolution,
      resolvedBuildDependencies,
    ],
  );

  useEffect(() => {
    if (
      !editor.autoBuildInitial ||
      !resolution.ok ||
      autoBuildAttemptRef.current === bodyBuildFingerprint
    ) {
      return;
    }
    autoBuildAttemptRef.current = bodyBuildFingerprint;
    buildFullBodyPreview(draftPoseRef.current, 'measurement-change');
  }, [bodyBuildFingerprint, buildFullBodyPreview, editor, resolution.ok]);

  const currentBuilt = built?.bodyBuildFingerprint === bodyBuildFingerprint ? built : null;
  const displayedBuilt = currentBuilt ?? (editor.version === 'full-body-v9' ? built : null);
  const bodyDisplayOwnership =
    editor.version === 'full-body-v9'
      ? modelOpenReferenceBodyDisplayOwnershipV11({
          builtFingerprint: built?.bodyBuildFingerprint ?? null,
          requestedFingerprint: bodyBuildFingerprint,
          resolutionOk: resolution.ok,
          updateStatus,
          stageStatus,
        })
      : currentBuilt
        ? 'current'
        : 'empty';
  const bodyDisplayMessage =
    bodyDisplayOwnership === 'retained-invalid'
      ? 'Measurements need attention. Showing the last valid preview; the current entered values are not applied.'
      : bodyDisplayOwnership === 'retained-pending'
        ? 'Body update pending. Showing the last valid preview until the new measurements are ready.'
        : bodyDisplayOwnership === 'retained-error'
          ? `Body update failed: ${updateError} Showing the last valid preview; the current entered values are not applied.`
          : bodyDisplayOwnership === 'preparing'
            ? 'Preparing updated body geometry. The previous rendered preview remains visible until the new preview is ready.'
            : null;
  const poseBlockedMessage =
    poseAdmissibility.status === 'blocked'
      ? modelOpenReferencePoseBlockedMessageV11(poseAdmissibility.blockers)
      : null;
  const applyLivePoseFrame = useCallback(
    (pose: Pose): 'applied' | 'rejected' | 'unavailable' => {
      if (!editor.livePose || !currentBuilt?.liveFkSession) return 'unavailable';
      try {
        const liveFkSession = currentBuilt.liveFkSession;
        let positions: Float32Array;
        let groups: readonly MakeHumanFullBodyJointOverlayGroupV5[] | null = null;
        if (liveFkSession.version === 'makehuman-full-body-live-fk-session/v5') {
          const frame = liveFkSession.solve(editor.runtimePose(pose));
          positions = frame.positions;
          const admission = evaluateMakeHumanLivePoseAdmissibilityV1({
            bones: frame.jointOverlay,
            neutralBones: liveFkSession.neutralJointOverlay,
            groundReferenceM: liveFkSession.groundReferenceM,
            baselineAnklesM: liveFkSession.baselineAnklesM,
          });
          if (!admission.admissible) {
            setPoseAdmissibility(
              Object.freeze({ status: 'blocked', blockers: admission.blockers }),
            );
            setLivePoseFrame((current) =>
              modelOpenReferenceLivePoseFrameNextV10(current, { status: 'rejected' }),
            );
            return 'rejected';
          }
          groups = makeHumanFullBodyJointOverlayGroupsFromBonesV5(frame.jointOverlay);
          setPoseAdmissibility(Object.freeze({ status: 'admitted', blockers: Object.freeze([]) }));
        } else {
          positions = liveFkSession.solve(editor.runtimePose(pose)).positions;
        }
        setLivePoseFrame((current) =>
          modelOpenReferenceLivePoseFrameNextV10(current, {
            status: 'accepted',
            bodyBuildFingerprint: currentBuilt.bodyBuildFingerprint,
            bodySourceRevision: currentBuilt.runtime.sourceRevision,
            positions,
            groups,
          }),
        );
        return 'applied';
      } catch {
        setLivePoseFrame((current) =>
          modelOpenReferenceLivePoseFrameNextV10(current, { status: 'rejected' }),
        );
        return 'rejected';
      }
    },
    [currentBuilt, editor],
  );
  const effectiveJointEditorMode = directPoseViewportEditingEnabled
    ? modelOpenReferenceJointEditorEffectiveModeV5(
        jointEditorMode,
        currentBuilt?.jointOverlay?.status ?? null,
      )
    : 'camera';
  const controlStatus: FullBodyPoseControlStatus =
    bodyDisplayOwnership !== 'current' && bodyDisplayOwnership !== 'empty'
      ? 'building'
      : updateStatus === 'building'
        ? 'building'
        : updateStatus === 'error'
          ? 'error'
          : !editor.equalGeometry(draftPose, appliedPose)
            ? 'pending'
            : 'idle';
  const status: PreviewStatus =
    updateStatus === 'building' ? 'building' : updateStatus === 'error' ? 'error' : stageStatus;
  const measurementApplicationSummary = displayedBuilt?.measurementApplication
    ? modelOpenReferenceMeasurementApplicationSummaryV1(displayedBuilt.measurementApplication)
    : null;
  const measurementApplicationUnavailable =
    editor.version === 'full-body-v9' && displayedBuilt !== null && !measurementApplicationSummary;
  const measurementApplicationPartial =
    measurementApplicationUnavailable || measurementApplicationSummary?.status === 'partial';
  const measurementApplicationText = measurementApplicationUnavailable
    ? 'body shape partial · measurement morph runtime unavailable'
    : measurementApplicationSummary?.text;

  const readyJointOverlay =
    currentBuilt?.jointOverlay?.status === 'ready' ? currentBuilt.jointOverlay : null;
  const matchingLivePoseFrame =
    currentBuilt &&
    livePoseFrame?.bodyBuildFingerprint === currentBuilt.bodyBuildFingerprint &&
    livePoseFrame.bodySourceRevision === currentBuilt.runtime.sourceRevision
      ? livePoseFrame
      : null;
  const measurementGuide = useMemo(
    () =>
      activeMeasurementName && displayedBuilt
        ? buildMeasurementSurfaceActiveMeasurementGuideV1({
            measurementName: activeMeasurementName,
            frame: displayedBuilt.frame,
            mesh: displayedBuilt.measurementGuideSourceMesh,
            neutralPose: editor.equalGeometry(draftPose, editor.neutralPose),
          })
        : undefined,
    [activeMeasurementName, displayedBuilt, draftPose, editor],
  );
  const activeJointOverlayGroups =
    matchingLivePoseFrame?.groups ?? readyJointOverlay?.groups ?? Object.freeze([]);
  const liveJointOverlayStatus = !readyJointOverlay
    ? ('off' as const)
    : matchingLivePoseFrame?.groups
      ? ('updated' as const)
      : ('applied' as const);
  const liveJointOverlaySignature =
    matchingLivePoseFrame?.jointOverlaySignature ?? readyJointOverlay?.sourceRevision ?? '';
  const selectedJointGroup = activeJointOverlayGroups.find(
    ({ id }) => id === jointSelection.groupId,
  );
  const selectedJointDescriptor = selectedJointGroup?.channelDescriptors.find(
    ({ channel }) => channel === jointSelection.channel,
  );
  const jointRingRevision =
    editor.jointRing &&
    updateStatus !== 'building' &&
    effectiveJointEditorMode === 'edit-pose' &&
    directSelectedGroupId === jointSelection.groupId &&
    currentBuilt &&
    readyJointOverlay &&
    readyJointOverlay.binding.bodySourceRevision === currentBuilt.runtime.sourceRevision &&
    selectedJointGroup &&
    selectedJointDescriptor
      ? JSON.stringify([
          editor.version,
          currentBuilt.bodyBuildFingerprint,
          currentBuilt.runtime.sourceRevision,
          readyJointOverlay.sourceRevision,
          readyJointOverlay.binding.bodySourceRevision,
          jointSelection.groupId,
          jointSelection.channel,
          selectedJointDescriptor.axis,
        ])
      : null;
  currentJointRingRevisionRef.current = jointRingRevision;
  const rotationGizmoGroup = jointRingTransactionRef.current?.gizmoGroup ?? selectedJointGroup;

  const finishActiveJointRing = (outcome: 'commit' | 'cancel'): Pose | null => {
    const active = jointRingTransactionRef.current;
    const ring = editor.jointRing;
    jointRingTransactionRef.current = null;
    if (!active || !ring) return null;
    const finishedPose =
      outcome === 'commit'
        ? editor.snapshot(active.lastAdmittedPose)
        : editor.snapshot(ring.finish(active.transaction, 'cancel'));
    finishControlledGesture(outcome, finishedPose);
    applyLivePoseFrame(finishedPose);
    setUpdateStatus('idle');
    setUpdateError('');
    return finishedPose;
  };

  const handleDraftChange = (nextPose: Pose) => {
    if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
    modelOpenReferenceBeginDirectPoseGestureV9(updateStatus, cancelBuild);
    const snapshot = editor.snapshot(nextPose);
    if (applyLivePoseFrame(snapshot) === 'rejected') return;
    const binding = directPoseBindingRef.current;
    if (binding && editor.version === 'full-body-v9') {
      binding.onDiscreteEdit(snapshot as ModelOpenReferenceDirectPoseV9);
    } else {
      setUncontrolledDraftPose(snapshot);
    }
    setUpdateStatus('idle');
    setUpdateError('');
  };

  const beginDirectPoseGesture = () => {
    // A direct manipulation supersedes an in-flight commit. Invalidating its generation prevents
    // a stale async rebuild from replacing the live gesture or cancelling it via an overlay swap.
    if (updateStatus === 'building') cancelBuild();
    setUpdateStatus('idle');
    setUpdateError('');
    const binding = directPoseBindingRef.current;
    if (binding && editor.version === 'full-body-v9') {
      if (controlledGestureActiveRef.current) {
        binding.onFinishGesture('cancel', draftPoseRef.current as ModelOpenReferenceDirectPoseV9);
      }
      binding.onBeginGesture();
      controlledGestureActiveRef.current = true;
    }
  };

  const armPositionDragTargets =
    editor.armBodyPartIk &&
    currentBuilt &&
    readyJointOverlay &&
    readyJointOverlay.binding.bodySourceRevision === currentBuilt.runtime.sourceRevision
      ? (['left', 'right'] as const).flatMap((side) => {
          const shoulder = activeJointOverlayGroups.find(
            ({ id }) => id === `${side}-shoulder-group`,
          );
          const elbow = activeJointOverlayGroups.find(({ id }) => id === `${side}-elbow`);
          const wrist = activeJointOverlayGroups.find(({ id }) => id === `${side}-wrist`);
          if (!shoulder || !elbow || !wrist) return [];
          const revision = JSON.stringify([
            editor.version,
            currentBuilt.bodyBuildFingerprint,
            currentBuilt.runtime.sourceRevision,
            readyJointOverlay.sourceRevision,
            side,
            'arm-body-part-ik-v1',
          ]);
          return [
            {
              revision,
              groupId: wrist.id,
              pivotM: wrist.headM,
              onStart: () => {
                if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                beginDirectPoseGesture();
                const originalPose = editor.snapshot(draftPose);
                armIkTransactionRef.current = {
                  revision,
                  side,
                  originalPose,
                  currentArm: editor.armBodyPartIk!.currentArm(originalPose, side),
                  lastPose: originalPose,
                };
                setJointSelection(
                  modelOpenReferenceJointSelectionV5(
                    wrist.id as MakeHumanFullBodyJointOverlayGroupIdV4,
                  ),
                );
                setDirectSelectedGroupId(wrist.id);
              },
              onMove: (targetM: readonly [number, number, number]) => {
                const transaction = armIkTransactionRef.current;
                const armBodyPartIk = editor.armBodyPartIk;
                if (!transaction || !armBodyPartIk || transaction.revision !== revision) return;
                const solved = solveMakeHumanArmBodyPartIkV1({
                  side,
                  shoulderM: shoulder.headM,
                  elbowM: elbow.headM,
                  wristM: wrist.headM,
                  shoulderLocalToWorld: shoulder.localToWorld,
                  targetWristM: targetM,
                  currentArm: transaction.currentArm,
                  sideSeamAssist: currentBuilt.liveFkSession?.sideSeamAssists[side],
                });
                const nextPose = editor.snapshot(
                  armBodyPartIk.applyArm(transaction.originalPose, side, solved.arm),
                );
                if (applyLivePoseFrame(nextPose) === 'rejected') return;
                transaction.lastPose = nextPose;
                publishGestureUpdate(nextPose);
                setUpdateStatus('idle');
                setUpdateError('');
              },
              onFinish: (outcome: 'commit' | 'cancel') => {
                const transaction = armIkTransactionRef.current;
                if (!transaction || transaction.revision !== revision) return;
                armIkTransactionRef.current = null;
                const finishedPose =
                  outcome === 'commit' ? transaction.lastPose : transaction.originalPose;
                finishControlledGesture(outcome, finishedPose);
                applyLivePoseFrame(finishedPose);
                if (outcome === 'commit') buildFullBodyPreview(finishedPose);
              },
            },
          ];
        })
      : undefined;

  const shoulderPosturePositionDragTargets =
    editor.shoulderPosture &&
    currentBuilt &&
    readyJointOverlay &&
    readyJointOverlay.binding.bodySourceRevision === currentBuilt.runtime.sourceRevision
      ? (['left', 'right'] as const).flatMap((side) => {
          const shoulder = activeJointOverlayGroups.find(
            ({ id }) => id === `${side}-shoulder-group`,
          );
          if (!shoulder) return [];
          const revision = JSON.stringify([
            editor.version,
            currentBuilt.bodyBuildFingerprint,
            currentBuilt.runtime.sourceRevision,
            readyJointOverlay.sourceRevision,
            side,
            'shoulder-posture-position-drag-v1',
          ]);
          return [
            {
              revision,
              groupId: shoulder.id,
              pivotM: shoulder.headM,
              onStart: (sourceM: readonly [number, number, number]) => {
                if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                beginDirectPoseGesture();
                const originalPose = editor.snapshot(draftPose);
                shoulderPostureTransactionRef.current = {
                  revision,
                  side,
                  linked: editor.shoulderPosture!.linked(originalPose),
                  originalPose,
                  sourceM,
                  current: editor.shoulderPosture!.current(originalPose),
                  lastPose: originalPose,
                };
                setJointSelection(modelOpenReferenceDirectJointSelectionV9(shoulder.id));
                setDirectSelectedGroupId(shoulder.id);
              },
              onMove: (targetM: readonly [number, number, number]) => {
                const transaction = shoulderPostureTransactionRef.current;
                const shoulderPosture = editor.shoulderPosture;
                if (!transaction || !shoulderPosture || transaction.revision !== revision) return;
                const posture = modelOpenReferenceDirectSolveShoulderPostureDragV9({
                  side: transaction.side,
                  linked: transaction.linked,
                  sourceM: transaction.sourceM,
                  targetM,
                  current: transaction.current,
                });
                const nextPose = editor.snapshot(
                  shoulderPosture.apply(transaction.originalPose, posture),
                );
                if (applyLivePoseFrame(nextPose) === 'rejected') return;
                transaction.lastPose = nextPose;
                publishGestureUpdate(nextPose);
                setUpdateStatus('idle');
                setUpdateError('');
              },
              onFinish: (outcome: 'commit' | 'cancel') => {
                const transaction = shoulderPostureTransactionRef.current;
                if (!transaction || transaction.revision !== revision) return;
                shoulderPostureTransactionRef.current = null;
                const finishedPose =
                  outcome === 'commit' ? transaction.lastPose : transaction.originalPose;
                finishControlledGesture(outcome, finishedPose);
                applyLivePoseFrame(finishedPose);
                if (outcome === 'commit') buildFullBodyPreview(finishedPose);
              },
            },
          ];
        })
      : undefined;

  const torsoPositionDragTargets =
    editor.torsoAimIk &&
    currentBuilt &&
    readyJointOverlay &&
    readyJointOverlay.binding.bodySourceRevision === currentBuilt.runtime.sourceRevision
      ? activeJointOverlayGroups
          .filter(({ id }) => id === 'torso-group')
          .map((torsoGroup) => {
            const revision = JSON.stringify([
              editor.version,
              currentBuilt.bodyBuildFingerprint,
              currentBuilt.runtime.sourceRevision,
              readyJointOverlay.sourceRevision,
              'torso-aim-ik-v1',
            ]);
            return {
              revision,
              groupId: torsoGroup.id,
              pivotM: torsoGroup.tailM,
              onStart: () => {
                if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                beginDirectPoseGesture();
                const originalPose = editor.snapshot(draftPose);
                torsoIkTransactionRef.current = {
                  revision,
                  originalPose,
                  currentTorso: editor.torsoAimIk!.currentTorso(originalPose),
                  lastPose: originalPose,
                };
                setJointSelection(modelOpenReferenceJointSelectionV5('torso-group'));
                setDirectSelectedGroupId('torso-group');
              },
              onMove: (targetM: readonly [number, number, number]) => {
                const transaction = torsoIkTransactionRef.current;
                const torsoAimIk = editor.torsoAimIk;
                if (!transaction || !torsoAimIk || transaction.revision !== revision) return;
                const solved = solveMakeHumanTorsoAimIkV1({
                  torsoPivotM: torsoGroup.headM,
                  headM: torsoGroup.tailM,
                  torsoLocalToWorld: torsoGroup.localToWorld,
                  targetHeadM: targetM,
                  currentTorso: transaction.currentTorso,
                });
                const nextPose = editor.snapshot(
                  torsoAimIk.applyTorso(transaction.originalPose, solved.torso),
                );
                if (applyLivePoseFrame(nextPose) === 'rejected') return;
                transaction.lastPose = nextPose;
                publishGestureUpdate(nextPose);
                setUpdateStatus('idle');
                setUpdateError('');
              },
              onFinish: (outcome: 'commit' | 'cancel') => {
                const transaction = torsoIkTransactionRef.current;
                if (!transaction || transaction.revision !== revision) return;
                torsoIkTransactionRef.current = null;
                const finishedPose =
                  outcome === 'commit' ? transaction.lastPose : transaction.originalPose;
                finishControlledGesture(outcome, finishedPose);
                applyLivePoseFrame(finishedPose);
                if (outcome === 'commit') buildFullBodyPreview(finishedPose);
              },
            };
          })
      : undefined;

  const legPositionDragTargets =
    editor.legBodyPartIk &&
    currentBuilt &&
    readyJointOverlay &&
    readyJointOverlay.binding.bodySourceRevision === currentBuilt.runtime.sourceRevision
      ? (['left', 'right'] as const).flatMap((side) => {
          const hip = activeJointOverlayGroups.find(({ id }) => id === `${side}-hip-group`);
          const knee = activeJointOverlayGroups.find(({ id }) => id === `${side}-knee`);
          const ankle = activeJointOverlayGroups.find(({ id }) => id === `${side}-ankle`);
          if (!hip || !knee || !ankle) return [];
          const revision = JSON.stringify([
            editor.version,
            currentBuilt.bodyBuildFingerprint,
            currentBuilt.runtime.sourceRevision,
            readyJointOverlay.sourceRevision,
            side,
            'leg-body-part-ik-v1',
          ]);
          return [
            {
              revision,
              groupId: ankle.id,
              pivotM: ankle.headM,
              onStart: () => {
                if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                beginDirectPoseGesture();
                const originalPose = editor.snapshot(draftPose);
                legIkTransactionRef.current = {
                  revision,
                  side,
                  originalPose,
                  currentLeg: editor.legBodyPartIk!.currentLeg(originalPose, side),
                  lastPose: originalPose,
                };
                setJointSelection(modelOpenReferenceDirectJointSelectionV9(ankle.id));
                setDirectSelectedGroupId(ankle.id);
              },
              onMove: (targetM: readonly [number, number, number]) => {
                const transaction = legIkTransactionRef.current;
                const legBodyPartIk = editor.legBodyPartIk;
                if (!transaction || !legBodyPartIk || transaction.revision !== revision) return;
                const solved = solveMakeHumanLegBodyPartIkV1({
                  side,
                  hipM: hip.headM,
                  kneeM: knee.headM,
                  ankleM: ankle.headM,
                  hipLocalToWorld: hip.localToWorld,
                  targetAnkleM: targetM,
                  currentLeg: transaction.currentLeg,
                });
                const nextPose = editor.snapshot(
                  legBodyPartIk.applyLeg(transaction.originalPose, side, solved.leg),
                );
                if (applyLivePoseFrame(nextPose) === 'rejected') return;
                transaction.lastPose = nextPose;
                publishGestureUpdate(nextPose);
                setUpdateStatus('idle');
                setUpdateError('');
              },
              onFinish: (outcome: 'commit' | 'cancel') => {
                const transaction = legIkTransactionRef.current;
                if (!transaction || transaction.revision !== revision) return;
                legIkTransactionRef.current = null;
                const finishedPose =
                  outcome === 'commit' ? transaction.lastPose : transaction.originalPose;
                finishControlledGesture(outcome, finishedPose);
                applyLivePoseFrame(finishedPose);
                if (outcome === 'commit') buildFullBodyPreview(finishedPose);
              },
            },
          ];
        })
      : undefined;

  const headPositionDragTargets =
    editor.headAimIk &&
    currentBuilt &&
    readyJointOverlay &&
    readyJointOverlay.binding.bodySourceRevision === currentBuilt.runtime.sourceRevision
      ? activeJointOverlayGroups
          .filter(({ id }) => id === 'head-group')
          .map((headGroup) => {
            const revision = JSON.stringify([
              editor.version,
              currentBuilt.bodyBuildFingerprint,
              currentBuilt.runtime.sourceRevision,
              readyJointOverlay.sourceRevision,
              'head-aim-ik-v1',
            ]);
            return {
              revision,
              groupId: headGroup.id,
              pivotM: headGroup.tailM,
              onStart: () => {
                if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                beginDirectPoseGesture();
                const originalPose = editor.snapshot(draftPose);
                headIkTransactionRef.current = {
                  revision,
                  originalPose,
                  currentHead: editor.headAimIk!.currentHead(originalPose),
                  lastPose: originalPose,
                };
                setJointSelection(modelOpenReferenceDirectJointSelectionV9(headGroup.id));
                setDirectSelectedGroupId(headGroup.id);
              },
              onMove: (targetM: readonly [number, number, number]) => {
                const transaction = headIkTransactionRef.current;
                const headAimIk = editor.headAimIk;
                if (!transaction || !headAimIk || transaction.revision !== revision) return;
                const solved = solveMakeHumanHeadAimIkV1({
                  neckPivotM: headGroup.headM,
                  headTipM: headGroup.tailM,
                  headLocalToWorld: headGroup.localToWorld,
                  targetHeadTipM: targetM,
                  currentHead: transaction.currentHead,
                });
                const nextPose = editor.snapshot(
                  headAimIk.applyHead(transaction.originalPose, solved.head),
                );
                if (applyLivePoseFrame(nextPose) === 'rejected') return;
                transaction.lastPose = nextPose;
                publishGestureUpdate(nextPose);
                setUpdateStatus('idle');
                setUpdateError('');
              },
              onFinish: (outcome: 'commit' | 'cancel') => {
                const transaction = headIkTransactionRef.current;
                if (!transaction || transaction.revision !== revision) return;
                headIkTransactionRef.current = null;
                const finishedPose =
                  outcome === 'commit' ? transaction.lastPose : transaction.originalPose;
                finishControlledGesture(outcome, finishedPose);
                applyLivePoseFrame(finishedPose);
                if (outcome === 'commit') buildFullBodyPreview(finishedPose);
              },
            };
          })
      : undefined;

  const positionDragTargets =
    armPositionDragTargets ||
    shoulderPosturePositionDragTargets ||
    torsoPositionDragTargets ||
    legPositionDragTargets ||
    headPositionDragTargets
      ? [
          ...(armPositionDragTargets ?? []),
          ...(shoulderPosturePositionDragTargets ?? []),
          ...(torsoPositionDragTargets ?? []),
          ...(legPositionDragTargets ?? []),
          ...(headPositionDragTargets ?? []),
        ]
      : undefined;

  return (
    <div
      className={workbench ? 'flex h-full min-h-0 flex-col gap-1' : 'flex flex-col gap-stack'}
      data-testid='model-open-reference-preview'
      data-pose-controls={editor.version}
      data-pose-admissibility={poseAdmissibility.status}
      data-pose-blockers={poseAdmissibility.blockers.join(',')}
      data-pose-session={
        editor.version === 'full-body-v9' && directPoseBindingV9 ? 'controlled' : 'temporary'
      }
      data-pose-draft={editor.equalGeometry(draftPose, editor.neutralPose) ? 'neutral' : 'custom'}
      data-preview-variant={variant}
      data-pose-viewport-editing={directPoseViewportEditingEnabled ? 'enabled' : 'disabled'}
      data-body-display-ownership={bodyDisplayOwnership}
    >
      {!editor.minimalViewportUi ? (
        <CalloutBox tone='note'>
          <Text component='p' size='micro'>
            <b>visual reference only</b> · local-axis forward kinematics for the mannequin body and
            {` ${editor.scopeDescription}`}.
          </Text>
          <Text component='p' size='micro' className='mt-1'>
            This preview does not evaluate a garment pair, fit, collision safety, or clinical joint
            ranges. Pose is not saved with the model.
          </Text>
          <Text component='p' size='micro' className='mt-1 font-mono'>
            inverseKinematicsApplied=false · garmentPairEvaluated=false · fitClaimEligible=false ·
            runtimeCollisionEligible=false
          </Text>
        </CalloutBox>
      ) : null}

      {!resolution.ok ? (
        <CalloutBox tone='warning'>
          <Text component='p' size='micro'>
            <b>{displayedBuilt ? 'measurements need attention' : 'preview blocked'}</b> · enter a
            plausible value for every required mannequin measurement.
            {displayedBuilt ? ' The last valid preview remains visible and unchanged.' : ''}
          </Text>
          <ul className='mt-1 grid gap-0.5 md:grid-cols-2'>
            {resolution.diagnostics.map((diagnostic, index) => (
              <li
                key={diagnosticKey(diagnostic.code, diagnostic.canonicalKey, index)}
                className='text-micro'
              >
                ! {modelOpenReferencePreviewDiagnosticMessageV1(diagnostic)}
              </li>
            ))}
          </ul>
        </CalloutBox>
      ) : null}

      {bodyDisplayMessage ? (
        <Text
          component='p'
          size='micro'
          variant={bodyDisplayOwnership === 'retained-error' ? 'errorLabel' : 'label'}
          className={bodyDisplayOwnership === 'retained-error' ? undefined : 'text-warning'}
          role={bodyDisplayOwnership === 'retained-error' ? 'alert' : 'status'}
          aria-live={bodyDisplayOwnership === 'retained-error' ? 'assertive' : 'polite'}
          aria-atomic='true'
          data-testid='model-open-reference-body-display-status'
          data-body-display-ownership={bodyDisplayOwnership}
        >
          {bodyDisplayMessage}
        </Text>
      ) : null}

      {poseBlockedMessage ? (
        <Text
          component='p'
          size='micro'
          variant='errorLabel'
          role='alert'
          aria-live='assertive'
          aria-atomic='true'
          data-testid='model-open-reference-pose-blocked-status'
        >
          {poseBlockedMessage}
        </Text>
      ) : null}

      {resolution.ok || displayedBuilt ? (
        <>
          {!directPoseControlHidden ? (
            <div className={editor.minimalViewportUi ? 'order-2' : undefined}>
              {editor.renderControl({
                draftPose,
                appliedPose,
                status: controlStatus,
                onDraftChange: handleDraftChange,
                onApply: buildFullBodyPreview,
                sessionPose:
                  editor.version === 'full-body-v9' && directPoseBindingV9
                    ? {
                        dirty: directPoseBindingV9.dirty,
                        canUndo: directPoseBindingV9.canUndo,
                        onUndo: () => directPoseBindingV9.onUndo() as Pose,
                        onReset: () => directPoseBindingV9.onReset() as Pose,
                        persistence: directPoseBindingV9.persistence,
                      }
                    : undefined,
                jointEditor: {
                  overlay: editor.extendedOverlayV5
                    ? null
                    : (currentBuilt?.jointOverlay as MakeHumanFullBodyJointOverlayRuntimeResultV4) ??
                      null,
                  overlayStatus:
                    currentBuilt?.jointOverlay?.status === 'ready'
                      ? 'ready'
                      : currentBuilt?.jointOverlay?.status === 'unavailable'
                        ? 'unavailable'
                        : 'pending',
                  overlayError: currentBuilt?.jointOverlayError ?? null,
                  mode: effectiveJointEditorMode,
                  selection: jointSelection as ModelOpenReferenceJointSelectionV5,
                  onModeChange: (nextMode) => {
                    if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                    setJointEditorMode(nextMode);
                  },
                  onSelectionChange: (nextSelection) => {
                    if (jointRingTransactionRef.current) finishActiveJointRing('cancel');
                    setJointSelection(nextSelection);
                    setDirectSelectedGroupId(nextSelection.groupId);
                  },
                },
              })}
            </div>
          ) : null}

          {!editor.minimalViewportUi && resolution.ok ? (
            <div className='flex flex-wrap items-center gap-2'>
              <Pill tone='ink'>basis {resolution.basis.basisKind}</Pill>
              <Pill tone={statusTone(status)}>{status}</Pill>
              <Pill tone={currentBuilt?.waistHipStatus === 'represented' ? 'ok' : 'attention'}>
                waist / hip {currentBuilt?.representedWaistHipProxies.length ?? 0}/2
              </Pill>
              <Pill tone='mut'>limb circumference proxies omitted while posed</Pill>
              {currentBuilt?.runtime.source.poseResourcesLoaded ? (
                <Pill tone='ink'>pivot residual ≤ 1e-7 m</Pill>
              ) : currentBuilt ? (
                <Pill tone='mut'>pivot residual not applicable · neutral pose</Pill>
              ) : null}
            </div>
          ) : null}

          {editor.minimalViewportUi &&
          bodyDisplayOwnership === 'current' &&
          displayedBuilt &&
          measurementApplicationText ? (
            <Text
              component='p'
              size='micro'
              variant={measurementApplicationPartial ? 'errorLabel' : 'label'}
              role={measurementApplicationPartial ? 'alert' : 'status'}
              aria-live='polite'
              data-testid='model-open-reference-measurement-application-status'
              data-application-status={measurementApplicationPartial ? 'partial' : 'ready'}
              data-applied={displayedBuilt.measurementApplication?.applied.join(',') ?? ''}
              data-limited={
                displayedBuilt.measurementApplication?.limitedBySafeRange.join(',') ?? ''
              }
              data-not-applied={displayedBuilt.measurementApplication?.notApplied.join(',') ?? ''}
              data-modifier-only={
                displayedBuilt.measurementApplication?.modifierOnly.join(',') ?? ''
              }
              data-unsupported={displayedBuilt.measurementApplication?.unsupported.join(',') ?? ''}
            >
              {measurementApplicationText}
            </Text>
          ) : null}

          <Text
            component='p'
            size='micro'
            className={editor.minimalViewportUi || bodyDisplayMessage ? 'sr-only' : undefined}
            variant={status === 'error' ? 'errorLabel' : 'label'}
            role={bodyDisplayMessage ? undefined : status === 'error' ? 'alert' : 'status'}
            aria-live={bodyDisplayMessage ? undefined : status === 'error' ? 'assertive' : 'polite'}
            aria-atomic={bodyDisplayMessage ? undefined : 'true'}
            aria-hidden={bodyDisplayMessage ? 'true' : undefined}
            data-testid='model-open-reference-preview-status'
          >
            {bodyDisplayMessage ??
              (updateStatus === 'building' && displayedBuilt
                ? `Updating pose; showing preview ${editor.label(appliedPose ?? editor.neutralPose)} until ready.`
                : updateStatus === 'building'
                  ? 'Building the measurement-driven full-body preview.'
                  : updateStatus === 'error' && displayedBuilt
                    ? `Pose update failed: ${updateError} Previous preview remains visible.`
                    : updateStatus === 'error'
                      ? `Preview failed: ${updateError}`
                      : stageStatus === 'idle'
                        ? 'Preview not built. Adjust the draft if needed, then select APPLY POSE.'
                        : stageStatus === 'initializing'
                          ? 'Preparing the interactive 3D view.'
                          : stageStatus === 'ready'
                            ? measurementApplicationPartial
                              ? `Preview partial: ${editor.label(appliedPose ?? editor.neutralPose)}. Some entered measurement morphs were limited or not applied.`
                              : `Preview ready: ${editor.label(appliedPose ?? editor.neutralPose)}. Drag to orbit and use the wheel to zoom.`
                            : `Preview failed: ${stageError}`)}
          </Text>

          {displayedBuilt ? (
            <Suspense fallback={<SkeletonBlocks count={1} height={320} className='w-full' />}>
              <MeasurementWatertightSurfaceV1Stage
                artifact={displayedBuilt.artifact}
                frame={displayedBuilt.frame}
                lod='display'
                displayMeshOverride={displayedBuilt.runtime.displayMesh}
                measurementGuide={measurementGuide}
                viewPreset={viewPreset}
                overlays={DISPLAY_OVERLAYS}
                jointEditor={
                  directPoseViewportEditingEnabled &&
                  editor.buildsJointOverlay &&
                  currentBuilt?.jointOverlay
                    ? {
                        mode: effectiveJointEditorMode,
                        groups:
                          currentBuilt.jointOverlay.status === 'ready'
                            ? activeJointOverlayGroups
                            : [],
                        selectedGroupId: directSelectedGroupId,
                        selectedChannel: jointSelection.channel,
                        overlayStatus: currentBuilt.jointOverlay.status,
                        liveOverlayStatus: liveJointOverlayStatus,
                        liveOverlaySignature: liveJointOverlaySignature,
                        rotationGizmo:
                          jointRingRevision &&
                          rotationGizmoGroup &&
                          selectedJointDescriptor &&
                          editor.jointRing
                            ? {
                                revision: jointRingRevision,
                                pivotM: rotationGizmoGroup.headM,
                                localToWorld: rotationGizmoGroup.localToWorld,
                                axis: selectedJointDescriptor.axis,
                                onStart: (angleDegrees: number) => {
                                  const ring = editor.jointRing;
                                  if (
                                    !ring ||
                                    currentJointRingRevisionRef.current !== jointRingRevision
                                  ) {
                                    return;
                                  }
                                  if (jointRingTransactionRef.current) {
                                    finishActiveJointRing('cancel');
                                  }
                                  beginDirectPoseGesture();
                                  const startPose = editor.snapshot(draftPose);
                                  jointRingTransactionRef.current = {
                                    revision: jointRingRevision,
                                    gizmoGroup: rotationGizmoGroup,
                                    originalPose: startPose,
                                    transaction: ring.begin(
                                      startPose,
                                      jointSelection,
                                      angleDegrees,
                                    ),
                                    lastAdmittedPose: startPose,
                                  };
                                },
                                onMove: (angleDegrees: number) => {
                                  const active = jointRingTransactionRef.current;
                                  const ring = editor.jointRing;
                                  if (
                                    !active ||
                                    !ring ||
                                    active.revision !== jointRingRevision ||
                                    currentJointRingRevisionRef.current !== jointRingRevision
                                  ) {
                                    return;
                                  }
                                  const moved = ring.move(active.transaction, angleDegrees);
                                  active.transaction = moved.transaction;
                                  const nextPose = editor.snapshot(moved.pose);
                                  if (applyLivePoseFrame(nextPose) === 'rejected') return;
                                  active.lastAdmittedPose = nextPose;
                                  publishGestureUpdate(nextPose);
                                  setUpdateStatus('idle');
                                  setUpdateError('');
                                },
                                onFinish: (outcome: 'commit' | 'cancel') => {
                                  const active = jointRingTransactionRef.current;
                                  if (!active || active.revision !== jointRingRevision) return;
                                  const resolvedOutcome =
                                    outcome === 'commit' &&
                                    currentJointRingRevisionRef.current === jointRingRevision
                                      ? 'commit'
                                      : 'cancel';
                                  const poseChanged = !editor.equalGeometry(
                                    active.originalPose,
                                    active.lastAdmittedPose,
                                  );
                                  const finishedPose = finishActiveJointRing(resolvedOutcome);
                                  if (
                                    resolvedOutcome === 'commit' &&
                                    finishedPose &&
                                    editor.autoApplyJointRingOnCommit &&
                                    poseChanged
                                  ) {
                                    buildFullBodyPreview(finishedPose);
                                  }
                                },
                              }
                            : undefined,
                        positionDragTargets,
                        onSelectGroup: (groupId) => {
                          if (
                            currentBuilt.jointOverlay?.status === 'ready' &&
                            activeJointOverlayGroups.some(({ id }) => id === groupId)
                          ) {
                            if (jointRingTransactionRef.current) {
                              finishActiveJointRing('cancel');
                            }
                            setDirectSelectedGroupId(groupId);
                            if (editor.extendedOverlayV5) {
                              setJointSelection(
                                modelOpenReferenceDirectJointSelectionV9(
                                  groupId as MakeHumanFullBodyJointOverlayGroupIdV5,
                                ),
                              );
                            } else if (
                              MAKEHUMAN_FULL_BODY_JOINT_OVERLAY_GROUPS_V4.some(
                                ({ id }) => id === groupId,
                              )
                            ) {
                              setJointSelection(
                                modelOpenReferenceJointSelectionV5(
                                  groupId as MakeHumanFullBodyJointOverlayGroupIdV4,
                                ),
                              );
                            }
                          }
                        },
                      }
                    : undefined
                }
                liveDisplayPositions={matchingLivePoseFrame?.positions}
                unifiedJointInteraction={
                  directPoseViewportEditingEnabled && (editor.unifiedViewportInteraction ?? false)
                }
                patternPieceOverlay={patternPieceOverlay}
                retainVisibleCanvasOnRebuild={editor.version === 'full-body-v9'}
                className={
                  workbench
                    ? 'order-1 h-full min-h-0 w-full border border-hairline'
                    : editor.minimalViewportUi
                      ? 'order-1 h-[62vh] min-h-[32rem] max-h-[48rem] border border-hairline'
                      : 'h-[42vh] min-h-80 max-h-[32rem] border border-hairline'
                }
                onStatus={(nextStatus, nextError) => {
                  setStageStatus(nextStatus);
                  setStageError(nextError ?? '');
                }}
                onRenderCount={NOOP}
              />
            </Suspense>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ModelOpenReferenceFullBodyPreviewV3(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V3} />;
}

function ModelOpenReferenceFullBodyPreviewV4(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V4} />;
}

function ModelOpenReferenceFullBodyPreviewV5(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V5} />;
}

function ModelOpenReferenceFullBodyPreviewV6(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V6} />;
}

function ModelOpenReferenceFullBodyPreviewV7(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V7} />;
}

function ModelOpenReferenceFullBodyPreviewV8(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V8} />;
}

function ModelOpenReferenceFullBodyPreviewV9(props: ModelOpenReferencePreviewFromInputProps) {
  return <ModelOpenReferenceFullBodyPreviewEditor {...props} editor={FULL_BODY_EDITOR_V9} />;
}

function ModelOpenReferenceLinkedPreviewV2({
  buildDependencies,
  modelId = 'model-form:create',
  modelContentRevision = 'model-form:create:unbound',
  input,
  variant = 'form',
  viewPreset = 'front',
  patternPieceOverlay,
}: ModelOpenReferencePreviewFromInputProps) {
  const workbench = variant === 'workbench';
  const card = variant === 'card';
  const resolution = useMemo(() => resolveModelOpenReferencePreviewInputV1(input), [input]);
  const requestedLimbKeys = useMemo(
    () =>
      resolution.ok ? modelOpenReferencePreviewRequestedLimbKeysV1(resolution.measurements) : [],
    [resolution],
  );
  const inputFingerprint = useMemo(() => modelOpenReferencePreviewFingerprintV1(input), [input]);
  const bodyBuildFingerprint = useMemo(
    () =>
      resolution.ok
        ? modelOpenReferenceLinkedPreviewBodyFingerprintV2({
            modelId,
            modelContentRevision,
            inputFingerprint,
            basisKind: resolution.basis.basisKind,
          })
        : JSON.stringify([modelId, modelContentRevision, inputFingerprint, null]),
    [inputFingerprint, modelContentRevision, modelId, resolution],
  );
  const owner = useMemo(() => createMeasurementOpenReferenceDisplaySnapshotOwnerV2(), []);
  const resolvedBuildDependencies = useMemo(
    () => Object.freeze({ ...DEFAULT_BUILD_DEPENDENCIES, ...buildDependencies }),
    [buildDependencies],
  );
  const [draftSelection, setDraftSelection] = useState<LinkedPoseSelectionV2>(
    LINKED_A_REST_SELECTION_V2,
  );
  const [appliedSelection, setAppliedSelection] = useState<LinkedPoseSelectionV2 | null>(null);
  const [built, setBuilt] = useState<LinkedBuiltPreviewV2 | null>(null);
  const [updateStatus, setUpdateStatus] = useState<LinkedPreviewUpdateStatusV2>('idle');
  const [stageStatus, setStageStatus] = useState<'idle' | MeasurementSurfaceStageStatus>('idle');
  const [updateError, setUpdateError] = useState('');
  const [stageError, setStageError] = useState('');
  const generationRef = useRef(0);
  const buildTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const currentBindingRef = useRef<ModelOpenReferenceLinkedPreviewCurrentBindingV2 | null>(null);

  const cancelPoseBuild = useCallback(() => {
    generationRef.current += 1;
    owner.invalidate();
    currentBindingRef.current = null;
    if (buildTimerRef.current !== null) clearTimeout(buildTimerRef.current);
    buildTimerRef.current = null;
  }, [owner]);

  useEffect(() => {
    cancelPoseBuild();
    setBuilt((current) =>
      modelOpenReferenceLinkedPreviewNextBuiltV2(current, { type: 'body-invalidated' }),
    );
    setAppliedSelection(null);
    setUpdateStatus('idle');
    setStageStatus('idle');
    setUpdateError('');
    setStageError('');
  }, [bodyBuildFingerprint, cancelPoseBuild]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelPoseBuild();
    };
  }, [cancelPoseBuild]);

  const buildLinkedPreview = useCallback(
    (selection: LinkedPoseSelectionV2) => {
      if (!resolution.ok) return;
      const requestedSelection = Object.freeze({ ...selection }) as LinkedPoseSelectionV2;
      cancelPoseBuild();
      const requestedGeneration = generationRef.current;
      const requestedMeasurements = resolution.measurements;
      const requestedBasisKind = resolution.basis.basisKind;
      const requestedBodyBuildFingerprint = bodyBuildFingerprint;
      const requestedBinding: ModelOpenReferenceLinkedPreviewCurrentBindingV2 = Object.freeze({
        modelId,
        modelContentRevision,
        inputFingerprint,
        basisKind: requestedBasisKind,
        poseSelection: requestedSelection,
        sourceRevision: measurementOpenReferenceDisplaySnapshotSourceRevisionV2({
          inputFingerprint,
          basisKind: requestedBasisKind,
          poseSelection: requestedSelection,
          limbSubsetRequested:
            requestedSelection.lane === 'relax' &&
            requestedSelection.degrees === 0 &&
            requestedLimbKeys.length > 0,
        }),
      });
      currentBindingRef.current = requestedBinding;
      setBuilt((current) =>
        modelOpenReferenceLinkedPreviewNextBuiltV2(current, { type: 'pose-building' }),
      );
      setUpdateStatus('building');
      setUpdateError('');

      buildTimerRef.current = resolvedBuildDependencies.scheduleBuild(() => {
        buildTimerRef.current = null;
        if (!mountedRef.current || generationRef.current !== requestedGeneration) return;
        void (async () => {
          try {
            const result = await owner.build({
              modelId,
              modelContentRevision,
              inputFingerprint,
              basisKind: requestedBasisKind,
              measurements: requestedMeasurements,
              poseSelection: requestedSelection,
            });
            if (
              !mountedRef.current ||
              generationRef.current !== requestedGeneration ||
              result.status === 'stale'
            ) {
              return;
            }
            if (result.status === 'blocked') {
              currentBindingRef.current = null;
              setBuilt((current) =>
                modelOpenReferenceLinkedPreviewNextBuiltV2(current, { type: 'pose-blocked' }),
              );
              setUpdateStatus('error');
              setUpdateError(result.message);
              return;
            }
            if (
              !modelOpenReferenceLinkedPreviewCommitAllowedV2({
                requestedGeneration,
                currentGeneration: generationRef.current,
                mounted: mountedRef.current,
                owner,
                binding: result.snapshot.binding,
                currentBinding: currentBindingRef.current,
              })
            ) {
              return;
            }
            const snapshot = result.snapshot;
            const artifact = createMeasurementWatertightSurfaceV1({
              measurements: requestedMeasurements,
              sourceRevision: snapshot.binding.sourceRevision,
              pose: 'A',
            });
            const frame = createMeasurementBodyFrameV2({
              measurements: requestedMeasurements,
              sourceRevision: snapshot.binding.sourceRevision,
              pose: 'A',
            });
            if (
              !modelOpenReferenceLinkedPreviewCommitAllowedV2({
                requestedGeneration,
                currentGeneration: generationRef.current,
                mounted: mountedRef.current,
                owner,
                binding: snapshot.binding,
                currentBinding: currentBindingRef.current,
              })
            ) {
              return;
            }
            setBuilt((current) =>
              modelOpenReferenceLinkedPreviewNextBuiltV2(current, {
                type: 'pose-committed',
                next: {
                  artifact,
                  frame,
                  snapshot,
                  rendererDisplayMesh: snapshotMeasurementSurfaceMeshV1(snapshot.displayMesh),
                  bodyBuildFingerprint: requestedBodyBuildFingerprint,
                },
              }),
            );
            setAppliedSelection(Object.freeze({ ...snapshot.pose.input }));
            setStageStatus('initializing');
            setUpdateStatus('idle');
            setUpdateError('');
            setStageError('');
          } catch (reason: unknown) {
            if (!mountedRef.current || generationRef.current !== requestedGeneration) return;
            currentBindingRef.current = null;
            setUpdateStatus('error');
            setUpdateError(reason instanceof Error ? reason.message : 'Preview build failed.');
          }
        })();
      });
    },
    [
      bodyBuildFingerprint,
      cancelPoseBuild,
      inputFingerprint,
      modelContentRevision,
      modelId,
      owner,
      requestedLimbKeys.length,
      resolution,
      resolvedBuildDependencies,
    ],
  );

  const currentBuilt = built?.bodyBuildFingerprint === bodyBuildFingerprint ? built : null;
  useEffect(() => {
    if ((!card && !workbench) || !resolution.ok || currentBuilt || updateStatus !== 'idle') return;
    buildLinkedPreview(LINKED_A_REST_SELECTION_V2);
  }, [buildLinkedPreview, card, currentBuilt, resolution.ok, updateStatus, workbench]);

  const coverage = modelOpenReferencePreviewCoverageV1(
    currentBuilt ? { status: 'uniform-height' } : null,
    currentBuilt
      ? {
          status: currentBuilt.snapshot.waistHip.status,
          representedGeometricProxies: currentBuilt.snapshot.waistHip.representedGeometricProxies,
        }
      : null,
  );
  const limbOutcome = linkedPoseLimbOutcomeV2(
    currentBuilt?.snapshot ?? null,
    currentBuilt?.snapshot.pose.input ?? draftSelection,
    requestedLimbKeys,
  );
  const controlStatus: ModelOpenReferenceLinkedPoseControlStatusV2 =
    updateStatus === 'building'
      ? 'building'
      : updateStatus === 'error'
        ? 'error'
        : currentBuilt &&
            !modelOpenReferenceLinkedPoseSelectionEqualV2(draftSelection, appliedSelection)
          ? 'pending'
          : 'idle';
  const status: PreviewStatus =
    updateStatus === 'building' ? 'building' : updateStatus === 'error' ? 'error' : stageStatus;

  const handleDraftChange = (selection: LinkedPoseSelectionV2) => {
    const transition = modelOpenReferenceLinkedPreviewDraftTransitionV2({
      currentStatus: updateStatus,
      nextDraftSelection: selection,
      appliedSelection,
      hasBuiltPreview: currentBuilt !== null,
    });
    if (transition.cancelActiveBuild) {
      cancelPoseBuild();
    }
    setUpdateStatus(transition.nextUpdateStatus);
    setUpdateError(transition.nextUpdateError);
    setDraftSelection(Object.freeze({ ...selection }));
  };

  return (
    <div
      className={
        card
          ? 'relative flex h-full min-h-0 flex-col'
          : workbench
            ? 'flex min-h-0 flex-col gap-2'
            : 'flex flex-col gap-stack'
      }
      data-testid='model-open-reference-preview'
      data-pose-controls='linked-v2'
      data-preview-variant={variant}
      data-render-mode={card ? 'on-demand' : undefined}
    >
      {card ? (
        <Text
          component='p'
          size='nano'
          variant='label'
          className='absolute right-1 bottom-1 left-1 z-10 border border-borderColor bg-bgColor p-1 leading-tight'
        >
          visual reference only · not proof of garment fit
        </Text>
      ) : !workbench ? (
        <CalloutBox tone='note'>
          <Text component='p' size='micro'>
            <b>visual reference only</b> · {coverage.message}
          </Text>
          <Text component='p' size='micro' className='mt-1'>
            Linked pose controls are discrete display settings. They are not proof of garment fit
            and are never used as collision authority.
          </Text>
          <Text component='p' size='micro' className='mt-1 font-mono'>
            actualRenderedGarmentPairEvaluated=false · fitClaimEligible=false ·
            runtimeCollisionEligible=false
          </Text>
        </CalloutBox>
      ) : null}

      {!resolution.ok ? (
        card ? (
          <div
            role='alert'
            className='flex h-full min-h-0 items-center justify-center border border-borderColor p-3 text-center'
          >
            <Text component='p' size='micro' variant='errorLabel'>
              3D preview unavailable · required measurements are incomplete
            </Text>
          </div>
        ) : (
          <CalloutBox tone='warning'>
            <Text component='p' size='micro'>
              <b>preview blocked</b> · enter a plausible value for every required mannequin
              measurement.
            </Text>
            <ul className='mt-1 grid gap-0.5 md:grid-cols-2'>
              {resolution.diagnostics.map((diagnostic, index) => (
                <li
                  key={diagnosticKey(diagnostic.code, diagnostic.canonicalKey, index)}
                  className='text-micro'
                >
                  ! {modelOpenReferencePreviewDiagnosticMessageV1(diagnostic)}
                </li>
              ))}
            </ul>
          </CalloutBox>
        )
      ) : (
        <>
          {!card ? (
            <ModelOpenReferenceLinkedPoseControlV2
              draftSelection={draftSelection}
              appliedSelection={appliedSelection}
              hasBuiltPreview={currentBuilt !== null}
              status={controlStatus}
              onDraftChange={handleDraftChange}
              onApply={buildLinkedPreview}
            />
          ) : null}

          <Text
            component='p'
            size='micro'
            className='sr-only'
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-testid='model-open-reference-proxy-outcome'
          >
            {coverage.proxyLabel}. {coverage.warning ?? coverage.message}
          </Text>

          {!card ? (
            <div className='flex flex-wrap items-center justify-between gap-stack'>
              <div className='flex flex-wrap items-center gap-2'>
                {!workbench ? <Pill tone='ink'>basis {resolution.basis.basisKind}</Pill> : null}
                {!workbench ? (
                  <>
                    <Pill tone={coverage.status === 'fallback-uniform' ? 'warn' : 'attention'}>
                      {coverage.label}
                    </Pill>
                    <Pill
                      tone={
                        coverage.proxyStatus === 'represented'
                          ? 'ok'
                          : coverage.proxyStatus === 'pending'
                            ? 'mut'
                            : coverage.proxyStatus === 'partial'
                              ? 'attention'
                              : 'warn'
                      }
                    >
                      {coverage.proxyLabel}
                    </Pill>
                    <Pill tone={limbOutcomeTone(limbOutcome.status)}>{limbOutcome.label}</Pill>
                  </>
                ) : null}
                <Pill tone={statusTone(status)}>{status}</Pill>
              </div>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                className='cursor-pointer'
                disabled={updateStatus === 'building'}
                onClick={() => buildLinkedPreview(draftSelection)}
              >
                {currentBuilt ? 'rebuild preview' : 'build preview'}
              </Button>
            </div>
          ) : null}

          {!workbench &&
            !card &&
            resolution.basis.diagnostics.map((diagnostic) => (
              <Text
                key={diagnostic.code}
                component='p'
                size='micro'
                variant='label'
                className='leading-tight'
              >
                {diagnostic.message}
              </Text>
            ))}

          {!workbench && !card && coverage.warning && (
            <CalloutBox tone='warning'>
              <Text component='p' size='micro'>
                <b>proxy boundary</b> · {coverage.warning}
              </Text>
            </CalloutBox>
          )}

          {!workbench && !card && limbOutcome.warning && (
            <CalloutBox tone='warning'>
              <Text component='p' size='micro'>
                <b>limb proxy boundary</b> · {limbOutcome.warning}
              </Text>
            </CalloutBox>
          )}

          <Text
            component='p'
            size='micro'
            className='sr-only'
            role='status'
            aria-live='polite'
            aria-atomic='true'
            data-testid='model-open-reference-limb-outcome'
          >
            {limbOutcome.label}. {limbOutcome.warning ?? limbOutcome.message}
          </Text>

          <Text
            component='p'
            size='micro'
            className={card && status !== 'error' ? 'sr-only' : undefined}
            variant={status === 'error' ? 'errorLabel' : 'label'}
            role={status === 'error' ? 'alert' : 'status'}
            aria-live={status === 'error' ? 'assertive' : 'polite'}
            aria-atomic='true'
            data-testid='model-open-reference-preview-status'
          >
            {updateStatus === 'building' && currentBuilt
              ? `Updating pose; showing preview ${modelOpenReferenceLinkedPoseSelectionLabelV2(appliedSelection ?? LINKED_A_REST_SELECTION_V2)} until ready.`
              : updateStatus === 'building'
                ? 'Building the measurement-driven preview.'
                : updateStatus === 'error' && currentBuilt
                  ? `Preview update failed: ${updateError} Previous preview pose remains visible.`
                  : updateStatus === 'error'
                    ? `Preview failed: ${updateError}`
                    : stageStatus === 'idle'
                      ? card
                        ? 'Building the measurement-driven preview.'
                        : 'Preview not built. Select BUILD PREVIEW to render it.'
                      : stageStatus === 'initializing'
                        ? 'Preparing the interactive 3D view.'
                        : stageStatus === 'ready'
                          ? card
                            ? 'Preview ready.'
                            : 'Preview ready. Drag to orbit and use the wheel to zoom.'
                          : `Preview failed: ${stageError}`}
          </Text>

          {currentBuilt && (
            <Suspense
              fallback={<SkeletonBlocks count={1} height={card ? 240 : 320} className='w-full' />}
            >
              <MeasurementWatertightSurfaceV1Stage
                artifact={currentBuilt.artifact}
                frame={currentBuilt.frame}
                lod='display'
                displayMeshOverride={currentBuilt.rendererDisplayMesh}
                viewPreset={viewPreset}
                overlays={DISPLAY_OVERLAYS}
                interactive={!card}
                exclusiveContextGroup={card ? 'model-card-preview' : undefined}
                accessibleLabel={card ? '3D mannequin preview for this model' : undefined}
                patternPieceOverlay={patternPieceOverlay}
                className={
                  card
                    ? 'pointer-events-none h-full min-h-0 w-full border border-hairline'
                    : 'h-[42vh] min-h-80 max-h-[32rem] border border-hairline'
                }
                onStatus={(nextStatus, nextError) => {
                  setStageStatus(nextStatus);
                  setStageError(nextError ?? '');
                }}
                onRenderCount={NOOP}
              />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}

export function ModelOpenReferencePreviewFromInput(props: ModelOpenReferencePreviewFromInputProps) {
  return props.poseControls === 'full-body-v9' ? (
    <ModelOpenReferenceFullBodyPreviewV9 {...props} />
  ) : props.poseControls === 'full-body-v8' ? (
    <ModelOpenReferenceFullBodyPreviewV8 {...props} />
  ) : props.poseControls === 'full-body-v7' ? (
    <ModelOpenReferenceFullBodyPreviewV7 {...props} />
  ) : props.poseControls === 'full-body-v6' ? (
    <ModelOpenReferenceFullBodyPreviewV6 {...props} />
  ) : props.poseControls === 'full-body-v5' ? (
    <ModelOpenReferenceFullBodyPreviewV5 {...props} />
  ) : props.poseControls === 'full-body-v4' ? (
    <ModelOpenReferenceFullBodyPreviewV4 {...props} />
  ) : props.poseControls === 'full-body-v3' ? (
    <ModelOpenReferenceFullBodyPreviewV3 {...props} />
  ) : props.poseControls === 'linked-v2' ? (
    <ModelOpenReferenceLinkedPreviewV2 {...props} />
  ) : (
    <ModelOpenReferencePresetPreviewV1 {...props} />
  );
}

/** Existing editable-model adapter. The form remains the sole owner of gender and measurements. */
export function ModelOpenReferencePreview(props: ModelOpenReferencePreviewProps) {
  const { control } = useFormContext<ModelFormData>();
  const gender = useWatch({ control, name: 'gender' }) as common_GenderEnum | '' | undefined;
  const measurements =
    (useWatch({ control, name: 'measurements' }) as ModelFormData['measurements']) ?? {};
  const input = useMemo<ModelOpenReferencePreviewInputV1>(
    () => ({
      gender: gender ? (gender as common_GenderEnum) : undefined,
      measurements,
    }),
    [gender, measurements],
  );

  return <ModelOpenReferencePreviewFromInput {...props} input={input} />;
}
