import { describe, expect, it, vi } from 'vitest';

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';

import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
  createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1,
} from './saved-assembly-authority-transport-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1,
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
} from './saved-assembly-topology-hash-v1';

const digest = (character: string) => character.repeat(64);
const row = Object.freeze({
  techCardId: 11,
  scopeKey: 'fabric:main',
  patternLineKey: 'pattern:main',
  revision: 8,
  cardLockVersion: 301,
  url: 'https://media.example.invalid/pants.dxf',
  sizeBytes: 42,
  sha256: digest('a'),
});

const anchor = (pieceLineKey: string) => ({
  pieceLineKey,
  edgeHint: `${pieceLineKey}:edge`,
  rangeFrom: 0,
  rangeTo: 1,
  lenMm: 120,
  contourSig: `${pieceLineKey}:contour`,
  samples: [
    { u: 0, v: 0 },
    { u: 0.25, v: 0 },
    { u: 0.5, v: 0 },
    { u: 0.75, v: 0 },
    { u: 1, v: 0 },
  ],
});

function response() {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
    row,
    selectedOperationNumber: 7,
    serverAssemblyRevision: 'assembly:revision:7',
    serverTopologySha256: digest('b'),
    operations: [
      {
        operationNumber: 7,
        work: 'join_lockstitch',
        inputKeys: ['piece-front', 'piece-back'],
        outputUnitKey: 'unit:7',
        outputUnitName: 'Joined shell',
        seamKeys: ['seam-side'],
      },
    ],
    selectedSeams: [
      {
        seamKey: 'seam-side',
        status: 'confirmed' as const,
        stale: false,
        kind: 'edge' as const,
        direction: 'same' as const,
        source: 'order' as const,
        anchoredSize: 'M',
        sideA: [anchor('piece-front')],
        sideB: [anchor('piece-back')],
      },
    ],
    sidecar: { status: 'legacy' as const, mediaType: 'application/json' },
  };
}

describe('saved Assembly topology transport N=1 admission', () => {
  it('reads one saved seam transactionally while keeping the exact N=2 restore closed', async () => {
    const readSavedAssemblySnapshot = vi.fn(async () => response());
    const computeCanonicalSha256 = vi.fn(async () => digest('b'));
    const decodeAndVerifyExactTopology = vi.fn();
    const adapter = createPatternImportDxfPhaseESavedAssemblyAuthorityTransportAdapterV1({
      readSavedAssemblySnapshot,
      topologyHashContract: {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TOPOLOGY_HASH_CONTRACT_V1,
        domain: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ROW_SERVER_TOPOLOGY_SHA256_DOMAIN_V1,
        computeCanonicalSha256,
      },
      compositeCodecContract: {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_COMPOSITE_CODEC_CONTRACT_V1,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
        decodeAndVerifyExactTopology,
      },
    });
    const expected = { row, selectedOperationNumber: 7 };
    const signal = new AbortController().signal;

    const current = await adapter.readCurrentAssemblyTopology(expected, signal);

    expect(current.topology.operations[0]).toMatchObject({
      number: 7,
      inputKeys: ['piece-front', 'piece-back'],
      seamKeys: ['seam-side'],
    });
    expect(current.topology.seams.map(({ seamKey }) => seamKey)).toEqual(['seam-side']);
    expect(computeCanonicalSha256).toHaveBeenCalledWith(current.topology, signal);
    await expect(adapter.readAuthoritativeAssembly(expected, signal)).rejects.toMatchObject({
      code: 'assembly-topology-invalid',
    });
    expect(decodeAndVerifyExactTopology).not.toHaveBeenCalled();
  });
});
