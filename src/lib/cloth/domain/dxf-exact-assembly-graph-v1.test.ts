import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  DXF_EXACT_ASSEMBLY_GRAPH_V1,
  projectDxfExactAssemblyGraphCompileRequestV1,
  validateDxfExactAssemblyGraphV1,
  type DxfExactAssemblyGraphAoSnapshotV1,
  type DxfExactAssemblyGraphV1,
} from './dxf-exact-assembly-graph-v1';
import { createThreePanelDxfMaterialCompileFixtureV1 } from './dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from './dxf-garment-assembly-material-compile-stage-v1';
import { validateSealedSimulationPackageV5V1 } from '../compiler/simulation-package-v5-integrity';

type Fixture = Awaited<ReturnType<typeof createThreePanelDxfMaterialCompileFixtureV1>>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
function inputs(f: Fixture) {
  const handoff = f.request.handoff;
  const row = {
    techCardId: 156,
    scopeKey: 'main',
    patternLineKey: 'explicit-three-panel-source',
    revision: 2,
    cardLockVersion: 7,
    url: '/three-explicit-panels.dxf',
    sizeBytes: f.dxfBytes.byteLength,
    sha256: f.nativeProjection.sourceSha256,
  };
  const serverAssemblyRevision = `asm:v1:${'1'.repeat(32)}:4`;
  const pieces = handoff.pieces.map((piece) => {
    const material = handoff.materials.find((m) => m.pieceIds.includes(piece.id))!;
    return {
      pieceId: piece.id,
      pieceLineKey: `line-${piece.id}`,
      cutCount: 1 as const,
      grainDegrees: piece.grainDegrees,
      materialId: material.id,
      materialRevision: material.materialRevision,
    };
  });
  const operations = handoff.operations.map((op, i) => ({
    clientOperationId: `explicit-client-operation-${i}`,
    sourceOperationNumber: 10 + i * 10,
    inputKeys: [
      ...new Set(
        handoff.seams
          .filter((s) => op.seamIds.includes(s.id))
          .flatMap((s) => s.sides.map((side) => `line-${side.pieceId}`)),
      ),
    ],
    outputUnitKey: '',
    stage: op.stage,
    order: op.order,
    kind: 'stitch' as const,
    seamIds: op.seamIds.map((id) => `explicit-${id}`),
  }));
  const seams = handoff.seams.map((seam, i) => {
    const side = (index: 0 | 1) => ({
      ...seam.sides[index],
      pieceLineKey: `line-${seam.sides[index].pieceId}`,
    });
    return {
      id: `explicit-${seam.id}`,
      sourceSeamKey: `stored-seam-${i}`,
      clientOperationId: operations.find((op) => op.seamIds.includes(`explicit-${seam.id}`))!
        .clientOperationId,
      mapping: 'equal' as const,
      lengthRatio: 1 as const,
      sides: [side(0), side(1)] as const,
    };
  });
  const graph: DxfExactAssemblyGraphV1 = {
    schemaVersion: DXF_EXACT_ASSEMBLY_GRAPH_V1,
    profile: 'single-saved-row-size-adjacent-native-stitch',
    row,
    serverAssemblyRevision,
    source: {
      sourceFileId: f.request.samplingRequest.sourceFileId,
      nativeDxfSha256: row.sha256,
      sizeToken: 'M',
      handoffCanonicalSha256: handoff.seal.canonicalSha256,
      handoffSource: handoff.source,
    },
    pieces,
    operations,
    seams,
    compile: {
      targetEdgeMm: f.request.samplingRequest.targetEdgeMm,
      exactSeamToleranceMm: f.request.exactSeamToleranceMm,
      materialPolicy: f.request.materialPolicy,
      materials: f.request.materials,
      continuumMaterials: f.request.continuumMaterials,
      materialSolver: f.request.materialSolver,
    },
  };
  const assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1 = {
    row,
    serverAssemblyRevision,
    operations: operations.map((op) => ({
      operationNumber: op.sourceOperationNumber,
      work: 'join_lockstitch',
      inputKeys: op.inputKeys,
      outputUnitKey: op.outputUnitKey,
      outputUnitName: '',
      seamKeys: op.seamIds.map((id) => seams.find((s) => s.id === id)!.sourceSeamKey),
    })),
    seams: seams.map((seam) => ({
      seamKey: seam.sourceSeamKey,
      sourceOperationNumber: operations.find(
        (op) => op.clientOperationId === seam.clientOperationId,
      )!.sourceOperationNumber,
      anchoredSize: 'M',
      direction: 'reversed',
      pieceLineKeys: [seam.sides[0].pieceLineKey, seam.sides[1].pieceLineKey],
    })),
  };
  return structuredClone({
    graph,
    assemblySnapshot,
    sourceHandoff: handoff,
    sourceSampling: f.request.samplingRequest,
  }) as Mutable<{
    graph: DxfExactAssemblyGraphV1;
    assemblySnapshot: DxfExactAssemblyGraphAoSnapshotV1;
    sourceHandoff: typeof handoff;
    sourceSampling: Fixture['request']['samplingRequest'];
  }>;
}

