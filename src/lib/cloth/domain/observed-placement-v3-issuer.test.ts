import { Buffer } from 'node:buffer';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
} from './pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import { encodePatternImportDxfProductExactTopologyComponentV3 } from './pattern-import-dxf-product-composite-sidecar-v3';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import {
  bytesOf,
  semanticDocument,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-read-v1.test-fixture';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import { createPatternImportDxfProductSavedPlacementRequestV1Fixture } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-placement-authored-input-v1.test-fixture';
import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from 'components/cloth-simulation-spike/beta-skirt-g3b2-preview-mannequin-request-v1';
import type {
  PatternImportDxfProductConfirmedAnnularEvidenceV1,
  PatternImportDxfProductConfirmedAnnularRequestV1,
} from './pattern-import-dxf-product-confirmed-annular-intent-v1';
import {
  projectPatternImportDxfProductGarmentMeshComposerV2,
  type PatternImportDxfProductGarmentMeshComposerSnapshotV2,
  type PatternImportDxfProductGarmentMeshComposerProjectionV2,
} from './pattern-import-dxf-product-garment-mesh-composer-v2';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2,
} from './pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import type { PatternImportDxfProductMultiseamMappingCompositionRequestV2 } from './pattern-import-dxf-product-multiseam-mapping-composition-v2';
import {
  decodePatternImportDxfProductMultiseamPlacementSidecarV2,
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
} from './pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
  buildDxfProductTwoPanelSkirtGarmentSemanticsV1,
  disposeDxfProductTwoPanelSkirtGarmentSemanticsV1,
  getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1,
} from './dxf-product-two-panel-skirt-garment-semantics-v1';
import { createObservedBodyIssuerTestFixture } from 'components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from 'components/cloth-simulation-spike/saved-model-observed-placement-target-v1';
import {
  issueObservedPlacementSidecarV3,
  projectObservedPlacementSidecarIssuedV3,
  disposeObservedPlacementSidecarIssuedV3,
  type ObservedPlacementSidecarIssueRequestV3,
} from 'components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from './pattern-import-dxf-product-composite-sidecar-v3';
import {
  createPatternImportDxfProductCompositeObservedPlacementSaverV3,
  createPatternImportDxfProductCompositePlacementSaverV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/composite-placement-save-v1';
import type { TechCardPatternSemanticSidecar } from 'api/proto-http/admin';
import type { PatternImportDxfProductCompositeSidecarStorageServiceV3 } from './pattern-import-dxf-product-composite-sidecar-storage-client-v3';
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
let seed: Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1>
>;
beforeAll(async () => {
  seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
}, 120_000);

// Genuine saved mesh + explicitly authored fixture roles/parameters. Storage transport evidence
// below is synthetic, codec-verified test input; it is not backend or body admission evidence.
async function authoring(
  snapshot: PatternImportDxfProductGarmentMeshComposerSnapshotV2,
  projection: PatternImportDxfProductGarmentMeshComposerProjectionV2,
  compositionRequest: PatternImportDxfProductMultiseamMappingCompositionRequestV2,
) {
  const display = BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1;
  const authored = createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
    composerSnapshot: snapshot,
    composerProjection: projection,
    mannequin: { status: 'ready', composition: { displayBinding: display } } as never,
  });
  const fixture = await createPatternImportDxfProductSavedPlacementRequestV1Fixture({
    composerSnapshot: snapshot,
    composerProjection: projection,
    compositionRequest,
    savedRow: seed.row,
    authored,
  });
  const semantic = semanticDocument(seed.row, 4);
  semantic.persistence.pieceLineKeys = [...fixture.bindings.topology.pieceLineKeys];
  // Historical semantic receipt remains byte-preserved after a later AO/card-lock update.
  semantic.persistence.card.observedLockVersion = seed.row.cardLockVersion - 1;
  semantic.persistence.card.previousLockVersion = seed.row.cardLockVersion - 2;
  const semanticBytes = bytesOf(semantic);
  const decoded = await decodePatternImportDxfProductMultiseamPlacementSidecarV2(semanticBytes);
  if (!decoded.ok || decoded.compatibility !== 'legacy-v1-no-placement')
    throw new Error('Invalid test semantic bytes');
  const {
    assemblyTopologySha256,
    documentId,
    revision,
    sourceOperationNumber,
    pieceLineKeys,
    pieceIds,
    seamKeys,
    seamIds,
  } = fixture.bindings.topology;
  const placementOperation = {
    documentId,
    revision,
    sourceOperationNumber,
    pieceLineKeys,
    pieceIds,
    seamKeys,
    seamIds,
  };
  const evidence: PatternImportDxfProductConfirmedAnnularEvidenceV1 = {
    row: seed.row,
    semanticBytes,
    semanticSha256: decoded.legacy.canonicalSha256,
    assemblyTopologySha256,
    serverAssemblyRevision: 'saved-ao-r1',
    placementOperation,
    outerTopology: { kind: 'composite-v3-two-seam' },
  };
  const request: PatternImportDxfProductConfirmedAnnularRequestV1 = {
    confirmed: true,
    garment: authored.semantics.garment,
    body: authored.semantics.body,
    policy: authored.semantics.policy,
    annularParameters: fixture.placementAuthoring.annular.parameters,
    bodyIntent: {
      kind: 'confirmed-neutral-A-target',
      confirmed: true,
      displayedBodyAdmission: false,
    },
    operation: {
      sourceOperationNumber: snapshot.assembly.sourceOperationNumber,
      pieceIds: snapshot.assembly.pieceIds,
      seamIds: snapshot.assembly.seamIds,
    },
    readCurrentEvidence: async () => evidence,
  };
  return { request, evidence, fixture, semantic };
}

