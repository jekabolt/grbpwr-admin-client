import type { PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2 } from './golden-card-beta-acceptance-owner-v2';
import {
  verifyPatternImportDxfPhaseEGoldenCardReconstructionV1,
  type PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1,
} from './golden-card-reconstruction-v1';
import {
  buildPatternImportDxfPhaseEGoldenWholeCardBaselineV2,
  type PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2,
} from './golden-whole-card-baseline-v2';
import type { PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 } from './golden-whole-card-live-reader-v1';
import { readPatternImportDxfProductExactNSeamRestorePatchV2 } from './composite-sidecar-restore-authority-v4';
import type { PatternImportDxfProductCompositeSidecarTransactionResultV4 } from './composite-sidecar-transaction-v4';
import {
  isExactNSeamDocumentLockCurrent,
  subscribeExactNSeamDocumentRetirement,
} from './exact-n-seam-production-session-store-v2';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PRODUCTION_V2_SNAPSHOT_FEED_V1 =
  'pattern-import-dxf-phase-e-golden-card-production-v2-snapshot-feed/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PRODUCTION_V2_SNAPSHOT_FEED_CLAIMS_V1 =
  Object.freeze({
    existingLiveReaderStructuralJoinReused: true,
    callerOwnedSanitizedPerOperationSnapshotsRequired: true,
    v2CoverageBuilderReused: true,
    invalidExactProjectionDowngradedToMissingCoverage: true,
    invalidExactProjectionFallsBackToV1: false,
    uiFormStateUsedAsAuthority: false,
    networkUsed: false,
    networkWriteAvailable: false,
    persistenceCreated: false,
    verifiedCompositeV4TransactionRequiredForPublication: true,
    oneVerifiedTransactionRequiredPerExactProjection: true,
    sessionOnlyFeedRetained: true,
    createsTopologyAuthority: false,
    createsAssemblyAuthority: false,
  } as const);

/**
 * Evidence already owned by the Composite V4 restore/reconstruction/readback call chain. This
 * boundary deliberately carries sanitized documents only; raw sidecars, DXF and UI state are not
 * accepted here.
 */
export type PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1 = Readonly<{
  techCardId: number;
  cardRef: string;
  exactOperationProjections: readonly PatternImportDxfPhaseEGoldenWholeCardExactOperationProjectionV2[];
  authoritativeBaseline: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
  observedOperationFamilies: readonly string[];
  tableReconstruction: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
  postSaveReload: PatternImportDxfPhaseEGoldenCardReconstructionSnapshotV1;
}>;

export type PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedResultV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PRODUCTION_V2_SNAPSHOT_FEED_V1;
  capture: PatternImportDxfPhaseEGoldenCardBetaAcceptanceOwnerCaptureV2;
  exactProjectionStatus: 'verified' | 'missing';
  blocker: Readonly<{ code: string; detail: string }> | null;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PRODUCTION_V2_SNAPSHOT_FEED_CLAIMS_V1;
}>;

const feeds = new Map<
  number,
  Readonly<{
    cardLockVersion: number;
    feed: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1;
  }>
>();
const listeners = new Map<number, Set<() => void>>();

function publish(techCardId: number): void {
  for (const listener of listeners.get(techCardId) ?? []) listener();
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

export function readPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
  techCardId: number | undefined,
): PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1 | null {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return null;
  const current = feeds.get(techCardId);
  return current && isExactNSeamDocumentLockCurrent(techCardId, current.cardLockVersion)
    ? current.feed
    : null;
}

export function subscribePatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return () => {};
  const current = listeners.get(techCardId) ?? new Set<() => void>();
  current.add(listener);
  listeners.set(techCardId, current);
  const stopRetirement = subscribeExactNSeamDocumentRetirement(techCardId, () => {
    const saved = feeds.get(techCardId);
    if (saved && !isExactNSeamDocumentLockCurrent(techCardId, saved.cardLockVersion))
      clearPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(techCardId);
  });
  return () => {
    stopRetirement();
    current.delete(listener);
    if (!current.size) listeners.delete(techCardId);
  };
}

