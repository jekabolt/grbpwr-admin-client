import { consumeDxfProductSavedNativeCompilerSourceV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { authoredInternalVertices } from 'lib/pattern-import/manifest/authored-internal';
import type { ConversionManifest, WriteJob } from 'lib/pattern-import/types';
import { createPatternImportDxfPhaseEDraftCadCompileSourceV1 } from './draft-cad-compile-source-v1';
import {
  type PatternImportDxfPhaseEDraftCadGeometryCompileInputV1 as CompileInput,
  type PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1 as Artifact,
} from './draft-cad-geometry-compile-v1';
import type { prepareSavedAddPointReviewV1 } from './draft-cad-saved-add-point-review-v1';
import {
  sameSavedDraftRowV1,
  selectMatchingSavedDraftV1,
} from './draft-cad-saved-source-selection-v1';
import { isRecordedDraftCadSessionV1 } from './draft-cad-session-v1';
import { registerSavedDartTipFileV1 } from './draft-cad-saved-dart-tip-file-v1';
import {
  canMoveSavedDartTipV1,
  selectSavedDartTipV1,
  sameDartVertices,
} from './draft-cad-saved-dart-tip-v1';

const prepared = new WeakSet<CompileInput>();
export const hasSavedDartTipSourceV1 = (input: CompileInput) => prepared.has(input);
function requireDart(ok: unknown, detail: string): asserts ok {
  if (!ok) throw new Error(detail);
}
const one = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);
type Review = {
  current: () => boolean;
  verifyCurrentRow: () => Promise<void>;
  manifest: ConversionManifest;
  geometry: string;
  cardId: number;
  scopeKey: string;
};
const artifacts = new WeakMap<Artifact, Review>();
function markers(manifest: ConversionManifest) {
  return JSON.stringify(
    manifest.blocks
      .map((b) => [b.block, b.identity, b.sizeToken, b.sizeId, b.authoredInternal ?? []])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}
// Compare what can be written in every size. Worker-local path ids are allocated anew on reopen.
function geometry(job: WriteJob) {
  return JSON.stringify(
    job.pieces.map((piece) => [
      piece.identity,
      piece.pairOf,
      piece.pairHand,
      piece.unfoldedFold,
      piece.piecesPerGarment,
      piece.sizes.map((size) => [
        size.rank,
        size.sizeToken,
        size.sizeId,
        size.cut,
        size.cutLoops ?? [],
        size.seam,
        size.grain && [size.grain.a, size.grain.b],
        size.fold && [size.fold.a, size.fold.b],
        size.notches.map((n) => [n.at, n.seg, n.depthMm, n.authoredGroup]),
        size.drills.map((d) => [d.at, d.form, d.sizeMm]),
        size.internal.map((p) => [p.label, p.closed, p.pts]),
        size.pointMarks ?? [],
        size.textMarks ?? [],
      ]),
    ]),
  );
}
export async function compileSavedDartTipReviewV1(
  {
    readCurrent,
    sourceOwner,
    sourceRequest,
  }: Pick<
    Parameters<typeof prepareSavedAddPointReviewV1>[0],
    'readCurrent' | 'sourceOwner' | 'sourceRequest'
  >,
  verifyCurrentRow: () => Promise<void>,
) {
  const opening = readCurrent();
  requireDart(
    opening && isRecordedDraftCadSessionV1(opening.session),
    'Record the saved dart edit again.',
  );
  const { session, generation, sizeToken } = opening,
    row = structuredClone(opening.row);
  const command = session.history[0]?.commands[0];
  requireDart(
    session.cursor === 1 &&
      session.history[0]?.commands.length === 1 &&
      command?.tool === 'dart' &&
      command.payload.savedTip,
    'Record one saved dart tip edit.',
  );
  const { savedTip, base } = command.payload,
    { pieceId, pieceLineKey } = command.target;
  const current = () => {
    const now = readCurrent();
    if (
      !now ||
      now.session !== session ||
      now.generation !== generation ||
      now.sizeToken !== sizeToken ||
      !sameSavedDraftRowV1(now.row, row) ||
      now.card.techCardId !== row.techCardId
    )
      return false;
    const aliases =
      now.card.existingAliases?.filter(
        (a) =>
          a.scopeKey === row.scopeKey &&
          (a.blockName === pieceId || a.blockName === pieceId + '_' + sizeToken),
      ) ?? [];
    return (
      aliases.length > 0 &&
      new Set(aliases.map((a) => a.blockName)).size === aliases.length &&
      aliases.every((a) => a.pieceLineKey === pieceLineKey) &&
      now.card.existingPieces.filter((p) => p.lineKey === pieceLineKey).length === 1
    );
  };
  requireDart(
    current() &&
      savedTip.pieceId === pieceId &&
      savedTip.pieceLineKey === pieceLineKey &&
      savedTip.sourceSha256 === row.sha256 &&
      savedTip.scopeKey === row.scopeKey &&
      savedTip.sizeToken === sizeToken,
    'The saved dart row, size or piece changed.',
  );
  const source = consumeDxfProductSavedNativeCompilerSourceV1(sourceOwner, sourceRequest);
  requireDart(
    source.ok &&
      !source.value.reconstruction &&
      !source.value.nativeRead.scope &&
      sameSavedDraftRowV1(source.value.row, row) &&
      source.value.sourceFileId === session.source.phaseD.sourceFileId,
    'Reopen the current exact saved DXF.',
  );
  const { draft, nativeRead } = source.value;
  const selection = await selectMatchingSavedDraftV1(draft, row.scopeKey, sizeToken, session);
  const compileSource = createPatternImportDxfPhaseEDraftCadCompileSourceV1(draft);
  requireDart(selection && compileSource, 'The saved dart selection no longer matches the Draft.');
  const compileInput = { ...selection, session, compileSource };
  const candidate = selectSavedDartTipV1(compileInput, command.target);
  requireDart(
    candidate &&
      candidate.savedTip.index === savedTip.index &&
      candidate.savedTip.rank === savedTip.rank &&
      candidate.savedTip.sizeId === savedTip.sizeId &&
      sameDartVertices(candidate.savedTip.original, savedTip.original) &&
      canMoveSavedDartTipV1(candidate.apexMm, command.payload.apexMm) &&
      candidate.base.contourId === base.contourId &&
      candidate.base.boundaryVertexIds.every((id, i) => id === base.boundaryVertexIds[i]) &&
      candidate.base.progress === base.progress &&
      candidate.intakeMm === command.payload.intakeMm,
    'The saved dart or its two original feet changed.',
  );
  const scope = one(draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey));
  const block = one(
    scope?.manifest.blocks.filter(
      (b) => b.identity === pieceId && b.sizeToken === sizeToken && b.sizeId === savedTip.sizeId,
    ) ?? [],
  );
  const cut = one(
    selection.selection.phaseD.contours.filter(
      (c) =>
        c.contourId === base.contourId &&
        c.pieceId === pieceId &&
        c.sizeToken === sizeToken &&
        c.role === 'cut-boundary',
    ),
  );
  const pathId = one(cut?.lineage.sourcePathIds ?? []);
  requireDart(
    block &&
      cut &&
      pathId !== undefined &&
      !cut.lineage.mutations.length &&
      cut.lineage.uniformPositiveScale === 1,
    'The dart needs its original cut outline.',
  );
  const group = one(
    nativeRead.read.meta.groups.filter(
      (g) => g.kind === 'insert' && g.block === block.block && g.paths.includes(pathId),
    ),
  );
  const page = nativeRead.read.doc.pages[0];
  const markers = nativeRead.read.meta.authoredInternalByBlock?.get(block.block);
  const marker = one(markers?.filter((m) => m.label === 'draft-cad:dart') ?? []);
  requireDart(
    group && page && marker && !marker.closed,
    'The original native open dart is unavailable.',
  );
  const paths = new Map(page.paths.map((p) => [p.id, p]));
  const layer8 = group.paths
    .map((id) => paths.get(id))
    .filter((p) => p && page.styles[p.style]?.layer === '8');
  const dart = layer8[marker.index];
  const { a, b, c, d, e, f } = group.transform;
  requireDart(
    a === 1 &&
      d === 1 &&
      b === 0 &&
      c === 0 &&
      dart &&
      !dart.closed &&
      dart.src.block === block.block &&
      sameDartVertices(dart.pts, savedTip.original) &&
      JSON.stringify(authoredInternalVertices(dart.pts, { x: e, y: f })) ===
        JSON.stringify(marker.vertices),
    'The native dart no longer matches the ordered saved legs and tip.',
  );
  const edges = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceSha256: row.sha256,
    sourceFileId: source.value.sourceFileId,
    sourcePathIds: [pathId, dart.id].sort((a, b) => a - b),
  });
  requireDart(
    edges.ok &&
      edges.projection.complete &&
      one(
        edges.projection.descriptors.filter(
          (edge) =>
            edge.path.sourcePathId === pathId &&
            edge.startVertexId === base.boundaryVertexIds[0] &&
            edge.endVertexId === base.boundaryVertexIds[1],
        ),
      ),
    'The dart feet need one original straight cut edge.',
  );
  const legs = edges.projection.descriptors.filter((edge) => edge.path.sourcePathId === dart.id);
  requireDart(
    legs.length === 2 &&
      [0, 1].every((i) =>
        one(
          legs.filter(
            (edge) =>
              !edge.path.closed &&
              edge.path.startPointIndex === i &&
              edge.path.endPointIndex === i + 1 &&
              sameDartVertices(
                [
                  { x: edge.startMm[0], y: edge.startMm[1] },
                  { x: edge.endMm[0], y: edge.endMm[1] },
                ],
                dart.pts.slice(i, i + 2),
              ),
          ),
        ),
      ),
    'The original dart must contain exactly two native straight legs.',
  );
  await verifyCurrentRow();
  requireDart(current(), 'The saved dart changed during verification.');
  const { compilePatternImportDxfPhaseEDraftCadGeometryV1 } = await import(
    './draft-cad-geometry-compile-v1'
  );
  requireDart(current(), 'The saved dart changed before compiling.');
  prepared.add(compileInput);
  const result = compilePatternImportDxfPhaseEDraftCadGeometryV1(compileInput);
  prepared.delete(compileInput);
  if (result.ok)
    artifacts.set(result.artifact, {
      current,
      verifyCurrentRow,
      manifest: result.artifact.manifest,
      geometry: geometry(result.artifact.compiledJob),
      cardId: row.techCardId,
      scopeKey: row.scopeKey,
    });
  return result;
}

export function openSavedDartTipReviewFileV1(artifact: Artifact, name: string) {
  const review = artifacts.get(artifact);
  requireDart(review && review.current(), 'Compile the current saved dart again.');
  const file = new File([artifact.dxfText], name, { type: 'image/vnd.dxf' });
  registerSavedDartTipFileV1(file, async (draft, scope, isCurrent) => {
    requireDart(review.current() && isCurrent(), 'The saved dart review changed.');
    requireDart(
      draft.techCardId === review.cardId &&
        scope.target.scopeKey === review.scopeKey &&
        scope.manifest.gate?.passed &&
        markers(scope.manifest) === markers(review.manifest) &&
        scope.writerReplay &&
        geometry(scope.writerReplay.job) === review.geometry,
      'The reviewed native dart paths or size blocks changed.',
    );
    await review.verifyCurrentRow();
    requireDart(review.current() && isCurrent(), 'The saved dart row changed before Apply.');
  });
  return file;
}
