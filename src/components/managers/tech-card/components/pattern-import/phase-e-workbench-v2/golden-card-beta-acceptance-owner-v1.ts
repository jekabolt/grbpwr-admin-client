import {
  evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1,
  type PatternImportDxfPhaseEGoldenCardBetaCaptureV1,
} from './golden-card-beta-acceptance-v1';
import type { PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1 } from './golden-card-preflight-card-controller-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 } from './golden-whole-card-live-reader-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 } from './golden-whole-card-baseline-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_V1 =
  'pattern-import-dxf-phase-e-golden-card-beta-acceptance-owner/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_CLAIMS_V1 = Object.freeze(
  {
    existingPreflightFactsReused: true,
    existingSavedSnapshotCoverageReused: true,
    aggregatedFullCardExactCoverageSupported: true,
    callerOwnedExactCaptureRequired: true,
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

/** Exact owner-path inventory; `missing` entries are intentionally never inferred from fixtures. */
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_EVIDENCE_PATHS_V1 =
  Object.freeze([
    Object.freeze({
      evidence: 'observedFacts',
      status: 'wired',
      source: 'preflight.statusProps.observedFacts',
    }),
    Object.freeze({
      evidence: 'wholeCardCoverage',
      status: 'wired',
      source: 'aggregatedWholeCardCoverage ?? liveRead.baseline.coverage',
    }),
    Object.freeze({
      evidence: 'authoritativeBaseline',
      status: 'missing',
      source:
        'The live reader retains partitioned selected-operation exact projections, not one full-card exact snapshot.',
    }),
    Object.freeze({
      evidence: 'observedOperationFamilies',
      status: 'missing',
      source: 'No canonical current-card work-label to acceptance-family projector exists.',
    }),
    Object.freeze({
      evidence: 'tableReconstruction',
      status: 'missing',
      source: 'The production mount owns only harness status, not the detached harness session.',
    }),
    Object.freeze({
      evidence: 'postSaveReload',
      status: 'missing',
      source:
        'No post-save whole-card reconstruction projection is owned by the read-only preflight.',
    }),
  ] as const);

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerInputV1 = Readonly<{
  /** Result already built by the card-level ConstructionTab preflight owner. */
  preflight: Pick<
    PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1,
    'mount' | 'blocker' | 'statusProps'
  >;
  /** Result already owned by the injected GetTechCard + saved Assembly snapshot reader. */
  liveRead: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null;
  /** Complete receipt from the pure fixed-lock full-card exact capture aggregator, when available. */
  aggregatedWholeCardCoverage?: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null;
  /** Exact evidence that the current live reader cannot yet assemble into one whole-card graph. */
  exactCapture: Omit<
    PatternImportDxfPhaseEGoldenCardBetaCaptureV1,
    'observedFacts' | 'wholeCardCoverage'
  >;
}>;

export type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_V1;
  status: 'accepted' | 'blocked';
  preflightBlocker: PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1['blocker'];
  liveReadBlocker: string | null;
  acceptance: PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_CLAIMS_V1;
}>;

function liveReadBlocker(
  result: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null,
): string | null {
  if (!result || result.ok) return null;
  return result.blocker?.detail ?? result.baseline?.blocker.detail ?? 'The live read is blocked.';
}

/**
 * Read-only bridge from the current card-level owners into the pure beta acceptance gate. It does
 * not start either read and deliberately cannot substitute the stale local card 6/11 fixtures for
 * the missing current exact capture.
 */
export function buildPatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerV1(
  input: PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerInputV1,
): PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV1 {
  const observedFacts = input.preflight.mount ? input.preflight.statusProps.observedFacts : null;
  const wholeCardCoverage =
    input.aggregatedWholeCardCoverage ??
    (input.liveRead?.ok ? input.liveRead.baseline.coverage : null);
  const acceptance = evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1(
    input.preflight.statusProps.techCardId,
    {
      ...input.exactCapture,
      observedFacts,
      wholeCardCoverage,
    },
  );

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_V1,
    status: acceptance.status,
    preflightBlocker: input.preflight.blocker,
    liveReadBlocker: liveReadBlocker(input.liveRead),
    acceptance,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_BETA_ACCEPTANCE_OWNER_CLAIMS_V1,
  });
}
