import {
  bindingScopes,
  scopeKeyOfBinding,
} from 'components/managers/tech-card/components/bom-purpose';
import type {
  FabricScope,
  RollGoodsLine,
} from 'components/managers/tech-card/components/bom-purpose';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { PatternImportDxfPhaseESavedDxfAuthorityReadV1 } from './saved-dxf-reprocess-host-v1';
import type { PatternImportDxfPhaseESavedPatternRowV1 } from './saved-pattern-row-resolver-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_CAPABILITY_V1 =
  'pattern-import-dxf-phase-e-zero-operation-saved-dxf-capability/1' as const;
export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1 =
  'pattern-import-dxf-phase-e-zero-operation-saved-dxf-authority/1' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_REQUIREMENT_V1 = Object.freeze({
  schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1,
  operationBinding: 'none' as const,
  requiredResponseFields: Object.freeze(['row', 'downloadUrl'] as const),
  currentClosestRpc: 'GetTechCardSavedAssemblySnapshot' as const,
  currentClosestRpcRequires: Object.freeze(['selectedOperationNumber'] as const),
});

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_CAPABILITY_CLAIMS_V1 =
  Object.freeze({
    explicitMaterialScopeRequired: true,
    explicitSizeTokenRequired: true,
    currentBindingScopeResolutionReused: true,
    exactlyOneCurrentSavedPatternRowRequired: true,
    exactSavedRowEightFieldsResolved: true,
    savedRowRevisionUsedAsRevision: true,
    humanPatternVersionIgnored: true,
    selectedOperationRequired: false,
    selectedOperationAccepted: false,
    savedAssemblySnapshotAcceptedAsRowAuthority: false,
    getTechCardProjectionAcceptedAsRowAuthority: false,
    operationIndependentTransactionalRowReadRequired: true,
    currentGeneratedServerContractProvidesRequiredRead: false,
    authoritativeRowReadPerformed: false,
    savedDxfReprocessed: false,
    phaseDSelectionBuilt: false,
    authoringCatalogBuilt: false,
    assemblyProjectionBuilt: false,
    syntheticOperationCreated: false,
    syntheticAuthoringIdCreated: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseEZeroOperationSavedDxfAuthorityV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1;
  operationBinding: 'none';
  readAuthoritativeRow: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedDxfAuthorityReadV1>;
}>;

export type PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityRequestV1 = Readonly<{
  techCardId: number;
  cardLockVersion: number;
  patterns: readonly PatternImportDxfPhaseESavedPatternRowV1[];
  scopes: readonly FabricScope<RollGoodsLine>[];
  scopeKey: string;
  sizeToken: string;
  availableSizeTokens: readonly string[];
}>;

export type PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityBlockerCodeV1 =
  | 'invalid-card-identity'
  | 'invalid-material-scope'
  | 'material-scope-unavailable'
  | 'invalid-size-token'
  | 'size-token-unavailable'
  | 'pattern-row-missing'
  | 'pattern-row-ambiguous'
  | 'legacy-row-revision-missing'
  | 'pattern-row-identity-invalid'
  | 'operation-bound-authority-rejected'
  | 'operation-independent-authoritative-row-read-unavailable';

export type PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityBlockerV1 = Readonly<{
  code: PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityBlockerCodeV1;
  detail: string;
}>;

type Claims = typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_CAPABILITY_CLAIMS_V1;
type Requirement = typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_REQUIREMENT_V1;

export type PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityResultV1 =
  | Readonly<{
      ok: true;
      status: 'capability-ready';
      row: DxfProductSavedRowIdentityV1;
      scopeKey: string;
      sizeToken: string;
      authority: PatternImportDxfPhaseEZeroOperationSavedDxfAuthorityV1;
      blockers: readonly [];
      requirement: Requirement;
      claims: Claims;
    }>
  | Readonly<{
      ok: false;
      status: 'blocked';
      row: DxfProductSavedRowIdentityV1 | null;
      scopeKey: string | null;
      sizeToken: string | null;
      authority: null;
      blockers: readonly [PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityBlockerV1];
      requirement: Requirement;
      claims: Claims;
    }>;

function blocked(
  code: PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityBlockerCodeV1,
  detail: string,
  evidence: Readonly<{
    row?: DxfProductSavedRowIdentityV1;
    scopeKey?: string;
    sizeToken?: string;
  }> = {},
): PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityResultV1 {
  return Object.freeze({
    ok: false as const,
    status: 'blocked' as const,
    row: evidence.row ?? null,
    scopeKey: evidence.scopeKey ?? null,
    sizeToken: evidence.sizeToken ?? null,
    authority: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as readonly [
      PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityBlockerV1,
    ],
    requirement: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_REQUIREMENT_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_CAPABILITY_CLAIMS_V1,
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

function captureAuthority(
  candidate: unknown,
): PatternImportDxfPhaseEZeroOperationSavedDxfAuthorityV1 | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  try {
    const record = candidate as Record<string, unknown>;
    if (
      Object.keys(record).sort().join('\u0000') !==
        ['operationBinding', 'readAuthoritativeRow', 'schemaVersion'].sort().join('\u0000') ||
      record.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1 ||
      record.operationBinding !== 'none'
    )
      return null;
    const descriptor = Object.getOwnPropertyDescriptor(record, 'readAuthoritativeRow');
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      typeof descriptor.value !== 'function'
    )
      return null;
    const read =
      descriptor.value as PatternImportDxfPhaseEZeroOperationSavedDxfAuthorityV1['readAuthoritativeRow'];
    return Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1,
      operationBinding: 'none' as const,
      readAuthoritativeRow: (...args) => Reflect.apply(read, undefined, args),
    });
  } catch {
    return null;
  }
}

