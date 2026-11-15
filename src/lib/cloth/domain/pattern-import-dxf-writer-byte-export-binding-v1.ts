import type { DxfMaterialAssignmentV1 } from './dxf-assembly-handoff-v1';
import {
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
  PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
  buildPatternImportDxfTwoSidedSeamMappingV2,
  type PatternImportDxfTwoSidedSeamMappingInputV2,
} from './pattern-import-dxf-two-sided-seam-mapping-v2';
import { isAsciiDxf } from '../../pattern-import/write/format';
import { pieceInScope, planBlocks } from '../../pattern-import/write/plan';
import { writeR2000 } from '../../pattern-import/write/r2000';
import type { DraftScopeTarget, PieceSpec } from '../../pattern-import/types';

export const PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_BINDING_V1 =
  'pattern-import-dxf-writer-byte-export-binding/1' as const;
export const PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1 =
  'pattern-import-dxf-writer-byte-export-receipt/1' as const;
export const PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_SEAL_V1 =
  'pattern-import-dxf-writer-byte-export-seal/1' as const;

export const PATTERN_IMPORT_DXF_R2000_WRITER_ID_V1 = 'grbpwr.pattern-import.writeR2000' as const;
export const PATTERN_IMPORT_DXF_R2000_WRITER_VERSION_V1 = 'clo-dxf-r2000-ac1015/1' as const;
export const PATTERN_IMPORT_DXF_R2000_FORMAT_V1 = 'DXF-R2000-AC1015' as const;

const SHA256 = /^[0-9a-f]{64}$/;
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const MAX_DEPTH = 32;
const MAX_NODES = 1_000_000;
const MAX_ARRAY_LENGTH = 100_000;
const MAX_RECORD_KEYS = 128;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_TOTAL_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_WRITER_BYTES = 16 * 1024 * 1024;
const MAX_WRITER_BLOCKS = 4_096;
const MAX_EMITTED_GEOMETRY_POINTS = 200_000;
const MAX_BLOCKERS = 16;
const MAX_DETAIL_BYTES = 1_024;
const SHA256_KAT_PREIMAGE = 'pattern-import-dxf-writer-byte-export-binding-v1-kat';
const SHA256_KAT_DIGEST = '472a646d2d6620a6efd64e9ecb8eda27a2df69648acfcfd09ecc9494488bd017';
const textEncoder = new TextEncoder();

export type PatternImportDxfWriterScopeSupplementV1 = Readonly<{
  scopeKey: string;
  fabricPurpose: string;
  bomLineKey: string;
  label: string;
  isInterlining: boolean;
  sections: readonly string[];
}>;

export type PatternImportDxfWriterByteExportBindingInputV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_BINDING_V1;
  /** G4F2 always re-runs G4F1; a caller cannot submit a detached mapping or seal. */
  mappingInput: PatternImportDxfTwoSidedSeamMappingInputV2;
  expected: Readonly<{
    mappingSealSha256: string;
    documentId: string;
    revision: string;
  }>;
  /** Writer-only label/scope metadata absent from the assembly composition. */
  writerScope: PatternImportDxfWriterScopeSupplementV1;
}>;

export type PatternImportDxfWriterByteExportReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1;
  mapping: Readonly<{
    version: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2;
    sealVersion: typeof PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2;
    canonicalSha256: string;
  }>;
  source: Readonly<{
    documentId: string;
    revision: string;
  }>;
  assembly: Readonly<{
    /** Fresh G4F1 Phase-E handoff seal, covering operations and material assignments. */
    revisionSha256: string;
  }>;
  materials: readonly Readonly<{
    materialId: string;
    materialRevision: string;
  }>[];
  writerScope: PatternImportDxfWriterScopeSupplementV1;
  writer: Readonly<{
    id: typeof PATTERN_IMPORT_DXF_R2000_WRITER_ID_V1;
    version: typeof PATTERN_IMPORT_DXF_R2000_WRITER_VERSION_V1;
    format: typeof PATTERN_IMPORT_DXF_R2000_FORMAT_V1;
    byteEncoding: 'ASCII-CRLF';
    exportSha256: string;
    byteLength: number;
    blockCount: number;
  }>;
}>;

