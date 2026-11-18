import {
  compilePatternImportDxfPhaseEDraftCadGeometryV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileResultV1,
  draftCadCompiledArtifactV1,
  type PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
} from './draft-cad-geometry-compile-v1';
import { markReviewedAddPointFile } from 'lib/pattern-import/worker/reviewed-add-point-main';
import { readProtectedLineSplit } from 'lib/pattern-import/write/read-protected-line-split';
import type {
  ManifestProtectedLineSplit,
  ReviewedAddPointOpen,
  ReviewedAddPointAtWrite,
} from 'lib/pattern-import/types';
import type { CardContext } from '../client';
import { sha256Hex } from 'lib/pattern-import/adapters/vector/builder';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
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
import {
  sameSavedDraftRowV1,
  selectMatchingSavedDraftV1,
} from './draft-cad-saved-source-selection-v1';
import type { SavedDraftPairedAllowanceAuthorityV1 } from './draft-cad-paired-allowance-authority-v1';

export { sameSavedDraftRowV1, selectMatchingSavedDraftV1 };

export type SavedAddPointCurrentV1 = Readonly<{
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  row: DxfProductSavedRowIdentityV1;
  card: Pick<CardContext, 'techCardId' | 'existingAliases' | 'existingPieces'>;
  generation: number;
  sizeToken: string;
}>;
type ReadCurrent = () => SavedAddPointCurrentV1 | null;
export type SavedAddPointReviewOwner = Readonly<{ kind: 'saved-add-point-review/1' }>;
type ReviewState = {
  session: PatternImportDxfPhaseEDraftCadSessionV1;
  artifact?: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1;
  file: File;
  sha256: string;
  block: string;
  record: ManifestProtectedLineSplit;
  wire: ReviewedAddPointOpen;
  atWrite: () => ReviewedAddPointAtWrite;
  current: () => boolean;
  verifyCurrentRow?: () => Promise<void>;
};
const owners = new WeakMap<SavedAddPointReviewOwner, ReviewState>();
const compileOwners = new WeakMap<
  PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
  SavedAddPointReviewOwner
>();
const opened = new WeakMap<File, ReviewState>();
type NativeReviewProof = Awaited<ReturnType<typeof readProtectedLineSplit>>;
const checked = new WeakMap<NativeReviewProof, ReviewState>();

function requireReview(claim: unknown, reason: string): asserts claim {
  if (!claim) throw new Error(`Added vertex review refused: ${reason}.`);
}

