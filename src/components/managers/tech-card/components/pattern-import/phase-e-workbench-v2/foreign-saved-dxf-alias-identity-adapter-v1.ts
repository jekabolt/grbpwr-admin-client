import { identityGrammarProblem } from 'lib/pattern-import/manifest/identity';
import type { StageIO } from 'lib/pattern-import/types';

export const PATTERN_IMPORT_DXF_PHASE_E_FOREIGN_SAVED_ALIAS_IDENTITY_ADAPTER_V1 =
  'pattern-import-dxf-phase-e-foreign-saved-alias-identity-adapter/1' as const;

const MAX_SOURCE_IDENTITY_CODE_UNITS = 256;
const MAX_STABLE_ID_CODE_UNITS = 256;
const MAX_WRITER_IDENTITY_CODE_UNITS = 96;

type DxfIdentityCandidateV1 = Readonly<{
  /** Structural overlap with PieceCandidate keeps the worker's opt-in DXF extension assignable. */
  seed?: number;
  rank?: number;
  dxf?: Readonly<{ identity?: string | null }>;
}>;

export type PatternImportDxfPhaseEForeignSavedAliasIdentityFamilyV1 = Readonly<{
  seed: number;
  candidates: readonly DxfIdentityCandidateV1[];
}>;

export type PatternImportDxfPhaseEForeignSavedAliasIdentityRequestV1 = Readonly<{
  scopeKey: string;
  /** Exact source ranks already mapped one-to-one to the current card size run. */
  mappedSourceRanks: readonly number[];
  families: readonly PatternImportDxfPhaseEForeignSavedAliasIdentityFamilyV1[];
  aliases: readonly Readonly<{
    scopeKey: string;
    blockName: string;
    pieceLineKey: string;
  }>[];
  pieces: readonly Readonly<{
    lineKey: string;
    name: string;
  }>[];
}>;

export type PatternImportDxfPhaseEForeignSavedAliasIdentityBlockerCodeV1 =
  | 'invalid-input'
  | 'source-family-empty'
  | 'source-identity-missing'
  | 'source-identity-ambiguous'
  | 'source-identity-duplicate'
  | 'source-rank-missing'
  | 'source-rank-duplicate'
  | 'source-rank-outside-size-run'
  | 'source-rank-incomplete'
  | 'seed-duplicate'
  | 'scope-alias-missing'
  | 'scope-alias-ambiguous'
  | 'card-piece-missing'
  | 'card-piece-ambiguous'
  | 'card-piece-binding-duplicate'
  | 'writer-identity-invalid'
  | 'writer-identity-duplicate';

export type PatternImportDxfPhaseEForeignSavedAliasIdentityBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEForeignSavedAliasIdentityBlockerCodeV1;
  detail: string;
  seed: number | null;
  sourceBlockIdentity: string | null;
  pieceLineKey: string | null;
}>;

export type PatternImportDxfPhaseEForeignSavedAliasIdentityBindingV1 = Readonly<{
  seed: number;
  sourceBlockIdentity: string;
  sourceDisplayName: string;
  writerIdentity: string;
  pieceLineKey: string;
  pieceName: string;
}>;

export type PatternImportDxfPhaseEForeignSavedAliasIdentityResultV1 =
  | Readonly<{
      ok: true;
      pieceOverrides: StageIO['semantics']['in']['pieceOverrides'];
      bindings: readonly PatternImportDxfPhaseEForeignSavedAliasIdentityBindingV1[];
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      pieceOverrides: Readonly<Record<string, never>>;
      bindings: readonly [];
      blocker: PatternImportDxfPhaseEForeignSavedAliasIdentityBlockerV1;
    }>;

function blocker(
  code: PatternImportDxfPhaseEForeignSavedAliasIdentityBlockerCodeV1,
  detail: string,
  seed: number | null = null,
  sourceBlockIdentity: string | null = null,
  pieceLineKey: string | null = null,
): PatternImportDxfPhaseEForeignSavedAliasIdentityResultV1 {
  return Object.freeze({
    ok: false as const,
    pieceOverrides: Object.freeze({}),
    bindings: Object.freeze([]) as readonly [],
    blocker: Object.freeze({ code, detail, seed, sourceBlockIdentity, pieceLineKey }),
  });
}

function exactBoundedString(value: unknown, maxCodeUnits: number): value is string {
  if (typeof value !== 'string' || !value || value.length > maxCodeUnits || value.trim() !== value)
    return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f) return false;
  return true;
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Keeps an already structural source identity (case-normalised). Invalid vendor spellings get a
 * deterministic code-only identity: every source token is prefixed with X, so L/R/F/B/n/# can no
 * longer be misread as writer modifiers. The source spelling remains the display name.
 */
