import { CANONICAL_MEASUREMENT_SIZE_RECORDS } from 'lib/cloth/body/measurement-body-synthetic-corpus';
import type { MeasurementOpenReferenceDisplaySnapshotRequestV1 } from 'lib/cloth/body/measurement-open-reference-display-snapshot-owner-v1';

const mediumRecord = CANONICAL_MEASUREMENT_SIZE_RECORDS.find(
  ({ id }) => id === 'canonical-size-medium',
);

if (!mediumRecord) throw new Error('Canonical medium measurement record is missing.');

/** Shared request data only; importing it does not load the research garment preview owner. */
export const BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 = Object.freeze({
  modelId: 'beta-skirt-reference-neutral-v1',
  modelContentRevision: 'beta-skirt-reference-neutral-v1:canonical-size-medium',
  inputFingerprint: 'canonical-size-medium:measurement-open-reference-display-v1',
  basisKind: 'neutral' as const,
  measurements: mediumRecord.measurements,
  posePresetId: 'a-rest' as const,
}) satisfies MeasurementOpenReferenceDisplaySnapshotRequestV1;
