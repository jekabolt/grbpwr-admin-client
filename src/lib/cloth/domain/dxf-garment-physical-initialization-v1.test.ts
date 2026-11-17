import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import { abortableAdminService } from 'api/api';
import type { GetTechCardSavedAssemblySnapshotRequest } from 'api/proto-http/admin';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  savedThreePanelCompileRequestV1,
  fullAssemblyFixtureWireV1,
  type SavedThreePanelFixtureV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1.test-fixture';
import { createSavedFullAssemblyCompileSessionV1 } from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-compile-session-v1';
import {
  readSavedFullAssemblySnapshotV1,
  projectSavedFullAssemblySnapshotV1,
  disposeSavedFullAssemblySnapshotV1,
} from 'components/managers/tech-card/components/pattern-import/phase-e-workbench-v2/saved-full-assembly-snapshot-production-v1';
import { createObservedPlacementPairCubeBodyFixtureV1 } from 'components/cloth-simulation-spike/beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import { projectSavedModelObservedPlacementTargetV1 } from 'components/cloth-simulation-spike/saved-model-observed-placement-target-v1';
import { validateSealedSimulationPackageV5V1 } from '../compiler/simulation-package-v5-integrity';
import {
  DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
  DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
  DXF_EXACT_ASSEMBLY_GRAPH_FINGERPRINT_V1,
  fingerprintDxfExactAssemblyGraphV1,
  validateDxfGarmentPhysicalInitializationV1,
  encodeDxfGarmentPhysicalInitializationV1,
  decodeDxfGarmentPhysicalInitializationV1,
  projectDxfGarmentPhysicalInitializationV1,
  type DxfGarmentPhysicalInitializationProjectionRequestV1,
} from './dxf-garment-physical-initialization-v1';

