import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { readDxfInsertInstanceBlockNameV1 } from 'lib/pattern-import/dxf-path-provenance-v1';
import type { DxfProductPhaseDReplayCarrierV1 } from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import {
  computeDxfProductSavedSourceFileIdV1,
  type DxfProductSavedRowIdentityV1,
} from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
  type ManifestBlock,
  type PieceSizeSpec,
  type PieceSpec,
} from 'lib/pattern-import/types';
import { blockNameOf } from 'lib/pattern-import/write';

import {
  completeSavedAssemblyRowIdentityV1,
  isVerifiedCompleteSavedAssemblySourceV1,
  type CompleteSavedAssemblySourceV1,
} from './saved-assembly-complete-source-rpc-v1';

const missingAlias = 'A selected native cut has no unique saved source-block identity.';

function indexNativeInsertOccurrences(phaseD: DxfProductPhaseDReplayCarrierV1) {
  const namesByToken = new Map<string, string>();
  const occurrences = new Map<string, Set<string>>();
  for (const { provenance } of phaseD.source.paths) {
    let occurrence = '';
    for (const token of provenance.instancePath) {
      let name = namesByToken.get(token);
      if (name === undefined) {
        const raw = readDxfInsertInstanceBlockNameV1(token);
        if (raw === null) throw new Error(missingAlias);
        name = raw;
        namesByToken.set(token, name);
      }
      occurrence += `/x/${token}`;
      const matches = occurrences.get(name) ?? new Set<string>();
      matches.add(occurrence);
      occurrences.set(name, matches);
    }
  }
  return occurrences;
}

function resolveDuplicateAliases(
  aliases: readonly string[],
  manifestBlocks: readonly ManifestBlock[],
  writer: PieceSpec | undefined,
  writerSize: PieceSizeSpec | undefined,
  instancePath: readonly string[],
  known: Readonly<{
    occurrences: ReadonlyMap<string, ReadonlySet<string>>;
    writerNames: ReadonlySet<string>;
  }>,
): string {
  if (!writer || !writerSize) throw new Error(missingAlias);
  const selectedBlocks = manifestBlocks.filter(
    ({ identity, sizeToken }) => identity === writer.identity && sizeToken === writerSize.sizeToken,
  );
  const [block] = selectedBlocks;
  if (
    selectedBlocks.length !== 1 ||
    writerSize.sizeId !== block.sizeId ||
    blockNameOf(writer, writerSize) !== block.block ||
    manifestBlocks.some((other) => other !== block && other.block === block.block)
  )
    throw new Error(missingAlias);
  const inserts = known.occurrences.get(block.block);
  if (instancePath.length !== 1 || inserts?.size !== 1 || !inserts.has(`/x/${instancePath[0]}`))
    throw new Error(missingAlias);

  const exact = aliases.filter((name) => name === block.identity || name === block.block);
  if (
    exact.length !== 1 ||
    aliases.some(
      (name) => name !== exact[0] && (known.writerNames.has(name) || known.occurrences.has(name)),
    )
  )
    throw new Error(missingAlias);
  return exact[0];
}

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
  const aliasesByLine = new Map<string, string[]>();
  for (const { pieceLineKey, blockName } of aliases) {
    if (!pieceLineKey || !blockName) throw new Error(missingAlias);
    const matches = aliasesByLine.get(pieceLineKey) ?? [];
    matches.push(blockName);
    aliasesByLine.set(pieceLineKey, matches);
  }
  if (
    aliasesByLine.size !== catalogResult.catalog.pieces.length ||
    catalogResult.catalog.pieces.some(({ pieceLineKey }) => !aliasesByLine.has(pieceLineKey))
  )
    throw new Error('Each selected native cut needs one saved piece alias in the exact material.');
  const paths = new Map(phaseD.source.paths.map((path) => [path.pathId, path]));
  const scope = draft.scopes.find(({ target }) => target.scopeKey === row.scopeKey);
  const writerJob = scope?.writerReplay?.job;
  const writerPieces =
    writerJob?.scope.scopeKey === row.scopeKey && writerJob.techCardId === row.techCardId
      ? writerJob.pieces
      : [];
  const manifestBlocks = scope?.manifest.blocks ?? [];
  const hasMultipleAliases = aliases.length > aliasesByLine.size;
  if (
    hasMultipleAliases &&
    (phaseD.sourceFileId !== computeDxfProductSavedSourceFileIdV1(row) ||
      phaseD.source.sourceFileId !== phaseD.sourceFileId ||
      scope?.manifest.techCardId !== row.techCardId ||
      scope.writerReplay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1 ||
      new Set(aliases.map(({ blockName }) => blockName)).size !== aliases.length)
  )
    throw new Error(missingAlias);
  const known = hasMultipleAliases
    ? {
        occurrences: indexNativeInsertOccurrences(phaseD),
        writerNames: new Set([
          ...manifestBlocks.flatMap(({ block, identity }) => [block, identity]),
          ...writerPieces.flatMap((writer) => [
            writer.identity,
            ...writer.sizes.map((size) => blockNameOf(writer, size)),
          ]),
        ]),
      }
    : null;
  return Object.freeze(
    catalogResult.catalog.pieces.map((piece) => {
      const matches = aliasesByLine.get(piece.pieceLineKey)!;
      const contour = phaseD.contours.filter(
        ({ pieceId, role, sizeToken: token }) =>
          pieceId === piece.pieceId && role === 'cut-boundary' && token === sizeToken,
      );
      const [cut] = contour;
      const sourcePaths = cut?.lineage.sourcePathIds;
      const path = sourcePaths?.length === 1 ? paths.get(sourcePaths[0]!) : undefined;
      if (contour.length !== 1 || !cut?.closed || !path?.closed)
        throw new Error(`No original closed cut path is bound to ${matches[0]}.`);
      const writerMatches = writerPieces.filter(({ identity }) => identity === piece.pieceId);
      const writerSizes =
        writerMatches.length === 1
          ? writerMatches[0].sizes.filter(({ sizeToken: token }) => token === sizeToken)
          : [];
      const grain = writerSizes.length === 1 ? writerSizes[0].grain : null;
      let blockName = matches[0];
      if (matches.length > 1) {
        // Only the exact writer and source INSERT can distinguish a native alias from a display name.
        if (!known || path.provenance.sourceFileId !== phaseD.sourceFileId)
          throw new Error(missingAlias);
        blockName = resolveDuplicateAliases(
          matches,
          manifestBlocks,
          writerMatches.length === 1 ? writerMatches[0] : undefined,
          writerSizes.length === 1 ? writerSizes[0] : undefined,
          path.provenance.instancePath,
          known,
        );
      }
      return Object.freeze({
        row,
        sizeToken,
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        blockName,
        contourId: cut.contourId,
        nativePathId: path.pathId,
        sourceInstancePath: path.provenance.instancePath,
        nativePointsMm: path.pointsMm,
        grain:
          grain &&
          grain.origin !== 'proposed' &&
          Number.isFinite(grain.angleDeg) &&
          grain.angleDeg >= 0 &&
          grain.angleDeg < 360
            ? Object.freeze({
                angleDegrees: grain.angleDeg,
                origin: grain.origin,
                evidence: Object.freeze([...(grain.evidence ?? [])]),
              })
            : null,
      });
    }),
  );
}

