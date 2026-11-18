import { sha256Hex } from 'lib/features/sha256';
import {
  consumeDxfProductSavedNativeCompilerSourceV1,
  type DxfProductSavedNativeCompilerSourceOwnerV1,
  type DxfProductSavedNativeCompilerSourceRequestV1,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { nativePieceCopyVerifier } from 'lib/pattern-import/fabrics/native-piece-copy-review';
import { sealApplyNewPieceIntent } from 'lib/pattern-import/fabrics/apply-new-piece-intent';
import { aliasNames, aliasKey } from 'lib/pattern-import/fabrics/draft';
import type { CardDraft } from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
  replayPatternImportDxfProductWriterV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-writer-replay-v1';
import {
  markUnlinkedPieceCopyFileV1,
  isOrdinaryWizardCopyScopeV1,
} from '../direct-dxf-authoring-capture-v1';
import { isRecordedDraftCadSessionV1 } from './draft-cad-session-v1';
import {
  sameSavedDraftRowV1,
  selectMatchingSavedDraftV1,
  type SavedAddPointCurrentV1,
} from './draft-cad-saved-add-point-review-v1';

type Current = SavedAddPointCurrentV1 &
  Readonly<{ selectedPieceId: string; selectedPieceLineKey: string }>;
type CopyReview = Readonly<{ kind: 'unlinked-draft-piece-copy/1' }>;
type State = {
  file: File;
  sha: string;
  cardId: number;
  scopeKey: string;
  sourceIdentity: string;
  sourceKey: string;
  identity: string;
  check: () => void;
  revalidate: () => Promise<void>;
  verifyGeometry: (resultText: string) => void;
};
const pending = new WeakMap<CopyReview, State>();
const opened = new WeakMap<File, State>();
function requireCopy(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`Unlinked copy review refused: ${reason}.`);
}

/** Dormant Draft command seam. Only a checked saved source and the exact current selected piece can mint a review File. */
export async function prepareUnlinkedDraftPieceCopyV1(input: {
  sourceOwner: DxfProductSavedNativeCompilerSourceOwnerV1;
  sourceRequest: DxfProductSavedNativeCompilerSourceRequestV1;
  savedBytes: ArrayBuffer;
  readCurrent: () => Current | null;
  readCurrentRow: (
    expected: SavedAddPointCurrentV1['row'],
  ) => Promise<SavedAddPointCurrentV1['row']>;
}): Promise<CopyReview> {
  const { readCurrent, readCurrentRow } = input;
  const first = readCurrent();
  requireCopy(
    first && isRecordedDraftCadSessionV1(first.session) && first.session.cursor === 0,
    'select one piece in the current unmodified saved Draft',
  );
  const {
    session,
    selectedPieceId: sourceIdentity,
    selectedPieceLineKey: sourceKey,
    sizeToken,
    generation,
  } = first;
  requireCopy(
    Number.isSafeInteger(generation) && generation >= 0,
    'invalid current Draft generation',
  );
  const row = Object.freeze({ ...first.row });
  function check() {
    const now = readCurrent();
    const aliases = now?.card.existingAliases?.filter(
      (a) =>
        a.scopeKey === row.scopeKey &&
        (a.blockName === sourceIdentity || a.blockName === `${sourceIdentity}_${sizeToken}`),
    );
    requireCopy(
      now &&
        now.session === session &&
        now.selectedPieceId === sourceIdentity &&
        now.selectedPieceLineKey === sourceKey &&
        now.generation === generation &&
        now.sizeToken === sizeToken &&
        sameSavedDraftRowV1(now.row, row) &&
        now.card.techCardId === row.techCardId &&
        aliases?.length &&
        new Set(aliases.map((a) => a.blockName)).size === aliases.length &&
        aliases.every((a) => a.pieceLineKey === sourceKey) &&
        now.card.existingPieces.filter((p) => p.lineKey === sourceKey).length === 1,
      'current row, selection or scoped card alias changed',
    );
  }
  check();
  const consumed = consumeDxfProductSavedNativeCompilerSourceV1(
    input.sourceOwner,
    input.sourceRequest,
  );
  requireCopy(
    consumed.ok && !consumed.value.reconstruction && sameSavedDraftRowV1(consumed.value.row, row),
    'verified own-format saved row required',
  );
  const native = consumed.value;
  requireCopy(
    session.source.phaseD.sourceFileId === native.sourceFileId &&
      session.source.phaseD.sourceSha256 === row.sha256,
    'Draft and native saved source differ',
  );
  const bytes = input.savedBytes.slice(0);
  requireCopy(
    bytes.byteLength === row.sizeBytes && (await sha256Hex(bytes)) === row.sha256,
    'saved bytes changed',
  );
  const sourceText = new TextDecoder('latin1').decode(bytes);
  new Uint8Array(bytes).fill(0);
  const variants = [native.draft];
  if (native.nativeSewingReplay?.replayReady)
    variants.push({
      ...native.draft,
      dxfProvenance: native.nativeSewingReplay.pipeline,
      dxfPhaseDReplay: native.nativeSewingReplay.replay,
    });
  let matched = false;
  for (const draft of variants) {
    const target = await selectMatchingSavedDraftV1(draft, row.scopeKey, sizeToken, session);
    if (
      target?.projection.pieces.some(
        (p) => p.pieceId === sourceIdentity && p.pieceLineKey === sourceKey,
      )
    ) {
      matched = true;
      break;
    }
  }
  requireCopy(matched, 'selected geometry and native saved catalog differ');
  const scopes = native.draft.scopes.filter((s) => s.target.scopeKey === row.scopeKey),
    scope = scopes[0],
    replay = scope?.writerReplay;
  requireCopy(
    scopes.length === 1 &&
      scope &&
      replay &&
      !replay.retainedLineSplit &&
      replay.job.dialect === 'r12',
    'an ordinary R12 saved writer replay is required',
  );
  const job = structuredClone(replay.job);
  const candidates = job.pieces.filter((p) => p.identity === sourceIdentity),
    piece = candidates[0];
  requireCopy(
    candidates.length === 1 &&
      piece &&
      !piece.pairOf &&
      !piece.pairHand &&
      !piece.ungraded &&
      piece.displayName === sourceIdentity &&
      piece.sizes.length === job.sizes.length &&
      job.sizes.every(
        (s) =>
          piece.sizes.filter(
            (z) => z.rank === s.rank && z.sizeId === s.sizeId && z.sizeToken === s.token,
          ).length === 1,
      ),
    'no independent stable source piece with all ranks',
  );
  const names = new Set(
    [
      ...job.pieces.map((p) => p.identity),
      ...first.card.existingPieces.map((p) => p.name),
      ...(first.card.existingAliases ?? [])
        .filter((a) => a.scopeKey === row.scopeKey)
        .map((a) => a.blockName),
    ].map((n) => n.trim().toUpperCase()),
  );
  let suffix = 2;
  while (names.has(`${sourceIdentity}_${suffix}`.toUpperCase())) suffix++;
  const identity = `${sourceIdentity}_${suffix}`,
    copy = structuredClone(piece);
  copy.identity = identity;
  copy.displayName = identity;
  copy.mods = [...piece.mods, String(suffix)];
  copy.seed = job.pieces.reduce((max, p) => Math.max(max, p.seed), 0) + 1;
  requireCopy(Number.isSafeInteger(copy.seed), 'no available piece seed');
  job.pieces.push(copy);
  const written = writeDxfDetailed(job, { now: () => new Date(replay.createdAt) });
  const verifyGeometry = nativePieceCopyVerifier(sourceText, sourceIdentity, identity);
  verifyGeometry(written.dxfText);
  const file = new File([written.dxfText], 'unlinked-draft-copy.dxf', { type: 'image/vnd.dxf' });
  const sha = await sha256Hex(await file.arrayBuffer());
  check();
  const review = Object.freeze({ kind: 'unlinked-draft-piece-copy/1' as const });
  pending.set(review, {
    file,
    sha,
    cardId: row.techCardId,
    scopeKey: row.scopeKey,
    sourceIdentity,
    sourceKey,
    identity,
    check,
    revalidate: async () => {
      requireCopy(
        sameSavedDraftRowV1(row, await readCurrentRow(row)),
        'authoritative source row changed before Apply',
      );
    },
    verifyGeometry,
  });
  return review;
}

