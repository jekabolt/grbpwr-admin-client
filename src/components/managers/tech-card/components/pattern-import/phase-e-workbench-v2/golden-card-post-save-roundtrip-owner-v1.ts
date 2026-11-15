import {
  projectPatternImportDxfPhaseEGoldenCardAuthoritativeBaselineV1,
  type PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1,
} from './golden-card-authoritative-baseline-projector-v1';
import {
  evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1,
} from './golden-card-beta-acceptance-v1';
import {
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 } from './golden-whole-card-baseline-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_POST_SAVE_ROUNDTRIP_OWNER_V1 =
  'pattern-import-dxf-phase-e-golden-card-post-save-roundtrip-owner/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_POST_SAVE_ROUNDTRIP_OWNER_CLAIMS_V1 =
  Object.freeze({
    selectedCardsPinnedToSixAndEleven: true,
    authoritativeBaselineProjectorReused: true,
    existingBetaAcceptanceGateReused: true,
    existingSaveOwnerRequired: true,
    freshGetTechCardProjectionRequiredAfterSave: true,
    cardLockAndAssemblyRevisionBound: true,
    exactTopologyAndOperationGraphCompared: true,
    materialBomColorwayAndStitchRefsCompared: true,
    saveOwnerImplementedHere: false,
    networkImplementationIncluded: false,
    fixtureFallbackUsed: false,
    unknownWriteOutcomeCanPass: false,
    createsTopologyAuthority: false,
    createsAssemblyAuthority: false,
    createsPersistenceModel: false,
    productionIntegrationPointReady: true,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1 = Readonly<{
  projectorRequest: PatternImportDxfPhaseEGoldenCardAuthoritativeBaselineProjectorRequestV1;
  wholeCardCoverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1;
  observedOperationFamilies: readonly string[];
}>;

export type PatternImportDxfPhaseEGoldenCardExistingSaveOwnerRequestV1 = Readonly<{
  techCardId: number;
  cardRef: string;
  expectedCardLockVersion: number;
  expectedServerAssemblyRevision: string;
  tableReconstruction: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
}>;

export type PatternImportDxfPhaseEGoldenCardExistingSaveOwnerResultV1 =
  | Readonly<{
      ok: true;
      status: 'verified';
      techCardId: number;
      cardRef: string;
      cardLockVersion: number;
      serverAssemblyRevision: string;
      postSaveReceiptSha256: string;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked' | 'unknown' | 'acknowledged-unverified';
      blocker: Readonly<{ code: string; detail: string }>;
    }>;

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1 = Readonly<{
  /** Existing application save owner. This gate never implements or dispatches a writer itself. */
  saveThroughExistingOwner: (
    request: PatternImportDxfPhaseEGoldenCardExistingSaveOwnerRequestV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEGoldenCardExistingSaveOwnerResultV1>;
  /** Fresh sanitized GetTechCard + saved Assembly projection after a verified save receipt. */
  readFreshAfterSave: (
    expected: Readonly<{
      techCardId: number;
      cardRef: string;
      cardLockVersion: number;
      serverAssemblyRevision: string;
      postSaveReceiptSha256: string;
    }>,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1>;
}>;

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripRequestV1 = Readonly<{
  beforeSave: PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1;
  tableReconstruction: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
}>;

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripBlockerCodeV1 =
  | 'cancelled-before-save'
  | 'baseline-projection-blocked'
  | 'table-reconstruction-invalid'
  | 'table-reconstruction-mismatch'
  | 'pre-save-acceptance-blocked'
  | 'save-owner-threw-unknown'
  | 'save-owner-unverified'
  | 'save-receipt-mismatch'
  | 'cancelled-after-save-unknown'
  | 'fresh-read-failed'
  | 'fresh-read-binding-mismatch'
  | 'post-save-projection-blocked'
  | 'post-save-acceptance-blocked';

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripBlockerCodeV1;
  detail: string;
}>;

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_POST_SAVE_ROUNDTRIP_OWNER_V1;
  status: 'accepted' | 'blocked' | 'unknown';
  techCardId: number | null;
  cardRef: string | null;
  postSaveBinding: Readonly<{
    cardLockVersion: number;
    serverAssemblyRevision: string;
    postSaveReceiptSha256: string;
  }> | null;
  acceptance: PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1 | null;
  blocker: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripBlockerV1 | null;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_POST_SAVE_ROUNDTRIP_OWNER_CLAIMS_V1;
}>;

function result(
  status: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1['status'],
  techCardId: number | null,
  cardRef: string | null,
  postSaveBinding: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1['postSaveBinding'],
  acceptance: PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1 | null,
  blocker: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripBlockerV1 | null,
): PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_POST_SAVE_ROUNDTRIP_OWNER_V1,
    status,
    techCardId,
    cardRef,
    postSaveBinding,
    acceptance,
    blocker: blocker ? Object.freeze(blocker) : null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_POST_SAVE_ROUNDTRIP_OWNER_CLAIMS_V1,
  });
}