describe('explicit full assembly graph projection — unsigned DTO, genuine CPU geometry kernels', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await createThreePanelDxfMaterialCompileFixtureV1();
  });
  it('takes three actually decoded DXF panels and two distinct authored operations through graph projection, CDT, refinement and sealed multi-material V5', async () => {
    const input = inputs(f);
    const before = structuredClone(input);
    const projected = await projectDxfExactAssemblyGraphCompileRequestV1(input);
    expect(input).toEqual(before);
    expect(projected.request.handoff.pieces).toEqual(f.request.handoff.pieces);
    expect(projected.request.handoff.operations.map((op) => op.id)).toEqual([
      'explicit-client-operation-0',
      'explicit-client-operation-1',
    ]);
    expect(projected.request.handoff.operations.map((op) => op.id)).not.toEqual(['10', '20']);
    expect(projected.request.samplingRequest.pieces.map((p) => p.edges)).toEqual(
      f.request.samplingRequest.pieces.map((p) => p.edges),
    );
    const result = await compileDxfGarmentAssemblyMaterialStageV1(projected.request);
    if (!result.ok) throw new Error(JSON.stringify(result.blockers));
    expect(result.artifact.assembly.operations.map((op) => op.id)).toEqual(
      input.graph.operations.map((op) => op.clientOperationId),
    );
    expect(result.artifact.sealedSimulation.simulation.manifest).toMatchObject({
      particleCount: 78,
      triangleCount: 114,
      materialCount: 2,
      pinnedParticleCount: 0,
    });
    expect(result.artifact.assembly.pieces.map((p) => p.grainDegrees)).toEqual([90, 0, 45]);
    expect(result.artifact.assembly.materials).toHaveLength(2);
    expect((await validateSealedSimulationPackageV5V1(result.artifact.sealedSimulation)).ok).toBe(
      true,
    );
    expect(projected.claims).toMatchObject({
      savedSnapshotAuthenticated: false,
      nativeSourceAuthenticated: false,
      durableGraphVerified: false,
      runtimeAuthority: false,
    });
    expect(result.artifact.claims.runtimeAuthority).toBe(false);
  });
  it('replays deterministically and captures input before the first hash await', async () => {
    const input = inputs(f);
    const pending = projectDxfExactAssemblyGraphCompileRequestV1(input);
    input.graph.operations[0].clientOperationId = 'changed-after-capture';
    input.graph.pieces[0].grainDegrees = 2;
    const first = await pending;
    const second = await projectDxfExactAssemblyGraphCompileRequestV1(inputs(f));
    expect(first.request).toEqual(second.request);
  });
  it('preserves separate N1/N2 operation cardinality without folding them into one selected operation', () => {
    const input = inputs(f);
    const next = structuredClone(input.graph.seams[1]);
    next.id = 'third-explicit-seam';
    next.sourceSeamKey = 'third-stored-seam';
    next.sides[0].anchors = ['native-other-start-b', 'native-other-end-b'];
    next.sides[1].anchors = ['native-other-start-c', 'native-other-end-c'];
    input.graph.seams.push(next);
    input.graph.operations[1].seamIds.push(next.id);
    input.assemblySnapshot.operations[1].seamKeys.push(next.sourceSeamKey);
    input.assemblySnapshot.seams.push({
      ...input.assemblySnapshot.seams[1],
      seamKey: next.sourceSeamKey,
    });
    const valid = validateDxfExactAssemblyGraphV1({
      graph: input.graph,
      assemblySnapshot: input.assemblySnapshot,
    });
    expect(valid.graph.operations.map((op) => op.seamIds.length)).toEqual([1, 2]);
    // This deliberately only proves DTO cardinality. Invented exact IDs cannot pass source replay.
    return expect(projectDxfExactAssemblyGraphCompileRequestV1(input)).rejects.toThrow(
      'native boundary IDs',
    );
  });
  it('preserves an explicitly named earlier unit closure without inventing piece inputs or executing a schedule', async () => {
    const input = inputs(f);
    input.graph.operations[0].outputUnitKey = 'authored-unit-AB';
    input.assemblySnapshot.operations[0].outputUnitKey = 'authored-unit-AB';
    input.graph.operations[1].inputKeys = ['authored-unit-AB', 'line-panel-c'];
    input.assemblySnapshot.operations[1].inputKeys = ['authored-unit-AB', 'line-panel-c'];
    const projected = await projectDxfExactAssemblyGraphCompileRequestV1(input);
    expect(projected.request.handoff.operations).toHaveLength(2);
    expect(projected.claims.assemblyScheduleExecuted).toBe(false);
  });
  it.each([
    'unsupported-work',
    'empty-structural',
    'missing-inputs',
    'unresolved-unit',
    'foreign-piece',
    'ordered-input-drift',
  ] as const)('refuses %s rather than silently excluding or relabeling AO', (kind) => {
    const input = inputs(f);
    if (kind === 'unsupported-work') input.assemblySnapshot.operations[0].work = 'fusing';
    if (kind === 'empty-structural')
      input.assemblySnapshot.operations.push({
        ...input.assemblySnapshot.operations[0],
        operationNumber: 30,
        seamKeys: [],
      });
    if (kind === 'missing-inputs') input.assemblySnapshot.operations[0].inputKeys = [];
    if (kind === 'unresolved-unit') {
      input.graph.operations[0].inputKeys = ['not-yet-built-unit'];
      input.assemblySnapshot.operations[0].inputKeys = ['not-yet-built-unit'];
    }
    if (kind === 'foreign-piece') {
      input.graph.operations[0].inputKeys = ['line-panel-b', 'line-panel-c'];
      input.assemblySnapshot.operations[0].inputKeys = ['line-panel-b', 'line-panel-c'];
    }
    if (kind === 'ordered-input-drift')
      input.assemblySnapshot.operations[0].inputKeys = [
        ...input.assemblySnapshot.operations[0].inputKeys,
      ].reverse();
    expect(() =>
      validateDxfExactAssemblyGraphV1({
        graph: input.graph,
        assemblySnapshot: input.assemblySnapshot,
      }),
    ).toThrow();
  });
  it('refuses a coherently changed saved/native SHA that does not describe the retained real DXF export', async () => {
    const input = inputs(f);
    input.graph.row.sha256 = 'b'.repeat(64);
    input.assemblySnapshot.row.sha256 = 'b'.repeat(64);
    input.graph.source.nativeDxfSha256 = 'b'.repeat(64);
    await expect(projectDxfExactAssemblyGraphCompileRequestV1(input)).rejects.toThrow(
      'saved DXF bytes',
    );
  });
  it.each([
    [
      'missing operation',
      (v: ReturnType<typeof inputs>) => {
        v.graph.operations.pop();
      },
      'covered exactly',
    ],
    [
      'duplicate backend seam ownership',
      (v: ReturnType<typeof inputs>) => {
        v.assemblySnapshot.operations[1].seamKeys.push(
          v.assemblySnapshot.operations[0].seamKeys[0],
        );
      },
      'multiple owners',
    ],
    [
      'duplicate client identity',
      (v: ReturnType<typeof inputs>) => {
        v.graph.operations[1].clientOperationId = v.graph.operations[0].clientOperationId;
      },
      'IDs',
    ],
    [
      'wrong AO order',
      (v: ReturnType<typeof inputs>) => {
        v.graph.operations.reverse();
      },
      'order',
    ],
    [
      'row drift',
      (v: ReturnType<typeof inputs>) => {
        v.assemblySnapshot.row = {
          ...v.assemblySnapshot.row,
          revision: v.assemblySnapshot.row.revision + 1,
        };
      },
      'identity differ',
    ],
    [
      'server revision drift',
      (v: ReturnType<typeof inputs>) => {
        v.assemblySnapshot.serverAssemblyRevision += '0';
      },
      'identity differ',
    ],
    [
      'size drift',
      (v: ReturnType<typeof inputs>) => {
        v.assemblySnapshot.seams[0].anchoredSize = 'L';
      },
      'size differs',
    ],
    [
      'direction drift',
      (v: ReturnType<typeof inputs>) => {
        v.graph.seams[0].sides[0].direction = 'reverse';
      },
      'directions',
    ],
    [
      'piece line drift',
      (v: ReturnType<typeof inputs>) => {
        v.graph.seams[0].sides[0].pieceLineKey = 'foreign-piece';
      },
      'identity differs',
    ],
    [
      'missing material',
      (v: ReturnType<typeof inputs>) => {
        v.graph.compile.materials.pop();
      },
      'material definitions',
    ],
    [
      'changed continuum revision',
      (v: ReturnType<typeof inputs>) => {
        v.graph.compile.continuumMaterials[0].materialRevision = 'other-revision';
      },
      'revision',
    ],
    [
      'implicit instance expansion',
      (v: ReturnType<typeof inputs>) => {
        (v.graph.pieces[0] as { cutCount: number }).cutCount = 2;
      },
      'explicit instance',
    ],
  ] as const)('refuses %s', (_label, edit, message) => {
    const input = inputs(f);
    edit(input);
    expect(() =>
      validateDxfExactAssemblyGraphV1({
        graph: input.graph,
        assemblySnapshot: input.assemblySnapshot,
      }),
    ).toThrow(message);
  });
  it.each(['grain', 'vertex', 'source-seal', 'geometry'] as const)(
    'does not repair %s drift by coordinate inference',
    async (kind) => {
      const input = inputs(f);
      if (kind === 'grain') input.graph.pieces[0].grainDegrees = 20;
      if (kind === 'vertex') input.graph.seams[0].sides[0].anchors[0] = 'unknown-native-vertex';
      if (kind === 'source-seal') input.graph.source.handoffCanonicalSha256 = 'a'.repeat(64);
      if (kind === 'geometry')
        input.sourceHandoff.pieces[0].contours[0].vertices[0].positionMm[0] += 1;
      await expect(projectDxfExactAssemblyGraphCompileRequestV1(input)).rejects.toThrow();
    },
  );
  it('rejects an accessor without invoking it and does not admit caller owner fields', () => {
    const input = inputs(f);
    const get = vi.fn(() => input.graph);
    const hostile = { assemblySnapshot: input.assemblySnapshot };
    Object.defineProperty(hostile, 'graph', { get, enumerable: true });
    expect(() => validateDxfExactAssemblyGraphV1(hostile as never)).toThrow('Accessors');
    expect(get).not.toHaveBeenCalled();
    expect(() =>
      validateDxfExactAssemblyGraphV1({
        graph: { ...input.graph, owner: {} },
        assemblySnapshot: input.assemblySnapshot,
      }),
    ).toThrow('fields differ');
  });
  it('cancels before computation or after the final handoff await without returning a request', async () => {
    const c = new AbortController();
    c.abort();
    await expect(projectDxfExactAssemblyGraphCompileRequestV1(inputs(f), c.signal)).rejects.toThrow(
      'cancelled',
    );
    const later = new AbortController();
    const pending = projectDxfExactAssemblyGraphCompileRequestV1(inputs(f), later.signal);
    later.abort();
    await expect(pending).rejects.toThrow('cancelled');
    await expect(
      projectDxfExactAssemblyGraphCompileRequestV1(inputs(f), {} as AbortSignal),
    ).rejects.toThrow();
  });
});