export function takeUnlinkedDraftPieceCopyReviewV1(review: CopyReview) {
  const state = pending.get(review);
  requireCopy(state, 'review is unknown or has been consumed');
  pending.delete(review);
  state.check();
  opened.set(state.file, state);
  markUnlinkedPieceCopyFileV1(state.file);
  return { file: state.file, identity: state.identity };
}

/** The original File, fresh ordinary writer output, and an explicit Apply must all describe one distinct new line. */
export async function acknowledgeUnlinkedDraftPieceCopyV1(file: File, draft: CardDraft) {
  const state = opened.get(file);
  requireCopy(state, 'the original explicitly reviewed File is unavailable');
  state.check();
  const scope = draft.scopes[0],
    replay = scope?.writerReplay,
    pd = draft.dxfPhaseDReplay;
  requireCopy(
    draft.techCardId === state.cardId &&
      draft.scopes.length === 1 &&
      scope?.target.scopeKey === state.scopeKey &&
      isOrdinaryWizardCopyScopeV1(file, scope) &&
      replay &&
      scope.manifest.gate?.passed &&
      pd?.replayReady &&
      pd.carrier.sourceSha256 === state.sha &&
      draft.dxfProvenance?.contentBinding?.sourceSha256 === state.sha,
    'ordinary review, file hash or gate differs',
  );
  const text = scope.dxfText;
  const hash = await sha256Hex(new TextEncoder().encode(text).buffer);
  const produced = await replayPatternImportDxfProductWriterV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_V1,
    replay,
    finalManifest: scope.manifest,
    expected: { scopeKey: state.scopeKey, exportSha256: hash },
  });
  requireCopy(produced.ok, 'ordinary product writer output is inconsistent');
  requireCopy(
    scope.dxfText === text && draft.scopes[0] === scope,
    'writer output changed during review',
  );
  state.verifyGeometry(text);
  const spellings = aliasNames(scope.manifest);
  const line = (id: string) => {
    const block = spellings.get(id);
    requireCopy(block, 'missing source or copy alias');
    const aliases = draft.aliases.filter(
      (a) => aliasKey(a.scopeKey, a.blockName) === aliasKey(state.scopeKey, block),
    );
    requireCopy(
      aliases.length === 1 &&
        aliases[0]!.blockName === block &&
        aliases[0]!.scopeKey === state.scopeKey,
      'ambiguous source or copy alias',
    );
    return aliases[0]!.pieceLineKey;
  };
  const newKey = line(state.identity);
  requireCopy(
    line(state.sourceIdentity) === state.sourceKey && newKey !== state.sourceKey,
    'source and copy would share a line',
  );
  const newPieceIntent = sealApplyNewPieceIntent({
    draft,
    scopeKey: state.scopeKey,
    writerIdentity: state.identity,
    expectedLineKey: newKey,
    retainedSource: { blockName: spellings.get(state.sourceIdentity)!, lineKey: state.sourceKey },
  });
  requireCopy(newPieceIntent, 'the ordinary wizard did not create one distinct provisional line');
  await state.revalidate();
  state.check();
  return newPieceIntent;
}