async function setup(run: (f: Awaited<ReturnType<typeof prepare>>) => Promise<void>) {
  await withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2(
    seed,
    async (inputs) => {
      const f = await prepare(inputs);
      try {
        await run(f);
      } finally {
        f.issuedOwners.forEach(disposeObservedPlacementSidecarIssuedV3);
        disposeDxfProductTwoPanelSkirtGarmentSemanticsV1(f.d0.owner);
      }
    },
  );
}
async function prepare(
  inputs: Parameters<
    Parameters<typeof withPatternImportDxfProductSavedCanonicalMediumAnnularPlacementInputsV2>[1]
  >[0],
) {
  const a = await authoring(
    inputs.composerV2Owner.snapshot,
    projectPatternImportDxfProductGarmentMeshComposerV2(inputs.composerV2Owner)!,
    inputs.compositionRequest,
  );
  const d0 = await buildDxfProductTwoPanelSkirtGarmentSemanticsV1({
    schemaVersion: DXF_PRODUCT_TWO_PANEL_SKIRT_GARMENT_SEMANTICS_REQUEST_V1,
    origin: 'verified-saved-row',
    expectedComposerCanonicalSha256: inputs.composerV2Owner.snapshot.seal.canonicalSha256,
    composerOwner: inputs.composerV2Owner,
    garment: a.request.garment,
    policy: a.request.policy,
  });
  if (!d0.ok) throw new Error(JSON.stringify(d0));
  const body = await createObservedBodyIssuerTestFixture({ yaw: 5 });
  const target = await projectSavedModelObservedPlacementTargetV1(body.owner, body.binding);
  if (!target.ok) throw new Error(target.detail);
  const evidenceState = { current: a.evidence };
  const reader = vi.fn(async () => structuredClone(evidenceState.current));
  const request: ObservedPlacementSidecarIssueRequestV3 = {
    confirmed: true,
    composerV2Owner: inputs.composerV2Owner,
    garmentSemanticsOwner: d0.owner,
    compositionRequest: inputs.compositionRequest,
    savedRow: seed.row,
    displayedBodyOwner: body.owner,
    displayedBodyBinding: body.binding,
    confirmedTargetSha256: target.canonicalSha256,
    annularParameters: a.request.annularParameters,
    readCurrentEvidence: reader,
  };
  const issuedOwners: Parameters<typeof disposeObservedPlacementSidecarIssuedV3>[0][] = [];
  const issue = async (signal?: AbortSignal) => {
    const result = await issueObservedPlacementSidecarV3(request, signal);
    if (!result.ok) throw new Error(result.detail);
    issuedOwners.push(result.owner);
    return result.owner;
  };
  return { inputs, a, d0, body, target, request, reader, evidenceState, issuedOwners, issue };
}
async function saveFixture(f: Awaited<ReturnType<typeof prepare>>) {
  const owner = await f.issue();
  const projection = await projectObservedPlacementSidecarIssuedV3(owner);
  if (!projection) throw new Error('issuer projection');
  const authority = {
    row: seed.row,
    serverAssemblyRevision: f.a.evidence.serverAssemblyRevision,
    assemblyTopologySha256: f.a.evidence.assemblyTopologySha256,
  };
  const { catalog, proposal, choices } = f.inputs.compositionRequest;
  const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
    current: {
      ...authority,
      selectedOperation: {
        sourceOperationNumber: proposal.operation.sourceOperationNumber,
        authoringOperationId: proposal.operation.authoringOperationId,
        localOperationOrder: 0,
        seamIds: [...proposal.operation.seamIds],
      },
      catalogCanonicalSha256: catalog.canonicalSha256,
      proposalFingerprint: proposal.deterministicFingerprint,
      phaseEAggregatePlanSha256: choices.aggregatePlanSeal.canonicalSha256,
    },
    catalog: structuredClone(catalog),
    proposal: structuredClone(proposal),
    choices: structuredClone(choices),
  });
  if (!exact.ok) throw new Error(JSON.stringify(exact));
  const exactBytes = await encodePatternImportDxfProductExactTopologyComponentV3(exact.owner);
  if (!exactBytes.ok) throw new Error('exact bytes');
  const composite = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: authority,
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: f.a.evidence.semanticBytes,
    placementV2Bytes: null,
    exactTopologyBytes: exactBytes.bytes,
  });
  if (!composite.ok) throw new Error(JSON.stringify(composite));
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
  if (!encoded.ok) throw new Error('encode');
  const binding = projection.document.bindings.row;
  const state = {
    stored: {
      techCardId: binding.techCardId,
      patternLineKey: binding.patternLineKey,
      dxfSha256: binding.dxfSha256,
      patternVersion: binding.patternVersion,
      postSaveReceiptSha256: binding.postSaveReceiptSha256,
      cardLockVersion: binding.cardLockVersion,
      savedRowRevision: binding.revision,
      mediaType: String(composite.document.mediaType),
      sidecarSha256: encoded.canonicalSha256,
      byteLength: encoded.bytes.length,
      sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
      createdAt: undefined,
      createdBy: undefined,
    } satisfies TechCardPatternSemanticSidecar,
    afterWriteDrift: false,
  };
  const get = vi.fn(async () => ({ semanticSidecar: structuredClone(state.stored) }));
  const put = vi.fn(
    async (
      request: Parameters<
        PatternImportDxfProductCompositeSidecarStorageServiceV3['PutTechCardPatternSemanticSidecar']
      >[0],
    ) => {
      if (request.expectedPreviousSidecarSha256 !== state.stored.sidecarSha256)
        throw Object.assign(new Error('CAS conflict'), { status: 409 });
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
  const current = {
    authority,
    placementBindings: projection.document.bindings,
    exactNCurrent: null,
  };
  const host = {
    createClient: () => ({
      GetTechCardPatternSemanticSidecar: get,
      PutTechCardPatternSemanticSidecar: put,
    }),
    readCurrentEvidence: vi.fn(async () => structuredClone(current)),
  };
  const request = {
    confirmed: true as const,
    placementOwner: owner,
    expectedPreviousOuterSha256: encoded.canonicalSha256,
    current,
  };
  return {
    owner,
    projection,
    current,
    request,
    host,
    state,
    get,
    put,
    exactBytes: exactBytes.bytes,
    saver: createPatternImportDxfProductCompositeObservedPlacementSaverV3(host),
  };
}

describe('genuine observed Placement V3 issuer and existing CAS route (synthetic observed host/transport only)', () => {
  it('issues from real saved Composer/body-free D0 and genuine adopted pose; rejects raw codec/structural owners', async () =>
    setup(async (f) => {
      const owner = await f.issue();
      const projection = await projectObservedPlacementSidecarIssuedV3(owner);
      expect(projection).not.toBeNull();
      expect(projection!.document.placementAuthoring.semantics).not.toHaveProperty('body');
      expect(
        projection!.document.placementAuthoring.observedTarget.target.pose.document.pose.headYawDeg,
      ).toBe(5);
      expect(projection!.document.placementAuthoring.semantics.originalCanonicalSha256).toBe(
        f.d0.owner.snapshot.seal.canonicalSha256,
      );
      expect(await projectObservedPlacementSidecarIssuedV3({ ...owner })).toBeNull();
      expect(
        (
          await issueObservedPlacementSidecarV3({
            ...f.request,
            garmentSemanticsOwner: { ...f.d0.owner },
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await issueObservedPlacementSidecarV3({
            ...f.request,
            confirmedTargetSha256: 'f'.repeat(64),
          })
        ).ok,
      ).toBe(false);
      expect(getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(f.d0.owner)?.aborted).toBe(false);
    }));
  it('replaces one active component with one CAS, preserves historical semantic bytes and returns fresh verified V3 owner', async () =>
    setup(async (f) => {
      const s = await saveFixture(f);
      const result = await s.saver.save(s.request);
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, writeOutcome: 'verified' });
      expect(s.put).toHaveBeenCalledTimes(1);
      if (!result.ok) return;
      expect(result.owner.seal.canonicalSha256).toBe(s.projection.canonicalSha256);
      const decoded = await decodePatternImportDxfProductCompositeSidecarV3(
        Uint8Array.from(Buffer.from(s.state.stored.sidecarBytes, 'base64')),
      );
      if (!decoded.ok) throw new Error('decode');
      expect(
        readPatternImportDxfProductCompositeComponentBytesV3(decoded.owner, 'semantic-product-v1'),
      ).toEqual(f.a.evidence.semanticBytes);
      expect(decoded.document.components.map((c) => c.kind)).toEqual([
        'semantic-product-v1',
        'multiseam-placement-v3',
        'phase-e-exact-topology-v1',
      ]);
      expect(
        readPatternImportDxfProductCompositeComponentBytesV3(
          decoded.owner,
          'phase-e-exact-topology-v1',
        ),
      ).toEqual(s.exactBytes);
      const old = await buildPatternImportDxfProductMultiseamPlacementSidecarV2({
        ...f.a.fixture,
        bindings: s.current.placementBindings,
      });
      if (!old.ok) throw new Error('legacy');
      const legacy = await createPatternImportDxfProductCompositePlacementSaverV1(s.host).save({
        ...s.request,
        placementOwner: old.owner,
        expectedPreviousOuterSha256: s.state.stored.sidecarSha256,
      });
      expect(legacy).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
      expect(s.put).toHaveBeenCalledTimes(1);
    }));
  it('captures owner/current/CAS before pending genuine issuer projection; mutated caller cannot redirect save', async () =>
    setup(async (f) => {
      const s = await saveFixture(f);
      let release!: () => void;
      const held = new Promise<void>((r) => {
        release = r;
      });
      f.reader.mockImplementationOnce(async () => {
        await held;
        return structuredClone(f.a.evidence);
      });
      const mutable = { ...s.request, current: structuredClone(s.current) };
      const pending = s.saver.save(mutable);
      mutable.expectedPreviousOuterSha256 = 'f'.repeat(64);
      Object.assign(mutable.current.authority.row, { cardLockVersion: 999 });
      mutable.placementOwner = { ...s.owner };
      release();
      const result = await pending;
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true, writeOutcome: 'verified' });
      expect(s.put).toHaveBeenCalledTimes(1);
      expect(s.put.mock.calls[0]![0].expectedPreviousSidecarSha256).toBe(
        s.request.expectedPreviousOuterSha256,
      );
    }));
  it('cancels an issuer read without revoking borrowed body/D0, and revokes issuer on parent lifetime cancellation', async () =>
    setup(async (f) => {
      const lifetime = new AbortController();
      const owner = await f.issue(lifetime.signal);
      const readAbort = new AbortController();
      let release!: () => void;
      const held = new Promise<void>((r) => {
        release = r;
      });
      f.reader.mockImplementationOnce(async () => {
        await held;
        return structuredClone(f.a.evidence);
      });
      const pending = projectObservedPlacementSidecarIssuedV3(owner, readAbort.signal);
      readAbort.abort();
      expect(await pending).toBeNull();
      release();
      expect(await projectObservedPlacementSidecarIssuedV3(owner)).not.toBeNull();
      lifetime.abort();
      expect(await projectObservedPlacementSidecarIssuedV3(owner)).toBeNull();
      expect(getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(f.d0.owner)?.aborted).toBe(false);
      expect(f.body.input.project()).not.toBeNull();
    }));
  it('blocks stale receipt/source and never writes after explicit target revocation', async () =>
    setup(async (f) => {
      const s = await saveFixture(f);
      f.evidenceState.current = { ...f.a.evidence, serverAssemblyRevision: 'changed' };
      expect(await projectObservedPlacementSidecarIssuedV3(s.owner)).toBeNull();
      const result = await s.saver.save(s.request);
      expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
      expect(s.put).not.toHaveBeenCalled();
    }));
});

