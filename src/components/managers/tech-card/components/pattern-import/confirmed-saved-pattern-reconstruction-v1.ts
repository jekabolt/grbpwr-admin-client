import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { aliasKey, normBlock } from 'lib/pattern-import/fabrics/draft';
import {
  PATTERN_IMPORT_APPLY_COMMIT_RECEIPT_V1,
  type ApplyResult,
  type CardDraft,
} from 'lib/pattern-import/types';
import { bindingScopes } from '../bom-purpose';
import { rollGoodsScopes } from '../piece-block-refs';
import type { CardContext } from './client';
import { savedWorkbenchBindingScopeKeyV1 } from './phase-e-workbench-v2/saved-workbench-scope-v1';

export type ConfirmedPatternApplyV1 = Extract<ApplyResult, { ok: true }> & {
  commitReceipt: NonNullable<Extract<ApplyResult, { ok: true }>['commitReceipt']>;
};

export type ReadConfirmedPatternCardV1 = (
  signal: AbortSignal,
) => Promise<common_TechCard | undefined>;

type ConfirmedRow =
  | { ok: true; row: DxfProductSavedRowIdentityV1; downloadUrl: string; patternVersion: number }
  | { ok: false; detail: string };

function matchesConfirmedPieceBindings(
  card: NonNullable<common_TechCard['techCard']>,
  scope: ConfirmedPatternApplyV1['commitReceipt']['scopes'][number],
  materialScopes: ReturnType<typeof rollGoodsScopes>,
): boolean {
  const pieceLineKeys = new Set(scope.pieceLineKeys);
  if (
    !pieceLineKeys.size ||
    pieceLineKeys.has('') ||
    pieceLineKeys.size !== scope.pieceLineKeys.length
  )
    return false;
  const seenPieceKeys = new Set<string>();
  for (const { lineKey } of card.pieces ?? []) {
    if (!lineKey || !pieceLineKeys.has(lineKey)) continue;
    if (seenPieceKeys.has(lineKey)) return false;
    seenPieceKeys.add(lineKey);
  }
  if (seenPieceKeys.size !== pieceLineKeys.size) return false;

  const expectedOwners = new Map<string, string>();
  for (const alias of scope.aliases) {
    const key = aliasKey(alias.scopeKey, alias.blockName);
    if (
      alias.scopeKey !== scope.scopeKey ||
      !normBlock(alias.blockName) ||
      !pieceLineKeys.has(alias.pieceLineKey) ||
      expectedOwners.has(key)
    )
      return false;
    expectedOwners.set(key, alias.pieceLineKey);
  }
  if (!expectedOwners.size) return false;

  const aliases = card.pieceDxfAliases?.items ?? [];
  const bindings = bindingScopes(materialScopes, aliases);
  const seenAliasKeys = new Set<string>();
  for (const alias of aliases) {
    const scoped = savedWorkbenchBindingScopeKeyV1(alias.fabricPurpose, alias.bomLineKey, bindings);
    if (scoped !== scope.scopeKey || !alias.blockName) continue;
    const key = aliasKey(scoped, alias.blockName);
    const expectedOwner = expectedOwners.get(key);
    if (expectedOwner === undefined) continue;
    if (alias.pieceLineKey !== expectedOwner || seenAliasKeys.has(key)) return false;
    seenAliasKeys.add(key);
  }
  return seenAliasKeys.size === expectedOwners.size;
}

export function resolveConfirmedSavedPatternRowV1(
  card: common_TechCard | undefined,
  apply: ConfirmedPatternApplyV1,
  scopeKey: string,
): ConfirmedRow {
  const refused = (detail: string) => ({ ok: false as const, detail });
  const { commitReceipt } = apply;
  if (
    commitReceipt.schemaVersion !== PATTERN_IMPORT_APPLY_COMMIT_RECEIPT_V1 ||
    !Number.isSafeInteger(commitReceipt.previousLockVersion) ||
    commitReceipt.previousLockVersion < 0
  )
    return refused('The confirmed import has no valid saved-card receipt.');
  const scopes = commitReceipt.scopes.filter((scope) => scope.scopeKey === scopeKey);
  const uploads = apply.uploaded.filter((upload) => upload.scopeKey === scopeKey);
  if (scopes.length !== 1 || uploads.length !== 1)
    return refused('The confirmed import must identify one exact scope and uploaded DXF.');
  const scope = scopes[0];
  const upload = uploads[0];
  const insert = card?.techCard;
  const patterns = insert?.patterns ?? [];
  const rows = patterns.filter((pattern) => pattern.lineKey === scope.patternLineKey);
  const pattern = rows[0];
  const lock = card?.lockVersion;
  const revision = pattern?.savedRowRevision;
  const patternVersion = pattern?.version;
  const sizeBytes = Number(pattern?.sizeBytes);
  if (
    card?.id !== commitReceipt.techCardId ||
    !insert ||
    lock === undefined ||
    !Number.isSafeInteger(lock) ||
    lock <= commitReceipt.previousLockVersion ||
    rows.length !== 1 ||
    !pattern ||
    Number(pattern.sizeId ?? 0) !== scope.patternSizeId ||
    pattern.url !== scope.patternUrl ||
    pattern.url !== upload.url ||
    !/^[a-f0-9]{64}$/.test(upload.sha256 ?? '') ||
    pattern.sha256 !== upload.sha256 ||
    !pattern.downloadUrl ||
    revision === undefined ||
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    patternVersion === undefined ||
    !Number.isSafeInteger(patternVersion) ||
    patternVersion <= 0 ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes !== upload.sizeBytes
  )
    return refused('The current saved DXF no longer matches the confirmed upload and card lock.');
  const materialScopes = rollGoodsScopes(insert.bomItems ?? []);
  const bindings = bindingScopes(materialScopes, patterns);
  const currentScope = savedWorkbenchBindingScopeKeyV1(
    pattern.fabricPurpose,
    pattern.bomLineKey,
    bindings,
  );
  if (!currentScope || currentScope !== scopeKey)
    return refused('The current saved DXF moved to another material scope.');
  if (!matchesConfirmedPieceBindings(insert, scope, materialScopes))
    return refused('The saved DXF piece and block bindings no longer match the confirmed import.');
  return {
    ok: true,
    row: {
      techCardId: card.id,
      cardLockVersion: lock,
      scopeKey: currentScope,
      patternLineKey: scope.patternLineKey,
      revision,
      url: scope.patternUrl,
      sha256: upload.sha256!,
      sizeBytes,
    },
    downloadUrl: pattern.downloadUrl,
    patternVersion,
  };
}

