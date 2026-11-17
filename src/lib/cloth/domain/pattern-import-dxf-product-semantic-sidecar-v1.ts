import {
  PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1,
  buildPatternImportDxfProductMappingCompositionV1,
  type PatternImportDxfProductMappingCompositionInputV1,
} from './pattern-import-dxf-product-mapping-composition-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_RECEIPT_V1,
  PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_SEAL_V1,
  PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1,
  readBackPatternImportDxfProductMappingV1,
  type PatternImportDxfProductPostSaveReadbackInputV1,
  type PatternImportDxfProductPostSaveReadbackReceiptV1,
} from './pattern-import-dxf-product-post-save-readback-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1,
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_FORMAT_V1,
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_ID_V1,
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_RECEIPT_V1,
} from './pattern-import-dxf-product-writer-replay-v1';
import type { PatternImportDxfGetTechCardReaderV1 } from './pattern-import-dxf-post-save-readback-audit-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  type PatternImportDxfTwoSidedSeamMappingV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';

export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_REQUEST_V1 =
  'pattern-import-dxf-product-semantic-sidecar-request/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1 =
  'pattern-import-dxf-product-semantic-sidecar-document/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_SEAL_V1 =
  'pattern-import-dxf-product-semantic-sidecar-seal/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_OWNER_V1 =
  'pattern-import-dxf-product-semantic-sidecar-owner/1' as const;
export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 =
  'application/vnd.grbpwr.pattern-dxf-product-semantics.v1+json' as const;

export type PatternImportDxfProductSemanticSidecarRequestV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_REQUEST_V1;
  /** Fresh-rerun by G4F4. Detached readback, mapping, and composition artifacts are forbidden. */
  postSaveReadbackInput: PatternImportDxfProductPostSaveReadbackInputV1;
  expected: Readonly<{
    postSaveReadbackSealSha256: string;
    mappingCompositionSealSha256: string;
    mappingSealSha256: string;
  }>;
}>;

export type PatternImportDxfProductSemanticSidecarDocumentV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1;
  mediaType: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1;
  encoding: 'canonical-json-utf8';
  product: Readonly<{
    writerReceiptVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_RECEIPT_V1;
    writerId: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_ID_V1;
    writerDialect: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1;
    format: typeof PATTERN_IMPORT_DXF_PRODUCT_WRITER_FORMAT_V1;
    scopeKey: string;
    exportSha256: string;
    byteLength: number;
    phaseEPlanSha256: string;
    sizeSelectionSha256: string;
    mappingCompositionSealSha256: string;
  }>;
  mapping: Readonly<{
    version: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
    sealSha256: string;
    artifact: PatternImportDxfTwoSidedSeamMappingV2;
  }>;
  persistence: Readonly<{
    receiptVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_RECEIPT_V1;
    receiptSealVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_SEAL_V1;
    receiptSealSha256: string;
    card: PatternImportDxfProductPostSaveReadbackReceiptV1['card'];
    pattern: PatternImportDxfProductPostSaveReadbackReceiptV1['pattern'];
    pieceLineKeys: PatternImportDxfProductPostSaveReadbackReceiptV1['pieceLineKeys'];
    aliases: PatternImportDxfProductPostSaveReadbackReceiptV1['aliases'];
  }>;
}>;

export type PatternImportDxfProductSemanticSidecarSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  canonicalByteLength: number;
  authority: 'unsigned-product-deterministic-sidecar-bytes-only';
  trustedAuthorityIntegrated: false;
  productionReady: false;
}>;

export type PatternImportDxfProductSemanticSidecarOwnerV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_OWNER_V1;
  document: PatternImportDxfProductSemanticSidecarDocumentV1;
  seal: PatternImportDxfProductSemanticSidecarSealV1;
}>;

