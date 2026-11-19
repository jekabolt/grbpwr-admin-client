import { beforeAll, describe, expect, it } from 'vitest';
import { createThreePanelDxfMaterialCompileFixtureV1 } from '../../domain/dxf-garment-assembly-material-compile-stage-v1.test-fixture';
import { compileDxfGarmentAssemblyMaterialStageV1 } from '../../domain/dxf-garment-assembly-material-compile-stage-v1';
import { buildDxfAssemblyHandoffV1 } from '../../domain/dxf-assembly-handoff-v1';
import {
  buildDxfGarmentAssemblyExplicitPlacementStageV1,
  DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
} from '../../domain/dxf-garment-assembly-explicit-placement-stage-v1';
import {
  buildGarmentMaterialRunPlanV1,
  GARMENT_MATERIAL_RUN_PLAN_V1,
  type GarmentMaterialRunPlanRequestV1,
} from './garment-material-run-plan-v1';
import {
  buildGarmentMaterialContactExecutionLayoutV1,
  packGarmentMaterialContactCheckpointV1,
  decodeGarmentMaterialContactCheckpointV1,
  GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1,
  GARMENT_MATERIAL_NATIVE_DIAGNOSTIC_BODY_CONTACT_V1,
  type GarmentMaterialContactExecutionLayoutRequestV1,
  type GarmentMaterialContactExecutionLayoutV1,
  type GarmentMaterialContactCheckpointV1,
} from './garment-material-contact-execution-layout-v1';
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
async function genuineFoldedPackage(isotropic: boolean) {
  const fixture = await createThreePanelDxfMaterialCompileFixtureV1('separated');
  let request = fixture.request;
  if (isotropic) {
    // Explicit NEW CPU-fixture material identities. Original visual anisotropy is not modified,
    // silently collapsed, or presented as calibrated physical fabric.
    const ids = new Map(fixture.request.materials.map((m) => [m.id, `cpu-isotropic-${m.id}`]));
    const candidate = {
      ...fixture.candidate,
      materials: fixture.candidate.materials.map((m) => ({ ...m, id: ids.get(m.id)! })),
    };
    const handoff = await buildDxfAssemblyHandoffV1(candidate);
    if (!handoff.ok) throw new Error(JSON.stringify(handoff));
    request = {
      ...request,
      handoff: handoff.value,
      materials: fixture.request.materials.map((m, i) => ({
        ...m,
        id: ids.get(m.id)!,
        label: `Explicit isotropic CPU fixture ${i}`,
        provenance: {
          ...m.provenance,
          description: 'Synthetic CPU test material; isotropic bend authored explicitly.',
          sourceReference: 'garment-material-contact-execution-layout-v1.test.ts',
        },
        bendComplianceInvNm: { warp: i === 0 ? 0.0006 : 0.0011, weft: i === 0 ? 0.0006 : 0.0011 },
      })),
      continuumMaterials: fixture.request.continuumMaterials.map((m) => ({
        ...m,
        materialId: ids.get(m.materialId)!,
        provenance: { ...m.provenance, sourceId: 'explicit-isotropic-cpu-fixture' },
      })),
    };
  }
  const compiled = await compileDxfGarmentAssemblyMaterialStageV1(request);
  if (!compiled.compiled) throw new Error(JSON.stringify(compiled.blockers));
  const placed = await buildDxfGarmentAssemblyExplicitPlacementStageV1({
    schemaVersion: DXF_GARMENT_ASSEMBLY_EXPLICIT_PLACEMENT_STAGE_V1,
    sourceRequest: request,
    sourceArtifact: compiled.artifact,
    expectedSourceInputSha256: compiled.artifact.sourceEvidence.inputSha256,
    placements: [
      {
        pieceId: 'panel-a',
        sourceOriginM: [0, 0, 0],
        rotationRowMajor: IDENTITY,
        translationM: [0, 0, 0],
      },
      {
        pieceId: 'panel-b',
        sourceOriginM: [0.2, 0, 0],
        rotationRowMajor: [0, 0, 1, 0, 1, 0, -1, 0, 0],
        translationM: [0.1, 0, 0],
      },
      {
        pieceId: 'panel-c',
        sourceOriginM: [0.4, 0, 0],
        rotationRowMajor: [-1, 0, 0, 0, 1, 0, 0, 0, -1],
        translationM: [0.1, 0, -0.1],
      },
    ],
  });
  if (!placed.ok || !placed.artifact.sealedSimulation)
    throw new Error(JSON.stringify(placed.blockers));
  return {
    sealedSimulation: placed.artifact.sealedSimulation,
    pieceRanges: placed.artifact.localSourceArtifact.refinement.mesh.pieceRanges,
  };
}
function requestFor(
  source: Awaited<ReturnType<typeof genuineFoldedPackage>>,
): GarmentMaterialRunPlanRequestV1 {
  return {
    schemaVersion: GARMENT_MATERIAL_RUN_PLAN_V1,
    ...source,
    expectedPackageSha256: source.sealedSimulation.seal.aggregateSha256,
    parameters: {
      dtS: 1 / 120,
      solverIterations: 8,
      frameCount: 16,
      gravityMps2Y: -9.81,
      windAccelerationMps2Z: 0,
      distanceComplianceMPerN: 2e-7,
      seamComplianceMPerN: 1e-8,
    },
    budgets: {
      maxParticles: 1000,
      maxTriangles: 2000,
      maxConstraintCount: 10000,
      maxGpuBytes: 8 * 1024 * 1024,
      maxDispatches: 100000,
      maxConstraintInvocations: 10_000_000,
      maxWorkgroupsPerDispatch: 65535,
    },
  };
}

