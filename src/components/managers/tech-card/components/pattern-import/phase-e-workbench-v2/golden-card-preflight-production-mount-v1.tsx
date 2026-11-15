import type { common_TechCard } from 'api/proto-http/admin';
import type { TechCardConstructionAuditOwnerV1 } from 'components/managers/tech-card/components/construction-audit-owner-v1';
import { projectTechCardConstructionAuditSharedFactsV1 } from 'components/managers/tech-card/components/construction-audit-owner-v1';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalloutBox, Section, Select, Text } from 'ui';

import {
  buildPatternImportDxfPhaseEGoldenCardAggregateMetricsV1,
  type PatternImportDxfPhaseEGoldenCardWarningFactsV1,
} from './golden-card-aggregate-metrics-v1';
import type { PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1 } from './golden-card-full-exact-capture-aggregator-v1';
import {
  buildPatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerV1,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV1,
} from './golden-card-beta-acceptance-owner-v1';
import {
  buildPatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerV2,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2,
  type PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV2,
} from './golden-card-beta-acceptance-owner-v2';
import {
  runPatternImportDxfPhaseEGoldenCardPostSaveRoundtripV1,
  type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1,
  type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripRequestV1,
  type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1,
} from './golden-card-post-save-roundtrip-owner-v1';
import {
  PatternImportDxfPhaseEGoldenCardPreflightCardControllerV1,
  buildPatternImportDxfPhaseEGoldenCardPreflightCardControllerV1,
  type PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1,
  type PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1,
} from './golden-card-preflight-card-controller-v1';
import {
  buildPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
  type PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
} from './golden-card-production-v2-snapshot-feed-v1';
import {
  createPatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerV1,
  type PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1,
} from './golden-card-full-exact-capture-owner-v1';
import {
  buildPatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1,
  resolvePatternImportDxfPhaseEGoldenCardSnapshotSelectionV1,
  selectPatternImportDxfPhaseEGoldenCardSnapshotCandidateV1,
  type PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1,
  type PatternImportDxfPhaseEGoldenCardSnapshotSelectionReceiptV1,
} from './golden-card-snapshot-selection-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1 } from './golden-card-suite-profiles-v1';
import {
  createPatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderV1,
  type PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1,
  type PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1,
} from './golden-whole-card-live-reader-v1';
import type { PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 } from './golden-whole-card-baseline-v1';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_PRODUCTION_MOUNT_V1 =
  'pattern-import-dxf-phase-e-golden-card-preflight-production-mount/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PREFLIGHT_PRODUCTION_MOUNT_CLAIMS_V1 =
  Object.freeze({
    cardLevelOnly: true,
    selectedProductOwnerProfilesOnly: true,
    loadedTechCardReused: true,
    sharedConstructionAuditOwnerReused: true,
    explicitSnapshotSelectionRequired: true,
    uniqueCandidateAutoSelected: false,
    selectionRevalidatedBeforeRead: true,
    selectedOperationUiStateUsed: false,
    snapshotRpcCreatedOnlyAfterExplicitSelection: true,
    fullExactCaptureOwnerIntegrated: true,
    fullExactCaptureStartsOnlyAfterLiveBaseline: true,
    betaAcceptanceDiagnosticsIntegrated: true,
    betaAcceptanceV2CallerCaptureIntegrated: true,
    betaAcceptanceV2ProductionSnapshotFeedIntegrated: true,
    invalidV2FeedFallsBackToV1: false,
    postSaveRoundtripOwnerIntegrated: true,
    postSaveRoundtripRequiresExplicitDispatch: true,
    postSaveRoundtripRequiresSelectedLiveBaseline: true,
    postSaveRoundtripDependenciesInjected: true,
    postSaveRoundtripCreatesSecondWriter: false,
    getTechCardReadStarted: false,
    productionWriteAvailable: false,
    createsAuthority: false,
    productionReady: false,
  } as const);

type SharedOwnerStatusV1 = 'idle' | 'loading' | 'ready' | 'failed';

type LiveReadStateV1 = Readonly<{
  status: SharedOwnerStatusV1;
  result: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null;
}>;

const IDLE_LIVE_READ: LiveReadStateV1 = Object.freeze({ status: 'idle', result: null });

