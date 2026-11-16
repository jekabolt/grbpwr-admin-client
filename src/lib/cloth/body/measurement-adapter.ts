export const CANONICAL_BODY_MEASUREMENTS_VERSION = 'canonical-body-measurements-v1' as const;

export interface CanonicalBodyMeasurementsMm {
  readonly schemaVersion: typeof CANONICAL_BODY_MEASUREMENTS_VERSION;
  readonly heightMm: number;
  readonly shoulderBreadthMm: number;
  readonly chestCircumferenceMm: number;
  readonly underBustCircumferenceMm?: number;
  readonly waistCircumferenceMm: number;
  readonly hipCircumferenceMm: number;
  readonly highHipCircumferenceMm?: number;
  readonly armLengthMm: number;
  readonly inseamMm: number;
  readonly neckBaseCircumferenceMm?: number;
  readonly bicepCircumferenceMm?: number;
  readonly wristCircumferenceMm?: number;
  readonly thighCircumferenceMm?: number;
  readonly kneeCircumferenceMm?: number;
  readonly calfCircumferenceMm?: number;
  readonly ankleCircumferenceMm?: number;
  readonly hpsToWaistFrontMm?: number;
  readonly cbNeckToWaistMm?: number;
  readonly acrossFrontMm?: number;
  readonly acrossBackMm?: number;
  readonly hpsHeightMm?: number;
  readonly cfNeckToWaistMm?: number;
  readonly waistHeightMm?: number;
  readonly waistToHighHipMm?: number;
  readonly waistToHipMm?: number;
  readonly chestDepthMm?: number;
  readonly waistDepthMm?: number;
  readonly hipDepthMm?: number;
  readonly shoulderLengthMm?: number;
  readonly shoulderDropMm?: number;
  readonly armscyeDepthMm?: number;
  readonly armscyeCircumferenceMm?: number;
  readonly bustApexToApexMm?: number;
  readonly hpsToBustApexMm?: number;
}

export type CanonicalMeasurementKey = Exclude<keyof CanonicalBodyMeasurementsMm, 'schemaVersion'>;
export type MeasurementAlias = string | number;
export type CanonicalMeasurementAliasMap = Readonly<
  Partial<Record<CanonicalMeasurementKey, readonly MeasurementAlias[]>>
>;

export interface ProjectBodyMeasurementRecord {
  readonly name?: string;
  readonly code?: string;
  readonly id?: string | number;
  /** The actual project wire format uses this field and therefore needs no unit tag. */
  readonly valueMm?: number;
  /** Adapter extension for explicitly unit-tagged import records. */
  readonly value?: number;
  readonly unit?: 'mm' | 'cm' | 'm';
}

export type MeasurementAdapterDiagnosticCode =
  | 'ambiguous-alias'
  | 'ambiguous-record'
  | 'correlated-impossible'
  | 'correlated-implausible'
  | 'duplicate-measurement'
  | 'invalid-value'
  | 'missing-required'
  | 'unknown-code';

export interface MeasurementAdapterDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: MeasurementAdapterDiagnosticCode;
  readonly message: string;
  readonly recordIndex?: number;
  readonly canonicalKey?: CanonicalMeasurementKey;
}

export type MeasurementAdapterResult =
  | {
      readonly ok: true;
      readonly measurements: CanonicalBodyMeasurementsMm;
      readonly diagnostics: readonly MeasurementAdapterDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly MeasurementAdapterDiagnostic[];
    };