/** Reopens newly uploaded canonical bytes against the original apply receipt. */
export async function reconstructConfirmedSavedPatternV1(input: {
  apply: ConfirmedPatternApplyV1;
  scopeKey: string;
  readCard: ReadConfirmedPatternCardV1;
  buildCardContext: (card: common_TechCard) => CardContext;
  signal: AbortSignal;
}): Promise<{ draft: CardDraft; row: DxfProductSavedRowIdentityV1; patternVersion: number }> {
  const read = async () => {
    input.signal.throwIfAborted();
    const card = await input.readCard(input.signal);
    input.signal.throwIfAborted();
    const current = resolveConfirmedSavedPatternRowV1(card, input.apply, input.scopeKey);
    if (!current.ok) throw new Error(current.detail);
    return { ...current, card: card! };
  };

  let start = await read();
  const [ownerModule, hostModule, commitModule] = await Promise.all([
    import('lib/pattern-import/dxf-product-saved-reprocess-owner-v1'),
    import('./phase-e-workbench-v2/saved-dxf-reprocess-host-v1'),
    import('lib/cloth/domain/pattern-import-dxf-product-commit-replay-v1'),
  ]);
  // An import can trigger size/area follow-ups that advance the card lock. Each replay still
  // uses one exact lock. Restart the read only if the genuine receipt still names the same row.
  for (let attempt = 0; ; attempt += 1) {
    input.signal.throwIfAborted();
    const initial = start;
    const readSame = async (row: DxfProductSavedRowIdentityV1) => {
      const current = await read();
      if (
        current.patternVersion !== initial.patternVersion ||
        (Object.keys(row) as (keyof DxfProductSavedRowIdentityV1)[]).some(
          (key) => key !== 'cardLockVersion' && current.row[key] !== row[key],
        )
      )
        throw new Error('The saved pattern moved during reconstruction.');
      if (current.row.cardLockVersion !== row.cardLockVersion) {
        if (current.row.cardLockVersion > row.cardLockVersion) start = current;
        throw new Error('The card lock advanced while opening the saved pattern.');
      }
      return current;
    };
    const host = hostModule.createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      nativeSewingReplay: true,
      resolveCard: async (expected) => {
        const current = await readSame(expected);
        return {
          card: input.buildCardContext(current.card),
          cardLockVersion: current.row.cardLockVersion,
        };
      },
      readAuthoritativeRow: async (expected) => readSame(expected),
    });
    const owner = ownerModule.createDxfProductSavedReprocessOwnerV1(host);
    const cancel = () => owner.cancel();
    input.signal.addEventListener('abort', cancel, { once: true });
    try {
      const rebuilt = await owner.run({
        schemaVersion: ownerModule.DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row: initial.row,
      });
      input.signal.throwIfAborted();
      if (!rebuilt.ok) throw new Error(rebuilt.blockers[0].detail);
      const proof = await commitModule.replayCommittedPatternImportDxfProductScopeV1(
        rebuilt.draft,
        input.apply,
        input.scopeKey,
      );
      if (!proof.ok) throw new Error(proof.blockers.map((value) => value.detail).join('; '));
      if (
        proof.evidence.productExportSha256 !== initial.row.sha256 ||
        proof.evidence.byteLength !== initial.row.sizeBytes
      )
        throw new Error('The writer replay does not match the newly saved DXF.');
      if (
        !rebuilt.nativeSewingReplay?.replayReady ||
        rebuilt.nativeSewingReplay.pipeline.contentBinding?.sourceSha256 !== initial.row.sha256
      )
        throw new Error('The newly saved DXF does not expose exact native sewing boundaries.');
      await readSame(initial.row);
      return {
        row: rebuilt.row,
        patternVersion: initial.patternVersion,
        draft: { ...rebuilt.draft, dxfNativeSewingReplay: rebuilt.nativeSewingReplay },
      };
    } catch (error) {
      if (input.signal.aborted || attempt >= 2 || start === initial) throw error;
    } finally {
      input.signal.removeEventListener('abort', cancel);
      owner.dispose();
    }
  }
}