export function canonicalPatternImportDxfPhaseEForeignSavedWriterIdentityV1(
  sourceBlockIdentity: string,
): string | null {
  if (!exactBoundedString(sourceBlockIdentity, MAX_SOURCE_IDENTITY_CODE_UNITS)) return null;
  const upper = sourceBlockIdentity.toUpperCase();
  if (upper.length <= MAX_WRITER_IDENTITY_CODE_UNITS && identityGrammarProblem(upper) === null)
    return upper;

  const hash = fnv1a32(sourceBlockIdentity);
  const tokens = sourceBlockIdentity
    .normalize('NFKD')
    .match(/[A-Za-z0-9]+/g)
    ?.map((token) => `X${token.toUpperCase()}`) ?? ['XPIECE'];
  const fixed = `CAD__H${hash}`;
  const room = MAX_WRITER_IDENTITY_CODE_UNITS - fixed.length;
  const body = tokens.join('_').slice(0, room).replace(/_+$/g, '') || 'XPIECE';
  const identity = `CAD_${body}_H${hash}`;
  return identityGrammarProblem(identity) === null ? identity : null;
}

function familySourceIdentity(family: PatternImportDxfPhaseEForeignSavedAliasIdentityFamilyV1):
  | Readonly<{ ok: true; identity: string }>
  | Readonly<{
      ok: false;
      code: 'source-family-empty' | 'source-identity-missing' | 'source-identity-ambiguous';
      detail: string;
    }> {
  if (!family.candidates.length)
    return Object.freeze({
      ok: false as const,
      code: 'source-family-empty' as const,
      detail: `Seed ${family.seed} has no direct-DXF candidates.`,
    });
  const identities: string[] = [];
  for (const candidate of family.candidates) {
    const identity = candidate.dxf?.identity;
    if (!exactBoundedString(identity, MAX_SOURCE_IDENTITY_CODE_UNITS))
      return Object.freeze({
        ok: false as const,
        code: 'source-identity-missing' as const,
        detail: `Seed ${family.seed} has a candidate without one exact source block identity.`,
      });
    if (!identities.includes(identity)) identities.push(identity);
  }
  if (identities.length !== 1)
    return Object.freeze({
      ok: false as const,
      code: 'source-identity-ambiguous' as const,
      detail: `Seed ${family.seed} crosses ${identities.length} source block identities.`,
    });
  return Object.freeze({ ok: true as const, identity: identities[0] });
}

/**
 * Converts current-card, exact-scope aliases into the only naming overrides a foreign saved DXF
 * may use. No fuzzy name or geometry matching occurs here: every source family must own one block,
 * that block must own one alias in this scope, and that alias must own one current card piece.
 */
