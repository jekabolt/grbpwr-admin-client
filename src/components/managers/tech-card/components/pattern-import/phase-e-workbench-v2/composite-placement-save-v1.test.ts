import { describe, expect, it, vi } from 'vitest';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import type { PatternImportDxfProductCompositeSidecarStorageServiceV3 } from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3';
import {
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import { isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2 } from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import { buildPatternImportDxfProductPhaseEExactTopologyBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import { createPatternImportDxfProductPhaseEExactTopologyFixtureV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1.test-fixture';
import {
  baseBindings,
  bytesOf,
  candidate,
  placementRequest,
  semanticDocument,
} from './composite-placement-read-v1.test-fixture';
import {
  createPatternImportDxfProductCompositePlacementSaverV1,
  type PatternImportDxfProductCompositePlacementSaveCurrentV1,
} from './composite-placement-save-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  decodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
  readPatternImportDxfProductCompositeComponentBytesV4,
} from './composite-sidecar-v4';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from './exact-n-seam-consistency-carrier-v2';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));

type Mutable<T> = T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const decodeBytes = (row: TechCardPatternSemanticSidecar) =>
  Uint8Array.from(atob(row.sidecarBytes!), (character) => character.charCodeAt(0));

// Real codecs and existing storage coordinators; only transport/current-owner reads are doubles.
// This fixture proves storage composition and lifecycle, never backend or cloth acceptance.
async function fixture(version: 3 | 4, seamCount = 1) {
  let authority:
    typeof baseBindings | PatternImportDxfProductCompositePlacementSaveCurrentV1['authority'] =
    baseBindings;
  let exactTopologyBytes: Uint8Array | null = null;
  let exactNCurrent: PatternImportDxfProductCompositePlacementSaveCurrentV1['exactNCurrent'] = null;
  let exactNBytes: Uint8Array | null = null;
  if (version === 3) {
    const exactFixture = await createPatternImportDxfProductPhaseEExactTopologyFixtureV1();
    const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
      exactFixture.buildRequest,
    );
    if (!exact.ok) throw new Error(exact.blockers[0].detail);
    const encoded = await encodePatternImportDxfProductExactTopologyComponentV3(exact.owner);
    if (!encoded.ok) throw new Error(encoded.blocker.detail);
    exactTopologyBytes = encoded.bytes;
    authority = {
      row: exactFixture.row,
      serverAssemblyRevision: exactFixture.current.serverAssemblyRevision,
      assemblyTopologySha256: exactFixture.current.assemblyTopologySha256,
    };
  } else {
    const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(
      candidate(seamCount),
    );
    if (!exact.ok) throw new Error(exact.blockers[0].detail);
    exactNCurrent = exact.carrier.bindings;
    const encoded = await encodePatternImportDxfProductExactNSeamComponentV4({
      carrier: exact.carrier,
      seal: exact.seal,
    });
    if (!encoded.ok) throw new Error(encoded.blocker.detail);
    exactNBytes = encoded.bytes;
  }
  const authored = structuredClone(placementRequest()) as Mutable<
    ReturnType<typeof placementRequest>
  >;
  Object.assign(authored.bindings.row, {
    techCardId: authority.row.techCardId,
    cardLockVersion: authority.row.cardLockVersion,
    scopeKey: authority.row.scopeKey,
    patternLineKey: authority.row.patternLineKey,
    patternUrl: authority.row.url,
    revision: authority.row.revision,
    dxfSha256: authority.row.sha256,
  });
  authored.bindings.source.writerExportSha256 = authority.row.sha256;
  authored.bindings.topology.assemblyTopologySha256 = authority.assemblyTopologySha256;
  const placement = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(authored);
  if (!placement.ok) throw new Error(placement.blockers[0].detail);
  const semantic = semanticDocument(authority.row);
  semantic.persistence.receiptSealSha256 = authored.bindings.row.postSaveReceiptSha256;
  const semanticBytes = bytesOf(semantic);
  const composite = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: authority,
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: semanticBytes,
    placementV2Bytes: null,
    exactTopologyBytes,
  });
  if (!composite.ok) throw new Error(composite.blockers[0].detail);
  let encoded = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
  let mediaType: string = composite.document.mediaType;
  if (!encoded.ok) throw new Error('V3 fixture encode failed.');
  if (version === 4) {
    const outer = await buildPatternImportDxfProductCompositeSidecarV4({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
      bindings: authority,
      expectedPreviousSidecarSha256: null,
      compositeV3Bytes: encoded.bytes,
      exactNSeamConsistencyBytes: exactNBytes!,
    });
    if (!outer.ok) throw new Error(outer.blockers[0].detail);
    encoded = encodePatternImportDxfProductCompositeSidecarV4(outer.owner);
    mediaType = outer.document.mediaType;
    if (!encoded.ok) throw new Error('V4 fixture encode failed.');
  }
  const state = {
    stored: {
      techCardId: authority.row.techCardId,
      patternLineKey: authority.row.patternLineKey,
      dxfSha256: authority.row.sha256,
      patternVersion: authored.bindings.row.patternVersion,
      postSaveReceiptSha256: authored.bindings.row.postSaveReceiptSha256,
      cardLockVersion: authority.row.cardLockVersion,
      savedRowRevision: authority.row.revision,
      sidecarSha256: encoded.canonicalSha256,
      byteLength: encoded.canonicalByteLength,
      sidecarBytes: btoa(Array.from(encoded.bytes, (byte) => String.fromCharCode(byte)).join('')),
      mediaType,
      createdAt: undefined,
      createdBy: undefined,
    } satisfies TechCardPatternSemanticSidecar,
  };
  const initial = structuredClone(state.stored);
  const current: PatternImportDxfProductCompositePlacementSaveCurrentV1 = {
    authority,
    placementBindings: authored.bindings,
    exactNCurrent,
  };
  const get = vi.fn(async () => ({ semanticSidecar: structuredClone(state.stored) }));
  const put = vi.fn(
    async (
      request: Parameters<
        PatternImportDxfProductCompositeSidecarStorageServiceV3['PutTechCardPatternSemanticSidecar']
      >[0],
    ) => {
      if (request.expectedPreviousSidecarSha256 !== state.stored.sidecarSha256)
        throw Object.assign(new Error('CAS conflict.'), { status: 409 });
      state.stored = {
        ...state.stored,
        sidecarSha256: request.sidecarSha256!,
        sidecarBytes: request.sidecarBytes!,
        byteLength: atob(request.sidecarBytes!).length,
        mediaType: request.mediaType!,
      };
      return { semanticSidecar: structuredClone(state.stored) };
    },
  );
  const readCurrentEvidence = vi.fn(async () => structuredClone(current));
  const host = {
    createClient: () => ({
      GetTechCardPatternSemanticSidecar: get,
      PutTechCardPatternSemanticSidecar: put,
    }),
    readCurrentEvidence,
  };
  const saver = createPatternImportDxfProductCompositePlacementSaverV1(host);
  const request = {
    confirmed: true as const,
    placementOwner: placement.owner,
    expectedPreviousOuterSha256: initial.sidecarSha256,
    current,
  };
  return {
    saver,
    request,
    host,
    get,
    put,
    state,
    initial,
    placement,
    authored,
    semanticBytes,
    exactTopologyBytes,
    exactNBytes,
  };
}

