import { readProtectedLineSplit } from 'lib/pattern-import/write/read-protected-line-split';
import type { CardDraft, ManifestProtectedLineSplit } from 'lib/pattern-import/types';
import type { CardContext } from '../client';
import { sha256Hex } from 'lib/pattern-import/adapters/vector/builder';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { buildPatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { projectPatternImportDxfProductPhaseEAssemblyV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  bindDxfProductPhaseDSelectedNativeStraightEdgesV3,
  consumeDxfProductPhaseDNativeStraightEdgesV3,
} from 'lib/cloth/domain/dxf-product-phase-d-native-straight-edge-binding-v1';
import {
  buildDxfPipelineSourcePathCarrierV2,
  DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
} from 'lib/pattern-import/dxf-pipeline-source-path-carrier-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
  replayPatternImportDxfProductWriterV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-writer-replay-v1';
import { writeDxfWithAuthoredLineSplit } from 'lib/pattern-import/write';
import { executePatternImportDxfPhaseEDraftCadAddPointGeometryV1 } from './draft-cad-add-point-geometry-executor-v1';
import {
  isRecordedDraftCadSessionV1,
  type PatternImportDxfPhaseEDraftCadSessionV1,
} from './draft-cad-session-v1';

type Current = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  row: DxfProductSavedRowIdentityV1;
  card: Pick<CardContext, 'techCardId' | 'existingAliases' | 'existingPieces'>;
  generation: number;
  sizeToken: string;
}>;
type ReadCurrent = () => Current | null;
export type SavedAddPointReviewOwner = Readonly<{ kind: 'saved-add-point-review/1' }>;
type ReviewState = {
  file: File;
  sha256: string;
  block: string;
  record: ManifestProtectedLineSplit;
  current: () => boolean;
};
const owners = new WeakMap<SavedAddPointReviewOwner, ReviewState>();
const opened = new WeakMap<File, ReviewState>();
type NativeReviewProof = Awaited<ReturnType<typeof readProtectedLineSplit>>;
const checked = new WeakMap<NativeReviewProof, () => boolean>();

function requireReview(claim: unknown, reason: string): asserts claim {
  if (!claim) throw new Error(`Added vertex review refused: ${reason}.`);
}
function sameRow(a: DxfProductSavedRowIdentityV1, b: DxfProductSavedRowIdentityV1) {
  return (
    a.techCardId === b.techCardId &&
    a.scopeKey === b.scopeKey &&
    a.patternLineKey === b.patternLineKey &&
    a.revision === b.revision &&
    a.cardLockVersion === b.cardLockVersion &&
    a.sha256 === b.sha256 &&
    a.url === b.url &&
    a.sizeBytes === b.sizeBytes
  );
}