// Storage/HTTP and this cube host observation are synthetic. The saved DXF/worker/native/writer,
// graph/compiler, target metadata projector and placement/sealer all execute their real code.
vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('lib/cloth/body/measurement-open-reference-display-v1', async (original) => ({
  ...(await original<typeof import('lib/cloth/body/measurement-open-reference-display-v1')>()),
  loadMakeHumanOpenReferenceBasisV1: async () => ({ kind: 'female' }),
}));
vi.mock('lib/cloth/body/makehuman-torso-shape-delta-bundle-v1', () => ({
  loadMakeHumanTorsoShapeDeltaBundleV1: async () => ({}),
}));
vi.mock('lib/cloth/body/makehuman-uniform-waist-hip-modes-v1', () => ({
  createMakeHumanUniformWaistHipModesV1: () => ({
    basisKind: 'female',
    modes: [
      { measurementKey: 'waistCircumferenceMm', stationOriginM: [0, 1.2, 0] },
      { measurementKey: 'hipCircumferenceMm', stationOriginM: [0, 1, 0] },
    ],
  }),
}));
const fixtures = new Map<2 | 3, DxfGarmentPhysicalInitializationProjectionRequestV1>();
let selected: SavedThreePanelFixtureV1;
function metadata(input: DxfGarmentPhysicalInitializationProjectionRequestV1) {
  return { document: input.document, graph: input.graph, assemblySnapshot: input.assemblySnapshot };
}
function fresh(n: 2 | 3 = 3) {
  return structuredClone(fixtures.get(n)!);
}
beforeAll(async () => {
  vi.mocked(abortableAdminService).mockImplementation(
    () =>
      ({
        GetTechCardSavedAssemblySnapshot: (r: GetTechCardSavedAssemblySnapshotRequest) =>
          fullAssemblyFixtureWireV1(selected, r.selectedOperationNumber!),
      }) as unknown as ReturnType<typeof abortableAdminService>,
  );
  const body = await createObservedPlacementPairCubeBodyFixtureV1();
  const target = await projectSavedModelObservedPlacementTargetV1(body.bodyOwner, body.binding);
  body.dispose();
  if (!target.ok) throw new Error(target.detail);
  for (const count of [2, 3] as const) {
    selected = await createSavedThreePanelFixtureV1(count);
    const source = await createSavedThreePanelSourceV1(selected);
    const session = createSavedFullAssemblyCompileSessionV1();
    try {
      const compiled = await session.consume(
        await savedThreePanelCompileRequestV1(selected, source),
      );
      if (!compiled.graph || !compiled.compileRequest || !compiled.compileResult?.compiled)
        throw new Error(JSON.stringify(compiled.blockers));
      const receipt = await readSavedFullAssemblySnapshotV1({
        row: selected.row,
        seedOperationNumber: 10,
      });
      const full = projectSavedFullAssemblySnapshotV1(receipt)!;
      disposeSavedFullAssemblySnapshotV1(receipt);
      const assemblySnapshot = {
        row: full.row,
        serverAssemblyRevision: full.serverAssemblyRevision,
        operations: full.operations,
        seams: full.seams,
      };
      const graph = compiled.graph;
      const fingerprint = await fingerprintDxfExactAssemblyGraphV1({ graph, assemblySnapshot });
      // Fixed authored fixture layout, not extracted/fitted from emitted positions or a successful seal.
      const identities = ['FRONT', 'BACK', 'SIDE'];
      const origins = [0, 0.15, 0.3],
        targets = [0, 0.1, 0.2];
      fixtures.set(count, {
        graph,
        assemblySnapshot,
        sourceRequest: compiled.compileRequest,
        sourceArtifact: compiled.compileResult.artifact,
        document: {
          schemaVersion: DXF_GARMENT_PHYSICAL_INITIALIZATION_V1,
          graphCanonicalSha256: fingerprint.canonicalSha256,
          compileInputSha256: compiled.compileResult.artifact.sourceEvidence.inputSha256,
          convention: DXF_GARMENT_PHYSICAL_INITIALIZATION_CONVENTION_V1,
          placements: identities.slice(0, count).map((pieceId, i) => ({
            pieceId,
            sourceOriginM: [origins[i], 0, 0],
            rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            translationM: [targets[i], 0, 0],
          })),
          observedTarget: { target: target.target, canonicalSha256: target.canonicalSha256 },
          support: 'none',
          replayProfile: 'garment-material-contact-replay/1',
        },
      });
    } finally {
      session.dispose();
      source.dispose();
    }
  }
}, 60000);
afterEach(() => vi.restoreAllMocks());

