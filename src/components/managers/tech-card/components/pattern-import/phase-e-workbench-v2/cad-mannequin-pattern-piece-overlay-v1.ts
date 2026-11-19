import type {
  MeasurementSurfacePatternPieceOverlayV1,
  MeasurementSurfacePatternPieceSeamV1,
  MeasurementSurfacePatternPieceTransformV1,
  MeasurementSurfacePatternPieceV1,
} from 'components/shared/measurement-watertight-surface-v1-stage';
import { readPatternImportDxfProductPhaseEPreparedPieceOrdinalsV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import type {
  PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1,
  PatternImportDxfPhaseECadMannequinDxfStagingSourceV1,
} from './cad-mannequin-dxf-staging-v1';
import { readSavedAllScopeStagingLaneOrdinalsV1 } from './cad-mannequin-saved-all-scope-staging-v1';
import type { CadTableSavedTopstitchOverlayV1 } from './cad-table-saved-topstitch-overlay-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PATTERN_PIECE_OVERLAY_V1 =
  'pattern-import-dxf-phase-e-cad-mannequin-pattern-piece-overlay/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_MANNEQUIN_PATTERN_PIECE_OVERLAY_CLAIMS_V1 =
  Object.freeze({
    exactPreparedProjectionOnly: true,
    exactContourAndVertexIdentityRetained: true,
    deterministicFourLaneLayout: true,
    selectedTransformCallerOwned: true,
    geometryScaleToolExposed: false,
    unavailableSeamFactsHidden: true,
    createsGeometryOwner: false,
    createsAssemblyAuthority: false,
    createsClothSolver: false,
  } as const);

export type PatternImportDxfPhaseECadMannequinPatternOverlayToolV1 =
  | 'select'
  | 'translate'
  | 'rotate';

export type PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1 = Readonly<{
  seamId: string;
  side: 'A' | 'B';
  scopeKey: string;
  pieceId: string;
  contourId: string;
  operationSeam?: MeasurementSurfacePatternPieceSeamV1['operationSeam'];
  ordinalBadgeVisible?: boolean;
  semanticColorCss?: string | null;
  /** Exact ordered Phase-D boundary identities. Empty or missing identities fail closed. */
  orderedVertexIds: readonly string[];
  thread?: Readonly<{
    bomLineKey: string;
    colorCss: string;
  }> | null;
  pins?: readonly Readonly<{
    pinId: string;
    vertexId: string;
  }>[];
}>;

export type PatternImportDxfPhaseECadMannequinPatternOverlayResultV1 =
  | Readonly<{
      ok: true;
      overlay: MeasurementSurfacePatternPieceOverlayV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      overlay: null;
      blocker: Readonly<{
        code: 'pattern-piece-overlay-blocked';
        detail: string;
      }>;
    }>;

function blocked(detail: string): PatternImportDxfPhaseECadMannequinPatternOverlayResultV1 {
  return Object.freeze({
    ok: false as const,
    overlay: null,
    blocker: Object.freeze({ code: 'pattern-piece-overlay-blocked' as const, detail }),
  });
}

function trimmed(value: string): string | null {
  const result = value.trim();
  return result || null;
}

function stableCssColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const result = value.trim();
  return /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)]*\)|[a-z]+)$/iu.test(result) ? result : null;
}

/**
 * Read-only adapter from the already prepared Phase-D replay projection to the existing Three
 * mannequin scene. It retains exact identities and coordinates; placement and user transforms are
 * presentation-only and never flow back into the DXF or Assembly Order geometry owners.
 */