const REQUIRED_KEYS = [
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly CanonicalMeasurementKey[];

export const PROJECT_BODY_MEASUREMENT_ALIASES: CanonicalMeasurementAliasMap = {
  heightMm: ['BODY_MEASUREMENT_NAME_HEIGHT'],
  shoulderBreadthMm: ['BODY_MEASUREMENT_NAME_ACROSS_SHOULDER'],
  chestCircumferenceMm: ['BODY_MEASUREMENT_NAME_CHEST'],
  underBustCircumferenceMm: ['BODY_MEASUREMENT_NAME_UNDER_BUST'],
  waistCircumferenceMm: ['BODY_MEASUREMENT_NAME_WAIST'],
  hipCircumferenceMm: ['BODY_MEASUREMENT_NAME_HIP'],
  highHipCircumferenceMm: ['BODY_MEASUREMENT_NAME_HIGH_HIP'],
  armLengthMm: ['BODY_MEASUREMENT_NAME_SLEEVE_LENGTH'],
  inseamMm: ['BODY_MEASUREMENT_NAME_INSEAM'],
  neckBaseCircumferenceMm: ['BODY_MEASUREMENT_NAME_NECK_BASE'],
  bicepCircumferenceMm: ['BODY_MEASUREMENT_NAME_BICEP'],
  wristCircumferenceMm: ['BODY_MEASUREMENT_NAME_WRIST'],
  thighCircumferenceMm: ['BODY_MEASUREMENT_NAME_THIGH'],
  kneeCircumferenceMm: ['BODY_MEASUREMENT_NAME_KNEE'],
  calfCircumferenceMm: ['BODY_MEASUREMENT_NAME_CALF'],
  ankleCircumferenceMm: ['BODY_MEASUREMENT_NAME_ANKLE'],
  hpsToWaistFrontMm: ['BODY_MEASUREMENT_NAME_HPS_TO_WAIST_FRONT'],
  cbNeckToWaistMm: ['BODY_MEASUREMENT_NAME_CB_NECK_TO_WAIST'],
  acrossFrontMm: ['BODY_MEASUREMENT_NAME_ACROSS_FRONT'],
  acrossBackMm: ['BODY_MEASUREMENT_NAME_ACROSS_BACK'],
  hpsHeightMm: ['BODY_MEASUREMENT_NAME_HPS_HEIGHT'],
  cfNeckToWaistMm: ['BODY_MEASUREMENT_NAME_CF_NECK_TO_WAIST'],
  waistHeightMm: ['BODY_MEASUREMENT_NAME_WAIST_HEIGHT'],
  waistToHighHipMm: ['BODY_MEASUREMENT_NAME_WAIST_TO_HIGH_HIP'],
  waistToHipMm: ['BODY_MEASUREMENT_NAME_WAIST_TO_HIP'],
  chestDepthMm: ['BODY_MEASUREMENT_NAME_CHEST_DEPTH'],
  waistDepthMm: ['BODY_MEASUREMENT_NAME_WAIST_DEPTH'],
  hipDepthMm: ['BODY_MEASUREMENT_NAME_HIP_DEPTH'],
  shoulderLengthMm: ['BODY_MEASUREMENT_NAME_SHOULDER_LENGTH'],
  shoulderDropMm: ['BODY_MEASUREMENT_NAME_SHOULDER_DROP'],
  armscyeDepthMm: ['BODY_MEASUREMENT_NAME_ARMSCYE_DEPTH'],
  armscyeCircumferenceMm: ['BODY_MEASUREMENT_NAME_ARMSCYE_CIRCUMFERENCE'],
  bustApexToApexMm: ['BODY_MEASUREMENT_NAME_BUST_APEX_TO_APEX'],
  hpsToBustApexMm: ['BODY_MEASUREMENT_NAME_HPS_TO_BUST_APEX'],
};

export const CANONICAL_MEASUREMENT_PLAUSIBILITY_MM: Readonly<
  Record<CanonicalMeasurementKey, readonly [minimum: number, maximum: number]>
> = {
  heightMm: [1300, 2100],
  shoulderBreadthMm: [280, 600],
  chestCircumferenceMm: [600, 1600],
  underBustCircumferenceMm: [500, 1500],
  waistCircumferenceMm: [500, 1600],
  hipCircumferenceMm: [650, 1700],
  highHipCircumferenceMm: [600, 1600],
  armLengthMm: [400, 850],
  inseamMm: [500, 1100],
  neckBaseCircumferenceMm: [250, 650],
  bicepCircumferenceMm: [180, 650],
  wristCircumferenceMm: [100, 350],
  thighCircumferenceMm: [300, 1000],
  kneeCircumferenceMm: [250, 600],
  calfCircumferenceMm: [200, 700],
  ankleCircumferenceMm: [120, 450],
  hpsToWaistFrontMm: [250, 700],
  cbNeckToWaistMm: [250, 700],
  acrossFrontMm: [200, 650],
  acrossBackMm: [200, 650],
  hpsHeightMm: [1200, 2100],
  cfNeckToWaistMm: [250, 800],
  waistHeightMm: [600, 1400],
  waistToHighHipMm: [40, 250],
  waistToHipMm: [100, 400],
  chestDepthMm: [100, 500],
  waistDepthMm: [100, 500],
  hipDepthMm: [120, 550],
  shoulderLengthMm: [70, 250],
  shoulderDropMm: [1, 150],
  armscyeDepthMm: [120, 400],
  armscyeCircumferenceMm: [250, 900],
  bustApexToApexMm: [80, 400],
  hpsToBustApexMm: [100, 500],
};

/**
 * Admission ranges for bounded proxies (high hip, knee) are warnings, not whole-preview blockers.
 * Each proxy owns its own visual deformation-safety clamp and reports `limited` when it applies.
 */
const CANONICAL_MEASUREMENT_NON_FATAL_PLAUSIBILITY_KEYS = new Set<CanonicalMeasurementKey>([
  'highHipCircumferenceMm',
  'kneeCircumferenceMm',
]);

export function isCanonicalMeasurementNonFatalPlausibilityKey(
  key: CanonicalMeasurementKey,
): boolean {
  return CANONICAL_MEASUREMENT_NON_FATAL_PLAUSIBILITY_KEYS.has(key);
}

export interface CanonicalMeasurementCorrelationIssue {
  readonly keys: readonly CanonicalMeasurementKey[];
  readonly message: string;
}

/** Broad topology guards, not population statistics or fit priors. */
export function validateCanonicalMeasurementCorrelations(
  values: Readonly<Partial<Record<CanonicalMeasurementKey, number>>>,
): CanonicalMeasurementCorrelationIssue[] {
  const issues: CanonicalMeasurementCorrelationIssue[] = [];
  const ratio = (numerator: CanonicalMeasurementKey, denominator: CanonicalMeasurementKey) => {
    const a = values[numerator];
    const b = values[denominator];
    return a == null || b == null || b <= 0 ? null : a / b;
  };
  const requireRatio = (
    numerator: CanonicalMeasurementKey,
    denominator: CanonicalMeasurementKey,
    minimum: number,
    maximum: number,
  ) => {
    const value = ratio(numerator, denominator);
    if (value != null && (value < minimum || value > maximum)) {
      issues.push({
        keys: [numerator, denominator],
        message: `${numerator}/${denominator} must be within ${minimum}..${maximum} for analytical-body-v0.`,
      });
    }
  };
  requireRatio('shoulderBreadthMm', 'heightMm', 0.16, 0.34);
  requireRatio('chestCircumferenceMm', 'shoulderBreadthMm', 1.45, 3.5);
  requireRatio('underBustCircumferenceMm', 'chestCircumferenceMm', 0.55, 1.05);
  requireRatio('waistCircumferenceMm', 'chestCircumferenceMm', 0.5, 1.4);
  requireRatio('hipCircumferenceMm', 'chestCircumferenceMm', 0.65, 1.6);
  requireRatio('armLengthMm', 'heightMm', 0.24, 0.5);
  requireRatio('inseamMm', 'heightMm', 0.34, 0.62);
  requireRatio('hpsHeightMm', 'heightMm', 0.82, 1.03);
  requireRatio('waistHeightMm', 'heightMm', 0.35, 0.75);
  requireRatio('waistToHipMm', 'heightMm', 0.05, 0.26);
  if (
    values.waistToHighHipMm != null &&
    values.waistToHipMm != null &&
    values.waistToHighHipMm >= values.waistToHipMm
  ) {
    issues.push({
      keys: ['waistToHighHipMm', 'waistToHipMm'],
      message: 'waistToHighHipMm must be less than waistToHipMm.',
    });
  }
  return issues;
}

/**
 * Non-fatal topology hints. A value that trips one still reaches the mannequin, where its bounded
 * proxy clamps it; these are not population statistics, calibration or fit priors.
 */
export function validateCanonicalMeasurementCorrelationWarnings(
  values: Readonly<Partial<Record<CanonicalMeasurementKey, number>>>,
): CanonicalMeasurementCorrelationIssue[] {
  const issues: CanonicalMeasurementCorrelationIssue[] = [];
  const highHip = values.highHipCircumferenceMm;
  const waist = values.waistCircumferenceMm;
  const hip = values.hipCircumferenceMm;
  if (highHip != null && waist != null && hip != null) {
    const lower = Math.min(waist, hip);
    const upper = Math.max(waist, hip);
    if (highHip < lower || highHip > upper) {
      issues.push({
        keys: ['highHipCircumferenceMm', 'waistCircumferenceMm', 'hipCircumferenceMm'],
        message:
          'highHipCircumferenceMm is expected between waistCircumferenceMm and hipCircumferenceMm.',
      });
    }
  }
  return issues;
}

function aliasKey(alias: MeasurementAlias): string {
  return String(alias).trim();
}

function recordIdentifiers(record: ProjectBodyMeasurementRecord): string[] {
  return [record.name, record.code, record.id == null ? undefined : String(record.id)]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value, index, all) => all.indexOf(value) === index);
}