function operationBound(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  try {
    const record = candidate as Record<string, unknown>;
    return (
      record.operationBinding === 'selected-operation' ||
      Number.isSafeInteger(record.selectedOperationNumber)
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the one current saved DXF row named by an explicit material scope and size, then checks
 * whether an operation-independent transactional row-read capability exists. This intentionally
 * stops before saved-DXF reprocess: today's only generated authoritative row/download read is the
 * Assembly snapshot RPC, whose required selected operation would make a zero-operation canvas a
 * hidden synthetic-operation flow.
 */
export function resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1(
  request: PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityRequestV1,
  authorityCandidate: unknown = null,
): PatternImportDxfPhaseEZeroOperationSavedDxfCapabilityResultV1 {
  if (
    !Number.isSafeInteger(request.techCardId) ||
    request.techCardId <= 0 ||
    !Number.isSafeInteger(request.cardLockVersion) ||
    request.cardLockVersion < 0
  )
    return blocked(
      'invalid-card-identity',
      'A positive saved card id and non-negative server card lock are required.',
    );

  const scopeKey = request.scopeKey.trim();
  if (!scopeKey || scopeKey.length > 256 || !STABLE_ID.test(scopeKey))
    return blocked('invalid-material-scope', 'A stable explicit material scope key is required.');
  if (!request.scopes.some(({ key }) => key === scopeKey))
    return blocked(
      'material-scope-unavailable',
      'The explicit material scope is absent from the current saved card projection.',
      { scopeKey },
    );

  const sizeToken = request.sizeToken.trim();
  if (!sizeToken || sizeToken.length > 128)
    return blocked('invalid-size-token', 'A non-empty explicit size token is required.', {
      scopeKey,
    });
  const availableSizeTokens = new Set(
    request.availableSizeTokens.map((token) => token.trim()).filter(Boolean),
  );
  if (!availableSizeTokens.has(sizeToken))
    return blocked(
      'size-token-unavailable',
      'The explicit size token is absent from the current saved card size projection.',
      { scopeKey, sizeToken },
    );

  const patternBindings = bindingScopes(request.scopes, request.patterns);
  const candidates = request.patterns.filter(
    (pattern) =>
      scopeKeyOfBinding(pattern.fabricPurpose, pattern.bomLineKey, patternBindings) === scopeKey,
  );
  if (candidates.length === 0)
    return blocked(
      'pattern-row-missing',
      'The explicit material scope has no current saved pattern row.',
      { scopeKey, sizeToken },
    );
  if (candidates.length !== 1)
    return blocked(
      'pattern-row-ambiguous',
      'The explicit material scope has multiple current saved pattern rows; no file can be inferred.',
      { scopeKey, sizeToken },
    );

  const pattern = candidates[0];
  if (!Number.isSafeInteger(pattern.savedRowRevision) || Number(pattern.savedRowRevision) <= 0)
    return blocked(
      'legacy-row-revision-missing',
      'This legacy pattern row has no server-owned saved-row revision and cannot be reopened exactly.',
      { scopeKey, sizeToken },
    );
  const patternLineKey = pattern.lineKey?.trim() ?? '';
  const sizeBytes = positiveSafeInteger(pattern.sizeBytes);
  if (
    !patternLineKey ||
    patternLineKey.length > 256 ||
    !STABLE_ID.test(patternLineKey) ||
    !validUrl(pattern.url) ||
    sizeBytes == null ||
    typeof pattern.sha256 !== 'string' ||
    !SHA256.test(pattern.sha256)
  )
    return blocked(
      'pattern-row-identity-invalid',
      'The saved pattern row lacks an exact line key, URL, byte length or lowercase SHA-256.',
      { scopeKey, sizeToken },
    );

  const row = Object.freeze({
    techCardId: request.techCardId,
    scopeKey,
    patternLineKey,
    revision: pattern.savedRowRevision!,
    cardLockVersion: request.cardLockVersion,
    url: pattern.url,
    sizeBytes,
    sha256: pattern.sha256,
  });
  const authority = captureAuthority(authorityCandidate);
  if (!authority) {
    if (operationBound(authorityCandidate))
      return blocked(
        'operation-bound-authority-rejected',
        'An Assembly snapshot row read is bound to a selected operation and cannot prepare a standalone zero-operation canvas.',
        { row, scopeKey, sizeToken },
      );
    return blocked(
      'operation-independent-authoritative-row-read-unavailable',
      'The generated server contract exposes authoritative DXF row metadata and download URL only through GetTechCardSavedAssemblySnapshot, whose request requires selectedOperationNumber.',
      { row, scopeKey, sizeToken },
    );
  }

  return Object.freeze({
    ok: true as const,
    status: 'capability-ready' as const,
    row,
    scopeKey,
    sizeToken,
    authority,
    blockers: Object.freeze([]) as readonly [],
    requirement: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_REQUIREMENT_V1,
    claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_CAPABILITY_CLAIMS_V1,
  });
}
