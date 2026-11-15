import {
  PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1,
  buildPatternImportDxfProductMappingCompositionV1,
  type PatternImportDxfProductExpectedSavedRowV1,
  type PatternImportDxfProductMappingCompositionInputV1,
  type PatternImportDxfProductMappingCompositionResultV1,
} from './pattern-import-dxf-product-mapping-composition-v1';
import {
  verifyPatternImportDxfPostSaveCardV1,
  type PatternImportDxfGetTechCardReaderV1,
  type PatternImportDxfPostSaveCardObservationV1,
} from './pattern-import-dxf-post-save-readback-audit-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1 =
  'pattern-import-dxf-product-post-save-readback/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_RECEIPT_V1 =
  'pattern-import-dxf-product-post-save-readback-receipt/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_SEAL_V1 =
  'pattern-import-dxf-product-post-save-readback-seal/1' as const;

export type PatternImportDxfProductPostSaveReadbackInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1;
  /** Always fresh-rerun; detached mapping/writer receipts are never accepted. */
  compositionInput: PatternImportDxfProductMappingCompositionInputV1;
  /** Comparison only. The fresh composition result remains the authority for this owner. */
  expectedCompositionSealSha256: string;
  /** Exact saved-row revision that the operator confirmed in the Phase-E workbench. */
  expectedSavedRow?: PatternImportDxfProductExpectedSavedRowV1;
}>;

export type PatternImportDxfProductPostSaveReadbackReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_RECEIPT_V1;
  product: Readonly<{
    scopeKey: string;
    exportSha256: string;
    phaseEPlanSha256: string;
    sizeSelectionSha256: string;
    mappingSha256: string;
    mappingCompositionSha256: string;
  }>;
  card: Readonly<{
    techCardId: number;
    previousLockVersion: number;
    observedLockVersion: number;
  }>;
  pattern: PatternImportDxfPostSaveCardObservationV1['pattern'];
  pieceLineKeys: readonly string[];
  aliases: PatternImportDxfPostSaveCardObservationV1['aliases'];
}>;