function valueInMm(record: ProjectBodyMeasurementRecord): number | null {
  const hasValueMm = record.valueMm != null;
  const hasValue = record.value != null;
  if (hasValueMm === hasValue) return null;
  if (hasValueMm) return record.unit == null || record.unit === 'mm' ? record.valueMm! : null;
  if (record.unit == null) return null;
  const factor = record.unit === 'mm' ? 1 : record.unit === 'cm' ? 10 : 1000;
  return record.value! * factor;
}

function validatePlausibility(
  values: Readonly<Partial<Record<CanonicalMeasurementKey, number>>>,
  diagnostics: MeasurementAdapterDiagnostic[],
): void {
  for (const [key, range] of Object.entries(CANONICAL_MEASUREMENT_PLAUSIBILITY_MM) as [
    CanonicalMeasurementKey,
    readonly [number, number],
  ][]) {
    const value = values[key];
    if (value == null) continue;
    const invalid = !Number.isFinite(value) || value <= 0;
    const outsideRange = value < range[0] || value > range[1];
    if (invalid || outsideRange) {
      diagnostics.push({
        severity:
          !invalid && isCanonicalMeasurementNonFatalPlausibilityKey(key) ? 'warning' : 'error',
        code: 'invalid-value',
        canonicalKey: key,
        message: `${key} must be finite and within ${range[0]}..${range[1]} mm.`,
      });
    }
  }
  if (
    values.heightMm != null &&
    values.inseamMm != null &&
    values.inseamMm >= values.heightMm * 0.62
  ) {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-value',
      canonicalKey: 'inseamMm',
      message: 'inseamMm must be below 62% of heightMm for analytical-body-v0.',
    });
  }
}

