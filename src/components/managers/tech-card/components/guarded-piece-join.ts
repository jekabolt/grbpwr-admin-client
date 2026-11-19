import { createContext, useContext } from 'react';
import type { common_TechCard, GuardedNativePieceJoin } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { bindingScopes } from './bom-purpose';
import { rollGoodsScopes } from './piece-block-refs';
import { savedWorkbenchBindingScopeKeyV1 } from './pattern-import/phase-e-workbench-v2/saved-workbench-scope-v1';
import { assertExactZeroOperationSavedPatternRowV1 } from './pattern-import/phase-e-workbench-v2/zero-operation-saved-card-authority-v1';

export type SaveJoin = (
  command: GuardedNativePieceJoin,
  requireCurrent: () => void,
) => Promise<void>;
export const GuardedPieceJoinContext = createContext<SaveJoin | null>(null);
export const useGuardedPieceJoin = () => useContext(GuardedPieceJoinContext);
function requireJoin(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function state(card: common_TechCard, row: DxfProductSavedRowIdentityV1) {
  assertExactZeroOperationSavedPatternRowV1(card, row);
  const body = card.techCard!;
  const bindings = bindingScopes(rollGoodsScopes(body.bomItems ?? []), body.patterns ?? []);
  const pattern = body.patterns!.find((p) => p.lineKey === row.patternLineKey)!;
  const aliases = (body.pieceDxfAliases?.items ?? []).map((a) => ({
    scope: savedWorkbenchBindingScopeKeyV1(a.fabricPurpose, a.bomLineKey, bindings),
    block: a.blockName,
    key: a.pieceLineKey,
  }));
  return { pattern, aliases, pieces: body.pieces ?? [] };
}
export async function writeGuardedSavedPieceJoin(
  command: GuardedNativePieceJoin,
  ports: {
    read: () => Promise<common_TechCard>;
    update: (command: GuardedNativePieceJoin) => Promise<number | undefined>;
  },
) {
  const r = command.expectedRow,
    fixed = command.fixed,
    moving = command.moving;
  requireJoin(
    r?.techCardId &&
      r.scopeKey &&
      r.patternLineKey &&
      r.savedRowRevision &&
      r.cardLockVersion !== undefined &&
      r.url &&
      r.sha256 &&
      r.sizeBytes &&
      r.patternVersion &&
      fixed?.pieceLineKey &&
      moving?.pieceLineKey &&
      fixed.pieceIdentity &&
      moving.pieceIdentity &&
      command.resultIdentity &&
      command.resultLineKey &&
      command.reviewedUrl &&
      command.reviewedSha256 &&
      command.reviewedSizeBytes,
    'Reopen the saved Join to verify both source pieces and the result.',
  );
  const row = {
    techCardId: r.techCardId,
    scopeKey: r.scopeKey,
    patternLineKey: r.patternLineKey,
    revision: r.savedRowRevision,
    cardLockVersion: r.cardLockVersion,
    url: r.url,
    sha256: r.sha256,
    sizeBytes: r.sizeBytes,
  };
  const original = state(await ports.read(), row);
  const sources = [fixed.pieceLineKey, moving.pieceLineKey];
  const childBlocks = new Set([
    command.resultIdentity,
    command.resultIdentity + '_' + command.sizeToken,
  ]);
  requireJoin(
    new Set([...sources, command.resultLineKey]).size === 3 &&
      original.pattern.version === r.patternVersion &&
      !original.pieces.some((p) => p.lineKey === command.resultLineKey) &&
      !original.aliases.some(
        (a) =>
          a.key === command.resultLineKey ||
          (a.scope === row.scopeKey && !!a.block && childBlocks.has(a.block)),
      ),
    'The original row or the new piece binding changed.',
  );
  for (const source of [fixed, moving]) {
    const blocks = new Set([source.pieceIdentity, source.pieceIdentity + '_' + command.sizeToken]);
    const links = original.aliases.filter(
      (a) => a.key === source.pieceLineKey || (a.scope === row.scopeKey && blocks.has(a.block)),
    );
    requireJoin(
      original.pieces.filter((p) => p.lineKey === source.pieceLineKey).length === 1 &&
        links.length > 0 &&
        new Set(links.map((a) => a.block)).size === links.length &&
        links.every(
          (a) => a.scope === row.scopeKey && a.key === source.pieceLineKey && blocks.has(a.block),
        ),
      'The Join source binding changed.',
    );
  }
  const lock = await ports.update(command);
  requireJoin(
    lock === row.cardLockVersion + 1,
    'Reload the card to verify the Join save response.',
  );
  const fresh = await ports.read();
  const saved = state(fresh, {
    ...row,
    revision: row.revision + 1,
    cardLockVersion: lock,
    url: command.reviewedUrl,
    sizeBytes: command.reviewedSizeBytes,
    sha256: command.reviewedSha256,
  });
  const child = saved.aliases.filter(
    (a) =>
      a.key === command.resultLineKey ||
      (a.scope === row.scopeKey && !!a.block && childBlocks.has(a.block)),
  );
  requireJoin(
    saved.pattern.version === r.patternVersion + 1 &&
      saved.pattern.history?.some(
        (h) => h.url === row.url && h.sha256 === row.sha256 && Number(h.snapshotId) > 0,
      ) &&
      !saved.pieces.some((p) => p.lineKey && sources.includes(p.lineKey)) &&
      !saved.aliases.some((a) => a.key && sources.includes(a.key)) &&
      saved.pieces.filter(
        (p) => p.lineKey === command.resultLineKey && p.name === command.resultIdentity,
      ).length === 1 &&
      child.length === 1 &&
      child[0]?.key === command.resultLineKey &&
      child[0].block === command.resultIdentity &&
      child[0].scope === row.scopeKey,
    'Reload the card to verify the saved Join, retired pieces and pattern history.',
  );
  return fresh;
}
