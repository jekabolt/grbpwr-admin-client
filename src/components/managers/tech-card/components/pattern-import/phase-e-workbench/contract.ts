import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAuthoringChoicesV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-producer-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROPOSAL_V1,
  buildPatternImportDxfProductPhaseEAssemblyChoicesV1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
  type PatternImportDxfProductPhaseEAssemblyProposalV1,
  type PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1,
  type PatternImportDxfProductPhaseEMaterialRevisionOptionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

export type PatternImportDxfProductPhaseEProposalSourceStatusV1 = Readonly<{
  /** Confirmation owned by the existing assembly editor, never by this workbench. */
  confirmed: boolean;
  /** Staleness owned by the existing seam row, never recomputed from geometry here. */
  stale: boolean;
}>;

export type PatternImportDxfProductPhaseEWorkbenchUiBlockerCodeV1 =
  | 'proposal-source-unconfirmed'
  | 'proposal-source-stale'
  | 'v1-scope-invalid'
  | 'projection-binding-invalid'
  | 'authoring-state-invalid';

export type PatternImportDxfProductPhaseEWorkbenchBlockerV1 = Readonly<{
  code: string;
  detail: string;
}>;

export type PatternImportDxfProductPhaseEWorkbenchResultV1 =
  | Readonly<{
      ok: true;
      choices: PatternImportDxfProductPhaseEAuthoringChoicesV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      choices: null;
      blockers: readonly PatternImportDxfProductPhaseEWorkbenchBlockerV1[];
    }>;

export type PatternImportDxfProductPhaseEWorkbenchInputV1 = Readonly<{
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  proposal: PatternImportDxfProductPhaseEAssemblyProposalV1;
  proposalSource: PatternImportDxfProductPhaseEProposalSourceStatusV1;
  state: PatternImportDxfProductPhaseEAssemblyWorkbenchStateV1;
  materialOptions: readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[];
}>;

function exactTwoSideScope(input: PatternImportDxfProductPhaseEWorkbenchInputV1): boolean {
  const catalogPieces = input.catalog?.pieces;
  const projectionPieces = input.projection?.pieces;
  const proposalSides = input.proposal?.sides;
  const stateSides = input.state?.sides;
  const materialSelections = input.state?.materialSelections;
  if (
    !Array.isArray(catalogPieces) ||
    !Array.isArray(projectionPieces) ||
    !Array.isArray(proposalSides) ||
    !Array.isArray(stateSides) ||
    !Array.isArray(materialSelections) ||
    catalogPieces.length !== 2 ||
    projectionPieces.length !== 2 ||
    proposalSides.length !== 2 ||
    stateSides.length !== 2 ||
    materialSelections.length !== 2
  )
    return false;

  const catalogPieceIds = catalogPieces.map(({ pieceId }) => pieceId);
  const catalogLineKeys = catalogPieces.map(({ pieceLineKey }) => pieceLineKey);
  const proposalPieceIds = proposalSides.map(({ pieceId }) => pieceId);
  return (
    new Set(catalogPieceIds).size === 2 &&
    new Set(catalogLineKeys).size === 2 &&
    new Set(proposalPieceIds).size === 2 &&
    proposalSides.every((side) =>
      catalogPieces.some(
        (piece) => piece.pieceId === side.pieceId && piece.pieceLineKey === side.pieceLineKey,
      ),
    ) &&
    stateSides.every((side, index) => side.pieceId === proposalSides[index]?.pieceId) &&
    materialSelections.every(
      (selection, index) => selection.pieceId === proposalSides[index]?.pieceId,
    )
  );
}

