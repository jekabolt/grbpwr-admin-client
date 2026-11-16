import type {
  CanonicalBodyMeasurementsMm,
  CanonicalMeasurementKey,
} from 'lib/cloth/body/measurement-adapter';

export const MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_CONTRACT_V1 =
  'model-open-reference-measurement-status-contract/v1' as const;

export type ModelOpenReferenceMeasurementStatusV1 =
  | 'exact'
  | 'boundedProxy'
  | 'modifierOnly'
  | 'notApplied'
  | 'unsupported';

export type ModelOpenReferenceRawMeasurementFieldV1 = never;

export type ModelOpenReferenceMeasurementFieldIdV1 =
  | CanonicalMeasurementKey
  | ModelOpenReferenceRawMeasurementFieldV1;

export interface ModelOpenReferenceMeasurementStatusContractEntryV1 {
  readonly fieldId: ModelOpenReferenceMeasurementFieldIdV1;
  readonly label: string;
  readonly source:
    | Readonly<{ readonly kind: 'canonical'; readonly key: CanonicalMeasurementKey }>
    | Readonly<{ readonly kind: 'raw'; readonly key: string }>;
  readonly capability: Exclude<ModelOpenReferenceMeasurementStatusV1, 'notApplied'>;
}

export interface ModelOpenReferenceMeasurementFieldStatusV1
  extends ModelOpenReferenceMeasurementStatusContractEntryV1 {
  readonly requested: boolean;
  /** True only when the field directly owns a visible exact/proxy response. */
  readonly directlyApplied: boolean;
  readonly status: ModelOpenReferenceMeasurementStatusV1;
}

const DIRECT_EXACT = new Set<CanonicalMeasurementKey>(['heightMm']);

const DIRECT_BOUNDED_PROXY = new Set<CanonicalMeasurementKey>([
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'underBustCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
]);

const MODIFIER_ONLY = new Set<CanonicalMeasurementKey>([
  'hpsToWaistFrontMm',
  'acrossFrontMm',
  'acrossBackMm',
]);

const CANONICAL_FIELD_ORDER = Object.freeze([
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'underBustCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'highHipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
  'neckBaseCircumferenceMm',
  'bicepCircumferenceMm',
  'wristCircumferenceMm',
  'thighCircumferenceMm',
  'kneeCircumferenceMm',
  'calfCircumferenceMm',
  'ankleCircumferenceMm',
  'hpsToWaistFrontMm',
  'cbNeckToWaistMm',
  'acrossFrontMm',
  'acrossBackMm',
  'hpsHeightMm',
  'cfNeckToWaistMm',
  'waistHeightMm',
  'waistToHighHipMm',
  'waistToHipMm',
  'chestDepthMm',
  'waistDepthMm',
  'hipDepthMm',
  'shoulderLengthMm',
  'shoulderDropMm',
  'armscyeDepthMm',
  'armscyeCircumferenceMm',
  'bustApexToApexMm',
  'hpsToBustApexMm',
] as const satisfies readonly CanonicalMeasurementKey[]);

function label(key: string): string {
  return key
    .replace(/Mm$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace('arm length', 'arm length centerline proxy');
}

function canonicalCapability(
  key: CanonicalMeasurementKey,
): Exclude<ModelOpenReferenceMeasurementStatusV1, 'notApplied'> {
  if (DIRECT_EXACT.has(key)) return 'exact';
  if (DIRECT_BOUNDED_PROXY.has(key)) return 'boundedProxy';
  if (MODIFIER_ONLY.has(key)) return 'modifierOnly';
  return 'unsupported';
}

export const MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1 = Object.freeze([
  ...CANONICAL_FIELD_ORDER.map((key) =>
    Object.freeze({
      fieldId: key,
      label: label(key),
      source: Object.freeze({ kind: 'canonical' as const, key }),
      capability: canonicalCapability(key),
    }),
  ),
]) satisfies readonly ModelOpenReferenceMeasurementStatusContractEntryV1[];

function populated(value: number | undefined): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Resolves all 34 canonical project fields on every build. A capability describes what the beta can do;
 * `notApplied` is reserved for a requested direct control that rolled back or was unavailable.
 * Modifier-only inputs may influence another proxy, but never claim their own measured closure.
 */
export function resolveModelOpenReferenceMeasurementFieldStatusesV1(options: {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly rawMeasurements: Readonly<Record<string, number | undefined>>;
  readonly representedVisualControls: readonly CanonicalMeasurementKey[];
  readonly limitedVisualControls?: readonly CanonicalMeasurementKey[];
}): readonly ModelOpenReferenceMeasurementFieldStatusV1[] {
  const represented = new Set<CanonicalMeasurementKey>(options.representedVisualControls);
  const limited = new Set<CanonicalMeasurementKey>(options.limitedVisualControls ?? []);

  const fields = Object.freeze(
    MODEL_OPEN_REFERENCE_MEASUREMENT_STATUS_FIELDS_V1.map((entry) => {
      const requested =
        entry.source.kind === 'canonical'
          ? populated(options.measurements[entry.source.key])
          : populated(options.rawMeasurements[entry.source.key]);
      const directlyApplied =
        entry.source.kind === 'canonical' &&
        requested &&
        (represented.has(entry.source.key) || limited.has(entry.source.key));
      const status =
        requested &&
        entry.source.kind === 'canonical' &&
        (entry.capability === 'exact' || entry.capability === 'boundedProxy') &&
        !directlyApplied
          ? ('notApplied' as const)
          : entry.capability;

      return Object.freeze({ ...entry, requested, directlyApplied, status });
    }),
  );
  if (fields.some((field) => field.status === 'unsupported' && field.directlyApplied)) {
    throw new Error('Unsupported mannequin measurements cannot own a direct visual response.');
  }
  return fields;
}
