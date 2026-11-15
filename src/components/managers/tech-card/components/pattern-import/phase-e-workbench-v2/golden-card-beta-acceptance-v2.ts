import {
  evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V1,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1,
  type PatternImportDxfPhaseEGoldenCardBetaCaptureV1,
} from './golden-card-beta-acceptance-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
  type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
} from './golden-whole-card-baseline-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V2,
  type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2,
} from './golden-whole-card-baseline-v2';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_V2 =
  'pattern-import-dxf-phase-e-golden-card-beta-acceptance/2' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V2 = Object.freeze({
  ...PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V1,
  v1ProfileAndReconstructionGateReused: true,
  v2WholeCardCoverageRequired: true,
  everyPositiveSeamCardinalityEligible: true,
  exactOnlyWhenPerOperationSnapshotVerified: true,
  missingSnapshotNeverReportedUnsupported: true,
  legacyCompatibilityReceiptExposed: false,
  networkUsed: false,
  networkWriteAvailable: false,
  createsTopologyAuthority: false,
  createsAssemblyAuthority: false,
  createsPersistenceModel: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardBetaCaptureV2 = Omit<
  PatternImportDxfPhaseEGoldenCardBetaCaptureV1,
  'wholeCardCoverage'
> &
  Readonly<{
    wholeCardCoverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2 | null;
  }>;

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV2 = Omit<
  PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1,
  'schemaVersion' | 'claims'
> &
  Readonly<{
    schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_V2;
    claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V2;
  }>;

function sameCoverageBlocker(
  blocker: PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1,
): boolean {
  return (
    blocker.code === 'whole-card-coverage-invalid' ||
    blocker.code === 'whole-card-exact-topology-incomplete'
  );
}

function coverageIssue(
  coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2,
  baseline: NonNullable<PatternImportDxfPhaseEGoldenCardBetaCaptureV2['authoritativeBaseline']>,
): string | null {
  try {
    if (
      coverage.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V2 ||
      !Array.isArray(coverage.operations)
    )
      return 'schema or operation collection is invalid';
    const baselineByNumber = new Map(
      baseline.operations.map((operation) => [operation.card.number, operation] as const),
    );
    const seen = new Set<number>();
    for (const operation of coverage.operations) {
      if (
        !operation ||
        !Number.isSafeInteger(operation.operationNumber) ||
        operation.operationNumber <= 0 ||
        seen.has(operation.operationNumber) ||
        !Number.isSafeInteger(operation.seamCount) ||
        operation.seamCount < 0
      )
        return 'operation coverage identities are invalid';
      seen.add(operation.operationNumber);
      const baselineOperation = baselineByNumber.get(operation.operationNumber);
      if (!baselineOperation || baselineOperation.card.seamKeys.length !== operation.seamCount)
        return 'operation coverage does not match the authoritative operation graph';
      const semanticsMatch =
        operation.seamCount === 0
          ? operation.status === 'not-applicable' && operation.reason === 'operation-has-no-seams'
          : (operation.status === 'exact' &&
              operation.reason === 'exact-operation-projection-supplied-and-verified') ||
            (operation.status === 'missing' &&
              operation.reason === 'exact-operation-projection-not-provided');
      if (!semanticsMatch) return 'operation coverage status is inconsistent with its seam count';
    }
    if (seen.size !== baselineByNumber.size)
      return 'operation coverage does not account for the complete operation graph';
    const seamBearing = coverage.operations.filter(({ seamCount }) => seamCount > 0).length;
    const exact = coverage.operations.filter(({ status }) => status === 'exact').length;
    const missing = coverage.operations.filter(({ status }) => status === 'missing').length;
    const expectedStatus =
      seamBearing === 0 ? 'not-applicable' : exact === seamBearing ? 'complete' : 'partial';
    if (
      coverage.structuralOperationCount !== coverage.operations.length ||
      coverage.stylingOperationCount !== coverage.operations.length ||
      coverage.seamBearingOperationCount !== seamBearing ||
      coverage.exactEligibleOperationCount !== seamBearing ||
      coverage.exactOperationCount !== exact ||
      coverage.missingExactOperationCount !== missing ||
      coverage.exactCoverageStatus !== expectedStatus
    )
      return 'coverage summary counters do not match the operation receipts';
    return null;
  } catch {
    return 'coverage receipt could not be inspected safely';
  }
}

/** Private compatibility lens used only to reuse V1 profile/reconstruction checks. */
function legacyCoverage(
  coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2,
): PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 {
  const operations = coverage.operations.map((operation) => {
    if (operation.seamCount === 0)
      return {
        operationNumber: operation.operationNumber,
        seamCount: 0,
        status: 'not-applicable' as const,
        reason: 'operation-has-no-seams' as const,
      };
    if (operation.seamCount === 1)
      return {
        operationNumber: operation.operationNumber,
        seamCount: 1,
        status: 'unsupported' as const,
        reason: 'one-seam-exact-projection-unsupported' as const,
      };
    if (operation.seamCount > 2)
      return {
        operationNumber: operation.operationNumber,
        seamCount: operation.seamCount,
        status: 'unsupported' as const,
        reason: 'multi-seam-exact-projection-unsupported' as const,
      };
    return operation.status === 'exact'
      ? {
          operationNumber: operation.operationNumber,
          seamCount: 2,
          status: 'exact' as const,
          reason: 'exact-selected-operation-projection-provided' as const,
        }
      : {
          operationNumber: operation.operationNumber,
          seamCount: 2,
          status: 'missing' as const,
          reason: 'two-seam-exact-projection-not-provided' as const,
        };
  });
  const seamBearing = operations.filter(({ seamCount }) => seamCount > 0).length;
  const exact = operations.filter(({ status }) => status === 'exact').length;
  const missing = operations.filter(({ status }) => status === 'missing').length;
  const unsupported = operations.filter(({ status }) => status === 'unsupported').length;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
    cardRef: coverage.cardRef,
    exactCoverageStatus:
      seamBearing === 0 ? 'not-applicable' : exact === seamBearing ? 'complete' : 'partial',
    structuralOperationCount: coverage.structuralOperationCount,
    stylingOperationCount: coverage.stylingOperationCount,
    seamBearingOperationCount: seamBearing,
    exactEligibleOperationCount: operations.filter(({ seamCount }) => seamCount === 2).length,
    exactOperationCount: exact,
    missingExactOperationCount: missing,
    unsupportedExactOperationCount: unsupported,
    operations: Object.freeze(operations),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  });
}