/** Saved review producer. `readCurrent` belongs to the card host and must read its current row and Draft snapshot. */
export async function prepareSavedAddPointReviewV1(input: {
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
  savedBytes: ArrayBuffer;
  readCurrent: ReadCurrent;
  verifyCurrentRow?: () => Promise<void>;
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
  const currentAliases = () => {
    const now = readCurrent();
    const aliases =
      now?.card.existingAliases?.filter(
        (alias) =>
          alias.scopeKey === row.scopeKey &&
          (alias.blockName === command.target.pieceId ||
            alias.blockName === `${command.target.pieceId}_${sizeToken}`),
      ) ?? [];
    const uniqueSpellings = new Set(aliases.map((alias) => alias.blockName));
    const valid =
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
      sameSavedDraftRowV1(row, now.row);
    return valid ? aliases : null;
  };
  const isCurrent = () => currentAliases() !== null;
  requireReview(isCurrent(), 'current card piece or scope alias differs');
  const source = consumeDxfProductSavedNativeCompilerSourceV1(
    input.sourceOwner,
    input.sourceRequest,
  );
  requireReview(
    source.ok && !source.value.reconstruction && sameSavedDraftRowV1(row, source.value.row),
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
  let target: Awaited<ReturnType<typeof selectMatchingSavedDraftV1>> = null;
  for (const variant of variants) {
    const candidate = await selectMatchingSavedDraftV1(variant, row.scopeKey, sizeToken, session);
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
    session,
    artifact: draftCadCompiledArtifactV1(
      session,
      row.techCardId,
      row.scopeKey,
      sizeToken,
      applied.job,
      written,
      [
        {
          commandId: command.commandId,
          entityId: command.payload.entityId,
          tool: command.tool,
          pieceId: command.target.pieceId,
          sizeToken,
          output: 'boundary-point',
        },
      ],
    ),
    file,
    sha256,
    block: blocks[0]!.block,
    record: blocks[0]!.protectedLineSplit,
    wire: {
      fileSha256: sha256,
      rowSha256: row.sha256,
      ringSha256: blocks[0]!.protectedLineSplit.ringSha256,
      entityId: command.payload.entityId,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      block: blocks[0]!.block,
      identity: command.target.pieceId,
      sizeId: size.sizeId,
      sizeToken,
      rank: size.rank,
      pieceLineKey: command.target.pieceLineKey,
    },
    atWrite: () => {
      const aliases = currentAliases();
      requireReview(aliases, 'current card or alias changed before worker write');
      return Object.freeze({
        fileSha256: sha256,
        techCardId: row.techCardId,
        scopeKey: row.scopeKey,
        pieceLineKey: command.target.pieceLineKey,
        aliases: Object.freeze(aliases.map((a) => Object.freeze({ ...a }))),
      });
    },
    current: isCurrent,
    verifyCurrentRow: input.verifyCurrentRow,
  });
  return owner;
}

/** The mounted Draft Compile action takes the protected route for every active Add point. */
export async function compileDraftForOrdinaryReviewV1(
  input: PatternImportDxfPhaseEDraftCadGeometryCompileInputV1,
  prepare?: () => Promise<SavedAddPointReviewOwner>,
  prepareAllowance?: () => Promise<SavedDraftPairedAllowanceAuthorityV1>,
): Promise<PatternImportDxfPhaseEDraftCadGeometryCompileResultV1> {
  const commands = input.session.history
    .slice(0, input.session.cursor)
    .flatMap((tx) => tx.commands);
  const point = commands.find((command) => command.tool === 'add-point');
  if (!point) {
    const ordinary = compilePatternImportDxfPhaseEDraftCadGeometryV1(input);
    if (
      ordinary.ok ||
      ordinary.blockers[0]?.code !== 'paired-allowance-authority-required' ||
      !prepareAllowance ||
      commands.length !== 1 ||
      input.session.cursor !== 1
    )
      return ordinary;
    try {
      return compilePatternImportDxfPhaseEDraftCadGeometryV1(input, await prepareAllowance());
    } catch (error) {
      return {
        ok: false,
        artifact: null,
        blockers: [
          {
            ...ordinary.blockers[0],
            code: 'edge-length-geometry-blocked',
            detail:
              error instanceof Error
                ? error.message
                : 'The current saved allowance could not be verified.',
          },
        ],
      };
    }
  }
  try {
    requireReview(
      prepare && commands.length === 1 && input.session.cursor === 1,
      'compile one confirmed Add point on the current saved size and material',
    );
    const artifact = compiledSavedAddPointArtifactV1(await prepare(), input.session);
    requireReview(
      artifact.source.revision === input.session.source.revision &&
        artifact.source.sourceSha256 === input.session.source.phaseD.sourceSha256 &&
        artifact.source.catalogCanonicalSha256 === input.session.source.catalog.canonicalSha256 &&
        artifact.source.sizeSelectionCanonicalSha256 ===
          input.selection.selection.canonicalSha256 &&
        artifact.scope.scopeKey === input.selection.selection.scopeKey &&
        artifact.scope.techCardId === input.compileSource.techCardId &&
        artifact.scope.sizeToken === input.selection.selection.sizeToken &&
        artifact.compiledFeatures[0]?.commandId === point.commandId,
      'the protected compile belongs to a different source or command',
    );
    return { ok: true, artifact, blockers: [] };
  } catch (error) {
    return {
      ok: false,
      artifact: null,
      blockers: [
        {
          code: 'add-point-geometry-blocked',
          tool: point.tool,
          commandId: point.commandId,
          detail:
            error instanceof Error
              ? error.message
              : 'The selected native edge could not be verified.',
        },
      ],
    };
  }
}

function compiledSavedAddPointArtifactV1(
  owner: SavedAddPointReviewOwner,
  session: PatternImportDxfPhaseEDraftCadSessionV1,
) {
  const state = owners.get(owner);
  requireReview(
    state && state.artifact && state.session === session && state.current(),
    'the current saved row or Draft changed before staging',
  );
  compileOwners.set(state.artifact, owner);
  return state.artifact;
}

export function takeCompiledSavedAddPointFileV1(
  artifact: PatternImportDxfPhaseEDraftCadGeometryCompileArtifactV1,
) {
  const owner = compileOwners.get(artifact);
  requireReview(owner, 'the compiled Add point has no current protected review');
  compileOwners.delete(artifact);
  return takeSavedAddPointReviewV1(owner).file;
}

/** Consumes only the private owner. A copied file, manifest or structural artifact cannot mint intent. */
export function takeSavedAddPointReviewV1(owner: SavedAddPointReviewOwner) {
  const state = owners.get(owner);
  requireReview(state, 'unknown or previously consumed review');
  owners.delete(owner);
  delete state.artifact;
  requireReview(state.current(), 'current saved row or Draft selection changed');
  opened.set(state.file, state);
  markReviewedAddPointFile(state.file);
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
  checked.set(proof, state);
  return proof;
}

/** The main-thread host can reject a late worker result when the originating selection has changed. */
export function isCurrentSavedAddPointReviewClaimV1(proof: NativeReviewProof): boolean {
  const current = checked.get(proof);
  if (current?.current()) return true;
  checked.delete(proof);
  return false;
}

export async function recheckSavedAddPointBeforeApplyV1(proof: NativeReviewProof) {
  const state = checked.get(proof);
  requireReview(state && state.current(), 'saved source or Draft changed before Apply');
  requireReview(state.verifyCurrentRow, 'the saved row cannot be revalidated before Apply');
  await state.verifyCurrentRow();
  requireReview(state.current(), 'saved source or Draft changed during Apply verification');
}

/** Only a live proof from the actual review File can reach the private worker-client transport. */
export function savedAddPointWorkerBindingV1(proof: NativeReviewProof): ReviewedAddPointOpen {
  const state = checked.get(proof);
  requireReview(state && state.current(), 'missing or stale worker review claim');
  return Object.freeze(structuredClone(state.wire));
}

export function savedAddPointCurrentWorkerAliasesV1(
  proof: NativeReviewProof,
): ReviewedAddPointAtWrite {
  const state = checked.get(proof);
  requireReview(state, 'unrecognized worker review');
  return state.atWrite();
}
