import {
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
  createDxfProductSavedNativeReprocessOwnerV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import {
  projectSavedFullAssemblyPhysicalSnapshotV1,
  type SavedFullAssemblyPhysicalSnapshotProjectionV1,
  type SavedFullAssemblyPhysicalSnapshotReceiptV1,
} from './saved-full-assembly-physical-snapshot-production-v1';
import { createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1 } from './saved-assembly-snapshot-production-rpc-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import {
  createPatternImportDxfPhaseESavedRowCardProjectionResolverV1,
  type PatternImportDxfPhaseESavedRowCardProjectionV1,
} from './saved-row-production-runtime-v1';

export const SAVED_FULL_ASSEMBLY_GENERIC_NATIVE_HANDOFF_V1 =
  'saved-full-assembly-generic-native-handoff/1' as const;

export const SAVED_FULL_ASSEMBLY_GENERIC_NATIVE_FIRST_AUTHORING_REQUIREMENTS_V1 = Object.freeze({
  verifiedPhysicalSnapshotRequired: true,
  minimumExactPieceCount: 3,
  explicitMetrePlacementsRequired: true,
  physicalInitializationRequired: true,
  v6VisualArrangementAutoPromotion: false,
  zeroOperationNonNativeSourceAccepted: false,
} as const);

/** The draft reference is deliberately the exact replay-owned object bound into sourceOwner. */
export type SavedFullAssemblyGenericNativeHandoffV1 = Readonly<{
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
}>;

export class SavedFullAssemblyGenericNativeHandoffErrorV1 extends Error {
  constructor(
    readonly code:
      | 'cancelled'
      | 'verified-physical-snapshot-required'
      | 'generic-fullgraph-required'
      | 'genuine-stitch-required'
      | 'explicit-physical-placement-required'
      | 'native-reprocess-blocked'
      | 'native-source-invalid'
      | 'saved-source-drift',
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
    this.name = 'SavedFullAssemblyGenericNativeHandoffErrorV1';
  }
}

const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
const add = EventTarget.prototype.addEventListener;
const remove = EventTarget.prototype.removeEventListener;

function fail(code: SavedFullAssemblyGenericNativeHandoffErrorV1['code'], detail: string): never {
  throw new SavedFullAssemblyGenericNativeHandoffErrorV1(code, detail);
}