it('preserves existing CAS rejection, fresh-read drift and unknown PUT outcomes through the observed route', async () =>
  setup(async (f) => {
    const s = await saveFixture(f);
    const stale = await s.saver.save({ ...s.request, expectedPreviousOuterSha256: 'f'.repeat(64) });
    expect(stale).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(s.put).not.toHaveBeenCalled();
    s.put.mockImplementationOnce(async () => {
      throw Object.assign(new Error('network outcome unknown'), { status: 503 });
    });
    const uncertain = await s.saver.save(s.request);
    expect(uncertain).toMatchObject({ ok: false, writeOutcome: 'unknown' });
    expect(s.put).toHaveBeenCalledTimes(1);
    const originalGet = s.get.getMockImplementation()!;
    s.get.mockImplementation(async () => {
      const response = await originalGet();
      if (s.put.mock.calls.length >= 2 && s.get.mock.calls.length >= 5)
        response.semanticSidecar.sidecarSha256 = 'f'.repeat(64);
      return response;
    });
    const drift = await s.saver.save(s.request);
    expect(drift.ok).toBe(false);
    expect(drift.writeOutcome).not.toBe('not-attempted');
    expect(s.put).toHaveBeenCalledTimes(2);
  }));
it('issuer lifetime cancellation reaches a dispatched existing writer and preserves unknown write outcome', async () =>
  setup(async (f) => {
    const s = await saveFixture(f);
    let entered!: () => void;
    const started = new Promise<void>((r) => {
      entered = r;
    });
    let transport: AbortSignal | undefined;
    const client = s.host.createClient;
    s.host.createClient = (signal?: AbortSignal) => {
      transport = signal;
      return client();
    };
    s.put.mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) =>
        transport!.addEventListener('abort', () => resolve(), { once: true }),
      );
      throw new DOMException('cancelled', 'AbortError');
    });
    const saver = createPatternImportDxfProductCompositeObservedPlacementSaverV3(s.host);
    const pending = saver.save(s.request);
    await started;
    disposeObservedPlacementSidecarIssuedV3(s.owner);
    const result = await pending;
    expect(transport?.aborted).toBe(true);
    expect(result).toMatchObject({ ok: false, writeOutcome: 'unknown' });
    expect(f.body.input.project()).not.toBeNull();
    expect(getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(f.d0.owner)?.aborted).toBe(false);
  }));

