import {
  decodeDxfGarmentPhysicalInitializationV1,
  fingerprintDxfExactAssemblyGraphV1,
  type DxfGarmentPhysicalInitializationV1,
} from 'lib/cloth/domain/dxf-garment-physical-initialization-v1';
import type {
  DxfExactAssemblyGraphAoSnapshotV1,
  DxfExactAssemblyGraphV1,
} from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { SavedFullAssemblySnapshotProjectionV1 } from './saved-full-assembly-snapshot-production-v1';

export const SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_V1 =
  'saved-full-assembly-physical-component/1' as const;
export const SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_KIND_V1 =
  'saved-full-assembly-physical-v1' as const;
export const SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1 =
  'application/vnd.grbpwr.saved-full-assembly-physical.v1+json' as const;
export const DXF_GARMENT_PHYSICAL_INITIALIZATION_MEDIA_TYPE_V1 =
  'application/vnd.grbpwr.dxf-garment-physical-initialization.v1+json' as const;
export const SAVED_FULL_ASSEMBLY_PHYSICAL_AO_CONTENT_DOMAIN_V1 =
  'saved-full-assembly-physical-ao-content/1' as const;
export const SAVED_FULL_ASSEMBLY_PHYSICAL_ZERO_ALLOWANCE_PROFILE_V1 =
  'saved-full-assembly-physical/sewing-surface-zero-allowance/1' as const;
export const SAVED_FULL_ASSEMBLY_PHYSICAL_NATIVE_SEWING_PROFILE_V1 =
  'saved-full-assembly-physical/native-drawn-sewing/1' as const;

function physicalProfileForGraph(graph: DxfExactAssemblyGraphV1) {
  const source = graph.source?.handoffSource;
  if (source?.exporterId !== 'grbpwr.saved-native-drawn-sewing')
    return SAVED_FULL_ASSEMBLY_PHYSICAL_ZERO_ALLOWANCE_PROFILE_V1;
  if (source.exportSha256 !== graph.row.sha256 || graph.source.nativeDxfSha256 !== graph.row.sha256)
    fail('native-sewing-source-mismatch', 'Native sewing source must bind the original saved DXF.');
  return SAVED_FULL_ASSEMBLY_PHYSICAL_NATIVE_SEWING_PROFILE_V1;
}

export const SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_CLAIMS_V1 = Object.freeze({
  completeGraphPersisted: true,
  allPiecePhysicalInitializationPersisted: true,
  exactSavedRowBound: true,
  exactServerAssemblyRevisionBound: true,
  completeAssemblyOrderContentBound: true,
  physicalSurface: 'sewing-surface',
  seamAllowancePhysical: false,
  support: 'none',
  replayProfile: 'garment-material-contact-replay/1',
  contentConsistencyOnly: true,
  productAuthority: false,
  runtimeAuthority: false,
} as const);

export type SavedFullAssemblyPhysicalComponentBindingsV1 = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  serverAssemblyRevision: string;
  aoContentSha256: string;
}>;

export type SavedFullAssemblyPhysicalComponentDocumentV1 = Readonly<{
  schemaVersion: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_V1;
  mediaType: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1;
  encoding: 'canonical-json-utf8';
  profile:
    | typeof SAVED_FULL_ASSEMBLY_PHYSICAL_ZERO_ALLOWANCE_PROFILE_V1
    | typeof SAVED_FULL_ASSEMBLY_PHYSICAL_NATIVE_SEWING_PROFILE_V1;
  bindings: SavedFullAssemblyPhysicalComponentBindingsV1;
  graph: DxfExactAssemblyGraphV1;
  graphCanonicalSha256: string;
  compileInputSha256: string;
  physicalInitialization: Readonly<{
    mediaType: typeof DXF_GARMENT_PHYSICAL_INITIALIZATION_MEDIA_TYPE_V1;
    canonicalSha256: string;
    canonicalByteLength: number;
    base64: string;
  }>;
  savedSourceReplay: Readonly<{
    physicalSurface: Readonly<{ mode: 'sewing-surface'; seamAllowancePhysical: false }>;
    support: 'none';
    replayProfile: 'garment-material-contact-replay/1';
  }>;
  claims: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_CLAIMS_V1;
}>;

