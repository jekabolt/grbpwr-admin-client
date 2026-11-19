import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { abortableAdminService } from 'api/api';
import { validateSealedSimulationPackageV5V1 } from 'lib/cloth/compiler/simulation-package-v5-integrity';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import type {
  GetTechCardSavedAssemblySnapshotRequest,
  TechCardPatternSemanticSidecar,
} from 'api/proto-http/admin';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  decodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import {
  createSavedFullAssemblyCompileSessionV1,
  type SavedFullAssemblyCompileRequestV1,
} from './saved-full-assembly-compile-session-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  savedThreePanelCompileRequestV1,
  fullAssemblyFixtureWireV1,
  type SavedThreePanelFixtureV1,
} from './saved-full-assembly-compile-session-v1.test-fixture';
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
let seed: SavedThreePanelFixtureV1;
type Wire = Awaited<ReturnType<typeof fullAssemblyFixtureWireV1>> & {
  semanticSidecar?: TechCardPatternSemanticSidecar;
};
let editWire: ((wire: Wire, call: number) => void | Promise<void>) | undefined;
let calls = 0;
async function presentComposite(previous: string | null = null) {
  const initial = await fullAssemblyFixtureWireV1(seed, 10);
  // Genuine Composite codec bytes containing the existing explicitly synthetic storage-only
  // SemanticV1 fixture. Neither this historical component nor its seals grant full-graph authority.
  const built = await buildPatternImportDxfProductCompositeSidecarV3({
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
    bindings: {
      row: seed.row,
      serverAssemblyRevision: initial.serverAssemblyRevision,
      assemblyTopologySha256: initial.assemblyTopologySha256,
    },
    expectedPreviousSidecarSha256: previous,
    semanticProductV1Bytes: bytesOf(semanticDocument(seed.row)),
    placementV2Bytes: null,
    exactTopologyBytes: null,
  });
  if (!built.ok) throw new Error(JSON.stringify(built.blockers));
  const encoded = encodePatternImportDxfProductCompositeSidecarV3(built.owner);
  if (!encoded.ok) throw new Error('Composite encoding failed');
  expect((await decodePatternImportDxfProductCompositeSidecarV3(encoded.bytes)).ok).toBe(true);
  const envelope: TechCardPatternSemanticSidecar = {
    techCardId: seed.row.techCardId,
    patternLineKey: seed.row.patternLineKey,
    dxfSha256: seed.row.sha256,
    patternVersion: 4,
    cardLockVersion: seed.row.cardLockVersion,
    savedRowRevision: seed.row.revision,
    sidecarSha256: encoded.canonicalSha256,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V3,
    byteLength: encoded.bytes.byteLength,
    sidecarBytes: Buffer.from(encoded.bytes).toString('base64'),
    postSaveReceiptSha256: undefined,
    createdAt: undefined,
    createdBy: undefined,
  };
  return { envelope, bytes: encoded.bytes };
}
beforeAll(async () => {
  seed = await createSavedThreePanelFixtureV1();
});
beforeEach(() => {
  calls = 0;
  editWire = undefined;
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({
        GetTechCardSavedAssemblySnapshot: async (
          request: GetTechCardSavedAssemblySnapshotRequest,
        ) => {
          const wire = await fullAssemblyFixtureWireV1(seed, request.selectedOperationNumber!);
          await editWire?.(wire, ++calls);
          return wire;
        },
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
});
describe('genuine saved full-assembly source → actual compiler; mocked storage only', () => {
  it('compiles with a real encoded Composite outer and preserves its exact bytes for fresh evidence', async () => {
    const outer = await presentComposite();
    editWire = (wire) => {
      wire.semanticSidecar = structuredClone(outer.envelope);
    };
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const result = await session.consume(await savedThreePanelCompileRequestV1(seed, source));
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      expect(result.evidence?.outer.status).toBe('present');
      if (result.evidence?.outer.status !== 'present')
        throw new Error('Missing real outer evidence');
      expect(result.evidence.outer.bytes).toEqual(outer.bytes);
      expect(result.evidence.outer.sha256).toBe(outer.envelope.sidecarSha256);
      expect(result.claims.durableGraphVerified).toBe(false);
      expect((await session.projectLatest(result.generation)).evidence?.outer).toEqual(
        result.evidence.outer,
      );
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('still refuses real full-outer drift under unchanged AO revision before publication and on later read', async () => {
    const a = await presentComposite(),
      b = await presentComposite('a'.repeat(64));
    expect(a.envelope.sidecarSha256).not.toBe(b.envelope.sidecarSha256);
    let current = a;
    editWire = (wire) => {
      wire.semanticSidecar = structuredClone(current.envelope);
    };
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const result = await session.consume(await savedThreePanelCompileRequestV1(seed, source));
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      current = b;
      const stale = await session.projectLatest(result.generation);
      expect(stale.compiled).toBe(false);
      expect(stale.blockers.map((x) => x.detail).join('; ')).toMatch(/snapshot|changed|drift/i);
      expect(session.snapshot().hasArtifact).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
    current = a;
    const pendingSource = await createSavedThreePanelSourceV1(seed);
    const pendingSession = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, pendingSource);
      const boundary = calls;
      editWire = (wire, call) => {
        // One complete initial join succeeds; the next fresh stage check sees a different real
        // canonical outer under the same source/AO revision. No synthetic authority callback.
        wire.semanticSidecar = structuredClone(call > boundary + 4 ? b.envelope : a.envelope);
      };
      const result = await pendingSession.consume(request);
      expect(result.compiled).toBe(false);
      expect(result.blockers.map((x) => x.detail).join('; ')).toMatch(/snapshot|changed|drift/i);
      expect(pendingSession.snapshot().hasArtifact).toBe(false);
    } finally {
      pendingSession.dispose();
      pendingSource.dispose();
    }
  });
  it('replays the real writer/native/worker chain and keeps missing durable graph explicit', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const result = await session.consume(request);
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      expect(result.sealed).toBe(false);
      expect(result.compileResult?.blockers.map((b) => b.detail).join('; ')).toContain(
        'incoherent-rest-pair',
      );
      expect(result.compileResult?.artifact?.assembly.pieces).toHaveLength(3);
      expect(result.compileResult?.artifact?.assembly.operations).toHaveLength(2);
      expect(result.evidence?.writerSha256).toBe(seed.row.sha256);
      expect(result.evidence?.writerByteLength).toBe(seed.bytes.length);
      expect(result.evidence?.zeroAllowanceEquivalence).toHaveLength(3);
      expect(result.graph?.source.handoffSource.provenanceKind).toBe('untrusted-product');
      expect(result.blockers.map((b) => b.code)).toContain(
        'durable-full-assembly-graph-unavailable',
      );
      expect(result.claims).toMatchObject({
        durableGraphVerified: false,
        productAuthority: false,
        runtimeAuthority: false,
      });
      const projected = await session.projectLatest(result.generation);
      expect(projected.evidence).toEqual(result.evidence);
      if (!result.compileRequest || !result.compileResult?.compiled)
        throw new Error('Missing genuine compile artifact/request');
      expect(result.compileRequest.handoff).toEqual(
        result.compileResult.artifact.sourceEvidence.handoff,
      );
      const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1({
        schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
        sourceRequest: result.compileRequest,
        sourceArtifact: result.compileResult.artifact,
        expectedSourceInputSha256: result.compileResult.artifact.sourceEvidence.inputSha256,
        // Explicit authored rigid move, without closing source-layout seam gaps or inferring origins.
        placements: result.graph!.pieces.map((p) => ({
          pieceId: p.pieceId,
          sourceOriginM: [0, 0, 0] as const,
          rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const,
          translationM: [0.25, 0.5, 0] as const,
        })),
      });
      expect(placed.placed, JSON.stringify(placed.blockers)).toBe(true);
      if (!placed.placed) throw new Error('Expected actual explicit placement result');
      expect(placed.sealed).toBe(false);
      expect(placed.artifact.placedSimulation.material).toEqual(
        result.compileResult.artifact.compiledSimulation.material,
      );
      expect(placed.artifact.placedSimulation.constraints).toEqual(
        result.compileResult.artifact.compiledSimulation.constraints,
      );
      expect(placed.artifact.report.claims.runtimeAuthority).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
  }, 60000);
  it('feeds explicit fixture-authored per-piece placement and seals the unchanged material V5', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const result = await session.consume(request);
      if (!result.compileRequest || !result.compileResult?.compiled)
        throw new Error(JSON.stringify(result.blockers));
      // The declared fixture writer layout has 50 mm spacing. These are reviewed constants,
      // never fitted from emitted vertices, nearest seams, bounding boxes or a successful seal.
      expect(seed.written.transforms).toEqual({
        FRONT_M: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        BACK_M: { a: 1, b: 0, c: 0, d: 1, e: 50, f: 0 },
        SIDE_M: { a: 1, b: 0, c: 0, d: 1, e: 100, f: 0 },
      });
      const I = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
      const local = structuredClone(result.compileResult.artifact.compiledSimulation);
      const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1({
        schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
        sourceRequest: result.compileRequest,
        sourceArtifact: result.compileResult.artifact,
        expectedSourceInputSha256: result.compileResult.artifact.sourceEvidence.inputSha256,
        placements: [
          {
            pieceId: 'FRONT',
            sourceOriginM: [0, 0, 0],
            rotationRowMajor: I,
            translationM: [0, 0, 0],
          },
          {
            pieceId: 'BACK',
            sourceOriginM: [0.15, 0, 0],
            rotationRowMajor: I,
            translationM: [0.1, 0, 0],
          },
          {
            pieceId: 'SIDE',
            sourceOriginM: [0.3, 0, 0],
            rotationRowMajor: I,
            translationM: [0.2, 0, 0],
          },
        ],
      });
      expect(placed.ok, JSON.stringify(placed.blockers)).toBe(true);
      if (!placed.ok || !placed.artifact.sealedSimulation)
        throw new Error(JSON.stringify(placed.blockers));
      expect((await validateSealedSimulationPackageV5V1(placed.artifact.sealedSimulation)).ok).toBe(
        true,
      );
      expect(placed.artifact.placedSimulation.constraints).toEqual(local.constraints);
      expect(placed.artifact.placedSimulation.material).toEqual(local.material);
      expect(placed.artifact.placedSimulation.mesh.triangles).toEqual(local.mesh.triangles);
      expect(placed.artifact.localSourceArtifact.compiledSimulation).toEqual(local);
      expect(placed.artifact.placedSimulation.manifest).toMatchObject({
        particleCount: 78,
        triangleCount: 114,
        seamConstraintCount: 8,
        materialCount: 2,
        pinnedParticleCount: 0,
      });
      expect(placed.artifact.report.claims).toMatchObject({
        runtimeAuthority: false,
        bodyPlacementQualified: false,
        automaticSeamClosingUsed: false,
      });
      expect(result.claims.durableGraphVerified).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('also consumes genuine two-piece/one-seam N1 source without using the legacy N2 composer', async () => {
    const three = seed;
    seed = await createSavedThreePanelFixtureV1(2);
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const result = await session.consume(request);
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      expect(result.graph?.pieces).toHaveLength(2);
      expect(result.graph?.operations).toHaveLength(1);
      expect(result.graph?.seams).toHaveLength(1);
      expect(result.compileResult?.artifact?.assembly.pieces).toHaveLength(2);
      expect(result.evidence?.zeroAllowanceEquivalence).toHaveLength(2);
      expect(result.claims.durableGraphVerified).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
      seed = three;
    }
  });
  it('compiles the exact saved wizard export with its gate report and derived grade map', async () => {
    const plain = seed;
    seed = await createSavedThreePanelFixtureV1(2, { wizardExport: true });
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      expect(seed.written.manifest.gate?.passed).toBe(true);
      expect(seed.written.manifest.sizes.map(({ token }) => token)).toEqual(['M', 'L']);
      source.native.draft.scopes[0].writerReplay!.job.pieces[0].aiConfidence = undefined;
      const result = await session.consume(await savedThreePanelCompileRequestV1(seed, source));
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      expect(result.evidence?.writerSha256).toBe(seed.row.sha256);
      expect(result.evidence?.writerByteLength).toBe(seed.bytes.length);
      expect(result.compileResult?.artifact?.assembly.pieces).toHaveLength(2);
    } finally {
      session.dispose();
      source.dispose();
      seed = plain;
    }
  });
  it.each([
    [
      'missing seam',
      (draft: SavedFullAssemblyCompileRequestV1['sourceRequest']['draft']) => {
        draft.scopes[0].writerReplay!.job.pieces[0].sizes[0].seam = null;
      },
    ],
    [
      'nonzero allowance',
      (draft: SavedFullAssemblyCompileRequestV1['sourceRequest']['draft']) => {
        draft.scopes[0].writerReplay!.job.pieces[0].allowance.allowanceMm = 1;
      },
    ],
    [
      'missing allowance',
      (draft: SavedFullAssemblyCompileRequestV1['sourceRequest']['draft']) => {
        Reflect.deleteProperty(
          draft.scopes[0].writerReplay!.job.pieces[0].allowance,
          'allowanceMm',
        );
      },
    ],
    [
      'cut/seam geometry drift',
      (draft: SavedFullAssemblyCompileRequestV1['sourceRequest']['draft']) => {
        draft.scopes[0].writerReplay!.job.pieces[0].sizes[0].seam![0].x += 0.01;
      },
    ],
    [
      'cut geometry drift',
      (draft: SavedFullAssemblyCompileRequestV1['sourceRequest']['draft']) => {
        draft.scopes[0].writerReplay!.job.pieces[0].sizes[0].cut[0].x += 0.01;
      },
    ],
  ] as const)(
    'refuses genuine source draft with %s without manufacturing sewing authority',
    async (_name, mutate) => {
      const source = await createSavedThreePanelSourceV1(seed);
      const session = createSavedFullAssemblyCompileSessionV1();
      try {
        const request = await savedThreePanelCompileRequestV1(seed, source);
        mutate(source.native.draft);
        const result = await session.consume(request);
        expect(result.compiled, JSON.stringify(result.blockers)).toBe(false);
        expect(result.evidence).toBeNull();
        expect(result.blockers[0].code).not.toBe('durable-full-assembly-graph-unavailable');
        expect(session.snapshot().hasArtifact).toBe(false);
      } finally {
        session.dispose();
        source.dispose();
      }
    },
  );
  it('rejects a structural source owner without invoking owner getters', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const getter = vi.fn(() => source.native.sourceOwner.version);
      const fake = Object.defineProperty({}, 'version', { get: getter });
      const result = await session.consume({
        ...request,
        sourceOwner: fake as typeof request.sourceOwner,
      });
      expect(result.blockers[0].code).toBe('forged-owner');
      expect(getter).not.toHaveBeenCalled();
      expect((await session.consume(request)).compiled).toBe(true);
      expect((await session.consume(request)).blockers[0].code).toBe('stale-owner');
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('captures explicit intent before the first await; accessor intent is rejected without invocation', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const pending = session.consume(request);
      (request.intent.pieces[0] as { grainDegrees: number }).grainDegrees = 3;
      const result = await pending;
      expect(result.compiled, JSON.stringify(result.blockers)).toBe(true);
      expect(result.graph?.pieces[0].grainDegrees).toBe(90);
      const getter = vi.fn(() => request.intent.seams);
      Object.defineProperty(request.intent, 'seams', { get: getter });
      const bad = await session.consume(request);
      expect(bad.blockers[0].code).toBe('invalid-input');
      expect(getter).not.toHaveBeenCalled();
      expect(session.snapshot().hasArtifact).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('rejects changed expected row fields and full-AO/outer context before compile', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const bad = await session.consume({
        ...request,
        expected: { ...request.expected, row: { ...seed.row, revision: seed.row.revision + 1 } },
      });
      expect(bad.blockers[0].code).toBe('saved-source-row-mismatch');
      expect(bad.compiled).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('rechecks the full RPC snapshot after an asynchronous source stage and refuses drift', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const start = calls;
      editWire = (wire, call) => {
        if (call > start + 3)
          wire.serverAssemblyRevision = wire.serverAssemblyRevision.replace(':4', ':5');
      };
      const result = await session.consume(request);
      expect(result.compiled).toBe(false);
      expect(['saved-assembly-drift', 'assembly-drift']).toContain(result.blockers[0].code);
      expect(session.snapshot().hasArtifact).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('stale generation and read-only cancellation preserve the current artifact', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const result = await session.consume(request);
      expect(result.compiled).toBe(true);
      expect((await session.projectLatest(result.generation - 1)).blockers[0].code).toBe(
        'stale-generation',
      );
      const controller = new AbortController();
      controller.abort();
      expect(
        (await session.projectLatest(result.generation, controller.signal)).blockers[0].code,
      ).toBe('cancelled');
      expect(session.snapshot().hasArtifact).toBe(true);
      expect((await session.projectLatest(result.generation)).compiled).toBe(true);
      const projected = await session.projectLatest(result.generation);
      const artifact = projected.compileResult!.artifact!;
      artifact.compiledSimulation.mesh.restPositionsInvMass[0] = 999;
      expect(
        (await session.projectLatest(result.generation)).compileResult!.artifact!.compiledSimulation
          .mesh.restPositionsInvMass[0],
      ).not.toBe(999);
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('caller abort after return revokes only this generation', async () => {
    const first = await createSavedThreePanelSourceV1(seed);
    const second = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const a = await savedThreePanelCompileRequestV1(seed, first);
      const b = await savedThreePanelCompileRequestV1(seed, second);
      const controller = new AbortController();
      expect((await session.consume(a, controller.signal)).compiled).toBe(true);
      controller.abort();
      expect(session.snapshot().hasArtifact).toBe(false);
      const next = await session.consume(b);
      expect(next.compiled, JSON.stringify(next.blockers)).toBe(true);
      expect(next.generation).toBe(2);
      controller.abort();
      expect((await session.projectLatest(2)).compiled).toBe(true);
    } finally {
      session.dispose();
      first.dispose();
      second.dispose();
    }
  });
  it('disposal during pending RPC prevents publication even when transport ignores abort', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      editWire = async () => {
        entered();
        await gate;
      };
      const pending = session.consume(request);
      await started;
      session.dispose();
      release();
      const result = await pending;
      expect(result.compiled).toBe(false);
      expect(result.blockers[0].code).toBe('cancelled');
      expect(session.snapshot()).toMatchObject({ disposed: true, hasArtifact: false });
    } finally {
      release?.();
      session.dispose();
      source.dispose();
    }
  });
  it('binds native piece IDs to the exact retained source catalog card line keys', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      (request.intent.pieces[0] as { pieceLineKey: string }).pieceLineKey = 'line-SIDE';
      const result = await session.consume(request);
      expect(result.blockers[0].code).toBe('piece-line-binding');
      expect(result.compileRequest).toBeNull();
    } finally {
      session.dispose();
      source.dispose();
    }
  });
  it('operation-local read abort during pending transport does not revoke the shared artifact', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const result = await session.consume(request);
      const controller = new AbortController();
      editWire = async () => {
        entered();
        await gate;
      };
      const pending = session.projectLatest(result.generation, controller.signal);
      await started;
      controller.abort();
      release();
      expect((await pending).blockers[0].code).toBe('cancelled');
      editWire = undefined;
      expect(session.snapshot().hasArtifact).toBe(true);
      expect((await session.projectLatest(result.generation)).compiled).toBe(true);
    } finally {
      release?.();
      session.dispose();
      source.dispose();
    }
  });
  it('busy refusal keeps the incoming genuine capability unconsumed for a later generation', async () => {
    const first = await createSavedThreePanelSourceV1(seed),
      second = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    try {
      const a = await savedThreePanelCompileRequestV1(seed, first),
        b = await savedThreePanelCompileRequestV1(seed, second);
      editWire = async () => {
        entered();
        await gate;
      };
      const pending = session.consume(a);
      await started;
      expect((await session.consume(b)).blockers[0].code).toBe('busy');
      editWire = undefined;
      release();
      expect((await pending).compiled).toBe(true);
      expect(session.snapshot().generation).toBe(1);
      const next = await session.consume(b);
      expect(next.compiled, JSON.stringify(next.blockers)).toBe(true);
      expect(next.generation).toBe(2);
    } finally {
      release?.();
      session.dispose();
      first.dispose();
      second.dispose();
    }
  });
  it('accepted source replacement cancels a pending old read without overwriting the new artifact', async () => {
    const first = await createSavedThreePanelSourceV1(seed),
      second = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    try {
      const a = await savedThreePanelCompileRequestV1(seed, first),
        b = await savedThreePanelCompileRequestV1(seed, second);
      expect((await session.consume(a)).compiled).toBe(true);
      editWire = async () => {
        entered();
        await gate;
      };
      const oldRead = session.projectLatest(1);
      await started;
      editWire = undefined;
      const next = await session.consume(b);
      expect(next.compiled).toBe(true);
      release();
      expect((await oldRead).compiled).toBe(false);
      expect((await session.projectLatest(2)).compiled).toBe(true);
      expect(session.snapshot()).toMatchObject({ generation: 2, hasArtifact: true });
    } finally {
      release?.();
      session.dispose();
      first.dispose();
      second.dispose();
    }
  });
  it('refuses final-publication cancellation after the actual compiler completed', async () => {
    const first = await createSavedThreePanelSourceV1(seed),
      second = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const a = await savedThreePanelCompileRequestV1(seed, first),
        b = await savedThreePanelCompileRequestV1(seed, second);
      const baseline = await session.consume(a);
      expect(baseline.compiled).toBe(true);
      const finalCall = calls + baseline.evidence!.freshReadCount * 3;
      const controller = new AbortController();
      let reached = false;
      editWire = (_wire, call) => {
        if (call === finalCall) {
          reached = true;
          controller.abort();
        }
      };
      const result = await session.consume(b, controller.signal);
      expect(reached).toBe(true);
      expect(result.compiled).toBe(false);
      expect(result.blockers[0].code).toBe('cancelled');
      expect(result.compileRequest).toBeNull();
      expect(session.snapshot().hasArtifact).toBe(false);
    } finally {
      session.dispose();
      first.dispose();
      second.dispose();
    }
  });
  it('a proven current-row drift revokes the matching artifact', async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const request = await savedThreePanelCompileRequestV1(seed, source);
      const result = await session.consume(request);
      expect(result.compiled).toBe(true);
      editWire = (wire) => {
        wire.row.savedRowRevision += 1;
      };
      expect((await session.projectLatest(result.generation)).blockers[0].code).toBe('row-drift');
      expect(session.snapshot().hasArtifact).toBe(false);
    } finally {
      session.dispose();
      source.dispose();
    }
  });
});
