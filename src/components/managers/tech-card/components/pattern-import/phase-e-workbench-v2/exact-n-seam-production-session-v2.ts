import {
  resolvePatternImportDxfProductExactNSeamProductionMountV2,
  type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
} from './exact-n-seam-production-mount-v2';
import { verifyPatternImportDxfPhaseEGoldenCardReconstructionV1 } from './golden-card-reconstruction-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PRODUCTION_SESSION_CLAIMS_V2 = Object.freeze({
  genuineAtomicSelectionOwnerRequired: true,
  completeSelectionRequired: true,
  callerOwnedSanitizedFeedRequired: true,
  cardAndOperationBindingExactMatched: true,
  sessionOnlyIngress: true,
  persistenceCreated: false,
  networkCreated: false,
  uiStateReconstructionUsed: false,
  fromScratchCarrierBuilderIntegrated: false,
} as const);

const sessions = new Map<number, PatternImportDxfPhaseEExactNAssemblyOrderSessionV2>();
const listeners = new Map<number, Set<() => void>>();

function notify(techCardId: number): void {
  for (const listener of listeners.get(techCardId) ?? []) listener();
}

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Session-only ingress for an already-restored V4 selection. The opaque selection owner is opened
 * by the existing workbench host resolver; passive props alone cannot publish a production session.
 */
export function publishPatternImportDxfProductExactNSeamProductionSessionV2(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): boolean {
  const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(session, 0);
  const techCardId = session?.current?.row?.techCardId;
  const operationNumber = session?.current?.selectedOperation?.sourceOperationNumber;
  const feed = session?.productionFeed;
  const projection = feed?.exactOperationProjections.find(
    (candidate) => candidate.operationNumber === operationNumber,
  );
  const snapshotOperation = projection?.snapshot.operations[0];
  if (
    !resolved.ok ||
    !feed ||
    typeof techCardId !== 'number' ||
    !Number.isSafeInteger(techCardId) ||
    techCardId < 1 ||
    feed.techCardId !== techCardId ||
    typeof feed.cardRef !== 'string' ||
    !feed.cardRef ||
    !Array.isArray(feed.observedOperationFamilies) ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      feed.authoritativeBaseline,
      feed.authoritativeBaseline,
    ).ok ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      feed.tableReconstruction,
      feed.tableReconstruction,
    ).ok ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      feed.postSaveReload,
      feed.postSaveReload,
    ).ok ||
    !projection ||
    !verifyPatternImportDxfPhaseEGoldenCardReconstructionV1(
      projection.snapshot,
      projection.snapshot,
    ).ok ||
    projection.snapshot.operations.length !== 1 ||
    snapshotOperation?.card.number !== operationNumber ||
    !sameOrdered(snapshotOperation.assembly.seamIds, session.current.selectedOperation.seamIds) ||
    !sameOrdered(
      projection.snapshot.connections.map(({ connectionRef }) => connectionRef),
      session.current.selectedOperation.seamIds,
    ) ||
    resolved.model.choices.seams.some((seam, seamIndex) => {
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
  const frozen = Object.freeze({
    selectionOwner: session.selectionOwner,
    current: session.current,
    productionFeed: feed,
  });
  sessions.set(techCardId, frozen);
  notify(techCardId);
  return true;
}

export function readPatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
): PatternImportDxfPhaseEExactNAssemblyOrderSessionV2 | null {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return null;
  return sessions.get(techCardId) ?? null;
}

export function subscribePatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
  listener: () => void,
): () => void {
  if (!techCardId || !Number.isSafeInteger(techCardId) || techCardId < 1) return () => {};
  const current = listeners.get(techCardId) ?? new Set<() => void>();
  current.add(listener);
  listeners.set(techCardId, current);
  return () => {
    current.delete(listener);
    if (!current.size) listeners.delete(techCardId);
  };
}

export function clearPatternImportDxfProductExactNSeamProductionSessionV2(
  techCardId: number | undefined,
): void {
  if (!techCardId || !sessions.delete(techCardId)) return;
  notify(techCardId);
}
