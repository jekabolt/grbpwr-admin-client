import type { PatternImportDxfPhaseECadMannequinDxfStagingSourceV1 } from './cad-mannequin-dxf-staging-v1';
import { patternImportDxfPhaseECadTablePieceKeyV1 } from './cad-table-piece-layout-session-v1';
import { CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1 } from './cad-mannequin-arrangement-document-v1';

export type CadMannequinTableSelectionV1 = Pick<
  PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
  'scopeKey' | 'projection'
> & {
  readonly selectedPieceKeys: readonly string[];
};

export function cadMannequinPlacementGroupKeysV1(
  selection: CadMannequinTableSelectionV1 | undefined,
  source: Pick<
    PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
    'scopeKey' | 'projection'
  > | null,
): readonly string[] {
  if (!selection || !source || selection.scopeKey !== source.scopeKey) return [];
  const table = selection.projection;
  const staged = source.projection;
  const keys = new Set(selection.selectedPieceKeys);
  if (
    keys.size < 2 ||
    keys.size !== selection.selectedPieceKeys.length ||
    keys.size > CAD_MANNEQUIN_ARRANGEMENT_LIMITS_V1.maxPieces ||
    table.sourceFileId !== staged.sourceFileId ||
    table.sizeToken !== staged.sizeToken ||
    table.expectedCatalogCanonicalSha256 !== staged.expectedCatalogCanonicalSha256 ||
    table.sizeSelectionCanonicalSha256 !== staged.sizeSelectionCanonicalSha256
  )
    return [];
  const members = (projection: typeof table) =>
    projection.pieces.flatMap(({ pieceId, pieceLineKey }) =>
      keys.has(patternImportDxfPhaseECadTablePieceKeyV1(pieceId, pieceLineKey))
        ? [`${source.scopeKey}:${pieceId}:${pieceLineKey}`]
        : [],
    );
  const stagedKeys = members(staged);
  const tableKeys = members(table);
  const original = new Set(tableKeys);
  return tableKeys.length === keys.size &&
    stagedKeys.length === keys.size &&
    new Set(stagedKeys).size === keys.size &&
    original.size === keys.size &&
    stagedKeys.every((key) => original.has(key))
    ? stagedKeys
    : [];
}
