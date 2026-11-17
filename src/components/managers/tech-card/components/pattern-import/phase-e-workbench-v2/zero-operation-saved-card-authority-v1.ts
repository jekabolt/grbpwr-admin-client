import {
  savedWorkbenchBindingScopeKeyV1,
  savedWorkbenchScopeKeyV1,
} from './saved-workbench-scope-v1';
import { adminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import { bindingScopes } from 'components/managers/tech-card/components/bom-purpose';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { CardContext } from '../client';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import type { PatternImportDxfPhaseESavedDxfAuthorityReadV1 } from './saved-dxf-reprocess-host-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1,
  type PatternImportDxfPhaseEZeroOperationSavedDxfAuthorityV1,
} from './zero-operation-saved-dxf-capability-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_CARD_AUTHORITY_V1 =
  'pattern-import-dxf-phase-e-zero-operation-saved-card-authority/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_CARD_AUTHORITY_CLAIMS_V1 =
  Object.freeze({
    getTechCardCurrentReadUsed: true,
    operationIndependent: true,
    selectedOperationRead: false,
    exactCardLockRequired: true,
    exactSavedRowRevisionRequired: true,
    exactScopeBindingRequired: true,
    exactLineKeyUrlSizeAndShaRequired: true,
    cachedProjectionUsedOnlyAsStableRowSelector: true,
    missingSizeRecoveredOnlyForSameRevisionUrlAndSha: true,
    serverDownloadUrlRequired: true,
    byteLengthAndShaVerifiedBySavedReprocessOwner: true,
    currentRowReadRepeatedAfterReprocess: true,
    freshPreparationFollowedByIndependentCurrentCardRead: true,
    positiveCardBootstrapUsesIndependentCurrentCardRead: true,
    ordinarySaveCardLockAdvanceRevalidated: true,
    ordinarySaveCardLockMustStrictlyAdvance: true,
    localFormProjectionAccepted: false,
    filenameOrDisplayNameUsedAsAuthority: false,
    productionReady: true,
  } as const);

type ReadTechCard = (techCardId: number) => Promise<common_TechCard>;