function exactProjectionBinding(input: PatternImportDxfProductPhaseEWorkbenchInputV1): boolean {
  const { catalog, projection, proposal } = input;
  if (
    projection.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1 ||
    proposal.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROPOSAL_V1 ||
    proposal.status !== 'proposal-not-authority' ||
    projection.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    projection.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
    proposal.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
    projection.sourceFileId !== catalog.sourceFileId ||
    projection.sizeToken !== catalog.sizeToken ||
    projection.joinMode !== 'catalog-ordinal-to-phase-d-point' ||
    projection.geometryPlacementApplied !== false
  )
    return false;

  const globalVertexIds = new Set<string>();
  return catalog.pieces.every((catalogPiece) => {
    const projected = projection.pieces.filter(
      (piece) =>
        piece.pieceId === catalogPiece.pieceId && piece.pieceLineKey === catalogPiece.pieceLineKey,
    );
    const camera = projected[0]?.cameraMm;
    if (
      projected.length !== 1 ||
      projected[0].contours.length !== catalogPiece.contours.length ||
      !camera ||
      ![camera.minX, camera.minY, camera.maxX, camera.maxY, camera.padding].every(
        Number.isFinite,
      ) ||
      camera.maxX < camera.minX ||
      camera.maxY < camera.minY ||
      camera.padding < 0
    )
      return false;
    return catalogPiece.contours.every((catalogContour) => {
      const contours = projected[0].contours.filter(
        (contour) =>
          contour.contourId === catalogContour.contourId &&
          contour.role === catalogContour.role &&
          contour.closed === catalogContour.closed,
      );
      if (
        contours.length !== 1 ||
        contours[0].vertices.length !== catalogContour.boundaryVertices.length
      )
        return false;
      return catalogContour.boundaryVertices.every((vertex, index) => {
        const projectedVertex = contours[0].vertices[index];
        const valid =
          projectedVertex?.ordinal === vertex.ordinal &&
          projectedVertex.vertexId === vertex.vertexId &&
          projectedVertex.normalizedArc === vertex.normalizedArc &&
          !!projectedVertex.pointMm &&
          Number.isFinite(projectedVertex.pointMm.x) &&
          Number.isFinite(projectedVertex.pointMm.y) &&
          !globalVertexIds.has(projectedVertex.vertexId);
        if (valid) globalVertexIds.add(projectedVertex.vertexId);
        return valid;
      });
    });
  });
}

function blocked(
  blockers: PatternImportDxfProductPhaseEWorkbenchBlockerV1[],
): PatternImportDxfProductPhaseEWorkbenchResultV1 {
  return Object.freeze({
    ok: false as const,
    choices: null,
    blockers: Object.freeze(blockers.map((blocker) => Object.freeze(blocker))),
  });
}

/**
 * Fail-closed UI gate. This only assembles deliberate choices; it never invokes the producer,
 * compiler, registry, persistence, or any geometric inference.
 */
export function derivePatternImportDxfProductPhaseEWorkbenchResultV1(
  input: PatternImportDxfProductPhaseEWorkbenchInputV1,
): PatternImportDxfProductPhaseEWorkbenchResultV1 {
  const blockers: PatternImportDxfProductPhaseEWorkbenchBlockerV1[] = [];
  if (!input.proposalSource?.confirmed)
    blockers.push({
      code: 'proposal-source-unconfirmed',
      detail: 'The proposed seam has not been confirmed in Assembly Order.',
    });
  if (input.proposalSource?.stale)
    blockers.push({
      code: 'proposal-source-stale',
      detail: 'The proposed seam changed. Confirm it again in Assembly Order.',
    });
  if (!exactTwoSideScope(input))
    blockers.push({
      code: 'v1-scope-invalid',
      detail: 'This assembly view requires exactly two distinct pieces and one two-sided seam.',
    });
  if (!blockers.some(({ code }) => code === 'v1-scope-invalid') && !exactProjectionBinding(input))
    blockers.push({
      code: 'projection-binding-invalid',
      detail: 'The open DXF geometry no longer matches this pattern and proposed seam.',
    });
  if (blockers.length) return blocked(blockers);

  try {
    const result = buildPatternImportDxfProductPhaseEAssemblyChoicesV1(
      input.catalog,
      input.proposal,
      input.state,
      input.materialOptions,
    );
    if (!result.ok) return blocked([...result.blockers]);
    return Object.freeze({ ok: true as const, choices: result.choices, blockers: [] as const });
  } catch {
    return blocked([
      {
        code: 'authoring-state-invalid',
        detail: 'The assembly selection is invalid and cannot be saved.',
      },
    ]);
  }
}
