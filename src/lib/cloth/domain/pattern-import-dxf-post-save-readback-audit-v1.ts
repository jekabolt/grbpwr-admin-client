import {
  bindingScopes,
  fabricScopes,
  isRollGoodsSection,
  type BindingScopes,
} from 'components/managers/tech-card/components/bom-purpose';
import { savedWorkbenchBindingScopeKeyV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-workbench-scope-v1';
import { aliasKey } from 'lib/pattern-import/fabrics/draft';
import {
  PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1,
  buildPatternImportDxfWriterByteExportBindingV1,
  type PatternImportDxfWriterByteExportBindingInputV1,
} from './pattern-import-dxf-writer-byte-export-binding-v1';

export const PATTERN_IMPORT_DXF_POST_SAVE_READBACK_AUDIT_V1 =
  'pattern-import-dxf-post-save-readback-audit/1' as const;
export const PATTERN_IMPORT_DXF_POST_SAVE_READBACK_RECEIPT_V1 =
  'pattern-import-dxf-post-save-readback-receipt/1' as const;
export const PATTERN_IMPORT_DXF_POST_SAVE_READBACK_SEAL_V1 =
  'pattern-import-dxf-post-save-readback-seal/1' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_RECORD_KEYS = 512;
const MAX_ROWS = 4_096;
const MAX_TEXT_BYTES = 4_096;
const MAX_DETAIL_BYTES = 1_024;
const MAX_CANONICAL_BYTES = 2 * 1024 * 1024;
const SHA256_KAT_PREIMAGE = 'pattern-import-dxf-post-save-readback-audit-v1-kat';
const SHA256_KAT_DIGEST = '10ed8df6b29a747f745bdea2d15c9f9bc3f3ae12d6f56b82f987a5ea1d9addba';
const textEncoder = new TextEncoder();

export type PatternImportDxfPostSaveExpectedAliasV1 = Readonly<{
  scopeKey: string;
  blockName: string;
  pieceLineKey: string;
}>;

export type PatternImportDxfPostSaveReadbackAuditInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_POST_SAVE_READBACK_AUDIT_V1;
  /** Always rerun by this owner; detached receipts and writer SHA values are not accepted. */
  writerBindingInput: PatternImportDxfWriterByteExportBindingInputV1;
  expected: Readonly<{
    writerReceiptSealSha256: string;
    techCardId: number;
    previousLockVersion: number;
    pattern: Readonly<{
      lineKey: string;
      url: string;
      scopeKey: string;
      sizeId: number;
    }>;
    pieceLineKeys: readonly string[];
    aliases: readonly PatternImportDxfPostSaveExpectedAliasV1[];
  }>;
}>;

export type PatternImportDxfGetTechCardReaderV1 = (techCardId: number) => Promise<unknown>;

/** Shared exact saved-row expectation used by both the legacy G4F2 audit and product R12 replay. */
export type PatternImportDxfPostSaveCardExpectationV1 = Readonly<{
  techCardId: number;
  previousLockVersion: number;
  pattern: Readonly<{ lineKey: string; url: string; scopeKey: string; sizeId: number }>;
  pieceLineKeys: readonly string[];
  aliases: readonly PatternImportDxfPostSaveExpectedAliasV1[];
}>;

export type PatternImportDxfPostSaveCardObservationV1 = Readonly<{
  lockVersion: number;
  pattern: Readonly<{
    lineKey: string;
    url: string;
    scopeKey: string;
    sizeId: number;
    version: number;
    sha256: string;
  }>;
  pieceLineKeys: readonly string[];
  aliases: readonly PatternImportDxfPostSaveExpectedAliasV1[];
}>;

export type PatternImportDxfPostSaveReadbackReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_POST_SAVE_READBACK_RECEIPT_V1;
  writer: Readonly<{
    receiptVersion: typeof PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1;
    receiptSealSha256: string;
    exportSha256: string;
    byteLength: number;
  }>;
  card: Readonly<{
    techCardId: number;
    previousLockVersion: number;
    observedLockVersion: number;
  }>;
  pattern: Readonly<{
    lineKey: string;
    url: string;
    scopeKey: string;
    sizeId: number;
    version: number;
    sha256: string;
  }>;
  pieceLineKeys: readonly string[];
  aliases: readonly PatternImportDxfPostSaveExpectedAliasV1[];
}>;

export type PatternImportDxfPostSaveReadbackSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_POST_SAVE_READBACK_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  authority: 'unsigned-host-readback-consistency-only';
}>;

export const PATTERN_IMPORT_DXF_POST_SAVE_READBACK_CLAIMS_V1 = Object.freeze({
  freshG4f2WriterReceiptRebuilt: true,
  callerSuppliedReadbackSnapshotAccepted: false,
  getTechCardReaderInvoked: true,
  lockVersionAdvanced: true,
  exactPatternIdentityObserved: true,
  exactWriterShaObserved: true,
  exactPieceLineKeysObserved: true,
  exactAliasesObserved: true,
  postSaveReadbackConsistencyVerified: true,
  contourAndVertexSemanticsPersisted: false,
  seamMappingSemanticallyPersisted: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  freshG4f2WriterReceiptRebuilt: false as const,
  callerSuppliedReadbackSnapshotAccepted: false as const,
  getTechCardReaderInvoked: false as const,
  lockVersionAdvanced: false as const,
  exactPatternIdentityObserved: false as const,
  exactWriterShaObserved: false as const,
  exactPieceLineKeysObserved: false as const,
  exactAliasesObserved: false as const,
  postSaveReadbackConsistencyVerified: false as const,
  contourAndVertexSemanticsPersisted: false as const,
  seamMappingSemanticallyPersisted: false as const,
  trustedAuthorityIntegrated: false as const,
  productionReady: false as const,
});

export const PATTERN_IMPORT_DXF_POST_SAVE_READBACK_CONTRACT_V1 = Object.freeze({
  writerAuthority: 'fresh internal G4F2 rerun',
  readAuthority: 'explicit host GetTechCard capability invoked after save',
  callerSuppliedReadbackSnapshotAccepted: false,
  exactPatternFields: ['lineKey', 'url', 'scopeKey', 'sizeId', 'version>0', 'sha256'] as const,
  exactChildIdentity: 'expected piece line keys and scoped block aliases',
  contourAndVertexSemanticsPersisted: false,
  seamMappingSemanticallyPersisted: false,
  trustedAuthorityIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfPostSaveReadbackBlockerCodeV1 =
  | 'reentrant-call'
  | 'invalid-input'
  | 'g4f2-blocked'
  | 'writer-receipt-seal-mismatch'
  | 'reader-failed'
  | 'readback-invalid'
  | 'card-identity-mismatch'
  | 'lock-version-not-advanced'
  | 'pattern-row-missing'
  | 'pattern-row-ambiguous'
  | 'pattern-row-mismatch'
  | 'piece-identity-missing'
  | 'piece-identity-ambiguous'
  | 'alias-missing'
  | 'alias-ambiguous'
  | 'sha256-unavailable';

export type PatternImportDxfPostSaveReadbackBlockerV1 = Readonly<{
  code: PatternImportDxfPostSaveReadbackBlockerCodeV1;
  field: string;
  detail: string;
}>;

export type PatternImportDxfPostSaveReadbackResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPostSaveReadbackReceiptV1;
      seal: PatternImportDxfPostSaveReadbackSealV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_POST_SAVE_READBACK_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      seal: null;
      blockers: readonly PatternImportDxfPostSaveReadbackBlockerV1[];
      claims: typeof BLOCKED_CLAIMS;
    }>;

class ReadbackFailure extends Error {
  constructor(
    readonly code: PatternImportDxfPostSaveReadbackBlockerCodeV1,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: PatternImportDxfPostSaveReadbackBlockerCodeV1,
  field: string,
  detail: string,
): never {
  throw new ReadbackFailure(code, field, detail);
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

function blocked(error: unknown): PatternImportDxfPostSaveReadbackResultV1 {
  const known = error instanceof ReadbackFailure;
  return deepFreeze({
    ok: false as const,
    receipt: null,
    seal: null,
    blockers: [
      {
        code: known ? error.code : ('readback-invalid' as const),
        field: bounded(known ? error.field : 'readback'),
        detail: bounded(
          known
            ? error.message
            : 'Post-save readback audit rejected inaccessible or inconsistent data.',
        ),
      },
    ],
    claims: BLOCKED_CLAIMS,
  });
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ArrayBuffer.isView(value))
    fail('readback-invalid', field, 'must be a plain record.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let keys: readonly PropertyKey[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    keys = Reflect.ownKeys(descriptors);
  } catch {
    fail('readback-invalid', field, 'reflection failed.');
  }
  if (prototype !== Object.prototype || keys.length > MAX_RECORD_KEYS)
    fail('readback-invalid', field, 'must be a bounded Object.prototype record.');
  const output: Record<string, unknown> = {};
  for (const key of keys) {
    if (typeof key !== 'string') fail('readback-invalid', field, 'symbol fields are forbidden.');
    const descriptor = descriptors[key];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('readback-invalid', `${field}.${key}`, 'must be an enumerable data property.');
    output[key] = descriptor.value;
  }
  return output;
}

function exactInputRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  const record = safeRecord(value, field);
  const actual = Object.keys(record).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('invalid-input', field, `must have exact keys: ${expected.join(', ')}.`);
  return record;
}

function required(record: Record<string, unknown>, key: string, field: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(record, key))
    fail('readback-invalid', `${field}.${key}`, 'required field is missing.');
  return record[key];
}

