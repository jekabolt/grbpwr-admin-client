import { savedWorkbenchScopeKeyV1 } from './saved-workbench-scope-v1';
import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import {
  pieceBlockRefs,
  pieceRefKey,
  rollGoodsScopes,
  type PieceAliasRow,
} from 'components/managers/tech-card/components/piece-block-refs';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_PATTERN_ROW_RESOLVER_V1 =
  'pattern-import-dxf-phase-e-saved-pattern-row-resolver/1' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type PatternImportDxfPhaseESavedPatternRowV1 = Readonly<{
  lineKey?: string;
  fabricPurpose?: string;
  bomLineKey?: string;
  url?: string;
  sizeBytes?: number | string;
  sha256?: string;
  /** Server-owned ABA clock. This is the only value mapped to saved identity `revision`. */
  savedRowRevision?: number;
  /** Human-facing pattern version. Deliberately ignored by this resolver. */
  version?: number;
}>;

export type PatternImportDxfPhaseESavedPatternRowResolverRequestV1 = Readonly<{
  techCardId: number;
  cardLockVersion: number;
  patterns: readonly PatternImportDxfPhaseESavedPatternRowV1[];
  aliases: readonly PieceAliasRow[];
  scopes: ReturnType<typeof rollGoodsScopes>;
  pieceLineKeys: readonly [string, string];
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_SAVED_PATTERN_ROW_RESOLVER_CLAIMS_V1 = Object.freeze({
  exactTwoPiecePairRequired: true,
  currentBindingScopeResolutionReused: true,
  exactlyOneSharedAliasScopeRequired: true,
  exactlyOnePatternRowRequired: true,
  exactEightFieldIdentityProduced: true,
  savedRowRevisionUsedAsRevision: true,
  humanPatternVersionIgnored: true,
  legacyMissingSavedRowRevisionAccepted: false,
  filenameOrDisplayNameUsedAsAuthority: false,
  nearestOrFallbackScopeUsed: false,
  uiIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPhaseESavedPatternRowResolverBlockerCodeV1 =
  | 'invalid-card-identity'
  | 'invalid-piece-pair'
  | 'piece-alias-missing'
  | 'piece-scope-ambiguous'
  | 'pattern-row-missing'
  | 'pattern-row-ambiguous'
  | 'legacy-row-revision-missing'
  | 'pattern-row-identity-invalid';

export type PatternImportDxfPhaseESavedPatternRowResolverResultV1 =
  | Readonly<{
      ok: true;
      row: DxfProductSavedRowIdentityV1;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_PATTERN_ROW_RESOLVER_CLAIMS_V1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      row: null;
      claims: typeof PATTERN_IMPORT_DXF_PHASE_E_SAVED_PATTERN_ROW_RESOLVER_CLAIMS_V1;
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseESavedPatternRowResolverBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

function blocked(
  code: PatternImportDxfPhaseESavedPatternRowResolverBlockerCodeV1,
  detail: string,
): PatternImportDxfPhaseESavedPatternRowResolverResultV1 {
  return Object.freeze({
    ok: false as const,
    row: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_PATTERN_ROW_RESOLVER_CLAIMS_V1,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      Readonly<{
        code: PatternImportDxfPhaseESavedPatternRowResolverBlockerCodeV1;
        detail: string;
      }>,
    ],
  });
}

function positiveSafeInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f) return false;
  const lower = value.trimStart().toLowerCase();
  return !lower.startsWith('data:') && !lower.startsWith('javascript:');
}

/**
 * Resolves one already-saved DXF row from the same scope rule used by the card's pattern and alias
 * readers. No row is guessed when the two pieces share several scopes or a scope has several files.
 */
export function resolvePatternImportDxfPhaseESavedPatternRowV1(
  request: PatternImportDxfPhaseESavedPatternRowResolverRequestV1,
): PatternImportDxfPhaseESavedPatternRowResolverResultV1 {
  if (
    !Number.isSafeInteger(request.techCardId) ||
    request.techCardId <= 0 ||
    !Number.isSafeInteger(request.cardLockVersion) ||
    request.cardLockVersion < 0
  )
    return blocked(
      'invalid-card-identity',
      'A positive card id and non-negative server card lock are required.',
    );

  const pair = request.pieceLineKeys.map((value) => value.trim()) as [string, string];
  if (
    pair.some((value) => !value || value.length > 256 || !STABLE_ID.test(value)) ||
    pieceRefKey(pair[0]) === pieceRefKey(pair[1])
  )
    return blocked(
      'invalid-piece-pair',
      'Saved Assembly must identify two distinct stable piece line keys.',
    );

  const references = pieceBlockRefs(request.aliases, request.scopes);
  const left = references.get(pieceRefKey(pair[0])) ?? [];
  const right = references.get(pieceRefKey(pair[1])) ?? [];
  if (!left.length || !right.length)
    return blocked(
      'piece-alias-missing',
      'Both selected pieces must have current saved DXF aliases.',
    );
  const rightScopes = new Set(right.map(({ scopeKey }) => scopeKey).filter(Boolean));
  const sharedScopes = [
    ...new Set(left.map(({ scopeKey }) => scopeKey).filter((key) => rightScopes.has(key))),
  ];
  if (sharedScopes.length !== 1)
    return blocked(
      'piece-scope-ambiguous',
      sharedScopes.length
        ? 'The selected pieces share more than one saved DXF scope.'
        : 'The selected pieces do not share one current saved DXF scope.',
    );
  const scopeKey = sharedScopes[0];

  const patternBindings = bindingScopes(request.scopes, request.patterns);
  const candidates = request.patterns.filter(
    (pattern) =>
      scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, patternBindings) === scopeKey,
  );
  if (candidates.length === 0)
    return blocked(
      'pattern-row-missing',
      'The shared piece scope has no current saved pattern row.',
    );
  if (candidates.length !== 1)
    return blocked(
      'pattern-row-ambiguous',
      'The shared piece scope has multiple saved pattern rows; no file can be inferred.',
    );
  const pattern = candidates[0];
  const savedRowRevision = pattern.savedRowRevision;
  if (!Number.isSafeInteger(savedRowRevision) || Number(savedRowRevision) <= 0)
    return blocked(
      'legacy-row-revision-missing',
      'This legacy pattern row has no server-owned saved-row revision and cannot be reopened exactly.',
    );
  const lineKey = pattern.lineKey?.trim() ?? '';
  const sizeBytes = positiveSafeInteger(pattern.sizeBytes);
  if (
    !lineKey ||
    lineKey.length > 256 ||
    !STABLE_ID.test(lineKey) ||
    !validUrl(pattern.url) ||
    sizeBytes == null ||
    typeof pattern.sha256 !== 'string' ||
    !SHA256.test(pattern.sha256)
  )
    return blocked(
      'pattern-row-identity-invalid',
      'The saved pattern row lacks an exact line key, URL, byte length or lowercase SHA-256.',
    );

  return Object.freeze({
    ok: true as const,
    row: Object.freeze({
      techCardId: request.techCardId,
      scopeKey: savedWorkbenchScopeKeyV1(request.scopes.find((scope) => scope.key === scopeKey)!),
      patternLineKey: lineKey,
      revision: savedRowRevision!,
      cardLockVersion: request.cardLockVersion,
      url: pattern.url,
      sizeBytes,
      sha256: pattern.sha256,
    }),
    claims: PATTERN_IMPORT_DXF_PHASE_E_SAVED_PATTERN_ROW_RESOLVER_CLAIMS_V1,
    blockers: Object.freeze([]) as readonly [],
  });
}