export type PatternImportDxfProductPostSaveReadbackSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  authority: 'unsigned-product-host-readback-consistency-only';
  trustedAuthorityIntegrated: false;
  productionReady: false;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_CLAIMS_V1 = Object.freeze({
  freshProductMappingCompositionRebuilt: true,
  callerSuppliedReadbackSnapshotAccepted: false,
  getTechCardReaderInvoked: true,
  lockVersionAdvanced: true,
  exactExpectedSavedRowMatchedWhenProvided: true,
  exactPatternIdentityObserved: true,
  exactProductWriterShaObserved: true,
  exactPieceAndAliasBindingsObserved: true,
  mappingBoundToPersistedProductRow: true,
  g4f4SidecarOwnerBuilt: false,
  sidecarPersisted: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  freshProductMappingCompositionRebuilt: false as const,
  callerSuppliedReadbackSnapshotAccepted: false as const,
  getTechCardReaderInvoked: false as const,
  lockVersionAdvanced: false as const,
  exactExpectedSavedRowMatchedWhenProvided: false as const,
  exactPatternIdentityObserved: false as const,
  exactProductWriterShaObserved: false as const,
  exactPieceAndAliasBindingsObserved: false as const,
  mappingBoundToPersistedProductRow: false as const,
  g4f4SidecarOwnerBuilt: false as const,
  sidecarPersisted: false as const,
  trustedAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export type PatternImportDxfProductPostSaveReadbackBlockerV1 = Readonly<{
  code:
    | 'reentrant-call'
    | 'invalid-input'
    | 'mapping-composition-blocked'
    | 'mapping-composition-seal-mismatch'
    | 'post-save-readback-blocked'
    | 'sha256-unavailable';
  detail: string;
}>;

export type PatternImportDxfProductPostSaveReadbackResultV1 =
  | Readonly<{
      ok: true;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1;
      receipt: PatternImportDxfProductPostSaveReadbackReceiptV1;
      seal: PatternImportDxfProductPostSaveReadbackSealV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1;
      receipt: null;
      seal: null;
      blockers: readonly [PatternImportDxfProductPostSaveReadbackBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

const SHA256 = /^[0-9a-f]{64}$/;
const MAX_CANONICAL_BYTES = 2 * 1024 * 1024;
const textEncoder = new TextEncoder();

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function blocked(
  code: PatternImportDxfProductPostSaveReadbackBlockerV1['code'],
  detail: string,
): PatternImportDxfProductPostSaveReadbackResultV1 {
  return deepFreeze({
    ok: false as const,
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1,
    receipt: null,
    seal: null,
    blockers: [{ code, detail }] as const,
    claims: BLOCKED_CLAIMS,
  });
}

async function sealReceipt(
  receipt: PatternImportDxfProductPostSaveReadbackReceiptV1,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const bytes = textEncoder.encode(
      `pattern-import-dxf-product-post-save-readback-v1\0${canonical(receipt)}`,
    );
    if (bytes.byteLength > MAX_CANONICAL_BYTES) return null;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

let claimed = false;

/** Fresh product G4F3 boundary: rerun mapping+writer composition, then invoke host GetTechCard. */
export async function readBackPatternImportDxfProductMappingV1(
  input: PatternImportDxfProductPostSaveReadbackInputV1,
  getTechCard: PatternImportDxfGetTechCardReaderV1,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductPostSaveReadbackResultV1> {
  if (claimed) return blocked('reentrant-call', 'Reentrant product readback was refused.');
  claimed = true;
  try {
    if (
      !input ||
      input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1 ||
      !input.compositionInput ||
      !SHA256.test(input.expectedCompositionSealSha256) ||
      typeof getTechCard !== 'function'
    )
      return blocked('invalid-input', 'Exact V1 composition, seal and GetTechCard are required.');

    const composition: PatternImportDxfProductMappingCompositionResultV1 =
      await buildPatternImportDxfProductMappingCompositionV1(input.compositionInput, crypto);
    if (!composition.ok)
      return blocked(
        'mapping-composition-blocked',
        composition.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (
      composition.compositionSeal.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1 ||
      composition.compositionSeal.canonicalSha256 !== input.expectedCompositionSealSha256
    )
      return blocked(
        'mapping-composition-seal-mismatch',
        'Expected seal does not equal the fresh product mapping composition.',
      );

    const evidence = composition.evidence;
    const verified = await verifyPatternImportDxfPostSaveCardV1(
      {
        techCardId: input.compositionInput.draft.techCardId,
        previousLockVersion: evidence.previousLockVersion,
        pattern: {
          lineKey: evidence.patternLineKey,
          url: evidence.patternUrl,
          scopeKey: evidence.scopeKey,
          sizeId: evidence.patternSizeId,
        },
        pieceLineKeys: evidence.pieceLineKeys,
        aliases: evidence.aliases,
      },
      evidence.productExportSha256,
      getTechCard,
    );
    if (!verified.ok)
      return blocked(
        'post-save-readback-blocked',
        verified.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );

    const expectedSavedRow = input.expectedSavedRow;
    if (
      expectedSavedRow &&
      (expectedSavedRow.techCardId !== input.compositionInput.draft.techCardId ||
        expectedSavedRow.scopeKey !== evidence.scopeKey ||
        expectedSavedRow.patternLineKey !== verified.observation.pattern.lineKey ||
        expectedSavedRow.dxfSha256 !== verified.observation.pattern.sha256 ||
        expectedSavedRow.patternVersion !== verified.observation.pattern.version ||
        expectedSavedRow.cardLockVersion !== verified.observation.lockVersion)
    )
      return blocked(
        'post-save-readback-blocked',
        'Fresh saved-card readback no longer exact-matches the row revision confirmed by the Phase-E workbench.',
      );

    const receipt: PatternImportDxfProductPostSaveReadbackReceiptV1 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_RECEIPT_V1,
      product: {
        scopeKey: evidence.scopeKey,
        exportSha256: evidence.productExportSha256,
        phaseEPlanSha256: evidence.phaseEPlanSha256,
        sizeSelectionSha256: evidence.sizeSelectionSha256,
        mappingSha256: composition.mappingSeal.canonicalSha256,
        mappingCompositionSha256: composition.compositionSeal.canonicalSha256,
      },
      card: {
        techCardId: input.compositionInput.draft.techCardId,
        previousLockVersion: evidence.previousLockVersion,
        observedLockVersion: verified.observation.lockVersion,
      },
      pattern: verified.observation.pattern,
      pieceLineKeys: verified.observation.pieceLineKeys,
      aliases: verified.observation.aliases,
    });
    const canonicalSha256 = await sealReceipt(receipt, crypto);
    if (!canonicalSha256)
      return blocked('sha256-unavailable', 'Product readback receipt SHA-256 is unavailable.');
    return deepFreeze({
      ok: true as const,
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1,
      receipt,
      seal: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_SEAL_V1,
        algorithm: 'SHA-256' as const,
        canonicalSha256,
        authority: 'unsigned-product-host-readback-consistency-only' as const,
        trustedAuthorityIntegrated: false as const,
        productionReady: false as const,
      },
      blockers: [] as const,
      claims: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_CLAIMS_V1,
    });
  } catch {
    return blocked('invalid-input', 'Product readback input was inaccessible or non-canonical.');
  } finally {
    claimed = false;
  }
}