function check(signal?: AbortSignal): void {
  if (signal !== undefined && aborted.call(signal))
    fail('cancelled', 'Generic native saved-source preparation was cancelled.');
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1) {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function projectVerifiedPhysical(
  receipt: SavedFullAssemblyPhysicalSnapshotReceiptV1,
): SavedFullAssemblyPhysicalSnapshotProjectionV1 {
  try {
    return projectSavedFullAssemblyPhysicalSnapshotV1(receipt);
  } catch (error) {
    fail(
      'verified-physical-snapshot-required',
      error instanceof Error
        ? `A live verified Full Assembly physical receipt is required: ${error.message}`
        : 'A live verified Full Assembly physical receipt is required.',
    );
  }
}

function validateFullGraphLane(projection: SavedFullAssemblyPhysicalSnapshotProjectionV1): number {
  const graphPieceIds = projection.graph.pieces.map(({ pieceId }) => pieceId);
  if (graphPieceIds.length < 3 || new Set(graphPieceIds).size !== graphPieceIds.length)
    fail(
      'generic-fullgraph-required',
      'The generic native handoff requires a verified Full Assembly graph with at least three distinct pieces.',
    );
  const stitch = projection.graph.operations.find(
    (operation) =>
      operation.kind === 'stitch' &&
      Number.isSafeInteger(operation.sourceOperationNumber) &&
      operation.sourceOperationNumber > 0 &&
      operation.seamIds.length > 0,
  );
  if (!stitch)
    fail(
      'genuine-stitch-required',
      'A positive seam-bearing graph stitch is required; zero-operation non-native authoring cannot be promoted.',
    );
  const placements = projection.physicalInitialization.placements;
  if (
    placements.length !== graphPieceIds.length ||
    new Set(placements.map(({ pieceId }) => pieceId)).size !== placements.length ||
    graphPieceIds.some((pieceId) => !placements.some((placement) => placement.pieceId === pieceId))
  )
    fail(
      'explicit-physical-placement-required',
      'Every graph piece requires one explicit SI-metre physical placement; a V6 visual arrangement is not promoted.',
    );
  return stitch.sourceOperationNumber;
}

function verifyReplayPieceLane(
  projection: SavedFullAssemblyPhysicalSnapshotProjectionV1,
  draft: DxfProductSavedNativeCompilerSourceRequestV1['draft'],
): void {
  const scopes = draft.scopes.filter(
    (scope) => scope.target.scopeKey === projection.row.scopeKey && scope.writerReplay,
  );
  const pieces = scopes.length === 1 ? scopes[0].writerReplay?.job.pieces : undefined;
  if (
    !pieces ||
    pieces.length < 3 ||
    new Set(pieces.map(({ identity }) => identity)).size !== pieces.length
  )
    fail(
      'native-source-invalid',
      'The genuine saved replay must expose one writer-backed row scope with at least three distinct pieces.',
    );
}

function sameVerifiedPhysical(
  left: SavedFullAssemblyPhysicalSnapshotProjectionV1,
  right: SavedFullAssemblyPhysicalSnapshotProjectionV1,
): boolean {
  return (
    sameRow(left.row, right.row) &&
    left.serverAssemblyRevision === right.serverAssemblyRevision &&
    left.freshSnapshotSha256 === right.freshSnapshotSha256 &&
    left.outer.sha256 === right.outer.sha256 &&
    left.graphCanonicalSha256 === right.graphCanonicalSha256 &&
    left.compileInputSha256 === right.compileInputSha256 &&
    left.physicalInitializationCanonicalSha256 === right.physicalInitializationCanonicalSha256
  );
}

/**
 * TABLE-owned production handoff for generic (3+ piece) saved Full Assembly. It reuses the single
 * saved-DXF production host, its downloader, disposable ImportWorker and native source owner. The
 * existing exact-two preparation owner and the non-native zero-operation path remain untouched.
 */
export const prepareSavedFullAssemblyGenericNativeHandoffV1 = Object.freeze(
  async function prepareSavedFullAssemblyGenericNativeHandoffV1(
    verifiedReceipt: SavedFullAssemblyPhysicalSnapshotReceiptV1,
    cardProjection: PatternImportDxfPhaseESavedRowCardProjectionV1,
    signal?: AbortSignal,
  ): Promise<SavedFullAssemblyGenericNativeHandoffV1> {
    check(signal);
    const physical = projectVerifiedPhysical(verifiedReceipt);
    const seedOperationNumber = validateFullGraphLane(physical);
    const snapshot =
      createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1(seedOperationNumber);
    const resolveCard =
      createPatternImportDxfPhaseESavedRowCardProjectionResolverV1(cardProjection);
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      resolveCard,
      readAuthoritativeRow: snapshot.bridge.readAuthoritativeRow,
    });
    let owner: ReturnType<typeof createDxfProductSavedNativeReprocessOwnerV1> | null = null;
    const cancel = () => owner?.cancel();
    try {
      owner = createDxfProductSavedNativeReprocessOwnerV1(host);
      if (signal) add.call(signal, 'abort', cancel, { once: true });
      check(signal);
      const replay = await owner.run({
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row: physical.row,
      });
      check(signal);
      if (!replay.ok)
        fail(
          'native-reprocess-blocked',
          replay.blockers[0]?.detail ?? 'The genuine saved native replay was blocked.',
        );
      if (
        replay.sourceOwner.version !== DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1 ||
        !sameRow(replay.row, physical.row)
      )
        fail(
          'native-source-invalid',
          'The native compiler source does not exact-match the verified Full Assembly row.',
        );
      verifyReplayPieceLane(physical, replay.draft);
      const confirmed = projectVerifiedPhysical(verifiedReceipt);
      if (!sameVerifiedPhysical(physical, confirmed))
        fail(
          'saved-source-drift',
          'The verified Full Assembly physical receipt changed during native source preparation.',
        );
      const sourceRequest = Object.freeze({
        schemaVersion: DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1,
        sourceFileId: replay.sourceFileId,
        sourceSha256: replay.row.sha256,
        techCardId: replay.row.techCardId,
        scopeKey: replay.row.scopeKey,
        patternLineKey: replay.row.patternLineKey,
        cardLockVersion: replay.row.cardLockVersion,
        draft: replay.draft,
      }) satisfies DxfProductSavedNativeCompilerSourceRequestV1;
      if (sourceRequest.draft !== replay.draft)
        fail('native-source-invalid', 'The original replay draft identity was not preserved.');
      return Object.freeze({ sourceOwner: replay.sourceOwner, sourceRequest });
    } finally {
      if (signal) remove.call(signal, 'abort', cancel);
      if (owner) owner.dispose();
      else host.dispose();
    }
  },
);
