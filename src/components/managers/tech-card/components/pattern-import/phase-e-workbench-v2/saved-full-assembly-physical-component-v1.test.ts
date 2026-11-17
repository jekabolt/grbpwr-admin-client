import { describe, expect, it, vi } from 'vitest';

const fingerprintMock = vi.hoisted(() => vi.fn());
const physicalDecodeMock = vi.hoisted(() => vi.fn());

vi.mock('lib/cloth/domain/dxf-garment-physical-initialization-v1', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('lib/cloth/domain/dxf-garment-physical-initialization-v1')
  >()),
  fingerprintDxfExactAssemblyGraphV1: fingerprintMock,
  decodeDxfGarmentPhysicalInitializationV1: physicalDecodeMock,
}));

import {
  SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1,
  buildSavedFullAssemblyPhysicalComponentV1,
  decodeSavedFullAssemblyPhysicalComponentV1,
  encodeSavedFullAssemblyPhysicalComponentV1,
  inspectSavedFullAssemblyPhysicalComponentEnvelopeV1,
} from './saved-full-assembly-physical-component-v1';
import type { DxfExactAssemblyGraphV1 } from 'lib/cloth/domain/dxf-exact-assembly-graph-v1';
import type { SavedFullAssemblySnapshotProjectionV1 } from './saved-full-assembly-snapshot-production-v1';

const encoder = new TextEncoder();
const sha = (character: string) => character.repeat(64);
const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('');

const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 4,
  cardLockVersion: 8,
  url: 'https://media.example.invalid/main.dxf',
  sizeBytes: 4096,
  sha256: sha('a'),
});

const graph = Object.freeze({
  schemaVersion: 'dxf-exact-assembly-graph/1',
  profile: 'single-saved-row-size-adjacent-native-stitch',
  row,
  serverAssemblyRevision: 'asm:r4',
  source: {},
  pieces: [],
  operations: [],
  seams: [],
  compile: {},
}) as unknown as DxfExactAssemblyGraphV1;

const snapshot = Object.freeze({
  row,
  serverAssemblyRevision: 'asm:r4',
  operations: [],
  seams: [],
  operationsPayloadCanonicalJson: '[{"operationNumber":10,"work":"join_lockstitch"}]',
  selectedTopologyReceipts: [
    Object.freeze({ sourceOperationNumber: 10, sha256: sha('d'), canonicalJson: '{"seam":10}' }),
  ],
  outer: Object.freeze({
    status: 'present',
    mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
    sha256: sha('8'),
    byteLength: 4,
    bytes: new Uint8Array([1, 2, 3, 4]),
    persistedCardLockVersion: row.cardLockVersion,
    persistedSavedRowRevision: row.revision,
    currentRowBound: true,
  }),
  snapshotSha256: sha('e'),
  rpcReadCount: 3,
  claims: {},
}) as unknown as SavedFullAssemblySnapshotProjectionV1;

async function build() {
  const physicalBytes = encoder.encode('{"physical":"fixture"}');
  const physicalSha = await digest(physicalBytes);
  const expectAoOnly = (value: unknown) => {
    expect(Object.keys(value as Record<string, unknown>).sort()).toEqual([
      'operations',
      'row',
      'seams',
      'serverAssemblyRevision',
    ]);
    expect((value as Record<string, unknown>).outer).toBeUndefined();
  };
  fingerprintMock.mockImplementation(({ assemblySnapshot }) => {
    expectAoOnly(assemblySnapshot);
    return Promise.resolve({ graph, canonicalSha256: sha('b'), claims: {} });
  });
  physicalDecodeMock.mockImplementation(({ assemblySnapshot }) => {
    expectAoOnly(assemblySnapshot);
    return Promise.resolve({
      canonicalSha256: physicalSha,
      document: {
        graphCanonicalSha256: sha('b'),
        compileInputSha256: sha('c'),
        support: 'none',
        replayProfile: 'garment-material-contact-replay/1',
      },
    });
  });
  return buildSavedFullAssemblyPhysicalComponentV1({
    bindings: { row, serverAssemblyRevision: 'asm:r4' },
    graph,
    graphCanonicalSha256: sha('b'),
    compileInputSha256: sha('c'),
    physicalInitializationBytes: physicalBytes,
    assemblySnapshot: snapshot,
  });
}

describe('Saved Full Assembly physical component V1', () => {
  it('registers deterministic canonical graph and all-piece physical bytes', async () => {
    const result = await build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.mediaType).toBe(SAVED_FULL_ASSEMBLY_PHYSICAL_COMPONENT_MEDIA_TYPE_V1);
    const encoded = encodeSavedFullAssemblyPhysicalComponentV1(result.owner);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const envelope = await inspectSavedFullAssemblyPhysicalComponentEnvelopeV1(encoded.bytes);
    expect(envelope.ok).toBe(true);
    if (!envelope.ok) return;
    expect(envelope.durableAuthority).toBe(false);
    expect(envelope.document.graph).toEqual(graph);

    const verified = await decodeSavedFullAssemblyPhysicalComponentV1(encoded.bytes, snapshot);
    expect(verified.ok).toBe(true);
    expect(physicalDecodeMock).toHaveBeenCalled();
  });

  it('binds durable verification to complete AO wire content, not outer bytes', async () => {
    const result = await build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const encoded = encodeSavedFullAssemblyPhysicalComponentV1(result.owner);
    if (!encoded.ok) return;
    const changed = {
      ...snapshot,
      operationsPayloadCanonicalJson: '[{"operationNumber":10,"work":"topstitch"}]',
    } as SavedFullAssemblySnapshotProjectionV1;
    const decoded = await decodeSavedFullAssemblyPhysicalComponentV1(encoded.bytes, changed);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.blockers[0].code).toBe('assembly-order-digest-mismatch');
  });

  it('does not accept a structural owner lookalike', async () => {
    const result = await build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(encodeSavedFullAssemblyPhysicalComponentV1({ ...result.owner }).ok).toBe(false);
  });
});
