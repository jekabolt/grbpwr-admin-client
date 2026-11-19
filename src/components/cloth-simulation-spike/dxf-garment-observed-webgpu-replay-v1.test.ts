import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildDxfGarmentObservedUnsewnEdgesV1 } from './dxf-garment-observed-unsewn-edges-v1';
import { createThreePanelDxfMaterialCompileFixtureV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from 'lib/cloth/domain/dxf-garment-assembly-material-compile-stage-v1';
import { buildDxfAssemblyHandoffV1 } from 'lib/cloth/domain/dxf-assembly-handoff-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
  type DxfGarmentAssemblyExplicitPlacementStageRequestV1,
} from 'lib/cloth/domain/dxf-garment-assembly-explicit-placement-stage-v1';
import {
  buildGarmentMaterialRunPlanV1,
  GARMENT_MATERIAL_RUN_PLAN_V1,
} from 'lib/cloth/runtime/webgpu/garment-material-run-plan-v1';
import { createXpbdDeviceSession } from 'lib/cloth/runtime/webgpu/xpbd-device-session';
import { projectSavedModelDisplayedTriangleBodyV2 } from 'components/managers/models/components/saved-model-displayed-triangle-body-owner-v2';
import { createObservedPlacementPairCubeBodyFixtureV1 } from './beta-skirt-saved-annular-observed-placement-displayed-body-product-placement-v1.test-fixture';
import {
  sealTriangleStrainUtilizationPortV1,
  evaluateTriangleStrainUtilizationCpuV1,
  TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
} from './beta-skirt-canonical-medium-strain-utilization-diagnostic-v1';
import {
  DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
  DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1,
  runDxfGarmentObservedWebgpu16ReplayV1,
  runDxfGarmentObservedWebgpu32ReplayV1,
  projectDxfGarmentObservedWebgpuReplayV1,
  projectDxfGarmentObservedWebgpuRenderV1,
  getDxfGarmentObservedWebgpuReplayLifetimeV1,
  disposeDxfGarmentObservedWebgpuReplayV1,
  type DxfGarmentObservedWebgpuReplayRequestV1,
} from './dxf-garment-observed-webgpu-replay-v1';

/** SCRIPTED TRANSPORT ONLY: no WGSL executes. Mechanical state stays unchanged; continuum success
 * and CPU strain readbacks are scripted. This verifies real encoder/registry/lifecycle/geometry
 * wiring, never actual GPU dynamics or actual mannequin viewport qualification. */
class ScriptBuffer {
  data: Uint8Array<ArrayBuffer>;
  destroyed = false;
  mapped = false;
  constructor(
    readonly size: number,
    readonly usage: number,
    readonly label: string,
  ) {
    this.data = new Uint8Array(size);
  }
  async mapAsync() {
    if (this.destroyed) throw new Error('Destroyed map');
    this.mapped = true;
  }
  getMappedRange() {
    if (!this.mapped) throw new Error('Not mapped');
    return this.data.buffer;
  }
  unmap() {
    this.mapped = false;
  }
  destroy() {
    this.destroyed = true;
  }
}
type Group = { buffers: ScriptBuffer[] };
type Pipeline = { label: string; entryPoint: string; getBindGroupLayout: (n: number) => unknown };
type Command =
  | { kind: 'dispatch'; pipeline: Pipeline; group: Group; groups: number }
  | {
      kind: 'copy';
      source: ScriptBuffer;
      target: ScriptBuffer;
      sourceOffset: number;
      targetOffset: number;
      size: number;
    };
