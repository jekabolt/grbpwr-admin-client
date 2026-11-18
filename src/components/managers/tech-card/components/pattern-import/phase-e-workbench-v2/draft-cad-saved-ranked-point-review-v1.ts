import { segmentDxf } from 'lib/pattern-import/adapters/dxf/segment';
import { sha256Hex } from 'lib/pattern-import/adapters/vector/builder';
import {
  DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
  projectDxfSourceNativeStraightEdgeSelectedPathsV1,
} from 'lib/pattern-import/dxf-source-native-straight-edge-authority-v1';
import { consumeDxfProductSavedNativeCompilerSourceV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { Affine, PtMm } from 'lib/pattern-import/types';
import { writeDxfWithRetainedRankedDraftPointV1 } from 'lib/pattern-import/write';
import type { CardContext } from '../client';
import type {
  prepareSavedAddPointReviewV1,
  SavedAddPointCurrentV1,
} from './draft-cad-saved-add-point-review-v1';
import {
  sameSavedDraftRowV1,
  selectMatchingSavedDraftV1,
} from './draft-cad-saved-source-selection-v1';
import { isRecordedDraftCadSessionV1 } from './draft-cad-session-v1';

export type SavedRankedPointReviewV1 = Readonly<{ kind: 'saved-ranked-draft-point-review/1' }>;
type Review = Readonly<{
  file: File;
  row: DxfProductSavedRowIdentityV1;
  sha256: string;
  pieceLineKey: string;
  blockName: string;
  sizeToken: string;
  sizeId: number;
  pointMm: Readonly<PtMm>;
  isCurrent: () => boolean;
  verifyApply: (file: File) => Promise<void>;
}>;
const reviews = new WeakMap<SavedRankedPointReviewV1, Review>();

function requireReview(claim: unknown, detail: string): asserts claim {
  if (!claim) throw new Error(`Saved Draft Point review refused: ${detail}.`);
}

function only<T>(values: readonly T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}

function isIdentity(t: Affine): boolean {
  return t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1 && t.e === 0 && t.f === 0;
}

const samePoint = (a: PtMm, b: PtMm) => a.x === b.x && a.y === b.y;

/** A ring may have another start or winding. Every actual native vertex must remain exact. */
function sameExactRing(a: readonly PtMm[], b: readonly PtMm[]): boolean {
  const open = (points: readonly PtMm[]) =>
    points.length > 1 && samePoint(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;
  const [left, right] = [open(a), open(b)];
  const count = left.length;
  if (count !== right.length || count < 3) return false;
  const start = right.findIndex((point) => samePoint(left[0]!, point));
  return (
    start >= 0 &&
    !right.slice(start + 1).some((point) => samePoint(left[0]!, point)) &&
    (left.every((point, index) => samePoint(point, right[(start + index) % count]!)) ||
      left.every((point, index) => samePoint(point, right[(start - index + count) % count]!)))
  );
}

export function readSavedRankedPointReviewV1(token: SavedRankedPointReviewV1): Review {
  const review = reviews.get(token);
  requireReview(
    review && review.isCurrent(),
    'the retained review is unrecognized or no longer current',
  );
  return review;
}

type PrepareInput = Pick<
  Parameters<typeof prepareSavedAddPointReviewV1>[0],
  'sourceOwner' | 'sourceRequest' | 'savedBytes'
> &
  Readonly<{
    readCurrent: () => (SavedAddPointCurrentV1 & { card: Pick<CardContext, 'sizes'> }) | null;
    readCurrentRow: () => Promise<DxfProductSavedRowIdentityV1>;
  }>;

/** Own-format sources continue through ordinary Draft compile; foreign sources need retained bytes. */
export async function prepareSavedRankedPointReviewV1(
  input: PrepareInput,
): Promise<SavedRankedPointReviewV1 | null> {
  const { readCurrent, readCurrentRow } = input;
  const opening = readCurrent();
  requireReview(opening && isRecordedDraftCadSessionV1(opening.session), 'open a current Draft');
  const { session, sizeToken, generation } = opening;
  const row = Object.freeze({ ...opening.row });
  const source = consumeDxfProductSavedNativeCompilerSourceV1(
    input.sourceOwner,
    input.sourceRequest,
  );
  requireReview(source.ok && sameSavedDraftRowV1(row, source.value.row), 'saved source changed');
  if (!source.value.reconstruction) return null;

  const { draft, nativeRead, nativeSewingReplay, reconstruction, sourceFileId } = source.value;
  const transaction = session.history[0];
  const command = transaction && only(transaction.commands);
  requireReview(
    session.cursor === 1 && command?.tool === 'draft-point',
    'one active Draft Point is required for this foreign sheet',
  );
  requireReview(
    Number.isSafeInteger(generation) &&
      generation >= 0 &&
      session.source.phaseD.sourceFileId === sourceFileId &&
      session.source.phaseD.sourceSha256 === row.sha256 &&
      reconstruction.originalSourceSha256 === row.sha256 &&
      input.savedBytes.byteLength === row.sizeBytes &&
      (await sha256Hex(input.savedBytes)) === row.sha256,
    'the Draft does not identify the exact saved native bytes',
  );
  const { pieceId, pieceLineKey } = command.target;
  const scope = only(
    draft.scopes.filter((candidate) => candidate.target.scopeKey === row.scopeKey),
  );
  const writerSize = only(
    scope?.writerReplay?.job.sizes.filter((size) => size.token === sizeToken) ?? [],
  );
  requireReview(scope && writerSize, 'the reviewed scope and rank must remain unique');

  let target = await selectMatchingSavedDraftV1(draft, row.scopeKey, sizeToken, session);
  if (!target && nativeSewingReplay?.replayReady)
    target = await selectMatchingSavedDraftV1(
      {
        ...draft,
        dxfProvenance: nativeSewingReplay.pipeline,
        dxfPhaseDReplay: nativeSewingReplay.replay,
      },
      row.scopeKey,
      sizeToken,
      session,
    );
  requireReview(target, 'the selected rank, catalog or native geometry changed');
  const { selection, projection } = target;
  const phaseD = selection.phaseD;
  const projected = only(
    projection.pieces.filter(
      (piece) => piece.pieceId === pieceId && piece.pieceLineKey === pieceLineKey,
    ),
  );
  const projectedCut = only(
    projected?.contours.filter((contour) => contour.role === 'cut-boundary') ?? [],
  );
  const cut = only(
    phaseD.contours.filter(
      (contour) =>
        contour.pieceId === pieceId &&
        contour.sizeToken === sizeToken &&
        contour.role === 'cut-boundary',
    ),
  );
  requireReview(
    projectedCut &&
      cut?.closed &&
      cut.lineage.sourcePathIds.length === 1 &&
      cut.lineage.mutations.length === 0 &&
      cut.lineage.uniformPositiveScale === 1,
    'the selected cut must retain one unchanged native outline',
  );
  const pathId = cut.lineage.sourcePathIds[0]!;
  const selectedPath = only(phaseD.source.paths.filter((path) => path.pathId === pathId));
  const { doc, meta } = nativeRead.read;
  const page = only(doc.pages.filter((p) => p.paths.some((path) => path.id === pathId)));
  const path = only(page?.paths.filter((p) => p.id === pathId) ?? []);
  const group = only(meta.groups.filter((g) => g.paths.includes(pathId)));
  const blockName = group?.block;
  requireReview(
    selectedPath?.closed &&
      path?.closed &&
      page &&
      group?.kind === 'insert' &&
      blockName &&
      path.src.block === blockName &&
      only(page.styles.filter((style) => style.id === path.style))?.layer === '1' &&
      isIdentity(group.transform) &&
      meta.units.mmPerUnit === 1 &&
      meta.units.source !== 'guess' &&
      sameExactRing(path.pts, selectedPath.pointsMm) &&
      sameExactRing(path.pts, cut.pointsMm) &&
      sameExactRing(
        path.pts,
        projectedCut.vertices.map((vertex) => vertex.pointMm),
      ),
    'the Draft is not in the original untransformed L1 millimeter frame',
  );
  const nativePiece = only(
    segmentDxf(nativeRead.read).pieces.filter((piece) => piece.block === blockName),
  );
  requireReview(
    nativePiece?.group === group.index &&
      nativePiece.sizeSource !== 'none' &&
      nativePiece.size === sizeToken &&
      !nativePiece.uni,
    'the native block does not identify one explicit source rank',
  );

  const nativeIdentity = nativePiece.identity;
  const sizeId = writerSize.sizeId;
  const currentAliases = () => {
    const now = readCurrent();
    if (
      !now ||
      now.session !== session ||
      now.generation !== generation ||
      now.sizeToken !== sizeToken ||
      !sameSavedDraftRowV1(row, now.row) ||
      now.card.techCardId !== row.techCardId ||
      !only(now.card.existingPieces.filter((piece) => piece.lineKey === pieceLineKey))
    )
      return null;
    const size = only(
      now.card.sizes.filter((candidate) => candidate.token.toUpperCase() === sizeToken),
    );
    if (size?.sizeId !== sizeId) return null;
    const aliases = (now.card.existingAliases ?? []).filter(
      (alias) =>
        alias.scopeKey === row.scopeKey &&
        (alias.blockName === blockName || alias.blockName === nativeIdentity),
    );
    const names = aliases.map((alias) => alias.blockName);
    return names.length > 0 &&
      new Set(names).size === names.length &&
      aliases.every((alias) => alias.pieceLineKey === pieceLineKey)
      ? names.sort().join('\0')
      : null;
  };
  const pinnedAliases = currentAliases();
  requireReview(pinnedAliases, 'current card size, piece or scope alias changed');
  const isCurrent = () => currentAliases() === pinnedAliases;
  const checkCurrentRow = async () => {
    requireReview(isCurrent(), 'the selected Draft, piece or rank changed');
    const fresh = await readCurrentRow();
    requireReview(isCurrent() && sameSavedDraftRowV1(row, fresh), 'the exact saved row changed');
  };

  const native = await projectDxfSourceNativeStraightEdgeSelectedPathsV1(nativeRead.owner, {
    schemaVersion: DXF_SOURCE_NATIVE_STRAIGHT_EDGE_SELECTED_PATHS_REQUEST_V1,
    sourceFileId,
    sourceSha256: row.sha256,
    sourcePathIds: [pathId],
  });
  requireReview(
    native.ok &&
      native.projection.complete &&
      native.projection.descriptors.every((edge) => isIdentity(edge.normalization.sourceAffine)),
    'the native decoder could not prove all original L1 segments in that frame',
  );
  const pointMm = Object.freeze({ ...command.payload.pointMm });
  const written = await writeDxfWithRetainedRankedDraftPointV1({
    file: { id: sourceFileId, name: scope.filename, bytes: input.savedBytes },
    sourceSha256: row.sha256,
    blockName,
    sizeToken,
    pointMm,
  });
  await checkCurrentRow();
  const file = new File([written.bytes], 'retained-ranked-point.dxf', { type: 'image/vnd.dxf' });
  const sha256 = written.outputSha256;
  const token: SavedRankedPointReviewV1 = Object.freeze({
    kind: 'saved-ranked-draft-point-review/1',
  });
  reviews.set(
    token,
    Object.freeze({
      file,
      row,
      sha256,
      pieceLineKey,
      blockName,
      sizeToken,
      sizeId,
      pointMm,
      isCurrent,
      async verifyApply(candidate: File) {
        requireReview(
          isCurrent() && candidate === file,
          'Apply must use the exact current reviewed File',
        );
        requireReview(
          (await sha256Hex(await candidate.arrayBuffer())) === sha256,
          'reviewed bytes changed',
        );
        await checkCurrentRow();
      },
    }),
  );
  return token;
}