export type PatternImportDxfWriterByteExportSealV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_SEAL_V1;
  algorithm: 'SHA-256';
  canonicalSha256: string;
  sealedReceiptVersion: typeof PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1;
  authority: 'unsigned-in-memory-consistency-only';
}>;

export const PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_CLAIMS_V1 = Object.freeze({
  actualProductionWriterInvoked: true,
  callerSuppliedWriterBytesAccepted: false,
  callerSuppliedExportShaAccepted: false,
  writerPlanDerivedFromExactG4f1Composition: true,
  writerGeometryMatchesG4f1Composition: true,
  writerBytesShaBound: true,
  mappingSealBound: true,
  mappingSemanticallyEncodedInWriter: false,
  rawWriterBytesExposed: false,
  trustedAuthorityIntegrated: false,
  postSavePersistenceIntegrated: false,
  productionReady: false,
} as const);

export type PatternImportDxfWriterByteExportBlockerCodeV1 =
  | 'reentrant-call'
  | 'invalid-input'
  | 'bounds-exceeded'
  | 'g4f1-blocked'
  | 'mapping-seal-mismatch'
  | 'source-binding-mismatch'
  | 'writer-scope-mismatch'
  | 'writer-plan-blocked'
  | 'writer-output-invalid'
  | 'sha256-unavailable';

export type PatternImportDxfWriterByteExportBlockerV1 = Readonly<{
  code: PatternImportDxfWriterByteExportBlockerCodeV1;
  field: string;
  detail: string;
}>;

export type PatternImportDxfWriterByteExportBindingResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfWriterByteExportReceiptV1;
      seal: PatternImportDxfWriterByteExportSealV1;
      blockers: readonly [];
      claims: typeof PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_CLAIMS_V1;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      seal: null;
      blockers: readonly PatternImportDxfWriterByteExportBlockerV1[];
      claims: Readonly<{
        actualProductionWriterInvoked: false;
        callerSuppliedWriterBytesAccepted: false;
        callerSuppliedExportShaAccepted: false;
        writerPlanDerivedFromExactG4f1Composition: false;
        writerGeometryMatchesG4f1Composition: false;
        writerBytesShaBound: false;
        mappingSealBound: false;
        mappingSemanticallyEncodedInWriter: false;
        rawWriterBytesExposed: false;
        trustedAuthorityIntegrated: false;
        postSavePersistenceIntegrated: false;
        productionReady: false;
      }>;
    }>;

export const PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_CONTRACT_V1 = Object.freeze({
  mappingAuthority: 'fresh internal G4F1 rebuild only',
  writerPlanAuthority: 'production planBlocks from exact snapshotted G4F1 PieceSpec composition',
  writerAuthority: PATTERN_IMPORT_DXF_R2000_WRITER_ID_V1,
  writerVersion: PATTERN_IMPORT_DXF_R2000_WRITER_VERSION_V1,
  writerFormat: PATTERN_IMPORT_DXF_R2000_FORMAT_V1,
  callerSuppliedBlocksAccepted: false,
  callerSuppliedWriterBytesAccepted: false,
  callerSuppliedExportShaAccepted: false,
  rawWriterBytesReturned: false,
  mappingSemanticallyEncodedInWriter: false,
  trustedAuthorityIntegrated: false,
  postSavePersistenceIntegrated: false,
  productionReady: false,
} as const);

const BLOCKED_CLAIMS = Object.freeze({
  actualProductionWriterInvoked: false as const,
  callerSuppliedWriterBytesAccepted: false as const,
  callerSuppliedExportShaAccepted: false as const,
  writerPlanDerivedFromExactG4f1Composition: false as const,
  writerGeometryMatchesG4f1Composition: false as const,
  writerBytesShaBound: false as const,
  mappingSealBound: false as const,
  mappingSemanticallyEncodedInWriter: false as const,
  rawWriterBytesExposed: false as const,
  trustedAuthorityIntegrated: false as const,
  postSavePersistenceIntegrated: false as const,
  productionReady: false as const,
});

