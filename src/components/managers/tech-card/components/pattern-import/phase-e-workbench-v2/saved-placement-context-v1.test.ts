import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1,
  withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-saved-canonical-medium-annular-evidence-v1.test-fixture';
import { createPatternImportDxfProductSavedGarmentMeshCompileSessionV1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-compile-session-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-saved-garment-mesh-ingress-v1';
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
  buildPatternImportDxfProductMultiseamPlacementSidecarV2,
  encodePatternImportDxfProductMultiseamPlacementSidecarV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-v2';
import {
  PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
  isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2,
} from 'lib/cloth/domain/pattern-import-dxf-product-multiseam-placement-sidecar-read-v2';
import { createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-canonical-medium-actual-body-session-v1.test-fixture';
import { createPatternImportDxfProductSavedPlacementRequestV1Fixture } from 'components/cloth-simulation-spike/pattern-import-dxf-product-saved-placement-authored-input-v1.test-fixture';
import { BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 } from 'components/cloth-simulation-spike/beta-skirt-g3b2-preview-mannequin-request-v1';
import { adaptPatternImportDxfPhaseEWorkbenchExistingAssemblyMultiseamV2 } from '../phase-e-workbench-existing-assembly-multiseam-adapter-v2';
import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import { readPatternImportDxfProductCompositePlacementV1 } from './composite-placement-read-v1';
import { createPatternImportDxfPhaseESavedAssemblyTopologyHashContractV1 } from './saved-assembly-topology-hash-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_SAVED_ASSEMBLY_TRANSPORT_RESPONSE_V1,
  type PatternImportDxfPhaseESavedAssemblyTransportResponseV1,
} from './saved-assembly-authority-transport-v1';
import {
  createPatternImportDxfProductSavedPlacementContextV1,
  type PatternImportDxfProductSavedPlacementContextInputV1,
} from './saved-placement-context-v1';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
let seed: Awaited<
  ReturnType<typeof createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1>
>;
beforeAll(async () => {
  seed = await createPatternImportDxfProductSavedCanonicalMediumAnnularSeedV1();
}, 120_000);

// Genuine saved compiler and exact-carrier producers. RPC and historical semantic transport are
// CPU doubles; these tests do not claim server acceptance, actual-body admission, or cloth physics.
async function withContext(
  run: (test: {
    context: ReturnType<typeof createPatternImportDxfProductSavedPlacementContextV1>;
    input: PatternImportDxfProductSavedPlacementContextInputV1;
    transport: PatternImportDxfPhaseESavedAssemblyTransportResponseV1;
    readSnapshot: ReturnType<
      typeof vi.fn<() => Promise<PatternImportDxfPhaseESavedAssemblyTransportResponseV1>>
    >;
    session: ReturnType<
      typeof createPatternImportDxfProductSavedGarmentMeshCompileSessionV1<
        never,
        never,
        object,
        never
      >
    >;
    makePlacement: () => ReturnType<
      ReturnType<
        typeof createPatternImportDxfProductSavedGarmentMeshCompileSessionV1
      >['buildLatestConfirmedPlacementSidecar']
    >;
  }) => Promise<void>,
) {
  await withPatternImportDxfProductSavedCanonicalMediumAnnularSavedSessionInputsV2(
    seed,
    async (inputs) => {
      const session = createPatternImportDxfProductSavedGarmentMeshCompileSessionV1();
      let context: ReturnType<typeof createPatternImportDxfProductSavedPlacementContextV1> | null =
        null;
      try {
        const compiled = await session.consume({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_SAVED_GARMENT_MESH_INGRESS_REQUEST_V1,
          sourceOwner: inputs.sourceOwner,
          compositionRequest: inputs.compositionRequest,
          targetEdgeMm: inputs.targetEdgeMm,
        });
        if (!compiled.ok) throw new Error(compiled.blockers[0].detail);
        const snapshot = compiled.composerSnapshot;
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
        const composition = inputs.compositionRequest;
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
        const encodedExact = await encodePatternImportDxfProductExactTopologyComponentV3(
          exact.owner,
        );
        if (!encodedExact.ok) throw new Error(encodedExact.blocker.detail);
        const semantic = semanticDocument(seed.row, 4);
        semantic.persistence.pieceLineKeys = ['piece-front', 'piece-back'];
        semantic.persistence.pattern.sizeId = 7;
        semantic.persistence.card.observedLockVersion = seed.row.cardLockVersion - 1;
        semantic.persistence.card.previousLockVersion = seed.row.cardLockVersion - 2;
        const outer = await buildPatternImportDxfProductCompositeSidecarV3({
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
          bindings: {
            row: seed.row,
            serverAssemblyRevision,
            assemblyTopologySha256: serverTopologySha256,
          },
          expectedPreviousSidecarSha256: null,
          semanticProductV1Bytes: bytesOf(semantic),
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
        const readSnapshot = vi.fn(async () => structuredClone(transport));
        const input = {
          row: seed.row,
          compiled: { generation: compiled.generation, composerSnapshot: snapshot },
          readCurrentSession: () => session.snapshot(),
        };
        context = createPatternImportDxfProductSavedPlacementContextV1(input, {
          readSavedAssemblySnapshot: readSnapshot,
        });
        const activeContext = context;
        const makePlacement = async () => {
          const authored = createPatternImportDxfProductSavedCanonicalMediumAuthoredInputV1Fixture({
            composerSnapshot: snapshot,
            composerProjection: session.projectLatest()!,
            mannequin: {
              status: 'ready',
              composition: { displayBinding: BETA_SKIRT_G3B2_PREVIEW_MANNEQUIN_REQUEST_V1 },
            } as never,
          });
          const fixture = await createPatternImportDxfProductSavedPlacementRequestV1Fixture({
            composerSnapshot: snapshot,
            composerProjection: session.projectLatest()!,
            compositionRequest: composition,
            savedRow: seed.row,
            authored,
          });
          return session.buildLatestConfirmedPlacementSidecar({
            expectedGeneration: compiled.generation,
            confirmed: true,
            garment: authored.semantics.garment,
            body: authored.semantics.body,
            policy: authored.semantics.policy,
            annularParameters: fixture.placementAuthoring.annular.parameters,
            operation: {
              sourceOperationNumber: selectedOperationNumber,
              pieceIds: snapshot.assembly.pieceIds,
              seamIds: snapshot.assembly.seamIds,
            },
            bodyIntent: {
              kind: 'confirmed-neutral-A-target',
              confirmed: true,
              displayedBodyAdmission: false,
            },
            readCurrentEvidence: activeContext.readCurrentEvidence,
          });
        };
        await run({ context, input, transport, readSnapshot, session, makePlacement });
      } finally {
        context?.dispose();
        session.dispose();
      }
    },
  );
}

describe('saved placement current V3 context', () => {
  it('restores existing persisted placement through the fresh reader without new authoring', async () => {
    await withContext(async ({ context, input, transport, readSnapshot, makePlacement }) => {
      expect((await context.read()).existingPlacement).toBeNull();
      expect(await context.bindExistingPlacement()).toBeNull();
      const produced = await makePlacement();
      if (!produced.ok) throw new Error(produced.blocker.detail);
      const { expectedPreviousOuterSha256: oldOuterSha, ...beforeWrite } =
        context.bindConfirmedPlacement(produced.owner);
      const placement = encodePatternImportDxfProductMultiseamPlacementSidecarV2(produced.owner);
      if (!placement.ok || transport.sidecar?.status !== 'composite-v3')
        throw new Error('Fixture owner unavailable');
      const previous = await decodePatternImportDxfProductCompositeSidecarV3(
        transport.sidecar.bytes,
      );
      if (!previous.ok) throw new Error(previous.blockers[0].detail);
      const replaced = await buildPatternImportDxfProductCompositeSidecarV3({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
        bindings: previous.document.bindings,
        expectedPreviousSidecarSha256: previous.seal.canonicalSha256,
        semanticProductV1Bytes: readPatternImportDxfProductCompositeComponentBytesV3(
          previous.owner,
          'semantic-product-v1',
        )!,
        exactTopologyBytes: readPatternImportDxfProductCompositeComponentBytesV3(
          previous.owner,
          'phase-e-exact-topology-v1',
        ),
        placementV2Bytes: placement.bytes,
      });
      if (!replaced.ok) throw new Error(replaced.blockers[0].detail);
      const encoded = encodePatternImportDxfProductCompositeSidecarV3(replaced.owner);
      if (!encoded.ok) throw new Error('Fixture outer encode failed');
      Object.assign(transport, {
        sidecar: {
          ...transport.sidecar,
          bytes: encoded.bytes,
          sha256: encoded.canonicalSha256,
          byteLength: encoded.canonicalByteLength,
        },
      });
      expect(encoded.canonicalSha256).not.toBe(oldOuterSha);
      expect(await context.readSaveCurrent(beforeWrite, new AbortController().signal)).toEqual(
        beforeWrite,
      );
      const reloaded = createPatternImportDxfProductSavedPlacementContextV1(input, {
        readSavedAssemblySnapshot: readSnapshot,
      });
      try {
        const observed = await reloaded.read();
        expect(observed.existingPlacement?.canonicalSha256).toBe(placement.canonicalSha256);
        expect(observed.existingPlacement?.document.claims.placementAdmitted).toBe(false);
        const bound = await reloaded.bindExistingPlacement();
        if (!bound) throw new Error('Persisted placement was not bound');
        expect(bound.placementBindings).toEqual(produced.owner.document.bindings);
        const identity = bound.placementBindings.row;
        const result = await readPatternImportDxfProductCompositePlacementV1(
          {
            schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_MULTISEAM_PLACEMENT_SIDECAR_READ_REQUEST_V2,
            expectedRow: seed.row,
            expectedBindings: bound.placementBindings,
          },
          bound.authority.serverAssemblyRevision,
          {
            readCurrentEvidence: reloaded.readPlacementCurrent,
            getSidecar: async () => ({
              status: 'found',
              row: {
                techCardId: identity.techCardId,
                patternLineKey: identity.patternLineKey,
                dxfSha256: identity.dxfSha256,
                patternVersion: identity.patternVersion,
                savedRowRevision: identity.revision,
                cardLockVersion: identity.cardLockVersion,
                postSaveReceiptSha256: identity.postSaveReceiptSha256,
                mediaType: replaced.document.mediaType,
                sidecarSha256: encoded.canonicalSha256,
                byteLength: encoded.canonicalByteLength,
                createdAt: undefined,
                createdBy: undefined,
                sidecarBytes: btoa(
                  Array.from(encoded.bytes, (byte) => String.fromCharCode(byte)).join(''),
                ),
              },
            }),
          },
        );
        expect(result, JSON.stringify(result)).toMatchObject({
          ok: true,
          compatibility: 'placement-v2',
        });
        expect(
          isPatternImportDxfProductMultiseamPlacementSidecarVerifiedReadOwnerV2(result.owner),
        ).toBe(true);
      } finally {
        reloaded.dispose();
      }
    });
  }, 120_000);
  it('uses one real-validated captured snapshot per read and binds genuine private producer output', async () => {
    await withContext(async ({ context, readSnapshot, makePlacement, input }) => {
      const current = await context.read();
      expect(readSnapshot).toHaveBeenCalledTimes(1);
      expect(current.evidence.placementOperation).toMatchObject({
        documentId: input.compiled.composerSnapshot.assembly.documentId,
        pieceLineKeys: ['piece-back', 'piece-front'],
        seamIds: ['side-close', 'side-open'],
      });
      const produced = await makePlacement();
      expect(produced, JSON.stringify(produced)).toMatchObject({ ok: true });
      if (!produced.ok) throw new Error(produced.blocker.detail);
      const bound = context.bindConfirmedPlacement(produced.owner);
      expect(bound.placementBindings.row).toMatchObject({
        patternVersion: 4,
        revision: 7,
        sizeId: 7,
      });
      const { expectedPreviousOuterSha256, ...saveCurrent } = bound;
      expect(expectedPreviousOuterSha256).toBe(current.expectedPreviousOuterSha256);
      expect(await context.readSaveCurrent(saveCurrent, new AbortController().signal)).toEqual(
        saveCurrent,
      );
      const readCurrent = {
        row: saveCurrent.authority.row,
        topology: saveCurrent.placementBindings.topology,
        serverAssemblyRevision: saveCurrent.authority.serverAssemblyRevision,
      };
      expect(await context.readPlacementCurrent(readCurrent, new AbortController().signal)).toEqual(
        readCurrent,
      );
      expect(readSnapshot).toHaveBeenCalledTimes(5);
      Object.assign(bound.placementBindings.source, { phase2ArtifactSha256: 'f'.repeat(64) });
      await expect(
        context.readSaveCurrent(
          { ...saveCurrent, placementBindings: bound.placementBindings },
          new AbortController().signal,
        ),
      ).rejects.toThrow('saver context');
      current.evidence.semanticBytes.fill(0);
      expect((await context.read()).evidence.semanticBytes[0]).toBe('{'.charCodeAt(0));
    });
  }, 120_000);

  it('refuses caller-shaped codec owners and foreign source bindings', async () => {
    await withContext(async ({ context, makePlacement }) => {
      await context.read();
      expect(() => context.bindConfirmedPlacement({} as never)).toThrow('genuine Placement V2');
      const produced = await makePlacement();
      if (!produced.ok) throw new Error(produced.blocker.detail);
      const changed = await buildPatternImportDxfProductMultiseamPlacementSidecarV2({
        schemaVersion: 'pattern-import-dxf-product-multiseam-placement-sidecar-request/2',
        bindings: {
          ...produced.owner.document.bindings,
          source: {
            ...produced.owner.document.bindings.source,
            phase2ArtifactSha256: 'f'.repeat(64),
          },
        },
        placementAuthoring: produced.owner.document.placementAuthoring,
      });
      if (!changed.ok) throw new Error(changed.blockers[0].detail);
      expect(() => context.bindConfirmedPlacement(changed.owner)).toThrow('compiled source');
      expect(() => context.bindConfirmedPlacement({ ...produced.owner })).toThrow(
        'genuine Placement V2',
      );
    });
  }, 120_000);

  it('refuses absent/V4 carriers, corrupt bytes and inconsistent server AO hash', async () => {
    await withContext(async ({ context, transport }) => {
      const original = transport.sidecar;
      Object.assign(transport, { sidecar: { status: 'absent' } });
      await expect(context.read()).rejects.toThrow('V4 exact-N');
      Object.assign(transport, {
        sidecar: {
          status: 'legacy',
          mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v4+json',
        },
      });
      await expect(context.read()).rejects.toThrow('V4 exact-N');
      if (original?.status !== 'composite-v3') throw new Error('Missing test V3');
      Object.assign(transport, { sidecar: { ...original, bytes: new TextEncoder().encode('{}') } });
      await expect(context.read()).rejects.toThrow();
      Object.assign(transport, { sidecar: original, serverTopologySha256: 'f'.repeat(64) });
      await expect(context.read()).rejects.toThrow();
    });
  }, 120_000);

  it('rejects stale compile catalog/proposal/plan even when the outer codec is valid', async () => {
    await withContext(async ({ input, readSnapshot }) => {
      for (const key of [
        'catalogCanonicalSha256',
        'proposalFingerprint',
        'phaseEPlanSha256',
      ] as const) {
        const changed = structuredClone(input.compiled);
        Object.assign(changed.composerSnapshot.seals, {
          [key]:
            key === 'proposalFingerprint' ? 'pidpemsv2-fnv1a64:0000000000000000' : 'f'.repeat(64),
        });
        const context = createPatternImportDxfProductSavedPlacementContextV1(
          { ...input, compiled: changed },
          { readSavedAssemblySnapshot: readSnapshot },
        );
        try {
          await expect(context.read()).rejects.toThrow('catalog, proposal, plan');
        } finally {
          context.dispose();
        }
      }
    });
  }, 120_000);

  it('checks exact generation before and after RPC, cancellation, and context disposal', async () => {
    await withContext(async ({ input, transport, session }) => {
      let readCount = 0;
      const controller = new AbortController();
      const context = createPatternImportDxfProductSavedPlacementContextV1(input, {
        readSavedAssemblySnapshot: async () => {
          readCount += 1;
          controller.abort();
          return transport;
        },
      });
      await expect(context.read(controller.signal)).rejects.toThrow('cancelled');
      expect(readCount).toBe(1);
      context.dispose();
      await expect(context.read()).rejects.toThrow('disposed');
      const stale = createPatternImportDxfProductSavedPlacementContextV1(input, {
        readSavedAssemblySnapshot: async () => {
          session.dispose();
          return transport;
        },
      });
      try {
        await expect(stale.read()).rejects.toThrow('generation or owner changed');
      } finally {
        stale.dispose();
      }
      expect(() =>
        createPatternImportDxfProductSavedPlacementContextV1(input, {
          readSavedAssemblySnapshot: async () => transport,
        }),
      ).toThrow('generation or owner changed');
    });
  }, 120_000);

  it('refuses a replaced confirmed binding during a pending persistence context read', async () => {
    await withContext(async ({ context, readSnapshot, transport, makePlacement }) => {
      const produced = await makePlacement();
      if (!produced.ok) throw new Error(produced.blocker.detail);
      const { expectedPreviousOuterSha256: _sha, ...current } = context.bindConfirmedPlacement(
        produced.owner,
      );
      expect(_sha).toMatch(/^[0-9a-f]{64}$/);
      readSnapshot.mockImplementationOnce(async () => {
        context.bindConfirmedPlacement(produced.owner);
        return structuredClone(transport);
      });
      await expect(context.readSaveCurrent(current, new AbortController().signal)).rejects.toThrow(
        'binding changed',
      );
    });
  }, 120_000);

  it('pins historical semantic bytes across a valid outer envelope replacement', async () => {
    await withContext(async ({ context, transport, makePlacement }) => {
      const produced = await makePlacement();
      if (!produced.ok || transport.sidecar?.status !== 'composite-v3')
        throw new Error('Fixture source unavailable');
      const { expectedPreviousOuterSha256, ...current } = context.bindConfirmedPlacement(
        produced.owner,
      );
      const decoded = await decodePatternImportDxfProductCompositeSidecarV3(
        transport.sidecar.bytes,
      );
      if (!decoded.ok) throw new Error(decoded.blockers[0].detail);
      const previousBytes = readPatternImportDxfProductCompositeComponentBytesV3(
        decoded.owner,
        'semantic-product-v1',
      )!;
      const semantic = JSON.parse(new TextDecoder().decode(previousBytes));
      semantic.product.phaseEPlanSha256 = 'f'.repeat(64);
      const changed = await buildPatternImportDxfProductCompositeSidecarV3({
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
        bindings: decoded.document.bindings,
        expectedPreviousSidecarSha256: expectedPreviousOuterSha256,
        semanticProductV1Bytes: bytesOf(semantic),
        placementV2Bytes: null,
        exactTopologyBytes: readPatternImportDxfProductCompositeComponentBytesV3(
          decoded.owner,
          'phase-e-exact-topology-v1',
        ),
      });
      if (!changed.ok) throw new Error(changed.blockers[0].detail);
      const encoded = encodePatternImportDxfProductCompositeSidecarV3(changed.owner);
      if (!encoded.ok) throw new Error('Fixture outer encode failed');
      Object.assign(transport, {
        sidecar: {
          ...transport.sidecar,
          bytes: encoded.bytes,
          sha256: encoded.canonicalSha256,
          byteLength: encoded.canonicalByteLength,
        },
      });
      await expect(context.readSaveCurrent(current, new AbortController().signal)).rejects.toThrow(
        'Historical semantic bytes',
      );
    });
  }, 120_000);
});
