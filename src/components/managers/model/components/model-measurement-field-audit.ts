import {
  adaptProjectBodyMeasurements,
  PROJECT_BODY_MEASUREMENT_ALIASES,
  type CanonicalMeasurementKey,
  type MeasurementAdapterDiagnosticCode,
  type ProjectBodyMeasurementRecord,
} from 'lib/cloth/body/measurement-adapter';

export type ModelMeasurementFieldAuditCodeV1 = Extract<
  MeasurementAdapterDiagnosticCode,
  | 'ambiguous-record'
  | 'correlated-impossible'
  | 'duplicate-measurement'
  | 'invalid-value'
  | 'missing-required'
>;

export interface ModelMeasurementFieldFindingV1 {
  readonly code: ModelMeasurementFieldAuditCodeV1;
  readonly message: string;
}

export interface ModelMeasurementFieldAuditV1 {
  readonly byMeasurementName: Readonly<Record<string, readonly ModelMeasurementFieldFindingV1[]>>;
  readonly errorCount: number;
  readonly fieldCount: number;
  readonly unassignedErrorCount: number;
}

export const EMPTY_MODEL_MEASUREMENT_FIELD_AUDIT_V1: ModelMeasurementFieldAuditV1 = Object.freeze({
  byMeasurementName: Object.freeze({}),
  errorCount: 0,
  fieldCount: 0,
  unassignedErrorCount: 0,
});

const SOURCE_NAME_BY_CANONICAL_KEY = Object.freeze(
  Object.fromEntries(
    Object.entries(PROJECT_BODY_MEASUREMENT_ALIASES).flatMap(([canonicalKey, aliases]) => {
      const sourceName = aliases?.find(
        (alias): alias is string =>
          typeof alias === 'string' && alias.startsWith('BODY_MEASUREMENT_NAME_'),
      );
      return sourceName == null ? [] : [[canonicalKey, sourceName]];
    }),
  ) as Readonly<Partial<Record<CanonicalMeasurementKey, string>>>,
);

const CORRELATION_PARTNER: Readonly<Partial<Record<CanonicalMeasurementKey, string>>> =
  Object.freeze({
    shoulderBreadthMm: 'height',
    chestCircumferenceMm: 'across shoulder',
    underBustCircumferenceMm: 'chest',
    waistCircumferenceMm: 'chest',
    hipCircumferenceMm: 'chest',
    armLengthMm: 'height',
    inseamMm: 'height',
    hpsHeightMm: 'height',
    waistHeightMm: 'height',
    waistToHighHipMm: 'waist to hip',
    waistToHipMm: 'height',
  });

function findingMessage(
  code: ModelMeasurementFieldAuditCodeV1,
  canonicalKey?: CanonicalMeasurementKey,
  diagnosticMessage?: string,
): string {
  if (code === 'missing-required') return 'required for mannequin';
  if (code === 'duplicate-measurement') return 'remove the duplicate measurement entry';
  if (code === 'ambiguous-record') return 'measurement mapping is ambiguous';
  if (code === 'correlated-impossible') {
    const partner = canonicalKey == null ? undefined : CORRELATION_PARTNER[canonicalKey];
    return partner == null
      ? 'check against related measurements'
      : `check together with ${partner}`;
  }
  if (diagnosticMessage?.includes('below 62%')) return 'must be below 62% of height';
  return canonicalKey == null ? 'enter a positive measurement' : 'outside supported adult range';
}

/**
 * Reduces the canonical adapter diagnostics to field-local, value-free guidance. Input values are
 * consumed synchronously and are never copied into the returned audit object.
 */
export function auditModelMeasurementFieldsV1(
  values: Readonly<Record<string, number | undefined>>,
): ModelMeasurementFieldAuditV1 {
  const sourceNames: string[] = [];
  const records: ProjectBodyMeasurementRecord[] = [];
  for (const [name, valueMm] of Object.entries(values)) {
    if (valueMm == null || !Number.isFinite(valueMm) || valueMm <= 0) continue;
    sourceNames.push(name);
    records.push({ name, valueMm });
  }

  const diagnostics = adaptProjectBodyMeasurements(records).diagnostics.filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  const byMeasurementName: Record<string, ModelMeasurementFieldFindingV1[]> = {};
  let unassignedErrorCount = 0;

  for (const diagnostic of diagnostics) {
    const code = diagnostic.code;
    if (
      code !== 'ambiguous-record' &&
      code !== 'correlated-impossible' &&
      code !== 'duplicate-measurement' &&
      code !== 'invalid-value' &&
      code !== 'missing-required'
    ) {
      unassignedErrorCount += 1;
      continue;
    }
    const measurementName =
      (diagnostic.canonicalKey == null
        ? undefined
        : SOURCE_NAME_BY_CANONICAL_KEY[diagnostic.canonicalKey]) ??
      (diagnostic.recordIndex == null ? undefined : sourceNames[diagnostic.recordIndex]);
    if (measurementName == null) {
      unassignedErrorCount += 1;
      continue;
    }
    const finding = Object.freeze({
      code,
      message: findingMessage(code, diagnostic.canonicalKey, diagnostic.message),
    });
    const current = byMeasurementName[measurementName] ?? [];
    if (!current.some((item) => item.code === finding.code && item.message === finding.message)) {
      current.push(finding);
      byMeasurementName[measurementName] = current;
    }
  }

  const frozenByMeasurementName = Object.freeze(
    Object.fromEntries(
      Object.entries(byMeasurementName).map(([name, findings]) => [
        name,
        Object.freeze([...findings]),
      ]),
    ),
  );
  return Object.freeze({
    byMeasurementName: frozenByMeasurementName,
    errorCount: diagnostics.length,
    fieldCount: Object.keys(frozenByMeasurementName).length,
    unassignedErrorCount,
  });
}