/** Dormant review producer. `readCurrent` belongs to the card host and must read its current row and Draft snapshot. */
export async function prepareSavedAddPointReviewV1(input: {
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
  savedBytes: ArrayBuffer;
  readCurrent: ReadCurrent;
}): Promise<SavedAddPointReviewOwner> {
  const { readCurrent } = input;
  const current = readCurrent();
  requireReview(
    current && isRecordedDraftCadSessionV1(current.session),
    'a genuine current Draft snapshot is required',
  );
  const { session, generation, sizeToken } = current,
    row = structuredClone(current.row);
  requireReview(Number.isSafeInteger(generation) && generation >= 0, 'invalid import generation');
  requireReview(
    session.cursor === 1 && session.history[0]?.commands.length === 1,
    'one active transaction with one command is required',
  );
  const command = session.history[0]!.commands[0]!;
  requireReview(
    command.tool === 'add-point' && command.payload.edge,
    'an explicit directed Add point command is required',
  );
  const isCurrent = () => {
    const now = readCurrent();
    const aliases =
      now?.card.existingAliases?.filter(
        (alias) =>
          alias.scopeKey === row.scopeKey &&
          (alias.blockName === command.target.pieceId ||
            alias.blockName === `${command.target.pieceId}_${sizeToken}`),
      ) ?? [];
    const uniqueSpellings = new Set(aliases.map((alias) => alias.blockName));
    return (
      !!now &&
      now.card.techCardId === row.techCardId &&
      aliases.length > 0 &&
      aliases.length === uniqueSpellings.size &&
      aliases.every((alias) => alias.pieceLineKey === command.target.pieceLineKey) &&
      now.card.existingPieces.filter((p) => p.lineKey === command.target.pieceLineKey).length ===
        1 &&
      now.session === session &&
      now.generation === generation &&
      now.sizeToken === sizeToken &&
      sameRow(row, now.row)
    );
  };
  requireReview(isCurrent(), 'current card piece or scope alias differs');
  const source = consumeDxfProductSavedNativeCompilerSourceV1(
    input.sourceOwner,
    input.sourceRequest,
  );
  requireReview(
    source.ok && !source.value.reconstruction && sameRow(row, source.value.row),
    'the saved source capability does not match the current own-format row',
  );
  const saved = input.savedBytes.slice(0),
    draft = structuredClone(source.value.draft);
  const nativeSewing = structuredClone(source.value.nativeSewingReplay);
  const sourceFileId = source.value.sourceFileId;
  requireReview(
    saved.byteLength === row.sizeBytes && (await sha256Hex(saved)) === row.sha256 && isCurrent(),
    'saved bytes or current selection changed',
  );
  // A saved native sewing projection and ordinary reconstructed Draft can bind different surfaces.
  // Select only a projection whose full source, size and catalog binding equals the recorded command.
  const variants = [draft];

  if (nativeSewing?.replayReady)
    variants.push({
      ...draft,
      dxfProvenance: nativeSewing.pipeline,
      dxfPhaseDReplay: nativeSewing.replay,
    });
  let target: Awaited<ReturnType<typeof selectedDraft>> = null;
  for (const variant of variants) {
    const candidate = await selectedDraft(variant, row.scopeKey, sizeToken, session);
    if (candidate) {
      target = candidate;
      break;
    }
  }
  requireReview(target && isCurrent(), 'recorded Phase D, catalog, or size selection differs');
  const { selection, projection } = target;
  requireReview(
    selection.phaseD.sourceSha256 === row.sha256 &&
      session.source.phaseD.sourceFileId === sourceFileId,
    'Draft source does not identify the actual saved native bytes',
  );
  const scopes = draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey);
  const scope = scopes[0],
    replay = scope?.writerReplay;
  requireReview(
    scopes.length === 1 && replay && replay.job.sizes.length === 1,
    'one current-size writer replay is required',
  );
  const rebuilt = await replayPatternImportDxfProductWriterV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
    replay,
    finalManifest: scope.manifest,
    expected: { scopeKey: row.scopeKey, exportSha256: row.sha256 },
  });
  requireReview(
    rebuilt.ok && rebuilt.receipt.byteLength === row.sizeBytes,
    'saved writer replay differs from canonical row bytes',
  );
  const applied = executePatternImportDxfPhaseEDraftCadAddPointGeometryV1(
    replay.job,
    command,
    projection,
    sizeToken,
  );
  requireReview(applied.ok, 'recorded Add point no longer applies to its exact contour');
  const pieces = replay.job.pieces.filter((p) => selection.selection.pieceIds.includes(p.identity));
  const carrier = await buildDxfPipelineSourcePathCarrierV2({
    schemaVersion: DXF_PIPELINE_SOURCE_PATH_CARRIER_REQUEST_V2,
    source: selection.phaseD.source,
    contours: selection.phaseD.contours,
    pieces,
    pipeline: selection.pipeline,
    sourceSha256: row.sha256,
  });
  requireReview(carrier.ok, 'saved selection has no exact source-path carrier');
  const expected = {
    sourceFileId,
    sourceSha256: row.sha256,
    selectedGeometrySha256: selection.selection.selectedGeometrySha256,
  };
  const bound = await bindDxfProductPhaseDSelectedNativeStraightEdgesV3(
    source.value.nativeRead.owner,
    carrier.artifact,
    expected,
  );
  requireReview(bound.ok, 'selected native line intervals could not be authenticated');
  const native = consumeDxfProductPhaseDNativeStraightEdgesV3(bound.owner, expected);
  requireReview(native.ok, 'selected native line owner expired');
  const edge = command.payload.edge;
  const matches = native.projection.edges.filter(
    (e) =>
      e.pieceId === command.target.pieceId &&
      e.sizeToken === sizeToken &&
      e.contourId === command.payload.contourId &&
      e.startVertex.vertexId === edge.boundaryVertexIds[0] &&
      e.endVertex.vertexId === edge.boundaryVertexIds[1],
  );
  requireReview(
    matches.length === 1,
    'recorded directed vertex IDs do not select one native interval',
  );
  const sourceEdge = matches[0]!,
    descriptor = sourceEdge.descriptor,
    size = replay.job.sizes[0]!;
  const written = await writeDxfWithAuthoredLineSplit(
    applied.job,
    {
      file: { id: sourceFileId, name: scope.filename, bytes: saved },
      sourceSha256: row.sha256,
      scopeKey: row.scopeKey,
      identity: command.target.pieceId,
      sizeId: size.sizeId,
      sizeToken,
      rank: size.rank,
      role: applied.contourRole === 'cut-boundary' ? 'cut' : 'seam',
      sourcePathId: sourceEdge.sourcePathId,
      sourceCurveId: descriptor.sourceCurveId,
      startVertexId: descriptor.startVertexId,
      endVertexId: descriptor.endVertexId,
      jobPointIndex: applied.insertedVertexIndex,
      progress: sourceEdge.contourDirection === 'forward' ? edge.progress : 1 - edge.progress,
      entityId: command.payload.entityId,
    },
    { now: () => new Date(replay.createdAt) },
  );
  const file = new File([written.dxfText], 'authored-line-split.dxf', { type: 'image/vnd.dxf' });
  const sha256 = await sha256Hex(await file.arrayBuffer());
  requireReview(
    isCurrent(),
    'the current row, active history, size or import generation changed during compile',
  );
  const owner = Object.freeze({ kind: 'saved-add-point-review/1' as const });
  const blocks = written.manifest.blocks.filter((b) => b.protectedLineSplit);
  requireReview(
    blocks.length === 1 && blocks[0]!.protectedLineSplit,
    'writer did not emit the protected occurrence',
  );
  owners.set(owner, {
    file,
    sha256,
    block: blocks[0]!.block,
    record: blocks[0]!.protectedLineSplit,
    current: isCurrent,
  });
  return owner;
}

