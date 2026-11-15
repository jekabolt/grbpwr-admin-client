import {
  PatternImportDxfPhaseEGoldenCardPreflightStatusV1,
  type PatternImportDxfPhaseEGoldenCardHarnessStatusV1,
  type PatternImportDxfPhaseEGoldenCardPreflightStatusPropsV1,
} from './golden-card-preflight-status-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1,
  verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1,
  type PatternImportDxfPhaseEGoldenCardObservedFactsV1,
} from './golden-card-suite-profiles-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1 } from './golden-whole-card-baseline-v1';
import type {
  PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
  PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1,
} from './golden-whole-card-live-reader-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportRequestV1,
} from './saved-assembly-authority-transport-v1';
import type { TechCardConstructionAuditSharedFactsV1 } from '../../construction-audit-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_V1 =
  'pattern-import-dxf-phase-e-golden-card-preflight-card-controller/1' as const;

/**
 * This is the only safe card-level mount point in the current editor. `ConstructionTab` already
 * owns the loaded card and renders the only construction-audit surface. Its audit query is hoisted
 * out of `ConstructionAudit` and passed down as one narrow owner; mounting another hook or mounting
 * inside the selected-operation editor would create a second read/identity owner.
 */
export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_MOUNT_POINT_V1 = Object.freeze({
  owner: 'ConstructionTab',
  file: 'src/components/managers/tech-card/components/construction-tab.tsx',
  after: 'ConstructionAudit',
  before: 'CardStandards',
  requiresSingleHoistedConstructionAuditQuery: true,
  singleHoistedConstructionAuditQueryImplemented: true,
  selectedOperationMountForbidden: true,
} as const);

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_CLAIMS_V1 =
  Object.freeze({
    selectedProductOwnerProfilesOnly: true,
    cardLevelSingleMountOnly: true,
    sharedTechCardOwnerRequired: true,
    sharedConstructionAuditOwnerRequired: true,
    selectedOperationIdentityNeverInferred: true,
    explicitSavedRowSnapshotIdentityRequired: true,
    expectedCardLockVersionMatchedBeforeRead: true,
    selectedOperationMustExistOnSharedCard: true,
    completeExactCoverageRequiredForReady: true,
    liveReaderRequestProducedOnly: true,
    networkUsed: false,
    productionWriteAvailable: false,
    createsTopologyAuthority: false,
    createsAssemblyAuthority: false,
    createsPersistenceModel: false,
    productionReady: false,
  } as const);

type SharedOwnerStatusV1 = 'idle' | 'loading' | 'ready' | 'failed';

export type PatternImportDxfPhaseEGoldenCardSharedFactsV1 = Readonly<
  Omit<
    PatternImportDxfPhaseEGoldenCardObservedFactsV1,
    'auditFindingCount' | 'auditUncheckedCount'
  > & {
    /** Operation identities projected by the existing card query owner. */
    operationNumbers: readonly number[];
  }
>;

export type PatternImportDxfPhaseEGoldenCardSharedAuditFactsV1 = Pick<
  TechCardConstructionAuditSharedFactsV1,
  'techCardId' | 'auditFindingCount' | 'auditUncheckedCount'
>;

export type PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1 = Readonly<{
  techCardId: number;
  cardOwner: Readonly<{
    status: SharedOwnerStatusV1;
    facts: PatternImportDxfPhaseEGoldenCardSharedFactsV1 | null;
  }>;
  auditOwner: Readonly<{
    status: SharedOwnerStatusV1;
    facts: PatternImportDxfPhaseEGoldenCardSharedAuditFactsV1 | null;
  }>;
  /**
   * Exact saved-row identity from its existing owner. Null is safe: the live action stays absent.
   * The controller never chooses a row or operation on behalf of the whole card.
   */
  snapshotRequest: PatternImportDxfPhaseESavedAssemblyTransportRequestV1 | null;
  exactSelectedOperationProjections?: readonly PatternImportDxfPhaseEGoldenWholeCardExactSelectedOperationProjectionV1[];
  liveRead: Readonly<{
    status: SharedOwnerStatusV1;
    result: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null;
  }>;
  harness: PatternImportDxfPhaseEGoldenCardHarnessStatusV1 | null;
}>;

