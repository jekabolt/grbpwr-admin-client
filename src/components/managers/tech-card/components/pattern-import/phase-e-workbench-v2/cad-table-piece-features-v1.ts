import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type DraftScope,
  type PieceSizeSpec,
} from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseECadWorkbenchIconV1 } from './cad-workbench-tool-button-v1';
import { patternImportDxfPhaseECadTablePieceKeyV1 } from './cad-table-piece-layout-session-v1';

export type CadTablePieceFeatures = Readonly<
  Pick<PieceSizeSpec, 'grain' | 'internal' | 'fold' | 'notches' | 'drills'> & {
    pieceLabel: string;
    materialLabel: string | null;
  }
>;
export type CadTablePieceFeatureLayer = keyof CadTablePieceFeatures;
export type CadTablePieceFeaturesByKey = ReadonlyMap<string, CadTablePieceFeatures>;

export const CAD_TABLE_PIECE_FEATURE_LAYERS = [
  { key: 'grain', label: 'Show grainlines', icon: 'measure-edge' },
  { key: 'internal', label: 'Show internal lines', icon: 'internal-line' },
  { key: 'fold', label: 'Show fold lines', icon: 'guideline' },
  { key: 'notches', label: 'Show notches', icon: 'notch' },
  { key: 'drills', label: 'Show drill marks', icon: 'mark' },
  { key: 'pieceLabel', label: 'Show piece names', icon: 'callout' },
  { key: 'materialLabel', label: 'Show material names', icon: 'view-options' },
] as const satisfies readonly {
  key: CadTablePieceFeatureLayer;
  label: string;
  icon: PatternImportDxfPhaseECadWorkbenchIconV1;
}[];

export function hasCadTablePieceFeature(
  features: CadTablePieceFeatures,
  layer: CadTablePieceFeatureLayer,
): boolean {
  const value = features[layer];
  return Array.isArray(value) ? value.length > 0 : value != null;
}

/** Projects retained features only when their writer frame matches the displayed contour. */
export function projectCadTablePieceFeatures(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  scopes: readonly Readonly<Pick<DraftScope, 'target' | 'writerReplay'>>[],
  materialLabel?: string,
): CadTablePieceFeaturesByKey {
  const features = new Map<string, CadTablePieceFeatures>();
  const matchingScopes = scopes.filter(({ target }) => target.scopeKey === catalog.scopeKey);
  const replay = matchingScopes.length === 1 ? matchingScopes[0]?.writerReplay : undefined;
  if (
    replay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 ||
    replay.job.techCardId !== catalog.techCardId ||
    replay.job.scope.scopeKey !== catalog.scopeKey ||
    projection.sourceFileId !== catalog.sourceFileId ||
    projection.sizeToken !== catalog.sizeToken ||
    projection.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    projection.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256
  )
    return features;

  for (const projected of projection.pieces) {
    const catalogPiece = catalog.pieces.find(
      ({ pieceId, pieceLineKey }) =>
        pieceId === projected.pieceId && pieceLineKey === projected.pieceLineKey,
    );
    const writerPieces = replay.job.pieces.filter(({ identity }) => identity === projected.pieceId);
    if (!catalogPiece || writerPieces.length !== 1) continue;
    const writerPiece = writerPieces[0]!;
    const sizes = writerPiece.sizes.filter(({ sizeToken }) => sizeToken === projection.sizeToken);
    if (sizes.length !== 1) continue;
    const size = sizes[0]!;
    // Both regular and native-sewing views copy contours from the same PieceSizeSpec. Require
    // exact coordinates from a primary contour before displaying any feature in that frame.
    const frameMatches = projected.contours.some(({ contourId, vertices }) => {
      const geometry = catalogPiece.contours.find(
        (contour) => contour.contourId === contourId,
      )?.geometry;
      if (!geometry || geometry.kind === 'cut-loop') return false;
      const points = geometry.kind === 'cut' ? size.cut : size.seam;
      return (
        !!points &&
        points.length === vertices.length &&
        vertices.every(({ pointMm }, index) => {
          const point = points[index];
          return point?.x === pointMm.x && point?.y === pointMm.y;
        })
      );
    });
    if (!frameMatches) continue;
    const { grain, internal, fold, notches, drills } = size;
    features.set(
      patternImportDxfPhaseECadTablePieceKeyV1(projected.pieceId, projected.pieceLineKey),
      {
        grain:
          grain &&
          grain.origin !== 'proposed' &&
          [grain.a.x, grain.a.y, grain.b.x, grain.b.y].every(Number.isFinite) &&
          (grain.a.x !== grain.b.x || grain.a.y !== grain.b.y)
            ? grain
            : null,
        internal,
        fold,
        notches,
        drills,
        pieceLabel: writerPiece.displayName?.trim() || writerPiece.identity,
        materialLabel: materialLabel?.trim() || null,
      },
    );
  }
  return features;
}
