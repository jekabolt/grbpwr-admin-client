import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { CardDraft } from 'lib/pattern-import/types';

import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';

/** Carries each selected original cut path with its saved card piece and row, without consuming the compiler owner. */
export async function bindSavedFullAssemblyNativeCutPathsV1(
  source: CompleteSavedAssemblySourceV1,
  member: Readonly<{ row: DxfProductSavedRowIdentityV1; draft: CardDraft }>,
  sizeToken: string,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const { row, draft } = member;
  if (
    !isVerifiedCompleteSavedAssemblySourceV1(source) ||
    !source.rows.some((member) =>
      Object.entries(completeSavedAssemblyRowIdentityV1(member)).every(
        ([key, value]) => row[key as keyof DxfProductSavedRowIdentityV1] === value,
      ),
    )
  )
    throw new Error('Original cuts require an exact row in the verified complete Assembly.');
  const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    draft,
    row.scopeKey,
    sizeToken,
  );
  signal.throwIfAborted();
  // The catalog freshly verifies the exact saved Phase-D replay. It exposes only the selected
  // boundary IDs, so retain the original path from that same carrier and selected size.
  const phaseD = draft.dxfPhaseDReplay?.carrier;
  if (!catalogResult.ok || !phaseD)
    throw new Error(
      `The saved source ${row.scopeKey} has no exact cut binding at size ${sizeToken}.`,
    );
  if (phaseD.sourceSha256 !== row.sha256)
    throw new Error('The selected cuts do not belong to the saved DXF SHA.');
  const aliases = source.aliases.filter(({ scopeKey }) => scopeKey === row.scopeKey);
  if (
    aliases.length !== catalogResult.catalog.pieces.length ||
    new Set(aliases.map(({ pieceLineKey }) => pieceLineKey)).size !== aliases.length
  )
    throw new Error('Each selected native cut needs one saved piece alias in the exact material.');
  const paths = new Map(phaseD.source.paths.map((path) => [path.pathId, path]));
  return Object.freeze(
    catalogResult.catalog.pieces.map((piece) => {
      const matches = aliases.filter(({ pieceLineKey }) => pieceLineKey === piece.pieceLineKey);
      if (matches.length !== 1 || !matches[0]?.blockName)
        throw new Error('A selected native cut has no unique saved source-block identity.');
      const contour = phaseD.contours.filter(
        ({ pieceId, role, sizeToken: token }) =>
          pieceId === piece.pieceId && role === 'cut-boundary' && token === sizeToken,
      );
      const [cut] = contour;
      const sourcePaths = cut?.lineage.sourcePathIds;
      const path = sourcePaths?.length === 1 ? paths.get(sourcePaths[0]!) : undefined;
      if (contour.length !== 1 || !cut?.closed || !path?.closed)
        throw new Error(`No original closed cut path is bound to ${matches[0].blockName}.`);
      return Object.freeze({
        row,
        sizeToken,
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        blockName: matches[0].blockName,
        contourId: cut.contourId,
        nativePathId: path.pathId,
        sourceInstancePath: path.provenance.instancePath,
        nativePointsMm: path.pointsMm,
      });
    }),
  );
}