class ScriptDevice extends EventTarget {
  limits = {
    maxBufferSize: 256 * 1024 * 1024,
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxUniformBufferBindingSize: 65536,
    maxComputeWorkgroupsPerDimension: 65535,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxBindingsPerBindGroup: 8,
    maxStorageBuffersPerShaderStage: 8,
    maxUniformBuffersPerShaderStage: 4,
    maxBindGroups: 4,
  };
  lost = new Promise<never>(() => {});
  destroyed = false;
  buffers: ScriptBuffer[] = [];
  trace: { label: string; groups: number; params: Uint8Array[] }[] = [];
  submissions = 0;
  pending = Promise.resolve();
  scopes = 0;
  compileError = false;
  compileHold: Promise<void> | null = null;
  onCompile: () => void = () => {};
  onSubmit: (count: number) => void = () => {};
  hold: Promise<void> | null = null;
  invalidVelocity = false;
  skipStrain = false;
  checkpointLambdaDrift = false;
  queue = {
    writeBuffer: (b: ScriptBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) => {
      const bytes =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      b.data.set(bytes, offset);
    },
    submit: (batches: Command[][]) => {
      this.submissions++;
      this.onSubmit(this.submissions);
      this.pending = this.pending.then(async () => {
        if (this.hold) await this.hold;
        for (const batch of batches) for (const c of batch) await this.execute(c);
      });
    },
    onSubmittedWorkDone: () => this.pending,
  };
  createBuffer(d: { size: number; usage: number; label: string }) {
    const b = new ScriptBuffer(d.size, d.usage, d.label);
    this.buffers.push(b);
    return b;
  }
  createShaderModule(d: { label: string; code: string }) {
    return {
      ...d,
      getCompilationInfo: async () => {
        this.onCompile();
        if (this.compileHold) await this.compileHold;
        return {
          messages: this.compileError
            ? [{ type: 'error', message: 'scripted compile rejection' }]
            : [],
        };
      },
    };
  }
  async createComputePipelineAsync(d: {
    label: string;
    compute: { entryPoint: string; module: { label: string } };
  }): Promise<Pipeline> {
    return { label: d.label, entryPoint: d.compute.entryPoint, getBindGroupLayout: () => ({}) };
  }
  createBindGroup(d: {
    entries: { binding: number; resource: { buffer: ScriptBuffer } }[];
  }): Group {
    return {
      buffers: d.entries.sort((a, b) => a.binding - b.binding).map((e) => e.resource.buffer),
    };
  }
  createCommandEncoder() {
    const commands: Command[] = [];
    return {
      beginComputePass: () => {
        let pipeline: Pipeline, group: Group;
        return {
          setPipeline: (p: Pipeline) => {
            pipeline = p;
          },
          setBindGroup: (_: number, g: Group) => {
            group = g;
          },
          dispatchWorkgroups: (groups: number) =>
            commands.push({ kind: 'dispatch', pipeline, group, groups }),
          end: () => {},
        };
      },
      copyBufferToBuffer: (
        source: ScriptBuffer,
        sourceOffset: number,
        target: ScriptBuffer,
        targetOffset: number,
        size: number,
      ) => commands.push({ kind: 'copy', source, sourceOffset, target, targetOffset, size }),
      finish: () => commands,
    };
  }
  pushErrorScope() {
    this.scopes++;
  }
  async popErrorScope() {
    this.scopes--;
    return null;
  }
  destroy() {
    this.destroyed = true;
  }
  async execute(c: Command) {
    if (c.kind === 'copy') {
      c.target.data.set(
        c.source.data.subarray(c.sourceOffset, c.sourceOffset + c.size),
        c.targetOffset,
      );
      return;
    }
    const b = c.group.buffers,
      label = c.pipeline.label;
    this.trace.push({
      label,
      groups: c.groups,
      params: b.filter((x) => x.usage & 64).map((x) => x.data.slice()),
    });
    if (label === 'XPBD predict V1') b[1].data.set(b[0].data); // Deliberately no mechanical simulation.
    if (label.includes('reset')) {
      b[0].data.fill(0);
      if (label.includes('continuum')) new Uint32Array(b[2].data.buffer).fill(0xffffffff);
    }
    if (label === 'continuum strain vNext V1') {
      const p = new DataView(b[6].data.buffer),
        start = p.getUint32(0, true),
        count = p.getUint32(4, true);
      new Uint32Array(b[7].data.buffer).fill(0, start, start + count);
    }
    if (label === 'XPBD material velocity V2' && this.invalidVelocity) {
      new Uint32Array(b[5].data.buffer)[0] = 1;
      new Uint32Array(b[5].data.buffer)[1] = 1;
      new Uint32Array(b[5].data.buffer)[3] = 0;
      new Uint32Array(b[5].data.buffer)[4] = 0;
    }
    if (label === 'XPBD distance V1' && this.checkpointLambdaDrift)
      new Float32Array(b[3].data.buffer)[0] = Math.fround(0.01);
    if (label === 'generic strain exact v1' && !this.skipStrain) {
      const p = new DataView(b[5].data.buffer),
        T = p.getUint32(0, true),
        P = p.getUint32(4, true),
        M = p.getUint32(8, true),
        tri = new DataView(b[1].data.buffer),
        topology = new Uint32Array(T * 3);
      for (let t = 0; t < T; t++)
        for (let a = 0; a < 3; a++) topology[t * 3 + a] = tri.getUint32(t * 16 + a * 4, true);
      const port = await sealTriangleStrainUtilizationPortV1({
        schemaVersion: TRIANGLE_STRAIN_UTILIZATION_PORT_V1,
        vertexCount: P,
        triangleCount: T,
        materialCount: M,
        finalPositionsInvMassKg: new Float32Array(b[0].data.buffer),
        normalizedTopology: topology,
        triangleIndices: b[1].data.buffer,
        triangleRestFrames: b[2].data.buffer,
        materialIndices: new Uint32Array(b[3].data.buffer),
        materialRecords: b[4].data.buffer,
      });
      b[6].data.set(new Uint8Array(evaluateTriangleStrainUtilizationCpuV1(port).buffer));
      b[7].data.fill(0);
    }
  }
}
const cleanup: (() => unknown)[] = [];
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn();
});
const parameters = {
  dtS: 1 / 120,
  solverIterations: 8,
  gravityMps2Y: -9.81,
  windAccelerationMps2Z: 0,
  distanceComplianceMPerN: 2e-7,
  seamComplianceMPerN: 1e-8,
};
const coreBudgets = {
  maxParticles: 1000,
  maxTriangles: 2000,
  maxConstraintCount: 10000,
  maxGpuBytes: 8 * 1024 * 1024,
  maxDispatches: 100000,
  maxConstraintInvocations: 10000000,
  maxWorkgroupsPerDispatch: 65535,
};
const executionBudgets = {
  maxGpuBytes: 16 * 1024 * 1024,
  maxCpuBytes: 64 * 1024 * 1024,
  maxDispatches: 100000,
  maxPaddedInvocations: 10000000,
  maxContactTriangleVisits: 500000000,
  maxCopyBytes: 16 * 1024 * 1024,
  maxCopies: 1000,
  maxSubmissions: 33,
};
let placementRequest: DxfGarmentAssemblyExplicitPlacementStageRequestV1,
  expected: DxfGarmentObservedWebgpuReplayRequestV1['expected'];