class ExportBindingFailure extends Error {
  constructor(
    readonly code: PatternImportDxfWriterByteExportBlockerCodeV1,
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(
  code: PatternImportDxfWriterByteExportBlockerCodeV1,
  field: string,
  detail: string,
): never {
  throw new ExportBindingFailure(code, field, detail);
}

function boundedText(value: string): string {
  if (textEncoder.encode(value).byteLength <= MAX_DETAIL_BYTES) return value;
  let output = '';
  for (const scalar of value) {
    if (textEncoder.encode(`${output}${scalar}…`).byteLength > MAX_DETAIL_BYTES) break;
    output += scalar;
  }
  return `${output}…`;
}

function blocked(error: unknown): PatternImportDxfWriterByteExportBindingResultV1 {
  const known = error instanceof ExportBindingFailure;
  return deepFreeze({
    ok: false as const,
    receipt: null,
    seal: null,
    blockers: [
      {
        code: known ? error.code : ('invalid-input' as const),
        field: boundedText(known ? error.field : 'input'),
        detail: boundedText(
          known
            ? error.message
            : 'Writer-byte export binding rejected inaccessible, hostile, or inconsistent input.',
        ),
      },
    ].slice(0, MAX_BLOCKERS),
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

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

/** Descriptor-only clone acquired after the global claim, rejecting holes, aliases and cycles. */
function snapshotPlainData(value: unknown): unknown {
  const seen = new Set<object>();
  let nodes = 0;
  let textBytes = 0;

  const visit = (current: unknown, path: string, depth: number): unknown => {
    nodes += 1;
    if (nodes > MAX_NODES) fail('bounds-exceeded', path, 'input node bound exceeded.');
    if (depth > MAX_DEPTH) fail('bounds-exceeded', path, 'input depth bound exceeded.');
    if (current === null || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0))
        fail('invalid-input', path, 'numbers must be finite canonical values.');
      return current;
    }
    if (typeof current === 'string') {
      if (!wellFormed(current)) fail('invalid-input', path, 'string must be well-formed UTF-16.');
      const bytes = textEncoder.encode(current).byteLength;
      textBytes += bytes;
      if (bytes > MAX_TEXT_BYTES || textBytes > MAX_TOTAL_TEXT_BYTES)
        fail('bounds-exceeded', path, 'input text bound exceeded.');
      return current;
    }
    if (!current || typeof current !== 'object')
      fail('invalid-input', path, 'contains a non-data value.');
    if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer)
      fail('invalid-input', path, 'binary buffers are not accepted.');
    if (seen.has(current)) fail('invalid-input', path, 'contains an alias or cycle.');
    seen.add(current);

    let prototype: object | null;
    let descriptors: PropertyDescriptorMap;
    let keys: readonly PropertyKey[];
    try {
      prototype = Object.getPrototypeOf(current);
      descriptors = Object.getOwnPropertyDescriptors(current);
      keys = Reflect.ownKeys(descriptors);
    } catch {
      fail('invalid-input', path, 'reflection failed.');
    }

    if (Array.isArray(current)) {
      if (prototype !== Array.prototype) fail('invalid-input', path, 'must use Array.prototype.');
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH)
        fail('bounds-exceeded', path, 'array length bound exceeded.');
      if (keys.length !== length + 1 || keys.some((key) => typeof key === 'symbol'))
        fail('invalid-input', path, 'array contains holes, symbols, or extra properties.');
      const output: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          !descriptor ||
          !descriptor.enumerable ||
          !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.get !== undefined ||
          descriptor.set !== undefined
        )
          fail('invalid-input', `${path}[${index}]`, 'must be a dense enumerable data property.');
        output.push(visit(descriptor.value, `${path}[${index}]`, depth + 1));
      }
      return output;
    }

    if (prototype !== Object.prototype) fail('invalid-input', path, 'must use Object.prototype.');
    if (keys.length > MAX_RECORD_KEYS) fail('bounds-exceeded', path, 'record key bound exceeded.');
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== 'string') fail('invalid-input', path, 'symbol properties are forbidden.');
      const descriptor = descriptors[key];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      )
        fail('invalid-input', `${path}.${key}`, 'must be an enumerable data property.');
      output[key] = visit(descriptor.value, `${path}.${key}`, depth + 1);
    }
    return output;
  };

  return visit(value, 'input', 0);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-input', field, 'must be an exact record.');
  const actual = Object.keys(value).sort(compareCodeUnits);
  const expected = [...expectedKeys].sort(compareCodeUnits);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index]))
    fail('invalid-input', field, `must have exact keys: ${expected.join(', ')}.`);
  return value as Record<string, unknown>;
}

