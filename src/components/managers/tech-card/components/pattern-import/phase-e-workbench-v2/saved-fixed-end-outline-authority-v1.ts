import { abortableAdminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import type { AssemblyPatternWriteGuard } from '../../nesting/reupload-session';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { sameSavedDraftRowV1 } from './draft-cad-saved-source-selection-v1';

type Row = DxfProductSavedRowIdentityV1;
export type SavedFixedEndReplacementV1 = Readonly<{
  scopeKey: string;
  lineKey: string;
  oldUrl: string;
  sha256: string;
  sizeBytes: number;
  guard: AssemblyPatternWriteGuard;
}>;
export type SavedFixedEndAuthorityV1 = Readonly<{
  row: Row;
  pieceLineKey: string;
  replacement: SavedFixedEndReplacementV1;
  verify: (signal: AbortSignal) => Promise<void>;
}>;
const verified = new WeakSet<SavedFixedEndAuthorityV1>();

export function isSavedFixedEndAuthorityV1(
  authority: SavedFixedEndAuthorityV1 | undefined,
  row: Row,
  pieceLineKey: string,
): authority is SavedFixedEndAuthorityV1 {
  return (
    !!authority &&
    verified.has(authority) &&
    authority.pieceLineKey === pieceLineKey &&
    sameSavedDraftRowV1(authority.row, row)
  );
}

function requireUnattachedPiece(techCard: common_TechCard, pieceLineKey: string) {
  const normal = (value: string | undefined) => value?.trim().toUpperCase();
  const key = normal(pieceLineKey);
  const pieces = techCard.techCard?.pieces ?? [];
  if (!key || pieces.filter((piece) => normal(piece.lineKey) === key).length !== 1)
    throw new Error('The shared outline piece changed. Reopen the saved corner.');
  for (const seam of techCard.seams ?? []) {
    const parts = [...(seam.sideA?.parts ?? []), ...(seam.sideB?.parts ?? [])];
    if (
      !parts.length ||
      parts.some(({ pieceLineKey }) => !normal(pieceLineKey) || normal(pieceLineKey) === key)
    )
      throw new Error('This saved corner requires the original piece without anchored seams.');
  }
  if (
    (techCard.pieceFolds ?? []).some(
      (fold) => !normal(fold.pieceLineKey) || normal(fold.pieceLineKey) === key,
    )
  )
    throw new Error('This saved corner requires the original piece without anchored folds.');
}

export async function captureSavedFixedEndAuthorityV1(
  row: Row,
  pieceLineKey: string,
  readCard: (
    row: Row,
    signal: AbortSignal,
  ) => Promise<Readonly<{ techCard: common_TechCard; row: Row }>>,
  signal: AbortSignal,
  readComplete = readCompleteSavedAssemblySourceV1,
  makeAdmin = abortableAdminService,
): Promise<SavedFixedEndAuthorityV1> {
  const captured = Object.freeze({ ...row });
  const read = async (
    active: AbortSignal,
    pinned?: Readonly<{ serverAssemblyRevision: string; sourceSha256: string }>,
  ) => {
    const initial = await readComplete(
      makeAdmin(active),
      captured,
      {
        sourceOnly: true,
        ...(pinned && {
          expectedServerAssemblyRevision: pinned.serverAssemblyRevision,
          expectedCompleteSourceSha256: pinned.sourceSha256,
        }),
      },
      active,
    );
    const current = await readCard(captured, active);
    if (
      !sameSavedDraftRowV1(current.row, captured) ||
      current.techCard.id !== captured.techCardId ||
      current.techCard.lockVersion !== captured.cardLockVersion
    )
      throw new Error('The saved outline row changed. Reopen the saved corner.');
    requireUnattachedPiece(current.techCard, pieceLineKey);
    return readComplete(
      makeAdmin(active),
      captured,
      {
        sourceOnly: true,
        expectedServerAssemblyRevision: initial.serverAssemblyRevision,
        expectedCompleteSourceSha256: initial.sourceSha256,
      },
      active,
    );
  };
  const opening = await read(signal);
  const authority = Object.freeze({
    row: captured,
    pieceLineKey,
    replacement: Object.freeze({
      scopeKey: captured.scopeKey,
      lineKey: captured.patternLineKey,
      oldUrl: captured.url,
      sha256: captured.sha256,
      sizeBytes: captured.sizeBytes,
      guard: Object.freeze({
        expectedLockVersion: captured.cardLockVersion,
        expectedServerAssemblyRevision: opening.serverAssemblyRevision,
      }),
    }),
    async verify(active: AbortSignal) {
      const current = await read(active, opening);
      if (
        current.serverAssemblyRevision !== opening.serverAssemblyRevision ||
        current.sourceSha256 !== opening.sourceSha256
      )
        throw new Error('The saved Assembly changed. Open a fresh corner review.');
    },
  });
  verified.add(authority);
  return authority;
}
