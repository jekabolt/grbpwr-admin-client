import {
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionReportV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1,
  verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  type PatternImportDxfPhaseEGoldenCardObservedFactsV1,
  type PatternImportDxfPhaseEGoldenCardSuiteProfileV1,
} from './golden-card-suite-profiles-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1,
  type PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
} from './golden-whole-card-baseline-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_V1 =
  'pattern-import-dxf-phase-e-golden-card-beta-acceptance/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_MINIMUM_CAPTURE_V1 = Object.freeze([
  Object.freeze({
    id: 'live-card-facts',
    detail: 'Current card id, lock/version and aggregate piece/operation facts.',
  }),
  Object.freeze({
    id: 'sanitized-authoritative-baseline',
    detail:
      'Sanitized catalog, exact connections, ordered operation graph, materials, BOM and colourway refs.',
  }),
  Object.freeze({
    id: 'authoritative-whole-card-coverage',
    detail:
      'Whole-card coverage receipt from the saved Assembly snapshot and current GetTechCard projection, with complete exact topology for every seam-bearing operation.',
  }),
  Object.freeze({
    id: 'operation-family-coverage',
    detail: 'Observed normalized operation families for the pinned card revision.',
  }),
  Object.freeze({
    id: 'table-reconstruction',
    detail: 'From-scratch table result projected through the golden reconstruction contract.',
  }),
  Object.freeze({
    id: 'post-save-reload',
    detail: 'The saved card read back through the same sanitized reconstruction contract.',
  }),
] as const);

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V1 = Object.freeze({
  selectedCardsPinnedToSixAndEleven: true,
  callerSuppliedReadOnlyEvidenceRequired: true,
  productionPayloadBundled: false,
  networkUsed: false,
  networkWritesUsed: false,
  sourcePieceIdentityCompared: true,
  exactConnectionIdentityCompared: true,
  wholeCardExactCoverageRequired: true,
  orderedOperationGraphCompared: true,
  outputUnitIdentityCompared: true,
  materialBomColorwayRefsCompared: true,
  reloadRoundTripRequired: true,
  missingEvidenceFailsClosed: true,
  createsTopologyAuthority: false,
  createsAssemblyAuthority: false,
  createsPersistenceModel: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseEGoldenCardBetaCaptureV1 = Readonly<{
  observedFacts: PatternImportDxfPhaseEGoldenCardObservedFactsV1 | null;
  authoritativeBaseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 | null;
  wholeCardCoverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null;
  observedOperationFamilies: readonly string[] | null;
  tableReconstruction: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 | null;
  postSaveReload: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1 | null;
}>;

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerCodeV1 =
  | 'card-not-in-beta-suite'
  | 'live-card-facts-missing'
  | 'authoritative-baseline-missing'
  | 'whole-card-coverage-missing'
  | 'operation-family-coverage-missing'
  | 'table-reconstruction-missing'
  | 'post-save-reload-missing'
  | 'profile-drift'
  | 'baseline-card-ref-mismatch'
  | 'baseline-piece-count-mismatch'
  | 'baseline-operation-count-mismatch'
  | 'baseline-material-bom-evidence-missing'
  | 'baseline-exact-connection-evidence-missing'
  | 'whole-card-coverage-card-ref-mismatch'
  | 'whole-card-coverage-invalid'
  | 'whole-card-coverage-operation-count-mismatch'
  | 'whole-card-exact-topology-incomplete'
  | 'required-operation-family-missing'
  | 'authoritative-baseline-invalid'
  | 'table-reconstruction-invalid'
  | 'table-reconstruction-mismatch'
  | 'post-save-reload-invalid'
  | 'post-save-reload-mismatch';

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_V1;
  status: 'accepted' | 'blocked';
  techCardId: number;
  cardRef: string | null;
  reconstructionReport: PatternImportDxfPhaseEGoldenCardReconstructionReportV1 | null;
  reloadReport: PatternImportDxfPhaseEGoldenCardReconstructionReportV1 | null;
  blockers: readonly PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1[];
  requiredCapture: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_MINIMUM_CAPTURE_V1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V1;
}>;

function blocker(
  code: PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1 {
  return Object.freeze({ code, detail });
}

function report(
  techCardId: number,
  profile: PatternImportDxfPhaseEGoldenCardSuiteProfileV1 | null,
  blockers: readonly PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1[],
  reconstructionReport: PatternImportDxfPhaseEGoldenCardReconstructionReportV1 | null,
  reloadReport: PatternImportDxfPhaseEGoldenCardReconstructionReportV1 | null,
): PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_V1,
    status: blockers.length ? ('blocked' as const) : ('accepted' as const),
    techCardId,
    cardRef: profile?.cardRef ?? null,
    reconstructionReport,
    reloadReport,
    blockers: Object.freeze([...blockers]),
    requiredCapture: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_MINIMUM_CAPTURE_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_CLAIMS_V1,
  });
}