export function buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1(
  input: Readonly<{
    sources: readonly PatternImportDxfPhaseECadMannequinDxfStagingSourceV1[];
    selection?: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1 | null;
    activeScopeKey?: string | null;
    preserveLegacyMultiScopeLanes?: boolean;
    swatchesByScope?: Readonly<Record<string, string | null | undefined>>;
    transformsByPieceKey?: Readonly<Record<string, MeasurementSurfacePatternPieceTransformV1>>;
    decorations?: readonly PatternImportDxfPhaseECadMannequinPatternOverlayDecorationV1[];
    savedTopstitch?: CadTableSavedTopstitchOverlayV1;
    guides?: MeasurementSurfacePatternPieceOverlayV1['guides'];
    tool?: PatternImportDxfPhaseECadMannequinPatternOverlayToolV1;
    dragPlane?: MeasurementSurfacePatternPieceOverlayV1['dragPlane'];
    translationGroup?: MeasurementSurfacePatternPieceOverlayV1['translationGroup'];
    rotationGroup?: MeasurementSurfacePatternPieceOverlayV1['rotationGroup'];
    onFocus?: (selection: PatternImportDxfPhaseECadMannequinDxfStagingSelectionV1) => void;
    onTransform?: (pieceKey: string, transform: MeasurementSurfacePatternPieceTransformV1) => void;
  }>,
): PatternImportDxfPhaseECadMannequinPatternOverlayResultV1 {
  if (input.sources.length === 0)
    return blocked('No exact prepared pattern projection is available.');
  const sourceKeys = input.sources.map(({ scopeKey }) => trimmed(scopeKey));
  if (sourceKeys.some((key) => key === null) || new Set(sourceKeys).size !== sourceKeys.length) {
    return blocked('Material scope identities are empty or duplicated.');
  }

  const pieces = input.sources.flatMap((source) =>
    source.projection.pieces.map((piece) => ({ source, piece })),
  );
  const pieceKeys = pieces.map(
    ({ source, piece }) => `${source.scopeKey}:${piece.pieceId}:${piece.pieceLineKey}`,
  );
  if (pieceKeys.length === 0 || new Set(pieceKeys).size !== pieceKeys.length) {
    return blocked('Prepared piece identities are empty or duplicated.');
  }

  for (const { piece } of pieces) {
    if (!trimmed(piece.pieceId) || !trimmed(piece.pieceLineKey) || piece.contours.length === 0) {
      return blocked('A prepared piece has no stable identity or exact contour.');
    }
    if (!piece.contours.some(({ role }) => role !== 'hole')) {
      return blocked(`Piece ${piece.pieceId} has no outer exact contour.`);
    }
    const contourIds = piece.contours.map(({ contourId }) => trimmed(contourId));
    if (contourIds.some((id) => id === null) || new Set(contourIds).size !== contourIds.length) {
      return blocked(`Piece ${piece.pieceId} has empty or duplicated contour identities.`);
    }
    for (const contour of piece.contours) {
      const vertexIds = contour.vertices.map(({ vertexId }) => trimmed(vertexId));
      if (
        !contour.closed ||
        contour.vertices.length < 3 ||
        vertexIds.some((id) => id === null) ||
        new Set(vertexIds).size !== vertexIds.length ||
        contour.vertices.some(
          ({ pointMm }) => !Number.isFinite(pointMm.x) || !Number.isFinite(pointMm.y),
        )
      ) {
        return blocked(`Contour ${contour.contourId} is not a closed exact polygon.`);
      }
    }
  }

  const selectedScope = input.selection?.scopeKey || input.activeScopeKey || null;
  const selectedPieces = pieces.filter(
    ({ source, piece }) =>
      input.selection?.pieceId === piece.pieceId &&
      (!selectedScope || selectedScope === source.scopeKey) &&
      (input.selection.pieceLineKey == null || input.selection.pieceLineKey === piece.pieceLineKey),
  );
  const selectedPiece = selectedPieces.length === 1 ? selectedPieces[0] : null;
  // V6 offsets are relative to historical staged lanes. A single exact catalog can recover
  // its lanes; multiple material scopes need an independently known historical scope order.
  const ordinals =
    input.sources.length === 1
      ? readPatternImportDxfProductPhaseEPreparedPieceOrdinalsV1(
          input.sources[0].projection,
          input.sources[0].scopeKey,
        )
      : input.preserveLegacyMultiScopeLanes
        ? null
        : readSavedAllScopeStagingLaneOrdinalsV1(input.sources);
  const overlayPieces: MeasurementSurfacePatternPieceOverlayV1['pieces'] = Object.freeze(
    pieces.map(({ source, piece }, index) => {
      const pieceKey = `${source.scopeKey}:${piece.pieceId}:${piece.pieceLineKey}`;
      const ordinal = ordinals?.[index] ?? index;
      const selected = selectedPiece?.source === source && selectedPiece.piece === piece;
      const pieceDecorations = (input.decorations ?? []).filter(
        (decoration) =>
          decoration.scopeKey === source.scopeKey && decoration.pieceId === piece.pieceId,
      );
      const stitch = input.savedTopstitch;
      const topstitch =
        stitch?.scopeKey === source.scopeKey &&
        stitch.sourceFileId === source.projection.sourceFileId &&
        stitch.sizeToken === source.projection.sizeToken &&
        stitch.pieceId === piece.pieceId &&
        stitch.pieceLineKey === piece.pieceLineKey
          ? {
              lineKey: stitch.lineKey,
              operationNumber: stitch.operationNumber,
              widthMm: stitch.widthMm,
              threadBomLineKey: stitch.threadBomLineKey,
              pointsMm: stitch.pointsMm,
            }
          : undefined;
      const contourById = new Map(piece.contours.map((contour) => [contour.contourId, contour]));
      const seams = pieceDecorations.flatMap((decoration) => {
        const contour = contourById.get(decoration.contourId);
        const vertexIds = new Set(contour?.vertices.map(({ vertexId }) => vertexId) ?? []);
        if (
          !trimmed(decoration.seamId) ||
          !contour ||
          decoration.orderedVertexIds.length < 2 ||
          decoration.orderedVertexIds.some((vertexId) => !vertexIds.has(vertexId))
        ) {
          return [];
        }
        return [
          Object.freeze({
            seamId: decoration.seamId,
            side: decoration.side,
            contourId: decoration.contourId,
            ...(decoration.operationSeam && {
              operationSeam: Object.freeze({ ...decoration.operationSeam }),
              ordinalBadgeVisible: decoration.ordinalBadgeVisible === true,
            }),
            colorCss: stableCssColor(decoration.semanticColorCss),
            orderedVertexIds: Object.freeze([...decoration.orderedVertexIds]),
            thread:
              decoration.thread &&
              trimmed(decoration.thread.bomLineKey) &&
              stableCssColor(decoration.thread.colorCss)
                ? Object.freeze({
                    bomLineKey: decoration.thread.bomLineKey,
                    colorCss: stableCssColor(decoration.thread.colorCss)!,
                  })
                : null,
            pins: Object.freeze(
              (decoration.pins ?? []).filter(
                ({ pinId, vertexId }) => Boolean(trimmed(pinId)) && vertexIds.has(vertexId),
              ),
            ),
          }),
        ];
      });
      return Object.freeze({
        pieceKey,
        scopeKey: source.scopeKey,
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        lane: (['left', 'right', 'front', 'back'] as const)[ordinal % 4],
        laneIndex: Math.floor(ordinal / 4),
        contours: Object.freeze(
          piece.contours.map((contour) =>
            Object.freeze({
              contourId: contour.contourId,
              role: contour.role,
              vertices: Object.freeze(
                contour.vertices.map(({ vertexId, pointMm }) =>
                  Object.freeze({
                    vertexId,
                    pointMm: Object.freeze({ x: pointMm.x, y: pointMm.y }),
                  }),
                ),
              ),
            }),
          ),
        ),
        selected,
        swatchCss: stableCssColor(input.swatchesByScope?.[source.scopeKey]),
        transform: input.transformsByPieceKey?.[pieceKey] ?? null,
        seams: Object.freeze(seams),
        topstitch,
      });
    }),
  );
  const revision = JSON.stringify(
    overlayPieces.map(({ pieceKey, lane, laneIndex, contours }) => [
      pieceKey,
      lane,
      laneIndex,
      contours.map(({ contourId, vertices }) => [
        contourId,
        vertices.map(({ vertexId, pointMm }) => [vertexId, pointMm.x, pointMm.y]),
      ]),
    ]),
  );
  return Object.freeze({
    ok: true as const,
    blocker: null,
    overlay: Object.freeze({
      revision,
      pieces: overlayPieces,
      tool: input.tool ?? 'select',
      ...(input.dragPlane && { dragPlane: input.dragPlane }),
      ...(input.translationGroup && { translationGroup: input.translationGroup }),
      ...(input.rotationGroup && { rotationGroup: input.rotationGroup }),
      visibility: Object.freeze({
        pieces: true,
        edges: true,
        seams: true,
        pins: true,
        thread: true,
      }),
      guides: input.guides,
      onSelectPiece: (
        hit: Pick<
          MeasurementSurfacePatternPieceV1,
          'pieceKey' | 'scopeKey' | 'pieceId' | 'pieceLineKey'
        >,
      ) => {
        const piece = overlayPieces.find(
          ({ pieceKey, scopeKey, pieceId, pieceLineKey }) =>
            pieceKey === hit.pieceKey &&
            scopeKey === hit.scopeKey &&
            pieceId === hit.pieceId &&
            pieceLineKey === hit.pieceLineKey,
        );
        if (!piece) return;
        input.onFocus?.({
          scopeKey: piece.scopeKey,
          pieceId: piece.pieceId,
          pieceLineKey: piece.pieceLineKey,
          seamId: piece.selected ? input.selection?.seamId ?? null : null,
        });
      },
      onTransformPiece: input.onTransform,
    }),
  });
}