function stableString(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    !STABLE_ID.test(value) ||
    textEncoder.encode(value).byteLength > 256
  )
    fail('invalid-input', field, 'must be a bounded stable identifier.');
  return value;
}

function displayString(value: unknown, field: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    textEncoder.encode(value).byteLength > 1_024 ||
    Array.from(value).some((scalar) => {
      const code = scalar.codePointAt(0) ?? 0;
      return code <= 0x1f || code === 0x7f;
    })
  )
    fail('invalid-input', field, 'must be bounded non-empty display text without controls.');
  return value;
}

function scopeSupplement(value: unknown): PatternImportDxfWriterScopeSupplementV1 {
  const record = exactRecord(
    value,
    ['scopeKey', 'fabricPurpose', 'bomLineKey', 'label', 'isInterlining', 'sections'],
    'input.writerScope',
  );
  if (typeof record.isInterlining !== 'boolean')
    fail('invalid-input', 'input.writerScope.isInterlining', 'must be boolean.');
  if (!Array.isArray(record.sections) || record.sections.length > 32)
    fail('bounds-exceeded', 'input.writerScope.sections', 'must contain at most 32 sections.');
  return deepFreeze({
    scopeKey: stableString(record.scopeKey, 'input.writerScope.scopeKey'),
    fabricPurpose: stableString(record.fabricPurpose, 'input.writerScope.fabricPurpose'),
    bomLineKey: stableString(record.bomLineKey, 'input.writerScope.bomLineKey'),
    label: displayString(record.label, 'input.writerScope.label'),
    isInterlining: record.isInterlining,
    sections: record.sections.map((section, index) =>
      stableString(section, `input.writerScope.sections[${index}]`),
    ),
  });
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
  field: string,
): Promise<string> {
  let digest: Uint8Array;
  try {
    digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  } catch {
    fail('sha256-unavailable', field, 'SHA-256 digest failed.');
  }
  if (digest.byteLength !== 32)
    fail('sha256-unavailable', field, 'SHA-256 returned an invalid digest.');
  return hex(digest);
}

function sortedMaterials(
  materials: readonly DxfMaterialAssignmentV1[],
): PatternImportDxfWriterByteExportReceiptV1['materials'] {
  return materials
    .map(({ id, materialRevision }) => ({ materialId: id, materialRevision }))
    .sort(
      (left, right) =>
        compareCodeUnits(left.materialId, right.materialId) ||
        compareCodeUnits(left.materialRevision, right.materialRevision),
    );
}

