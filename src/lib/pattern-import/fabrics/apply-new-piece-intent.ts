import { readManifest } from '../manifest';
import type { ApplyCommitScopeBinding, CardDraft } from '../types';
import type { FormWrite, LiveCard, LivePiece, ScopeOf } from './apply';
import { aliasKey, aliasNames } from './draft';

declare const newPieceIntentBrand: unique symbol;
export type ApplyNewPieceIntent = Readonly<{ [newPieceIntentBrand]: never }>;

type NewPieceRequest = Readonly<{
  draft: CardDraft;
  scopeKey: string;
  writerIdentity: string;
  /** A key minted by the existing draft and required to be absent from the live card. */
  expectedLineKey: string;
  retainedSource?: Readonly<{ blockName: string; lineKey: string }>;
}>;

type NewPieceBinding = NewPieceRequest &
  Readonly<{ techCardId: number; blockName: string; pieceName: string; dxfText: string }>;

const sealedIntents = new WeakMap<ApplyNewPieceIntent, NewPieceBinding>();
const lower = (value: string | undefined) => (value ?? '').trim().toLowerCase();

function resolveDraftTarget({ draft, scopeKey, writerIdentity, expectedLineKey }: NewPieceRequest) {
  const scopes = draft.scopes.filter(({ target }) => target.scopeKey === scopeKey);
  const scope = scopes[0];
  if (scopes.length !== 1 || !expectedLineKey || expectedLineKey.trim() !== expectedLineKey)
    return null;
  const manifestPieces = scope.manifest.pieces.filter(
    ({ identity }) => identity === writerIdentity,
  );
  const blockName = aliasNames(scope.manifest).get(writerIdentity);
  if (
    manifestPieces.length !== 1 ||
    manifestPieces[0].pairOf ||
    manifestPieces[0].pairHand ||
    !blockName ||
    !scope.manifest.blocks.some(({ identity }) => identity === writerIdentity)
  )
    return null;

  const pieces = draft.pieces.filter(({ lineKey }) => lower(lineKey) === lower(expectedLineKey));
  const piece = pieces[0];
  if (
    pieces.length !== 1 ||
    piece.lineKey !== expectedLineKey ||
    piece.basis !== 'new' ||
    piece.existingLineKey ||
    !piece.name.trim() ||
    draft.pieces.some(
      (candidate) => candidate !== piece && lower(candidate.name) === lower(piece.name),
    )
  )
    return null;
  const aliases = draft.aliases.filter(
    (alias) =>
      lower(alias.pieceLineKey) === lower(expectedLineKey) ||
      aliasKey(alias.scopeKey, alias.blockName) === aliasKey(scopeKey, blockName),
  );
  if (
    aliases.length !== 1 ||
    aliases[0].scopeKey !== scopeKey ||
    aliases[0].blockName !== blockName ||
    aliases[0].pieceLineKey !== expectedLineKey
  )
    return null;
  return { blockName, pieceName: piece.name, dxfText: scope.dxfText };
}

function retainsSourceAlias(
  aliases: readonly Readonly<{ scopeKey: string; blockName: string; pieceLineKey: string }>[],
  binding: NewPieceRequest,
) {
  const source = binding.retainedSource;
  if (!source) return true;
  const matches = aliases.filter(
    (a) => aliasKey(a.scopeKey, a.blockName) === aliasKey(binding.scopeKey, source.blockName),
  );
  return (
    source.lineKey !== binding.expectedLineKey &&
    matches.length === 1 &&
    matches[0]!.scopeKey === binding.scopeKey &&
    matches[0]!.blockName === source.blockName &&
    matches[0]!.pieceLineKey === source.lineKey
  );
}