function selectedProfile(
  techCardId: number,
): PatternImportDxfPhaseEGoldenCardSuiteProfileV1 | null {
  return (
    PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
      ({ facts }) => facts.techCardId === techCardId,
    ) ?? null
  );
}

function wholeCardCoverageIssue(
  coverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1,
  baseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
): string | null {
  try {
    if (
      coverage.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_WHOLE_CARD_COVERAGE_RECEIPT_V1 ||
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
      const coverageSemanticsMatch =
        operation.seamCount === 0
          ? operation.status === 'not-applicable' && operation.reason === 'operation-has-no-seams'
          : operation.seamCount === 1
            ? operation.status === 'unsupported' &&
              operation.reason === 'one-seam-exact-projection-unsupported'
            : operation.seamCount === 2
              ? (operation.status === 'exact' &&
                  operation.reason === 'exact-selected-operation-projection-provided') ||
                (operation.status === 'missing' &&
                  operation.reason === 'two-seam-exact-projection-not-provided')
              : operation.status === 'unsupported' &&
                operation.reason === 'multi-seam-exact-projection-unsupported';
      if (!coverageSemanticsMatch)
        return 'operation coverage status is inconsistent with its seam count';
    }
    if (seen.size !== baselineByNumber.size)
      return 'operation coverage does not account for the complete operation graph';
    const seamBearing = coverage.operations.filter(({ seamCount }) => seamCount > 0).length;
    const exactEligible = coverage.operations.filter(({ seamCount }) => seamCount === 2).length;
    const exact = coverage.operations.filter(({ status }) => status === 'exact').length;
    const missing = coverage.operations.filter(({ status }) => status === 'missing').length;
    const unsupported = coverage.operations.filter(({ status }) => status === 'unsupported').length;
    if (
      coverage.seamBearingOperationCount !== seamBearing ||
      coverage.exactEligibleOperationCount !== exactEligible ||
      coverage.exactOperationCount !== exact ||
      coverage.missingExactOperationCount !== missing ||
      coverage.unsupportedExactOperationCount !== unsupported
    )
      return 'coverage summary counters do not match the operation receipts';
    return null;
  } catch {
    return 'coverage receipt could not be inspected safely';
  }
}

/**
 * Pure beta gate for the two owner-selected production cards. It consumes only sanitized,
 * caller-owned read projections and never fetches, saves or retains a raw production payload.
 */