it('rejects nested composition getters and foreign signals without invoking them or attaching borrowed-source listeners', async () =>
  setup(async (f) => {
    const getter = vi.fn(() => f.request.compositionRequest.catalog);
    const composition = { ...f.request.compositionRequest };
    Object.defineProperty(composition, 'catalog', { get: getter, enumerable: true });
    const hostile = await issueObservedPlacementSidecarV3({
      ...f.request,
      compositionRequest: composition,
    });
    expect(hostile.ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    const add = vi.fn();
    const result = await issueObservedPlacementSidecarV3(f.request, {
      aborted: false,
      addEventListener: add,
    } as unknown as AbortSignal);
    expect(result.ok).toBe(false);
    expect(add).not.toHaveBeenCalled();
    expect(getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(f.d0.owner)?.aborted).toBe(false);
    expect(f.body.input.project()).not.toBeNull();
    const controller = new AbortController();
    const host = f.body.state.host;
    Object.defineProperty(f.body.state, 'host', {
      configurable: true,
      get() {
        controller.abort();
        return host;
      },
    });
    const cancelled = await issueObservedPlacementSidecarV3(f.request, controller.signal);
    expect(cancelled.ok).toBe(false);
    Object.defineProperty(f.body.state, 'host', {
      configurable: true,
      writable: true,
      value: host,
    });
    expect(f.body.input.project()).not.toBeNull();
    expect(getDxfProductTwoPanelSkirtGarmentSemanticsLifetimeV1(f.d0.owner)?.aborted).toBe(false);
  }));