describe('strict generic physical initialization metadata; no persistence/body/runtime admission', () => {
  it.each([2, 3] as const)(
    'genuine saved %i-piece source → codec → actual rigid replay → sealed V5',
    async (count) => {
      const input = fresh(count);
      expect(input.sourceRequest.handoff.seal.canonicalSha256).toBe(
        input.graph.source.handoffCanonicalSha256,
      );
      const encoded = await encodeDxfGarmentPhysicalInitializationV1(metadata(input));
      const decoded = await decodeDxfGarmentPhysicalInitializationV1({
        bytes: encoded.bytes,
        graph: input.graph,
        assemblySnapshot: input.assemblySnapshot,
      });
      expect(decoded.document).toEqual(input.document);
      expect(decoded.canonicalSha256).toBe(encoded.canonicalSha256);
      const projected = await projectDxfGarmentPhysicalInitializationV1({
        ...input,
        document: decoded.document,
      });
      expect(projected.placementResult.ok, JSON.stringify(projected.placementResult.blockers)).toBe(
        true,
      );
      if (!projected.placementResult.ok || !projected.placementResult.artifact.sealedSimulation)
        throw new Error('Expected genuine placed V5');
      const artifact = projected.placementResult.artifact;
      expect((await validateSealedSimulationPackageV5V1(artifact.sealedSimulation!)).ok).toBe(true);
      expect(artifact.localSourceArtifact).toEqual(input.sourceArtifact);
      expect(artifact.placedSimulation.constraints).toEqual(
        input.sourceArtifact.compiledSimulation.constraints,
      );
      expect(artifact.placedSimulation.material).toEqual(
        input.sourceArtifact.compiledSimulation.material,
      );
      expect(artifact.placedSimulation.mesh.triangles).toEqual(
        input.sourceArtifact.compiledSimulation.mesh.triangles,
      );
      expect(projected.placementRequest.sourceRequest).toEqual(input.sourceRequest);
      expect(projected.claims).toMatchObject({
        durableGraphVerified: false,
        runtimeAuthority: false,
        observedTargetAuthenticatesBody: false,
      });
      expect(Object.keys(decoded.document).sort()).not.toContain('graph');
    },
    30000,
  );
  it('retains real placed-but-unsealed output when explicit rigid transforms leave source seam gaps', async () => {
    const input = fresh();
    const document: typeof input.document = {
      ...input.document,
      placements: input.document.placements.map((p) => ({
        ...p,
        sourceOriginM: [0, 0, 0],
        translationM: [0, 0, 0],
      })),
    };
    const result = await projectDxfGarmentPhysicalInitializationV1({ ...input, document });
    expect(result.placementResult.placed).toBe(true);
    expect(result.placementResult.sealed).toBe(false);
    expect(result.placementResult.artifact?.placedSimulation).toBeTruthy();
  });
  it('fingerprints only validated graph bytes with one fixed domain and significant array order', async () => {
    const input = fresh();
    const context = { graph: input.graph, assemblySnapshot: input.assemblySnapshot };
    const first = await fingerprintDxfExactAssemblyGraphV1(context);
    // Object insertion order is irrelevant; do not erase nested fields with a replacer whitelist.
    const rebuilt = Object.fromEntries(Object.entries(input.graph).reverse()) as typeof input.graph;
    expect(
      (await fingerprintDxfExactAssemblyGraphV1({ ...context, graph: rebuilt })).canonicalSha256,
    ).toBe(first.canonicalSha256);
    const graph = { ...input.graph, pieces: [...input.graph.pieces].reverse() };
    expect(
      (await fingerprintDxfExactAssemblyGraphV1({ ...context, graph })).canonicalSha256,
    ).not.toBe(first.canonicalSha256);
    const canonical = (v: unknown): string =>
      Array.isArray(v)
        ? `[${v.map(canonical).join(',')}]`
        : v && typeof v === 'object'
          ? `{${Object.entries(v)
              .filter(([, x]) => x !== undefined)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
              .join(',')}}`
          : JSON.stringify(v);
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        `${DXF_EXACT_ASSEMBLY_GRAPH_FINGERPRINT_V1}\0${canonical(input.graph)}`,
      ),
    );
    expect(first.canonicalSha256).toBe(
      Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join(''),
    );
  });
  it.each(['duplicate', 'missing', 'foreign'] as const)(
    'rejects %s exact placement coverage',
    async (kind) => {
      const input = fresh();
      const placements = [...input.document.placements];
      if (kind === 'missing') placements.pop();
      else
        placements[1] = {
          ...placements[1],
          pieceId: kind === 'duplicate' ? placements[0].pieceId : 'FOREIGN',
        };
      await expect(
        validateDxfGarmentPhysicalInitializationV1(
          metadata({ ...input, document: { ...input.document, placements } }),
        ),
      ).rejects.toThrow(/piece|instances/i);
    },
  );
  it.each(['scale', 'reflection', 'shear', 'nan', 'coordinate-bound', 'negative-zero'] as const)(
    'rejects %s transform without normalization',
    async (kind) => {
      const input = fresh();
      const p = structuredClone(input.document.placements[0]);
      const matrix = [...p.rotationRowMajor];
      if (kind === 'scale') matrix[0] = 1.001;
      if (kind === 'reflection') matrix[0] = -1;
      if (kind === 'shear') matrix[1] = 0.1;
      if (kind === 'nan') matrix[0] = NaN;
      if (kind === 'negative-zero') matrix[1] = -0;
      const placements = [
        {
          ...p,
          rotationRowMajor: matrix as unknown as typeof p.rotationRowMajor,
          translationM: kind === 'coordinate-bound' ? ([10001, 0, 0] as const) : p.translationM,
        },
        ...input.document.placements.slice(1),
      ];
      await expect(
        validateDxfGarmentPhysicalInitializationV1(
          metadata({ ...input, document: { ...input.document, placements } }),
        ),
      ).rejects.toThrow();
    },
  );
  it.each(['support', 'convention', 'profile', 'extra-outer'] as const)(
    'refuses %s policy reinterpretation',
    async (kind) => {
      const input = fresh();
      const d = input.document as unknown as Record<string, unknown>;
      if (kind === 'support') d.support = 'waist';
      if (kind === 'profile') d.replayProfile = 'other';
      if (kind === 'convention')
        d.convention = { ...input.document.convention, sourceScaleToMetres: 0.01 };
      if (kind === 'extra-outer') d.outerSha256 = 'a'.repeat(64);
      await expect(validateDxfGarmentPhysicalInitializationV1(metadata(input))).rejects.toThrow();
    },
  );
  it('rejects unsupported/full AO drift instead of treating StoredSeam echoes as topology', async () => {
    const input = fresh();
    const changed = {
      ...input.assemblySnapshot,
      operations: input.assemblySnapshot.operations.map((p, i) =>
        i ? p : { ...p, work: 'fusing' },
      ),
    };
    await expect(
      fingerprintDxfExactAssemblyGraphV1({ graph: input.graph, assemblySnapshot: changed }),
    ).rejects.toThrow();
    await expect(
      fingerprintDxfExactAssemblyGraphV1({
        graph: input.graph,
        assemblySnapshot: {
          ...input.assemblySnapshot,
          seams: input.assemblySnapshot.seams.slice(1),
        },
      }),
    ).rejects.toThrow();
  });
  it('rejects graph fingerprint, target and compile source identity drift', async () => {
    const input = fresh();
    await expect(
      validateDxfGarmentPhysicalInitializationV1(
        metadata({
          ...input,
          document: { ...input.document, graphCanonicalSha256: 'a'.repeat(64) },
        }),
      ),
    ).rejects.toThrow(/fingerprint/);
    const target = structuredClone(input.document.observedTarget);
    (target.target.geometry as { positionsFloat32LeSha256: string }).positionsFloat32LeSha256 =
      'b'.repeat(64);
    await expect(
      validateDxfGarmentPhysicalInitializationV1(
        metadata({ ...input, document: { ...input.document, observedTarget: target } }),
      ),
    ).rejects.toThrow(/digest/);
    await expect(
      projectDxfGarmentPhysicalInitializationV1({
        ...input,
        document: { ...input.document, compileInputSha256: 'c'.repeat(64) },
      }),
    ).rejects.toThrow(/compile input/);
  });
  it('rejects mismatched graph/request semantics and real tampered native Float32 artifact', async () => {
    const input = fresh();
    const sourceRequest = {
      ...input.sourceRequest,
      exactSeamToleranceMm: input.sourceRequest.exactSeamToleranceMm / 2,
    };
    await expect(
      projectDxfGarmentPhysicalInitializationV1({ ...input, sourceRequest }),
    ).rejects.toThrow(/compile request/);
    input.sourceArtifact.compiledSimulation.mesh.restPositionsInvMass[0] += 0.02;
    const result = await projectDxfGarmentPhysicalInitializationV1(input);
    expect(result.placementResult.placed).toBe(false);
    expect(result.placementResult.blockers[0].code).toBe('source-artifact-mismatch');
  });
  it('refuses pinned/supportful source rather than discarding its authority', async () => {
    const input = fresh();
    (
      input.sourceArtifact.compiledSimulation.manifest as { pinnedParticleCount: number }
    ).pinnedParticleCount = 1;
    await expect(projectDxfGarmentPhysicalInitializationV1(input)).rejects.toThrow(/none support/);
  });
  it('rejects noncanonical JSON, duplicate keys, invalid UTF8 and excess bytes', async () => {
    const input = fresh();
    const encoded = await encodeDxfGarmentPhysicalInitializationV1(metadata(input));
    const text = new TextDecoder().decode(encoded.bytes);
    for (const bytes of [
      new TextEncoder().encode(text + '\n'),
      new TextEncoder().encode(text.replace('{', '{"support":"none",')),
      new Uint8Array([255]),
      new Uint8Array(256 * 1024 + 1),
    ])
      await expect(
        decodeDxfGarmentPhysicalInitializationV1({
          bytes,
          graph: input.graph,
          assemblySnapshot: input.assemblySnapshot,
        }),
      ).rejects.toThrow();
  });
  it('rejects UTF8 BOM bytes even when the decoder normalizes them to canonical text', async () => {
    const input = fresh();
    const encoded = await encodeDxfGarmentPhysicalInitializationV1(metadata(input));
    const bytes = new Uint8Array(encoded.bytes.length + 3);
    bytes.set([0xef, 0xbb, 0xbf]);
    bytes.set(encoded.bytes, 3);
    expect(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toBe(
      new TextDecoder().decode(encoded.bytes),
    );
    await expect(
      decodeDxfGarmentPhysicalInitializationV1({
        bytes,
        graph: input.graph,
        assemblySnapshot: input.assemblySnapshot,
      }),
    ).rejects.toThrow(/canonical/i);
  });
  it('never invokes metadata, graph, decoder or source getters', async () => {
    const input = fresh();
    const getter = vi.fn(() => input.document.placements);
    const doc = { ...input.document };
    Object.defineProperty(doc, 'placements', { enumerable: true, get: getter });
    await expect(
      validateDxfGarmentPhysicalInitializationV1({ ...metadata(input), document: doc }),
    ).rejects.toThrow();
    const request = { ...input };
    Object.defineProperty(request, 'sourceArtifact', { enumerable: true, get: getter });
    await expect(projectDxfGarmentPhysicalInitializationV1(request)).rejects.toThrow();
    const encoded = await encodeDxfGarmentPhysicalInitializationV1(metadata(input));
    const decoding = {
      bytes: encoded.bytes,
      graph: input.graph,
      assemblySnapshot: input.assemblySnapshot,
    };
    Object.defineProperty(decoding, 'bytes', { enumerable: true, get: getter });
    await expect(decodeDxfGarmentPhysicalInitializationV1(decoding)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects hidden/symbol decoder metadata and decorated byte arrays', async () => {
    const input = fresh();
    const encoded = await encodeDxfGarmentPhysicalInitializationV1(metadata(input));
    for (const key of ['hidden', Symbol('extra')]) {
      const request = {
        bytes: encoded.bytes,
        graph: input.graph,
        assemblySnapshot: input.assemblySnapshot,
      };
      Object.defineProperty(request, key, { value: 1 });
      await expect(decodeDxfGarmentPhysicalInitializationV1(request)).rejects.toThrow();
    }
    const bytes = encoded.bytes.slice();
    Object.defineProperty(bytes, 'extra', { value: 1 });
    await expect(
      decodeDxfGarmentPhysicalInitializationV1({
        bytes,
        graph: input.graph,
        assemblySnapshot: input.assemblySnapshot,
      }),
    ).rejects.toThrow();
  });
  it('supports64piece/400seam metadata bounds while retaining the frozen full-AO400 limit', async () => {
    // Synthetic content-only boundary case. It deliberately supplies no matching native source:
    // metadata validation cannot authenticate these IDs or promote this into a compile owner.
    const input = fresh();
    const pieces = Array.from({ length: 64 }, (_, i) => ({
      ...input.graph.pieces[i % input.graph.pieces.length],
      pieceId: `P${i}`,
      pieceLineKey: `L${i}`,
    }));
    const seams = Array.from({ length: 400 }, (_, i) => ({
      id: `S${i}`,
      sourceSeamKey: `K${i}`,
      clientOperationId: `O${i}`,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      sides: [0, 1].map((side) => ({
        pieceId: `P${side}`,
        pieceLineKey: `L${side}`,
        contourId: `C${side}`,
        anchors: [`V${i}a`, `V${i}b`] as const,
        direction: side ? ('reverse' as const) : ('forward' as const),
      })) as unknown as (typeof input.graph.seams)[number]['sides'],
    }));
    const operations = seams.map((s, i) => ({
      clientOperationId: s.clientOperationId,
      sourceOperationNumber: i + 1,
      inputKeys: ['L0', 'L1'],
      outputUnitKey: '',
      stage: 0,
      order: i,
      kind: 'stitch' as const,
      seamIds: [s.id],
    }));
    const graph = { ...input.graph, pieces, seams, operations };
    const assemblySnapshot = {
      ...input.assemblySnapshot,
      operations: operations.map((o, i) => ({
        operationNumber: o.sourceOperationNumber,
        work: 'join_lockstitch',
        inputKeys: o.inputKeys,
        outputUnitKey: '',
        outputUnitName: '',
        seamKeys: [seams[i].sourceSeamKey],
      })),
      seams: seams.map((s, i) => ({
        seamKey: s.sourceSeamKey,
        sourceOperationNumber: i + 1,
        anchoredSize: graph.source.sizeToken,
        direction: 'reversed' as const,
        pieceLineKeys: ['L0', 'L1'] as const,
      })),
    };
    const identity = await fingerprintDxfExactAssemblyGraphV1({ graph, assemblySnapshot });
    const document = {
      ...input.document,
      graphCanonicalSha256: identity.canonicalSha256,
      placements: pieces.map((p) => ({ ...input.document.placements[0], pieceId: p.pieceId })),
    };
    const encoded = await encodeDxfGarmentPhysicalInitializationV1({
      document,
      graph,
      assemblySnapshot,
    });
    expect(encoded.document.placements).toHaveLength(64);
    expect(encoded.claims.durableGraphVerified).toBe(false);
    await expect(
      fingerprintDxfExactAssemblyGraphV1({
        graph: { ...graph, seams: [...seams, seams[0]] },
        assemblySnapshot,
      }),
    ).rejects.toThrow(/count/);
    await expect(
      fingerprintDxfExactAssemblyGraphV1({
        graph: { ...graph, pieces: [...pieces, pieces[0]] },
        assemblySnapshot,
      }),
    ).rejects.toThrow(/count/);
  });
  it('captures request/geometry before the first await and returns detached output', async () => {
    const input = fresh();
    const original = structuredClone(input);
    const pending = projectDxfGarmentPhysicalInitializationV1(input);
    input.sourceArtifact.compiledSimulation.mesh.restPositionsInvMass[0] += 1;
    (input.document as { compileInputSha256: string }).compileInputSha256 = 'f'.repeat(64);
    const result = await pending;
    expect(result.placementResult.ok, JSON.stringify(result.placementResult.blockers)).toBe(true);
    expect(result.placementRequest.sourceArtifact).toEqual(original.sourceArtifact);
    result.placementRequest.sourceArtifact.compiledSimulation.mesh.restPositionsInvMass[0] += 1;
    expect(fixtures.get(3)!.sourceArtifact).toEqual(original.sourceArtifact);
  });
  it('refuses pre-abort and cancellation during async hashing without publishing metadata or artifact', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      projectDxfGarmentPhysicalInitializationV1(fresh(), controller.signal),
    ).rejects.toThrow(/cancel/);
    const active = new AbortController();
    const digest = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
      const result = await digest(...args);
      active.abort();
      return result;
    });
    await expect(projectDxfGarmentPhysicalInitializationV1(fresh(), active.signal)).rejects.toThrow(
      /cancel/,
    );
    expect(fixtures.get(3)!.sourceArtifact.compiledSimulation.manifest.pinnedParticleCount).toBe(0);
  });
});
