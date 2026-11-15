import {
  adaptProjectBodyMeasurements,
  type CanonicalBodyMeasurementsMm,
  type MeasurementAdapterDiagnostic,
  type ProjectBodyMeasurementRecord,
} from './measurement-adapter';

export const MEASUREMENT_RECORD_AUDIT_VERSION = 'measurement-record-audit-v1' as const;

export type MeasurementRecordAuditGrade = 'A' | 'B' | 'C' | 'D';
export type MeasurementRecordKind = 'real-person' | 'size-persona' | 'unknown';
export type MeasurementProtocolSemanticMatch = 'exact' | 'approximate' | 'unknown';
export type PopulationFindingStatus = 'pass' | 'review' | 'strong-review';

export interface MeasurementProtocolEvidence {
  readonly protocolId: string;
  readonly semanticMatch: MeasurementProtocolSemanticMatch;
  readonly observationCount: number;
  readonly repeatabilityVerified?: boolean;
}

/**
 * A finding computed offline from a versioned population model. This module deliberately does not
 * contain population coefficients or infer them from the small project-local cohort.
 */
export interface MeasurementPopulationFinding {
  readonly source: string;
  readonly version: string;
  readonly status: PopulationFindingStatus;
  readonly message?: string;
}

export interface MeasurementRecordAuditInput {
  readonly subjectId: string;
  readonly kind?: MeasurementRecordKind;
  readonly records: readonly ProjectBodyMeasurementRecord[];
  readonly protocol?: MeasurementProtocolEvidence;
  readonly populationFindings?: readonly MeasurementPopulationFinding[];
}

export type MeasurementRecordAuditReasonCode =
  | 'adapter-error'
  | 'exact-duplicate'
  | 'near-duplicate'
  | 'population-review'
  | 'population-strong-review'
  | 'protocol-approximate'
  | 'protocol-missing'
  | 'protocol-observation-count-invalid'
  | 'protocol-unknown'
  | 'repeatability-unverified'
  | 'single-observation'
  | 'subject-id-duplicate'
  | 'subject-id-missing'
  | 'unit-suspect';

export interface MeasurementRecordAuditReason {
  readonly code: MeasurementRecordAuditReasonCode;
  readonly severity: 'info' | 'review' | 'reject';
  readonly message: string;
  readonly relatedSubjectId?: string;
}

export interface MeasurementRecordAuditResult {
  readonly subjectId: string;
  readonly kind: MeasurementRecordKind;
  readonly grade: MeasurementRecordAuditGrade;
  readonly measurements?: CanonicalBodyMeasurementsMm;
  readonly adapterDiagnostics: readonly MeasurementAdapterDiagnostic[];
  readonly populationFindings: readonly MeasurementPopulationFinding[];
  readonly reasons: readonly MeasurementRecordAuditReason[];
}

export interface MeasurementRecordDuplicatePair {
  readonly leftSubjectId: string;
  readonly rightSubjectId: string;
  readonly kind: 'exact' | 'near';
  readonly maximumDeltaMm: number;
}

export interface MeasurementRecordAuditReport {
  readonly schemaVersion: typeof MEASUREMENT_RECORD_AUDIT_VERSION;
  readonly results: readonly MeasurementRecordAuditResult[];
  readonly duplicatePairs: readonly MeasurementRecordDuplicatePair[];
}

const DUPLICATE_KEYS = [
  'heightMm',
  'shoulderBreadthMm',
  'chestCircumferenceMm',
  'waistCircumferenceMm',
  'hipCircumferenceMm',
  'armLengthMm',
  'inseamMm',
] as const satisfies readonly (keyof CanonicalBodyMeasurementsMm)[];

const NEAR_DUPLICATE_TOLERANCE_MM = 5;
const UNIT_SCALE_CANDIDATES = [0.1, 10, 1000] as const;

interface MutableAuditResult {
  subjectId: string;
  kind: MeasurementRecordKind;
  grade: MeasurementRecordAuditGrade;
  measurements?: CanonicalBodyMeasurementsMm;
  adapterDiagnostics: readonly MeasurementAdapterDiagnostic[];
  populationFindings: readonly MeasurementPopulationFinding[];
  reasons: MeasurementRecordAuditReason[];
}

function lowerToReview(result: MutableAuditResult): void {
  if (result.grade !== 'D') result.grade = 'C';
}

function reject(result: MutableAuditResult, reason: MeasurementRecordAuditReason): void {
  result.grade = 'D';
  result.reasons.push(reason);
}

function detectWholeRecordUnitScale(
  records: readonly ProjectBodyMeasurementRecord[],
): (typeof UNIT_SCALE_CANDIDATES)[number] | null {
  if (
    records.length === 0 ||
    records.some((record) => record.valueMm == null || record.value != null || record.unit != null)
  ) {
    return null;
  }

  for (const scale of UNIT_SCALE_CANDIDATES) {
    const scaled = records.map((record) => ({ ...record, valueMm: record.valueMm! * scale }));
    if (adaptProjectBodyMeasurements(scaled).ok) return scale;
  }
  return null;
}

