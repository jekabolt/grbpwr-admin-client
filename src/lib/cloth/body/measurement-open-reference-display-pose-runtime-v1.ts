import repairedAnchorBundleUrl from '../../../assets/cloth/makehuman-hm08-repaired-waist-hip-rig-anchor-deltas-v1.bin?url';
import repairedCoreRigBundleUrl from '../../../assets/cloth/makehuman-hm08-repaired-core-rig-v1.bin?url';
import { sha256Hex } from '../../features/sha256';

import {
  MAKEHUMAN_CORE_RIG_POSE_PRESETS_V1,
  parseMakeHumanCoreRigBundleV1,
  type MakeHumanCoreRigBundleV1,
} from './makehuman-core-rig-pose-research-v1';
import {
  deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1,
  parseMakeHumanWaistHipRigAnchorDeltaBundleV1,
  poseMakeHumanUniformWaistHipDisplayResearchV1,
  type MakeHumanWaistHipRigAnchorDeltaBundleV1,
} from './makehuman-waist-hip-rig-anchor-research-v1';
import type { CanonicalBodyMeasurementsMm } from './measurement-adapter';
import {
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1,
  MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_V1,
  type MeasurementOpenReferenceDisplayPosePresetIdV1,
} from './measurement-open-reference-display-pose-v1';
import {
  snapshotMeasurementSurfaceMeshV1,
  type MakeHumanOpenReferenceBasisV1,
} from './measurement-open-reference-display-v1';
import type { MeasurementOpenReferenceUniformWaistHipRuntimeResultV1 } from './measurement-open-reference-uniform-waist-hip-runtime-v1';
import type { MeasurementSurfaceMeshV1 } from './measurement-watertight-surface-v1';

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_V1 =
  'measurement-open-reference-display-pose-runtime/v1' as const;

interface AuthenticatedPoseBundleBytesV1 {
  readonly rig: Uint8Array;
  readonly anchors: Uint8Array;
}

export interface MeasurementOpenReferenceDisplayPoseResourcesV1 {
  readonly rig: MakeHumanCoreRigBundleV1;
  readonly anchors: MakeHumanWaistHipRigAnchorDeltaBundleV1;
}

type PoseFetchV1 = (
  input: string | URL,
  init?: { readonly credentials?: 'same-origin' },
) => Promise<Response>;
type PoseDigestV1 = (input: Uint8Array) => Promise<string>;

