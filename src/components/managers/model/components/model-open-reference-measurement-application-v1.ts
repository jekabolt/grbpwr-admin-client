import {
  MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1,
  type MeasurementOpenReferenceBetaShapeKeyV1,
  type MeasurementOpenReferenceBetaShapeRuntimeResultV1,
} from 'lib/cloth/body/measurement-open-reference-beta-shape-runtime-v1';
import type {
  CanonicalBodyMeasurementsMm,
  CanonicalMeasurementKey,
} from 'lib/cloth/body/measurement-adapter';

export const MODEL_OPEN_REFERENCE_MEASUREMENT_APPLICATION_V1 =
  'model-open-reference-measurement-application/v1' as const;

const SUPPORTED = new Set<CanonicalMeasurementKey>(MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1);

const RAW_ONLY_UNSUPPORTED = Object.freeze({
  BODY_MEASUREMENT_NAME_HIGH_HIP: 'high hip',
  BODY_MEASUREMENT_NAME_KNEE: 'knee',
} as const);

export interface ModelOpenReferenceMeasurementApplicationV1 {
  readonly version: typeof MODEL_OPEN_REFERENCE_MEASUREMENT_APPLICATION_V1;
  readonly applied: readonly MeasurementOpenReferenceBetaShapeKeyV1[];
  readonly limitedBySafeRange: readonly MeasurementOpenReferenceBetaShapeKeyV1[];
  readonly notApplied: readonly MeasurementOpenReferenceBetaShapeKeyV1[];
  readonly unsupported: readonly string[];
  readonly diagnostics: readonly string[];
}

export interface ModelOpenReferenceMeasurementApplicationSummaryV1 {
  readonly status: 'partial' | 'ready';
  readonly text: string;
}

function populatedCanonicalKeys(
  measurements: CanonicalBodyMeasurementsMm,
): readonly CanonicalMeasurementKey[] {
  return Object.entries(measurements)
    .filter(
      (entry): entry is [CanonicalMeasurementKey, number] =>
        entry[0] !== 'schemaVersion' &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]) &&
        entry[1] > 0,
    )
    .map(([key]) => key);
}

function label(key: string): string {
  return key
    .replace(/Mm$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace('arm length', 'arm length centerline proxy');
}

export function modelOpenReferenceMeasurementApplicationV1(options: {
  readonly measurements: CanonicalBodyMeasurementsMm;
  readonly rawMeasurements: Readonly<Record<string, number | undefined>>;
  readonly beta: Pick<
    MeasurementOpenReferenceBetaShapeRuntimeResultV1,
    'chestShoulderDiagnostics' | 'limitedVisualControls' | 'representedVisualControls'
  > & {
    readonly fkProxyRuntime: Pick<
      MeasurementOpenReferenceBetaShapeRuntimeResultV1['fkProxyRuntime'],
      'diagnostics'
    >;
  };
}): ModelOpenReferenceMeasurementApplicationV1 {
  const requested = populatedCanonicalKeys(options.measurements);
  const represented = new Set(options.beta.representedVisualControls);
  const explicitlyLimited = new Set(options.beta.limitedVisualControls ?? []);
  const applied = MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1.filter(
    (key) => requested.includes(key) && represented.has(key),
  );
  const omitted = MEASUREMENT_OPEN_REFERENCE_BETA_SHAPE_KEYS_V1.filter(
    (key) => requested.includes(key) && !represented.has(key),
  );
  const chestShoulderRolledBack = options.beta.chestShoulderDiagnostics.some((diagnostic) =>
    [
      'beta-final-global-quality-rollback',
      'bounded-endpoint-quality-rollback',
      'combined-quality-rollback',
      'coupled-closure-rollback',
    ].includes(diagnostic),
  );
  const waistHipLimited = new Set(
    options.beta.fkProxyRuntime.diagnostics
      .filter(({ code }) => code === 'target-limited')
      .map(({ measurementKey }) => measurementKey)
      .filter((key): key is 'waistCircumferenceMm' | 'hipCircumferenceMm' => key != null),
  );
  for (const diagnostic of options.beta.fkProxyRuntime.diagnostics) {
    if (diagnostic.code === 'combined-quality-unsafe' && diagnostic.measurementKey) {
      waistHipLimited.delete(diagnostic.measurementKey);
    }
  }
  const limitedBySafeRange = omitted.filter((key) => {
    if (explicitlyLimited.has(key)) return true;
    if (key === 'waistCircumferenceMm' || key === 'hipCircumferenceMm') {
      return waistHipLimited.has(key);
    }
    return (
      !chestShoulderRolledBack &&
      [
        `${key}:target-limited-to-bounded-endpoint`,
        `${key}:target-limited-to-quality-safe-endpoint`,
      ].some((diagnostic) => options.beta.chestShoulderDiagnostics.includes(diagnostic))
    );
  });
  const limited = new Set(limitedBySafeRange);
  const notApplied = omitted.filter((key) => !limited.has(key));
  const unsupported = requested.filter((key) => !SUPPORTED.has(key)).map(label);
  for (const [rawKey, rawLabel] of Object.entries(RAW_ONLY_UNSUPPORTED)) {
    const value = options.rawMeasurements[rawKey];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      unsupported.push(rawLabel);
    }
  }

  return Object.freeze({
    version: MODEL_OPEN_REFERENCE_MEASUREMENT_APPLICATION_V1,
    applied: Object.freeze([...applied]),
    limitedBySafeRange: Object.freeze([...limitedBySafeRange]),
    notApplied: Object.freeze([...notApplied]),
    unsupported: Object.freeze([...new Set(unsupported)]),
    diagnostics: Object.freeze([
      ...options.beta.chestShoulderDiagnostics,
      ...options.beta.fkProxyRuntime.diagnostics.map(
        ({ code, measurementKey }) => `${measurementKey ?? 'waistHip'}:${code}`,
      ),
    ]),
  });
}

export function modelOpenReferenceMeasurementApplicationLabelV1(key: string): string {
  return label(key);
}

export function modelOpenReferenceMeasurementApplicationSummaryV1(
  value: ModelOpenReferenceMeasurementApplicationV1,
): ModelOpenReferenceMeasurementApplicationSummaryV1 {
  const limited = value.limitedBySafeRange.map(label);
  const notApplied = value.notApplied.map(label);
  const status =
    limited.length > 0 || notApplied.length > 0 ? ('partial' as const) : ('ready' as const);
  const primary =
    limited.length > 0
      ? `body shape partial · limited by safe range: ${limited.join(', ')}`
      : notApplied.length > 0
        ? 'body shape partial'
        : 'body shape applied';
  const omitted = notApplied.length > 0 ? ` · not applied: ${notApplied.join(', ')}` : '';
  const unsupported =
    value.unsupported.length > 0 ? ` · not modeled: ${value.unsupported.join(', ')}` : '';
  return Object.freeze({ status, text: `${primary}${omitted}${unsupported}` });
}
