import { createContext, useContext } from 'react';
import type { common_TechCard, GuardedZeroOperationPieceRename } from 'api/proto-http/admin';
import { bindingScopes } from './bom-purpose';
import { rollGoodsScopes } from './piece-block-refs';
import { normalizeTechCardPieceRename } from 'utils/pattern';
import { savedWorkbenchBindingScopeKeyV1 } from './pattern-import/phase-e-workbench-v2/saved-workbench-scope-v1';
import { assertExactZeroOperationSavedPatternRowV1 } from './pattern-import/phase-e-workbench-v2/zero-operation-saved-card-authority-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

export type GuardedSavedPieceRename = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  pieceLineKey: string;
  expectedName: string;
  nextName: string;
}>;

export const GuardedPieceRenameContext = createContext<
  ((intent: GuardedSavedPieceRename) => Promise<void>) | null
>(null);

export function useGuardedPieceRename() {
  return useContext(GuardedPieceRenameContext);
}

function readRenameBinding(
  card: common_TechCard,
  row: DxfProductSavedRowIdentityV1,
  lineKey: string,
  name: string,
) {
  assertExactZeroOperationSavedPatternRowV1(card, row);
  const body = card.techCard!;
  if (body.operations?.length || card.seams?.length || card.pieceFolds?.length)
    throw new Error('This card now contains assembly work.');
  const pieces = (body.pieces ?? []).filter((piece) => piece.lineKey?.toUpperCase() === lineKey);
  if (pieces.length !== 1 || pieces[0].lineKey !== lineKey || pieces[0].name !== name)
    throw new Error('The selected piece changed. Reopen its inspector.');
  const bindings = bindingScopes(rollGoodsScopes(body.bomItems ?? []), body.patterns ?? []);
  const aliases = (body.pieceDxfAliases?.items ?? [])
    .map((alias) => [
      savedWorkbenchBindingScopeKeyV1(alias.fabricPurpose, alias.bomLineKey, bindings),
      alias.blockName,
      alias.pieceLineKey,
    ])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  if (!aliases.some(([scope, , piece]) => scope === row.scopeKey && piece === lineKey))
    throw new Error('The selected piece is no longer bound to this pattern.');
  return aliases;
}

export async function writeGuardedSavedPieceRename(
  intent: GuardedSavedPieceRename,
  ports: Readonly<{
    read: () => Promise<common_TechCard>;
    update: (rename: GuardedZeroOperationPieceRename) => Promise<number | undefined>;
  }>,
): Promise<common_TechCard> {
  const nextName = normalizeTechCardPieceRename(intent.nextName);
  if (
    !nextName ||
    nextName === intent.expectedName ||
    !/^[0-9A-HJKMNP-TV-Z]{26}$/.test(intent.pieceLineKey)
  )
    throw new Error('Enter a changed name for this saved piece.');
  const before = await ports.read();
  const aliases = readRenameBinding(before, intent.row, intent.pieceLineKey, intent.expectedName);
  const lock = await ports.update({
    pieceLineKey: intent.pieceLineKey,
    expectedName: intent.expectedName,
    nextName,
    scopeKey: intent.row.scopeKey,
    patternLineKey: intent.row.patternLineKey,
    expectedSavedRowRevision: intent.row.revision,
    expectedDxfSha256: intent.row.sha256,
  });
  if (lock !== intent.row.cardLockVersion + 1)
    throw new Error('The rename response could not be verified. Reload the card.');
  const after = await ports.read();
  const currentAliases = readRenameBinding(
    after,
    { ...intent.row, cardLockVersion: lock, revision: intent.row.revision + 1 },
    intent.pieceLineKey,
    nextName,
  );
  if (JSON.stringify(aliases) !== JSON.stringify(currentAliases))
    throw new Error('The saved pattern links changed. Reload the card.');
  return after;
}