beforeAll(async () => {
  const fixture = await createThreePanelDxfMaterialCompileFixtureV1('separated'),
    ids = new Map(fixture.request.materials.map((m) => [m.id, 'replay-cpu-isotropic-' + m.id]));
  const candidate = {
    ...fixture.candidate,
    materials: fixture.candidate.materials.map((m) => ({ ...m, id: ids.get(m.id)! })),
  };
  const handoff = await buildDxfAssemblyHandoffV1(candidate);
  if (!handoff.ok) throw new Error('Fixture handoff');
  const request = {
    ...fixture.request,
    handoff: handoff.value,
    materials: fixture.request.materials.map((m, i) => ({
      ...m,
      id: ids.get(m.id)!,
      label: 'Explicit CPU transport isotropic material',
      provenance: {
        ...m.provenance,
        description: 'Synthetic CPU transport fixture; not calibrated physical fabric.',
        sourceReference: 'dxf-garment-observed-webgpu-replay-v1.test.ts',
      },
      bendComplianceInvNm: { warp: i ? 0.0011 : 0.0006, weft: i ? 0.0011 : 0.0006 },
    })),
    continuumMaterials: fixture.request.continuumMaterials.map((m) => ({
      ...m,
      materialId: ids.get(m.materialId)!,
      provenance: { ...m.provenance, sourceId: 'explicit-isotropic-cpu-transport' },
    })),
  };
  const compiled = await compileDxfGarmentAssemblyMaterialStageV1(request);
  if (!compiled.compiled) throw new Error(JSON.stringify(compiled.blockers));
  placementRequest = {
    schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
    sourceRequest: request,
    sourceArtifact: compiled.artifact,
    expectedSourceInputSha256: compiled.artifact.sourceEvidence.inputSha256,
    placements: [
      {
        pieceId: 'panel-a',
        sourceOriginM: [0, 0, 0],
        rotationRowMajor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        translationM: [1, 0.5, 0],
      },
      {
        pieceId: 'panel-b',
        sourceOriginM: [0.2, 0, 0],
        rotationRowMajor: [0, 0, 1, 0, 1, 0, -1, 0, 0],
        translationM: [1.1, 0.5, 0],
      },
      {
        pieceId: 'panel-c',
        sourceOriginM: [0.4, 0, 0],
        rotationRowMajor: [-1, 0, 0, 0, 1, 0, 0, 0, -1],
        translationM: [1.1, 0.5, -0.1],
      },
    ],
  };
  const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1(placementRequest);
  if (!placed.ok || !placed.artifact.sealedSimulation)
    throw new Error(JSON.stringify(placed.blockers));
  const prefix = await buildGarmentMaterialRunPlanV1({
    schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
    sealedSimulation: placed.artifact.sealedSimulation,
    expectedPackageSha256: placed.artifact.sealedSimulation.seal.aggregateSha256,
    pieceRanges: compiled.artifact.refinement.mesh.pieceRanges,
    parameters: { ...parameters, frameCount: 16 },
    budgets: coreBudgets,
  });
  if (!prefix.ok) throw new Error(JSON.stringify(prefix.blockers));
  expected = {
    placementReportSha256: placed.artifact.report.reportSha256,
    prefixPlanSha256: prefix.plan.planSha256,
  };
});
async function fixture() {
  const body = await createObservedPlacementPairCubeBodyFixtureV1();
  cleanup.push(body.dispose);
  const device = new ScriptDevice();
  const context = { configure: () => {}, unconfigure: () => {} };
  const session = await createXpbdDeviceSession(
    { getContext: () => context } as unknown as HTMLCanvasElement,
    {
      gpu: {
        getPreferredCanvasFormat: () => 'bgra8unorm',
        requestAdapter: async () => ({ requestDevice: async () => device }),
      } as never,
    },
  );
  cleanup.push(() => session.dispose());
  const lease = session.acquireExclusive();
  cleanup.push(() => lease.release());
  const request: DxfGarmentObservedWebgpuReplayRequestV1 = {
    schemaVersion: DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_V1,
    profile: DXF_GARMENT_OBSERVED_WEBGPU_REPLAY_PROFILE_V1,
    placementRequest: structuredClone(placementRequest),
    bodyOwner: body.bodyOwner,
    bodyBinding: body.binding,
    hostCompileGeneration: 7,
    parameters: { ...parameters },
    coreBudgets: { ...coreBudgets },
    executionBudgets: { ...executionBudgets },
    expected: { ...expected },
    timeoutMs: 30000,
  };
  return { body, device, session, lease, request };
}