export type PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_CARD_AUTHORITY_V1;
  authority: PatternImportDxfPhaseEZeroOperationSavedDxfAuthorityV1;
  resolveCurrentRow: (
    selector: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<PatternImportDxfPhaseESavedDxfAuthorityReadV1>;
  /** Independently re-reads the card after a confirmed import save before saved preparation. */
  resolveLatestCommittedCard: (
    expected: Readonly<{ techCardId: number; previousLockVersion: number }>,
    signal: AbortSignal,
  ) => Promise<common_TechCard>;
  /** Independently reads a positive existing card before the Host may admit a fresh session. */
  resolveCurrentCard: (techCardId: number, signal: AbortSignal) => Promise<common_TechCard>;
  /** Re-reads the immutable DXF row after an ordinary save advances only the card lock. */
  resolveLatestCard: (
    selector: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<Readonly<{ techCard: common_TechCard; row: DxfProductSavedRowIdentityV1 }>>;
  resolveCard: (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ) => Promise<Readonly<{ card: CardContext; cardLockVersion: number }>>;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_CARD_AUTHORITY_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEZeroOperationSavedCardAuthorityDependenciesV1 = Readonly<{
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  readTechCard?: ReadTechCard;
}>;

function abortError(): DOMException {
  return new DOMException('Saved DXF authority read was cancelled.', 'AbortError');
}

function assertLive(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

function sameRow(left: DxfProductSavedRowIdentityV1, right: DxfProductSavedRowIdentityV1): boolean {
  return (
    left.techCardId === right.techCardId &&
    left.scopeKey === right.scopeKey &&
    left.patternLineKey === right.patternLineKey &&
    left.revision === right.revision &&
    left.cardLockVersion === right.cardLockVersion &&
    left.url === right.url &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256
  );
}

function validDownloadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 4_096) return false;
  for (let index = 0; index < value.length; index += 1)
    if (value.charCodeAt(index) <= 0x1f) return false;
  const lower = value.trimStart().toLowerCase();
  return !lower.startsWith('data:') && !lower.startsWith('javascript:');
}

function selectedCurrentRow(
  techCard: common_TechCard,
  selector: DxfProductSavedRowIdentityV1,
): Readonly<{ row: DxfProductSavedRowIdentityV1; downloadUrl: string }> {
  if (
    techCard.id !== selector.techCardId ||
    techCard.lockVersion !== selector.cardLockVersion ||
    !techCard.techCard
  )
    throw new Error('The current card id or optimistic lock moved from the saved DXF row.');

  const insert = techCard.techCard;
  const scopes = rollGoodsScopes(insert.bomItems ?? []);
  if (!scopes.some((scope) => savedWorkbenchScopeKeyV1(scope) === selector.scopeKey))
    throw new Error('The saved DXF material scope is absent from the current card.');
  const patterns = insert.patterns ?? [];
  const bindings = bindingScopes(scopes, patterns);
  const matches = patterns.filter(
    (pattern) =>
      pattern.lineKey?.trim() === selector.patternLineKey &&
      savedWorkbenchBindingScopeKeyV1(pattern.fabricPurpose, pattern.bomLineKey, bindings) ===
        selector.scopeKey,
  );
  if (matches.length !== 1)
    throw new Error('The current card has no unique exact saved DXF row for this scope and key.');
  const pattern = matches[0];
  const revision = pattern.savedRowRevision ?? 0;
  const url = pattern.url ?? '';
  const sha256 = pattern.sha256 ?? '';
  const currentSizeBytes = pattern.sizeBytes ?? 0;
  const sizeBytes =
    (!Number.isSafeInteger(currentSizeBytes) || currentSizeBytes <= 0) &&
    Number.isSafeInteger(selector.sizeBytes) &&
    selector.sizeBytes > 0 &&
    revision === selector.revision &&
    url === selector.url &&
    sha256 === selector.sha256
      ? selector.sizeBytes
      : currentSizeBytes;
  const current = Object.freeze({
    techCardId: techCard.id,
    scopeKey: selector.scopeKey,
    patternLineKey: pattern.lineKey!.trim(),
    revision,
    cardLockVersion: techCard.lockVersion,
    url,
    sizeBytes,
    sha256,
  });
  const invalidIdentityFields = [
    ...(!Number.isSafeInteger(current.revision) || current.revision <= 0 ? ['revision'] : []),
    ...(!validDownloadUrl(current.url) ? ['url'] : []),
    ...(!Number.isSafeInteger(current.sizeBytes) || current.sizeBytes <= 0 ? ['sizeBytes'] : []),
    ...(!/^[0-9a-f]{64}$/.test(current.sha256) ? ['sha256'] : []),
  ];
  if (invalidIdentityFields.length)
    throw new Error(
      `The current saved DXF row has no complete authoritative identity. Missing or invalid: ${invalidIdentityFields.join(', ')}.`,
    );
  if (!validDownloadUrl(pattern.downloadUrl))
    throw new Error('The current saved DXF row has no server download URL.');
  return Object.freeze({ row: current, downloadUrl: pattern.downloadUrl });
}

function exactCurrentRow(
  techCard: common_TechCard,
  expected: DxfProductSavedRowIdentityV1,
): Readonly<{ row: DxfProductSavedRowIdentityV1; downloadUrl: string }> {
  const current = selectedCurrentRow(techCard, expected);
  if (!sameRow(current.row, expected))
    throw new Error('The current saved DXF row identity moved before reconstruction completed.');
  return current;
}

/**
 * Operation-independent saved-DXF authority. Every call performs a new GetTechCard read; the
 * saved reprocess owner invokes it before and after reconstruction, verifies the downloaded byte
 * length and SHA-256 itself, and therefore fails closed on a concurrent card or row replacement.
 */
export function createPatternImportDxfPhaseEZeroOperationSavedCardAuthorityV1(
  dependencies: PatternImportDxfPhaseEZeroOperationSavedCardAuthorityDependenciesV1,
): PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 {
  const readTechCard: ReadTechCard =
    dependencies.readTechCard ??
    (async (techCardId) => {
      const response = await adminService.GetTechCard({
        id: techCardId,
        vatCountryCode: undefined,
      });
      if (!response.techCard) throw new Error('The current saved card is unavailable.');
      return response.techCard;
    });

  const readCurrent = async (
    expected: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ): Promise<
    Readonly<{ techCard: common_TechCard; row: DxfProductSavedRowIdentityV1; downloadUrl: string }>
  > => {
    assertLive(signal);
    const techCard = await readTechCard(expected.techCardId);
    assertLive(signal);
    const current = exactCurrentRow(techCard, expected);
    return Object.freeze({ techCard, ...current });
  };

  const readSelected = async (
    selector: DxfProductSavedRowIdentityV1,
    signal: AbortSignal,
  ): Promise<
    Readonly<{ techCard: common_TechCard; row: DxfProductSavedRowIdentityV1; downloadUrl: string }>
  > => {
    assertLive(signal);
    const techCard = await readTechCard(selector.techCardId);
    assertLive(signal);
    const current = selectedCurrentRow(techCard, selector);
    return Object.freeze({ techCard, ...current });
  };

  const authority = Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_DXF_AUTHORITY_V1,
    operationBinding: 'none' as const,
    async readAuthoritativeRow(
      expected: DxfProductSavedRowIdentityV1,
      signal: AbortSignal,
    ): Promise<PatternImportDxfPhaseESavedDxfAuthorityReadV1> {
      const current = await readCurrent(expected, signal);
      return Object.freeze({ row: current.row, downloadUrl: current.downloadUrl });
    },
  });

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_CARD_AUTHORITY_V1,
    authority,
    async resolveCurrentRow(selector, signal) {
      const current = await readSelected(selector, signal);
      return Object.freeze({ row: current.row, downloadUrl: current.downloadUrl });
    },
    async resolveLatestCommittedCard(expected, signal) {
      assertLive(signal);
      if (
        !Number.isSafeInteger(expected.techCardId) ||
        expected.techCardId <= 0 ||
        !Number.isSafeInteger(expected.previousLockVersion) ||
        expected.previousLockVersion < 0
      )
        throw new Error('A valid confirmed import card identity is required.');
      const techCard = await readTechCard(expected.techCardId);
      assertLive(signal);
      if (
        techCard.id !== expected.techCardId ||
        !Number.isSafeInteger(techCard.lockVersion) ||
        Number(techCard.lockVersion) <= expected.previousLockVersion
      )
        throw new Error('The confirmed import save did not strictly advance the card lock.');
      return techCard;
    },
    async resolveCurrentCard(techCardId, signal) {
      assertLive(signal);
      if (!Number.isSafeInteger(techCardId) || techCardId <= 0)
        throw new Error('A positive saved card id is required.');
      const techCard = await readTechCard(techCardId);
      assertLive(signal);
      if (
        techCard.id !== techCardId ||
        !Number.isSafeInteger(techCard.lockVersion) ||
        Number(techCard.lockVersion) < 0 ||
        !techCard.techCard
      )
        throw new Error('The independent current saved card read is invalid.');
      return techCard;
    },
    async resolveLatestCard(selector, signal) {
      assertLive(signal);
      const techCard = await readTechCard(selector.techCardId);
      assertLive(signal);
      if (
        !Number.isSafeInteger(techCard.lockVersion) ||
        Number(techCard.lockVersion) <= selector.cardLockVersion
      )
        throw new Error('The ordinary save did not strictly advance the card lock.');
      const current = selectedCurrentRow(techCard, {
        ...selector,
        cardLockVersion: techCard.lockVersion!,
      });
      if (
        current.row.techCardId !== selector.techCardId ||
        current.row.scopeKey !== selector.scopeKey ||
        current.row.patternLineKey !== selector.patternLineKey ||
        current.row.revision !== selector.revision ||
        current.row.url !== selector.url ||
        current.row.sizeBytes !== selector.sizeBytes ||
        current.row.sha256 !== selector.sha256
      )
        throw new Error('The saved DXF row changed while the ordinary card save advanced.');
      return Object.freeze({ techCard, row: current.row });
    },
    async resolveCard(expected, signal) {
      const current = await readCurrent(expected, signal);
      return Object.freeze({
        card: buildPatternImportDxfPhaseESavedCardContextV1(
          current.techCard,
          dependencies.orderSizeIds,
          dependencies.sizeNameById,
        ),
        cardLockVersion: current.techCard.lockVersion!,
      });
    },
    claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_OPERATION_SAVED_CARD_AUTHORITY_CLAIMS_V1,
  });
}
