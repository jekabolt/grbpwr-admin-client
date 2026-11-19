import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type {
  PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  PatternImportDxfProductExactNDesktopGeometryV2,
} from './exact-n-seam-production-mount-v2';
import type { PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1 } from './saved-assembly-authority-transport-v1';

function sameOrdered(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
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

/** Fast render gate: stale per-card cache must never route on operation number alone. */
export function matchesPatternImportDxfProductExactNSessionSavedBindingV1(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  row: DxfProductSavedRowIdentityV1,
  selectedOperationNumber: number,
  orderedSeamIds: readonly string[],
): boolean {
  return (
    sameRow(session.current.row, row) &&
    session.current.selectedOperation.sourceOperationNumber === selectedOperationNumber &&
    sameOrdered(session.current.selectedOperation.seamIds, orderedSeamIds)
  );
}

/** Async authority gate: even a row-matching cache waits for the fresh Assembly snapshot. */
export function matchesPatternImportDxfProductExactNSessionFreshAuthorityV1(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
  current: PatternImportDxfPhaseESavedAssemblyCurrentTopologyV1,
): boolean {
  const operation = current.topology.operations.find(
    ({ number }) => number === current.selectedOperationNumber,
  );
  return Boolean(
    operation &&
      sameRow(session.current.row, current.row) &&
      session.current.serverAssemblyRevision === current.serverAssemblyRevision &&
      session.current.assemblyTopologySha256 === current.assemblyTopologySha256 &&
      session.current.selectedOperation.sourceOperationNumber === current.selectedOperationNumber &&
      sameOrdered(session.current.selectedOperation.seamIds, operation.seamKeys),
  );
}

export function matchesPatternImportDxfProductExactNDesktopGeometryV2(
  geometry: PatternImportDxfProductExactNDesktopGeometryV2 | null,
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): geometry is PatternImportDxfProductExactNDesktopGeometryV2 {
  if (!geometry) return false;
  const { catalog, projection } = geometry;
  return (
    catalog.techCardId === session.current.row.techCardId &&
    catalog.scopeKey === session.current.row.scopeKey &&
    catalog.canonicalSha256 === session.current.catalogCanonicalSha256 &&
    projection.expectedCatalogCanonicalSha256 === catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === catalog.sourceFileId &&
    projection.sizeToken === catalog.sizeToken
  );
}

export function patternImportDxfProductExactNSessionValidationKeyV1(
  session: PatternImportDxfPhaseEExactNAssemblyOrderSessionV2,
): string {
  const { row, selectedOperation } = session.current;
  return JSON.stringify([
    row.techCardId,
    row.scopeKey,
    row.patternLineKey,
    row.revision,
    row.cardLockVersion,
    row.url,
    row.sizeBytes,
    row.sha256,
    session.current.serverAssemblyRevision,
    session.current.assemblyTopologySha256,
    selectedOperation.sourceOperationNumber,
    selectedOperation.authoringOperationId,
    selectedOperation.seamIds,
  ]);
}