describe('confirmed placement save through existing Composite writers', () => {
  it.each([3, 4] as const)(
    'adds placement to V%i while preserving exact semantic and topology component bytes',
    async (version) => {
      const test = await fixture(version);
      const result = await test.saver.save(test.request);
      expect(result, JSON.stringify(result)).toMatchObject({
        ok: true,
        writeOutcome: 'verified',
        uiIntegrated: false,
        runtimeReady: false,
      });
      expect(
        isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(result.owner),
      ).toBe(true);
      expect(test.put).toHaveBeenCalledOnce();
      expect(test.put.mock.calls[0][0]).toMatchObject({
        expectedPreviousSidecarSha256: test.initial.sidecarSha256,
        expectedServerAssemblyRevision: test.request.current.authority.serverAssemblyRevision,
        expectedAssemblyTopologySha256: test.request.current.authority.assemblyTopologySha256,
      });
      const saved =
        version === 4
          ? await decodePatternImportDxfProductCompositeSidecarV4(decodeBytes(test.state.stored))
          : await decodePatternImportDxfProductCompositeSidecarV3(decodeBytes(test.state.stored));
      if (!saved.ok) throw new Error(saved.blockers[0].detail);
      const nested = 'nestedCompositeV3' in saved ? saved.nestedCompositeV3 : saved;
      expect(
        readPatternImportDxfProductCompositeComponentBytesV3(nested.owner, 'semantic-product-v1'),
      ).toEqual(test.semanticBytes);
      expect(
        readPatternImportDxfProductCompositeComponentBytesV3(
          nested.owner,
          'phase-e-exact-topology-v1',
        ),
      ).toEqual(test.exactTopologyBytes);
      if ('nestedCompositeV3' in saved)
        expect(
          readPatternImportDxfProductCompositeComponentBytesV4(
            saved.owner,
            'phase-e-exact-n-seam-consistency-v2',
          ),
        ).toEqual(test.exactNBytes);
      const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV2(
        test.placement.owner,
      );
      if (!encoded.ok) throw new Error('Placement encode failed.');
      expect(
        readPatternImportDxfProductCompositeComponentBytesV3(
          nested.owner,
          'multiseam-placement-v2',
        ),
      ).toEqual(encoded.bytes);
      expect(test.get).toHaveBeenCalledTimes(version === 4 ? 5 : 4);
    },
  );

  it('preserves greater-than-two exact-N carrier bytes on V4', async () => {
    const test = await fixture(4, 3);
    expect(await test.saver.save(test.request)).toMatchObject({
      ok: true,
      writeOutcome: 'verified',
    });
    const saved = await decodePatternImportDxfProductCompositeSidecarV4(
      decodeBytes(test.state.stored),
    );
    if (!saved.ok) throw new Error(saved.blockers[0].detail);
    expect(
      readPatternImportDxfProductCompositeComponentBytesV4(
        saved.owner,
        'phase-e-exact-n-seam-consistency-v2',
      ),
    ).toEqual(test.exactNBytes);
  });

  it.each([3, 4] as const)(
    'replaces only placement inside V%i after a new confirmation and outer CAS',
    async (version) => {
      const test = await fixture(version);
      expect(await test.saver.save(test.request)).toMatchObject({ ok: true });
      const firstSha = test.state.stored.sidecarSha256;
      test.authored.placementAuthoring.authoredImportGeneration += 1;
      const next = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(test.authored);
      if (!next.ok) throw new Error(next.blockers[0].detail);
      const result = await test.saver.save({
        ...test.request,
        placementOwner: next.owner,
        expectedPreviousOuterSha256: firstSha,
      });
      expect(result).toMatchObject({ ok: true });
      expect(result.owner!.seal.canonicalSha256).toBe(next.seal.canonicalSha256);
      expect(test.state.stored.sidecarSha256).not.toBe(firstSha);
    },
  );

  it('refuses structural owners, unconfirmed requests, stale CAS and unknown/V5 media without PUT', async () => {
    const test = await fixture(3);
    expect(await test.saver.save({ ...test.request, placementOwner: {} as never })).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
    });
    expect(await test.saver.save({ ...test.request, confirmed: false as never })).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
    });
    expect(
      await test.saver.save({ ...test.request, expectedPreviousOuterSha256: '0'.repeat(64) }),
    ).toMatchObject({ ok: false, blockers: [{ code: 'outer-cas-mismatch' }] });
    test.state.stored.mediaType = 'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json';
    expect(await test.saver.save(test.request)).toMatchObject({
      ok: false,
      blockers: [{ code: 'unsupported-current-sidecar' }],
    });
    expect(test.put).not.toHaveBeenCalled();
  });

  it('refuses fresh source or Assembly drift before building/writing', async () => {
    const test = await fixture(3);
    test.host.readCurrentEvidence.mockImplementation(async () => ({
      ...test.request.current,
      placementBindings: {
        ...test.request.current.placementBindings,
        source: {
          ...test.request.current.placementBindings.source,
          selectedGeometrySha256: '0'.repeat(64),
        },
      },
    }));
    expect(await test.saver.save(test.request)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      owner: null,
    });
    expect(test.get).not.toHaveBeenCalled();
    expect(test.put).not.toHaveBeenCalled();
  });

  it('lets the existing writer reject a race between initial GET and its fresh CAS GET', async () => {
    const test = await fixture(3);
    test.get.mockImplementation(async () => ({
      semanticSidecar: {
        ...test.state.stored,
        sidecarSha256:
          test.get.mock.calls.length >= 2 ? '0'.repeat(64) : test.state.stored.sidecarSha256,
      },
    }));
    expect(await test.saver.save(test.request)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      owner: null,
    });
    expect(test.put).not.toHaveBeenCalled();
  });

  it.each([409, 503])(
    'preserves the existing writer unknown outcome on PUT failure %i',
    async (status) => {
      const test = await fixture(4);
      test.put.mockRejectedValue(
        Object.assign(new Error('Write response unavailable.'), { status }),
      );
      expect(await test.saver.save(test.request)).toMatchObject({
        ok: false,
        writeOutcome: 'unknown',
        owner: null,
        persistence: { ok: false, writeOutcome: 'unknown' },
      });
      expect(test.put).toHaveBeenCalledOnce();
    },
  );

  it('preserves acknowledged-unverified when the PUT echo is corrupt', async () => {
    const test = await fixture(3);
    const write = test.put.getMockImplementation()!;
    test.put.mockImplementation(async (request) => {
      const response = await write(request);
      return { semanticSidecar: { ...response.semanticSidecar, sidecarSha256: '0'.repeat(64) } };
    });
    expect(await test.saver.save(test.request)).toMatchObject({
      ok: false,
      writeOutcome: 'acknowledged-unverified',
      owner: null,
    });
  });

  it.each([3, 4] as const)(
    'returns no owner when fresh final V%i outer SHA drifts after a verified write',
    async (version) => {
      const test = await fixture(version);
      test.get.mockImplementation(async () => ({
        semanticSidecar: {
          ...test.state.stored,
          sidecarSha256:
            test.get.mock.calls.length === (version === 4 ? 5 : 4)
              ? '0'.repeat(64)
              : test.state.stored.sidecarSha256,
        },
      }));
      expect(await test.saver.save(test.request)).toMatchObject({
        ok: false,
        writeOutcome: 'verified',
        owner: null,
        blockers: [{ code: 'placement-readback-unverified' }],
      });
    },
  );

  it('preserves verified write outcome when fresh source evidence changes during final read', async () => {
    const test = await fixture(3);
    test.host.readCurrentEvidence.mockImplementation(async () => ({
      ...test.request.current,
      authority: {
        ...test.request.current.authority,
        serverAssemblyRevision: test.put.mock.calls.length
          ? 'assembly:changed'
          : test.request.current.authority.serverAssemblyRevision,
      },
    }));
    expect(await test.saver.save(test.request)).toMatchObject({
      ok: false,
      writeOutcome: 'verified',
      owner: null,
    });
  });

  it('requires current exact-N evidence matching the existing V4 carrier before PUT', async () => {
    const test = await fixture(4);
    const current = { ...test.request.current, exactNCurrent: null };
    test.host.readCurrentEvidence.mockResolvedValue(current);
    expect(await test.saver.save({ ...test.request, current })).toMatchObject({
      ok: false,
      owner: null,
      writeOutcome: 'not-attempted',
      blockers: [{ code: 'exact-n-current-mismatch' }],
    });
    expect(test.put).not.toHaveBeenCalled();
  });

  it('preserves verified write outcome but returns no read owner after cancellation during final read', async () => {
    const test = await fixture(4);
    const controller = new AbortController();
    test.host.readCurrentEvidence.mockImplementation(async () => {
      if (test.put.mock.calls.length) controller.abort();
      return structuredClone(test.request.current);
    });
    const result = await test.saver.save(test.request, controller.signal);
    expect(result).toMatchObject({
      ok: false,
      owner: null,
      writeOutcome: 'verified',
      blockers: [{ code: 'cancelled' }],
    });
    expect(result.readback?.owner ?? null).toBeNull();
  });

  it('cancels before any work and preserves unknown when abort follows a possibly committed PUT', async () => {
    const test = await fixture(3);
    const controller = new AbortController();
    controller.abort();
    expect(await test.saver.save(test.request, controller.signal)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
    });
    expect(test.get).not.toHaveBeenCalled();
    const duringPut = new AbortController();
    const write = test.put.getMockImplementation()!;
    test.put.mockImplementation(async (request) => {
      const response = await write(request);
      duringPut.abort();
      return response;
    });
    expect(await test.saver.save(test.request, duringPut.signal)).toMatchObject({
      ok: false,
      writeOutcome: 'unknown',
      owner: null,
    });
  });

  it('rejects concurrent same-pattern saves across consumer instances and releases the guard', async () => {
    const test = await fixture(3);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    test.get.mockImplementationOnce(async () => {
      await gate;
      return { semanticSidecar: test.initial };
    });
    const pending = test.saver.save(test.request);
    await vi.waitFor(() => expect(test.get).toHaveBeenCalledOnce());
    const second = createPatternImportDxfProductCompositePlacementSaverV1(test.host);
    expect(await second.save(test.request)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      blockers: [{ code: 'concurrent-save' }],
    });
    release();
    expect(await pending).toMatchObject({ ok: true });
    expect(
      await second.save({
        ...test.request,
        expectedPreviousOuterSha256: test.state.stored.sidecarSha256,
      }),
    ).toMatchObject({ ok: true });
  });
});
