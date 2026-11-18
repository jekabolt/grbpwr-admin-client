import {
  readSavedJoinFile,
  registerSavedJoinFile,
  cancelSavedJoinFile,
} from './draft-cad-saved-join-file';
import type { SaveJoin } from '../../guarded-piece-join';
import { adminService } from 'api/api';
import type { GuardedNativePieceJoin } from 'api/proto-http/admin';
import { sha256Hex } from 'lib/features/sha256';
import { aliasKey, aliasNames } from 'lib/pattern-import/fabrics/draft';
import { NEW_PIECE } from 'lib/pattern-import/fabrics/assembly-impact';
import type {
  ApplyCommitScopeBinding,
  ApplyUploaded,
  CardDraft,
  PieceSizeSpec,
} from 'lib/pattern-import/types';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import {
  prepareSavedJoinBoundaryV1,
  type RegisteredJoinSelection,
} from './draft-cad-saved-join-boundary-v1';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { sameSavedDraftRowV1 } from './draft-cad-saved-source-selection-v1';

export type JoinPicks = Pick<RegisteredJoinSelection, 'fixed' | 'moving' | 'newIdentity'>;
export type JoinReview = Readonly<{
  cardId: number;
  scopeKey: string;
  generation: number;
  fixed: string;
  moving: string;
  identity: string;
  dx: number;
  dy: number;
}>;
type Source = Parameters<typeof prepareSavedJoinBoundaryV1>[0];
type Stored = {
  file: File;
  review: JoinReview;
  assertDraftCurrent: () => void;
  refresh: () => Promise<void>;
  dialect: 'r12' | 'r2000';
  locked?: boolean;
  draftText?: string;
  isWizardCurrent?: () => boolean;
  geometry: string;
  command: Omit<
    GuardedNativePieceJoin,
    'resultLineKey' | 'reviewedUrl' | 'reviewedFilename' | 'reviewedSizeBytes' | 'reviewedSha256'
  >;
};
const pending = new WeakMap<JoinReview, Stored>();
const files = new WeakMap<File, Stored>();

const receipts = new WeakMap<JoinApply, Stored>();
export type JoinApply = Readonly<{ kind: 'guarded-native-piece-join' }>;