function invalidLegacyCoverage(): PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
    cardRef: 'invalid-v2-coverage',
    exactCoverageStatus: 'not-applicable',
    structuralOperationCount: 0,
    stylingOperationCount: 0,
    seamBearingOperationCount: 0,
    exactEligibleOperationCount: 0,
    exactOperationCount: 0,
    missingExactOperationCount: 0,
    unsupportedExactOperationCount: 0,
    operations: Object.freeze([]),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_BASELINE_CLAIMS_V1,
  });
}

/**
 * Reuses the V1 production-profile and reconstruction gate, but replaces its cardinality-specific
 * coverage interpretation with the verified V2 receipt. The private V1 lens is never returned.
 */
export function evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV2(
  techCardId: number,
  capture: PatternImportDxfPhaseEGoldenCardBetaCaptureV2,
): PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV2 {
  let bridgedCoverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null = null;
  if (capture?.wholeCardCoverage) {
    try {
      bridgedCoverage = legacyCoverage(capture.wholeCardCoverage);
    } catch {
      bridgedCoverage = invalidLegacyCoverage();
    }
  }
  const v1 = evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1(techCardId, {
    ...capture,
    wholeCardCoverage: bridgedCoverage,
  });
  const blockers = v1.blockers.filter((entry) => !sameCoverageBlocker(entry));

  if (capture?.wholeCardCoverage && capture.authoritativeBaseline) {
    const issue = coverageIssue(capture.wholeCardCoverage, capture.authoritativeBaseline);
    if (issue) blockers.push(Object.freeze({ code: 'whole-card-coverage-invalid', detail: issue }));
    else if (
      capture.wholeCardCoverage.exactCoverageStatus !== 'complete' ||
      capture.wholeCardCoverage.seamBearingOperationCount === 0 ||
      capture.wholeCardCoverage.exactOperationCount !==
        capture.wholeCardCoverage.seamBearingOperationCount ||
      capture.wholeCardCoverage.missingExactOperationCount !== 0
    )
      blockers.push(
        Object.freeze({
          code: 'whole-card-exact-topology-incomplete',
          detail:
            'Every seam-bearing operation must have one supplied and verified exact per-operation reconstruction snapshot.',
        }),
      );
  }

  return Object.freeze({
    ...v1,
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_V2,
    status: blockers.length ? ('blocked' as const) : ('accepted' as const),
    blockers: Object.freeze(blockers),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V2,
  });
}
