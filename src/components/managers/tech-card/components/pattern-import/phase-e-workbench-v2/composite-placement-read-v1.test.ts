import { describe, expect, it, vi } from 'vitest';

import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import {
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';

import {
  createPatternImportDxfProductCompositePlacementProductionReaderV1,
  readPatternImportDxfProductCompositePlacementV1,
} from './composite-placement-read-v1';
import {
  baseBindings,
  baseRow,
  bytesOf,
  candidate,
  placementRequest,
  semanticDocument,
} from './composite-placement-read-v1.test-fixture';
import { buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2 } from './exact-n-seam-consistency-carrier-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
  buildPatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductCompositeSidecarV4,
  encodePatternImportDxfProductExactNSeamComponentV4,
} from './composite-sidecar-v4';

const api = vi.hoisted(() => ({ get: vi.fn(), bind: vi.fn() }));
vi.mock('api/api', () => ({
  abortableAdminService: (signal: AbortSignal) => {
    api.bind(signal);
    return { GetTechCardPatternSemanticSidecar: api.get };
  },
}));

async function fixture(version: 3 | 4, withPlacement = true) {
  const authored = placementRequest();
  const placement = await buildPatternImportDxfProductMultiseamPlacementSidecarV2(authored);
  if (!placement.ok) throw new Error(placement.blockers[0].detail);
  const encodedPlacement = encodePatternImportDxfProductMultiseamPlacementSidecarV2(
    placement.owner,
  );
  if (!encodedPlacement.ok) throw new Error('Fixture placement encode failed.');
  const composite = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: baseBindings,
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: bytesOf(semanticDocument(baseRow)),
    placementV2Bytes: withPlacement ? encodedPlacement.bytes : null,
    exactTopologyBytes: null,
  });
  if (!composite.ok) throw new Error(composite.blockers[0].detail);
  let encoded = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
  let mediaType: string = composite.document.mediaType;
  if (!encoded.ok) throw new Error('Fixture Composite encode failed.');
  if (version === 4) {
    const exact = await buildPatternImportDxfPhaseEExactNSeamConsistencyCarrierV2(candidate(1));
    if (!exact.ok) throw new Error(exact.blockers[0].detail);
    const component = await encodePatternImportDxfProductExactNSeamComponentV4({
      carrier: exact.carrier,
      seal: exact.seal,
    });
    if (!component.ok) throw new Error(component.blocker.detail);
    const v4 = await buildPatternImportDxfProductCompositeSidecarV4({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V4,
      bindings: baseBindings,
      expectedPreviousSidecarSha256: null,
      compositeV3Bytes: encoded.bytes,
      exactNSeamConsistencyBytes: component.bytes,
    });
    if (!v4.ok) throw new Error(v4.blockers[0].detail);
    encoded = encodePatternImportDxfProductCompositeSidecarV4(v4.owner);
    mediaType = v4.document.mediaType;
    if (!encoded.ok) throw new Error('Fixture V4 encode failed.');
  }
  let binary = '';
  for (const byte of encoded.bytes) binary += String.fromCharCode(byte);
  const identity = authored.bindings.row;
  const envelope: TechCardPatternSemanticSidecar = {
    techCardId: identity.techCardId,
    patternLineKey: identity.patternLineKey,
    dxfSha256: identity.dxfSha256,
    patternVersion: identity.patternVersion,
    postSaveReceiptSha256: identity.postSaveReceiptSha256,
    cardLockVersion: identity.cardLockVersion,
    savedRowRevision: identity.revision,
    sidecarSha256: encoded.canonicalSha256,
    byteLength: encoded.canonicalByteLength,
    sidecarBytes: btoa(binary),
    mediaType,
    createdAt: undefined,
    createdBy: undefined,
  };
  const request = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
    expectedRow: baseRow,
    expectedBindings: authored.bindings,
  };
  const evidence = {
    row: baseRow,
    topology: authored.bindings.topology,
    serverAssemblyRevision: baseBindings.serverAssemblyRevision as string,
  };
  const getSidecar = vi.fn(async () => ({ status: 'found' as const, row: envelope }));
  const readCurrentEvidence = vi.fn(async () => structuredClone(evidence));
  return { envelope, request, evidence, host: { getSidecar, readCurrentEvidence } };
}

