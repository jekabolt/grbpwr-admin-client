import {
  evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV2,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV2,
  type PatternImportDxfPhaseEGoldenCardBetaCaptureV2,
} from './golden-card-beta-acceptance-v2';
import type { PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1 } from './golden-card-preflight-card-controller-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 } from './golden-whole-card-live-reader-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2 } from './golden-whole-card-baseline-v2';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_V2 =
  'pattern-import-dxf-phase-e-golden-card-beta-acceptance-owner/2' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_CLAIMS_V2 = Object.freeze(
  {
    existingPreflightFactsReused: true,
    callerSanitizedPerOperationSnapshotsRequired: true,
    v2WholeCardCoverageReused: true,
    everyPositiveSeamCardinalityEligible: true,
    missingOrTamperedSnapshotFailsClosed: true,
    zeroSeamOperationsRemainNotApplicable: true,
    staleFixtureFallbackUsed: false,
    hookUsed: false,
    uiRendered: false,
    networkUsed: false,
    networkWriteAvailable: false,
    createsAuthority: false,
    createsPersistenceModel: false,
    productionReady: false,
  } as const,
);

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2 = Readonly<{
  wholeCardCoverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV2;
  exactCapture: Omit<
    PatternImportDxfPhaseEGoldenCardBetaCaptureV2,
    'observedFacts' | 'wholeCardCoverage'
  >;
}>;

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerInputV2 = Readonly<{
  preflight: Pick<
    PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1,
    'mount' | 'blocker' | 'statusProps'
  >;
  /** Existing live read is observed only for its blocker; this owner never starts a read. */
  liveRead: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null;
  capture: PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2;
}>;

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV2 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_V2;
  status: 'accepted' | 'blocked';
  preflightBlocker: PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1['blocker'];
  liveReadBlocker: string | null;
  acceptance: PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV2;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_CLAIMS_V2;
}>;

function liveReadBlocker(
  result: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null,
): string | null {
  if (!result || result.ok) return null;
  return result.blocker?.detail ?? result.baseline?.blocker.detail ?? 'The live read is blocked.';
}

/**
 * Read-only production seam for a caller that already owns verified per-operation reconstruction
 * snapshots and their V2 whole-card receipt. It cannot derive, fetch, persist or repair evidence.
 */
export function buildPatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerV2(
  input: PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerInputV2,
): PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV2 {
  const observedFacts = input.preflight.mount ? input.preflight.statusProps.observedFacts : null;
  const acceptance = evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV2(
    input.preflight.statusProps.techCardId,
    {
      ...input.capture.exactCapture,
      observedFacts,
      wholeCardCoverage: input.capture.wholeCardCoverage,
    },
  );

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_V2,
    status: acceptance.status,
    preflightBlocker: input.preflight.blocker,
    liveReadBlocker: liveReadBlocker(input.liveRead),
    acceptance,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_CLAIMS_V2,
  });
}