export type FullExactCaptureStateV1 = Readonly<{
  status: SharedOwnerStatusV1;
  result: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1 | null;
}>;

const IDLE_FULL_EXACT_CAPTURE: FullExactCaptureStateV1 = Object.freeze({
  status: 'idle',
  result: null,
});

export type PatternImportDxfPhaseEGoldenCardFullExactCaptureStatusPropsV1 = Readonly<{
  capture: FullExactCaptureStateV1;
  acceptance:
    | PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV1
    | PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV2
    | null;
}>;

/** One diagnostic line only; the table remains the primary work surface. */
export function PatternImportDxfPhaseEGoldenCardFullExactCaptureStatusV1({
  capture,
  acceptance,
}: PatternImportDxfPhaseEGoldenCardFullExactCaptureStatusPropsV1) {
  if (capture.status === 'idle') return null;
  const exactOperationCount = capture.result?.ok
    ? capture.result.coverage.exactOperationCount
    : null;
  const blocker = capture.result && !capture.result.ok ? capture.result.blocker : null;
  return (
    <div
      className='flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2'
      data-golden-card-full-exact-capture={capture.status}
      data-golden-card-beta-acceptance={acceptance?.status ?? 'pending'}
    >
      <Text component='p' size='micro' variant={blocker ? 'errorLabel' : 'label'}>
        {capture.status === 'loading'
          ? 'Reading exact operation coverage…'
          : blocker
            ? `Exact capture blocked · ${blocker.code}`
            : `Exact operation graph ready · ${exactOperationCount ?? 0} operations`}
      </Text>
      {acceptance ? (
        <Text component='span' size='micro' variant='label' className='tabular-nums'>
          Beta gate {acceptance.status} · {acceptance.acceptance.blockers.length} remaining
        </Text>
      ) : null}
    </div>
  );
}

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripDispatchV1 = Readonly<{
  /** One-shot key minted by the existing explicit save action; reusing it must never write again. */
  dispatchKey: string;
  /** Binds the dispatch to the operator's explicit saved-snapshot selection in this mount. */
  selectedCandidateId: string;
  capabilities: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripCapabilitiesV1;
  request: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripRequestV1;
}>;

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripStateV1 = Readonly<{
  status: 'idle' | 'loading' | 'accepted' | 'blocked' | 'unknown';
  dispatchKey: string | null;
  result: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripResultV1 | null;
  mountBlocker: Readonly<{ code: string; detail: string }> | null;
}>;

const IDLE_POST_SAVE_ROUNDTRIP: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripStateV1 =
  Object.freeze({ status: 'idle', dispatchKey: null, result: null, mountBlocker: null });

export function buildPatternImportDxfPhaseEGoldenCardProductionBetaAcceptanceV1(
  input: Readonly<{
    preflight: PatternImportDxfPhaseEGoldenCardPreflightCardControllerResultV1;
    liveRead: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null;
    fullExactCapture: PatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerResultV1 | null;
    v2Capture: PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2 | null;
    /** Once a caller supplied a V2 feed, a pending/invalid feed must never route to legacy V1. */
    v2Requested?: boolean;
  }>,
):
  | PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV1
  | PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerResultV2
  | null {
  if (input.v2Capture && input.liveRead?.ok)
    return buildPatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerV2({
      preflight: input.preflight,
      liveRead: input.liveRead,
      capture: input.v2Capture,
    });
  if (input.v2Requested) return null;
  if (!input.fullExactCapture?.ok || !input.liveRead) return null;
  return buildPatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerV1({
    preflight: input.preflight,
    liveRead: input.liveRead,
    aggregatedWholeCardCoverage: input.fullExactCapture.coverage,
    exactCapture: {
      authoritativeBaseline: null,
      observedOperationFamilies: null,
      tableReconstruction: null,
      postSaveReload: null,
    },
  });
}

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripReadinessV1 = Readonly<{
  active: boolean;
  supported: boolean;
  techCardId: number | null;
  selectedCandidateId: string | null;
  selectedSnapshotTechCardId: number | null;
  selectedSnapshotCardLockVersion: number | null;
  liveBaselineReady: boolean;
  capturedGraph: PatternImportDxfPhaseEGoldenCardFullExactCaptureGraphV1 | null;
  capturedCoverage: PatternImportDxfPhaseEGoldenWholeCardCoverageReceiptV1 | null;
}>;