function exactWriterPlan(
  pieces: readonly PieceSpec[],
  scope: DraftScopeTarget,
  mappedPieceIds: readonly string[],
): ReturnType<typeof planBlocks> {
  const expectedPieceIds = [...mappedPieceIds].sort(compareCodeUnits);
  const compositionPieceIds = pieces.map(({ identity }) => identity).sort(compareCodeUnits);
  if (
    expectedPieceIds.length !== compositionPieceIds.length ||
    expectedPieceIds.some((pieceId, index) => pieceId !== compositionPieceIds[index])
  )
    fail(
      'writer-scope-mismatch',
      'mapping.scope.pieceIds',
      'G4F1 mapping scope must cover every exact composition piece once.',
    );
  const selected = pieces.filter((piece) => pieceInScope(piece, scope));
  const selectedIds = selected.map(({ identity }) => identity).sort(compareCodeUnits);
  if (
    selectedIds.length !== compositionPieceIds.length ||
    selectedIds.some((pieceId, index) => pieceId !== compositionPieceIds[index])
  )
    fail(
      'writer-scope-mismatch',
      'input.writerScope',
      'writer scope must select every G4F1 composition piece and no unrelated piece.',
    );

  const expectedBlocks = new Set<string>();
  for (const piece of pieces) {
    if (piece.sizes.length === 0)
      fail('writer-plan-blocked', `pieces.${piece.identity}.sizes`, 'piece has no writer size.');
    if (piece.ungraded && piece.sizes.length !== 1)
      fail(
        'writer-plan-blocked',
        `pieces.${piece.identity}.sizes`,
        'multi-size ungraded pieces would omit selected G4F1 size records.',
      );
    for (const size of piece.sizes) {
      const key = `${piece.identity}\0${piece.ungraded ? 'UNI' : size.sizeToken}`;
      if (expectedBlocks.has(key))
        fail('writer-plan-blocked', 'pieces', 'duplicate piece/size writer identity.');
      expectedBlocks.add(key);
      if (expectedBlocks.size > MAX_WRITER_BLOCKS)
        fail('bounds-exceeded', 'pieces', 'writer block count bound exceeded.');
    }
  }

  const warnings: string[] = [];
  const plan = planBlocks([...pieces], scope, warnings);
  if (warnings.length > 0)
    fail(
      'writer-plan-blocked',
      'writer.plan',
      `production planner reported: ${warnings.join('; ')}`,
    );
  const actualBlocks = new Set<string>();
  for (const block of plan.blocks) {
    if (block.derivedFrom !== null)
      fail('writer-plan-blocked', 'writer.plan', 'derived mirror blocks are outside G4F2.');
    const key = `${block.identity}\0${block.sizeToken}`;
    if (actualBlocks.has(key))
      fail('writer-plan-blocked', 'writer.plan', 'duplicate planned piece/size block.');
    actualBlocks.add(key);
  }
  if (
    actualBlocks.size !== expectedBlocks.size ||
    [...expectedBlocks].some((key) => !actualBlocks.has(key))
  )
    fail(
      'writer-plan-blocked',
      'writer.plan',
      'production planner omitted or added a G4F1 piece/size block.',
    );
  let emittedGeometryPoints = 0;
  for (const block of plan.blocks) {
    emittedGeometryPoints +=
      block.cut.length +
      block.cutLoops.reduce((sum, loop) => sum + loop.length, 0) +
      (block.seam?.length ?? 0) +
      block.internal.reduce((sum, feature) => sum + feature.pts.length, 0) +
      block.drills.reduce((sum, drill) => sum + (drill.form === 'circle' ? 20 : 4), 0) +
      (block.grain ? 3 : 0) +
      block.notches.length * 2;
    if (emittedGeometryPoints > MAX_EMITTED_GEOMETRY_POINTS)
      fail('bounds-exceeded', 'writer.plan', 'emitted geometry point bound exceeded.');
  }
  return plan;
}

let claimed = false;