function denseArray(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    fail('readback-invalid', field, 'must be an array.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (value.length > MAX_ROWS || keys.length !== value.length + 1)
    fail('readback-invalid', field, 'array is sparse, extended, or exceeds the row bound.');
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      fail('readback-invalid', `${field}[${index}]`, 'must be a dense data element.');
  }
  return value;
}

function stableText(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !STABLE_ID.test(value) ||
    textEncoder.encode(value).byteLength > MAX_TEXT_BYTES
  )
    fail('invalid-input', field, 'must be a bounded stable identifier.');
  return value;
}

function readText(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    textEncoder.encode(value).byteLength > MAX_TEXT_BYTES
  )
    fail('readback-invalid', field, 'must be bounded non-empty text.');
  return value;
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail('invalid-input', field, 'must be a non-negative safe integer.');
  return value as number;
}

function readNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    fail('readback-invalid', field, 'must be a non-negative safe integer.');
  return value as number;
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      throw new TypeError('non-canonical number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError('unsupported canonical value');
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function checkedCrypto(
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<Pick<Crypto, 'subtle'>> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function')
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 implementation is unavailable.');
  let digest: Uint8Array;
  try {
    digest = new Uint8Array(
      await crypto.subtle.digest('SHA-256', textEncoder.encode(SHA256_KAT_PREIMAGE)),
    );
  } catch {
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 known-answer test failed.');
  }
  if (digest.byteLength !== 32 || hex(digest) !== SHA256_KAT_DIGEST)
    fail('sha256-unavailable', 'crypto.subtle', 'SHA-256 known-answer test failed.');
  return crypto;
}

async function sha256(
  crypto: Pick<Crypto, 'subtle'>,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<string> {
  let digest: Uint8Array;
  try {
    digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  } catch {
    fail('sha256-unavailable', 'receipt', 'SHA-256 digest failed.');
  }
  if (digest.byteLength !== 32)
    fail('sha256-unavailable', 'receipt', 'SHA-256 returned an invalid digest.');
  return hex(digest);
}

type Expected = PatternImportDxfPostSaveCardExpectationV1 &
  Readonly<{ writerReceiptSealSha256: string }>;

function parseCardExpectedRecord(
  record: Record<string, unknown>,
  field: string,
): PatternImportDxfPostSaveCardExpectationV1 {
  const techCardId = nonNegativeInteger(record.techCardId, `${field}.techCardId`);
  if (techCardId === 0) fail('invalid-input', `${field}.techCardId`, 'must be positive.');
  const patternRecord = exactInputRecord(
    record.pattern,
    ['lineKey', 'url', 'scopeKey', 'sizeId'],
    `${field}.pattern`,
  );
  const pattern = {
    lineKey: stableText(patternRecord.lineKey, `${field}.pattern.lineKey`),
    url: readText(patternRecord.url, `${field}.pattern.url`),
    scopeKey: stableText(patternRecord.scopeKey, `${field}.pattern.scopeKey`),
    sizeId: nonNegativeInteger(patternRecord.sizeId, `${field}.pattern.sizeId`),
  };
  const pieceLineKeys = denseArray(record.pieceLineKeys, `${field}.pieceLineKeys`)
    .map((item, index) => stableText(item, `${field}.pieceLineKeys[${index}]`))
    .sort(compareCodeUnits);
  if (pieceLineKeys.length === 0 || new Set(pieceLineKeys).size !== pieceLineKeys.length)
    fail('invalid-input', `${field}.pieceLineKeys`, 'must be non-empty and unique.');
  const aliases = denseArray(record.aliases, `${field}.aliases`)
    .map((item, index) => {
      const alias = exactInputRecord(
        item,
        ['scopeKey', 'blockName', 'pieceLineKey'],
        `${field}.aliases[${index}]`,
      );
      const parsed = {
        scopeKey: stableText(alias.scopeKey, `${field}.aliases[${index}].scopeKey`),
        blockName: readText(alias.blockName, `${field}.aliases[${index}].blockName`),
        pieceLineKey: stableText(alias.pieceLineKey, `${field}.aliases[${index}].pieceLineKey`),
      };
      if (!pieceLineKeys.includes(parsed.pieceLineKey))
        fail(
          'invalid-input',
          `${field}.aliases[${index}].pieceLineKey`,
          'must name an expected piece line key.',
        );
      return parsed;
    })
    .sort((left, right) =>
      compareCodeUnits(
        `${left.scopeKey}\0${left.blockName.toLowerCase()}\0${left.pieceLineKey}`,
        `${right.scopeKey}\0${right.blockName.toLowerCase()}\0${right.pieceLineKey}`,
      ),
    );
  const aliasKeys = aliases.map(({ scopeKey, blockName }) => aliasKey(scopeKey, blockName));
  if (aliases.length === 0 || new Set(aliasKeys).size !== aliases.length)
    fail('invalid-input', `${field}.aliases`, 'must be non-empty with unique scope/block keys.');
  return deepFreeze({
    techCardId,
    previousLockVersion: nonNegativeInteger(
      record.previousLockVersion,
      `${field}.previousLockVersion`,
    ),
    pattern,
    pieceLineKeys,
    aliases,
  });
}

function parseExpected(value: unknown): Expected {
  const record = exactInputRecord(
    value,
    [
      'writerReceiptSealSha256',
      'techCardId',
      'previousLockVersion',
      'pattern',
      'pieceLineKeys',
      'aliases',
    ],
    'input.expected',
  );
  const seal = stableText(record.writerReceiptSealSha256, 'input.expected.writerReceiptSealSha256');
  if (!SHA256.test(seal))
    fail('invalid-input', 'input.expected.writerReceiptSealSha256', 'must be lowercase SHA-256.');
  return deepFreeze({
    writerReceiptSealSha256: seal,
    ...parseCardExpectedRecord(record, 'input.expected'),
  });
}

function optionalReadText(value: unknown, field: string): string {
  if (value === undefined || value === null || value === '') return '';
  return readText(value, field);
}

function scopeBindingOf(record: Record<string, unknown>, field: string) {
  return {
    fabricPurpose: optionalReadText(record.fabricPurpose, `${field}.fabricPurpose`),
    bomLineKey: optionalReadText(record.bomLineKey, `${field}.bomLineKey`),
  };
}

function scopeKeyOf(
  record: Record<string, unknown>,
  field: string,
  bindings: BindingScopes | undefined,
): string {
  const { fabricPurpose, bomLineKey } = scopeBindingOf(record, field);
  if (bindings) return savedWorkbenchBindingScopeKeyV1(fabricPurpose, bomLineKey, bindings);
  // The narrow legacy readback port predates BOM rows and carries a scope token directly.
  if (
    fabricPurpose &&
    fabricPurpose !== 'TECH_CARD_BOM_PURPOSE_UNKNOWN' &&
    fabricPurpose !== 'TECH_CARD_BOM_PURPOSE_UNSPECIFIED' &&
    fabricPurpose !== 'TECH_CARD_BOM_PURPOSE_UNSET'
  )
    return fabricPurpose;
  return bomLineKey;
}

function parseReadback(
  value: unknown,
  expected: PatternImportDxfPostSaveCardExpectationV1,
  writer: Readonly<{ writer: Readonly<{ exportSha256: string }> }>,
): PatternImportDxfPostSaveCardObservationV1 {
  const response = safeRecord(value, 'readback');
  const card = safeRecord(required(response, 'techCard', 'readback'), 'readback.techCard');
  const cardId = readNonNegativeInteger(
    required(card, 'id', 'readback.techCard'),
    'readback.techCard.id',
  );
  if (cardId !== expected.techCardId)
    fail('card-identity-mismatch', 'readback.techCard.id', 'GetTechCard returned another card.');
  const lockVersion = readNonNegativeInteger(
    required(card, 'lockVersion', 'readback.techCard'),
    'readback.techCard.lockVersion',
  );
  if (lockVersion <= expected.previousLockVersion)
    fail(
      'lock-version-not-advanced',
      'readback.techCard.lockVersion',
      'server lockVersion did not advance beyond the pre-save version.',
    );
  const insert = safeRecord(
    required(card, 'techCard', 'readback.techCard'),
    'readback.techCard.techCard',
  );
  const patterns = denseArray(
    required(insert, 'patterns', 'readback.techCard.techCard'),
    'readback.techCard.techCard.patterns',
  ).map((item, index) => safeRecord(item, `readback.techCard.techCard.patterns[${index}]`));
  const materialScopes =
    insert.bomItems === undefined
      ? undefined
      : fabricScopes(
          denseArray(insert.bomItems, 'readback.techCard.techCard.bomItems').flatMap(
            (item, index) => {
              const field = `readback.techCard.techCard.bomItems[${index}]`;
              const row = safeRecord(item, field);
              const lineKey = optionalReadText(row.lineKey, `${field}.lineKey`);
              const section = optionalReadText(row.section, `${field}.section`);
              const purpose = optionalReadText(row.purpose, `${field}.purpose`);
              return lineKey && isRollGoodsSection(section) ? [{ lineKey, section, purpose }] : [];
            },
          ),
        );
  const patternBindings = materialScopes
    ? bindingScopes(
        materialScopes,
        patterns.map((row, index) => scopeBindingOf(row, `pattern[${index}]`)),
      )
    : undefined;
  const matchingPatterns = patterns.filter(
    (row) => optionalReadText(row.lineKey, 'pattern.lineKey') === expected.pattern.lineKey,
  );
  if (matchingPatterns.length === 0)
    fail(
      'pattern-row-missing',
      'readback.techCard.techCard.patterns',
      'expected pattern lineKey is absent.',
    );
  if (matchingPatterns.length !== 1)
    fail(
      'pattern-row-ambiguous',
      'readback.techCard.techCard.patterns',
      'expected pattern lineKey is duplicated.',
    );
  const patternRow = matchingPatterns[0]!;
  const observedPattern = {
    lineKey: optionalReadText(patternRow.lineKey, 'pattern.lineKey'),
    url: optionalReadText(patternRow.url, 'pattern.url'),
    scopeKey: scopeKeyOf(patternRow, 'pattern', patternBindings),
    sizeId: readNonNegativeInteger(patternRow.sizeId, 'pattern.sizeId'),
    version: readNonNegativeInteger(patternRow.version, 'pattern.version'),
    sha256: optionalReadText(patternRow.sha256, 'pattern.sha256'),
  };
  if (
    observedPattern.url !== expected.pattern.url ||
    observedPattern.scopeKey !== expected.pattern.scopeKey ||
    observedPattern.sizeId !== expected.pattern.sizeId ||
    observedPattern.version <= 0 ||
    observedPattern.sha256 !== writer.writer.exportSha256
  )
    fail(
      'pattern-row-mismatch',
      'readback.techCard.techCard.patterns',
      'persisted pattern url/scope/size/version/SHA does not match the exact save expectation and G4F2 bytes.',
    );

  const pieces = denseArray(
    required(insert, 'pieces', 'readback.techCard.techCard'),
    'readback.techCard.techCard.pieces',
  ).map((item, index) => safeRecord(item, `readback.techCard.techCard.pieces[${index}]`));
  const pieceCounts = new Map<string, number>();
  for (const row of pieces) {
    const lineKey = optionalReadText(row.lineKey, 'piece.lineKey');
    if (lineKey) pieceCounts.set(lineKey, (pieceCounts.get(lineKey) ?? 0) + 1);
  }
  for (const lineKey of expected.pieceLineKeys) {
    const count = pieceCounts.get(lineKey) ?? 0;
    if (count === 0)
      fail(
        'piece-identity-missing',
        'readback.techCard.techCard.pieces',
        `piece ${lineKey} is absent.`,
      );
    if (count !== 1)
      fail(
        'piece-identity-ambiguous',
        'readback.techCard.techCard.pieces',
        `piece ${lineKey} is duplicated.`,
      );
  }

  const aliasWrapper = safeRecord(
    required(insert, 'pieceDxfAliases', 'readback.techCard.techCard'),
    'readback.techCard.techCard.pieceDxfAliases',
  );
  const aliasRows = denseArray(
    required(aliasWrapper, 'items', 'readback.techCard.techCard.pieceDxfAliases'),
    'readback.techCard.techCard.pieceDxfAliases.items',
  ).map((item, index) =>
    safeRecord(item, `readback.techCard.techCard.pieceDxfAliases.items[${index}]`),
  );
  const aliasBindings = materialScopes
    ? bindingScopes(
        materialScopes,
        aliasRows.map((row, index) => scopeBindingOf(row, `alias[${index}]`)),
      )
    : undefined;
  const aliases = aliasRows.map((row, index) => ({
    scopeKey: scopeKeyOf(row, `alias[${index}]`, aliasBindings),
    blockName: optionalReadText(row.blockName, `alias[${index}].blockName`),
    pieceLineKey: optionalReadText(row.pieceLineKey, `alias[${index}].pieceLineKey`),
  }));
  const aliasOwners = new Map<string, string[]>();
  for (const alias of aliases) {
    if (!alias.scopeKey || !alias.blockName) continue;
    const key = aliasKey(alias.scopeKey, alias.blockName);
    const owners = aliasOwners.get(key) ?? [];
    owners.push(alias.pieceLineKey);
    aliasOwners.set(key, owners);
  }
  for (const alias of expected.aliases) {
    const key = aliasKey(alias.scopeKey, alias.blockName);
    const owners = aliasOwners.get(key) ?? [];
    if (owners.length === 0 || !owners.includes(alias.pieceLineKey))
      fail(
        'alias-missing',
        'readback.techCard.techCard.pieceDxfAliases',
        `alias ${alias.scopeKey}/${alias.blockName} no longer names its saved piece.`,
      );
    if (owners.length !== 1)
      fail(
        'alias-ambiguous',
        'readback.techCard.techCard.pieceDxfAliases',
        `alias ${alias.scopeKey}/${alias.blockName} has multiple saved owners.`,
      );
  }

  return deepFreeze({
    lockVersion,
    pattern: observedPattern,
    pieceLineKeys: expected.pieceLineKeys,
    aliases: expected.aliases,
  });
}

export type PatternImportDxfPostSaveCardVerificationResultV1 =
  | Readonly<{
      ok: true;
      observation: PatternImportDxfPostSaveCardObservationV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      observation: null;
      blockers: readonly [PatternImportDxfPostSaveReadbackBlockerV1];
    }>;

let cardVerificationClaimed = false;

/**
 * Shared reader-only boundary. The caller must fresh-prove its writer bytes before invoking this;
 * this function accepts only an exact expected saved row and comparison SHA, never a snapshot.
 */
export async function verifyPatternImportDxfPostSaveCardV1(
  expectationValue: unknown,
  writerExportSha256: string,
  getTechCard: PatternImportDxfGetTechCardReaderV1,
): Promise<PatternImportDxfPostSaveCardVerificationResultV1> {
  if (cardVerificationClaimed)
    return deepFreeze({
      ok: false as const,
      observation: null,
      blockers: [
        {
          code: 'reentrant-call' as const,
          field: 'expectation',
          detail: 'reentrant shared post-save card verification refused.',
        },
      ] as const,
    });
  cardVerificationClaimed = true;
  try {
    const record = exactInputRecord(
      expectationValue,
      ['techCardId', 'previousLockVersion', 'pattern', 'pieceLineKeys', 'aliases'],
      'expectation',
    );
    if (!SHA256.test(writerExportSha256))
      fail('invalid-input', 'writerExportSha256', 'must be lowercase SHA-256.');
    if (typeof getTechCard !== 'function')
      fail('invalid-input', 'getTechCard', 'host GetTechCard reader is required.');
    const expectation = parseCardExpectedRecord(record, 'expectation');
    let rawReadback: unknown;
    try {
      rawReadback = await getTechCard(expectation.techCardId);
    } catch {
      fail('reader-failed', 'getTechCard', 'host GetTechCard reader rejected.');
    }
    return deepFreeze({
      ok: true as const,
      observation: parseReadback(rawReadback, expectation, {
        writer: { exportSha256: writerExportSha256 },
      }),
      blockers: [] as const,
    });
  } catch (error) {
    const known = error instanceof ReadbackFailure;
    return deepFreeze({
      ok: false as const,
      observation: null,
      blockers: [
        {
          code: known ? error.code : ('readback-invalid' as const),
          field: bounded(known ? error.field : 'readback'),
          detail: bounded(
            known
              ? error.message
              : 'Shared post-save card verification rejected inconsistent data.',
          ),
        },
      ] as const,
    });
  } finally {
    cardVerificationClaimed = false;
  }
}

let claimed = false;

export async function auditPatternImportDxfPostSaveReadbackV1(
  inputValue: unknown,
  getTechCard: PatternImportDxfGetTechCardReaderV1,
  cryptoCandidate: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfPostSaveReadbackResultV1> {
  if (claimed)
    return blocked(
      new ReadbackFailure('reentrant-call', 'input', 'reentrant readback audit refused.'),
    );
  claimed = true;
  try {
    const input = exactInputRecord(
      inputValue,
      ['schemaVersion', 'writerBindingInput', 'expected'],
      'input',
    );
    if (input.schemaVersion !== PATTERN_IMPORT_DXF_POST_SAVE_READBACK_AUDIT_V1)
      fail('invalid-input', 'input.schemaVersion', 'schema version is unsupported.');
    if (typeof getTechCard !== 'function')
      fail('invalid-input', 'getTechCard', 'host GetTechCard reader is required.');
    const expected = parseExpected(input.expected);
    const crypto = await checkedCrypto(cryptoCandidate);
    const writerResult = await buildPatternImportDxfWriterByteExportBindingV1(
      input.writerBindingInput,
      crypto,
    );
    if (!writerResult.ok)
      fail(
        'g4f2-blocked',
        'input.writerBindingInput',
        writerResult.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (writerResult.seal.canonicalSha256 !== expected.writerReceiptSealSha256)
      fail(
        'writer-receipt-seal-mismatch',
        'input.expected.writerReceiptSealSha256',
        'expected receipt seal does not equal the fresh G4F2 receipt seal.',
      );

    let rawReadback: unknown;
    try {
      rawReadback = await getTechCard(expected.techCardId);
    } catch {
      fail('reader-failed', 'getTechCard', 'host GetTechCard reader rejected.');
    }
    const observed = parseReadback(rawReadback, expected, writerResult.receipt);
    const receipt: PatternImportDxfPostSaveReadbackReceiptV1 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_POST_SAVE_READBACK_RECEIPT_V1,
      writer: {
        receiptVersion: writerResult.receipt.schemaVersion,
        receiptSealSha256: writerResult.seal.canonicalSha256,
        exportSha256: writerResult.receipt.writer.exportSha256,
        byteLength: writerResult.receipt.writer.byteLength,
      },
      card: {
        techCardId: expected.techCardId,
        previousLockVersion: expected.previousLockVersion,
        observedLockVersion: observed.lockVersion,
      },
      pattern: observed.pattern,
      pieceLineKeys: observed.pieceLineKeys,
      aliases: observed.aliases,
    });
    const canonicalBytes = textEncoder.encode(
      `pattern-import-dxf-post-save-readback-receipt-v1\0${canonical(receipt)}`,
    );
    if (canonicalBytes.byteLength > MAX_CANONICAL_BYTES)
      fail('invalid-input', 'receipt', 'canonical receipt exceeds the byte bound.');
    const seal: PatternImportDxfPostSaveReadbackSealV1 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_POST_SAVE_READBACK_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256: await sha256(crypto, canonicalBytes),
      authority: 'unsigned-host-readback-consistency-only' as const,
    });
    return deepFreeze({
      ok: true as const,
      receipt,
      seal,
      blockers: [] as const,
      claims: PATTERN_IMPORT_DXF_POST_SAVE_READBACK_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}
