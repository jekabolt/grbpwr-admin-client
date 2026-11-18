import { ringSelfIntersects, ringStrictlyInside } from 'lib/fusing-dxf/spline';
import type { PieceDTO } from 'lib/nesting/types';
import type { DxfPieceSpecProvenanceSourcePathV1 } from 'lib/pattern-import/dxf-piece-spec-provenance-bridge-v1';
import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PtMm } from 'lib/pattern-import/types';

import { patternImportDxfPhaseECadTablePieceKeyV1 } from './cad-table-piece-layout-session-v1';
import {
  cadTableSavedRankBlocksV1,
  exactCadTableSavedNativeBlockV1,
  matchesCadTableSavedSourceRingV1,
} from './cad-table-saved-piece-folds-v1';

type SelectedPhaseD = Pick<
  Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>,
  'selection' | 'phaseD'
>;

export type CadTableSavedSeamAllowanceV1 = Readonly<{
  cutPathId: number;
  sewingPathId: number;
  cut: readonly PtMm[];
  sewing: readonly PtMm[];
}>;

export type CadTableSavedSeamAllowancesByPieceV1 = ReadonlyMap<
  string,
  CadTableSavedSeamAllowanceV1
>;

function sameSourceRing(displayed: readonly PtMm[], source: readonly PtMm[]): boolean {
  if (displayed.length !== source.length) return false;
  return source.some((start, i) => {
    if (displayed[0].x !== start.x || displayed[0].y !== start.y) return false;
    return [1, -1].some((direction) =>
      displayed.every(({ x, y }, j) => {
        const original = source[(i + j * direction + source.length) % source.length];
        return x === original.x && y === original.y;
      }),
    );
  });
}

function hasSameOccurrence(
  cut: DxfPieceSpecProvenanceSourcePathV1,
  candidate: DxfPieceSpecProvenanceSourcePathV1,
): boolean {
  const occurrence = cut.provenance.instancePath;
  const other = candidate.provenance.instancePath;
  return occurrence.length === other.length && occurrence.every((part, i) => part === other[i]);
}

function finiteRing(ring: readonly PtMm[]) {
  return ring.length >= 3 && ring.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
}

/**
 * Expose the band between two original closed drawing roles on the already-verified saved row.
 * The ordinary cut stays the material and picking geometry. The legacy layer reader corroborates
 * L14 on the same graded block, while the overlay uses the original Phase-D points without an offset.
 */
export function projectCadTableSavedSeamAllowancesV1({
  projection,
  selected,
  sourceSha256,
  scopeKey,
  candidates,
  savedSizeTokens,
}: Readonly<{
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  selected: SelectedPhaseD;
  sourceSha256: string;
  scopeKey: string;
  candidates: readonly PieceDTO[];
  savedSizeTokens: readonly string[];
}>): CadTableSavedSeamAllowancesByPieceV1 {
  const allowances = new Map<string, CadTableSavedSeamAllowanceV1>();
  const { phaseD, selection } = selected;
  if (
    selection.scopeKey !== scopeKey ||
    phaseD.sourceSha256 !== sourceSha256 ||
    phaseD.source.sourceFileId !== projection.sourceFileId ||
    selection.canonicalSha256 !== projection.sizeSelectionCanonicalSha256 ||
    selection.sizeToken !== projection.sizeToken
  )
    return allowances;

  const sized = cadTableSavedRankBlocksV1(candidates, projection.sizeToken, savedSizeTokens);
  for (const piece of projection.pieces) {
    const [displayed] = piece.contours;
    if (piece.contours.length !== 1 || !displayed.closed || displayed.role !== 'cut-boundary')
      continue;
    const block = exactCadTableSavedNativeBlockV1(sized, piece);
    if (!block) continue;
    const cuts = block.filter(({ layer }) => layer === '1');
    const sewingRoles = block.filter(({ layer }) => layer === '14');
    if (
      cuts.length !== 1 ||
      sewingRoles.length !== 1 ||
      block.some((role) => role.inner?.some(({ layer, closed }) => closed && layer === role.layer))
    )
      continue;

    const contours = phaseD.contours.filter(
      ({ pieceId, sizeToken }) => pieceId === piece.pieceId && sizeToken === projection.sizeToken,
    );
    const [contour] = contours;
    if (
      contours.length !== 1 ||
      !contour.closed ||
      contour.role !== 'cut-boundary' ||
      contour.contourId !== displayed.contourId ||
      contour.geometry.kind !== 'cut' ||
      contour.lineage.sourcePathIds.length !== 1 ||
      !selection.pieceIds.includes(piece.pieceId)
    )
      continue;

    const paths = phaseD.source.paths;
    const rawCuts = paths.filter(({ pathId }) => pathId === contour.lineage.sourcePathIds[0]);
    const [rawCut] = rawCuts;
    const cut = displayed.vertices.map(({ pointMm }) => pointMm);
    if (
      rawCuts.length !== 1 ||
      !rawCut.closed ||
      rawCut.provenance.sourceFileId !== projection.sourceFileId ||
      !rawCut.provenance.instancePath.length ||
      !finiteRing(cut) ||
      !sameSourceRing(cut, rawCut.pointsMm)
    )
      continue;

    // An additional closed loop of uncertain role may be a cut hole. Do not paint across it.
    const closedNeighbours = paths.filter(
      (path) => path.closed && path.pathId !== rawCut.pathId && hasSameOccurrence(rawCut, path),
    );
    const [rawSewing] = closedNeighbours;
    if (
      closedNeighbours.length !== 1 ||
      rawSewing.provenance.sourceFileId !== projection.sourceFileId ||
      !matchesCadTableSavedSourceRingV1(sewingRoles[0], {
        nativePointsMm: rawSewing.pointsMm,
        vertexIds: rawSewing.provenance.samples.map(({ vertexId }) => vertexId),
      })
    )
      continue;

    const sewing = rawSewing.pointsMm;
    if (
      !finiteRing(sewing) ||
      ringSelfIntersects(cut) ||
      ringSelfIntersects(sewing) ||
      !ringStrictlyInside(sewing, cut)
    )
      continue;

    allowances.set(patternImportDxfPhaseECadTablePieceKeyV1(piece.pieceId, piece.pieceLineKey), {
      cutPathId: rawCut.pathId,
      sewingPathId: rawSewing.pathId,
      cut,
      sewing,
    });
  }
  return allowances;
}