export type PatternImportDxfPhaseEGoldenCardPreflightCardBlockerCodeV1 =
  | 'card-owner-unavailable'
  | 'card-identity-mismatch'
  | 'card-operation-identity-ambiguous'
  | 'audit-owner-unavailable'
  | 'audit-identity-mismatch'
  | 'profile-drift'
  | 'snapshot-identity-unavailable'
  | 'snapshot-identity-invalid'
  | 'snapshot-card-mismatch'
  | 'snapshot-lock-mismatch'
  | 'snapshot-operation-missing'
  | 'live-read-failed'
  | 'exact-coverage-incomplete';

export type PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_V1;
  mount: boolean;
  blocker: Readonly<{
    code: PatternImportDxfPhaseEGoldenCardPreflightCardBlockerCodeV1;
    detail: string;
  }> | null;
  liveReadRequest: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1 | null;
  statusProps: PatternImportDxfPhaseEGoldenCardPreflightStatusPropsV1;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_CLAIMS_V1;
}>;

function blocked(
  input: PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1,
  code: PatternImportDxfPhaseEGoldenCardPreflightCardBlockerCodeV1,
  detail: string,
  observedFacts: PatternImportDxfPhaseEGoldenCardObservedFactsV1 | null,
): PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_V1,
    mount: true,
    blocker: Object.freeze({ code, detail }),
    liveReadRequest: null,
    statusProps: Object.freeze({
      techCardId: input.techCardId,
      readStatus:
        input.cardOwner.status === 'failed' || input.auditOwner.status === 'failed'
          ? 'failed'
          : input.cardOwner.status === 'loading' || input.auditOwner.status === 'loading'
            ? 'loading'
            : observedFacts
              ? 'ready'
              : 'idle',
      observedFacts,
      wholeCardProjectionReady: false,
      harness: input.harness,
      readBlocker: detail,
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_CLAIMS_V1,
  });
}

function unsupported(
  input: PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1,
): PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1 {
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_V1,
    mount: false,
    blocker: null,
    liveReadRequest: null,
    statusProps: Object.freeze({
      techCardId: input.techCardId,
      readStatus: 'idle',
      observedFacts: null,
      wholeCardProjectionReady: false,
      harness: null,
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_CLAIMS_V1,
  });
}

/**
 * Pure integration owner. It consumes already-owned count-only receipts and can only produce a
 * validated request for the existing live reader. It performs no hook call, RPC, persistence or
 * state mutation.
 */