export function clearPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
  techCardId: number | undefined,
): void {
  if (!techCardId || !feeds.delete(techCardId)) return;
  publish(techCardId);
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * The only publisher. It accepts a genuine verified Composite V4 transaction owner, reopens its
 * opaque restore patch and exact-matches the sanitized operation snapshot before session delivery.
 */
export function publishPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
  transaction: PatternImportDxfProductCompositeSidecarTransactionResultV4,
  feed: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
): boolean {
  if (!transaction?.ok || transaction.writeOutcome !== 'verified') return false;
  let detached: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1;
  try {
    detached = deepFreeze(structuredClone(feed));
  } catch {
    return false;
  }
  const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(transaction.owner);
  if (
    !patch ||
    patch.bindings.row.techCardId !== detached?.techCardId ||
    detached.exactOperationProjections.length !== 1 ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      detached.authoritativeBaseline,
      detached.authoritativeBaseline,
    ).ok ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      detached.tableReconstruction,
      detached.tableReconstruction,
    ).ok ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      detached.postSaveReload,
      detached.postSaveReload,
    ).ok
  )
    return false;
  const operationNumber = patch.bindings.selectedOperation.sourceOperationNumber;
  const projection = detached.exactOperationProjections.find(
    (candidate) => candidate.operationNumber === operationNumber,
  );
  const snapshotOperation = projection?.snapshot.operations[0];
  if (
    !projection ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      projection.snapshot,
      projection.snapshot,
    ).ok ||
    projection.snapshot.operations.length !== 1 ||
    snapshotOperation?.card.number !== operationNumber ||
    !sameOrdered(snapshotOperation.assembly.seamIds, patch.bindings.selectedOperation.seamIds) ||
    !sameOrdered(
      projection.snapshot.connections.map(({ connectionRef }) => connectionRef),
      patch.bindings.selectedOperation.seamIds,
    ) ||
    patch.seams.some((seam, seamIndex) => {
      const connection = projection.snapshot.connections[seamIndex];
      return (
        !connection ||
        connection.connectionRef !== seam.seamId ||
        connection.sides.some((side, sideIndex) => {
          const exact = seam.sides[sideIndex];
          return (
            !exact ||
            side.pieceId !== exact.pieceId ||
            side.pieceLineKey !== exact.pieceLineKey ||
            side.contourId !== exact.contourId ||
            !sameOrdered(side.boundaryVertexIds, exact.boundaryVertexIds) ||
            side.direction !== exact.direction
          );
        })
      );
    })
  )
    return false;
  try {
    const { techCardId, cardLockVersion } = patch.bindings.row;
    if (!isExactNSeamDocumentLockCurrent(techCardId, cardLockVersion)) return false;
    const prior = feeds.get(techCardId);
    if (prior && prior.cardLockVersion > cardLockVersion) return false;
    const current = prior?.cardLockVersion === cardLockVersion ? prior.feed : null;
    if (
      current &&
      (current.cardRef !== detached.cardRef ||
        JSON.stringify(current.authoritativeBaseline) !==
          JSON.stringify(detached.authoritativeBaseline) ||
        JSON.stringify(current.observedOperationFamilies) !==
          JSON.stringify(detached.observedOperationFamilies) ||
        JSON.stringify(current.tableReconstruction) !==
          JSON.stringify(detached.tableReconstruction) ||
        JSON.stringify(current.postSaveReload) !== JSON.stringify(detached.postSaveReload))
    )
      return false;
    const exactOperationProjections = [
      ...(current?.exactOperationProjections.filter(
        (candidate) => candidate.operationNumber !== operationNumber,
      ) ?? []),
      projection,
    ].sort((left, right) => left.operationNumber - right.operationNumber);
    feeds.set(techCardId, {
      cardLockVersion,
      feed: deepFreeze({ ...detached, exactOperationProjections }),
    });
    publish(techCardId);
    return true;
  } catch {
    return false;
  }
}