describe('actual encoder with explicitly scripted GPU transport (not physics evidence)', () => {
  it('encodes real16 then fresh0→32 with exact full16 snapshot, per-material ABI, same-lease strain and untouched borrowed owners', async () => {
    const f = await fixture(),
      r16 = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    expect(r16.ok, JSON.stringify(r16.report)).toBe(true);
    if (!r16.owner) throw new Error('No actual encoder receipt');
    cleanup.push(() => disposeDxfGarmentObservedWebgpuReplayV1(r16.owner));
    expect(r16.report.reportSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r16.report.diagnostics?.final.velocity).toEqual([
      0, 0, 0, 0xffffffff, 0xffffffff, 0xffffffff, 0, 0,
    ]);
    expect(r16.report.bodyBinding).toEqual(f.body.binding);
    expect(r16.report.execution).toMatchObject({
      framesSubmitted: 16,
      submissionCount: 17,
      borrowedLeaseReleased: false,
      borrowedDeviceDestroyed: false,
      cleanupPending: false,
    });
    expect(f.device.buffers.every((b) => b.destroyed)).toBe(true);
    expect(f.lease.active).toBe(true);
    expect(f.device.destroyed).toBe(false);
    const r32 = await runDxfGarmentObservedWebgpu32ReplayV1(f.request, r16.owner, f.lease);
    expect(r32.ok, JSON.stringify(r32.report)).toBe(true);
    if (r32.owner) cleanup.push(() => disposeDxfGarmentObservedWebgpuReplayV1(r32.owner));
    expect(r32.report).toMatchObject({
      checkpoint16Matched: true,
      claims: {
        numericReplayOnly: true,
        productAuthority: false,
        runtimeAuthority: false,
        continuationQualified: false,
      },
      execution: { framesSubmitted: 32, submissionCount: 33 },
    });
    expect(r32.report.strain?.valueCount).toBe(114 * 4);
    const projection = await projectDxfGarmentObservedWebgpuReplayV1(r32.owner);
    expect(projection?.strain.values).toHaveLength(114 * 4);
    expect(new Set(projection?.strain.renderTriangleIndices).size).toBe(114);
    projection?.strain.values.fill(77);
    expect((await projectDxfGarmentObservedWebgpuReplayV1(r32.owner))?.strain.values[0]).not.toBe(
      77,
    );
    const render = await projectDxfGarmentObservedWebgpuRenderV1(r32.owner);
    expect(render?.frameCount).toBe(32);
    expect(render?.report.reportSha256).toBe(r32.report.reportSha256);
    expect(render?.finalPositions3M).toHaveLength(78 * 3);
    expect(render?.garmentTriangles).toHaveLength(114 * 3);
    const actualBody = await projectSavedModelDisplayedTriangleBodyV2(
      f.body.bodyOwner,
      f.body.binding,
    );
    if (actualBody.status !== 'projected' || !render) throw new Error('No render projection');
    expect(render.bodyPositionsM).toEqual(actualBody.snapshot.bodyPositionsM);
    expect(render.bodyTriangles).toEqual(actualBody.snapshot.bodyTriangles);
    for (let particle = 0; particle < 78; particle++)
      for (let axis = 0; axis < 3; axis++)
        expect(render.finalPositions3M[particle * 3 + axis]).toBe(
          projection!.finalState.positions[particle * 4 + axis],
        );
    const expectedRanges = placementRequest.sourceArtifact.refinement.mesh.pieceRanges;
    expect(render.pieceRanges).toEqual(expectedRanges);
    expect(render.pieceRanges).not.toBe(expectedRanges);
    expect(render.pieceRanges[0]).not.toBe(expectedRanges[0]);
    expect(Object.isFrozen(render.pieceRanges)).toBe(true);
    expect(Object.isFrozen(render.pieceRanges[0])).toBe(true);
    const { mesh } = placementRequest.sourceArtifact.refinement;
    const handoffSeams = placementRequest.sourceArtifact.sourceEvidence.handoff.seams;
    expect(render.seamEdges.length).toBeGreaterThan(0);
    for (const seam of mesh.seams) {
      const source = handoffSeams.find(({ id }) => id === seam.seamId)!;
      for (const sideIndex of [0, 1] as const) {
        const edges = render.seamEdges.filter(
          (edge) => edge.runtimeSeamId === seam.seamId && edge.sideIndex === sideIndex,
        );
        expect(edges.map(({ vertexIndices }) => vertexIndices)).toEqual(
          Array.from({ length: seam.vertexPairs.length / 2 - 1 }, (_, index) => [
            seam.vertexPairs[index * 2 + sideIndex],
            seam.vertexPairs[(index + 1) * 2 + sideIndex],
          ]),
        );
        for (const edge of edges) {
          expect(edge.pieceId).toBe(source.sides[sideIndex].pieceId);
          const triangle = mesh.triangles.slice(
            edge.triangleIndex * 3,
            (edge.triangleIndex + 1) * 3,
          );
          expect([...triangle]).toEqual(expect.arrayContaining([...edge.vertexIndices]));
        }
      }
    }
    expect(Object.isFrozen(render.seamEdges[0]?.vertexIndices)).toBe(true);
    const { samplingRequest } = placementRequest.sourceArtifact.sourceEvidence;
    const sewnEdges = new Set(
      samplingRequest.equalSeams.flatMap(({ sides }) => sides.map(({ edgeId }) => edgeId)),
    );
    const nativeUnsewn = samplingRequest.pieces.flatMap(({ edges }) =>
      edges.filter(({ edgeId }) => !sewnEdges.has(edgeId)),
    );
    expect(render.unsewnEdges).toHaveLength(nativeUnsewn.length);
    const provenance = placementRequest.sourceArtifact.refinement.vertexProvenance;
    for (const edge of render.unsewnEdges) {
      const matches = nativeUnsewn.filter(
        (native) =>
          native.pieceId === edge.pieceId &&
          native.ringId === edge.contourId &&
          native.startBoundaryVertexId === edge.boundaryVertexIds[0] &&
          native.endBoundaryVertexId === edge.boundaryVertexIds[1],
      );
      expect(matches).toHaveLength(1);
      expect(provenance[edge.vertexIndices[0]!]!.source).toMatchObject({
        boundaryVertexId: edge.boundaryVertexIds[0],
      });
      expect(provenance[edge.vertexIndices.at(-1)!]!.source).toMatchObject({
        boundaryVertexId: edge.boundaryVertexIds[1],
      });
      expect(Object.isFrozen(edge.vertexIndices)).toBe(true);
    }
    expect(render.unsewnEdges.some(({ vertexIndices }) => vertexIndices.length > 2)).toBe(true);
    const duplicate = samplingRequest.pieces[0]!;
    const ambiguous = buildDxfGarmentObservedUnsewnEdgesV1(
      placementRequest.sourceArtifact.refinement,
      { ...samplingRequest, pieces: [...samplingRequest.pieces, duplicate] },
    );
    expect(ambiguous).toEqual(
      render.unsewnEdges.filter(({ pieceId }) => pieceId !== duplicate.input.pieceId),
    );
    const expectedTopology = render.garmentTriangles.slice();
    render.finalPositions3M.fill(77);
    render.garmentTriangles.fill(77);
    render.bodyPositionsM.fill(77);
    render.bodyTriangles.fill(77);
    render.strain.values.fill(77);
    render.strain.renderTriangleIndices.fill(77);
    const again = await projectDxfGarmentObservedWebgpuRenderV1(r32.owner);
    expect(again?.garmentTriangles).toEqual(expectedTopology);
    expect(again?.pieceRanges).toEqual(expectedRanges);
    expect(again?.finalPositions3M[0]).not.toBe(77);
    expect(again?.bodyPositionsM).toEqual(actualBody.snapshot.bodyPositionsM);
    expect(again?.bodyTriangles).toEqual(actualBody.snapshot.bodyTriangles);
    expect(again?.strain.values[0]).not.toBe(77);
    expect(new Set(again?.strain.renderTriangleIndices).size).toBe(114);
    expect(await projectDxfGarmentObservedWebgpuRenderV1({ ...r32.owner })).toBeNull();
    const bends = f.device.trace.filter(
      (t) => t.label === 'XPBD embedded scalar bend V2 altitude trust bound',
    );
    expect(
      new Set(bends.map((t) => new DataView(t.params[0].buffer).getFloat32(8, true))).size,
    ).toBe(2);
    const velocity = f.device.buffers.filter((b) => b.label === 'generic replay particleRetention');
    expect(new Set(new Float32Array(velocity[0].data.buffer)).size).toBe(2);
    expect(
      (await projectSavedModelDisplayedTriangleBodyV2(f.body.bodyOwner, f.body.binding)).status,
    ).toBe('projected');
  });
  it('refuses source/expectation/budget/owner/lease lookalikes before allocating buffers', async () => {
    const f = await fixture();
    let invoked = 0;
    const fakeLease = Object.defineProperty({}, 'active', {
      get() {
        invoked++;
        return true;
      },
    });
    const bad = [
      { ...f.request, expected: { ...expected, prefixPlanSha256: '0'.repeat(64) } },
      { ...f.request, bodyOwner: { ...f.body.bodyOwner } },
      { ...f.request, executionBudgets: { ...executionBudgets, maxGpuBytes: 1 } },
    ];
    for (const request of bad) {
      const r = await runDxfGarmentObservedWebgpu16ReplayV1(request, f.lease);
      expect(r.ok).toBe(false);
      expect(f.device.buffers).toHaveLength(0);
    }
    const r = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, fakeLease as never);
    expect(r.ok).toBe(false);
    expect(invoked).toBe(0);
  });
  it('retains terminal diagnostic failure and releases only owned buffers', async () => {
    const f = await fixture();
    f.device.invalidVelocity = true;
    const r = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    expect(r.ok).toBe(false);
    expect(r.owner).toBeNull();
    expect(r.report.execution.framesSubmitted).toBe(16);
    expect(r.report.blockers).toContain('gpu-state-diagnostics-failed');
    expect(r.report.diagnostics?.final.velocity[0]).toBe(1);
    expect(r.report.finalValidation?.evaluated).toBe(true);
    expect(f.device.buffers.every((b) => b.destroyed)).toBe(true);
    expect(f.lease.active).toBe(true);
  });
  it('retains unwritten strain sentinels as failure rather than accepting zero-initialized outputs', async () => {
    const f = await fixture();
    f.device.skipStrain = true;
    const r = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    expect(r.ok).toBe(false);
    expect(r.report.blockers).toContain('strain-cpu-gpu-or-validity-failed');
    const flags = f.device.buffers.find((b) => b.label === 'generic replay strainFlags')!;
    expect(new Uint32Array(flags.data.buffer).every((v) => v === 0xffffffff)).toBe(true);
  });
  it('compares lambdas too:32 scripted prefix drift is blocked even with identical final positions', async () => {
    const f = await fixture(),
      first = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    if (!first.owner) throw new Error(JSON.stringify(first.report));
    cleanup.push(() => disposeDxfGarmentObservedWebgpuReplayV1(first.owner));
    f.device.checkpointLambdaDrift = true;
    const next = await runDxfGarmentObservedWebgpu32ReplayV1(f.request, first.owner, f.lease);
    expect(next.ok).toBe(false);
    expect(next.report.blockers).toContain('exact16-prefix-checkpoint-mismatch');
    expect(next.report.finalValidation?.ok).toBe(true);
  });
  it('body replacement after submission cancels child and records the actual submitted frame', async () => {
    const f = await fixture();
    f.device.onSubmit = (n) => {
      if (n === 1) f.body.state.observation = null;
    };
    const r = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    expect(r.ok).toBe(false);
    expect(r.report.execution.framesSubmitted).toBe(1);
    expect(f.lease.active).toBe(true);
    expect(f.device.destroyed).toBe(false);
  });
  it('caller cancellation during a fresh model read preserves the borrowed body', async () => {
    const f = await fixture(),
      c = new AbortController();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve)),
      held = new Promise<void>((resolve) => (release = resolve));
    f.body.hooks.beforeReadModel = async () => {
      enter();
      await held;
    };
    const pending = runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease, c.signal);
    await entered;
    c.abort();
    const r = await pending;
    expect(r.ok).toBe(false);
    release();
    f.body.hooks.beforeReadModel = undefined;
    expect(
      (await projectSavedModelDisplayedTriangleBodyV2(f.body.bodyOwner, f.body.binding)).status,
    ).toBe('projected');
    expect(f.device.buffers).toHaveLength(0);
  });
  it('holds pending work ownership after abort, refuses a competing run, then cleans on queue drain', async () => {
    const f = await fixture(),
      c = new AbortController();
    let release!: () => void;
    f.device.hold = new Promise<void>((resolve) => (release = resolve));
    f.device.onSubmit = () => c.abort();
    const pending = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease, c.signal);
    expect(pending.ok).toBe(false);
    expect(pending.report.execution.cleanupPending).toBe(true);
    const competing = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    expect(competing.report.blockers.join()).toContain('pending generic replay');
    release();
    await f.device.pending;
    await Promise.resolve();
    expect(f.device.buffers.every((b) => b.destroyed)).toBe(true);
    expect(f.lease.active).toBe(true);
  });
  it('caller abort after successful return revokes only the genuine receipt, and rejects forged16', async () => {
    const f = await fixture(),
      c = new AbortController(),
      r = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease, c.signal);
    if (!r.owner) throw new Error(JSON.stringify(r.report));
    const signal = getDxfGarmentObservedWebgpuReplayLifetimeV1(r.owner);
    expect(signal).not.toBeNull();
    expect(await projectDxfGarmentObservedWebgpuReplayV1({ ...r.owner })).toBeNull();
    c.abort();
    expect(signal?.aborted).toBe(true);
    expect(await projectDxfGarmentObservedWebgpuReplayV1(r.owner)).toBeNull();
    expect(
      (await projectSavedModelDisplayedTriangleBodyV2(f.body.bodyOwner, f.body.binding)).status,
    ).toBe('projected');
    expect(f.lease.active).toBe(true);
  });
  it('aborts a stalled compilation without waiting for the driver or destroying the borrowed device', async () => {
    const f = await fixture(),
      c = new AbortController();
    let release!: () => void, enter!: () => void;
    f.device.compileHold = new Promise<void>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (enter = resolve));
    f.device.onCompile = () => enter();
    const pending = runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease, c.signal);
    await entered;
    c.abort();
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(f.device.buffers).toHaveLength(0);
    expect(f.lease.active).toBe(true);
    expect(f.device.destroyed).toBe(false);
    release();
    await Promise.resolve();
    expect(
      (await projectSavedModelDisplayedTriangleBodyV2(f.body.bodyOwner, f.body.binding)).status,
    ).toBe('projected');
  });
  it('retains shader compilation rejection without any allocation or borrowed-device destruction', async () => {
    const f = await fixture();
    f.device.compileError = true;
    const r = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    expect(r.ok).toBe(false);
    expect(r.report.blockers.join()).toContain('WGSL compilation');
    expect(f.device.buffers).toHaveLength(0);
    expect(f.lease.active).toBe(true);
    expect(f.device.scopes).toBe(0);
  });
  it('cancels a pending render read locally and keeps genuine replay/body available', async () => {
    const f = await fixture();
    const run = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    if (!run.owner) throw new Error(JSON.stringify(run.report));
    cleanup.push(() => disposeDxfGarmentObservedWebgpuReplayV1(run.owner));
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    f.body.hooks.beforeReadModel = async () => {
      enter();
      await held;
    };
    const caller = new AbortController();
    const pending = projectDxfGarmentObservedWebgpuRenderV1(run.owner, caller.signal);
    await entered;
    caller.abort();
    expect(await pending).toBeNull();
    expect(getDxfGarmentObservedWebgpuReplayLifetimeV1(run.owner)).not.toBeNull();
    release();
    f.body.hooks.beforeReadModel = undefined;
    expect((await projectDxfGarmentObservedWebgpuRenderV1(run.owner))?.frameCount).toBe(16);
    expect(f.lease.active).toBe(true);
  });
  it('revoking a frame ends a pending render read without waiting for or revoking borrowed body', async () => {
    const f = await fixture();
    const run = await runDxfGarmentObservedWebgpu16ReplayV1(f.request, f.lease);
    if (!run.owner) throw new Error(JSON.stringify(run.report));
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    f.body.hooks.beforeReadModel = async () => {
      enter();
      await held;
    };
    const pending = projectDxfGarmentObservedWebgpuRenderV1(run.owner);
    await entered;
    disposeDxfGarmentObservedWebgpuReplayV1(run.owner);
    expect(await pending).toBeNull();
    release();
    f.body.hooks.beforeReadModel = undefined;
    expect(
      (await projectSavedModelDisplayedTriangleBodyV2(f.body.bodyOwner, f.body.binding)).status,
    ).toBe('projected');
    expect(await projectDxfGarmentObservedWebgpuRenderV1(run.owner)).toBeNull();
    expect(f.lease.active).toBe(true);
  });
});
