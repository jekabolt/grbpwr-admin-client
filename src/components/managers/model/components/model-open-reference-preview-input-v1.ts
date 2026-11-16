import type { common_GenderEnum } from 'api/proto-http/admin';
import {
  adaptProjectBodyMeasurements,
  PROJECT_BODY_MEASUREMENT_ALIASES,
  type CanonicalBodyMeasurementsMm,
  type MeasurementAdapterDiagnostic,
  type MeasurementAlias,
  type ProjectBodyMeasurementRecord,
} from 'lib/cloth/body/measurement-adapter';
import {
  bridgeProjectModelGenderToOpenReferenceDisplayV1,
  type ProjectModelOpenReferenceDisplayBridgeResultV1,
} from 'lib/cloth/compiler/project-model-open-reference-display-bridge-v1';

export const MODEL_OPEN_REFERENCE_PREVIEW_INPUT_V1 =
  'model-open-reference-preview-input/v1' as const;

export interface ModelOpenReferencePreviewInputV1 {
  readonly gender: common_GenderEnum | null | undefined;
  readonly measurements: Readonly<Record<string, number | undefined>>;
}

interface ModelOpenReferencePreviewResolutionBaseV1 {
  readonly version: typeof MODEL_OPEN_REFERENCE_PREVIEW_INPUT_V1;
  readonly role: 'DISPLAY_ONLY';
  readonly basis: ProjectModelOpenReferenceDisplayBridgeResultV1;
  readonly diagnostics: readonly MeasurementAdapterDiagnostic[];
}

export type ModelOpenReferencePreviewResolutionV1 =
  | (ModelOpenReferencePreviewResolutionBaseV1 & {
      readonly ok: true;
      readonly measurements: CanonicalBodyMeasurementsMm;
    })
  | (ModelOpenReferencePreviewResolutionBaseV1 & {
      readonly ok: false;
    });

const SUPPORTED_FORM_MEASUREMENT_NAMES = new Set(
  Object.values(PROJECT_BODY_MEASUREMENT_ALIASES)
    .flatMap((aliases) => aliases ?? [])
    .map((alias: MeasurementAlias) => String(alias).trim())
    .filter(Boolean),
);

function formMeasurementRecords(
  measurements: Readonly<Record<string, number | undefined>>,
): ProjectBodyMeasurementRecord[] {
  return Object.entries(measurements)
    .filter(
      (entry): entry is [string, number] =>
        SUPPORTED_FORM_MEASUREMENT_NAMES.has(entry[0]) &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]) &&
        entry[1] > 0,
    )
    .map(([name, valueMm]) => Object.freeze({ name, valueMm }));
}

/**
 * Resolves editable model fields into a display-only preview input. Sparse/zero form values stay
 * missing, unsupported form fields are ignored, and no measurement or gender value is inferred.
 */
export function resolveModelOpenReferencePreviewInputV1(
  input: ModelOpenReferencePreviewInputV1,
): ModelOpenReferencePreviewResolutionV1 {
  const basis = bridgeProjectModelGenderToOpenReferenceDisplayV1({ gender: input.gender });
  const adapted = adaptProjectBodyMeasurements(formMeasurementRecords(input.measurements));
  const diagnostics = Object.freeze([...adapted.diagnostics]);
  const base = {
    version: MODEL_OPEN_REFERENCE_PREVIEW_INPUT_V1,
    role: 'DISPLAY_ONLY' as const,
    basis,
    diagnostics,
  };

  if (!adapted.ok) return Object.freeze({ ...base, ok: false as const });

  return Object.freeze({
    ...base,
    ok: true as const,
    measurements: Object.freeze({ ...adapted.measurements }),
  });
}