function missingCoverage(
  liveRead: Extract<PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1, { ok: true }>,
) {
  const operations = liveRead.baseline.baseline.operations;
  return buildPatternImportDxfPhaseEGoldenWholeCardBaselineV2({
    cardRef: liveRead.baseline.baseline.cardRef,
    snapshotOperations: operations.map(
      ({ operationNumber, work, inputKeys, outputUnitKey, outputUnitName, seamKeys }) => ({
        operationNumber,
        work,
        inputKeys,
        outputUnitKey,
        outputUnitName,
        seamKeys,
      }),
    ),
    currentOperations: operations.map(
      ({ operationNumber, work, inputKeys, outputUnitKey, outputUnitName, seamKeys, stitch }) => ({
        operationNumber,
        work,
        inputKeys,
        outputUnitKey,
        outputUnitName,
        seamKeys,
        stitch,
      }),
    ),
    exactOperationProjections: [],
  });
}

/**
 * Joins the production live read with caller-owned exact-N snapshots. A bad supplied projection is
 * never allowed to select legacy V1: it becomes explicit V2 missing coverage and therefore blocks.
 */
export function buildPatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1(
  techCardId: number,
  liveRead: PatternImportDxfPhaseEGoldenWholeCardLiveReaderResultV1 | null,
  feed: PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedV1,
): PatternImportDxfPhaseEGoldenCardProductionV2SnapshotFeedResultV1 | null {
  if (!liveRead?.ok) return null;
  const operations = liveRead.baseline.baseline.operations;
  const request = {
    cardRef: liveRead.baseline.baseline.cardRef,
    snapshotOperations: operations.map(
      ({ operationNumber, work, inputKeys, outputUnitKey, outputUnitName, seamKeys }) => ({
        operationNumber,
        work,
        inputKeys,
        outputUnitKey,
        outputUnitName,
        seamKeys,
      }),
    ),
    currentOperations: operations.map(
      ({ operationNumber, work, inputKeys, outputUnitKey, outputUnitName, seamKeys, stitch }) => ({
        operationNumber,
        work,
        inputKeys,
        outputUnitKey,
        outputUnitName,
        seamKeys,
        stitch,
      }),
    ),
    exactOperationProjections: feed.exactOperationProjections,
  } as const;
  const identityIssue =
    feed.techCardId !== techCardId || feed.cardRef !== liveRead.baseline.baseline.cardRef
      ? 'The exact-N feed belongs to another card identity.'
      : null;
  const exact = identityIssue
    ? null
    : buildPatternImportDxfPhaseEGoldenWholeCardBaselineV2(request);
  const fallback = exact?.ok ? exact : missingCoverage(liveRead);
  if (!fallback.ok) return null;
  const complete =
    exact?.ok === true &&
    exact.coverage.missingExactOperationCount === 0 &&
    exact.coverage.exactOperationCount === exact.coverage.seamBearingOperationCount;

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PRODUCTION_V2_SNAPSHOT_FEED_V1,
    capture: Object.freeze({
      wholeCardCoverage: fallback.coverage,
      exactCapture: Object.freeze({
        authoritativeBaseline: feed.authoritativeBaseline,
        observedOperationFamilies: Object.freeze([...feed.observedOperationFamilies]),
        tableReconstruction: feed.tableReconstruction,
        postSaveReload: feed.postSaveReload,
      }),
    }),
    exactProjectionStatus: complete ? ('verified' as const) : ('missing' as const),
    blocker: complete
      ? null
      : Object.freeze({
          code: identityIssue
            ? 'feed-card-binding-mismatch'
            : exact?.ok
              ? 'exact-operation-projection-missing'
              : 'exact-operation-projection-invalid',
          detail:
            identityIssue ??
            (exact?.ok
              ? 'Every seam-bearing operation requires one caller-owned exact snapshot.'
              : null) ??
            (exact && !exact.ok ? exact.blocker.detail : null) ??
            'The supplied exact-N projection failed closed.',
        }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_PRODUCTION_V2_SNAPSHOT_FEED_CLAIMS_V1,
  });
}