async function fetchAuthenticatedAssetV1(options: {
  readonly url: string;
  readonly label: string;
  readonly expectedByteLength: number;
  readonly expectedSha256: string;
  readonly fetchImpl: PoseFetchV1;
  readonly digest: PoseDigestV1;
}): Promise<Uint8Array> {
  const response = await options.fetchImpl(options.url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${options.label} request failed (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== options.expectedByteLength) {
    throw new Error(`${options.label} byte length authentication failed.`);
  }
  const digest = await options.digest(bytes);
  if (digest !== options.expectedSha256) {
    throw new Error(`${options.label} SHA-256 authentication failed.`);
  }
  return bytes;
}

/**
 * Owns one private authenticated-byte promise. Parsed TypedArrays are never cached or exposed:
 * every successful call materializes fresh owned rig/anchor views from the sealed bytes. A failed
 * request, digest or parse clears the promise so REBUILD PREVIEW can retry.
 */
export function createMakeHumanDisplayPoseResourceLoaderV1(options?: {
  readonly rigUrl?: string;
  readonly anchorUrl?: string;
  readonly fetchImpl?: PoseFetchV1;
  readonly digest?: PoseDigestV1;
}): () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1> {
  const fetchImpl: PoseFetchV1 =
    options?.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
  const digest = options?.digest ?? sha256Hex;
  let authenticatedBundleBytePromise: Promise<AuthenticatedPoseBundleBytesV1> | null = null;

  return async () => {
    const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
    authenticatedBundleBytePromise ??= Promise.all([
      fetchAuthenticatedAssetV1({
        url: options?.rigUrl ?? repairedCoreRigBundleUrl,
        label: 'Display pose rig bundle',
        expectedByteLength: metadata.rigByteLength,
        expectedSha256: metadata.rigSha256,
        fetchImpl,
        digest,
      }),
      fetchAuthenticatedAssetV1({
        url: options?.anchorUrl ?? repairedAnchorBundleUrl,
        label: 'Display pose anchor bundle',
        expectedByteLength: metadata.anchorByteLength,
        expectedSha256: metadata.anchorSha256,
        fetchImpl,
        digest,
      }),
    ])
      .then(([rig, anchors]) => Object.freeze({ rig, anchors }))
      .catch((reason: unknown) => {
        authenticatedBundleBytePromise = null;
        throw reason;
      });

    try {
      const privateAuthenticatedBytes = await authenticatedBundleBytePromise;
      const rig = parseMakeHumanCoreRigBundleV1(privateAuthenticatedBytes.rig);
      const anchors = parseMakeHumanWaistHipRigAnchorDeltaBundleV1(
        privateAuthenticatedBytes.anchors,
        {
          byteLength: metadata.anchorByteLength,
          sourceRigBundleSha256: metadata.rigSha256,
          sourceTorsoBundleSha256: metadata.torsoDirectionBundleSha256,
        },
      );
      return Object.freeze({ rig, anchors });
    } catch (reason: unknown) {
      authenticatedBundleBytePromise = null;
      throw reason;
    }
  };
}

const loadProductionPoseResourcesV1 = createMakeHumanDisplayPoseResourceLoaderV1();

export interface MeasurementOpenReferenceDisplayPoseRuntimeResultV1 {
  readonly version: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_V1;
  readonly contractVersion: typeof MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_V1;
  readonly presetId: Exclude<MeasurementOpenReferenceDisplayPosePresetIdV1, 'a-rest'>;
  readonly displayMesh: MeasurementSurfaceMeshV1;
  readonly maximumJointPivotResidualM: number;
  readonly source: {
    readonly rigSha256: string;
    readonly anchorSha256: string;
  };
  readonly claims: {
    readonly displayOnly: true;
    readonly canonicalMeasurementSemanticMatchClaimed: false;
    readonly anatomicalTapePathEquivalent: false;
    readonly fitClaimEligible: false;
    readonly runtimeCollisionEligible: false;
    readonly collisionCandidateEligible: false;
  };
}

const POSE_CLAIMS = Object.freeze({
  displayOnly: true as const,
  canonicalMeasurementSemanticMatchClaimed: false as const,
  anatomicalTapePathEquivalent: false as const,
  fitClaimEligible: false as const,
  runtimeCollisionEligible: false as const,
  collisionCandidateEligible: false as const,
});

/** Applies pose only after the caller has produced the final bounded waist/hip display mesh. */
export async function createMeasurementOpenReferenceDisplayPoseRuntimeV1(options: {
  readonly basis: MakeHumanOpenReferenceBasisV1;
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly proxyRuntime: MeasurementOpenReferenceUniformWaistHipRuntimeResultV1;
  readonly presetId: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly loadResources?: () => Promise<MeasurementOpenReferenceDisplayPoseResourcesV1>;
}): Promise<MeasurementOpenReferenceDisplayPoseRuntimeResultV1> {
  if (options.presetId === 'a-rest') {
    throw new Error('A-rest must bypass the display pose runtime.');
  }
  if (
    options.proxyRuntime.openReference.provenance.basis.kind !== options.basis.kind ||
    options.proxyRuntime.displayMesh.positions.length !==
      options.basis.positionsSourceUnits.length ||
    options.proxyRuntime.displayMesh.indices.length !== options.basis.indices.length
  ) {
    throw new Error('Display pose basis and shaped display mesh do not match.');
  }
  const preset = MAKEHUMAN_CORE_RIG_POSE_PRESETS_V1.find(
    (candidate) => candidate.id === options.presetId,
  );
  if (!preset || preset.id === 'a-rest') {
    throw new Error(`Display pose preset ${String(options.presetId)} is not allowed.`);
  }
  const resources = await (options.loadResources ?? loadProductionPoseResourcesV1)();
  const anchorsM = deriveMakeHumanUniformWaistHipRigAnchorsMResearchV1({
    rigBundle: resources.rig,
    anchorDeltaBundle: resources.anchors,
    basisKind: options.basis.kind,
    sourceMinimumY: options.basis.sourceMinimumY,
    sourceMaximumY: options.basis.sourceMaximumY,
    heightMm: options.measurements.heightMm,
    modeResults: options.proxyRuntime.modeResults,
  });
  const posed = poseMakeHumanUniformWaistHipDisplayResearchV1({
    rigBundle: resources.rig,
    positionsM: options.proxyRuntime.displayMesh.positions,
    anchorsM,
    preset,
  });
  if (posed.maximumJointPivotResidualM > 1e-7) {
    throw new Error('Display pose joint-pivot continuity gate failed.');
  }
  const displayMesh = snapshotMeasurementSurfaceMeshV1({
    ...options.proxyRuntime.displayMesh,
    positions: posed.positionsM,
  });
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return Object.freeze({
    version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_V1,
    contractVersion: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_V1,
    presetId: preset.id,
    displayMesh,
    maximumJointPivotResidualM: posed.maximumJointPivotResidualM,
    source: Object.freeze({
      rigSha256: metadata.rigSha256,
      anchorSha256: metadata.anchorSha256,
    }),
    claims: POSE_CLAIMS,
  });
}