function requestLayout(
  corePlan: GarmentMaterialContactExecutionLayoutRequestV1['corePlan'],
): GarmentMaterialContactExecutionLayoutRequestV1 {
  return {
    corePlan,
    bodyVertexCount: 8,
    bodyTriangleCount: 12,
    freeParticleCount: 78,
    frameCount: corePlan.report.parameters.frameCount as 16 | 32,
    profile: GARMENT_MATERIAL_CONTACT_REPLAY_PROFILE_V1,
    bodyOutwardSign: 1,
    budgets: {
      maxGpuBytes: 16 * 1024 * 1024,
      maxCpuBytes: 32 * 1024 * 1024,
      maxDispatches: 100000,
      maxPaddedInvocations: 100_000_000,
      maxContactTriangleVisits: 100_000_000,
      maxCopyBytes: 64 * 1024 * 1024,
      maxCopies: 1000,
      maxSubmissions: 33,
    },
    deviceLimits: {
      maxBufferSize: 128 * 1024 * 1024,
      maxStorageBufferBindingSize: 128 * 1024 * 1024,
      maxUniformBufferBindingSize: 65536,
      maxComputeWorkgroupsPerDimension: 65535,
      maxComputeInvocationsPerWorkgroup: 256,
      maxComputeWorkgroupSizeX: 256,
      maxBindingsPerBindGroup: 1000,
      maxStorageBuffersPerShaderStage: 8,
      maxUniformBuffersPerShaderStage: 12,
      maxBindGroups: 4,
    },
  };
}
function requireLayout(request: GarmentMaterialContactExecutionLayoutRequestV1) {
  const result = buildGarmentMaterialContactExecutionLayoutV1(request);
  if (!result.ok) throw new Error(JSON.stringify(result.blockers));
  return result.layout;
}
function checkpointFor(
  layout: GarmentMaterialContactExecutionLayoutV1,
): GarmentMaterialContactCheckpointV1 {
  const clone = (key: string) => new Float32Array((layout.uploads[key] as Float32Array) ?? []);
  return {
    positions: clone('positions'),
    previousPositions: clone('previousPositions'),
    velocities: clone('velocities'),
    distanceLambdas: clone('distanceLambdas'),
    seamLambdas: clone('seamLambdas'),
    bendLambdas: clone('bendLambdas'),
    continuumLambdas: clone('continuumLambdas'),
    velocityDiagnostics: new Uint32Array(layout.uploads.velocityDiagnostics as Uint32Array),
    bendDiagnostics: new Uint32Array(layout.bendDiagnostics),
    contactDiagnostics: new Uint32Array(layout.contactDiagnostics),
    continuumStatuses: new Uint32Array(layout.counts.triangles),
  };
}
function floatBits(value: number) {
  const a = new Float32Array([value]);
  return new Uint32Array(a.buffer)[0];
}