export type PatternImportDxfPhaseEGoldenCardPostSaveRoundtripEligibilityV1 = Readonly<{
  status: 'waiting' | 'ready' | 'blocked';
  blocker: Readonly<{ code: string; detail: string }> | null;
}>;

function roundtripEligibility(
  status: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripEligibilityV1['status'],
  code?: string,
  detail?: string,
): PatternImportDxfPhaseEGoldenCardPostSaveRoundtripEligibilityV1 {
  return Object.freeze({
    status,
    blocker: code && detail ? Object.freeze({ code, detail }) : null,
  });
}

/**
 * Pure fail-closed join between a caller-authorized save dispatch and this mount's selected live
 * evidence. Reference equality for graph/coverage is intentional: a caller cannot substitute a
 * cloned or stale baseline after the capture owner completed.
 */
export function evaluatePatternImportDxfPhaseEGoldenCardPostSaveRoundtripEligibilityV1(
  dispatch: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripDispatchV1 | null,
  readiness: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripReadinessV1,
): PatternImportDxfPhaseEGoldenCardPostSaveRoundtripEligibilityV1 {
  if (!dispatch) return roundtripEligibility('waiting');
  if (
    typeof dispatch.dispatchKey !== 'string' ||
    !dispatch.dispatchKey ||
    new TextEncoder().encode(dispatch.dispatchKey).byteLength > 256 ||
    typeof dispatch.selectedCandidateId !== 'string' ||
    !dispatch.selectedCandidateId
  )
    return roundtripEligibility(
      'blocked',
      'invalid-dispatch',
      'A bounded one-shot dispatch key and explicit candidate identity are required.',
    );
  if (!readiness.active) return roundtripEligibility('waiting');
  if (!readiness.supported)
    return roundtripEligibility(
      'blocked',
      'unsupported-card',
      'Only the pinned production cards 6 and 11 admit this round-trip.',
    );
  if (!readiness.selectedCandidateId) return roundtripEligibility('waiting');
  if (dispatch.selectedCandidateId !== readiness.selectedCandidateId)
    return roundtripEligibility(
      'blocked',
      'selection-drift',
      'The authorized dispatch belongs to another explicit saved-snapshot selection.',
    );
  if (!readiness.liveBaselineReady || !readiness.capturedGraph || !readiness.capturedCoverage)
    return roundtripEligibility('waiting');

  const projector = dispatch.request?.beforeSave?.projectorRequest;
  if (
    !projector ||
    dispatch.request.beforeSave.wholeCardCoverage !== readiness.capturedCoverage ||
    projector.graph !== readiness.capturedGraph
  )
    return roundtripEligibility(
      'blocked',
      'live-evidence-drift',
      "The dispatch does not reuse this mount's completed live graph and coverage owners.",
    );
  if (
    projector.observedFacts?.techCardId !== readiness.techCardId ||
    projector.currentCard?.techCardId !== readiness.techCardId ||
    projector.graph?.techCardId !== readiness.techCardId ||
    projector.expectedCardLockVersion !== readiness.selectedSnapshotCardLockVersion ||
    projector.currentCard?.cardLockVersion !== readiness.selectedSnapshotCardLockVersion ||
    projector.graph?.cardLockVersion !== readiness.selectedSnapshotCardLockVersion ||
    projector.expectedServerAssemblyRevision !== projector.graph?.serverAssemblyRevision ||
    dispatch.request.tableReconstruction?.cardRef !== projector.graph?.cardRef
  )
    return roundtripEligibility(
      'blocked',
      'binding-drift',
      'The authorized dispatch is not bound to the selected card lock and captured Assembly revision.',
    );
  if (
    readiness.selectedSnapshotTechCardId !== readiness.techCardId ||
    readiness.selectedSnapshotCardLockVersion !== projector.graph.cardLockVersion
  )
    return roundtripEligibility(
      'blocked',
      'selection-binding-drift',
      'The selected saved row moved from the live captured card binding.',
    );
  return roundtripEligibility('ready');
}