export type SavedFullAssemblyPhysicalComponentRequestV1 = Readonly<{
  bindings: Readonly<{
    row: DxfProductSavedRowIdentityV1;
    serverAssemblyRevision: string;
  }>;
  graph: DxfExactAssemblyGraphV1;
  graphCanonicalSha256: string;
  compileInputSha256: string;
  physicalInitializationBytes: Uint8Array;
  assemblySnapshot: SavedFullAssemblySnapshotProjectionV1;
}>;

declare const ownerBrand: unique symbol;
export type SavedFullAssemblyPhysicalComponentOwnerV1 = Readonly<{
  schemaVersion: typeof SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_V1;
  document: SavedFullAssemblyPhysicalComponentDocumentV1;
  canonicalSha256: string;
  canonicalByteLength: number;
  readonly [ownerBrand]: never;
}>;

export type SavedFullAssemblyPhysicalComponentResultV1 =
  | Readonly<{
      ok: true;
      owner: SavedFullAssemblyPhysicalComponentOwnerV1;
      document: SavedFullAssemblyPhysicalComponentDocumentV1;
      physicalInitialization: DxfGarmentPhysicalInitializationV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      owner: null;
      document: null;
      physicalInitialization: null;
      blockers: readonly [Readonly<{ code: string; detail: string }>];
    }>;

export type SavedFullAssemblyPhysicalComponentEnvelopeResultV1 =
  | Readonly<{
      ok: true;
      document: SavedFullAssemblyPhysicalComponentDocumentV1;
      bytes: Uint8Array<ArrayBuffer>;
      physicalInitializationBytes: Uint8Array<ArrayBuffer>;
      canonicalSha256: string;
      durableAuthority: false;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      document: null;
      bytes: null;
      physicalInitializationBytes: null;
      canonicalSha256: null;
      durableAuthority: false;
      blockers: readonly [Readonly<{ code: string; detail: string }>];
    }>;

type OwnerState = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  physicalBytes: Uint8Array<ArrayBuffer>;
}>;

const ownerStates = new WeakMap<object, OwnerState>();
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_COMPONENT_BYTES = 4 * 1024 * 1024;
const MAX_PHYSICAL_BYTES = 256 * 1024;

class ComponentFailure extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(detail.slice(0, 2_048));
  }
}

function fail(code: string, detail: string): never {
  throw new ComponentFailure(code, detail);
}