export async function buildPatternImportDxfWriterByteExportBindingV1(
  inputValue: unknown,
  cryptoCandidate: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfWriterByteExportBindingResultV1> {
  if (claimed)
    return blocked(
      new ExportBindingFailure('reentrant-call', 'input', 'reentrant G4F2 binding refused.'),
    );
  claimed = true;
  try {
    const snapshot = exactRecord(
      snapshotPlainData(inputValue),
      ['schemaVersion', 'mappingInput', 'expected', 'writerScope'],
      'input',
    );
    if (snapshot.schemaVersion !== PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_BINDING_V1)
      fail('invalid-input', 'input.schemaVersion', 'schema version is unsupported.');
    const expected = exactRecord(
      snapshot.expected,
      ['mappingSealSha256', 'documentId', 'revision'],
      'input.expected',
    );
    const expectedMappingSeal = stableString(
      expected.mappingSealSha256,
      'input.expected.mappingSealSha256',
    );
    if (!SHA256.test(expectedMappingSeal))
      fail('invalid-input', 'input.expected.mappingSealSha256', 'must be lowercase SHA-256.');
    const expectedDocumentId = stableString(expected.documentId, 'input.expected.documentId');
    const expectedRevision = stableString(expected.revision, 'input.expected.revision');
    const writerScope = scopeSupplement(snapshot.writerScope);
    const crypto = await checkedCrypto(cryptoCandidate);

    const mappingInput = snapshot.mappingInput as PatternImportDxfTwoSidedSeamMappingInputV2;
    const mappingResult = await buildPatternImportDxfTwoSidedSeamMappingV2(mappingInput, crypto);
    if (!mappingResult.ok)
      fail(
        'g4f1-blocked',
        'input.mappingInput',
        mappingResult.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
      );
    if (mappingResult.seal.canonicalSha256 !== expectedMappingSeal)
      fail(
        'mapping-seal-mismatch',
        'input.expected.mappingSealSha256',
        'expected mapping seal does not equal the fresh G4F1 seal.',
      );
    if (
      mappingResult.mapping.sourceBinding.documentId !== expectedDocumentId ||
      mappingResult.mapping.sourceBinding.revision !== expectedRevision
    )
      fail(
        'source-binding-mismatch',
        'input.expected',
        'document or revision does not equal the fresh G4F1 source binding.',
      );

    const mappingRecord = exactRecord(
      mappingInput,
      ['schemaVersion', 'base', 'phaseD'],
      'input.mappingInput',
    );
    const base = exactRecord(
      mappingRecord.base,
      ['schemaVersion', 'composition', 'expected', 'scopes', 'seamId', 'tolerance'],
      'input.mappingInput.base',
    );
    const composition = exactRecord(
      base.composition,
      [
        'schemaVersion',
        'sourceFileId',
        'pipeline',
        'manifest',
        'pieces',
        'binding',
        'physicalSurface',
        'seams',
        'operations',
        'materials',
      ],
      'input.mappingInput.base.composition',
    );
    const pieces = composition.pieces as readonly PieceSpec[];
    const materials = composition.materials as readonly DxfMaterialAssignmentV1[];
    const plan = exactWriterPlan(
      pieces,
      writerScope as DraftScopeTarget,
      mappingResult.mapping.scope.pieceIds,
    );

    let writerText: string;
    try {
      writerText = writeR2000(plan.blocks);
    } catch {
      fail('writer-output-invalid', 'writer', 'production R2000 writer failed.');
    }
    if (!isAsciiDxf(writerText))
      fail('writer-output-invalid', 'writer', 'R2000 writer output must be exact ASCII bytes.');
    const writerBytes = textEncoder.encode(writerText);
    if (writerBytes.byteLength === 0 || writerBytes.byteLength > MAX_WRITER_BYTES)
      fail('bounds-exceeded', 'writer.bytes', 'writer byte bound exceeded.');

    const exportSha256 = await sha256(crypto, writerBytes, 'writer.exportSha256');
    const receipt: PatternImportDxfWriterByteExportReceiptV1 = deepFreeze({
      schemaVersion: PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1,
      mapping: {
        version: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_V2,
        sealVersion: PATTERN_IMPORT_DXF_TWO_SIDED_SEAM_MAPPING_SEAL_V2,
        canonicalSha256: mappingResult.seal.canonicalSha256,
      },
      source: {
        documentId: mappingResult.mapping.sourceBinding.documentId,
        revision: mappingResult.mapping.sourceBinding.revision,
      },
      assembly: {
        revisionSha256: mappingResult.mapping.sourceBinding.handoffCanonicalSha256,
      },
      materials: sortedMaterials(materials),
      writerScope,
      writer: {
        id: PATTERN_IMPORT_DXF_R2000_WRITER_ID_V1,
        version: PATTERN_IMPORT_DXF_R2000_WRITER_VERSION_V1,
        format: PATTERN_IMPORT_DXF_R2000_FORMAT_V1,
        byteEncoding: 'ASCII-CRLF' as const,
        exportSha256,
        byteLength: writerBytes.byteLength,
        blockCount: plan.blocks.length,
      },
    });
    const canonicalBytes = textEncoder.encode(
      `pattern-import-dxf-writer-byte-export-receipt-v1\0${canonical(receipt)}`,
    );
    if (canonicalBytes.byteLength > MAX_WRITER_BYTES)
      fail('bounds-exceeded', 'receipt', 'canonical receipt byte bound exceeded.');
    const seal: PatternImportDxfWriterByteExportSealV1 = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_SEAL_V1,
      algorithm: 'SHA-256' as const,
      canonicalSha256: await sha256(crypto, canonicalBytes, 'receipt.seal'),
      sealedReceiptVersion: PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_RECEIPT_V1,
      authority: 'unsigned-in-memory-consistency-only' as const,
    });
    return deepFreeze({
      ok: true as const,
      receipt,
      seal,
      blockers: [] as const,
      claims: PATTERN_IMPORT_DXF_WRITER_BYTE_EXPORT_CLAIMS_V1,
    });
  } catch (error) {
    return blocked(error);
  } finally {
    claimed = false;
  }
}