export function adaptProjectBodyMeasurements(
  records: readonly ProjectBodyMeasurementRecord[],
  aliases: CanonicalMeasurementAliasMap = PROJECT_BODY_MEASUREMENT_ALIASES,
): MeasurementAdapterResult {
  const diagnostics: MeasurementAdapterDiagnostic[] = [];
  const aliasIndex = new Map<string, Set<CanonicalMeasurementKey>>();
  for (const [key, keyAliases] of Object.entries(aliases) as [
    CanonicalMeasurementKey,
    readonly MeasurementAlias[],
  ][]) {
    for (const alias of keyAliases) {
      const normalized = aliasKey(alias);
      if (!normalized) continue;
      const keys = aliasIndex.get(normalized) ?? new Set<CanonicalMeasurementKey>();
      keys.add(key);
      aliasIndex.set(normalized, keys);
    }
  }
  for (const [alias, keys] of aliasIndex) {
    if (keys.size > 1) {
      diagnostics.push({
        severity: 'error',
        code: 'ambiguous-alias',
        message: `Alias ${alias} maps to multiple canonical measurements.`,
      });
    }
  }

  const candidates = new Map<CanonicalMeasurementKey, { valueMm: number; recordIndex: number }[]>();
  records.forEach((record, recordIndex) => {
    const identifiers = recordIdentifiers(record);
    const matches = new Set<CanonicalMeasurementKey>();
    for (const identifier of identifiers) {
      for (const key of aliasIndex.get(identifier) ?? []) matches.add(key);
    }
    if (matches.size === 0) {
      diagnostics.push({
        severity: 'warning',
        code: 'unknown-code',
        recordIndex,
        message: `Record ${recordIndex} has no explicitly mapped measurement code or id.`,
      });
      return;
    }
    if (matches.size > 1) {
      diagnostics.push({
        severity: 'error',
        code: 'ambiguous-record',
        recordIndex,
        message: `Record ${recordIndex} maps to multiple canonical measurements.`,
      });
      return;
    }
    const canonicalKey = [...matches][0];
    const converted = valueInMm(record);
    if (converted == null || !Number.isFinite(converted) || converted <= 0) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-value',
        recordIndex,
        canonicalKey,
        message: `Record ${recordIndex} must contain one positive value with an explicit unit.`,
      });
      return;
    }
    const rows = candidates.get(canonicalKey) ?? [];
    rows.push({ valueMm: converted, recordIndex });
    candidates.set(canonicalKey, rows);
  });

  const values: Partial<Record<CanonicalMeasurementKey, number>> = {};
  for (const [key, rows] of candidates) {
    if (rows.length > 1) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-measurement',
        canonicalKey: key,
        message: `${key} is supplied by multiple records.`,
      });
    } else {
      values[key] = rows[0].valueMm;
    }
  }
  for (const key of REQUIRED_KEYS) {
    if (values[key] == null) {
      diagnostics.push({
        severity: 'error',
        code: 'missing-required',
        canonicalKey: key,
        message: `Required canonical measurement ${key} is missing.`,
      });
    }
  }
  validatePlausibility(values, diagnostics);
  for (const issue of validateCanonicalMeasurementCorrelations(values)) {
    diagnostics.push({
      severity: 'error',
      code: 'correlated-impossible',
      canonicalKey: issue.keys[0],
      message: issue.message,
    });
  }
  for (const issue of validateCanonicalMeasurementCorrelationWarnings(values)) {
    diagnostics.push({
      severity: 'warning',
      code: 'correlated-implausible',
      canonicalKey: issue.keys[0],
      message: issue.message,
    });
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    diagnostics,
    measurements: {
      schemaVersion: CANONICAL_BODY_MEASUREMENTS_VERSION,
      heightMm: values.heightMm!,
      shoulderBreadthMm: values.shoulderBreadthMm!,
      chestCircumferenceMm: values.chestCircumferenceMm!,
      ...(values.underBustCircumferenceMm == null
        ? {}
        : { underBustCircumferenceMm: values.underBustCircumferenceMm }),
      waistCircumferenceMm: values.waistCircumferenceMm!,
      hipCircumferenceMm: values.hipCircumferenceMm!,
      armLengthMm: values.armLengthMm!,
      inseamMm: values.inseamMm!,
      ...(values.neckBaseCircumferenceMm == null
        ? {}
        : { neckBaseCircumferenceMm: values.neckBaseCircumferenceMm }),
      ...(values.highHipCircumferenceMm == null
        ? {}
        : { highHipCircumferenceMm: values.highHipCircumferenceMm }),
      ...(values.bicepCircumferenceMm == null
        ? {}
        : { bicepCircumferenceMm: values.bicepCircumferenceMm }),
      ...(values.wristCircumferenceMm == null
        ? {}
        : { wristCircumferenceMm: values.wristCircumferenceMm }),
      ...(values.thighCircumferenceMm == null
        ? {}
        : { thighCircumferenceMm: values.thighCircumferenceMm }),
      ...(values.kneeCircumferenceMm == null
        ? {}
        : { kneeCircumferenceMm: values.kneeCircumferenceMm }),
      ...(values.calfCircumferenceMm == null
        ? {}
        : { calfCircumferenceMm: values.calfCircumferenceMm }),
      ...(values.ankleCircumferenceMm == null
        ? {}
        : { ankleCircumferenceMm: values.ankleCircumferenceMm }),
      ...(values.hpsToWaistFrontMm == null ? {} : { hpsToWaistFrontMm: values.hpsToWaistFrontMm }),
      ...(values.cbNeckToWaistMm == null ? {} : { cbNeckToWaistMm: values.cbNeckToWaistMm }),
      ...(values.acrossFrontMm == null ? {} : { acrossFrontMm: values.acrossFrontMm }),
      ...(values.acrossBackMm == null ? {} : { acrossBackMm: values.acrossBackMm }),
      ...(values.hpsHeightMm == null ? {} : { hpsHeightMm: values.hpsHeightMm }),
      ...(values.cfNeckToWaistMm == null ? {} : { cfNeckToWaistMm: values.cfNeckToWaistMm }),
      ...(values.waistHeightMm == null ? {} : { waistHeightMm: values.waistHeightMm }),
      ...(values.waistToHighHipMm == null ? {} : { waistToHighHipMm: values.waistToHighHipMm }),
      ...(values.waistToHipMm == null ? {} : { waistToHipMm: values.waistToHipMm }),
      ...(values.chestDepthMm == null ? {} : { chestDepthMm: values.chestDepthMm }),
      ...(values.waistDepthMm == null ? {} : { waistDepthMm: values.waistDepthMm }),
      ...(values.hipDepthMm == null ? {} : { hipDepthMm: values.hipDepthMm }),
      ...(values.shoulderLengthMm == null ? {} : { shoulderLengthMm: values.shoulderLengthMm }),
      ...(values.shoulderDropMm == null ? {} : { shoulderDropMm: values.shoulderDropMm }),
      ...(values.armscyeDepthMm == null ? {} : { armscyeDepthMm: values.armscyeDepthMm }),
      ...(values.armscyeCircumferenceMm == null
        ? {}
        : { armscyeCircumferenceMm: values.armscyeCircumferenceMm }),
      ...(values.bustApexToApexMm == null ? {} : { bustApexToApexMm: values.bustApexToApexMm }),
      ...(values.hpsToBustApexMm == null ? {} : { hpsToBustApexMm: values.hpsToBustApexMm }),
    },
  };
}
