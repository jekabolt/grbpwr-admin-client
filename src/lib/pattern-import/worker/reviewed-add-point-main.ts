import type { CardContext } from 'components/managers/tech-card/components/pattern-import/client';
import type { DxfProductSavedReprocessHostV1 } from '../dxf-product-saved-reprocess-owner-v1';
import type {
  PatternImportOpenFile,
  ConversionManifest,
  ReviewedAddPointOpen,
  ReviewedAddPointAtWrite,
} from '../types';

type Grant = {
  wire: ReviewedAddPointOpen;
  check: () => void;
  atWrite: () => ReviewedAddPointAtWrite;
  active: boolean;
};
export type ReviewedAddPointLease = {
  wire: ReviewedAddPointOpen;
  check: () => void;
  atWrite: () => ReviewedAddPointAtWrite;
  release: () => void;
};
const candidates = new WeakSet<object>();
const authorized = new WeakMap<object, Promise<Grant>>();
const pending = new WeakMap<PatternImportOpenFile, Grant>();

/** Routing hint only. The review owner's independent File registry authenticates the actual claim. */
export function markReviewedAddPointFile(file: File) {
  candidates.add(file);
}
async function authorize(file: File): Promise<Grant> {
  const owner = await import(
    'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/draft-cad-saved-add-point-review-v1'
  );
  const proof = await owner.claimSavedAddPointReviewFileV1(file);
  const wire = owner.savedAddPointWorkerBindingV1(proof);
  return {
    wire,
    active: false,
    atWrite: () => owner.savedAddPointCurrentWorkerAliasesV1(proof),
    check: () => {
      if (!owner.isCurrentSavedAddPointReviewClaimV1(proof))
        throw new Error('The reviewed Add point selection is stale.');
    },
  };
}

/** Fresh and restarted worker opens go through the same exact File and current host check. */
export async function bindReviewedAddPointWorkerOpen(
  file: Pick<File, 'name' | 'arrayBuffer'>,
  input: PatternImportOpenFile,
  index: number,
) {
  if (!candidates.has(file)) return;
  if (index !== 0 || !(file instanceof File))
    throw new Error('Reviewed Add point requires the original single File.');
  let ready = authorized.get(file);
  if (!ready) {
    ready = authorize(file);
    authorized.set(file, ready);
  }
  const grant = await ready;
  grant.check();
  pending.set(input, grant);
}

type SavedRead = Parameters<DxfProductSavedReprocessHostV1['reprocess']>[0];
type SavedCard = Readonly<{ card: CardContext; cardLockVersion: number }>;

/** Bind only a disposable verified saved-row read. Its authorization expires with the host call. */
export async function bindProtectedSavedReadWorkerOpen(
  read: SavedRead,
  input: PatternImportOpenFile,
  manifest: ConversionManifest,
  snapshot: SavedCard,
): Promise<((fresh: SavedCard) => void) | undefined> {
  const marked = manifest.blocks.filter((block) => block.protectedLineSplit);
  if (!marked.length) return;
  const { claimProtectedSavedReadV1 } = await import('../dxf-product-saved-reprocess-owner-v1');
  const check = claimProtectedSavedReadV1(read);
  if (
    input.bytes !== read.bytes.buffer ||
    read.bytes.byteOffset !== 0 ||
    input.bytes.byteLength !== read.row.sizeBytes
  )
    throw new Error('The protected worker requires the verified saved-row buffer.');
  const row = read.row,
    entry = marked[0]!,
    record = entry.protectedLineSplit!,
    size = manifest.sizes[0];
  if (
    marked.length !== 1 ||
    manifest.sizes.length !== 1 ||
    !size ||
    manifest.techCardId !== row.techCardId ||
    size.sizeId !== entry.sizeId ||
    size.token !== entry.sizeToken ||
    input.dxfPathProvenance?.sourceFileId !== read.sourceFileId
  )
    throw new Error('The saved protected DXF has no unique block and size.');
  const resolve = ({ card, cardLockVersion }: SavedCard): ReviewedAddPointAtWrite => {
    check();
    const targets = card.scopes.filter((scope) => scope.scopeKey === row.scopeKey);
    const aliases =
      card.existingAliases?.filter(
        (a) =>
          a.scopeKey === row.scopeKey &&
          (a.blockName === entry.identity || a.blockName === entry.block),
      ) ?? [];
    const key = aliases[0]?.pieceLineKey;
    if (
      cardLockVersion !== row.cardLockVersion ||
      card.techCardId !== row.techCardId ||
      targets.length !== 1 ||
      targets[0]!.fabricPurpose !== manifest.scope.fabricPurpose ||
      targets[0]!.bomLineKey !== manifest.scope.bomLineKey ||
      !key ||
      aliases.length !== new Set(aliases.map((a) => a.blockName)).size ||
      aliases.some((a) => a.pieceLineKey !== key) ||
      card.existingPieces.filter((p) => p.lineKey === key).length !== 1
    )
      throw new Error('The protected saved DXF no longer resolves to one current card piece.');
    return {
      authority: 'verified-saved-read',
      fileSha256: row.sha256,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      pieceLineKey: key,
      aliases: aliases.map((a) => ({ ...a })),
    };
  };
  const opening = resolve(snapshot);
  let atWrite: ReviewedAddPointAtWrite | undefined;
  pending.set(input, {
    active: false,
    check,
    wire: {
      authority: 'verified-saved-read',
      fileSha256: row.sha256,
      rowSha256: row.sha256,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      pieceLineKey: opening.pieceLineKey,
      block: entry.block,
      identity: entry.identity,
      sizeId: size.sizeId,
      sizeToken: size.token,
      rank: size.rank,
      entityId: record.entityId,
      ringSha256: record.ringSha256,
    },
    atWrite: () => {
      check();
      if (!atWrite) throw new Error('The protected saved DXF requires a fresh card read at write.');
      return atWrite;
    },
  });
  return (fresh) => {
    const next = resolve(fresh);
    if (next.pieceLineKey !== opening.pieceLineKey)
      throw new Error('The protected saved DXF changed its current card piece.');
    atWrite = next;
  };
}

export function takeReviewedAddPointWorkerOpen(
  files: readonly PatternImportOpenFile[],
): ReviewedAddPointLease | undefined {
  const matches = files.filter((f) => pending.has(f));
  if (!matches.length) return undefined;
  if (files.length !== 1 || matches.length !== 1)
    throw new Error('Reviewed Add point requires exactly one open file.');
  const input = matches[0]!,
    grant = pending.get(input)!;
  pending.delete(input);
  grant.check();
  if (grant.active)
    throw new Error('The reviewed Add point already belongs to an active worker session.');
  grant.active = true;
  let held = true;
  return {
    wire: structuredClone(grant.wire),
    check: grant.check,
    atWrite: grant.atWrite,
    release: () => {
      if (held) {
        held = false;
        grant.active = false;
      }
    },
  };
}