function baseAudit(input: MeasurementRecordAuditInput): MutableAuditResult {
  const adapted = adaptProjectBodyMeasurements(input.records);
  const populationFindings = input.populationFindings ?? [];
  const result: MutableAuditResult = {
    subjectId: input.subjectId,
    kind: input.kind ?? 'unknown',
    grade: adapted.ok ? 'B' : 'D',
    ...(adapted.ok ? { measurements: adapted.measurements } : {}),
    adapterDiagnostics: adapted.diagnostics,
    populationFindings,
    reasons: [],
  };

  if (input.subjectId.trim().length === 0) {
    reject(result, {
      code: 'subject-id-missing',
      severity: 'reject',
      message: 'A non-empty subjectId is required for an auditable cohort record.',
    });
  }

  if (!adapted.ok) {
    reject(result, {
      code: 'adapter-error',
      severity: 'reject',
      message: 'The canonical measurement adapter rejected this record.',
    });
    const suspectedScale = detectWholeRecordUnitScale(input.records);
    if (suspectedScale != null) {
      result.reasons.push({
        code: 'unit-suspect',
        severity: 'review',
        message: `Applying a uniform x${suspectedScale} scale would make the record plausible; no correction was applied.`,
      });
    }
    return result;
  }

  const protocol = input.protocol;
  if (
    protocol != null &&
    (!Number.isInteger(protocol.observationCount) || protocol.observationCount <= 0)
  ) {
    reject(result, {
      code: 'protocol-observation-count-invalid',
      severity: 'reject',
      message: 'Protocol observationCount must be a positive integer.',
    });
  } else if (protocol == null || protocol.protocolId.trim().length === 0) {
    result.reasons.push({
      code: 'protocol-missing',
      severity: 'review',
      message: 'No versioned measurement protocol accompanies this record.',
    });
    lowerToReview(result);
  } else if (protocol.semanticMatch === 'approximate') {
    result.reasons.push({
      code: 'protocol-approximate',
      severity: 'review',
      message: 'At least one canonical field is only approximately matched by the source protocol.',
    });
    lowerToReview(result);
  } else if (protocol.semanticMatch === 'unknown') {
    result.reasons.push({
      code: 'protocol-unknown',
      severity: 'review',
      message: 'The source protocol has not been semantically mapped to the canonical fields.',
    });
    lowerToReview(result);
  } else if (protocol.observationCount >= 2 && protocol.repeatabilityVerified) {
    if (result.grade !== 'D') result.grade = 'A';
  } else if (protocol.observationCount >= 2) {
    result.reasons.push({
      code: 'repeatability-unverified',
      severity: 'review',
      message: 'Repeated observations exist, but their agreement has not been verified.',
    });
    lowerToReview(result);
  } else {
    result.reasons.push({
      code: 'single-observation',
      severity: 'info',
      message: 'The profile is usable but contains only one documented observation.',
    });
  }

  for (const finding of populationFindings) {
    if (finding.status === 'review') {
      result.reasons.push({
        code: 'population-review',
        severity: 'review',
        message: `${finding.source}@${finding.version}: ${finding.message ?? 'population review'}`,
      });
      lowerToReview(result);
    } else if (finding.status === 'strong-review') {
      result.reasons.push({
        code: 'population-strong-review',
        severity: 'review',
        message: `${finding.source}@${finding.version}: ${finding.message ?? 'strong population review'}`,
      });
      lowerToReview(result);
    }
  }

  return result;
}

function maximumRequiredDeltaMm(
  left: CanonicalBodyMeasurementsMm,
  right: CanonicalBodyMeasurementsMm,
): number {
  return Math.max(...DUPLICATE_KEYS.map((key) => Math.abs(left[key] - right[key])));
}

function addDuplicateReason(
  result: MutableAuditResult,
  relatedSubjectId: string,
  kind: 'exact' | 'near',
  maximumDeltaMm: number,
): void {
  result.reasons.push({
    code: kind === 'exact' ? 'exact-duplicate' : 'near-duplicate',
    severity: 'review',
    relatedSubjectId,
    message:
      kind === 'exact'
        ? `All required measurements exactly match ${relatedSubjectId}.`
        : `All required measurements are within ${maximumDeltaMm} mm of ${relatedSubjectId}.`,
  });
  lowerToReview(result);
}

/**
 * Audits a cohort without fitting any rule to that cohort. Input order is preserved, while duplicate
 * pairs are emitted in stable left-to-right order.
 */
export function auditMeasurementRecordsV1(
  inputs: readonly MeasurementRecordAuditInput[],
): MeasurementRecordAuditReport {
  const results = inputs.map(baseAudit);
  const duplicatePairs: MeasurementRecordDuplicatePair[] = [];
  const subjectIndexes = new Map<string, number[]>();

  inputs.forEach((input, index) => {
    const normalizedSubjectId = input.subjectId.trim();
    if (!normalizedSubjectId) return;
    const indexes = subjectIndexes.get(normalizedSubjectId) ?? [];
    indexes.push(index);
    subjectIndexes.set(normalizedSubjectId, indexes);
  });
  for (const [subjectId, indexes] of subjectIndexes) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      reject(results[index], {
        code: 'subject-id-duplicate',
        severity: 'reject',
        relatedSubjectId: subjectId,
        message: `subjectId ${subjectId} occurs multiple times; merge its observations before auditing.`,
      });
    }
  }

  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    const left = results[leftIndex];
    if (left.measurements == null) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      const right = results[rightIndex];
      if (right.measurements == null) continue;
      if (inputs[leftIndex].subjectId.trim() === inputs[rightIndex].subjectId.trim()) continue;
      const maximumDeltaMm = maximumRequiredDeltaMm(left.measurements, right.measurements);
      if (maximumDeltaMm > NEAR_DUPLICATE_TOLERANCE_MM) continue;
      const kind = maximumDeltaMm === 0 ? 'exact' : 'near';
      duplicatePairs.push({
        leftSubjectId: left.subjectId,
        rightSubjectId: right.subjectId,
        kind,
        maximumDeltaMm,
      });
      addDuplicateReason(left, right.subjectId, kind, maximumDeltaMm);
      addDuplicateReason(right, left.subjectId, kind, maximumDeltaMm);
    }
  }

  return {
    schemaVersion: MEASUREMENT_RECORD_AUDIT_VERSION,
    results,
    duplicatePairs,
  };
}