export function evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1(
  techCardId: number,
  capture: PatternImportDxfPhaseEGoldenCardBetaCaptureV1,
): PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1 {
  const profile = selectedProfile(techCardId);
  if (!profile)
    return report(
      techCardId,
      null,
      [blocker('card-not-in-beta-suite', 'Only pinned production cards 6 and 11 are admitted.')],
      null,
      null,
    );

  const blockers: PatternImportDxfPhaseEGoldenCardBetaAcceptanceBlockerV1[] = [];
  if (!capture?.observedFacts)
    blockers.push(
      blocker('live-card-facts-missing', 'A current read of the pinned card facts is required.'),
    );
  if (!capture?.authoritativeBaseline)
    blockers.push(
      blocker(
        'authoritative-baseline-missing',
        'A sanitized authoritative whole-card baseline is required.',
      ),
    );
  if (!capture?.wholeCardCoverage)
    blockers.push(
      blocker(
        'whole-card-coverage-missing',
        'A saved-snapshot whole-card coverage receipt is required.',
      ),
    );
  if (!capture?.observedOperationFamilies)
    blockers.push(
      blocker(
        'operation-family-coverage-missing',
        'Observed normalized operation families are required.',
      ),
    );
  if (!capture?.tableReconstruction)
    blockers.push(
      blocker(
        'table-reconstruction-missing',
        'A from-scratch table reconstruction projection is required.',
      ),
    );
  if (!capture?.postSaveReload)
    blockers.push(
      blocker('post-save-reload-missing', 'A post-save reload projection is required.'),
    );
  if (blockers.length) return report(techCardId, profile, blockers, null, null);

  const observedFacts = capture.observedFacts!;
  const baseline = capture.authoritativeBaseline!;
  const wholeCardCoverage = capture.wholeCardCoverage!;
  const families = capture.observedOperationFamilies!;
  const reconstruction = capture.tableReconstruction!;
  const reloaded = capture.postSaveReload!;

  const profileResult = verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1(
    profile,
    observedFacts,
  );
  if (!profileResult.ok)
    blockers.push(
      blocker(
        'profile-drift',
        `The pinned production revision drifted at: ${profileResult.differences
          .map(({ path }) => path)
          .join(', ')}.`,
      ),
    );
  if (baseline.cardRef !== profile.cardRef)
    blockers.push(
      blocker(
        'baseline-card-ref-mismatch',
        'The sanitized baseline does not belong to the pinned card reference.',
      ),
    );
  if (baseline.catalog?.pieces.length !== profile.facts.listedPieceRefCount)
    blockers.push(
      blocker(
        'baseline-piece-count-mismatch',
        `Expected ${profile.facts.listedPieceRefCount} source pieces for ${profile.cardRef}.`,
      ),
    );
  if (baseline.operations?.length !== profile.facts.operationCount)
    blockers.push(
      blocker(
        'baseline-operation-count-mismatch',
        `Expected ${profile.facts.operationCount} ordered operations for ${profile.cardRef}.`,
      ),
    );
  if (!baseline.materials?.length || !baseline.bomRefs?.length)
    blockers.push(
      blocker(
        'baseline-material-bom-evidence-missing',
        'Material assignments and stable BOM references must be present in the baseline.',
      ),
    );
  if (!baseline.connections?.length)
    blockers.push(
      blocker(
        'baseline-exact-connection-evidence-missing',
        'At least one exact edge connection must be present in the baseline.',
      ),
    );
  if (wholeCardCoverage.cardRef !== profile.cardRef)
    blockers.push(
      blocker(
        'whole-card-coverage-card-ref-mismatch',
        'The whole-card coverage receipt does not belong to the pinned card reference.',
      ),
    );
  const coverageIssue = wholeCardCoverageIssue(wholeCardCoverage, baseline);
  if (coverageIssue) blockers.push(blocker('whole-card-coverage-invalid', coverageIssue));
  if (
    wholeCardCoverage.structuralOperationCount !== profile.facts.operationCount ||
    wholeCardCoverage.stylingOperationCount !== profile.facts.operationCount ||
    (Array.isArray(wholeCardCoverage.operations) ? wholeCardCoverage.operations.length : -1) !==
      profile.facts.operationCount
  )
    blockers.push(
      blocker(
        'whole-card-coverage-operation-count-mismatch',
        `Whole-card coverage must account for all ${profile.facts.operationCount} operations.`,
      ),
    );
  if (
    wholeCardCoverage.exactCoverageStatus !== 'complete' ||
    wholeCardCoverage.seamBearingOperationCount === 0 ||
    wholeCardCoverage.exactOperationCount !== wholeCardCoverage.seamBearingOperationCount ||
    wholeCardCoverage.missingExactOperationCount !== 0 ||
    wholeCardCoverage.unsupportedExactOperationCount !== 0
  )
    blockers.push(
      blocker(
        'whole-card-exact-topology-incomplete',
        'Every seam-bearing operation must have an exact saved-row projection; missing and unsupported one- or multi-seam coverage remains a beta blocker.',
      ),
    );
  const familySet = new Set(families);
  for (const required of profile.requiredOperationFamilies)
    if (!familySet.has(required))
      blockers.push(
        blocker(
          'required-operation-family-missing',
          `Required operation family is absent: ${required}.`,
        ),
      );

  const baselineSelfCheck = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
    baseline,
    baseline,
  );
  if (!baselineSelfCheck.ok)
    blockers.push(blocker('authoritative-baseline-invalid', baselineSelfCheck.blocker.detail));

  const reconstructed = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
    baseline,
    reconstruction,
  );
  let reconstructionReport: PatternImportDxfPhaseEGoldenCardReconstructionReportV1 | null = null;
  if (!reconstructed.ok)
    blockers.push(blocker('table-reconstruction-invalid', reconstructed.blocker.detail));
  else {
    reconstructionReport = reconstructed.report;
    if (reconstructed.report.status !== 'match')
      blockers.push(
        blocker(
          'table-reconstruction-mismatch',
          `The table reconstruction differs in ${reconstructed.report.differenceCount} exact paths.`,
        ),
      );
  }

  const reload = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(reconstruction, reloaded);
  let reloadReport: PatternImportDxfPhaseEGoldenCardReconstructionReportV1 | null = null;
  if (!reload.ok) blockers.push(blocker('post-save-reload-invalid', reload.blocker.detail));
  else {
    reloadReport = reload.report;
    if (reload.report.status !== 'match')
      blockers.push(
        blocker(
          'post-save-reload-mismatch',
          `The reloaded card differs in ${reload.report.differenceCount} exact paths.`,
        ),
      );
  }

  return report(techCardId, profile, blockers, reconstructionReport, reloadReport);
}