async function selectedDraft(
  draft: CardDraft,
  scopeKey: string,
  sizeToken: string,
  session: PatternImportDxfPhaseEDraftCadSessionV1,
) {
  const chosen = await selectPatternImportDxfProductDraftPhaseDSizeV1(draft, scopeKey, sizeToken);
  if (!chosen.ok) return null;
  const selection = chosen.selection;
  if (
    selection.selection.selectedGeometrySha256 !== session.source.phaseD.selectedGeometrySha256 ||
    selection.selection.canonicalSha256 !== session.source.catalog.sizeSelectionCanonicalSha256 ||
    selection.phaseD.sourceSha256 !== session.source.phaseD.sourceSha256
  )
    return null;
  const catalog = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
    draft,
    scopeKey,
    sizeToken,
  );
  if (!catalog.ok || catalog.catalog.canonicalSha256 !== session.source.catalog.canonicalSha256)
    return null;
  const projected = projectPatternImportDxfProductPhaseEAssemblyV1(catalog.catalog, selection);
  return projected.ok ? { selection, projection: projected.projection } : null;
}

/** Consumes only the private owner. A copied file, manifest or structural artifact cannot mint intent. */
export function takeSavedAddPointReviewV1(owner: SavedAddPointReviewOwner) {
  const state = owners.get(owner);
  requireReview(state, 'unknown or previously consumed review');
  owners.delete(owner);
  requireReview(state.current(), 'current saved row or Draft selection changed');
  opened.set(state.file, state);
  return Object.freeze({ file: state.file, sha256: state.sha256 });
}

/** The exact File delivered by explicit review handoff is one-shot, and its current selection is rechecked after decode. */
export async function claimSavedAddPointReviewFileV1(file: File) {
  const state = opened.get(file);
  requireReview(state, 'unrecognized file or previously claimed review');
  opened.delete(file);
  requireReview(state.current(), 'current selection changed before review');
  const proof = await readProtectedLineSplit(
    await Blob.prototype.arrayBuffer.call(file),
    'compiled-add-point-review',
    { fileSha256: state.sha256, block: state.block, record: state.record },
  );
  requireReview(state.current(), 'current row or Draft changed during review');
  checked.set(proof, state.current);
  return proof;
}

/** The main-thread host can reject a late worker result when the originating selection has changed. */
export function isCurrentSavedAddPointReviewClaimV1(proof: NativeReviewProof): boolean {
  const current = checked.get(proof);
  if (current?.()) return true;
  checked.delete(proof);
  return false;
}
