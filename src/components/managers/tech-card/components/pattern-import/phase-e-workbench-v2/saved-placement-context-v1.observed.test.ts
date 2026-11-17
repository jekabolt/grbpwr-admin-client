import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  withFirstSaveSourceV3,
  withObservedFirstSaveFixtureV3,
} from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-first-save-v3.test-fixture';
import { issuePatternImportDxfProductSavedAnnularObservedPlacementV3 } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-annular-observed-placement-garment-session-v1';
import {
  getObservedPlacementSidecarIssuedLifetimeV3,
  disposeObservedPlacementSidecarIssuedV3,
  projectObservedPlacementSidecarIssuedV3,
  type ObservedPlacementSidecarIssuedOwnerV3,
} from 'components/cloth-simulation-spike/observed-placement-sidecar-issuer-v3';
import { getSavedModelDisplayedTriangleBodyLifetimeV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import type { PatternImportDxfProductSavedGarmentMeshIngressRequestV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
  buildPatternImportDxfProductPhaseEExactTopologyBindingV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductMultiseamPlacementSidecarV3,
  decodePatternImportDxfProductMultiseamPlacementSidecarV3,
  encodePatternImportDxfProductMultiseamPlacementSidecarV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v3';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v3';
import { createObservedPlacementPairCubeBodyFixtureV1 } from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from 'components/cloth-simulation-spike/saved-model-observed-placement-target-v1';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2 } from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import { readPatternImportDxfProductCompositeObservedPlacementV3 } from './composite-placement-read-v1';
import { createPatternImportDxfProductCompositeObservedPlacementSaverV3 } from './composite-placement-save-v1';
import { createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1 } from './saved-assembly-topology-hash-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
} from './saved-assembly-authority-transport-v1';
import { createPatternImportDxfProductSavedPlacementContextV1 } from './saved-placement-context-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
type FirstFixture = Parameters<Parameters<typeof withObservedFirstSaveFixtureV3>[0]>[0];