type SavedCut = Awaited<ReturnType<typeof bindSavedFullAssemblyNativeCutPathsV1>>[number];

/** Joins the exact native L14 carrier by its owning row and existing cut-piece identity. */
export function bindSavedFullAssemblyNativeSewingPathsV1(
  carrier: DxfProductPhaseDReplayCarrierV1,
  cuts: readonly SavedCut[],
) {
  const paths = new Map(carrier.source.paths.map((path) => [path.pathId, path]));
  return Object.freeze(
    cuts.map((cut) => {
      if (
        carrier.sourceSha256 !== cut.row.sha256 ||
        carrier.source.sourceFileId !== carrier.sourceFileId ||
        carrier.sourceFileId !== computeDxfProductSavedSourceFileIdV1(cut.row)
      )
        throw new Error('The sewing contour comes from a different saved pattern row.');
      const contours = carrier.contours.filter(
        ({ pieceId, role, sizeToken }) =>
          pieceId === cut.pieceId && role === 'sewing-boundary' && sizeToken === cut.sizeToken,
      );
      const [contour] = contours;
      const sourcePaths = contour?.lineage.sourcePathIds;
      const path = sourcePaths?.length === 1 ? paths.get(sourcePaths[0]!) : undefined;
      if (
        contours.length !== 1 ||
        !contour?.closed ||
        !path?.closed ||
        path.pathId === cut.nativePathId ||
        path.pointsMm.length !== path.provenance.samples.length
      )
        throw new Error(`No independent original sewing path is bound to ${cut.blockName}.`);
      return Object.freeze({
        row: cut.row,
        sourceFileId: carrier.sourceFileId,
        sizeToken: cut.sizeToken,
        pieceId: cut.pieceId,
        pieceLineKey: cut.pieceLineKey,
        blockName: cut.blockName,
        contourId: contour.contourId,
        nativePathId: path.pathId,
        sourceInstancePath: path.provenance.instancePath,
        nativePointsMm: path.pointsMm,
        vertexIds: Object.freeze(path.provenance.samples.map(({ vertexId }) => vertexId)),
        lineage: contour.lineage,
      });
    }),
  );
}

export type SavedAssemblyNativeSewingPathV1 = ReturnType<
  typeof bindSavedFullAssemblyNativeSewingPathsV1
>[number];