function check(signal?: AbortSignal): void {
  if (signal?.aborted) fail('cancelled', 'Full Assembly physical component operation cancelled.');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('invalid-shape', `${field} must be a plain record.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    actual.length !== keys.length ||
    actual.some((key) => typeof key !== 'string' || !keys.includes(key)) ||
    keys.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !('value' in descriptor) || !descriptor.enumerable;
    })
  )
    fail('invalid-shape', `${field} fields differ from the registered contract.`);
  return value as Record<string, unknown>;
}

function same(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right);
}

function validateRow(value: unknown, field: string): DxfProductSavedRowIdentityV1 {
  const row = exactRecord(
    value,
    [
      'techCardId',
      'scopeKey',
      'patternLineKey',
      'revision',
      'cardLockVersion',
      'url',
      'sizeBytes',
      'sha256',
    ],
    field,
  );
  if (
    !Number.isSafeInteger(row.techCardId) ||
    (row.techCardId as number) <= 0 ||
    !Number.isSafeInteger(row.revision) ||
    (row.revision as number) <= 0 ||
    !Number.isSafeInteger(row.cardLockVersion) ||
    (row.cardLockVersion as number) < 0 ||
    !Number.isSafeInteger(row.sizeBytes) ||
    (row.sizeBytes as number) <= 0 ||
    typeof row.scopeKey !== 'string' ||
    !row.scopeKey ||
    typeof row.patternLineKey !== 'string' ||
    !row.patternLineKey ||
    typeof row.url !== 'string' ||
    !row.url ||
    typeof row.sha256 !== 'string' ||
    !SHA256.test(row.sha256)
  )
    fail('invalid-row', `${field} is not an exact saved-row identity.`);
  return row as DxfProductSavedRowIdentityV1;
}

function copyBytes(value: unknown, max: number, field: string): Uint8Array<ArrayBuffer> {
  if (!value || Object.getPrototypeOf(value) !== Uint8Array.prototype)
    fail('invalid-bytes', `${field} must be an exact Uint8Array.`);
  const bytes = Uint8Array.from(value as Uint8Array);
  if (!bytes.byteLength || bytes.byteLength > max)
    fail('bounds', `${field} exceeds its registered bound.`);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function decodeBase64(value: unknown, expectedLength: number): Uint8Array<ArrayBuffer> {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(MAX_PHYSICAL_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  )
    fail('invalid-base64', 'Physical initialization must use canonical bounded base64.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    fail('invalid-base64', 'Physical initialization base64 cannot be decoded.');
  }
  if (
    btoa(binary) !== value ||
    binary.length !== expectedLength ||
    binary.length > MAX_PHYSICAL_BYTES
  )
    fail('invalid-base64', 'Physical initialization base64 length or pad bits differ.');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function digest(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  check(signal);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  check(signal);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintSavedFullAssemblyAoContentV1(
  snapshot: SavedFullAssemblySnapshotProjectionV1,
  signal?: AbortSignal,
): Promise<string> {
  check(signal);
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    typeof snapshot.operationsPayloadCanonicalJson !== 'string' ||
    !Array.isArray(snapshot.selectedTopologyReceipts)
  )
    fail('invalid-assembly-snapshot', 'A complete fixed-read Assembly Order snapshot is required.');
  const payload = {
    row: validateRow(snapshot.row, 'assemblySnapshot.row'),
    serverAssemblyRevision: snapshot.serverAssemblyRevision,
    operationsPayloadCanonicalJson: snapshot.operationsPayloadCanonicalJson,
    selectedTopologyReceipts: snapshot.selectedTopologyReceipts.map((receipt) => ({
      sourceOperationNumber: receipt.sourceOperationNumber,
      sha256: receipt.sha256,
      canonicalJson: receipt.canonicalJson,
    })),
  };
  return digest(
    encoder.encode(`${SAVED_FULL_ASSEMBLY_PHYSICAL_AO_CONTENT_DOMAIN_V1}\0${canonical(payload)}`),
    signal,
  );
}

function validateDocumentShape(value: unknown): SavedFullAssemblyPhysicalComponentDocumentV1 {
  const document = exactRecord(
    value,
    [
      'schemaVersion',
      'mediaType',
      'encoding',
      'profile',
      'bindings',
      'graph',
      'graphCanonicalSha256',
      'compileInputSha256',
      'physicalInitialization',
      'savedSourceReplay',
      'claims',
    ],
    'document',
  );
  if (
    document.schemaVersion !== SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_V1 ||
    document.mediaType !== SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1 ||
    document.encoding !== 'canonical-json-utf8' ||
    (document.profile !== SAVED_FULL_ASSEMBLY_PHYSICAL_ZERO_ALLOWANCE_PROFILE_V1 &&
      document.profile !== SAVED_FULL_ASSEMBLY_PHYSICAL_NATIVE_SEWING_PROFILE_V1) ||
    !SHA256.test(String(document.graphCanonicalSha256)) ||
    !SHA256.test(String(document.compileInputSha256)) ||
    !same(document.claims, SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_CLAIMS_V1)
  )
    fail('unsupported-schema', 'Full Assembly physical component schema or claims differ.');
  const bindings = exactRecord(
    document.bindings,
    ['row', 'serverAssemblyRevision', 'aoContentSha256'],
    'document.bindings',
  );
  validateRow(bindings.row, 'document.bindings.row');
  if (document.profile !== physicalProfileForGraph(document.graph as DxfExactAssemblyGraphV1))
    fail('physical-profile-mismatch', 'Physical profile differs from the saved graph source.');
  if (
    typeof bindings.serverAssemblyRevision !== 'string' ||
    !bindings.serverAssemblyRevision ||
    typeof bindings.aoContentSha256 !== 'string' ||
    !SHA256.test(bindings.aoContentSha256)
  )
    fail('invalid-bindings', 'Full Assembly physical bindings are invalid.');
  const physical = exactRecord(
    document.physicalInitialization,
    ['mediaType', 'canonicalSha256', 'canonicalByteLength', 'base64'],
    'document.physicalInitialization',
  );
  if (
    physical.mediaType !== DXF_GARMENT_PHYSICAL_INITIALIZATION_MEDIA_TYPE_V1 ||
    typeof physical.canonicalSha256 !== 'string' ||
    !SHA256.test(physical.canonicalSha256) ||
    !Number.isSafeInteger(physical.canonicalByteLength) ||
    (physical.canonicalByteLength as number) <= 0 ||
    (physical.canonicalByteLength as number) > MAX_PHYSICAL_BYTES ||
    typeof physical.base64 !== 'string'
  )
    fail('invalid-physical-initialization', 'Physical initialization metadata is invalid.');
  const replay = exactRecord(
    document.savedSourceReplay,
    ['physicalSurface', 'support', 'replayProfile'],
    'document.savedSourceReplay',
  );
  const surface = exactRecord(
    replay.physicalSurface,
    ['mode', 'seamAllowancePhysical'],
    'document.savedSourceReplay.physicalSurface',
  );
  if (
    surface.mode !== 'sewing-surface' ||
    surface.seamAllowancePhysical !== false ||
    replay.support !== 'none' ||
    replay.replayProfile !== 'garment-material-contact-replay/1'
  )
    fail('invalid-physical-policy', 'Only the declared sewing-surface replay policy is supported.');
  return document as SavedFullAssemblyPhysicalComponentDocumentV1;
}

async function verifyDocument(
  document: SavedFullAssemblyPhysicalComponentDocumentV1,
  snapshot: SavedFullAssemblySnapshotProjectionV1,
  signal?: AbortSignal,
) {
  check(signal);
  const aoSnapshot = projectSavedFullAssemblyAoOnlySnapshotV1(snapshot);
  if (
    !same(document.bindings.row, snapshot.row) ||
    document.bindings.serverAssemblyRevision !== snapshot.serverAssemblyRevision ||
    !same(document.bindings.row, document.graph.row) ||
    document.bindings.serverAssemblyRevision !== document.graph.serverAssemblyRevision
  )
    fail('component-binding-mismatch', 'Graph, Assembly Order and saved-row bindings differ.');
  const aoContentSha256 = await fingerprintSavedFullAssemblyAoContentV1(snapshot, signal);
  if (document.bindings.aoContentSha256 !== aoContentSha256)
    fail('assembly-order-digest-mismatch', 'Complete Assembly Order content digest differs.');
  const fingerprint = await fingerprintDxfExactAssemblyGraphV1(
    { graph: document.graph, assemblySnapshot: aoSnapshot },
    signal,
  );
  if (fingerprint.canonicalSha256 !== document.graphCanonicalSha256)
    fail('graph-digest-mismatch', 'Complete graph fingerprint differs.');
  const physicalBytes = decodeBase64(
    document.physicalInitialization.base64,
    document.physicalInitialization.canonicalByteLength,
  );
  if ((await digest(physicalBytes, signal)) !== document.physicalInitialization.canonicalSha256)
    fail('physical-digest-mismatch', 'Physical initialization digest differs from its bytes.');
  const physical = await decodeDxfGarmentPhysicalInitializationV1(
    { bytes: physicalBytes, graph: document.graph, assemblySnapshot: aoSnapshot },
    signal,
  );
  if (
    physical.canonicalSha256 !== document.physicalInitialization.canonicalSha256 ||
    physical.document.graphCanonicalSha256 !== document.graphCanonicalSha256 ||
    physical.document.compileInputSha256 !== document.compileInputSha256 ||
    physical.document.support !== document.savedSourceReplay.support ||
    physical.document.replayProfile !== document.savedSourceReplay.replayProfile
  )
    fail('physical-binding-mismatch', 'Physical initialization duplicate bindings differ.');
  return Object.freeze({
    graph: fingerprint.graph,
    physicalInitialization: physical.document,
    physicalBytes: physicalBytes.slice(),
  });
}

export function projectSavedFullAssemblyAoOnlySnapshotV1(
  snapshot: SavedFullAssemblySnapshotProjectionV1,
): DxfExactAssemblyGraphAoSnapshotV1 {
  return {
    row: structuredClone(snapshot.row),
    serverAssemblyRevision: snapshot.serverAssemblyRevision,
    operations: structuredClone(snapshot.operations),
    seams: structuredClone(snapshot.seams),
  };
}

function makeOwner(
  document: SavedFullAssemblyPhysicalComponentDocumentV1,
  bytes: Uint8Array<ArrayBuffer>,
  canonicalSha256: string,
  physicalBytes: Uint8Array<ArrayBuffer>,
): SavedFullAssemblyPhysicalComponentOwnerV1 {
  const owner = Object.freeze({
    schemaVersion: SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_V1,
    document,
    canonicalSha256,
    canonicalByteLength: bytes.byteLength,
  }) as SavedFullAssemblyPhysicalComponentOwnerV1;
  ownerStates.set(owner, { bytes: bytes.slice(), physicalBytes: physicalBytes.slice() });
  return owner;
}

function blocked(error: unknown): SavedFullAssemblyPhysicalComponentResultV1 {
  const failure =
    error instanceof ComponentFailure
      ? error
      : new ComponentFailure(
          'invalid-component',
          error instanceof Error ? error.message : 'Invalid component.',
        );
  return Object.freeze({
    ok: false as const,
    owner: null,
    document: null,
    physicalInitialization: null,
    blockers: Object.freeze([
      Object.freeze({ code: failure.code, detail: failure.message }),
    ]) as readonly [Readonly<{ code: string; detail: string }>],
  });
}

export async function buildSavedFullAssemblyPhysicalComponentV1(
  input: SavedFullAssemblyPhysicalComponentRequestV1,
  signal?: AbortSignal,
): Promise<SavedFullAssemblyPhysicalComponentResultV1> {
  try {
    check(signal);
    const physicalBytes = copyBytes(
      input.physicalInitializationBytes,
      MAX_PHYSICAL_BYTES,
      'request.physicalInitializationBytes',
    );
    const aoContentSha256 = await fingerprintSavedFullAssemblyAoContentV1(
      input.assemblySnapshot,
      signal,
    );
    const document = deepFreeze({
      schemaVersion: SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_V1,
      mediaType: SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1,
      encoding: 'canonical-json-utf8' as const,
      profile: physicalProfileForGraph(input.graph),
      bindings: {
        row: structuredClone(validateRow(input.bindings.row, 'request.bindings.row')),
        serverAssemblyRevision: input.bindings.serverAssemblyRevision,
        aoContentSha256,
      },
      graph: structuredClone(input.graph),
      graphCanonicalSha256: input.graphCanonicalSha256,
      compileInputSha256: input.compileInputSha256,
      physicalInitialization: {
        mediaType: DXF_GARMENT_PHYSICAL_INITIALIZATION_MEDIA_TYPE_V1,
        canonicalSha256: await digest(physicalBytes, signal),
        canonicalByteLength: physicalBytes.byteLength,
        base64: encodeBase64(physicalBytes),
      },
      savedSourceReplay: {
        physicalSurface: { mode: 'sewing-surface' as const, seamAllowancePhysical: false as const },
        support: 'none' as const,
        replayProfile: 'garment-material-contact-replay/1' as const,
      },
      claims: SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_CLAIMS_V1,
    } satisfies SavedFullAssemblyPhysicalComponentDocumentV1);
    validateDocumentShape(document);
    const verified = await verifyDocument(document, input.assemblySnapshot, signal);
    const bytes = encoder.encode(canonical(document));
    if (bytes.byteLength > MAX_COMPONENT_BYTES)
      fail('bounds', 'Full Assembly physical component exceeds the Composite transport bound.');
    const canonicalSha256 = await digest(bytes, signal);
    const owner = makeOwner(document, bytes, canonicalSha256, verified.physicalBytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document,
      physicalInitialization: verified.physicalInitialization,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return blocked(error);
  }
}

export async function decodeSavedFullAssemblyPhysicalComponentV1(
  input: unknown,
  assemblySnapshot: SavedFullAssemblySnapshotProjectionV1,
  signal?: AbortSignal,
): Promise<SavedFullAssemblyPhysicalComponentResultV1> {
  try {
    const envelope = await inspectSavedFullAssemblyPhysicalComponentEnvelopeV1(input, signal);
    if (!envelope.ok)
      throw new ComponentFailure(envelope.blockers[0].code, envelope.blockers[0].detail);
    const { document, bytes: canonicalBytes } = envelope;
    const verified = await verifyDocument(document, assemblySnapshot, signal);
    const frozen = deepFreeze(structuredClone(document));
    const canonicalSha256 = await digest(canonicalBytes, signal);
    const owner = makeOwner(frozen, canonicalBytes, canonicalSha256, verified.physicalBytes);
    return Object.freeze({
      ok: true as const,
      owner,
      document: frozen,
      physicalInitialization: verified.physicalInitialization,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    return blocked(error);
  }
}

/**
 * Structural registry decode only. It verifies canonical component bytes and their embedded
 * physical byte digest, but deliberately cannot authenticate a saved AO read or mint authority.
 */
export async function inspectSavedFullAssemblyPhysicalComponentEnvelopeV1(
  input: unknown,
  signal?: AbortSignal,
): Promise<SavedFullAssemblyPhysicalComponentEnvelopeResultV1> {
  try {
    const bytes = copyBytes(input, MAX_COMPONENT_BYTES, 'componentBytes');
    let parsed: unknown;
    try {
      parsed = JSON.parse(decoder.decode(bytes));
    } catch {
      fail('invalid-json', 'Full Assembly physical component JSON is invalid.');
    }
    const document = validateDocumentShape(parsed);
    const canonicalBytes = encoder.encode(canonical(document));
    if (
      bytes.byteLength !== canonicalBytes.byteLength ||
      bytes.some((value, index) => value !== canonicalBytes[index])
    )
      fail('noncanonical-bytes', 'Full Assembly physical component bytes are not canonical.');
    if (
      !same(document.bindings.row, document.graph.row) ||
      document.bindings.serverAssemblyRevision !== document.graph.serverAssemblyRevision
    )
      fail('component-binding-mismatch', 'Embedded graph and component bindings differ.');
    const physicalInitializationBytes = decodeBase64(
      document.physicalInitialization.base64,
      document.physicalInitialization.canonicalByteLength,
    );
    if (
      (await digest(physicalInitializationBytes, signal)) !==
      document.physicalInitialization.canonicalSha256
    )
      fail('physical-digest-mismatch', 'Physical initialization digest differs from its bytes.');
    return Object.freeze({
      ok: true as const,
      document: deepFreeze(structuredClone(document)),
      bytes: canonicalBytes.slice(),
      physicalInitializationBytes: physicalInitializationBytes.slice(),
      canonicalSha256: await digest(canonicalBytes, signal),
      durableAuthority: false as const,
      blockers: Object.freeze([]) as readonly [],
    });
  } catch (error) {
    const result = blocked(error);
    return Object.freeze({
      ok: false as const,
      document: null,
      bytes: null,
      physicalInitializationBytes: null,
      canonicalSha256: null,
      durableAuthority: false as const,
      blockers: result.blockers as readonly [Readonly<{ code: string; detail: string }>],
    });
  }
}

export function encodeSavedFullAssemblyPhysicalComponentV1(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object')
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const state = ownerStates.get(candidate);
  if (!state)
    return Object.freeze({ ok: false as const, code: 'invalid-owner' as const, bytes: null });
  const owner = candidate as SavedFullAssemblyPhysicalComponentOwnerV1;
  return Object.freeze({
    ok: true as const,
    bytes: state.bytes.slice(),
    canonicalSha256: owner.canonicalSha256,
    canonicalByteLength: owner.canonicalByteLength,
  });
}

export function readSavedFullAssemblyPhysicalInitializationBytesV1(
  candidate: unknown,
): Uint8Array<ArrayBuffer> | null {
  if (!candidate || typeof candidate !== 'object') return null;
  return ownerStates.get(candidate)?.physicalBytes.slice() ?? null;
}