export function buildPatternImportDxfPhaseEGoldenCardPreflightCardControllerV1(
  input: PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1,
): PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1 {
  const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
    ({ facts }) => facts.techCardId === input.techCardId,
  );
  if (!profile) return unsupported(input);

  if (input.cardOwner.status !== 'ready' || !input.cardOwner.facts)
    return blocked(
      input,
      'card-owner-unavailable',
      'The shared tech-card read is not ready. No second card read was started.',
      null,
    );
  const cardFacts = input.cardOwner.facts;
  if (cardFacts.techCardId !== input.techCardId)
    return blocked(
      input,
      'card-identity-mismatch',
      'The shared tech-card owner returned a different card.',
      null,
    );
  const uniqueOperationNumbers = new Set(cardFacts.operationNumbers);
  if (
    cardFacts.operationNumbers.length !== cardFacts.operationCount ||
    uniqueOperationNumbers.size !== cardFacts.operationNumbers.length ||
    cardFacts.operationNumbers.some(
      (operationNumber) => !Number.isSafeInteger(operationNumber) || operationNumber < 1,
    )
  )
    return blocked(
      input,
      'card-operation-identity-ambiguous',
      'The shared card contains ambiguous operation identities.',
      null,
    );

  if (input.auditOwner.status !== 'ready' || !input.auditOwner.facts)
    return blocked(
      input,
      'audit-owner-unavailable',
      'The shared construction-audit read is not ready. No second audit read was started.',
      null,
    );
  if (input.auditOwner.facts.techCardId !== input.techCardId)
    return blocked(
      input,
      'audit-identity-mismatch',
      'The shared construction-audit owner returned a different card.',
      null,
    );

  const observedFacts = Object.freeze({
    techCardId: cardFacts.techCardId,
    styleNumber: cardFacts.styleNumber,
    name: cardFacts.name,
    cardVersion: cardFacts.cardVersion,
    listedPieceRefCount: cardFacts.listedPieceRefCount,
    finalGarmentPieceCount: cardFacts.finalGarmentPieceCount,
    operationCount: cardFacts.operationCount,
    zonesCovered: cardFacts.zonesCovered,
    zonesTotal: cardFacts.zonesTotal,
    warningCount: cardFacts.warningCount,
    auditFindingCount: input.auditOwner.facts.auditFindingCount,
    auditUncheckedCount: input.auditOwner.facts.auditUncheckedCount,
  });

  if (!verifyPatternImportDxfPhaseEGoldenCardSuiteProfileV1(profile, observedFacts).ok)
    return blocked(
      input,
      'profile-drift',
      'The shared card or audit receipt drifted from the pinned golden profile. No live baseline read was offered.',
      observedFacts,
    );

  if (!input.snapshotRequest)
    return blocked(
      input,
      'snapshot-identity-unavailable',
      'A canonical saved-row snapshot identity is unavailable at card level. The controller will not infer one from the selected operation.',
      observedFacts,
    );
  if (
    input.snapshotRequest.schemaVersion !==
      PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_REQUEST_V1 ||
    !Number.isSafeInteger(input.snapshotRequest.expectedCardLockVersion) ||
    input.snapshotRequest.expectedCardLockVersion < 0 ||
    !Number.isSafeInteger(input.snapshotRequest.selectedOperationNumber) ||
    input.snapshotRequest.selectedOperationNumber < 1
  )
    return blocked(
      input,
      'snapshot-identity-invalid',
      'The saved-row snapshot identity is incomplete or invalid.',
      observedFacts,
    );
  if (input.snapshotRequest.techCardId !== input.techCardId)
    return blocked(
      input,
      'snapshot-card-mismatch',
      'The saved-row snapshot identity belongs to a different card.',
      observedFacts,
    );
  if (input.snapshotRequest.expectedCardLockVersion !== cardFacts.cardVersion)
    return blocked(
      input,
      'snapshot-lock-mismatch',
      'The saved-row snapshot identity does not match the shared card lock version.',
      observedFacts,
    );
  if (!uniqueOperationNumbers.has(input.snapshotRequest.selectedOperationNumber))
    return blocked(
      input,
      'snapshot-operation-missing',
      'The saved-row snapshot selected operation is not present on the shared card.',
      observedFacts,
    );

  const liveReadRequest = Object.freeze({
    cardRef: profile.cardRef,
    snapshotRequest: input.snapshotRequest,
    exactSelectedOperationProjections: Object.freeze([
      ...(input.exactSelectedOperationProjections ?? []),
    ]),
  });

  if (input.liveRead.status === 'failed' || (input.liveRead.result && !input.liveRead.result.ok))
    return Object.freeze({
      ...blocked(
        input,
        'live-read-failed',
        'The detached whole-card baseline read failed. No production write was made.',
        observedFacts,
      ),
      liveReadRequest,
    });

  const coverage = input.liveRead.result?.ok
    ? input.liveRead.result.baseline.coverage.exactCoverageStatus
    : null;
  const exactReady = coverage === 'complete' || coverage === 'not-applicable';
  const coverageBlocker =
    coverage === 'partial'
      ? Object.freeze({
          code: 'exact-coverage-incomplete' as const,
          detail:
            'The whole-card structural baseline is ready, but exact seam coverage is partial. Blank reconstruction stays blocked.',
        })
      : null;

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_V1,
    mount: true,
    blocker: coverageBlocker,
    liveReadRequest,
    statusProps: Object.freeze({
      techCardId: input.techCardId,
      readStatus:
        input.liveRead.status === 'loading'
          ? 'loading'
          : input.cardOwner.status === 'ready' && input.auditOwner.status === 'ready'
            ? 'ready'
            : 'idle',
      observedFacts,
      wholeCardProjectionReady: exactReady,
      harness: input.harness,
      readBlocker: coverageBlocker?.detail ?? null,
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_CARD_CONTROLLER_CLAIMS_V1,
  });
}

export type PatternImportDxfPhaseEGoldenCardPreflightCardControllerPropsV1 =
  PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1 &
    Readonly<{
      onReadLiveBaseline?: (
        request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
      ) => void;
    }>;

/** Mount-ready read-only adapter. The parent still owns the live-reader lifecycle. */
export function PatternImportDxfPhaseEGoldenCardPreflightCardControllerV1({
  onReadLiveBaseline,
  ...input
}: PatternImportDxfPhaseEGoldenCardPreflightCardControllerPropsV1) {
  const controller = buildPatternImportDxfPhaseEGoldenCardPreflightCardControllerV1(input);
  if (!controller.mount) return null;
  return (
    <PatternImportDxfPhaseEGoldenCardPreflightStatusV1
      {...controller.statusProps}
      onReadLiveBaseline={
        controller.liveReadRequest && onReadLiveBaseline
          ? () => onReadLiveBaseline(controller.liveReadRequest!)
          : undefined
      }
    />
  );
}