// All compiler/D0/issuer/codec/saver/reader owners are real. Only AO/RPC/storage transport and
// nominal asset/station inputs are fixtures; the observed closed cube is synthetic CPU host data.
// This proves host wiring and lifetime, not server, viewport, body physics, or runtime admission.
async function prepareContext(
  f: FirstFixture,
  source: PatternImportDxfProductSavedGarmentMeshIngressRequestV1,
) {
  const compiled = await f.session.consume(source);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled));
  const seed = f.seed;
  const snapshot = compiled.compile.composerSnapshot;
  const selectedOperationNumber = snapshot.assembly.sourceOperationNumber;
  const adapted = adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2(
    seed.assembly,
    selectedOperationNumber,
  );
  if (!adapted.ok) throw new Error(adapted.blockers[0].detail);
  const serverTopologySha256 =
    await createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1().computeCanonicalSha256(
      adapted.existingAssembly,
      new AbortController().signal,
    );
  const serverAssemblyRevision = 'assembly:canonical:tx-000007';
  const composition = source.compositionRequest;
  const exact = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
    JSON.parse(
      JSON.stringify({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_EXACT_TOPOLOGY_BINDING_REQUEST_V1,
        current: {
          row: seed.row,
          serverAssemblyRevision,
          assemblyTopologySha256: serverTopologySha256,
          selectedOperation: {
            sourceOperationNumber: composition.proposal.operation.sourceOperationNumber,
            authoringOperationId: composition.proposal.operation.authoringOperationId,
            seamIds: [...composition.proposal.operation.seamIds],
            localOperationOrder: 0,
          },
          catalogCanonicalSha256: snapshot.seals.catalogCanonicalSha256,
          proposalFingerprint: snapshot.seals.proposalFingerprint,
          phaseEAggregatePlanSha256: snapshot.seals.phaseEPlanSha256,
        },
        catalog: composition.catalog,
        proposal: composition.proposal,
        choices: composition.choices,
      }),
    ),
  );
  if (!exact.ok) throw new Error(`exact: ${exact.blockers[0].detail}`);
  const encodedExact = await encodePatternImportDxfProductExactTopologyComponentV3(exact.owner);
  if (!encodedExact.ok) throw new Error(encodedExact.blocker.detail);
  const outer = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: {
      row: seed.row,
      serverAssemblyRevision,
      assemblyTopologySha256: serverTopologySha256,
    },
    expectedPreviousSidecarSha256: null,
    semanticProductV1Bytes: f.semanticBytes,
    exactTopologyBytes: encodedExact.bytes,
    placementV2Bytes: null,
  });
  if (!outer.ok) throw new Error(`outer: ${outer.blockers[0].detail}`);
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(outer.owner);
  if (!encoded.ok) throw new Error('Outer encoding failed');
  const transport: PatternImportDxfPhaseESavedAssemblyTransportResponseV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
    row: seed.row,
    selectedOperationNumber,
    serverAssemblyRevision,
    serverTopologySha256,
    operations: seed.assembly.ops.map((op) => ({
      operationNumber: op.number,
      work: op.work,
      inputKeys: op.inputKeys,
      outputUnitKey: op.outputUnitKey,
      outputUnitName: op.outputUnitName,
      seamKeys: op.seamKeys ?? [],
    })),
    selectedSeams: seed.assembly.seams.map((seam) => {
      if (!('sideA' in seam)) throw new Error('Exact test seam required');
      const anchors = (values: typeof seam.sideA) =>
        values.map((anchor) => ({
          pieceLineKey: anchor.pieceLineKey,
          edgeHint: anchor.edgeHint,
          rangeFrom: anchor.range[0],
          rangeTo: anchor.range[1],
          lenMm: anchor.lenMm,
          contourSig: anchor.contourSig,
          samples: anchor.samples.map(([u, v]) => ({ u, v })),
          ...(anchor.layer ? { layer: anchor.layer } : {}),
        }));
      return {
        seamKey: seam.seamKey,
        status: 'confirmed',
        stale: seam.stale,
        kind: seam.kind,
        direction: seam.direction,
        source: seam.source,
        anchoredSize: seam.anchoredSize,
        sideA: anchors(seam.sideA),
        sideB: anchors(seam.sideB),
      };
    }),
    sidecar: {
      status: 'composite-v3',
      mediaType: outer.document.mediaType,
      sha256: encoded.canonicalSha256,
      byteLength: encoded.canonicalByteLength,
      bytes: encoded.bytes,
      downloadUrl: null,
    },
  };

  Object.assign(f.storage.stored, {
    sidecarSha256: encoded.canonicalSha256,
    byteLength: encoded.canonicalByteLength,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
  });
  const readSnapshot = vi.fn(async () => {
    const stored = f.storage.stored;
    return structuredClone({
      ...transport,
      sidecar: {
        mediaType: outer.document.mediaType,
        downloadUrl: null,
        status: 'composite-v3' as const,
        sha256: stored.sidecarSha256!,
        byteLength: stored.byteLength!,
        bytes: new Uint8Array(Buffer.from(stored.sidecarBytes!, 'base64')),
      },
    });
  });
  const state = { onRead: () => {} };
  const input = {
    row: seed.row,
    compiled: { generation: compiled.generation, composerSnapshot: snapshot },
    readCurrentSession: () => {
      state.onRead();
      return f.session.snapshot();
    },
  };
  const context = createPatternImportDxfProductSavedPlacementContextV1(input, {
    readSavedAssemblySnapshot: readSnapshot,
  });
  const issue = async () => {
    const result = await issuePatternImportDxfProductSavedAnnularObservedPlacementV3(f.session, {
      ...f.intent,
      expectedGeneration: compiled.generation,
      readCurrentEvidence: context.readCurrentEvidence,
      displayedBodyOwner: f.body.bodyOwner,
      displayedBodyBinding: f.body.binding,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.owner;
  };
  const save = async (owner: ObservedPlacementSidecarIssuedOwnerV3) => {
    const bound = await context.bindConfirmedObservedPlacement(owner);
    const { expectedPreviousOuterSha256, ...current } = bound;
    const saver = createPatternImportDxfProductCompositeObservedPlacementSaverV3({
      createClient: () => ({
        GetTechCardPatternSemanticSidecar: f.get,
        PutTechCardPatternSemanticSidecar: f.put,
      }),
      readCurrentEvidence: context.readSaveCurrent,
    });
    const result = await saver.save({
      confirmed: true,
      placementOwner: owner,
      expectedPreviousOuterSha256,
      current,
    });
    return { result, bound };
  };
  const freshRead = async (active = context) => {
    const bound = await active.bindExistingObservedPlacement();
    if (!bound) throw new Error('No persisted fixture placement.');
    return readPatternImportDxfProductCompositeObservedPlacementV3(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V3,
        expectedRow: bound.authority.row,
        expectedBindings: bound.placementBindings,
      },
      bound.authority.serverAssemblyRevision,
      {
        getSidecar: async () => ({ status: 'found', row: (await f.get()).semanticSidecar }),
        readCurrentEvidence: active.readPlacementCurrent,
      },
    );
  };
  return { f, compiled, context, input, readSnapshot, transport, state, issue, save, freshRead };
}
type ContextFixture = Awaited<ReturnType<typeof prepareContext>>;
async function withContext(run: (f: ContextFixture) => Promise<void>) {
  await withObservedFirstSaveFixtureV3((f) =>
    withFirstSaveSourceV3(async (source) => {
      const current = await prepareContext(f, source);
      try {
        await run(current);
      } finally {
        current.context.dispose();
      }
    }),
  );
}