export function PatternImportDxfPhaseEGoldenCardPostSaveRoundtripStatusV1({
  roundtrip,
}: Readonly<{ roundtrip: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripStateV1 }>) {
  if (roundtrip.status === 'idle') return null;
  const blocker = roundtrip.result?.blocker ?? roundtrip.mountBlocker;
  return (
    <div
      className='flex items-center justify-between gap-2 border-t border-hairline pt-2'
      data-golden-card-post-save-roundtrip={roundtrip.status}
    >
      <Text
        component='p'
        size='micro'
        variant={
          roundtrip.status === 'accepted' || roundtrip.status === 'loading' ? 'label' : 'errorLabel'
        }
      >
        {roundtrip.status === 'loading'
          ? 'Verifying saved card round-trip…'
          : roundtrip.status === 'accepted'
            ? 'Saved card round-trip accepted'
            : `Saved card round-trip ${roundtrip.status} · ${blocker?.code ?? 'runtime-blocked'}`}
      </Text>
    </div>
  );
}

export type PatternImportDxfPhaseEGoldenCardSnapshotSelectorPropsV1 = Readonly<{
  candidateSet: PatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1;
  receipt: PatternImportDxfPhaseEGoldenCardSnapshotSelectionReceiptV1 | null;
  selectionBlocker?: string | null;
  onCandidateChange: (candidateId: string | null) => void;
}>;

/** Compact explicit selector. A unique candidate is still never selected on the operator's behalf. */
export function PatternImportDxfPhaseEGoldenCardSnapshotSelectorV1({
  candidateSet,
  receipt,
  selectionBlocker,
  onCandidateChange,
}: PatternImportDxfPhaseEGoldenCardSnapshotSelectorPropsV1) {
  if (candidateSet.status === 'blocked')
    return (
      <CalloutBox tone='warning'>
        <Text component='p' size='micro' data-golden-card-snapshot-blocker=''>
          {candidateSet.blocker?.detail ?? 'No exact saved snapshot is available.'}
        </Text>
      </CalloutBox>
    );

  return (
    <div
      className='grid gap-1.5'
      data-golden-card-snapshot-selector=''
      data-candidate-count={candidateSet.candidates.length}
      data-selection-state={receipt ? 'selected' : 'required'}
    >
      <div className='flex flex-wrap items-end gap-2'>
        <label className='min-w-0 flex-1 space-y-1'>
          <Text component='span' size='micro' variant='label'>
            EXACT SAVED SNAPSHOT
          </Text>
          <Select
            name='golden-card-snapshot-candidate'
            value={receipt?.candidateId ?? ''}
            items={[
              { value: '', label: '— choose saved operation —' },
              ...candidateSet.candidates.map(({ candidateId, label }) => ({
                value: candidateId,
                label,
              })),
            ]}
            placeholder='— choose saved operation —'
            fullWidth
            size='sm'
            onValueChange={(value) => onCandidateChange(value || null)}
          />
        </label>
        <Text component='span' size='micro' variant='label' className='pb-1 tabular-nums'>
          {candidateSet.candidates.length} exact · {candidateSet.rejections.length} excluded
        </Text>
      </div>
      {selectionBlocker ? (
        <CalloutBox tone='warning'>
          <Text component='p' size='micro' data-golden-card-selection-drift=''>
            {selectionBlocker}
          </Text>
        </CalloutBox>
      ) : null}
    </div>
  );
}

export type PatternImportDxfPhaseEGoldenCardPreflightProductionMountPropsV1 = Readonly<{
  techCard: common_TechCard | undefined;
  active: boolean;
  auditOwner: TechCardConstructionAuditOwnerV1;
  warningFacts: PatternImportDxfPhaseEGoldenCardWarningFactsV1 | null;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  /** Supplied only by the existing explicit save action; absence keeps this mount read-only. */
  postSaveRoundtripDispatch?: PatternImportDxfPhaseEGoldenCardPostSaveRoundtripDispatchV1 | null;
  /**
   * Optional caller-owned V2 evidence. The mount consumes it only after its current live read and
   * never manufactures missing per-operation reconstruction snapshots.
   */
  betaAcceptanceV2Capture?: PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2 | null;
  /**
   * Sanitized output of the application Composite V4 restore/reconstruction/readback owners. The
   * mount joins it to its own live structural read and builds V2 coverage fail-closed.
   */
  betaAcceptanceV2Feed?: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1 | null;
}>;