/** Seals a review's explicit new-piece decision for the existing Apply owner. */
export function sealApplyNewPieceIntent(request: NewPieceRequest): ApplyNewPieceIntent | null {
  const { techCardId } = request.draft;
  if (!Number.isSafeInteger(techCardId) || techCardId <= 0) return null;
  const target = resolveDraftTarget(request);
  if (!target || !retainsSourceAlias(request.draft.aliases, request)) return null;
  try {
    const manifest = readManifest(target.dxfText);
    const piece = manifest?.pieces.find(({ identity }) => identity === request.writerIdentity);
    if (
      !manifest ||
      !piece ||
      piece.pairOf ||
      piece.pairHand ||
      aliasNames(manifest).get(request.writerIdentity) !== target.blockName ||
      !manifest.blocks.some(({ identity }) => identity === request.writerIdentity)
    )
      return null;
  } catch {
    return null;
  }
  const intent = Object.freeze({}) as ApplyNewPieceIntent;
  sealedIntents.set(
    intent,
    Object.freeze({
      ...request,
      ...(request.retainedSource
        ? { retainedSource: Object.freeze({ ...request.retainedSource }) }
        : {}),
      ...target,
      techCardId,
    }),
  );
  return intent;
}

export function checkApplyNewPieceIntent(
  intent: ApplyNewPieceIntent,
  draft: CardDraft,
  live: LiveCard,
  scopeOf: ScopeOf,
): NewPieceBinding | null {
  const binding = sealedIntents.get(intent);
  if (!binding || binding.draft !== draft || binding.techCardId !== draft.techCardId) return null;
  const target = resolveDraftTarget(binding);
  if (
    !target ||
    target.blockName !== binding.blockName ||
    target.pieceName !== binding.pieceName ||
    target.dxfText !== binding.dxfText ||
    !retainsSourceAlias(draft.aliases, binding) ||
    (binding.retainedSource &&
      (live.pieces.filter((p) => p.lineKey === binding.retainedSource!.lineKey).length !== 1 ||
        !retainsSourceAlias(
          live.aliases.map((a) => ({
            scopeKey: scopeOf(a, 'link'),
            blockName: a.blockName ?? '',
            pieceLineKey: a.pieceLineKey ?? '',
          })),
          binding,
        ))) ||
    live.pieces.some(
      ({ lineKey, name }) =>
        lower(lineKey) === lower(binding.expectedLineKey) ||
        lower(name) === lower(binding.pieceName),
    ) ||
    live.aliases.some(
      (alias) =>
        lower(alias.pieceLineKey) === lower(binding.expectedLineKey) ||
        aliasKey(scopeOf(alias, 'link'), alias.blockName ?? '') ===
          aliasKey(binding.scopeKey, binding.blockName),
    )
  )
    return null;
  return binding;
}

export function planPreservesNewPiece(
  plan: Readonly<{
    writes: readonly FormWrite[];
    commitBindings: readonly ApplyCommitScopeBinding[];
  }>,
  binding: NewPieceBinding,
): boolean {
  const written = plan.writes.find(({ path }) => path === 'pieces')?.value;
  if (!Array.isArray(written)) return false;
  const newRows = (written as LivePiece[]).filter(
    ({ lineKey }) => lower(lineKey) === lower(binding.expectedLineKey),
  );
  const aliases = plan.commitBindings.flatMap((scope) =>
    scope.aliases.filter(
      (alias) =>
        lower(alias.pieceLineKey) === lower(binding.expectedLineKey) ||
        aliasKey(scope.scopeKey, alias.blockName) === aliasKey(binding.scopeKey, binding.blockName),
    ),
  );
  return (
    retainsSourceAlias(
      plan.commitBindings.flatMap((scope) => scope.aliases),
      binding,
    ) &&
    (!binding.retainedSource ||
      (written as LivePiece[]).filter((p) => p.lineKey === binding.retainedSource!.lineKey)
        .length === 1) &&
    newRows.length === 1 &&
    newRows[0].lineKey === binding.expectedLineKey &&
    newRows[0].name === binding.pieceName &&
    aliases.length === 1 &&
    aliases[0].scopeKey === binding.scopeKey &&
    aliases[0].blockName === binding.blockName &&
    aliases[0].pieceLineKey === binding.expectedLineKey
  );
}