export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_CLAIMS_V1 = Object.freeze({
  freshProductG4f3ReadbackRebuilt: true,
  freshProductG4f1CompositionRebuiltAgain: true,
  callerSuppliedReadbackReceiptAccepted: false,
  callerSuppliedMappingAccepted: false,
  callerSuppliedProductDxfBytesAccepted: false,
  completeProductWriterShaBound: true,
  exactPersistedPatternBound: true,
  mappingSemanticallyEncodedInSidecar: true,
  mappingSemanticallyEncodedInDxf: false,
  sidecarBytesAvailableFromOpaqueOwner: true,
  sidecarPersisted: false,
  dxfAndSidecarAtomicStorageAccepted: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  freshProductG4f3ReadbackRebuilt: false as const,
  freshProductG4f1CompositionRebuiltAgain: false as const,
  callerSuppliedReadbackReceiptAccepted: false as const,
  callerSuppliedMappingAccepted: false as const,
  callerSuppliedProductDxfBytesAccepted: false as const,
  completeProductWriterShaBound: false as const,
  exactPersistedPatternBound: false as const,
  mappingSemanticallyEncodedInSidecar: false as const,
  mappingSemanticallyEncodedInDxf: false as const,
  sidecarBytesAvailableFromOpaqueOwner: false as const,
  sidecarPersisted: false as const,
  dxfAndSidecarAtomicStorageAccepted: false as const,
  trustedAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export const PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_CONTRACT_V1 = Object.freeze({
  postSaveAuthority: 'fresh internal product G4F3 rerun with host GetTechCard capability',
  mappingAuthority: 'second fresh internal product G4F1 composition rerun',
  encoding: 'canonical JSON UTF-8 with exact product media type',
  detachedReceiptOrMappingAccepted: false,
  decodedOrForgedOwnerAccepted: false,
  rawDxfBytesAcceptedOrExposed: false,
  sidecarPersisted: false,
  dxfAndSidecarAtomicStorageAccepted: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfProductSemanticSidecarBlockerCodeV1 =
  | 'reentrant-call'
  | 'invalid-input'
  | 'product-g4f3-blocked'
  | 'post-save-seal-mismatch'
  | 'product-g4f1-blocked'
  | 'composition-seal-mismatch'
  | 'mapping-seal-mismatch'
  | 'binding-mismatch'
  | 'sha256-unavailable'
  | 'bounds-exceeded';

export type PatternImportDxfProductSemanticSidecarBlockerV1 = Readonly<{
  code: PatternImportDxfProductSemanticSidecarBlockerCodeV1;
  field: string;
  detail: string;
}>;

export type PatternImportDxfProductSemanticSidecarResultV1 =
  | Readonly<{
      ok: true;
      owner: PatternImportDxfProductSemanticSidecarOwnerV1;
      document: PatternImportDxfProductSemanticSidecarDocumentV1;
      seal: PatternImportDxfProductSemanticSidecarSealV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      seal: null;
      blockers: readonly [PatternImportDxfProductSemanticSidecarBlockerV1];
      claims: typeof BLOCKED_CLAIMS;
    }>;

export type EncodePatternImportDxfProductSemanticSidecarResultV1 =
  | Readonly<{
      ok: true;
      bytes: Uint8Array<ArrayBuffer>;
      canonicalSha256: string;
      canonicalByteLength: number;
    }>
  | Readonly<{ ok: false; code: 'invalid-owner'; bytes: null }>;

const SHA256 = /^[0-9a-f]{64}$/;
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const MAX_CANONICAL_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCT_DXF_BYTES = 40 * 1024 * 1024;
const MAX_DETAIL_BYTES = 1_024;
const textEncoder = new TextEncoder();

class ProductSidecarFailure extends Error {
  constructor(
    readonly code: PatternImportDxfProductSemanticSidecarBlockerCodeV1,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

type OwnerState = Readonly<{ canonicalBytes: Uint8Array<ArrayBuffer> }>;
const ownerStates = new WeakMap<object, OwnerState>();

function fail(
  code: PatternImportDxfProductSemanticSidecarBlockerCodeV1,
  field: string,
  message: string,
): never {
  throw new ProductSidecarFailure(code, field, message);
}

function bounded(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || seen.has(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(error: unknown): PatternImportDxfProductSemanticSidecarResultV1 {
  const known = error instanceof ProductSidecarFailure;
  return deepFreeze({
    ok: false as const,
    owner: null,
    document: null,
    seal: null,
    blockers: [
      {
        code: known ? error.code : ('invalid-input' as const),
        field: bounded(known ? error.field : 'input'),
        detail: bounded(
          known
            ? error.message
            : 'Product semantic-sidecar build rejected inaccessible or inconsistent input.',
        ),
      },
    ] as const,
    claims: BLOCKED_CLAIMS,
  });
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('invalid-input', field, 'must be an exact plain data record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(descriptors);
  } catch {
    fail('invalid-input', field, 'reflection failed.');
  }
  if (
    prototype !== Object.prototype ||
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
  )
    fail('invalid-input', field, 'contains missing, hidden, symbol, or unexpected fields.');
  const output: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('invalid-input', `${field}.${key}`, 'must be an enumerable data property.');
    output[key] = descriptor.value;
  }
  return output;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

async function digest(
  crypto: Pick<Crypto, 'subtle'>,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  let result: ArrayBuffer;
  try {
    result = await crypto.subtle.digest('SHA-256', bytes);
  } catch {
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 digest rejected.');
  }
  const view = new Uint8Array(result);
  if (view.byteLength !== 32)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 returned an invalid digest.');
  return Array.from(view, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function checkedCrypto(
  candidate: Pick<Crypto, 'subtle'> | undefined,
): Promise<Pick<Crypto, 'subtle'>> {
  if (!candidate?.subtle || typeof candidate.subtle.digest !== 'function')
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 implementation is unavailable.');
  if ((await digest(candidate, textEncoder.encode('abc'))) !== SHA256_ABC)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 known-answer test failed.');
  return candidate;
}

function sameCanonicalMembership(left: readonly unknown[], right: readonly unknown[]): boolean {
  try {
    // G4F3 canonically orders the unordered piece and alias membership records.
    return canonical(left.map(canonical).sort()) === canonical(right.map(canonical).sort());
  } catch {
    return false;
  }
}

let claimed = false;

/**
 * Product G4F4 owner. It first reruns G4F3 (which itself reruns the product writer/mapping
 * composition), then reruns that composition independently and binds both results into opaque
 * canonical sidecar bytes. It neither accepts nor returns raw DXF bytes.
 */
export async function buildPatternImportDxfProductSemanticSidecarV1(
  inputValue: unknown,
  getTechCard: PatternImportDxfGetTechCardReaderV1,
  cryptoCandidate: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductSemanticSidecarResultV1> {
  if (claimed)
    return blocked(
      new ProductSidecarFailure('reentrant-call', 'input', 'reentrant sidecar build refused.'),
    );
  claimed = true;
  try {
    const input = exactRecord(
      inputValue,
      ['schemaVersion', 'postSaveReadbackInput', 'expected'],
      'input',
    );
    if (input.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_REQUEST_V1)
      fail('invalid-input', 'input.schemaVersion', 'schema version is unsupported.');
    if (typeof getTechCard !== 'function')
      fail('invalid-input', 'getTechCard', 'host GetTechCard reader is required.');
    const expected = exactRecord(
      input.expected,
      ['postSaveReadbackSealSha256', 'mappingCompositionSealSha256', 'mappingSealSha256'],
      'input.expected',
    );
    for (const key of [
      'postSaveReadbackSealSha256',
      'mappingCompositionSealSha256',
      'mappingSealSha256',
    ] as const) {
      if (typeof expected[key] !== 'string' || !SHA256.test(expected[key]))
        fail('invalid-input', `input.expected.${key}`, 'must be lowercase SHA-256.');
    }
    const postSaveInput = exactRecord(
      input.postSaveReadbackInput,
      ['schemaVersion', 'compositionInput', 'expectedCompositionSealSha256'],
      'input.postSaveReadbackInput',
    );
    if (
      postSaveInput.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1 ||
      typeof postSaveInput.expectedCompositionSealSha256 !== 'string' ||
      !SHA256.test(postSaveInput.expectedCompositionSealSha256)
    )
      fail('invalid-input', 'input.postSaveReadbackInput', 'exact product G4F3 input is required.');
    const cleanPostSaveInput: PatternImportDxfProductPostSaveReadbackInputV1 = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_POST_SAVE_READBACK_V1,
      compositionInput:
        postSaveInput.compositionInput as PatternImportDxfProductMappingCompositionInputV1,
      expectedCompositionSealSha256: postSaveInput.expectedCompositionSealSha256,
    };
    const crypto = await checkedCrypto(cryptoCandidate);

    const postSave = await readBackPatternImportDxfProductMappingV1(
      cleanPostSaveInput,
      getTechCard,
      crypto,
    );
    if (!postSave.ok)
      fail(
        'product-g4f3-blocked',
        'input.postSaveReadbackInput',
        postSave.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (postSave.seal.canonicalSha256 !== expected.postSaveReadbackSealSha256)
      fail(
        'post-save-seal-mismatch',
        'input.expected.postSaveReadbackSealSha256',
        'expected seal does not equal the fresh product G4F3 receipt seal.',
      );

    const composition = await buildPatternImportDxfProductMappingCompositionV1(
      cleanPostSaveInput.compositionInput,
      crypto,
    );
    if (!composition.ok)
      fail(
        'product-g4f1-blocked',
        'input.postSaveReadbackInput.compositionInput',
        composition.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (
      composition.compositionSeal.schemaVersion !==
        PATTERN_IMPORT_DXF_PRODUCT_MAPPING_COMPOSITION_SEAL_V1 ||
      composition.compositionSeal.canonicalSha256 !== expected.mappingCompositionSealSha256 ||
      postSave.receipt.product.mappingCompositionSha256 !== expected.mappingCompositionSealSha256 ||
      cleanPostSaveInput.expectedCompositionSealSha256 !== expected.mappingCompositionSealSha256
    )
      fail(
        'composition-seal-mismatch',
        'input.expected.mappingCompositionSealSha256',
        'expected, G4F3-bound, and fresh product composition seals differ.',
      );
    if (
      composition.mappingSeal.canonicalSha256 !== expected.mappingSealSha256 ||
      postSave.receipt.product.mappingSha256 !== expected.mappingSealSha256
    )
      fail(
        'mapping-seal-mismatch',
        'input.expected.mappingSealSha256',
        'expected, G4F3-bound, and fresh product mapping seals differ.',
      );

    const evidence = composition.evidence;
    const receipt = postSave.receipt;
    if (
      receipt.product.scopeKey !== evidence.scopeKey ||
      receipt.product.exportSha256 !== evidence.productExportSha256 ||
      receipt.product.phaseEPlanSha256 !== evidence.phaseEPlanSha256 ||
      receipt.product.sizeSelectionSha256 !== evidence.sizeSelectionSha256 ||
      receipt.card.techCardId !== cleanPostSaveInput.compositionInput.draft.techCardId ||
      receipt.card.previousLockVersion !== evidence.previousLockVersion ||
      receipt.pattern.lineKey !== evidence.patternLineKey ||
      receipt.pattern.url !== evidence.patternUrl ||
      receipt.pattern.scopeKey !== evidence.scopeKey ||
      receipt.pattern.sizeId !== evidence.patternSizeId ||
      receipt.pattern.sha256 !== evidence.productExportSha256 ||
      !sameCanonicalMembership(receipt.pieceLineKeys, evidence.pieceLineKeys) ||
      !sameCanonicalMembership(receipt.aliases, evidence.aliases)
    )
      fail(
        'binding-mismatch',
        'input.postSaveReadbackInput',
        'fresh product composition and persisted G4F3 pattern identity differ.',
      );
    if (
      !Number.isSafeInteger(evidence.byteLength) ||
      evidence.byteLength < 1 ||
      evidence.byteLength > MAX_PRODUCT_DXF_BYTES
    )
      fail(
        'bounds-exceeded',
        'composition.evidence.byteLength',
        'product DXF byte bound exceeded.',
      );

    const document: PatternImportDxfProductSemanticSidecarDocumentV1 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_DOCUMENT_V1,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1,
      encoding: 'canonical-json-utf8' as const,
      product: {
        writerReceiptVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_RECEIPT_V1,
        writerId: PATTERN_IMPORT_DXF_PRODUCT_WRITER_ID_V1,
        writerDialect: PATTERN_IMPORT_DXF_PRODUCT_WRITER_DIALECT_V1,
        format: PATTERN_IMPORT_DXF_PRODUCT_WRITER_FORMAT_V1,
        scopeKey: evidence.scopeKey,
        exportSha256: evidence.productExportSha256,
        byteLength: evidence.byteLength,
        phaseEPlanSha256: evidence.phaseEPlanSha256,
        sizeSelectionSha256: evidence.sizeSelectionSha256,
        mappingCompositionSealSha256: composition.compositionSeal.canonicalSha256,
      },
      mapping: {
        version: composition.mapping.schemaVersion,
        sealSha256: composition.mappingSeal.canonicalSha256,
        artifact: composition.mapping,
      },
      persistence: {
        receiptVersion: receipt.schemaVersion,
        receiptSealVersion: postSave.seal.schemaVersion,
        receiptSealSha256: postSave.seal.canonicalSha256,
        card: receipt.card,
        pattern: receipt.pattern,
        pieceLineKeys: receipt.pieceLineKeys,
        aliases: receipt.aliases,
      },
    });
    const canonicalBytes = textEncoder.encode(canonical(document));
    if (canonicalBytes.byteLength < 1 || canonicalBytes.byteLength > MAX_CANONICAL_BYTES)
      fail('bounds-exceeded', 'document', 'canonical sidecar byte bound exceeded.');
    const seal: PatternImportDxfProductSemanticSidecarSealV1 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256: await digest(crypto, canonicalBytes),
      canonicalByteLength: canonicalBytes.byteLength,
      authority: 'unsigned-product-deterministic-sidecar-bytes-only' as const,
      trustedAuthorityIntegrated: false as const,
      productionReady: false as const,
    });
    const owner: PatternImportDxfProductSemanticSidecarOwnerV1 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_OWNER_V1,
      document,
      seal,
    });
    ownerStates.set(owner, { canonicalBytes: canonicalBytes.slice() });
    return deepFreeze({
      ok: true as const,
      owner,
      document,
      seal,
      blockers: [] as const,
      claims: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}

export function encodePatternImportDxfProductSemanticSidecarV1(
  candidate: unknown,
): EncodePatternImportDxfProductSemanticSidecarResultV1 {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const state = ownerStates.get(candidate as object);
  if (!state)
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const owner = candidate as PatternImportDxfProductSemanticSidecarOwnerV1;
  if (
    owner.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_OWNER_V1 ||
    owner.seal.canonicalByteLength !== state.canonicalBytes.byteLength
  )
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  return Object.freeze({
    ok: true as const,
    bytes: state.canonicalBytes.slice(),
    canonicalSha256: owner.seal.canonicalSha256,
    canonicalByteLength: owner.seal.canonicalByteLength,
  });
}