function blocked(
  code: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripBlockerCodeV1,
  detail: string,
  techCardId: number | null = null,
  cardRef: string | null = null,
  acceptance: PatternImportDxfPhaseEGoldenCardBetaAcceptanceReportV1 | null = null,
): PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1 {
  return result('blocked', techCardId, cardRef, null, acceptance, { code, detail });
}

function unknown(
  code: 'save-owner-threw-unknown' | 'cancelled-after-save-unknown',
  detail: string,
  techCardId: number,
  cardRef: string,
): PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1 {
  return result('unknown', techCardId, cardRef, null, null, { code, detail });
}

function bindingMatches(
  evidence: PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1,
  expected: Readonly<{
    techCardId: number;
    cardLockVersion: number;
    serverAssemblyRevision: string;
  }>,
): boolean {
  const request = evidence?.projectorRequest;
  return (
    request?.observedFacts?.techCardId === expected.techCardId &&
    request?.currentCard?.techCardId === expected.techCardId &&
    request?.expectedCardLockVersion === expected.cardLockVersion &&
    request?.currentCard?.cardLockVersion === expected.cardLockVersion &&
    request?.graph?.techCardId === expected.techCardId &&
    request?.graph?.cardLockVersion === expected.cardLockVersion &&
    request?.expectedServerAssemblyRevision === expected.serverAssemblyRevision &&
    request?.graph?.serverAssemblyRevision === expected.serverAssemblyRevision
  );
}

/**
 * Production wiring contract for the golden 6/11 round-trip. It first proves the selected live
 * baseline and table reconstruction, delegates the only write to the application's existing save
 * owner, then requires a fresh fixed-binding read and runs the existing exact beta comparator.
 */