describe('full contact execution layout: genuine compiler content, synthetic body counts; no GPU/owner authority', () => {
  let request16: GarmentMaterialContactExecutionLayoutRequestV1,
    request32: GarmentMaterialContactExecutionLayoutRequestV1;
  beforeAll(async () => {
    const source = await genuineFoldedPackage(true),
      request = requestFor(source);
    const r16 = await buildGarmentMaterialRunPlanV1(request),
      r32 = await buildGarmentMaterialRunPlanV1({
        ...request,
        parameters: { ...request.parameters, frameCount: 32 },
      });
    if (!r16.ok || !r32.ok) throw new Error(JSON.stringify([r16.blockers, r32.blockers]));
    request16 = requestLayout(r16.plan);
    request32 = requestLayout(r32.plan);
  });
  it('changes only the contact margin for the named coarse DXF policy in both replays', () => {
    const policy = GARMENT_MATERIAL_NATIVE_DIAGNOSTIC_BODY_CONTACT_V1;
    for (const request of [request16, request32]) {
      const ordinary = requireLayout(request);
      const diagnostic = buildGarmentMaterialContactExecutionLayoutV1(request, policy.id);
      expect(diagnostic.ok).toBe(true);
      if (!diagnostic.ok) throw new Error(JSON.stringify(diagnostic.blockers));
      const expectedParams = ordinary.contactParams.slice();
      expect(new DataView(expectedParams).getFloat32(16, true)).toBe(Math.fround(0.002));
      new DataView(expectedParams).setFloat32(16, policy.clearanceMarginM, true);
      expect(diagnostic.layout).toEqual({ ...ordinary, contactParams: expectedParams });
    }
    expect(
      buildGarmentMaterialContactExecutionLayoutV1(request16, 'unknown-policy' as typeof policy.id)
        .ok,
    ).toBe(false);
  });
  it('accounts every actual core/body/strain/checkpoint buffer for real 78/114 content and nonmultiple64 dispatches', () => {
    const before = structuredClone(request16),
      a = requireLayout(request16),
      b = requireLayout(request32);
    expect(a.counts).toMatchObject({
      particles: 78,
      triangles: 114,
      distance: 189,
      seam: 8,
      bend: 153,
    });
    expect(a.snapshotBytes).toBe(7504);
    expect(b.snapshotBytes).toBe(7504);
    expect(a.checkpoint.fields).toEqual({
      positions: { offset: 0, byteLength: 1248 },
      previousPositions: { offset: 1248, byteLength: 1248 },
      velocities: { offset: 2496, byteLength: 1248 },
      distanceLambdas: { offset: 3744, byteLength: 756 },
      seamLambdas: { offset: 4500, byteLength: 32 },
      bendLambdas: { offset: 4532, byteLength: 612 },
      continuumLambdas: { offset: 5144, byteLength: 1824 },
      velocityDiagnostics: { offset: 6968, byteLength: 32 },
      bendDiagnostics: { offset: 7000, byteLength: 8 },
      contactDiagnostics: { offset: 7008, byteLength: 40 },
      continuumStatuses: { offset: 7048, byteLength: 456 },
    });
    expect(a.work.contactWorkgroups).toBe(2);
    expect(a.work.strainWorkgroups).toBe(2);
    expect(a.work).toMatchObject({
      dispatchCount: request16.corePlan.report.dispatchCount + 17,
      paddedInvocations: request16.corePlan.report.paddedInvocations + 17 * 128,
      contactTriangleVisits: 16 * 78 * 12,
      copyCount: 13,
      copyBytes: 7504 + 2280,
      submissionCount: 17,
    });
    expect(b.work).toMatchObject({
      dispatchCount: request32.corePlan.report.dispatchCount + 33,
      contactTriangleVisits: 32 * 78 * 12,
      copyCount: 25,
      copyBytes: 3 * 7504 + 2280,
      submissionCount: 33,
    });
    expect(a.readback).toEqual({
      byteLength: 9784,
      frame16Offset: 0,
      finalOffset: 0,
      strainValuesOffset: 7504,
      strainFlagsOffset: 9328,
    });
    expect(b.readback).toEqual({
      byteLength: 17288,
      frame16Offset: 0,
      finalOffset: 7504,
      strainValuesOffset: 15008,
      strainFlagsOffset: 16832,
    });
    expect(a.fullGpuBytes).toBe(a.allocations.reduce((n, v) => n + v.byteLength, 0));
    expect(a.fullGpuBytes).toBe(
      request16.corePlan.report.coreGpuBytes + 12 * 8 + 12 * 12 + 32 + 40 + 16 + 2280 + 9784,
    );
    expect(b.fullGpuBytes).toBe(
      request32.corePlan.report.coreGpuBytes +
        12 * 8 +
        12 * 12 +
        32 +
        40 +
        16 +
        2280 +
        7504 +
        17288,
    );
    expect(a.cpuStagingBytes).toBeGreaterThan(a.inputUploadBytes);
    expect(request16).toEqual(before);
    expect(a.claims).toEqual({
      contentOnly: true,
      sourcePersistenceAuthenticated: false,
      gpuExecutionPerformed: false,
      runtimeAuthority: false,
      continuationAuthority: false,
    });
  });
  it('bounds actual executor checkpoint, hash, strain port and retained16 binary copies without calling it whole-process heap', () => {
    for (const request of [request16, request32]) {
      const a = requireLayout(request),
        S = a.snapshotBytes,
        R = a.readback.byteLength,
        T = a.counts.triangles,
        P = a.counts.particles,
        M = a.counts.materials,
        B = 12 * (a.bodyVertexCount + a.bodyTriangleCount);
      expect(a.cpuStaging.components).toEqual({
        coreCaptureAndInput: (a.frameCount === 32 ? 3 : 2) * a.capturedCoreBytes,
        uploadTransfer: a.inputUploadBytes,
        bodyProjection: 3 * B,
        extraInitial: 88 + 28 * T,
        readbackMapping: 2 * R,
        checkpointCopies: 6 * S,
        strainDecodedOracleReceiptAndHash: 92 * T,
        strainPortAndHash: 3 * (16 * P + 64 * T + 16 * M),
        priorReceipt: a.frameCount === 32 ? 2 * S + 28 * T : 0,
      });
      expect(a.cpuStagingBytes).toBe(
        Object.values(a.cpuStaging.components).reduce((sum, n) => sum + n, 0),
      );
      expect(
        a.cpuStaging.components.readbackMapping + a.cpuStaging.components.checkpointCopies,
      ).toBeGreaterThanOrEqual(R + 4 * S);
      expect(a.cpuStaging.scope).toBe('per-execution-binary-upload-checkpoint-and-strain-staging');
      expect(a.cpuStaging.exclusions).toContain('compiler-and-geometric-validator-heap');
      expect(a.cpuStaging.exclusions).toContain('repeated-public-projection-results');
      const understated = {
        ...request,
        budgets: { ...request.budgets, maxCpuBytes: a.cpuStagingBytes - 1 },
      };
      expect(buildGarmentMaterialContactExecutionLayoutV1(understated).ok).toBe(false);
    }
  });
  it('retains exact colored strain mapping/material/rest ABI and initializes all sentinels', () => {
    const a = requireLayout(request16),
      c = request16.corePlan.sourceSealedSimulation.simulation.constraints.continuumStrain;
    const provenance = new DataView(c.constraintRecords),
      original = new DataView(
        request16.corePlan.sourceSealedSimulation.simulation.material.triangleIndices,
      ),
      colored = new DataView(a.uploads.continuumTriangles as ArrayBuffer);
    for (let i = 0; i < 114; i++) {
      expect(a.strainOrder.renderTriangleIndices[i]).toBe(provenance.getUint32(i * 16 + 4, true));
      expect(a.strainOrder.sourceTriangleIndices[i]).toBe(provenance.getUint32(i * 16, true));
      for (let k = 0; k < 3; k++)
        expect(colored.getUint32(i * 16 + 4 * k, true)).toBe(
          original.getUint32(a.strainOrder.renderTriangleIndices[i] * 16 + 4 * k, true),
        );
    }
    expect(Array.from(a.strainOrder.renderTriangleIndices)).not.toEqual(
      Array.from({ length: 114 }, (_, i) => i),
    );
    expect(a.uploads.continuumRestFrames).toEqual(c.triangleRestFrames);
    expect(a.uploads.continuumMaterials).toEqual(c.materialRecords);
    expect(a.contactDiagnostics).toEqual(new Uint32Array([0, 0, 0, 0, 0, 0, 0xffffffff, 0, 0, 0]));
    expect(a.bendDiagnostics).toEqual(new Uint32Array(2));
    expect(a.strainFlags.every((v) => v === 0xffffffff)).toBe(true);
    expect((a.uploads.continuumStatuses as Uint32Array).every((v) => v === 0xffffffff)).toBe(true);
    expect(new Uint32Array(a.strainParams)).toEqual(new Uint32Array([114, 78, 2, 0]));
    const contact = new DataView(a.contactParams);
    expect(contact.getFloat32(16, true)).toBe(Math.fround(0.002));
    expect(contact.getFloat32(20, true)).toBe(Math.fround(0.08));
    (a.uploads.positions as Float32Array)[0] = 123;
    expect(request16.corePlan.physicalInitialPositions[0]).not.toBe(123);
  });
  it.each([
    'maxGpuBytes',
    'maxCpuBytes',
    'maxDispatches',
    'maxPaddedInvocations',
    'maxContactTriangleVisits',
    'maxCopyBytes',
    'maxCopies',
    'maxSubmissions',
  ] as const)('refuses complete %s budget before allocation', (key) => {
    expect(
      buildGarmentMaterialContactExecutionLayoutV1({
        ...request16,
        budgets: { ...request16.budgets, [key]: 1 },
      }).ok,
    ).toBe(false);
  });
  it.each([
    'maxBufferSize',
    'maxStorageBufferBindingSize',
    'maxUniformBufferBindingSize',
    'maxComputeWorkgroupsPerDimension',
    'maxComputeInvocationsPerWorkgroup',
    'maxComputeWorkgroupSizeX',
    'maxBindingsPerBindGroup',
    'maxStorageBuffersPerShaderStage',
  ] as const)('refuses insufficient actual hardware %s', (key) => {
    expect(
      buildGarmentMaterialContactExecutionLayoutV1({
        ...request16,
        deviceLimits: { ...request16.deviceLimits, [key]: 1 },
      }).ok,
    ).toBe(false);
  });
  it('refuses changed counts, frame profile, overflows, getters, aliased/inexact arrays and forged accounting', () => {
    for (const patch of [
      { freeParticleCount: 77 },
      { bodyTriangleCount: Number.MAX_SAFE_INTEGER },
      { bodyVertexCount: 0 },
      { frameCount: 32 },
      { profile: 'other' },
    ])
      expect(
        buildGarmentMaterialContactExecutionLayoutV1({
          ...request16,
          ...patch,
        } as GarmentMaterialContactExecutionLayoutRequestV1).ok,
      ).toBe(false);
    let calls = 0;
    const getter = { ...request16 };
    Object.defineProperty(getter, 'bodyTriangleCount', {
      get() {
        calls++;
        return 12;
      },
    });
    expect(buildGarmentMaterialContactExecutionLayoutV1(getter).ok).toBe(false);
    expect(calls).toBe(0);
    const aliased = structuredClone(request16);
    aliased.corePlan.uploads.previousPositions = new Float32Array(
      (aliased.corePlan.uploads.positions as Float32Array).buffer,
    );
    expect(buildGarmentMaterialContactExecutionLayoutV1(aliased).ok).toBe(false);
    const short = structuredClone(request16);
    short.corePlan.uploads.continuumRestFrames = new ArrayBuffer(4);
    expect(buildGarmentMaterialContactExecutionLayoutV1(short).ok).toBe(false);
    const forged = {
      ...request16,
      corePlan: {
        ...request16.corePlan,
        report: { ...request16.corePlan.report, dispatchCount: 1 },
      },
    };
    expect(buildGarmentMaterialContactExecutionLayoutV1(forged).ok).toBe(false);
    const wrongMap = structuredClone(request16);
    new DataView(
      wrongMap.corePlan.sourceSealedSimulation.simulation.constraints.continuumStrain.constraintRecords,
    ).setUint32(0, 114, true);
    expect(buildGarmentMaterialContactExecutionLayoutV1(wrongMap).ok).toBe(false);
  });
  it('refuses coherent-looking truncated or altered solve/predict/reset packets, type reinterpretation and hidden property extensions', () => {
    for (const mutate of [
      (r: GarmentMaterialContactExecutionLayoutRequestV1) =>
        new DataView(r.corePlan.predictionFrames[0]).setUint32(0, 1, true),
      (r: GarmentMaterialContactExecutionLayoutRequestV1) =>
        new DataView(r.corePlan.distance[0].params).setUint32(4, 999, true),
      (r: GarmentMaterialContactExecutionLayoutRequestV1) =>
        new DataView(r.corePlan.resets[0].params).setUint32(0, 1, true),
      (r: GarmentMaterialContactExecutionLayoutRequestV1) => {
        r.corePlan.uploads.velocities = new Uint32Array(
          r.corePlan.uploads.velocities as Float32Array,
        );
      },
      (r: GarmentMaterialContactExecutionLayoutRequestV1) =>
        Object.defineProperty(r.corePlan.velocityParams, 'extra', { value: 1 }),
    ]) {
      const r = structuredClone(request16);
      mutate(r);
      expect(buildGarmentMaterialContactExecutionLayoutV1(r).ok).toBe(false);
    }
    const reordered = structuredClone(request16);
    (reordered.corePlan.sequence.perIteration as string[]).reverse();
    expect(buildGarmentMaterialContactExecutionLayoutV1(reordered).ok).toBe(false);
  });
  it('admits exact complete byte/copy budgets and refuses one byte or copy less', () => {
    const a = requireLayout(request16);
    const exact = {
      ...request16,
      budgets: {
        ...request16.budgets,
        maxGpuBytes: a.fullGpuBytes,
        maxCpuBytes: a.cpuStagingBytes,
        maxCopies: a.work.copyCount,
        maxCopyBytes: a.work.copyBytes,
      },
    };
    expect(buildGarmentMaterialContactExecutionLayoutV1(exact).ok).toBe(true);
    for (const key of ['maxGpuBytes', 'maxCpuBytes', 'maxCopies', 'maxCopyBytes'] as const)
      expect(
        buildGarmentMaterialContactExecutionLayoutV1({
          ...exact,
          budgets: { ...exact.budgets, [key]: exact.budgets[key] - 1 },
        }).ok,
      ).toBe(false);
  });
  it('refuses changing checkpoint count getters without invocation before allocation', () => {
    const a = requireLayout(request16),
      state = checkpointFor(a),
      fields = { ...a.checkpoint.fields };
    let offset = 0;
    for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
      const byteLength = ['positions', 'previousPositions', 'velocities'].includes(key)
        ? 2001 * 16
        : fields[key].byteLength;
      fields[key] = { offset, byteLength };
      offset += byteLength;
    }
    let calls = 0;
    const counts = { ...a.counts };
    Object.defineProperty(counts, 'particles', {
      enumerable: true,
      get: () => (++calls === 1 ? 78 : 2001),
    });
    const hostile = {
      ...a,
      counts,
      snapshotBytes: offset,
      checkpoint: { byteLength: offset, fields },
    };
    expect(() => packGarmentMaterialContactCheckpointV1(hostile, state)).toThrow();
    expect(calls).toBe(0);
    calls = 0;
    expect(() =>
      decodeGarmentMaterialContactCheckpointV1(hostile, new Uint8Array(offset), 16),
    ).toThrow();
    expect(calls).toBe(0);
  });
  it.each(['frameCount', 'solverIterations', 'freeParticleCount', 'bodyTriangleCount'] as const)(
    'captures checkpoint %s without invoking caller getter',
    (key) => {
      const a = requireLayout(request16),
        state = checkpointFor(a),
        bytes = packGarmentMaterialContactCheckpointV1(a, state),
        hostile = { ...a };
      let calls = 0;
      Object.defineProperty(hostile, key, {
        enumerable: true,
        get: () => {
          calls++;
          return a[key];
        },
      });
      expect(() => packGarmentMaterialContactCheckpointV1(hostile, state)).toThrow();
      expect(() => decodeGarmentMaterialContactCheckpointV1(hostile, bytes, 16)).toThrow();
      expect(calls).toBe(0);
    },
  );
  it('refuses nested checkpoint offset and extent accessors without invoking them', () => {
    const a = requireLayout(request16),
      state = checkpointFor(a),
      bytes = packGarmentMaterialContactCheckpointV1(a, state);
    let calls = 0;
    const extent = { ...a.checkpoint.fields.positions };
    Object.defineProperty(extent, 'offset', {
      enumerable: true,
      get: () => {
        calls++;
        return 0;
      },
    });
    const hostile = {
      ...a,
      checkpoint: { ...a.checkpoint, fields: { ...a.checkpoint.fields, positions: extent } },
    };
    expect(() => packGarmentMaterialContactCheckpointV1(hostile, state)).toThrow();
    expect(() => decodeGarmentMaterialContactCheckpointV1(hostile, bytes, 16)).toThrow();
    expect(calls).toBe(0);
  });
  it('packs every checkpoint state/lambda/diagnostic byte exactly, decodes detached arrays, preserves failed nonfinite evidence', () => {
    const a = requireLayout(request16),
      state = checkpointFor(a);
    state.positions[0] = -0;
    state.previousPositions[1] = 3.25;
    state.velocities[2] = -4;
    state.distanceLambdas[0] = 0.25;
    state.seamLambdas[0] = -0.5;
    state.bendLambdas[0] = 0.75;
    state.continuumLambdas[0] = 1.25;
    state.bendDiagnostics[1] = 9;
    state.continuumStatuses[1] = 2;
    state.positions[8] = NaN;
    const bytes = packGarmentMaterialContactCheckpointV1(a, state),
      decoded = decodeGarmentMaterialContactCheckpointV1(a, bytes, 16);
    expect(bytes.byteLength).toBe(7504);
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x80000000);
    expect(new DataView(bytes.buffer).getUint32(7004, true)).toBe(9);
    expect(packGarmentMaterialContactCheckpointV1(a, decoded)).toEqual(bytes);
    expect(Number.isNaN(decoded.positions[8])).toBe(true);
    expect(decoded.continuumStatuses[1]).toBe(2);
    decoded.previousPositions[1] = 99;
    expect(state.previousPositions[1]).toBe(3.25);
    expect(new DataView(bytes.buffer).getFloat32(1252, true)).toBe(3.25);
  });
  it('rejects checkpoint overlap, shifted layout, missing bytes and extra fields', () => {
    const a = requireLayout(request16),
      state = checkpointFor(a);
    expect(() =>
      packGarmentMaterialContactCheckpointV1(a, { ...state, previousPositions: state.positions }),
    ).toThrow(/Overlapping/);
    expect(() =>
      packGarmentMaterialContactCheckpointV1(a, {
        ...state,
        extra: 0,
      } as GarmentMaterialContactCheckpointV1),
    ).toThrow();
    expect(() =>
      packGarmentMaterialContactCheckpointV1(
        {
          ...a,
          checkpoint: {
            ...a.checkpoint,
            fields: { ...a.checkpoint.fields, bendDiagnostics: { offset: 7004, byteLength: 8 } },
          },
        },
        state,
      ),
    ).toThrow(/offset/);
    expect(() => decodeGarmentMaterialContactCheckpointV1(a, new Uint8Array(7503), 16)).toThrow(
      /Inexact/,
    );
    expect(() => decodeGarmentMaterialContactCheckpointV1(a, new Uint8Array(7504), 32)).toThrow(
      /completed-frame/,
    );
  });
  it('accepts legitimate zero contacts and retains bounded failed/capped contacts without admitting them', () => {
    const a = requireLayout(request16),
      state = checkpointFor(a);
    expect(
      decodeGarmentMaterialContactCheckpointV1(
        a,
        packGarmentMaterialContactCheckpointV1(a, state),
        16,
      ).contactDiagnostics[0],
    ).toBe(0);
    state.contactDiagnostics.set([
      2,
      1,
      4,
      3,
      floatBits(0.08),
      floatBits(0.2),
      4,
      1,
      floatBits(0.1),
      0,
    ]);
    const failed = decodeGarmentMaterialContactCheckpointV1(
      a,
      packGarmentMaterialContactCheckpointV1(a, state),
      16,
    );
    expect(failed.contactDiagnostics).toEqual(state.contactDiagnostics);
    state.velocityDiagnostics.set([3, 1, 2, 4, 7, 4, floatBits(120), 0]);
    state.bendDiagnostics.set([1, 2]);
    expect(
      decodeGarmentMaterialContactCheckpointV1(
        a,
        packGarmentMaterialContactCheckpointV1(a, state),
        16,
      ).velocityDiagnostics[0],
    ).toBe(3);
  });
  it.each([
    ['velocityDiagnostics', 0, 16 * 78 + 1],
    ['velocityDiagnostics', 3, 0],
    ['velocityDiagnostics', 7, 1],
    ['bendDiagnostics', 1, 16 * 8 * 153 + 1],
    ['contactDiagnostics', 0, 16 * 78 + 1],
    ['contactDiagnostics', 2, 16 * 78 * 12 + 1],
    ['contactDiagnostics', 6, 0],
    ['contactDiagnostics', 9, 1],
    ['continuumStatuses', 0, 5],
  ] as const)('refuses impossible %s[%s] cumulative/sentinel data', (name, index, value) => {
    const a = requireLayout(request16),
      state = checkpointFor(a);
    state[name][index] = value;
    expect(() =>
      decodeGarmentMaterialContactCheckpointV1(
        a,
        packGarmentMaterialContactCheckpointV1(a, state),
        16,
      ),
    ).toThrow();
  });
  it('uses16 bounds for32 prefix and refuses contact count/max and velocity domain inconsistencies', () => {
    const a = requireLayout(request32),
      state = checkpointFor(a);
    state.bendDiagnostics[1] = 17 * 8 * 153;
    expect(() =>
      decodeGarmentMaterialContactCheckpointV1(
        a,
        packGarmentMaterialContactCheckpointV1(a, state),
        16,
      ),
    ).toThrow();
    expect(
      decodeGarmentMaterialContactCheckpointV1(
        a,
        packGarmentMaterialContactCheckpointV1(a, state),
        32,
      ).bendDiagnostics[1],
    ).toBe(17 * 8 * 153);
    for (const contact of [
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 0, 0, 0, floatBits(0.081), 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0xffffffff, 1, floatBits(0.01), 0],
    ]) {
      const x = checkpointFor(a);
      x.contactDiagnostics.set(contact);
      expect(() =>
        decodeGarmentMaterialContactCheckpointV1(
          a,
          packGarmentMaterialContactCheckpointV1(a, x),
          32,
        ),
      ).toThrow();
    }
    const x = checkpointFor(a);
    x.velocityDiagnostics.set([1, 0, 1, 0, 0xffffffff, 0, floatBits(99), 0]);
    expect(() =>
      decodeGarmentMaterialContactCheckpointV1(a, packGarmentMaterialContactCheckpointV1(a, x), 32),
    ).toThrow();
  });
});