describe('fresh Composite placement read', () => {
  it('uses the generated abortable GET with the exact current row', async () => {
    const { request, host, envelope } = await fixture(3);
    api.get.mockReset().mockResolvedValue({ semanticSidecar: envelope });
    api.bind.mockClear();
    const controller = new AbortController();
    const reader = createPatternImportDxfProductCompositePlacementProductionReaderV1(
      host.readCurrentEvidence,
    );
    expect(
      await reader.read(request, baseBindings.serverAssemblyRevision, controller.signal),
    ).toMatchObject({ ok: true, compatibility: 'placement-v2' });
    expect(api.get).toHaveBeenCalledExactlyOnceWith({
      techCardId: baseRow.techCardId,
      patternLineKey: baseRow.patternLineKey,
    });
    expect(api.bind).toHaveBeenCalledWith(controller.signal);
  });

  it.each([404, 503])('normalizes only an actual HTTP 404 as absence (%i)', async (status) => {
    const { request, host } = await fixture(3);
    api.get.mockReset().mockRejectedValue(Object.assign(new Error('GET failed'), { status }));
    const reader = createPatternImportDxfProductCompositePlacementProductionReaderV1(
      host.readCurrentEvidence,
    );
    const result = await reader.read(request, baseBindings.serverAssemblyRevision);
    expect(result).toMatchObject(
      status === 404
        ? { ok: true, compatibility: 'absent', owner: null }
        : { ok: false, owner: null },
    );
  });

  it.each([3, 4] as const)(
    'verifies V%i and issues the existing placement read owner',
    async (version) => {
      const { request, host } = await fixture(version);
      const result = await readPatternImportDxfProductCompositePlacementV1(
        request,
        baseBindings.serverAssemblyRevision,
        host,
      );
      expect(result, JSON.stringify(result)).toMatchObject({
        ok: true,
        compatibility: 'placement-v2',
      });
      if (!result.ok || result.compatibility !== 'placement-v2') throw new Error('Read blocked.');
      expect(
        isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(result.owner),
      ).toBe(true);
      expect(host.getSidecar).toHaveBeenCalledTimes(1);
      expect(host.readCurrentEvidence).toHaveBeenCalledTimes(2);
      expect(result.claims).toMatchObject({ putPerformed: false, runtimeReady: false });
    },
  );

  it.each(['digest', 'lock', 'saved-revision', 'receipt', 'bytes'] as const)(
    'rejects a changed outer %s without minting an owner',
    async (field) => {
      const { request, host, envelope } = await fixture(4);
      if (field === 'digest') envelope.sidecarSha256 = '0'.repeat(64);
      if (field === 'lock') envelope.cardLockVersion = 999;
      if (field === 'saved-revision') envelope.savedRowRevision = 999;
      if (field === 'receipt') envelope.postSaveReceiptSha256 = '0'.repeat(64);
      if (field === 'bytes') envelope.sidecarBytes = envelope.sidecarBytes!.slice(4);
      const result = await readPatternImportDxfProductCompositePlacementV1(
        request,
        baseBindings.serverAssemblyRevision,
        host,
      );
      expect(result).toMatchObject({ ok: false, owner: null });
    },
  );

  it('rejects Assembly revision changes after GET and absent placement', async () => {
    const current = await fixture(3);
    current.host.readCurrentEvidence.mockResolvedValueOnce(current.evidence).mockResolvedValueOnce({
      ...current.evidence,
      serverAssemblyRevision: 'assembly:new',
    });
    expect(
      await readPatternImportDxfProductCompositePlacementV1(
        current.request,
        baseBindings.serverAssemblyRevision,
        current.host,
      ),
    ).toMatchObject({ ok: false, owner: null });
    const missing = await fixture(4, false);
    expect(
      await readPatternImportDxfProductCompositePlacementV1(
        missing.request,
        baseBindings.serverAssemblyRevision,
        missing.host,
      ),
    ).toMatchObject({ ok: false, owner: null });
  });

  it('refuses a stale expected Assembly revision before admitting embedded bytes', async () => {
    const { request, host } = await fixture(4);
    expect(
      await readPatternImportDxfProductCompositePlacementV1(request, 'assembly:stale', host),
    ).toMatchObject({ ok: false, owner: null });
    expect(host.getSidecar).not.toHaveBeenCalled();
  });
});