export async function runPatternImportDxfPhaseEGoldenCardPostSaveRoundtripV1(
  capabilities: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1,
  request: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripRequestV1,
  signal: AbortSignal,
): Promise<PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1> {
  if (signal.aborted)
    return blocked(
      'cancelled-before-save',
      'The golden round-trip was cancelled before projection.',
    );

  const before = projectPatternImportDxfPhaseEGoldenCardAuthoritativeBaselineV1(
    request.beforeSave.projectorRequest,
  );
  if (!before.ok)
    return blocked(
      'baseline-projection-blocked',
      before.blockers[0].detail,
      request.beforeSave.projectorRequest?.observedFacts?.techCardId ?? null,
    );

  const reconstructed = verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
    before.baseline,
    request.tableReconstruction,
  );
  if (!reconstructed.ok)
    return blocked(
      'table-reconstruction-invalid',
      reconstructed.blocker.detail,
      before.binding.techCardId,
      before.binding.cardRef,
    );
  if (reconstructed.report.status !== 'match')
    return blocked(
      'table-reconstruction-mismatch',
      `The table reconstruction differs in ${reconstructed.report.differenceCount} exact paths.`,
      before.binding.techCardId,
      before.binding.cardRef,
    );

  const preSaveAcceptance = evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1(
    before.binding.techCardId,
    {
      observedFacts: request.beforeSave.projectorRequest.observedFacts,
      authoritativeBaseline: before.baseline,
      wholeCardCoverage: request.beforeSave.wholeCardCoverage,
      observedOperationFamilies: request.beforeSave.observedOperationFamilies,
      tableReconstruction: request.tableReconstruction,
      // This is only a pre-save completeness check. The final gate always replaces it with a fresh
      // post-save projection after the existing save owner returns a verified receipt.
      postSaveReload: request.tableReconstruction,
    },
  );
  if (preSaveAcceptance.status !== 'accepted')
    return blocked(
      'pre-save-acceptance-blocked',
      `Pre-save exact evidence is incomplete: ${preSaveAcceptance.blockers
        .map(({ code }) => code)
        .join(', ')}.`,
      before.binding.techCardId,
      before.binding.cardRef,
      preSaveAcceptance,
    );
  if (signal.aborted)
    return blocked(
      'cancelled-before-save',
      'The golden round-trip was cancelled before the save owner boundary.',
      before.binding.techCardId,
      before.binding.cardRef,
    );

  let save: PatternImportDxfPhaseEGoldenCardExistingSaveOwnerResultV1;
  try {
    save = await capabilities.saveThroughExistingOwner(
      {
        techCardId: before.binding.techCardId,
        cardRef: before.binding.cardRef,
        expectedCardLockVersion: before.binding.cardLockVersion,
        expectedServerAssemblyRevision: before.binding.serverAssemblyRevision,
        tableReconstruction: request.tableReconstruction,
      },
      signal,
    );
  } catch (error) {
    return unknown(
      'save-owner-threw-unknown',
      error instanceof Error
        ? `The existing save owner threw with an unknown write outcome: ${error.message}`
        : 'The existing save owner threw with an unknown write outcome.',
      before.binding.techCardId,
      before.binding.cardRef,
    );
  }
  if (signal.aborted)
    return unknown(
      'cancelled-after-save-unknown',
      'The round-trip was cancelled after invoking the save owner; the write outcome is not publishable.',
      before.binding.techCardId,
      before.binding.cardRef,
    );
  if (save.ok === false)
    return result(
      save.status === 'unknown' || save.status === 'acknowledged-unverified'
        ? 'unknown'
        : 'blocked',
      before.binding.techCardId,
      before.binding.cardRef,
      null,
      null,
      {
        code: 'save-owner-unverified',
        detail: `${save.blocker.code}: ${save.blocker.detail}`,
      },
    );
  if (
    save.status !== 'verified' ||
    save.techCardId !== before.binding.techCardId ||
    save.cardRef !== before.binding.cardRef ||
    save.cardLockVersion !== before.binding.cardLockVersion ||
    typeof save.serverAssemblyRevision !== 'string' ||
    !save.serverAssemblyRevision ||
    save.serverAssemblyRevision === before.binding.serverAssemblyRevision ||
    !SHA256.test(save.postSaveReceiptSha256)
  )
    return blocked(
      'save-receipt-mismatch',
      'The verified save receipt is not bound to the selected card lock and a fresh Assembly revision.',
      before.binding.techCardId,
      before.binding.cardRef,
    );

  const postSaveBinding = Object.freeze({
    cardLockVersion: save.cardLockVersion,
    serverAssemblyRevision: save.serverAssemblyRevision,
    postSaveReceiptSha256: save.postSaveReceiptSha256,
  });
  let fresh: PatternImportDxfPhaseEGoldenCardRoundtripEvidenceV1;
  try {
    fresh = await capabilities.readFreshAfterSave(
      {
        techCardId: save.techCardId,
        cardRef: save.cardRef,
        ...postSaveBinding,
      },
      signal,
    );
  } catch (error) {
    return result(
      'blocked',
      before.binding.techCardId,
      before.binding.cardRef,
      postSaveBinding,
      null,
      {
        code: 'fresh-read-failed',
        detail:
          error instanceof Error
            ? `The fresh post-save read failed: ${error.message}`
            : 'The fresh post-save read failed.',
      },
    );
  }
  if (
    signal.aborted ||
    !bindingMatches(fresh, {
      techCardId: save.techCardId,
      cardLockVersion: save.cardLockVersion,
      serverAssemblyRevision: save.serverAssemblyRevision,
    })
  )
    return result(
      'blocked',
      before.binding.techCardId,
      before.binding.cardRef,
      postSaveBinding,
      null,
      {
        code: 'fresh-read-binding-mismatch',
        detail: signal.aborted
          ? 'The fresh post-save read was cancelled and cannot become acceptance evidence.'
          : 'The fresh projection is not bound to the verified card lock and Assembly revision.',
      },
    );

  const after = projectPatternImportDxfPhaseEGoldenCardAuthoritativeBaselineV1(
    fresh.projectorRequest,
  );
  if (!after.ok)
    return result(
      'blocked',
      before.binding.techCardId,
      before.binding.cardRef,
      postSaveBinding,
      null,
      { code: 'post-save-projection-blocked', detail: after.blockers[0].detail },
    );

  const acceptance = evaluatePatternImportDxfPhaseEGoldenCardBetaAcceptanceV1(
    before.binding.techCardId,
    {
      observedFacts: fresh.projectorRequest.observedFacts,
      authoritativeBaseline: before.baseline,
      wholeCardCoverage: fresh.wholeCardCoverage,
      observedOperationFamilies: fresh.observedOperationFamilies,
      tableReconstruction: request.tableReconstruction,
      postSaveReload: after.baseline,
    },
  );
  if (acceptance.status !== 'accepted')
    return result(
      'blocked',
      before.binding.techCardId,
      before.binding.cardRef,
      postSaveBinding,
      acceptance,
      {
        code: 'post-save-acceptance-blocked',
        detail: `Fresh readback failed exact acceptance: ${acceptance.blockers
          .map(({ code }) => code)
          .join(', ')}.`,
      },
    );

  return result(
    'accepted',
    before.binding.techCardId,
    before.binding.cardRef,
    postSaveBinding,
    acceptance,
    null,
  );
}