export function buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1(
  request: PatternImportDxfPhaseEForeignSavedAliasIdentityRequestV1,
): PatternImportDxfPhaseEForeignSavedAliasIdentityResultV1 {
  if (
    !request ||
    typeof request !== 'object' ||
    !exactBoundedString(request.scopeKey, MAX_STABLE_ID_CODE_UNITS) ||
    !Array.isArray(request.mappedSourceRanks) ||
    !request.mappedSourceRanks.length ||
    request.mappedSourceRanks.some((rank) => !Number.isSafeInteger(rank) || rank < 0) ||
    new Set(request.mappedSourceRanks).size !== request.mappedSourceRanks.length ||
    !Array.isArray(request.families) ||
    !request.families.length ||
    !Array.isArray(request.aliases) ||
    !Array.isArray(request.pieces)
  )
    return blocker(
      'invalid-input',
      'A scope, direct-DXF families, aliases and card pieces are required.',
    );

  const scopeAliases = request.aliases.filter(({ scopeKey }) => scopeKey === request.scopeKey);
  const mappedSourceRanks = new Set(request.mappedSourceRanks);
  const seenSeeds = new Set<number>();
  const seenSources = new Set<string>();
  const seenPieces = new Set<string>();
  const seenWriterIdentities = new Map<string, string>();
  const bindings: PatternImportDxfPhaseEForeignSavedAliasIdentityBindingV1[] = [];
  const pieceOverrides: StageIO['semantics']['in']['pieceOverrides'] = {};

  for (const family of request.families) {
    if (!Number.isSafeInteger(family.seed) || family.seed < 0)
      return blocker(
        'invalid-input',
        'Every direct-DXF family must have a non-negative integer seed.',
      );
    if (seenSeeds.has(family.seed))
      return blocker('seed-duplicate', `Seed ${family.seed} occurs more than once.`, family.seed);
    seenSeeds.add(family.seed);

    const source = familySourceIdentity(family);
    if (!source.ok) return blocker(source.code, source.detail, family.seed);
    const sourceBlockIdentity = source.identity;
    if (seenSources.has(sourceBlockIdentity))
      return blocker(
        'source-identity-duplicate',
        `Source block identity ${sourceBlockIdentity} belongs to more than one seed.`,
        family.seed,
        sourceBlockIdentity,
      );
    seenSources.add(sourceBlockIdentity);

    const sourceRanks: number[] = [];
    for (const candidate of family.candidates) {
      if (!Number.isSafeInteger(candidate.rank) || candidate.rank! < 0)
        return blocker(
          'source-rank-missing',
          `Source block identity ${sourceBlockIdentity} has a candidate without one exact source rank.`,
          family.seed,
          sourceBlockIdentity,
        );
      if (sourceRanks.includes(candidate.rank!))
        return blocker(
          'source-rank-duplicate',
          `Source block identity ${sourceBlockIdentity} has more than one candidate at rank ${candidate.rank}.`,
          family.seed,
          sourceBlockIdentity,
        );
      if (!mappedSourceRanks.has(candidate.rank!))
        return blocker(
          'source-rank-outside-size-run',
          `Source block identity ${sourceBlockIdentity} has rank ${candidate.rank} outside the mapped card size run.`,
          family.seed,
          sourceBlockIdentity,
        );
      sourceRanks.push(candidate.rank!);
    }
    if (sourceRanks.length !== 1 && sourceRanks.length !== mappedSourceRanks.size)
      return blocker(
        'source-rank-incomplete',
        `Source block identity ${sourceBlockIdentity} covers ${sourceRanks.length} of ${mappedSourceRanks.size} mapped ranks; only one explicitly ungraded rank or the complete size run is accepted.`,
        family.seed,
        sourceBlockIdentity,
      );

    const aliases = scopeAliases.filter(({ blockName }) => blockName === sourceBlockIdentity);
    if (!aliases.length)
      return blocker(
        'scope-alias-missing',
        `Source block identity ${sourceBlockIdentity} has no exact alias in scope ${request.scopeKey}.`,
        family.seed,
        sourceBlockIdentity,
      );
    if (aliases.length !== 1)
      return blocker(
        'scope-alias-ambiguous',
        `Source block identity ${sourceBlockIdentity} has ${aliases.length} aliases in scope ${request.scopeKey}.`,
        family.seed,
        sourceBlockIdentity,
      );
    const pieceLineKey = aliases[0].pieceLineKey;
    if (!exactBoundedString(pieceLineKey, MAX_STABLE_ID_CODE_UNITS))
      return blocker(
        'invalid-input',
        `Source block identity ${sourceBlockIdentity} has an invalid card piece line key.`,
        family.seed,
        sourceBlockIdentity,
      );
    const pieces = request.pieces.filter(({ lineKey }) => lineKey === pieceLineKey);
    if (!pieces.length)
      return blocker(
        'card-piece-missing',
        `Alias ${sourceBlockIdentity} points to a card piece that is not current.`,
        family.seed,
        sourceBlockIdentity,
        pieceLineKey,
      );
    if (pieces.length !== 1)
      return blocker(
        'card-piece-ambiguous',
        `Alias ${sourceBlockIdentity} points to ${pieces.length} current card pieces.`,
        family.seed,
        sourceBlockIdentity,
        pieceLineKey,
      );
    if (seenPieces.has(pieceLineKey))
      return blocker(
        'card-piece-binding-duplicate',
        `Card piece ${pieceLineKey} is claimed by more than one source block identity.`,
        family.seed,
        sourceBlockIdentity,
        pieceLineKey,
      );
    seenPieces.add(pieceLineKey);

    const writerIdentity =
      canonicalPatternImportDxfPhaseEForeignSavedWriterIdentityV1(sourceBlockIdentity);
    if (!writerIdentity)
      return blocker(
        'writer-identity-invalid',
        `Source block identity ${sourceBlockIdentity} has no safe deterministic writer identity.`,
        family.seed,
        sourceBlockIdentity,
        pieceLineKey,
      );
    const writerOwner = seenWriterIdentities.get(writerIdentity);
    if (writerOwner)
      return blocker(
        'writer-identity-duplicate',
        `Source block identities ${writerOwner} and ${sourceBlockIdentity} canonicalise to ${writerIdentity}.`,
        family.seed,
        sourceBlockIdentity,
        pieceLineKey,
      );
    seenWriterIdentities.set(writerIdentity, sourceBlockIdentity);

    const piece = pieces[0];
    pieceOverrides[family.seed] = {
      code: writerIdentity,
      mods: [],
      displayName: sourceBlockIdentity,
      nameOrigin: 'text',
      ...(sourceRanks.length === mappedSourceRanks.size ? { ungraded: false } : {}),
    };
    bindings.push(
      Object.freeze({
        seed: family.seed,
        sourceBlockIdentity,
        sourceDisplayName: sourceBlockIdentity,
        writerIdentity,
        pieceLineKey,
        pieceName: piece.name,
      }),
    );
  }

  return Object.freeze({
    ok: true as const,
    pieceOverrides: Object.freeze(pieceOverrides),
    bindings: Object.freeze(bindings),
    blocker: null,
  });
}
