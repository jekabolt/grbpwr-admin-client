import type { common_GenderEnum } from 'api/proto-http/admin';

import type { ModelOpenReferencePreviewInputV1 } from './model-open-reference-preview-input-v1';

export const MODEL_GUIDED_MEASUREMENT_PREVIEW_REQUIRED_NAMES_V1 = Object.freeze([
  'BODY_MEASUREMENT_NAME_HEIGHT',
  'BODY_MEASUREMENT_NAME_ACROSS_SHOULDER',
  'BODY_MEASUREMENT_NAME_CHEST',
  'BODY_MEASUREMENT_NAME_WAIST',
  'BODY_MEASUREMENT_NAME_HIP',
  'BODY_MEASUREMENT_NAME_SLEEVE_LENGTH',
  'BODY_MEASUREMENT_NAME_INSEAM',
] as const);

type GuidedPreviewRequiredNameV1 =
  (typeof MODEL_GUIDED_MEASUREMENT_PREVIEW_REQUIRED_NAMES_V1)[number];

/**
 * Explicit, anonymous reference body used only while the guided form is still incomplete. Values
 * entered by the operator replace these display values immediately; the reference values never
 * enter React Hook Form and therefore can never be submitted as captured measurements.
 */
export const MODEL_GUIDED_MEASUREMENT_PREVIEW_REFERENCE_V1 = Object.freeze({
  BODY_MEASUREMENT_NAME_HEIGHT: 1720,
  BODY_MEASUREMENT_NAME_ACROSS_SHOULDER: 420,
  BODY_MEASUREMENT_NAME_CHEST: 920,
  BODY_MEASUREMENT_NAME_WAIST: 740,
  BODY_MEASUREMENT_NAME_HIP: 980,
  BODY_MEASUREMENT_NAME_SLEEVE_LENGTH: 600,
  BODY_MEASUREMENT_NAME_INSEAM: 800,
} satisfies Readonly<Record<GuidedPreviewRequiredNameV1, number>>);

export interface ModelGuidedMeasurementPreviewInputResolutionV1 {
  readonly input: ModelOpenReferencePreviewInputV1;
  readonly missingRequiredNames: readonly GuidedPreviewRequiredNameV1[];
  readonly usesReferenceBody: boolean;
}

function capturedMeasurements(
  measurements: Readonly<Record<string, number | undefined>>,
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(measurements).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0,
      ),
    ),
  );
}

export function resolveModelGuidedMeasurementPreviewInputV1(input: {
  readonly gender: common_GenderEnum | null | undefined;
  readonly measurements: Readonly<Record<string, number | undefined>>;
}): ModelGuidedMeasurementPreviewInputResolutionV1 {
  const captured = capturedMeasurements(input.measurements);
  const missingRequiredNames = Object.freeze(
    MODEL_GUIDED_MEASUREMENT_PREVIEW_REQUIRED_NAMES_V1.filter((name) => captured[name] == null),
  );

  return Object.freeze({
    input: Object.freeze({
      gender: input.gender,
      measurements: Object.freeze({
        ...MODEL_GUIDED_MEASUREMENT_PREVIEW_REFERENCE_V1,
        ...captured,
      }),
    }),
    missingRequiredNames,
    usesReferenceBody: missingRequiredNames.length > 0,
  });
}
