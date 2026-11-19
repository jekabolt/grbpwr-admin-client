import {
  resolvePatternImportDxfProductExactNSeamProductionMountV2,
  type PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
} from './exact-n-seam-production-mount-v2';
import {
  readPatternImportDxfProductExactNSeamRestorePatchV2,
  type PatternImportDxfProductExactNSeamRestoreOwnerV2,
} from './composite-sidecar-restore-authority-v4';
import { verifyPatternImportDxfPhaseEGoldenCardReconstructionV1 } from './golden-card-reconstruction-v1';
import { storeExactNSeamProductionSession } from './exact-n-seam-production-session-store-v2';

export {
  clearPatternImportDxfProductExactNSeamProductionSessionV2,
  readPatternImportDxfProductExactNSeamProductionSessionV2,
  subscribePatternImportDxfProductExactNSeamProductionSessionV2,
} from './exact-n-seam-production-session-store-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PRODUCTION_SESSION_CLAIMS_V2 = Object.freeze({
  genuineAtomicSelectionOwnerRequired: true,
  completeSelectionRequired: true,
  callerOwnedSanitizedFeedRequired: true,
  durableReloadWithoutGoldenFeedRequiresGenuineRestoreOwner: true,
  cardAndOperationBindingExactMatched: true,
  sessionOnlyIngress: true,
  persistenceCreated: false,
  networkCreated: false,
  uiStateReconstructionUsed: false,
  fromScratchCarrierBuilderIntegrated: false,
} as const);

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCurrent(
  left: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2['current'],
  right: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2['current'],
): boolean {
  return (
    left.row.techCardId === right.row.techCardId &&
    left.row.scopeKey === right.row.scopeKey &&
    left.row.patternLineKey === right.row.patternLineKey &&
    left.row.revision === right.row.revision &&
    left.row.cardLockVersion === right.row.cardLockVersion &&
    left.row.url === right.row.url &&
    left.row.sizeBytes === right.row.sizeBytes &&
    left.row.sha256 === right.row.sha256 &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.assemblyTopologySha256 === right.assemblyTopologySha256 &&
    left.selectedOperation.sourceOperationNumber ===
      right.selectedOperation.sourceOperationNumber &&
    left.selectedOperation.authoringOperationId === right.selectedOperation.authoringOperationId &&
    left.selectedOperation.localOperationOrder === right.selectedOperation.localOperationOrder &&
    sameOrdered(left.selectedOperation.seamIds, right.selectedOperation.seamIds) &&
    left.catalogCanonicalSha256 === right.catalogCanonicalSha256 &&
    left.phaseEAggregatePlanSha256 === right.phaseEAggregatePlanSha256
  );
}

/** Durable no-feed ingress requires the opaque restore owner that minted this exact selection. */
export function publishPatternImportDxfProductExactNSeamDurableReloadSessionV2(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  restoreOwner: PatternImportDxfProductExactNSeamRestoreOwnerV2,
): boolean {
  const resolved = resolvePatternImportDxfProductExactNSeamProductionMountV2(session, 0);
  const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(restoreOwner);
  const techCardId = session?.current?.row?.techCardId;
  if (
    !resolved.ok ||
    !patch ||
    typeof techCardId !== 'number' ||
    !Number.isSafeInteger(techCardId) ||
    techCardId < 1 ||
    !sameCurrent(session.current, patch.bindings) ||
    resolved.model.choices.seams.length !== patch.seams.length ||
    resolved.model.choices.seams.some((seam, seamIndex) => {
      const exact = patch.seams[seamIndex];
      return (
        !exact ||
        seam.seamId !== exact.seamId ||
        seam.sides.some((side, sideIndex) => {
          const exactSide = exact.sides[sideIndex];
          return (
            !exactSide ||
            side.pieceId !== exactSide.pieceId ||
            side.pieceLineKey !== exactSide.pieceLineKey ||
            side.contourId !== exactSide.contourId ||
            !sameOrdered(side.boundaryVertexIds, exactSide.boundaryVertexIds) ||
            side.direction !== exactSide.direction
          );
        })
      );
    })
  )
    return false;
  return storeExactNSeamProductionSession(techCardId, {
    selectionOwner: session.selectionOwner,
    current: session.current,
  });
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
  if (
    !resolved.ok ||
    typeof techCardId !== 'number' ||
    !Number.isSafeInteger(techCardId) ||
    techCardId < 1
  )
    return false;
  if (!feed) return false;
  const projection = feed?.exactOperationProjections.find(
    (candidate) => candidate.operationNumber === operationNumber,
  );
  const snapshotOperation = projection?.snapshot.operations[0];
  if (
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
  return storeExactNSeamProductionSession(techCardId, frozen);
}