function check(v: unknown, message: string): asserts v {
  if (!v) throw new Error(message);
}
function geometry(s: PieceSizeSpec) {
  return JSON.stringify([
    s.sizeToken,
    s.sizeId,
    s.rank,
    s.cut,
    s.seam,
    s.cutLoops ?? [],
    s.grain?.a,
    s.grain?.b,
    s.drills.map((d) => [d.form, d.sizeMm, d.at]),
    s.internal.map((m) => [m.label, m.closed, m.pts]),
    s.textMarks ?? [],
    s.pointMarks ?? [],
  ]);
}
export async function prepareSavedJoinReview(
  input: Source,
  generation: number,
  checkCurrent: () => void,
) {
  const row = input.selection.row;
  const source = await readCompleteSavedAssemblySourceV1(
    adminService,
    row,
    {},
    new AbortController().signal,
  );
  const { selection, job } = await prepareSavedJoinBoundaryV1({
    ...input,
    readCurrent: () => {
      const live = input.readCurrent();
      const assembly = {
        ops: source.operations.map((o) => ({
          number: o.operationNumber!,
          work: o.work ?? '',
          inputKeys: [...(o.inputKeys ?? []), ...(o.pieceLineKeys ?? [])],
          outputUnitKey: o.outputUnitKey ?? '',
          outputUnitName: o.outputUnitName ?? '',
        })),
        seams: source.ownedSeams.map((s) => ({
          pieces: [...(s.sideA?.parts ?? []), ...(s.sideB?.parts ?? [])].map(
            (a) => a.pieceLineKey!,
          ),
          confirmed: s.status === 'TECH_CARD_SEAM_STATUS_CONFIRMED',
        })),
      };
      return { ...live, card: { ...live.card, assembly } };
    },
  });
  check(
    job.pieces.length === 1 &&
      job.sizes.length === 1 &&
      job.pieces[0]?.identity === selection.newIdentity,
    'Join requires a single child from the two original blocks.',
  );
  const original = source.rows.filter((r) => sameSavedDraftRowV1(r, row));
  check(original.length === 1, 'The authoritative Assembly row changed.');
  checkCurrent();
  const size = job.pieces[0].sizes[0]!;
  const file = new File([writeDxfDetailed(job).dxfText], 'joined-boundaries.dxf', {
    type: 'image/vnd.dxf',
  });
  const { fixed, moving } = selection;
  const edge = (e: typeof fixed) => ({
    pieceLineKey: e.pieceLineKey,
    pieceIdentity: e.pieceId,
    curveId: e.sourceCurveId,
    startVertexId: e.startVertexId,
    endVertexId: e.endVertexId,
  });
  const dx = selection.translateMovingMm.x,
    dy = selection.translateMovingMm.y;
  const units = (n: number) => {
    const u = Math.round(n * 1e6);
    check(
      Number.isSafeInteger(u) && Math.abs(n - u / 1e6) < 1e-10,
      'The registration exceeds DXF precision.',
    );
    return u;
  };
  const review = Object.freeze({
    cardId: row.techCardId,
    scopeKey: row.scopeKey,
    generation,
    fixed: fixed.pieceId,
    moving: moving.pieceId,
    identity: selection.newIdentity,
    dx,
    dy,
  });
  pending.set(review, {
    file,
    review,
    dialect: job.dialect,
    assertDraftCurrent: checkCurrent,
    geometry: geometry(size),
    refresh: async () => {
      await readCompleteSavedAssemblySourceV1(
        adminService,
        row,
        {
          expectedServerAssemblyRevision: source.serverAssemblyRevision,
          expectedCompleteSourceSha256: source.sourceSha256,
        },
        new AbortController().signal,
      );
    },
    command: {
      expectedRow: {
        techCardId: row.techCardId,
        scopeKey: row.scopeKey,
        patternLineKey: row.patternLineKey,
        savedRowRevision: row.revision,
        cardLockVersion: row.cardLockVersion,
        url: row.url,
        sizeBytes: row.sizeBytes,
        sha256: row.sha256,
        patternVersion: original[0]!.patternVersion,
        downloadUrl: undefined,
      },
      expectedAssemblyRevision: source.serverAssemblyRevision,
      expectedCompleteSourceSha256: source.sourceSha256,
      fixed: edge(fixed),
      moving: edge(moving),
      resultIdentity: selection.newIdentity,
      fabricPurpose: row.scopeKey,
      bomLineKey: job.scope.bomLineKey,
      sizeId: size.sizeId,
      sizeToken: size.sizeToken,
      translateXMillionthsMm: units(dx),
      translateYMillionthsMm: units(dy),
    },
  });
  return review;
}
export async function takeSavedJoinFile(
  review: JoinReview,
  isCurrent: () => boolean,
  isWizardCurrent: () => boolean,
) {
  const state = pending.get(review);
  check(state, 'The saved Join review expired.');
  state.assertDraftCurrent();
  await state.refresh();
  state.assertDraftCurrent();
  check(pending.delete(review) && isCurrent(), 'The Join review closed or changed.');
  state.isWizardCurrent = isWizardCurrent;
  registerSavedJoinFile(state.file, state.dialect);
  files.set(state.file, state);
  return state.file;
}
export async function acknowledgeSavedJoin(draft: CardDraft, file: File) {
  const original = readSavedJoinFile(file);
  const s = files.get(file),
    scope = draft.scopes[0];
  check(
    s &&
      !s.locked &&
      scope &&
      s.isWizardCurrent?.() &&
      scope === original?.scope &&
      scope.dxfText === original?.text &&
      draft.scopes.length === 1 &&
      scope.target.scopeKey === s.review.scopeKey &&
      scope.manifest.gate?.passed,
    'The original Wizard Join review is required.',
  );
  const piece = scope.writerReplay?.job.pieces[0];
  check(
    piece &&
      scope.writerReplay?.job.pieces.length === 1 &&
      piece.identity === s.review.identity &&
      piece.sizes.length === 1 &&
      geometry(piece.sizes[0]!) === s.geometry,
    'The reviewed Join geometry or marks changed.',
  );
  const block = aliasNames(scope.manifest).get(s.review.identity);
  check(block === s.review.identity, 'The reviewed child block identity changed.');
  for (const u of draft.unresolved ?? []) {
    check(
      u.scopeKey === s.review.scopeKey &&
        u.blockName === block &&
        draft.answers?.blocks?.[aliasKey(u.scopeKey, u.blockName)] === NEW_PIECE,
      'Choose New piece for the reviewed Join.',
    );
  }
  await s.refresh();
  check(
    readSavedJoinFile(file) === original &&
      s.isWizardCurrent?.() &&
      files.get(file) === s &&
      !s.locked,
    'The current Join review closed.',
  );
  s.draftText = original.text;
  s.locked = true;
  const proof = Object.freeze({ kind: 'guarded-native-piece-join' as const });
  receipts.set(proof, s);
  return proof;
}
export async function commitSavedJoin(
  proof: JoinApply,
  binding: ApplyCommitScopeBinding,
  upload: ApplyUploaded,
  previousLock: number | undefined,
  save: SaveJoin,
) {
  const s = receipts.get(proof);
  check(
    s &&
      s.isWizardCurrent?.() &&
      files.get(s.file) === s &&
      readSavedJoinFile(s.file)?.scope?.dxfText === s.draftText,
    'The original Join review expired.',
  );
  const c = s.command,
    row = c.expectedRow!,
    key = binding.pieceLineKeys[0];
  check(
    previousLock === row.cardLockVersion &&
      binding.scopeKey === s.review.scopeKey &&
      binding.patternLineKey === row.patternLineKey &&
      binding.patternUrl === upload.url &&
      binding.pieceLineKeys.length === 1 &&
      key &&
      key !== c.fixed?.pieceLineKey &&
      key !== c.moving?.pieceLineKey &&
      binding.aliases.length === 1 &&
      binding.aliases[0]?.blockName === c.resultIdentity &&
      binding.aliases[0]?.pieceLineKey === key,
    'The current file, new piece or original row differs from the review.',
  );
  const text = s.draftText!;
  const raw = Uint8Array.from(text, (ch) => ch.charCodeAt(0));
  check(
    upload.sizeBytes === raw.length && upload.sha256 === (await sha256Hex(raw)),
    'The uploaded DXF differs from the reviewed bytes.',
  );
  await s.refresh();
  check(
    readSavedJoinFile(s.file) &&
      s.isWizardCurrent?.() &&
      files.get(s.file) === s &&
      receipts.delete(proof),
    'The Join review was cancelled or already applied.',
  );
  const requireCurrent = () =>
    check(
      readSavedJoinFile(s.file)?.scope?.dxfText === s.draftText && s.isWizardCurrent?.(),
      'The open Patterns review changed before saving.',
    );
  await save(
    {
      ...c,
      resultLineKey: key,
      reviewedFilename: upload.filename,
      reviewedUrl: upload.url,
      reviewedSizeBytes: upload.sizeBytes,
      reviewedSha256: upload.sha256,
    },
    requireCurrent,
  );
  cancelSavedJoinFile(s.file);
  files.delete(s.file);
}