async function replacePlacement(f: ContextFixture, bytes: Uint8Array) {
  const before = await decodePatternImportDxfProductCompositeSidecarV3(
    new Uint8Array(Buffer.from(f.f.storage.stored.sidecarBytes!, 'base64')),
  );
  if (!before.ok) throw new Error(JSON.stringify(before));
  const rebuilt = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: before.document.bindings,
    expectedPreviousSidecarSha256: before.seal.canonicalSha256,
    semanticProductV1Bytes: readPatternImportDxfProductCompositeComponentBytesV3(
      before.owner,
      'semantic-product-v1',
    )!,
    exactTopologyBytes: readPatternImportDxfProductCompositeComponentBytesV3(
      before.owner,
      'phase-e-exact-topology-v1',
    ),
    placementV2Bytes: null,
    placementV3Bytes: bytes,
  });
  if (!rebuilt.ok) throw new Error(JSON.stringify(rebuilt));
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(rebuilt.owner);
  if (!encoded.ok) throw new Error('Replacement fixture encode failed.');
  Object.assign(f.f.storage.stored, {
    sidecarSha256: encoded.canonicalSha256,
    byteLength: encoded.canonicalByteLength,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
  });
}

describe('observed V3 transactional placement context', () => {
  it('issues without Placement, saves through existing CAS, restores with a fresh reader and advances the genuine source', async () => {
    await withContext(async (f) => {
      const initial = await f.context.readObserved();
      expect(initial.existingObservedPlacement).toBeNull();
      expect(await f.context.bindExistingObservedPlacement()).toBeNull();
      expect(Object.keys(await f.context.read()).sort()).toEqual(
        ['authority', 'evidence', 'existingPlacement', 'expectedPreviousOuterSha256'].sort(),
      );
      const issued = await f.issue();
      const projected = await projectObservedPlacementSidecarIssuedV3(issued);
      expect(projected).not.toBeNull();
      const saved = await f.save(issued);
      expect(saved.result.ok, JSON.stringify(saved.result)).toBe(true);
      expect(f.f.put).toHaveBeenCalledTimes(1);
      expect(f.f.put.mock.calls[0]![0].expectedPreviousSidecarSha256).toBe(
        initial.expectedPreviousOuterSha256,
      );
      const restored = createPatternImportDxfProductSavedPlacementContextV1(f.input, {
        readSavedAssemblySnapshot: f.readSnapshot,
      });
      try {
        const calls = f.readSnapshot.mock.calls.length;
        const metadata = await restored.readObserved();
        expect(metadata.existingObservedPlacement?.canonicalSha256).toBe(
          projected!.canonicalSha256,
        );
        expect(await restored.bindExistingPlacement()).toBeNull();
        const read = await f.freshRead(restored);
        expect(read.ok, JSON.stringify(read)).toBe(true);
        if (!read.ok) throw new Error(JSON.stringify(read));
        expect(
          isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV3(read.owner),
        ).toBe(true);
        expect(read.owner.claims).toMatchObject({
          decodedTargetAuthenticatesBody: false,
          bodyAdmission: false,
          runtimeAdmission: false,
        });
        expect(f.readSnapshot.mock.calls.length).toBeGreaterThan(calls + 2);
        const advanced = await f.f.session.advanceSavedGarment({
          expectedGeneration: f.compiled.generation,
          readCurrentPlacement: async () => {
            const current = await f.freshRead(restored);
            if (!current.ok) throw new Error(JSON.stringify(current));
            return current.owner;
          },
        });
        expect(advanced.ok, JSON.stringify(advanced)).toBe(true);
        // Source advancement retires its issued child. Restore remains detached from that child.
        expect(getObservedPlacementSidecarIssuedLifetimeV3(issued)).toBeNull();
        expect((await f.freshRead(restored)).ok).toBe(true);
        expect(f.f.put).toHaveBeenCalledTimes(1);
      } finally {
        restored.dispose();
      }
    });
  }, 120_000);

  it('rejects structural, copied, proxy and raw codec owners without accepting them as confirmed issuance', async () => {
    await withContext(async (f) => {
      const issued = await f.issue();
      const projected = await projectObservedPlacementSidecarIssuedV3(issued);
      if (!projected) throw new Error('No issued fixture.');
      const codec = await decodePatternImportDxfProductMultiseamPlacementSidecarV3(projected.bytes);
      if (!codec.ok) throw new Error(JSON.stringify(codec));
      const calls = f.readSnapshot.mock.calls.length;
      const hostile = new Proxy(
        {},
        {
          get() {
            throw new Error('Owner fields must not be read.');
          },
        },
      );
      for (const candidate of [{ ...issued }, new Proxy(issued, {}), codec.owner, hostile]) {
        await expect(
          f.context.bindConfirmedObservedPlacement(
            candidate as ObservedPlacementSidecarIssuedOwnerV3,
          ),
        ).rejects.toThrow('genuine live observed');
      }
      expect(f.readSnapshot.mock.calls.length).toBe(calls);
      expect(f.f.put).not.toHaveBeenCalled();
      expect(getObservedPlacementSidecarIssuedLifetimeV3(issued)?.aborted).toBe(false);
    });
  }, 120_000);

  it('pins full V3 target bytes across a valid same-bindings outer replacement', async () => {
    await withContext(async (f) => {
      const issued = await f.issue();
      const saved = await f.save(issued);
      expect(saved.result.ok, JSON.stringify(saved.result)).toBe(true);
      const metadata = (await f.context.readObserved()).existingObservedPlacement!;
      const original = metadata.document;
      const otherBody = await createObservedPlacementPairCubeBodyFixtureV1(732);
      try {
        const target = await projectSavedModelObservedPlacementTargetV1(
          otherBody.bodyOwner,
          otherBody.binding,
        );
        if (!target.ok) throw new Error(target.detail);
        expect(target.canonicalSha256).not.toBe(
          original.placementAuthoring.observedTarget.canonicalSha256,
        );
        const changed = await buildPatternImportDxfProductMultiseamPlacementSidecarV3({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
          bindings: original.bindings,
          placementAuthoring: {
            ...original.placementAuthoring,
            observedTarget: { target: target.target, canonicalSha256: target.canonicalSha256 },
          },
        });
        if (!changed.ok) throw new Error(JSON.stringify(changed));
        const encoded = encodePatternImportDxfProductMultiseamPlacementSidecarV3(changed.owner);
        if (!encoded.ok) throw new Error('Changed fixture encode failed.');
        await replacePlacement(f, encoded.bytes);
        const expected = {
          row: saved.bound.authority.row,
          topology: saved.bound.placementBindings.topology,
          serverAssemblyRevision: saved.bound.authority.serverAssemblyRevision,
        };
        await expect(
          f.context.readPlacementCurrent(expected, new AbortController().signal),
        ).rejects.toThrow('target changed');
        // Explicit restore may bind the new decoded metadata; it does not authenticate that body.
        const rebound = await f.context.bindExistingObservedPlacement();
        expect(rebound?.placementBindings).toEqual(original.bindings);
        expect((await f.context.readObserved()).existingObservedPlacement?.canonicalSha256).toBe(
          encoded.canonicalSha256,
        );
        expect(f.f.put).toHaveBeenCalledTimes(1);
        const foreign = await buildPatternImportDxfProductMultiseamPlacementSidecarV3({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_REQUEST_V3,
          bindings: {
            ...original.bindings,
            source: { ...original.bindings.source, catalogCanonicalSha256: 'f'.repeat(64) },
          },
          placementAuthoring: changed.document.placementAuthoring,
        });
        if (!foreign.ok) throw new Error(JSON.stringify(foreign));
        const foreignBytes = encodePatternImportDxfProductMultiseamPlacementSidecarV3(
          foreign.owner,
        );
        if (!foreignBytes.ok) throw new Error('Foreign fixture encode failed.');
        await replacePlacement(f, foreignBytes.bytes);
        await expect(f.context.bindExistingObservedPlacement()).rejects.toThrow(
          'current compiled source',
        );
      } finally {
        otherBody.dispose();
      }
    });
  }, 120_000);

  it('cancels a pending borrowed issuer projection promptly without revoking issuer or body', async () => {
    await withContext(async (f) => {
      const issued = await f.issue();
      const issuerLife = getObservedPlacementSidecarIssuedLifetimeV3(issued)!;
      const bodyLife = getSavedModelDisplayedTriangleBodyLifetimeV2(
        f.f.body.bodyOwner,
        f.f.body.binding,
      )!;
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.f.body.hooks.beforeReadModel = async () => {
        entered();
        await pending;
      };
      const controller = new AbortController();
      Object.defineProperty(controller.signal, 'addEventListener', {
        get() {
          throw new Error('Caller member touched');
        },
      });
      Object.defineProperty(controller.signal, 'removeEventListener', {
        get() {
          throw new Error('Caller member touched');
        },
      });
      const operation = f.context.bindConfirmedObservedPlacement(issued, controller.signal);
      const rejected = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await started;
      controller.abort();
      await rejected;
      expect(issuerLife.aborted).toBe(false);
      expect(bodyLife.aborted).toBe(false);
      f.f.body.hooks.beforeReadModel = undefined;
      release();
      expect(await projectObservedPlacementSidecarIssuedV3(issued)).not.toBeNull();
      expect(await f.context.bindConfirmedObservedPlacement(issued)).toBeTruthy();
    });
  }, 120_000);

  it('does not overwrite a newer restore binding when an earlier confirmed bind resumes', async () => {
    await withContext(async (f) => {
      const issued = await f.issue();
      const saved = await f.save(issued);
      expect(saved.result.ok, JSON.stringify(saved.result)).toBe(true);
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.f.body.hooks.beforeReadModel = async () => {
        entered();
        await pending;
      };
      const operation = f.context.bindConfirmedObservedPlacement(issued);
      const rejected = expect(operation).rejects.toThrow('binding changed');
      await started;
      const restored = await f.context.bindExistingObservedPlacement();
      expect(restored).not.toBeNull();
      f.f.body.hooks.beforeReadModel = undefined;
      release();
      await rejected;
      expect(getObservedPlacementSidecarIssuedLifetimeV3(issued)?.aborted).toBe(false);
      expect((await f.freshRead()).ok).toBe(true);
    });
  }, 120_000);

  it('refuses issuer disposal by the final host poll and preserves the prior binding', async () => {
    await withContext(async (f) => {
      const issued = await f.issue();
      let count = 0;
      f.state.onRead = () => {
        count++;
      };
      const previous = await f.context.bindConfirmedObservedPlacement(issued);
      const finalPoll = count;
      count = 0;
      f.state.onRead = () => {
        if (++count === finalPoll) disposeObservedPlacementSidecarIssuedV3(issued);
      };
      await expect(f.context.bindConfirmedObservedPlacement(issued)).rejects.toThrow(
        'issuer changed',
      );
      expect(count).toBe(finalPoll);
      f.state.onRead = () => {};
      const { expectedPreviousOuterSha256: _sha, ...current } = previous;
      expect(_sha).toMatch(/^[a-f0-9]{64}$/);
      expect(await f.context.readSaveCurrent(current, new AbortController().signal)).toEqual(
        current,
      );
      expect(
        getSavedModelDisplayedTriangleBodyLifetimeV2(f.f.body.bodyOwner, f.f.body.binding)?.aborted,
      ).toBe(false);
    });
  }, 120_000);

  it('refuses host reentrant context disposal and native caller cancellation before RPC', async () => {
    await withContext(async (f) => {
      const controller = new AbortController();
      f.state.onRead = () => controller.abort();
      const calls = f.readSnapshot.mock.calls.length;
      await expect(f.context.readObserved(controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect(f.readSnapshot.mock.calls.length).toBe(calls);
      f.state.onRead = () => f.context.dispose();
      await expect(f.context.readObserved()).rejects.toThrow('disposed');
      expect(f.readSnapshot.mock.calls.length).toBe(calls);
      expect(
        getSavedModelDisplayedTriangleBodyLifetimeV2(f.f.body.bodyOwner, f.f.body.binding)?.aborted,
      ).toBe(false);
    });
  }, 120_000);

  it('rejects compile replacement after the captured RPC and disposes a pending read promptly', async () => {
    await withContext(async (f) => {
      let entered!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const captured = await f.readSnapshot();
      f.readSnapshot.mockImplementationOnce(async () => {
        entered();
        await pending;
        return captured;
      });
      const operation = f.context.readObserved();
      const rejected = expect(operation).rejects.toThrow('cancelled');
      await started;
      f.context.dispose();
      await rejected;
      release();
      const replacement = createPatternImportDxfProductSavedPlacementContextV1(f.input, {
        readSavedAssemblySnapshot: async () => {
          f.f.session.dispose();
          return captured;
        },
      });
      try {
        await expect(replacement.readObserved()).rejects.toThrow('generation or owner changed');
      } finally {
        replacement.dispose();
      }
      expect(
        getSavedModelDisplayedTriangleBodyLifetimeV2(f.f.body.bodyOwner, f.f.body.binding)?.aborted,
      ).toBe(false);
    });
  }, 120_000);
});