function ownerStatus(
  active: boolean,
  pending: boolean,
  failed: boolean,
  ready: boolean,
): SharedOwnerStatusV1 {
  if (!active) return 'idle';
  if (failed) return 'failed';
  if (pending) return 'loading';
  return ready ? 'ready' : 'idle';
}

/**
 * Real card-level read-only mount. It can start only the existing saved-snapshot read, and only
 * after an explicit candidate receipt has been revalidated against the current loaded card.
 */
export function PatternImportDxfPhaseEGoldenCardPreflightProductionMountV1({
  techCard,
  active,
  auditOwner,
  warningFacts,
  orderSizeIds,
  sizeNameById,
  postSaveRoundtripDispatch = null,
  betaAcceptanceV2Capture = null,
  betaAcceptanceV2Feed = null,
}: PatternImportDxfPhaseEGoldenCardPreflightProductionMountPropsV1) {
  const profile = PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_SUITE_PROFILES_V1.find(
    ({ facts }) => facts.techCardId === techCard?.id,
  );
  const supported = !!profile;
  const candidateSet = useMemo(
    () =>
      buildPatternImportDxfPhaseEGoldenCardSnapshotCandidateSetV1({
        techCard,
        orderSizeIds,
        sizeNameById,
      }),
    [orderSizeIds, sizeNameById, techCard],
  );
  const candidateFingerprint = useMemo(
    () =>
      candidateSet.candidates
        .map(({ candidateId, snapshotRequest }) =>
          [
            candidateId,
            snapshotRequest.expectedCardLockVersion,
            snapshotRequest.expectedSavedRowRevision,
            snapshotRequest.expectedUrl,
            snapshotRequest.expectedSizeBytes,
            snapshotRequest.expectedSha256,
          ].join('\u0000'),
        )
        .join('\u0001'),
    [candidateSet.candidates],
  );
  const [receipt, setReceipt] =
    useState<PatternImportDxfPhaseEGoldenCardSnapshotSelectionReceiptV1 | null>(null);
  const [liveRead, setLiveRead] = useState<LiveReadStateV1>(IDLE_LIVE_READ);
  const [fullExactCapture, setFullExactCapture] =
    useState<FullExactCaptureStateV1>(IDLE_FULL_EXACT_CAPTURE);
  const [postSaveRoundtrip, setPostSaveRoundtrip] =
    useState<PatternImportDxfPhaseEGoldenCardPostSaveRoundtripStateV1>(IDLE_POST_SAVE_ROUNDTRIP);
  const activeRead = useRef<AbortController | null>(null);
  const activeRoundtrip = useRef<Readonly<{
    dispatchKey: string;
    controller: AbortController;
  }> | null>(null);
  const consumedRoundtripDispatches = useRef(new Set<string>());
  const fullExactCaptureOwner = useMemo(
    () =>
      createPatternImportDxfPhaseEGoldenCardFullExactCaptureOwnerV1((expected, signal) =>
        createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
          expected.selectedOperationNumber,
        ).authorityAdapter.readAuthoritativeAssembly(expected, signal),
      ),
    [],
  );

  useEffect(() => {
    activeRead.current?.abort();
    activeRead.current = null;
    activeRoundtrip.current?.controller.abort();
    activeRoundtrip.current = null;
    fullExactCaptureOwner.cancel();
    setReceipt(null);
    setLiveRead(IDLE_LIVE_READ);
    setFullExactCapture(IDLE_FULL_EXACT_CAPTURE);
    setPostSaveRoundtrip(IDLE_POST_SAVE_ROUNDTRIP);
  }, [candidateFingerprint, fullExactCaptureOwner]);
  useEffect(() => {
    if (active) return;
    activeRead.current?.abort();
    activeRead.current = null;
    activeRoundtrip.current?.controller.abort();
    activeRoundtrip.current = null;
    fullExactCaptureOwner.cancel();
    setLiveRead(IDLE_LIVE_READ);
    setFullExactCapture(IDLE_FULL_EXACT_CAPTURE);
    setPostSaveRoundtrip(IDLE_POST_SAVE_ROUNDTRIP);
  }, [active, fullExactCaptureOwner]);
  useEffect(
    () => () => {
      activeRead.current?.abort();
      activeRoundtrip.current?.controller.abort();
      fullExactCaptureOwner.dispose();
    },
    [fullExactCaptureOwner],
  );

  const auditFacts = useMemo(
    () => projectTechCardConstructionAuditSharedFactsV1(techCard?.id, auditOwner),
    [auditOwner, techCard?.id],
  );
  const aggregate = useMemo(
    () =>
      buildPatternImportDxfPhaseEGoldenCardAggregateMetricsV1({
        techCard,
        warningFacts,
        auditFacts,
      }),
    [auditFacts, techCard, warningFacts],
  );
  const resolvedSelection = useMemo(
    () => resolvePatternImportDxfPhaseEGoldenCardSnapshotSelectionV1(candidateSet, receipt),
    [candidateSet, receipt],
  );
  const cardStatus = ownerStatus(
    active,
    !techCard,
    aggregate.status === 'blocked',
    !!aggregate.cardFacts,
  );
  const auditStatus = ownerStatus(active, auditOwner.isPending, auditOwner.isError, !!auditFacts);
  const controllerInput: PatternImportDxfPhaseEGoldenCardPreflightCardControllerInputV1 = {
    techCardId: techCard?.id ?? 0,
    cardOwner: { status: cardStatus, facts: aggregate.cardFacts },
    auditOwner: { status: auditStatus, facts: auditFacts },
    snapshotRequest: resolvedSelection.ok ? resolvedSelection.snapshotRequest : null,
    liveRead,
    harness: null,
  };
  const controller =
    buildPatternImportDxfPhaseEGoldenCardPreflightCardControllerV1(controllerInput);
  const productionV2Feed = useMemo(
    () =>
      betaAcceptanceV2Feed
        ? buildPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
            techCard?.id ?? 0,
            liveRead.result,
            betaAcceptanceV2Feed,
          )
        : null,
    [betaAcceptanceV2Feed, liveRead.result, techCard?.id],
  );
  const betaAcceptance = buildPatternImportDxfPhaseEGoldenCardProductionBetaAcceptanceV1({
    preflight: controller,
    liveRead: liveRead.result,
    fullExactCapture: fullExactCapture.result,
    v2Capture: productionV2Feed?.capture ?? betaAcceptanceV2Capture,
    v2Requested: betaAcceptanceV2Feed !== null || betaAcceptanceV2Capture !== null,
  });
  const postSaveRoundtripEligibility = useMemo(
    () =>
      evaluatePatternImportDxfPhaseEGoldenCardPostSaveRoundtripEligibilityV1(
        postSaveRoundtripDispatch,
        {
          active,
          supported,
          techCardId: techCard?.id ?? null,
          selectedCandidateId: receipt?.candidateId ?? null,
          selectedSnapshotTechCardId: resolvedSelection.ok
            ? resolvedSelection.snapshotRequest.techCardId
            : null,
          selectedSnapshotCardLockVersion: resolvedSelection.ok
            ? resolvedSelection.snapshotRequest.expectedCardLockVersion
            : null,
          liveBaselineReady: liveRead.status === 'ready' && liveRead.result?.ok === true,
          capturedGraph:
            fullExactCapture.result?.ok === true ? fullExactCapture.result.graph : null,
          capturedCoverage:
            fullExactCapture.result?.ok === true ? fullExactCapture.result.coverage : null,
        },
      ),
    [
      active,
      fullExactCapture.result,
      liveRead.result,
      liveRead.status,
      postSaveRoundtripDispatch,
      receipt?.candidateId,
      resolvedSelection,
      supported,
      techCard?.id,
    ],
  );

  useEffect(() => {
    const dispatch = postSaveRoundtripDispatch;
    if (!dispatch) {
      activeRoundtrip.current?.controller.abort();
      activeRoundtrip.current = null;
      setPostSaveRoundtrip(IDLE_POST_SAVE_ROUNDTRIP);
      return;
    }
    if (postSaveRoundtripEligibility.status === 'waiting') return;
    if (postSaveRoundtripEligibility.status === 'blocked') {
      activeRoundtrip.current?.controller.abort();
      activeRoundtrip.current = null;
      setPostSaveRoundtrip(
        Object.freeze({
          status: 'blocked',
          dispatchKey: dispatch.dispatchKey,
          result: null,
          mountBlocker: postSaveRoundtripEligibility.blocker,
        }),
      );
      return;
    }
    if (consumedRoundtripDispatches.current.has(dispatch.dispatchKey)) {
      setPostSaveRoundtrip((current) =>
        current.dispatchKey === dispatch.dispatchKey
          ? current
          : Object.freeze({
              status: 'blocked' as const,
              dispatchKey: dispatch.dispatchKey,
              result: null,
              mountBlocker: Object.freeze({
                code: 'dispatch-already-consumed',
                detail: 'A one-shot save dispatch cannot invoke the existing writer twice.',
              }),
            }),
      );
      return;
    }

    consumedRoundtripDispatches.current.add(dispatch.dispatchKey);
    const controller = new AbortController();
    activeRoundtrip.current = Object.freeze({
      dispatchKey: dispatch.dispatchKey,
      controller,
    });
    setPostSaveRoundtrip(
      Object.freeze({
        status: 'loading',
        dispatchKey: dispatch.dispatchKey,
        result: null,
        mountBlocker: null,
      }),
    );
    void runPatternImportDxfPhaseEGoldenCardPostSaveRoundtripV1(
      dispatch.capabilities,
      dispatch.request,
      controller.signal,
    ).then(
      (result) => {
        if (
          controller.signal.aborted ||
          activeRoundtrip.current?.controller !== controller ||
          activeRoundtrip.current.dispatchKey !== dispatch.dispatchKey
        )
          return;
        activeRoundtrip.current = null;
        setPostSaveRoundtrip(
          Object.freeze({
            status: result.status,
            dispatchKey: dispatch.dispatchKey,
            result,
            mountBlocker: null,
          }),
        );
      },
      (error: unknown) => {
        if (
          controller.signal.aborted ||
          activeRoundtrip.current?.controller !== controller ||
          activeRoundtrip.current.dispatchKey !== dispatch.dispatchKey
        )
          return;
        activeRoundtrip.current = null;
        setPostSaveRoundtrip(
          Object.freeze({
            status: 'unknown',
            dispatchKey: dispatch.dispatchKey,
            result: null,
            mountBlocker: Object.freeze({
              code: 'roundtrip-owner-threw',
              detail:
                error instanceof Error
                  ? error.message
                  : 'The round-trip owner failed with an unknown outcome.',
            }),
          }),
        );
      },
    );

    return () => {
      if (activeRoundtrip.current?.controller !== controller) return;
      controller.abort();
      activeRoundtrip.current = null;
      setPostSaveRoundtrip((current) =>
        current.dispatchKey === dispatch.dispatchKey && current.status === 'loading'
          ? Object.freeze({
              status: 'unknown' as const,
              dispatchKey: dispatch.dispatchKey,
              result: null,
              mountBlocker: Object.freeze({
                code: 'roundtrip-superseded',
                detail: 'The authorized round-trip was invalidated before verified readback.',
              }),
            })
          : current,
      );
    };
  }, [postSaveRoundtripDispatch, postSaveRoundtripEligibility]);

  const changeCandidate = useCallback(
    (candidateId: string | null) => {
      activeRead.current?.abort();
      activeRead.current = null;
      activeRoundtrip.current?.controller.abort();
      activeRoundtrip.current = null;
      fullExactCaptureOwner.cancel();
      setLiveRead(IDLE_LIVE_READ);
      setFullExactCapture(IDLE_FULL_EXACT_CAPTURE);
      setPostSaveRoundtrip(IDLE_POST_SAVE_ROUNDTRIP);
      if (!candidateId) {
        setReceipt(null);
        return;
      }
      const selected = selectPatternImportDxfPhaseEGoldenCardSnapshotCandidateV1(
        candidateSet,
        candidateId,
      );
      setReceipt(selected.ok ? selected.receipt : null);
    },
    [candidateSet, fullExactCaptureOwner],
  );

  const readLiveBaseline = useCallback(
    async (request: PatternImportDxfPhaseEGoldenWholeCardLiveReaderRequestV1) => {
      if (
        !active ||
        !profile ||
        !techCard ||
        !resolvedSelection.ok ||
        candidateSet.status !== 'ready' ||
        candidateSet.expectedCardLockVersion === null
      )
        return;
      if (request.snapshotRequest !== resolvedSelection.snapshotRequest) return;

      activeRead.current?.abort();
      activeRoundtrip.current?.controller.abort();
      activeRoundtrip.current = null;
      fullExactCaptureOwner.cancel();
      const read = new AbortController();
      activeRead.current = read;
      setLiveRead(Object.freeze({ status: 'loading', result: null }));
      setFullExactCapture(IDLE_FULL_EXACT_CAPTURE);
      setPostSaveRoundtrip(IDLE_POST_SAVE_ROUNDTRIP);
      try {
        const rpc = createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(
          resolvedSelection.snapshotRequest.selectedOperationNumber,
        );
        let serverAssemblyRevision: string | null = null;
        const reader = createPatternImportDxfPhaseEGoldenWholeCardInjectedLiveReaderV1({
          async readSavedAssemblySnapshot(snapshotRequest, signal) {
            const snapshot = await rpc.bridge.readSavedAssemblySnapshot(snapshotRequest, signal);
            serverAssemblyRevision = snapshot.serverAssemblyRevision;
            return snapshot;
          },
        });
        const result = await reader.read(request, techCard, read.signal);
        if (activeRead.current !== read || read.signal.aborted) return;
        setLiveRead(Object.freeze({ status: result.ok ? 'ready' : 'failed', result }));
        if (!result.ok || !serverAssemblyRevision) {
          activeRead.current = null;
          return;
        }

        setFullExactCapture(Object.freeze({ status: 'loading', result: null }));
        const captured = await fullExactCaptureOwner.capture(
          Object.freeze({
            cardRef: profile.cardRef,
            expectedTechCardId: techCard.id ?? 0,
            expectedCardLockVersion: candidateSet.expectedCardLockVersion,
            expectedServerAssemblyRevision: serverAssemblyRevision,
            coverageTemplate: result.baseline.coverage,
            candidates: candidateSet.candidates,
          }),
          read.signal,
        );
        if (activeRead.current !== read || read.signal.aborted) return;
        activeRead.current = null;
        setFullExactCapture(
          Object.freeze({ status: captured.ok ? 'ready' : 'failed', result: captured }),
        );
      } catch {
        if (activeRead.current !== read || read.signal.aborted) return;
        activeRead.current = null;
        setLiveRead(Object.freeze({ status: 'failed', result: null }));
        setFullExactCapture(Object.freeze({ status: 'failed', result: null }));
      }
    },
    [active, candidateSet, fullExactCaptureOwner, profile, resolvedSelection, techCard],
  );

  if (!supported) return null;
  const aggregateBlocker = aggregate.blockers[0]?.detail ?? null;
  const selectionBlocker =
    receipt && !resolvedSelection.ok ? resolvedSelection.blocker.detail : null;

  return (
    <Section
      title='golden reconstruction · read only'
      question='production cards 6 / 11'
      collapsible
      defaultOpen={false}
      className='mt-2'
    >
      <div className='space-y-2'>
        <PatternImportDxfPhaseEGoldenCardSnapshotSelectorV1
          candidateSet={candidateSet}
          receipt={receipt}
          selectionBlocker={selectionBlocker}
          onCandidateChange={changeCandidate}
        />
        {aggregateBlocker ? (
          <CalloutBox tone='warning'>
            <Text component='p' size='micro' data-golden-card-metric-blocker=''>
              {aggregateBlocker}
            </Text>
          </CalloutBox>
        ) : null}
        <PatternImportDxfPhaseEGoldenCardPreflightCardControllerV1
          {...controllerInput}
          onReadLiveBaseline={active ? (request) => void readLiveBaseline(request) : undefined}
        />
        <PatternImportDxfPhaseEGoldenCardFullExactCaptureStatusV1
          capture={fullExactCapture}
          acceptance={betaAcceptance}
        />
        <PatternImportDxfPhaseEGoldenCardPostSaveRoundtripStatusV1 roundtrip={postSaveRoundtrip} />
      </div>
    </Section>
  );
}
