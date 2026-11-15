export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_V1 =
  'measurement-open-reference-display-pose/v1' as const;

export type MeasurementOpenReferenceDisplayPosePresetIdV1 =
  | 'a-rest'
  | 'near-t'
  | 'relaxed-symmetric';

export interface MeasurementOpenReferenceDisplayPosePresetV1 {
  readonly id: MeasurementOpenReferenceDisplayPosePresetIdV1;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
}

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_PRESETS_V1 = Object.freeze([
  Object.freeze({
    id: 'a-rest' as const,
    label: 'A-rest',
    shortLabel: 'A-rest',
    description: 'Default shaped display mesh. No pose assets are loaded.',
  }),
  Object.freeze({
    id: 'near-t' as const,
    label: 'Bounded near-T',
    shortLabel: 'Near-T',
    description: 'Symmetric 25 degree upper-arm display rotation.',
  }),
  Object.freeze({
    id: 'relaxed-symmetric' as const,
    label: 'Relaxed symmetric',
    shortLabel: 'Relaxed',
    description: 'Mild symmetric shoulder and forearm display rotation.',
  }),
] satisfies readonly MeasurementOpenReferenceDisplayPosePresetV1[]);

export const MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1 = Object.freeze({
  version: MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_V1,
  runtimeRevision: 'makehuman-repaired-display-pose-runtime/v1',
  rigAssetPath: 'src/assets/cloth/makehuman-hm08-repaired-core-rig-v1.bin',
  rigByteLength: 402_738,
  rigSha256: 'be638f3c26e8d2385c2f36c2b5104854629bc080379f369f22c3d720d2bc79f3',
  anchorAssetPath: 'src/assets/cloth/makehuman-hm08-repaired-waist-hip-rig-anchor-deltas-v1.bin',
  anchorByteLength: 62_720,
  anchorSha256: '8075c8862f71b9f7a3f698691bee10a9d6a7784f6e91d9d05c2edda6afc1b345',
  torsoDirectionBundleSha256: 'a59b351473ccb301dc06ec810ee8007c74e9568dfc86bbb60b7a707fd074b4e5',
  basisAssetRevision: 'makehuman-open-reference-basis-assets/repaired-v1',
  productionDisplayRuntimeApproved: true,
  displayOnly: true,
  canonicalMeasurementSemanticMatchClaimed: false,
  anatomicalTapePathEquivalent: false,
  fitClaimEligible: false,
  runtimeCollisionEligible: false,
  collisionCandidateEligible: false,
});

export function measurementOpenReferenceDisplayPosePresetV1(
  id: MeasurementOpenReferenceDisplayPosePresetIdV1,
): MeasurementOpenReferenceDisplayPosePresetV1 {
  const preset = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_PRESETS_V1.find(
    (candidate) => candidate.id === id,
  );
  if (!preset) throw new Error(`Unsupported display pose preset ${String(id)}.`);
  return preset;
}

export function displayPoseHashBoundSourceRevisionV1(
  sourceRevision: string,
  presetId: MeasurementOpenReferenceDisplayPosePresetIdV1,
): string {
  const metadata = MEASUREMENT_OPEN_REFERENCE_DISPLAY_POSE_RUNTIME_METADATA_V1;
  return `${sourceRevision};displayPoseRevision=${metadata.runtimeRevision};displayPosePreset=${presetId};displayPoseRigSha256=${metadata.rigSha256};displayPoseAnchorSha256=${metadata.anchorSha256}`;
}
